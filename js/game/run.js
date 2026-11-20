// 一局：跑酷 + 限时二选一 + 追逐 + 事件 + 资源。纯逻辑、可复现（同种子同输入 → 同结果），测试里可以直接跑机器人。
// 场景层每帧调 updateRun(run, dt)，把 run.fx 里的事件拿去放音效、粒子；输入用 input(run, action, arg)。
import { makeRng, subRng, SALT } from '../core/rng.js';
import { TUNE, CHOICE, CHASE, RES, SCORE, GRADE_REL, DASH, CROSS, ROOM, ASSIST, speedAt, zoomAt } from '../data/tune.js';
import { OBSTACLES } from '../data/obstacles.js';
import { NPCS } from '../data/npcs.js';
import { CALLERS, UNKNOWN_OUTCOMES, RIDE, STORE, ROUTE, STARVE, TITLES } from '../data/events.js';
import { makePlayer, hitbox, jump, swipeDown, stumble, stepPlayer, dash } from './player.js';
import { planCourse, courseBlocks, carve, obstacleX, installBranch, JUMP_VMIN } from './course.js';
import { toLevel, starsOf, starLine, TEACH_KEY, dueAt } from './level.js';
import { deathTip } from '../data/tips.js';
import { parOf } from './par.js';
import { story, storySpans, storyOf, makeFam, placeErrandPickup, mealFor } from './story.js';
import { MEMBERS, DEFAULT_STORY } from '../data/family.js';
import { judge, makeQuestion, isExcuse } from './choice.js';
import { modifierOf } from '../data/modifiers.js';
import { SWIPE } from '../core/swipe.js';

const HUNGRY_HINT_AT = RES.hungry;

// level：关卡 id（缺省全程关 'full'）或关卡数据。关卡写死了 seed 的，路线按关卡的种子排，题目和左右顺序仍随这一局的 seed
// xlight：调试 / 测试用，覆盖路口灯态（'red' | 'green' | 'flash' | 'worst'），路不变
// route：调试用，路线卡超时默认走哪条（'lift' | 'stairs'，缺省楼梯）；liftBtn：电梯里外卖那一拍显示关门键（全程关「没学过电梯」的软版本传 false）
// learned：存档里学会的机制（关卡里学过的不再定格教学）；assist：带薪摸鱼（只在关卡里有：读题 +0.3 秒、随机段障碍少 15%、最多两星）
// story：家庭剧本的故事键（'家庭.故事'，场景层用 resolveStory 算好传进来）。关卡写死了故事的按关卡的；不传 = 爸妈家平常日（接入前的老样子，开局卡也不写「今晚回」）
// quiet：好友卡带来的新玩家第一局，不显示家规提示和开局交代那一行（家里交代的事照样有效）
export function makeRun({ seed, level = 'full', daily = false, tutorial = false, seenTips = [], modifier, xlight = null, route = null, liftBtn = true, learned = [], assist = false, story: storyKey = null, quiet = false } = {}) {
  const lv = toLevel(level);
  const rng = makeRng(seed);
  const mod = modifier !== undefined ? modifier : daily ? modifierOf(seed) : null;   // 每日词条：只有今日挑战才有
  const routeSeed = lv.def.seed != null ? lv.def.seed : seed;
  const helped = !!assist && !!lv.def.stars, readPlus = helped ? ASSIST.readPlus : 0;
  const course = planCourse(subRng(routeSeed, SALT.course), { level: lv, tutorial, seed: routeSeed, xlight, readPlus, assist: helped ? subRng(routeSeed, SALT.assist) : null });
  const lvKey = lv.def.story && lv.def.story.key, st = storyOf(lvKey || storyKey) || storyOf(DEFAULT_STORY);
  const run = {
    seed, level: lv.id, lv, daily, tutorial, rng, course, mod,
    story: st, fam: makeFam(st), quiet: !!quiet, famLine: lv.id === 'full' && !lvKey && storyKey != null,   // 家庭剧本：故事、这一局的钩子状态；全程局开局卡写「今晚回：××」
    par: parOf(course, lv),         // 本路线标准时间：{ worldT, raw, min }
    start: lv.clockStart, clockK: lv.clockK,   // 出发时刻（分钟）、罚时缩放（全程关 1）
    t: 0, wt: 0, intro: 1.1, introTotal: 1.1, introLine: null,
    assist: helped, readPlus, learned: [...(learned || [])], teachSet: new Set(lv.def.teach || []), taught: new Set(),   // 带薪摸鱼；学会的机制；本关的定格教学 / 这局已经教过的
    x: lv.x0, v: 0, vBase: TUNE.speed.base, zoom: 1, ts: 1,
    player: makePlayer(),
    stage: lv.stageAt(lv.x0),
    slotIdx: 0, obIdx: 0, pkIdx: 0,
    choice: null, pending: null, chaser: null, ride: null, shop: null, cutscene: null, teach: null,
    crossIdx: 0, cross: null,       // 斑马线路口：下一个路口的下标、当前路口的状态（far → show → pass / brake → wait → go）
    route: null, room: null,        // 电梯 / 楼梯：路线卡选了哪条（'lift' | 'stairs'）；电梯轿厢（世界停住的房间）
    routeDefault: route === 'lift' ? 'lift' : 'stairs', liftBtn: liftBtn !== false,
    liftRng: subRng(seed, SALT.liftQ),   // 电梯里同事的题、超时运气、记仇时刻：不动 run.rng。两条路出了大门以后路线一样，题目可能不同（电梯里的题会占掉题库、记下见过谁）
    mods: [], slowK: 1,             // 减速效果，以及它此刻实际生效的倍率（回升限速）
    clock: 0, sat: RES.sat0, money: RES.money0 + ((mod && mod.money) || 0), boxes: RES.boxes, restored: false,
    score: 0, combo: 0,
    stats: { choices: 0, good: 0, bad: 0, mid: 0, quick: 0, timeouts: 0, nearMiss: 0, hits: 0, coins: 0, chased: 0, escaped: 0, caught: 0, caughtBy: [], tags: {}, rides: 0, shops: 0, minSat: RES.sat0, reconciled: 0, wet: false, maxCombo: 0, ate: [],
             dashes: 0, dashChased: 0, dashHit: 0, splashed: false,          // 冲刺次数 / 其中被追时的次数 / 冲刺后 1 秒内撞上（埋点）；被车溅过
             hitsChased: 0, lastBad: null,                                   // 被追时撞了几次、最后一次答错的原因（死因提示用）
             swipe: { run: 0, runH: 0, pre: 0, answer: 0, misfire: 0 },     // 滑动埋点：纯统计（见 core/swipe.js）
             crossings: 0, crossWaits: 0, crossDash: 0, crossEscape: 0, crossLog: [],   // 路口：过了几个 / 等了几次 / 冲过闪绿几次 / 其中甩掉追兵几次 / 每个路口的灯和结果（埋点）
             stopT: 0, stopMax: { cross: 0, shop: 0, room: 0 },               // 世界停住（便利店、电梯、等灯）的合计和单次最长：每局 ≤15 秒
             famBuys: 0,                                                       // 给家里买的东西（不计入 shops：门口「偷吃了吧」只看给自己买的）
             route: null, doorShut: 0, liftClose: 0, liftQ: 0, liftT: 0, exitMin: null },   // 电梯：走了哪条路 / 门夹住追兵 / 关门不让外卖进 / 电梯里答题 / 在轿厢里待了多久 / 出大门的时刻
    best: null,                     // 今日最离谱借口
    said: [],                       // 这局说过的话（借口图鉴）
    used: {}, grudges: [], revisits: 0, npcSeen: {}, qUsed: new Set(), lastNpc: null, flags: {}, callers: [],
    tips: new Set(seenTips), tipQueue: [], tipShown: 0, hint: null, holeO: null, lastHSwipe: -9, lastDash: -9,
    fx: [],
    done: null, ending: null,
  };
  carve(course, storySpans(run, lv, courseBlocks(lv, { readPlus })));   // 家庭剧本的拾取物空地：整条路照常生成，再把拾取点前后的障碍剔掉（区间外和平常日逐个相同）
  placeErrandPickup(course, st, run.fam.pickX);
  run.tipFn = (key, text) => tip(run, key, text);                     // 剧本里的一次性提示走同一个队列
  // 开局卡：全程局 1.1 秒，关卡局 1.6 秒（多一行关名）；全程局写「今晚回：××」再 +0.3 秒，有开局交代再 +0.3 秒；读秒按比例走
  run.introLine = story.introLine(run);
  run.intro = run.introTotal = (lv.id === 'full' ? 1.1 : 1.6) + (run.famLine ? 0.3 : 0) + (run.introLine ? 0.3 : 0);
  return run;
}

const fx = (run, type, data = {}) => run.fx.push({ type, ...data });
const mult = run => Math.min(SCORE.comboMax, 1 + run.combo * SCORE.comboStep);
function addScore(run, n) { run.score += Math.round(n * mult(run)); }
function showHint(run, text, t = 2.2) { run.hint = { text, t, total: t }; }
// 定格教学：新手局教跳、滑、选（全程关第一局）；关卡按 lv.def.teach 教，存档里学会了的不再定格
function canTeach(run, k) {
  if (run.tutorial) return k === 'jump' || k === 'slide' || k === 'choose';
  return run.teachSet.has(k) && !run.learned.includes(TEACH_KEY[k] || k);
}
// 一局只教一次的定格（冲刺、关门、闪绿冲过去）：世界停住等你做对，不计入世界停住的预算。
// 同一件事的一次性提示算看过；正在显示、刚出来不到 1 秒的别的提示放回队头，教完再出
const TEACH_TIP = { dash: 'dash', crossdash: 'cross' };
function startTeach(run, kind, text) {
  run.taught.add(kind);
  const same = TEACH_TIP[kind], h = run.hint;
  if (same) { run.tips.add(same); run.tipQueue = run.tipQueue.filter(q => q.key !== same); }
  if (h && h.key && h.key !== same && h.total - h.t < 1) { run.tips.delete(h.key); run.tipShown--; run.tipQueue.unshift({ key: h.key, text: h.text }); }
  run.teach = { kind };
  showHint(run, text, 999);
  fx(run, 'teach', { kind });
}
// 罚时：数值表里写的是全程关的游戏分钟，短关时钟走得快，按同一比例放大（换算成真实秒数不变）
function addMin(run, min) { run.clock += min * 60 * run.clockK; }
// 一次性规则提示：正在显示别的提示时先排队，轮到它显示时才记为「看过」。
// 每局最多 TIP_MAX 条新提示（交叉检查 M9）：排队里同时有几条时按 TIP_PRI 的先后出；没轮到的这局不显示、存档也不记，下一局再出
export const TIP_MAX = 4;
export const TIP_PRI = ['chase', 'dash', 'cross', 'crossRed', 'cardoor', 'errand', 'errandStore', 'errandJump', 'promise', 'fam:', 'tired', 'grudge', 'hungry'];
const tipRank = key => { const i = TIP_PRI.findIndex(k => (k.endsWith(':') ? key.startsWith(k) : key === k)); return i < 0 ? TIP_PRI.length : i; };
// 马上就有定格教学讲同一件事（周二第一次被追、周三第一个闪绿路口）：提示条不先弹一次，留给定格（定格会把它记成看过）
const TIP_TEACH = { dash: 'dash', cross: 'crossdash' };
function tip(run, key, text) {
  if (run.tips.has(key) || run.tipQueue.some(q => q.key === key)) return;
  if (run.tipShown >= TIP_MAX) return;
  const tk = TIP_TEACH[key];
  if (tk && !run.taught.has(tk) && canTeach(run, tk)) return;
  run.tipQueue.push({ key, text });
  pumpTips(run);
}
const isCrossTip = key => key.startsWith('cross');
const inCrossing = run => !!(run.cross && run.cross.phase !== 'far');
// 这条提示现在能不能出：路口窗口里只出和这盏灯对得上的路口提示（闪绿 → cross，红灯 → crossRed），
// 闪绿路口里被追、还没到刹车时也可以出「右滑冲刺」；路口外不出路口提示
function tipFits(run, key) {
  if (!inCrossing(run)) return !isCrossTip(key);
  const s = run.cross;
  if (key === 'cross') {                       // 「右滑冲过去」等踩进 ▶▶ 区才出（之前右滑只会白划），还能冲时才出
    const z = dashZoneAt(run);
    return s.light === 'flash' && !!(z && z.kind === 'cross' && z.i === s.i && !z.dashed) && (s.phase === 'show' || crossDashOpen(run));
  }
  if (key === 'crossRed') return s.light === 'red';
  if (key === 'dash') return s.light === 'flash' && !!run.chaser && s.phase === 'show';
  return false;
}
// 路口外的路口提示：不显示、不记「看过」，直接丢掉，留给下一个路口或下一局
function dropCrossTips(run) {
  if (run.tipQueue.some(q => isCrossTip(q.key))) run.tipQueue = run.tipQueue.filter(q => !isCrossTip(q.key));
}
function pumpTips(run) {
  if (!inCrossing(run)) dropCrossTips(run);
  if (run.teach || !run.tipQueue.length) return;
  if (run.choice && run.choice.phase === 'result' && !run.shop) return;     // 别和「+100」飘字抢位置（进店那张卡没有飘字：便利店面板一出来就能出「货架上有家里要的」）
  // 整个队列里找，不只看队头（队头的别的提示不会把路口提示卡住）；路口里路口提示优先
  if (run.tipShown >= TIP_MAX) return;
  const best = ok => { let b = -1; run.tipQueue.forEach((q, j) => { if (ok(q) && tipFits(run, q.key) && (b < 0 || tipRank(q.key) < tipRank(run.tipQueue[b].key))) b = j; }); return b; };
  let i = inCrossing(run) ? best(q => isCrossTip(q.key)) : -1;
  if (i < 0) i = best(() => true);           // 同时排着几条：按优先级（被追 > 冲刺 > 路口 > 违停车 > … > 饿了）
  if (i < 0) return;
  const q = run.tipQueue[i], h = run.hint;
  if (h) {
    // 灯牌只有 2 秒：路口提示顶掉正在显示的别的规则提示；那条刚出来不到 1 秒就放回队头，过完路口再出
    if (!isCrossTip(q.key) || !h.key || isCrossTip(h.key)) return;
    run.tipQueue.splice(i, 1);
    if (h.total - h.t < 1) { run.tips.delete(h.key); run.tipShown--; run.tipQueue.unshift({ key: h.key, text: h.text }); }
  } else run.tipQueue.splice(i, 1);
  run.tips.add(q.key); run.tipShown++;
  showHint(run, q.text, 2.6);
  run.hint.key = q.key;
  fx(run, 'tip', { key: q.key });
}

// ── 输入 ────────────────────────────────────────────────
export function input(run, action, arg) {
  if (run.done || run.intro > 0 || run.ending) return;
  const p = run.player;
  if (run.teach) {
    const k = run.teach.kind;
    if ((k === 'jump' && action === 'jump') || (k === 'slide' && action === 'slide')) {
      run.teach = null; run.hint = null;
      action === 'jump' ? jump(p) : swipeDown(p);
    } else if ((k === 'dash' || k === 'crossdash') && (action === 'dash' || action === 'right' || action === k)) {
      run.teach = null; run.hint = null;
      tryDash(run);
    } else if (k === 'lift' && (action === 'close' || action === 'jump' || action === 'lift')) {   // 电梯：点关门键（轻点 / 上滑都算）
      run.teach = null; run.hint = null;
      roomClose(run);
    }
    return;
  }
  if (run.shop) {
    if (action === 'card') buy(run, arg);
    else if (action === 'left') buy(run, 0);
    else if (action === 'jump') buy(run, 1);          // 上滑
    else if (action === 'right') buy(run, 2);
    else if (action === 'slide' || action === 'leave') closeShop(run, false);
    return;
  }
  if (run.room) {
    // 轿厢里只有两种操作：左右选（同事的题）、点按钮（关门键：轻点 / 按住 / 上滑都算）。跳、滑铲、冲刺都没有
    const rc = run.choice;
    if (rc && rc.phase === 'open' && rc.room) {
      if (action === 'left') return pick(run, 0);
      if (action === 'right') return pick(run, 1);
      if (action === 'card') return pick(run, arg);
    }
    if (action === 'jump' || action === 'close') roomClose(run);
    return;
  }
  const c = run.choice;
  if (c && c.phase === 'open') {
    if (action === 'left') return pick(run, 0);
    if (action === 'right') return pick(run, 1);
    if (action === 'card') return pick(run, arg);
  }
  if (run.cutscene || run.ride) return;
  if (action === 'jump') jump(p);
  else if (action === 'slide') swipeDown(p);
  else if (action === 'right' || action === 'dash') tryDash(run);   // 'dash' 是机器人用的（不会在卡片打开那一帧误选）
  // 'left' 在跑酷里永远不做事（不做左滑急停）
}

// ── 冲刺 ────────────────────────────────────────────────
// ▶▶ 区（路口闪绿灯、选了电梯后的电梯门前）：主角脚下那一段
export function dashZoneAt(run) {
  const zs = run.course.zones;
  if (!zs) return null;
  for (const z of zs) if (!z.off && run.x >= z.x0 && run.x <= z.x1) return z;
  return null;
}
// 闪绿没冲、已经开始刹车，但人还在这个路口的 ▶▶ 区里：右滑照样能过，所以灯牌 / 杆顶灯 / 提示音照样是闪绿，
// 地上 ▶▶ 和提示条也还在；出了 ▶▶ 区才一起变红、冲不了。canDash 和 crossLamp 都用这一个判断
export function crossDashOpen(run) {
  const s = run.cross, z = s && s.phase === 'brake' && s.missed ? dashZoneAt(run) : null;
  return !!(z && z.kind === 'cross' && z.i === s.i && !z.dashed);
}
// 能不能冲：鞋底的提示环和右滑共用这一个判断（环亮着，右滑就一定有效）。冷却另算（环变灰）
export function canDash(run) {
  const c = run.choice, p = run.player;
  if (run.room || run.shop || run.cutscene || run.ride || run.intro > 0 || run.ending || p.state === 'stumble') return false;
  if (c && (c.phase === 'open' || c.rt < CHOICE.dashGuard)) return false;                          // 读题、刚选完：右滑归答题
  if (run.pending && run.pending.slot.x - run.x < CHOICE.dashPendGuard * Math.max(run.v, 1)) return false;   // 快弹题
  const cs = run.cross;
  if (cs && (cs.phase === 'wait' || cs.phase === 'go' || (cs.phase === 'brake' && !crossDashOpen(run)))) return false;   // 停在路口：冲不了（闪绿刹车时还在 ▶▶ 区里可以冲，灯牌这时也还闪绿）
  return !!(run.chaser || dashZoneAt(run));
}
// 现在右滑会不会真的冲出去：canDash 再加上冷却（刚进一个没冲过的 ▶▶ 区会清掉冷却，所以冷却中也算能冲）。
// 鞋底的环、tryDash、机器人都用这一个判断：环是青色，右滑就一定冲得出去
export function dashReady(run) {
  if (!canDash(run)) return false;
  const z = dashZoneAt(run);
  return run.player.dashCd <= 0 || !!(z && !z.entered);
}
function tryDash(run) {
  const zone = dashZoneAt(run);
  if (!run.chaser && !zone) { fx(run, 'dashNo'); return false; }            // 不被追、不在区里：脚下灰环闪一下，不冲
  if (!canDash(run)) { fx(run, 'dashNo', { held: crossHold(run) }); return false; }   // 被追但冲不了（停在红灯前、踉跄中……）：灰环照样闪一下；红灯前另外飘一句
  if (!dashReady(run)) { fx(run, 'dashCd'); return false; }
  if (!dash(run.player, !!(zone && !zone.entered))) { fx(run, 'dashCd'); return false; }
  if (zone) zone.entered = zone.dashed = true;
  if (run.lastHSwipe === run.t) run.lastHSwipe = -9;          // 这一下横划冲成了：不算「横划完马上撞上」的误划
  if (zone && zone.kind === 'cross' && run.cross && run.cross.phase === 'brake') crossDashed(run);   // 闪绿已经开始刹车了，还在 ▶▶ 区里冲：照样过
  run.stats.dashes++; run.lastDash = run.t;
  if (run.chaser) run.stats.dashChased++;
  fx(run, 'dash');
  return true;
}
// 冲刺的速度倍率：前方 1.05 秒路程内有没过的障碍就不加速（任何两次操作的间隔都不低于原间距表）；读题时也不加速
function dashK(run, vb) {
  if (run.choice && run.choice.phase === 'open') return 1;
  const obs = run.course.obstacles;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i];
    if (o.done || obstacleX(o, run.x) + OBSTACLES[o.type].w < run.x) continue;
    return o.x - run.x < DASH.clear * vb ? 1 : DASH.k;     // 按相遇点量：迎面移动的障碍也是「还有几秒到」
  }
  return DASH.k;
}

// ── 斑马线路口（按主角位置触发）────────────────────────────
// 灯态开局定好（course.crossings），定义为「主角到停止线那一刻」的灯。离停止线 2.0 秒路程时灯牌出现、灯态生效；
// 0.35 秒路程时决定过还是停：绿灯 / 闪绿在 ▶▶ 区冲过 → 直接过；红灯 / 闪绿没冲 → 匀减速停在停止线后，等完自动起跑。
// 只有主角已经停下的等待段按时间走。没做任何操作只丢时间：不撞、不断连击、不扣饱腹、不碎饭盒
const HOLD = { brake: 1, wait: 1, go: 1 };
export const crossHold = run => !!(run.cross && HOLD[run.cross.phase]);   // 刹车 / 等灯 / 刚起步：追兵也冻住
export const crossStopX = c => c.x - CROSS.stopBack;                      // 主角停下的位置：脚尖在白色停止线后面
// 某个路口此刻的灯（灯牌、杆顶灯、提示音都用它；和右滑的实际结果一致）：lit 'red' | 'green' | 'flash'，num 读秒（数字 / '!' / null）。不在这个路口的窗口里 = null
export function crossLamp(run, c) {
  const s = run.cross;
  if (!s || s.i !== c.i || s.phase === 'far') return null;
  const vb = Math.max(1, speedAt(run.x)), D = CROSS.brake * vb, d = Math.max(0, crossStopX(c) - run.x);
  // 长绿灯：读秒 = 走到斑马线那头还要几秒 + 3（一定比走过去长）；走在斑马线上也接着往下数，不会停在 4
  const greenNum = () => Math.ceil(Math.max(0, c.x + CROSS.zebra - run.x) / vb + 3);
  switch (s.phase) {
    case 'show':
      if (s.light === 'red') return { lit: 'red', num: Math.ceil(c.wait + (d + D) / vb) };   // 到线还要走的时间 + 到线以后还要等的
      if (s.light === 'flash') return { lit: 'flash', num: '!' };
      return { lit: 'green', num: greenNum() };
    case 'brake':
      if (crossDashOpen(run)) return { lit: 'flash', num: '!' };   // 闪绿没冲、在刹车，但还在 ▶▶ 区里：右滑照样能过，灯就还闪绿；出了 ▶▶ 区才变红
      return { lit: 'red', num: Math.ceil((s.missed ? CROSS.waitMiss : c.wait) + 2 * Math.sqrt(d * D) / vb) };
    case 'wait': return { lit: 'red', num: Math.max(1, Math.ceil(s.wait - s.t - 1e-6)) };
    case 'go': return { lit: 'green', num: greenNum() };   // 等完红灯起步：绿灯读秒照样显示
    default:   // pass：冲过闪绿的，踏上斑马线那一刻身后变红（追兵被拦下）
      if (s.how === 'dash') return run.x < c.x ? { lit: 'flash', num: '!' } : { lit: 'red', num: null };
      return { lit: 'green', num: greenNum() };
  }
}
const crossZone = (run, i) => (run.course.zones || []).find(z => z.kind === 'cross' && z.i === i) || null;
function crossK(run, wdt) {
  const c = run.course.crossings && run.course.crossings[run.crossIdx];
  if (!c) return 1;
  const s = run.cross || (run.cross = { i: c.i, phase: 'far', t: 0, light: c.light, how: null });
  const v = speedAt(c.x), d = crossStopX(c) - run.x;
  switch (s.phase) {
    case 'far': {
      if (d > CROSS.show * v) return 1;
      if (d < 0) { run.cross = null; run.crossIdx++; return 1; }   // 已经在停止线后面了（只有测试 / 调试会把人直接放过去）：这个路口不算
      // 已经等满 2 次：后面的路口在灯牌出现这一刻改成绿灯（对玩家有利；路不变）
      s.light = run.stats.crossWaits >= CROSS.maxWaits ? 'green' : c.light;
      const z = crossZone(run, c.i);
      if (z && s.light !== 'flash') z.off = true;
      s.phase = 'show'; s.t = 0; s.t0 = run.t;               // t0：灯牌出现的时刻（画面弹出动画用）
      if (s.light === 'flash') tip(run, 'cross', '闪绿灯：右滑冲过去！');
      else if (s.light === 'red') tip(run, 'crossRed', '红灯自动停，等一下就好');
      fx(run, 'crossShow', { light: s.light, i: c.i });
      return 1;
    }
    case 'show': {
      s.t += wdt;
      if (d > CROSS.brake * v) return 1;
      const z = crossZone(run, c.i);
      if (s.light === 'green') { s.phase = 'pass'; s.how = 'green'; return 1; }
      if (s.light === 'flash' && z && z.dashed) { crossDashed(run); return 1; }
      s.phase = 'brake'; s.t = 0;
      if (s.light === 'flash') s.missed = true;               // 闪绿没冲：灯在你到线时变红，等一轮
      run.player.dashT = 0;
      fx(run, 'crossBrake', { light: s.light });
    }
    // falls through：刹车这一帧就开始减速
    case 'brake':
      s.t += wdt;
      return Math.max(0.1, Math.sqrt(Math.max(0, d) / (CROSS.brake * v)));   // 匀减速：v² ∝ 剩下的距离
    case 'wait': {
      const used = Math.min(wdt, s.wait - s.t);              // 等满那一帧只算到 wait 为止（每次等灯 ≤ 1.5 秒，不多算半帧）
      s.t += wdt;
      run.stats.stopT += used;
      run.stats.stopMax.cross = Math.max(run.stats.stopMax.cross, Math.min(s.t, s.wait));
      if (s.t >= s.wait) { s.phase = 'go'; s.t -= s.wait; fx(run, 'crossGo', { i: c.i }); }
      return 0;
    }
    case 'go':
      s.t += wdt;
      return Math.min(1, s.t / CROSS.ramp);
    default:                                                   // pass
      return 1;
  }
}
// 移动之后：刹到线就停住开始等；走过斑马线就算过完这个路口
function crossAfterMove(run) {
  const s = run.cross;
  if (!s || s.phase === 'far') return;
  const c = run.course.crossings[run.crossIdx];
  if (s.phase === 'brake' && run.x >= crossStopX(c) - 1) {
    run.x = crossStopX(c);
    s.phase = 'wait'; s.t = 0; s.wait = s.missed ? CROSS.waitMiss : c.wait;
    run.stats.crossWaits++;
    fx(run, 'crossStop', { i: c.i, wait: s.wait });
  }
  if (s.phase === 'pass' && s.how === 'dash' && !s.escaped && run.x >= c.x) {
    s.escaped = true;                                          // 踏上斑马线那一刻灯变红：追兵被拦在后面
    if (run.chaser) { const npc = run.chaser.npc; run.chaser = null; run.stats.escaped++; run.stats.crossEscape++; fx(run, 'escape', { npc, cross: true }); }
  }
  if ((s.phase === 'pass' || s.phase === 'go') && run.x > c.x + CROSS.zebra) {
    run.stats.crossings++;
    run.stats.crossLog.push({ light: s.light, result: s.how || (s.missed ? 'miss' : 'wait') });
    run.cross = null; run.crossIdx++;
    fx(run, 'crossDone', { i: c.i });
    return;
  }
  // 灯变红、右滑也冲不了了（闪绿没冲出了 ▶▶ 区 / 停下等灯 / 冲过去踏上斑马线）：叫你右滑冲的提示条跟着收掉，和灯牌对得上
  const h = run.hint;
  if (h && (h.key === 'cross' || h.key === 'dash') && crossLamp(run, c).lit === 'red' && !canDash(run)) run.hint = null;
}
// 闪绿时在 ▶▶ 区里冲了：直接过街（+100），被追的话踏上斑马线时甩掉追兵
function crossDashed(run) {
  const s = run.cross;
  s.phase = 'pass'; s.how = 'dash';
  run.stats.crossDash++; run.flags.crossDash = true;
  addScore(run, CROSS.dashScore);
  fx(run, 'crossDash', { i: s.i });
}

// ── 主循环 ──────────────────────────────────────────────
export function updateRun(run, dt) {
  if (run.done) return;
  run.t += dt;
  if (run.hint) { run.hint.t -= dt; if (run.hint.t <= 0) run.hint = null; }
  pumpTips(run);                    // 有提示在显示时也要跑：路口提示能顶掉别的提示，路口外的路口提示要清掉
  if (run.intro > 0) {
    run.intro -= dt;
    if (run.intro <= 0) {
      fx(run, 'go');
      if (run.mod) showHint(run, `${run.mod.name}：${run.mod.desc}`, 3);
      if (run.famLine && !run.quiet) tip(run, `fam:${run.story.fam.id}`, `家规：${run.story.fam.hint}`);   // 第一次回这个家：家规（存档里记在 tips）
    }
    return;
  }
  if (run.ending) { run.ending.t += dt; if (run.ending.t >= run.ending.total) run.done = run.ending.result; return; }

  // 世界时间流速：读题放慢、进店 / 教学暂停
  let target = 1;
  const c = run.choice;
  if (c && c.phase === 'open') target = c.hold ? 0 : c.slow;      // 新手第一题：世界停住等你选
  if (run.shop || run.teach || run.room) target = 0;
  run.ts += (target - run.ts) * Math.min(1, dt / 0.06);
  if (target === 0 && run.ts < 0.02) run.ts = 0;
  // 世界停住（便利店）按真实时间累计；教学定格、新手第一题是玩家自己控制的，不算。等灯在 crossK 里累计（世界没停、只是主角停）；
  // 电梯在 updateRoom 里自己累计（这里排除 run.room，不重复算）
  if (!run.room && run.ts < 0.05 && !run.teach && !(c && c.hold)) {
    run.stats.stopT += dt;
    if (run.shop) { run.shop.stopT = (run.shop.stopT || 0) + dt; run.stats.stopMax.shop = Math.max(run.stats.stopMax.shop, run.shop.stopT); }
  }

  if (c) updateChoice(run, dt);
  if (run.shop) updateShop(run, dt);
  if (run.room) updateRoom(run, dt);
  if (run.cutscene) {
    run.cutscene.t -= dt;
    if (run.cutscene.t <= 0) endCutscene(run);
  }
  const wdt = dt * run.ts;
  if (wdt > 0) stepWorld(run, wdt);
}

function stepWorld(run, wdt) {
  const p = run.player, obs = run.course.obstacles;
  run.wt += wdt;
  const vb = speedAt(run.x);
  run.vBase = vb;

  // 速度修正
  let k = 1;
  run.mods = run.mods.filter(m => (m.t -= wdt) > 0);
  // 减速（被缠住 ×0.6、踩水 ×0.85、被追的拖慢期 ×0.8）：立刻生效，结束时限速回升（0.6 → 1 用 0.5 秒），
  // 速度不会一下跳回去：按慢速起跳的那一下照样跳得过（完美操作 0 碰撞）
  let slow = 1;
  for (const m of run.mods) slow *= m.k;
  if (run.chaser && run.chaser.phase === 'slow') slow *= CHASE.slowK;
  if (slow < 1) slow = Math.max(slow, Math.min(1, slowFloor(run, vb) / (vb * (run.stage.slowK || 1))));   // 前面 2 秒内有遛狗绳这类宽障碍：减速不压到跳不过的速度以下（楼梯间的跑速系数也算上）
  run.slowK = slow <= run.slowK ? slow : Math.min(slow, run.slowK + wdt * (1 - 0.6) / TUNE.modRamp);
  k *= run.slowK;
  if (p.state === 'stumble') k *= TUNE.stumbleSpeed + (1 - TUNE.stumbleSpeed) * (1 - p.stumbleT / TUNE.stumbleTime);
  if (run.ride) k *= RIDE.speedK;
  if (run.stage.slowK) k *= run.stage.slowK;            // 路段跑速系数（楼梯间之类；标准时间里按同一系数算）
  if (p.dashT > 0) k *= dashK(run, vb);
  k *= crossK(run, wdt);                                // 路口：刹车 / 等灯 / 起步
  if (run.cutscene) k = 0;
  k *= Math.min(1, run.wt / 0.5);                       // 起步加速
  run.v = vb * k;
  const zt = zoomAt(vb) * (run.ride ? 0.94 : 1);
  run.zoom += (zt - run.zoom) * Math.min(1, wdt * 3);
  run.x += run.v * wdt;
  crossAfterMove(run);
  // 第一个闪绿路口（周三教学）：一进 ▶▶ 区就定格，等你右滑冲过去
  const xz = run.cross && run.cross.phase === 'show' && run.cross.light === 'flash' && !run.teach ? dashZoneAt(run) : null;
  if (xz && xz.kind === 'cross' && xz.i === run.cross.i && !xz.dashed && !run.taught.has('crossdash') && canTeach(run, 'crossdash') && canDash(run)) startTeach(run, 'crossdash', '闪绿灯：右滑冲过去！');

  // 脚下 / 头顶
  let supportTop = 0, overHole = false, ceiling = false, hole = null;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i], t = OBSTACLES[o.type], ox = obstacleX(o, run.x);
    if (ox > run.x + 60) break;
    if (o.done && !t.platform) continue;
    if (t.hole && run.x > ox + 10 && run.x < ox + t.w - 10) { overHole = true; hole = o; }
    if (t.platform && run.x + 11 > ox && run.x - 11 < ox + t.w && p.y <= -t.ground + 6) supportTop = Math.min(supportTop, -t.ground);
    if (t.overhead && run.x + 22 > ox && run.x - 22 < ox + t.w) ceiling = true;
  }
  if (run.ride || run.cutscene) { overHole = false; }

  if (run.ride || run.cutscene) { p.dashT = Math.max(0, p.dashT - wdt); p.dashCd = Math.max(0, p.dashCd - wdt); }
  if (run.ride || (run.cutscene && run.cutscene.kind !== 'hole')) {
    p.events.length = 0; p.runPhase = (p.runPhase + wdt * run.v / 120) % 1;
    if (run.ride) { p.y = 0; p.vy = 0; p.onGround = true; p.state = 'run'; }
  } else if (!run.cutscene) {
    const yBefore = p.y;          // 落地前的脚高：高速越过井口时这一帧就落回地面了，要用落地前的值判断
    stepPlayer(p, wdt, run.v, { supportTop, overHole, ceiling });
    for (const e of p.events) fx(run, e);
    // 脚掉到地面以下 = 掉进去了（井口窄，速度快时会直接撞上对面井沿，同样算掉进去）
    if (overHole) run.holeO = hole;
    const ho = run.holeO;
    if (ho) {
      const far = obstacleX(ho, run.x) + OBSTACLES[ho.type].w - 10;
      if (p.y > 8 || (Math.max(p.y, yBefore) > 0.5 && run.x >= far)) fallInHole(run, ho);
      else if (!overHole && run.x > far + 10) run.holeO = null;
    }
  } else {
    p.y += 160 * wdt;                                    // 掉井里：往下沉
  }

  // 碰撞、越过
  const hb = hitbox(p), s = TUNE.shrink;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i], t = OBSTACLES[o.type], ox = obstacleX(o, run.x);
    if (ox > run.x + 60) break;
    if (o.done) continue;
    if (!t.hole) {
      const box = t.overhead ? { x0: ox, x1: ox + t.w, y0: -t.overhead[1], y1: -t.overhead[0] } : { x0: ox, x1: ox + t.w, y0: -t.ground, y1: 0 };
      const px0 = run.x + hb.x0, px1 = run.x + hb.x1;
      const xo = px1 > box.x0 + s && px0 < box.x1 - s;
      if (xo) {
        const onTop = t.platform && p.y <= box.y0 + 6;
        const clear = t.overhead ? box.y1 - hb.y0 : box.y0 - hb.y1;   // 竖直方向还差多少碰上（负数 = 重叠）
        if (!onTop) o.minClear = Math.min(o.minClear ?? Infinity, t.overhead ? hb.y0 - box.y1 : box.y0 - hb.y1);
        const overlap = !onTop && (t.overhead ? hb.y0 < box.y1 - s : hb.y1 > box.y0 + s);
        if (overlap && !run.ride && !run.cutscene && !o.hit) {
          if (t.light) { o.hit = true; if (p.invulnT <= 0) splash(run, o); }   // 无敌时（下车、撞完）踩过去不算
          else if (p.invulnT <= 0) hit(run, o);
          else if (t.platform) { o.hit = true; p.y = -t.ground; p.vy = 0; p.onGround = true; }   // 无敌时撞上台阶：直接踩上去
          else o.hit = true;                              // 无敌时穿过：不算躲过，也不扣
        }
        void clear;
      }
    }
    if (ox + t.w < run.x - 12) { o.done = true; if (!o.hit) passed(run, o); }
  }
  while (run.obIdx < obs.length && obs[run.obIdx].done && obstacleX(obs[run.obIdx], run.x) + OBSTACLES[obs[run.obIdx].type].w < run.x - 40) run.obIdx++;
  // 第一次看到违停车：提示一次（车门在画面里时已经开着或正在开）
  for (let i = run.obIdx; i < obs.length && obs[i].x < run.x + 1.3 * vb; i++) if (obs[i].type === 'cardoor' && !obs[i].done) { tip(run, 'cardoor', '违停车要开门：跳！'); break; }

  // 拾取（蹭车时人在马路上，不吃人行道上的零钱）
  const pks = run.course.pickups;
  while (run.pkIdx < pks.length && pks[run.pkIdx].x < run.x - 40) run.pkIdx++;
  for (let i = run.pkIdx; i < pks.length && pks[i].x < run.x + 30 && !run.ride; i++) {
    const pk = pks[i];
    if (pk.taken) continue;
    const near = Math.abs(pk.x - run.x) < 20 && pk.y > p.y - (hb.y1 - hb.y0) - 12 && pk.y < p.y + 10;
    if (!near) continue;
    if (pk.kind === 'errand') { if (story.onPickup(run, pk)) { pk.taken = true; fx(run, 'grab', { x: pk.x, y: pk.y }); } continue; }   // 家里要的东西（剧本接入点）
    pk.taken = true;
    if (pk.kind === 'coin') { run.money += (run.mod && run.mod.coinK) || 1; run.stats.coins++; addScore(run, SCORE.coin); fx(run, 'coin', { x: pk.x, y: pk.y }); }
    else { run.sat = Math.min(100, run.sat + RES.bun); run.stats.ate.push('包子'); fx(run, 'bun', { x: pk.x, y: pk.y }); }
  }

  story.step(run);                      // 家里交代的事：快到能办的地方时提醒（按位置）

  // 追逐
  const ch = run.chaser;
  if (ch && !crossHold(run)) {                          // 追兵也守红灯：主角刹车、等灯、起步时，距离和计时都冻住
    const held = ch.hold === 'door' && holdDoor(run);   // 追逐槽 hold: 'door'：跑到电梯门前都甩不掉（甩开期不计时、距离封顶）
    if (!held || ch.phase === 'slow') ch.t += wdt;
    if (run.ride) ch.gap += CHASE.ride * wdt;
    if (p.dashT > 0) ch.gap += CHASE.dash / DASH.time * wdt;   // 冲刺：拖慢期、甩开期都能甩开一截
    if (ch.phase === 'slow') { ch.gap -= CHASE.approach * wdt; if (ch.t >= CHASE.slowT) { ch.phase = 'shake'; ch.t = 0; } }
    else {
      ch.gap += CHASE.recover * wdt;
      if (held) ch.gap = Math.min(ch.gap, CHASE.escape - 1);
      else if (ch.t >= CHASE.shakeT || ch.gap >= CHASE.escape) { run.chaser = null; run.stats.escaped++; fx(run, 'escape', { npc: ch.npc }); }
    }
    if (run.chaser && ch.gap < 0 && !run.cutscene) caught(run, ch.npc);
  }
  // 第一次被追（周二教学）：追兵冲出来 0.5 秒后定格，等你右滑冲刺
  const ch2 = run.chaser;
  if (ch2 && ch2.phase === 'slow' && ch2.t >= 0.5 && !run.teach && !run.taught.has('dash') && canTeach(run, 'dash') && canDash(run)) startTeach(run, 'dash', '被追了：右滑冲刺！');

  // 蹭车
  if (run.ride) {
    run.ride.t -= wdt;
    if (run.ride.t <= 0) endRide(run);
  }

  // 资源
  run.clock += wdt * run.lv.clockRate;
  run.sat -= RES.satDrain * wdt * (run.ride ? RES.rideDrain : 1) * ((run.mod && run.mod.satK) || 1);
  run.stats.minSat = Math.min(run.stats.minSat, run.sat);
  if (run.sat < HUNGRY_HINT_AT) tip(run, 'hungry', '饿坏了：说真话一律放行');
  if (run.sat <= 0) { run.sat = 0; return finish(run, false, 'starve'); }

  // 路段
  const st = run.lv.stageAt(run.x);
  if (st !== run.stage) { run.stage = st; fx(run, 'stage', { name: st.name, id: st.id }); }

  // 新手教学（全程关第一局 / 关卡的 teach）：障碍到了最佳操作点就定格，等玩家做对；学过的不再定格
  if (run.tutorial || run.teachSet.size) {
    for (let i = run.obIdx; i < obs.length && obs[i].x < run.x + 400; i++) {
      const o = obs[i];
      if (!o.teach || o.taught) continue;
      if (!canTeach(run, o.teach)) { o.taught = true; continue; }
      const d = o.x - run.x;
      if (d < 0) { o.taught = true; continue; }
      const at = o.teach === 'jump' ? run.v * 0.26 + 8 : run.v * 0.12 + 20;
      if (d <= at && !run.choice && p.onGround && p.state === 'run') {
        if (o.teach === 'jump' && d < at * 0.5) o.x = run.x + at;   // 刚落地就贴着箱子了：把教学箱子挪到能跳过去的距离
        o.taught = true;
        run.teach = { kind: o.teach };
        showHint(run, o.teach === 'jump' ? '上滑 / 点一下：跳' : '下滑：滑铲', 999);
      }
    }
  }

  // 选择槽：提前约 1.5 秒定好是谁（让 NPC 先出现在画面里），走到跟前再弹题
  const slot = run.lv.slots[run.slotIdx];
  if (slot && !run.pending && slot.x - run.x < Math.max(520, 1.6 * speedAt(slot.x))) run.pending = prepareSlot(run, slot);
  if (slot && !run.choice && !run.shop && run.x >= slot.x) {
    openSlot(run, slot, run.pending);
    run.pending = null;
    run.slotIdx++;
  }

  // 电梯 / 楼梯：到了门口路线还没定（路线卡没弹出来，只有测试 / 调试会这样）就按楼梯装上；选了电梯的走到门洞中心就进轿厢
  const br = run.course.branch;
  if (br && !br.used && run.x >= br.door - 1) {
    if (!br.route && run.x > br.door + 40) br.used = true;           // 直接被放到门后面（测试 / 调试跳过去的）：这一段不算
    else {
      if (!br.route) chooseRoute(run, run.routeDefault);
      if (br.route !== 'lift') br.used = true;                       // 楼梯：路过电梯门，接着跑
      else if (run.x >= br.door && !run.cutscene && !run.ride) enterLift(run, br);
    }
  }
  if (br && br.route && run.stats.exitMin == null && run.x >= br.exit) run.stats.exitMin = clockMin(run);   // 两条路的汇合点（大门）：平衡统计用

  // 到家
  if (run.x >= run.lv.end - 20 && !run.ending) arrive(run);
}

// 减速的托底速度：前方 2 秒路程内没过的跳类障碍里，最低要多快才跳得过（course.js 的 JUMP_VMIN，都 ≤ 240）。
// 提前 2 秒托住（回升照样限速），起跳那一刻速度早就稳了
function slowFloor(run, vb) {
  const obs = run.course.obstacles;
  let f = 0;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i];
    if (o.x - run.x > 2 * vb) break;
    if (!o.done && o.x + OBSTACLES[o.type].w > run.x) f = Math.max(f, JUMP_VMIN[o.type] || 0);
  }
  return f;
}

// ── 障碍结果 ────────────────────────────────────────────
function passed(run, o) {
  const t = OBSTACLES[o.type];
  if (run.ride || run.cutscene) return;
  run.combo++; run.stats.maxCombo = Math.max(run.stats.maxCombo, run.combo);
  const near = !t.light && o.minClear != null && o.minClear < TUNE.nearMiss && o.minClear > -TUNE.shrink;
  if (near) { run.stats.nearMiss++; addScore(run, SCORE.near); fx(run, 'near', { x: o.x }); }
  if (run.chaser) run.chaser.gap += CHASE.dodge + (near ? CHASE.near : 0);
  fx(run, 'pass', { combo: run.combo });
}
function hit(run, o) {
  o.hit = true;
  const t = OBSTACLES[o.type], p = run.player;
  if (!stumble(p)) return;
  if (t.platform) { p.y = -t.ground; p.vy = 0; p.onGround = true; }   // 绊上台阶：踉跄着爬上去，而不是穿过去
  run.stats.hits++; run.combo = 0;
  if (run.t - run.lastHSwipe < SWIPE.misfire) run.stats.swipe.misfire++;      // 埋点：横划完马上撞上，多半是想跳 / 滑被判成了横划
  if (run.t - run.lastDash < DASH.time + 0.5) run.stats.dashHit++;              // 埋点：冲刺中或冲完 0.5 秒内撞上（太高就把 DASH.clear 调小）
  run.sat += RES.hit.sat; addMin(run, RES.hit.min);
  if (run.chaser) { run.chaser.gap += CHASE.hit; run.stats.hitsChased++; }
  fx(run, 'hit', { obstacle: o.type });
}
function splash(run, o) {
  run.mods.push({ k: 0.85, t: 0.6 });
  run.combo = 0; run.stats.wet = true;
  const car = o.type === 'splash';
  if (car) run.flags.splashed = run.stats.splashed = true;   // 被车溅了：门口「裤子咋湿了」只认这个（普通水坑不算）
  fx(run, 'splash', { x: o.x, car });
}
function fallInHole(run, o) {
  run.holeO = null;
  run.cutscene = { kind: 'hole', t: RES.hole.time, total: RES.hole.time, o };
  addMin(run, RES.hole.min); run.sat += RES.hole.sat;
  run.stats.hits++; run.combo = 0;
  if (run.chaser) { run.chaser.gap += CHASE.hit; run.stats.hitsChased++; }
  fx(run, 'hole');
}

// ── 追逐 ────────────────────────────────────────────────
// o：追逐槽的参数 { gap0, hold, line }（line：追兵头顶喊的一句，画 1.6 秒）
function startChase(run, npc, o = {}) {
  if (run.chaser) { caught(run, npc); return; }          // 已经在被追又选错：当场被逮
  run.chaser = { npc, gap: (o.gap0 != null ? o.gap0 : CHASE.gap0) + (run.flags.energy ? CHASE.energy : 0), phase: 'slow', t: 0, hold: o.hold || null, line: o.line || null, lineT: run.t };
  run.flags.energy = false;
  run.stats.chased++;
  tip(run, 'chase', '被追了！跳过障碍甩掉追兵');
  // 冲刺提示：全程关（软版本）、学过了、周二及以后才出；周一只教被追和饭盒，冲刺留给周二定格教（定格会把这条记成看过）
  if (run.learned.includes('dash') || dueAt(run.lv, 'dash')) tip(run, 'dash', '被追时右滑：冲刺！');
  fx(run, 'chase', { npc, line: o.line || null });
}
// 追逐槽：不出题，追兵从左后方冲出来直接追。已经在被追的话换人追（上一个让开，不算甩掉、也不当场被逮：这里没有选项，不能罚）
function slotChase(run, slot) {
  if (run.lv.def.rules.chase === false) return;
  if (run.chaser) run.chaser = null;
  startChase(run, slot.npc, { gap0: slot.gap0, hold: slot.hold, line: slot.line });
}
// hold: 'door' 什么时候还生效：这一关有电梯分支、还没过电梯门
function holdDoor(run) {
  const b = run.course.branch;
  return !!(b && !b.used && run.x < b.door);
}
function caught(run, npc) {
  run.chaser = null;
  run.boxes--; run.stats.caught++; run.stats.caughtBy.push(npc);
  addMin(run, RES.caught.min); run.sat += RES.caught.sat; run.combo = 0;
  const line = npc === 'mom' ? '' : NPCS[npc].caught;
  run.cutscene = { kind: 'caught', npc, t: CHASE.caughtTime, total: CHASE.caughtTime, line };
  fx(run, 'caught', { npc });
}
function endCutscene(run) {
  const cs = run.cutscene; run.cutscene = null;
  const p = run.player;
  if (cs.kind === 'hole') {
    const t = OBSTACLES[cs.o.type];
    run.x = Math.max(run.x, obstacleX(cs.o, run.x) + t.w + 6);
    cs.o.done = true; cs.o.hit = true;
    p.y = 0; p.vy = 0; p.onGround = true; p.state = 'run'; p.invulnT = 0.8;
    fx(run, 'climb');
  }
  if (cs.kind === 'caught') {
    p.invulnT = 1.0;
    if (run.boxes <= 0) finish(run, false, 'caught', cs.npc);
  }
}

// ── 选择 ────────────────────────────────────────────────
const NPC_SLOT = { npc: 1, gate: 1, mom: 1 };
function prepareSlot(run, slot) {
  const pend = { slot, q: null, wx: slot.x + (375 - 75 - TUNE.playerX) / zoomAt(speedAt(slot.x)) };
  // 从电梯里追出来的人（出了大门离下一个人只有 3 秒多）：下一个人迎上来时被挡开、不追了。路上的追逐本来就在下一题之前结束，
  // 只有电梯出口离得近；不让开的话「每题都选错也一定甩得掉」就不成立了（被追时又答错 = 当场被逮）
  if (NPC_SLOT[slot.kind] && run.chaser && run.chaser.lift) { const npc = run.chaser.npc; run.chaser = null; run.stats.escaped++; fx(run, 'escape', { npc, cut: true }); }
  if (NPC_SLOT[slot.kind]) {
    const st = run.lv.themeAt(slot.x), now = clockMin(run);
    // 门口终题由剧本接入点挑好（不碰 rng），makeQuestion 只抽左右
    const door = slot.kind === 'mom' ? story.door(run, now) : null;
    pend.q = makeQuestion({ rng: run.rng, stage: st, npcSeen: run.npcSeen, qUsed: run.qUsed, grudges: run.grudges, revisits: run.revisits, flags: run.flags, t: run.t, lastNpc: run.lastNpc, clockMin: now, used: run.used, money: run.money, door }, slot);
    if (pend.q) run.lastNpc = pend.q.npc;
  }
  return pend;
}

function openSlot(run, slot, pend) {
  const st = run.lv.themeAt(slot.x);
  let c = null;
  if (NPC_SLOT[slot.kind]) {
    const q = pend && pend.q;
    if (!q) return;
    if (q.revisit) { run.revisits++; tip(run, 'grudge', '记仇的人回来了：别再用上次的借口'); }
    run.npcSeen[q.npc] = (run.npcSeen[q.npc] || 0) + 1;
    const T = Math.max(CHOICE.minTime, (slot.kind === 'mom' ? CHOICE.time.home[0] : run.lv.choiceTime(slot.x, q.revisit)) + run.readPlus - ((run.mod && run.mod.readMinus) || 0));   // 带薪摸鱼 +0.3 秒（窗口按它排过）
    c = { kind: slot.kind === 'gate' ? 'npc' : slot.kind, ...q, T, slow: CHOICE.slow[st] };
  } else if (slot.kind === 'chase') {
    slotChase(run, slot);
    return;
  } else if (slot.kind === 'call') {
    // 'mom' 是「家里来电」：槽位或剧本指定了来电人就不抽签；没指定时 rng 的调用次数和顺序不变
    const n = run.callers.length;
    const left = ['mom', 'boss', 'unknown'].filter(k => !run.callers.includes(k));
    const who = story.pickCaller(run, slot) || (n === 0 && run.rng.chance(0.5) ? 'mom' : run.rng.pick(left));
    run.callers.push(who);
    const cl = who === 'mom' ? story.caller(run, n) : CALLERS[who];
    c = { kind: 'call', caller: who, def: who === 'mom' ? cl : null, errand: who === 'mom' ? cl.errand : null,
          npc: who === 'boss' ? 'laoliu' : who === 'mom' ? cl.who : null, line: cl.line, name: cl.name, opts: [{ text: cl.pick.text }, { text: cl.hang.text }], T: CHOICE.eventTime.call, slow: CHOICE.eventSlow };
  } else if (slot.kind === 'ride') {
    c = { kind: 'ride', name: RIDE.name, line: RIDE.line, opts: RIDE.opts, T: CHOICE.eventTime.ride, slow: CHOICE.eventSlow };
  } else if (slot.kind === 'store') {
    c = { kind: 'store', name: STORE.name, line: story.storeLine(run, STORE.line), opts: STORE.opts, T: CHOICE.eventTime.store, slow: CHOICE.eventSlow };
  } else if (slot.kind === 'route') {
    // 路线卡：左右固定（左楼梯 = 超时默认，右电梯），不随机换边；卡片小字写开局排好的停层数（信息透明）
    const br = run.course.branch, R = ROUTE[slot.branch] || ROUTE.lift;
    if (br && !br.route) c = { kind: 'route', name: R.name, line: R.line, opts: R.opts.map(o => ({ ...o, note: o.note.replace('N', String(br.stops)) })), T: CHOICE.eventTime.route, slow: CHOICE.eventSlow };
  }
  if (!c) return;                                   // 还没实现的槽（追逐槽）、没有分支的路线卡：跳过
  c.t = 0; c.age = 0; c.phase = 'open'; c.rt = 0; c.x = slot.x; c.wx = pend ? pend.wx : slot.x + 200;
  c.hold = canTeach(run, 'choose') && run.stats.choices === 0 && c.kind === 'npc';   // 第一题：世界停住等你选（新手局 / 序章）
  if (c.hold) showHint(run, '左滑选左边 · 右滑选右边', 999);
  run.choice = c;
  fx(run, 'choice', { kind: c.kind });
}

function updateChoice(run, dt) {
  const c = run.choice;
  c.age += dt;
  if (c.phase === 'open') {
    if (!c.hold) c.t += dt;
    const left = c.T - c.t;
    if (left < 0.8 && Math.floor(left * 6) !== Math.floor((left + dt) * 6)) fx(run, 'hurry');
    if (c.t >= c.T) timeout(run);
  } else {
    c.rt += dt;
    if (c.rt >= 0.75) run.choice = null;
  }
}

function pick(run, i) {
  const c = run.choice;
  if (!c || c.phase !== 'open' || i < 0 || i > 1) return;
  if (c.t < CHOICE.guard && !c.hold) return;
  if (c.hold) { c.hold = false; run.hint = null; }
  resolve(run, i, false);
}

function timeout(run) {
  const c = run.choice;
  run.stats.timeouts++;
  if (c.kind === 'call') return resolve(run, 1, true);         // 没接 = 挂了
  if (c.kind === 'ride' || c.kind === 'store') return resolve(run, 1, true);
  if (c.kind === 'route') return resolve(run, c.opts.findIndex(o => o.route === run.routeDefault), true);   // 超时 = 走楼梯（左边）
  resolve(run, -1, true);
}

function resolve(run, i, isTimeout) {
  const c = run.choice;
  c.phase = 'result'; c.picked = i; c.timeout = isTimeout;
  const quick = !isTimeout && c.t < CHOICE.quick;
  if (c.kind === 'call') return resolveCall(run, c, i);
  if (c.kind === 'ride') {
    c.res = { good: true, react: i === 0 ? '「坐稳了！」' : '「那你慢慢跑」' };
    if (i === 0) startRide(run);
    return;
  }
  if (c.kind === 'store') {
    c.res = { good: true, react: i === 0 ? '叮咚～欢迎光临' : '（咽了下口水）' };
    if (i === 0) openShop(run);
    return;
  }
  if (c.kind === 'route') {
    const route = (c.opts[i] || c.opts[0]).route, R = ROUTE.lift;
    c.res = { good: true, react: R.react[route] };
    chooseRoute(run, route);
    return;
  }

  // NPC / 妈妈（电梯里的题用单独的随机流：超时的运气、记仇的时刻都不动 run.rng）
  run.stats.choices++;
  if (c.room) run.stats.liftQ++;
  const qrng = c.room ? run.liftRng : run.rng;
  let r, opt = null;
  if (i < 0) {
    const lucky = c.kind !== 'mom' && !qrng.chance(CHOICE.timeoutBad);
    const own = c.kind === 'mom' && MEMBERS[c.npc] ? MEMBERS[c.npc].ruleLines.timeout : null;   // 门口超时：答题人自己的那句（橘子「（它转身走了）」）
    r = lucky ? { good: 'mid', reason: 'lucky', react: '（对方接了个电话走了）' } : { good: false, reason: 'timeout', react: own || '……你倒是说话啊' };
  } else {
    opt = c.opts[i];
    run.said.push(`${c.npc}:${opt.text}`);
    r = judge(opt, judgeCtx(run, c));
    run.stats.tags[opt.tag] = (run.stats.tags[opt.tag] || 0) + 1;
    if (isExcuse(opt.tag)) {
      run.used[opt.tag] = (run.used[opt.tag] || 0) + 1;
      if (run.used[opt.tag] === 2) tip(run, 'tired', '同一类借口用到第 3 次就不灵了');
    }
    if (opt.lol && (!run.best || opt.lol >= run.best.lol)) run.best = { text: opt.text, npc: c.npc, lol: opt.lol, line: c.line };
  }
  c.res = { good: r.good, react: r.react, reason: r.reason, quick };

  // 家门口终题（kind 仍叫 'mom'：所有家庭都用）：好坏只影响晚饭，不会失败。中 = 放行，晚饭不加也不减
  if (c.kind === 'mom') {
    run.flags[r.good === true ? 'momGood' : r.good === 'mid' ? 'momMid' : 'momBad'] = true;
    run.fam.door = { key: c.mom, who: c.npc, good: r.good, dinner: c.dinner || null };
    if (r.good === true) { run.stats.good++; addScore(run, SCORE.good + (quick ? SCORE.quick : 0)); fx(run, 'good', { npc: c.npc, door: true }); }
    else if (r.good === 'mid') { run.stats.mid++; fx(run, 'mid', { npc: c.npc, door: true }); }
    else { run.stats.bad++; fx(run, 'bad', { npc: c.npc, door: true }); }
    return;
  }

  if (r.good === true) {
    run.stats.good++; if (quick) run.stats.quick++;
    run.combo++; run.stats.maxCombo = Math.max(run.stats.maxCombo, run.combo);
    if (opt && opt.cost) run.money -= opt.cost;
    addScore(run, SCORE.good + (quick ? SCORE.quick : 0));
    if (c.revisit) {
      run.stats.reconciled++; addScore(run, SCORE.reconcile);
      if (!run.restored && run.boxes < RES.boxes) { run.restored = true; run.boxes++; fx(run, 'restore'); }
      c.res.reconcile = true;
    }
    if (opt) applyEff(run, opt.eff, c);
    fx(run, 'good', { npc: c.npc, quick });
  } else if (r.good === 'mid') {
    run.stats.mid++;
    if (opt) applyEff(run, opt.eff, c);
    fx(run, 'mid', { npc: c.npc });
  } else {
    run.stats.bad++; run.combo = 0; run.stats.lastBad = r.reason;
    if (!c.revisit) run.grudges.push({ npc: c.npc, tag: opt ? opt.tag : '装傻', said: opt ? opt.text : '', readyAt: run.t + qrng.range(25, 45) });
    const noChase = run.lv.def.rules.chase === false;        // 序章：答错只有反应台词，不追
    if (noChase) c.res.noChase = true;
    fx(run, 'bad', { npc: c.npc, reason: r.reason, room: !!c.room, noChase });
    if (noChase) { /* 不追 */ }
    else if (!c.room) startChase(run, c.npc);
    else {
      // 电梯里答错：不碎饭盒（电梯里不追），出门后照常被追（gap0）。追兵已经跟进来了，或者已经有人要追了，不叠加
      const rm = run.room;
      if (rm && !rm.chaserIn && !rm.pendingChase && !run.chaser) rm.pendingChase = c.npc;
    }
  }
}

// 判定用的上下文（机器人的 decide() 用同一个）：门口终题带上答题人自己的规则台词
export function judgeCtx(run, c) {
  const door = c.kind === 'mom';
  return { money: run.money, sat: run.sat, used: run.used, grudgeTag: c.grudgeTag, flags: run.flags, shops: run.stats.shops, mom: door, ruleLines: door && MEMBERS[c.npc] ? MEMBERS[c.npc].ruleLines : null };
}

function applyEff(run, eff, c) {
  if (!eff) return;
  if (eff.sat) { run.sat = Math.max(1, Math.min(100, run.sat + eff.sat)); if (eff.sat > 0) run.stats.ate.push(eff.sat >= 30 ? '阿姨的包子' : '蛋糕'); }
  if (eff.money) run.money = Math.max(0, run.money + eff.money);
  if (eff.slow) run.mods.push({ k: eff.slowK || 0.6, t: eff.slow });
  if (eff.flag) run.flags[eff.flag] = true;
  if (eff.grudge) run.grudges.push({ npc: null, chain: eff.grudge, readyAt: run.t + run.rng.range(20, 35) });
  void c;
}

function resolveCall(run, c, i) {
  const cl = c.caller === 'mom' ? c.def : CALLERS[c.caller];
  const side = i === 0 ? cl.pick : cl.hang;
  let react = side.react, eff = side.eff;
  if (eff.gamble) { const out = run.rng.pick(UNKNOWN_OUTCOMES); react = out.react; eff = out.eff; }
  if (c.caller === 'boss' && i !== 0 && run.flags.powerbank) { react = '（手机是真没电了）'; eff = {}; }
  c.res = { good: true, react };
  applyEff(run, eff, c);
  story.onCall(run, c, i);
  fx(run, i === 0 ? 'answer' : 'hangup', { caller: c.caller });
}

// ── 电梯 / 楼梯 ─────────────────────────────────────────
// 路线定下来：装上这条路（楼梯间的障碍 / 电梯门前 ▶▶ 区），写 flag 给家庭剧本读
function chooseRoute(run, route) {
  const br = run.course.branch;
  if (!br || br.route) return;
  installBranch(run.course, route);
  run.route = route; run.stats.route = route;
  run.flags[route === 'lift' ? 'tookLift' : 'tookStairs'] = true;
  fx(run, 'route', { route });
}
// 进门（按主角位置触发：走到门洞中心）。被追时在门前 ▶▶ 区里冲过刺 = 门在追兵面前合上，当场甩掉；没冲刺追兵跟着挤进来
function enterLift(run, br) {
  br.used = true;
  run.x = br.door; run.v = 0; run.ts = 0;               // 一下切进轿厢：世界马上停住（不是慢慢停）
  const p = run.player;
  p.y = 0; p.vy = 0; p.onGround = true; p.state = 'run'; p.slideT = 0; p.dashT = 0;
  if (run.choice && run.choice.phase !== 'open') run.choice = null;
  const shut = !!(run.chaser && br.zone.dashed), npc = run.chaser ? run.chaser.npc : null;
  run.room = { t: 0, bt: 0, bi: 0, beats: br.beats, chaserIn: !!run.chaser && !shut, chaser: npc, shut, pendingChase: null, btn: false, q: null, keyTip: false };
  run.room.beats = br.beats.map(b => ({ ...b }));        // 这一局的状态（关没关门）记在副本上，不改开局排好的节拍
  if (shut) doorShut(run);
  for (const b of run.room.beats) if (b.kind === 'npc') { b.q = liftQuestion(run); b.npc = b.q ? b.q.npc : null; }   // 题在进门时就出好（画面层提前把字准备好），停层时才弹
  fx(run, 'liftIn', { shut, chaserIn: run.room.chaserIn });
}
function doorShut(run) {
  const npc = run.chaser.npc;
  run.chaser = null;
  run.stats.escaped++; run.stats.doorShut++; run.flags.doorShut = true;
  addScore(run, ROOM.shutScore);
  fx(run, 'doorShut', { npc });
}
// 轿厢里的一拍一拍：关门 → 下行 → 停层（同事 / 外卖 / 空层）→ … → 开门。世界停住，时钟和饱腹照常按真实时间走（房间不是免费暂停），
// 每局最多 ROOM.max 秒，到点不管停在哪一拍都开门出去（不会卡死）
function updateRoom(run, dt) {
  const r = run.room;
  if (run.teach) return;                                 // 教学定格（周二「点一下：关门」）：不推进、不计时
  r.t += dt; r.bt += dt;
  run.clock += dt * run.lv.clockRate;
  run.sat -= RES.satDrain * dt * ((run.mod && run.mod.satK) || 1);   // 肚子也照常饿（和时钟一起走；电梯里不会饿晕：最低留 1）
  run.sat = Math.max(1, run.sat);
  run.stats.stopT += dt; run.stats.liftT = r.t;
  run.stats.stopMax.room = Math.max(run.stats.stopMax.room, r.t);
  const b = r.beats[r.bi];
  if (b) {
    if (b.kind === 'npc' && !r.q && r.bt > 0.05) openRoomQuestion(run, r, b);
    r.btn = b.kind === 'takeout' && run.liftBtn && !b.closed && r.bt <= ROOM.closeWin;
    // 周二教学：第一拍外卖等你点关门（定格：不推进、不计时，点了才接着走）
    if (r.btn && r.bt >= 0.2 && !run.taught.has('lift') && canTeach(run, 'lift')) { r.keyTip = true; startTeach(run, 'lift', '点一下：关门！'); return; }
    if (r.btn && !r.keyTip) { r.keyTip = true; fx(run, 'liftKey'); }
    if (b.kind === 'takeout' && !b.closed && !b.inside && r.bt > ROOM.closeWin) { b.inside = true; fx(run, 'takeoutIn'); }
    let done;
    if (b.kind === 'npc') done = (r.q && r.q !== true && !run.choice && r.bt > 0.3) || (r.q === true && r.bt >= ROOM.empty) || r.bt >= ROOM.npcBeat;
    else if (b.kind === 'takeout') done = (b.closed && r.bt >= b.closedAt + 0.2) || r.bt >= ROOM.takeout;
    else done = r.bt >= b.T;
    if (done) {
      if (STOPS[b.kind]) fx(run, 'liftShut', { kind: b.kind, closed: !!b.closed });
      r.bi++; r.bt = 0; r.q = null;
      const nb = r.beats[r.bi];
      if (nb && STOPS[nb.kind]) fx(run, 'liftDing', { kind: nb.kind, floor: nb.floor });
    }
  }
  if (!r.beats[r.bi] || r.t >= ROOM.max - 1e-6) exitLift(run);
}
const STOPS = { npc: 1, takeout: 1, empty: 1 };
// 停层进来一个同事：复用 NPC 题库（公司的人），题目用单独的随机流；没人可出就当空层。
// 追兵（被门夹在外面的、跟着挤进来的）不会再从下一层走进来：同一个人不能同时出现两次
const liftQuestion = run => makeQuestion({ rng: run.liftRng, stage: 'office', npcSeen: run.npcSeen, qUsed: run.qUsed, grudges: [], revisits: 2, flags: run.flags, t: run.t, lastNpc: run.lastNpc, clockMin: clockMin(run), used: run.used, money: run.money, exclude: run.room && run.room.chaser ? [run.room.chaser] : null }, { kind: 'npc' });
function openRoomQuestion(run, r, b) {
  const q = b.q;
  r.q = q || true;
  if (!q) return;
  b.opened = true;
  run.npcSeen[q.npc] = (run.npcSeen[q.npc] || 0) + 1;
  const T = Math.max(CHOICE.minTime, ROOM.npcT + (run.readPlus || 0) - ((run.mod && run.mod.readMinus) || 0));
  run.choice = { kind: 'npc', ...q, T, slow: 0, room: true, t: 0, age: 0, phase: 'open', rt: 0, x: run.x, wx: run.x, hold: false };
  fx(run, 'choice', { kind: 'npc', room: true });
}
// 关门键：外卖小哥那一拍的前 ROOM.closeWin 秒内点一下，100% 有效：门关上不让他进，省下这一拍剩下的时间（+50）
function roomClose(run) {
  const r = run.room, b = r && r.beats[r.bi];
  if (!b || b.kind !== 'takeout' || !r.btn || b.closed) return false;
  b.closed = true; b.closedAt = r.bt; r.btn = false;
  run.stats.liftClose++;
  addScore(run, ROOM.closeScore);
  fx(run, 'liftClose');
  return true;
}
// 出门：直接到汇合点（大门）。电梯里答错的同事出门后照常追（gap0）；跟进来的追兵接着追，距离和进门时一样
function exitLift(run) {
  const r = run.room, br = run.course.branch;
  if (run.choice && run.choice.room) { if (run.choice.phase === 'open') timeout(run); run.choice = null; }
  run.room = null;
  for (const o of run.course.obstacles) if (o.x >= br.door && o.x < br.exit && !o.done) { o.done = true; o.skip = true; }   // 楼梯间的障碍（电梯路没装，保险）：跳过，不算躲过
  run.x = br.exit + 4; run.ts = 0;
  const p = run.player;
  p.y = 0; p.vy = 0; p.onGround = true; p.state = 'run'; p.slideT = 0; p.invulnT = ROOM.exitInvuln;
  if (r.pendingChase && !run.chaser) startChase(run, r.pendingChase);
  if (run.chaser) run.chaser.lift = true;                // 从电梯里追出来的：下一个人迎上来时让开（见 prepareSlot）
  fx(run, 'liftOut', { floor: 1 });
}

// ── 蹭车 ────────────────────────────────────────────────
function startRide(run) {
  run.ride = { t: RIDE.time, total: RIDE.time, detour: run.rng.chance(RIDE.detour.p) };
  run.stats.rides++;
  const p = run.player; p.state = 'run'; p.y = 0; p.vy = 0; p.onGround = true; p.slideT = 0;
  fx(run, 'ride');
}
function endRide(run) {
  const r = run.ride; run.ride = null;
  run.player.invulnT = 0.9;
  if (r.detour) { addMin(run, RIDE.detour.min); run.money += RIDE.detour.money; showHint(run, `帮小哥送了一单 +¥${RIDE.detour.money}`, 2.2); }
  else showHint(run, RIDE.done, 1.8);
  fx(run, 'rideEnd');
}

// ── 便利店 ──────────────────────────────────────────────
function openShop(run) { run.shop = { t: 0, T: STORE.time, picked: -1, closeT: 0, items: story.shopItems(run, STORE.items) }; fx(run, 'shop'); }
function updateShop(run, dt) {
  const s = run.shop;
  if (s.closeT > 0) { s.closeT -= dt; if (s.closeT <= 0) run.shop = null; return; }
  s.t += dt;
  if (s.t >= s.T) closeShop(run, false);
}
function buy(run, i) {
  const s = run.shop, it = s && s.items[i];
  if (!s || s.closeT > 0 || !it || s.t < 0.25) return;
  if (run.money < it.price) { fx(run, 'broke'); return; }
  dropShopTip(run);                                   // 买了（不管买的是什么）：「货架上有家里要的」马上撤掉，不和「润喉糖 ✓」飘字叠在一起
  if (story.onBuy(run, it, i)) return;
  run.money -= it.price; run.sat = Math.min(100, run.sat + it.sat);
  if (it.flag) run.flags[it.flag] = true;
  run.stats.shops++; run.stats.ate.push(it.name);
  addMin(run, STORE.min);
  s.picked = i; s.closeT = 0.55;
  fx(run, 'buy', { item: it.id });
}
function closeShop(run) {
  const s = run.shop;
  if (!s || s.closeT > 0 || s.t < 0.25) return;
  addMin(run, 1); s.picked = -1; s.closeT = 0.25;
  dropShopTip(run);
  fx(run, 'leave');
}
// 买完 / 不买走了：「货架上有家里要的」还亮着就撤掉；还在排队没轮上的直接丢掉（不记看过，下次进店再出）
function dropShopTip(run) {
  if (run.hint && run.hint.key === 'errandStore') run.hint = null;
  if (run.tipQueue.some(q => q.key === 'errandStore')) run.tipQueue = run.tipQueue.filter(q => q.key !== 'errandStore');
}

// ── 结束 ────────────────────────────────────────────────
export const clockMin = run => run.start + run.clock / 60;
export function fmtClock(min) {
  const m = Math.floor(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function arrive(run) {
  if (run.choice && run.choice.phase === 'open') timeout(run);   // 没答完的终极一问按超时算
  run.chaser = null;
  const result = finish(run, true, 'home');
  run.ending = { t: 0, total: 3.4, result };
  run.done = null;
  fx(run, 'arrive');
}

// 评级：到家时刻（取整分钟 am）≤ 标准时间 + 关卡的 par.grade[i]，且碎饭盒 ≤ 上限。全程关 = S 18:52 / A 19:00 / B 19:12
export function gradeOf(run, am, broken) {
  const g = run.lv.def.par.grade, p = run.par.min;
  for (let i = 0; i < GRADE_REL.length; i++) if (am <= p + g[i] && broken <= GRADE_REL[i].broken) return GRADE_REL[i].g;
  return 'C';
}
// 晚饭档（0–3）：时间档（标准时间 + par.meal，全程关 18:52 / 19:02 / 19:15）+ 路上的加减。家庭剧本的加减不在这里，在 finish() 里调一次
export function mealTier(run, am) {
  const m = run.lv.def.par.meal, p = run.par.min;
  let tier = am <= p + m[0] ? 3 : am <= p + m[1] ? 2 : am <= p + m[2] ? 1 : 0;
  if (run.flags.momHappy) tier++;
  if (run.mod && run.mod.mealBonus) tier += run.mod.mealBonus;
  if (run.flags.momGood) tier++;
  if (run.flags.momBad) tier--;
  if (run.flags.momAngry && !run.flags.momGood) tier--;
  return Math.max(0, Math.min(3, tier));
}

function finish(run, win, reason, npc = null) {
  const s = run.stats;
  const arrival = clockMin(run), am = Math.floor(arrival);
  const broken = RES.boxes - run.boxes;
  const grade = win ? gradeOf(run, am, broken) : 'C';
  // 晚饭
  let meal;
  if (win) {
    const tier = Math.max(0, Math.min(3, story.mealAdjust(run, mealTier(run, am))));   // 钩子办了 +1 / 忘了封顶 2，序章保底
    meal = mealFor(run.story, tier, run.flags.takeout);                               // 这个家的菜（外卖到了门卫、档位 ≤1 时吃外卖）
  } else if (reason === 'starve') meal = { name: STARVE.meal, text: STARVE.text, tier: -1 };
  else { const f = NPCS[npc].fail; meal = { name: f.meal, text: f.text, tier: -1 }; }

  const excuseKinds = Object.keys(run.used).length;
  const family = story.summary(run, { tier: win ? meal.tier : -1, grade: win ? grade : '—', broken, win, reason });
  const tsum = { ...s, excuseKinds, fam: family };
  const title = win ? story.titles(run, TITLES).find(t => t.test(tsum)).name : reason === 'starve' ? '饿晕路边' : (NPCS[npc] && NPCS[npc].fail.title) || '加班人';
  let score = run.score + Math.floor((run.x - run.lv.x0) / 10) * SCORE.per10px;
  if (win) {
    score += run.money * SCORE.moneyLeft + Math.round(run.sat) * SCORE.satLeft;
    const early = run.par.min + run.lv.def.par.target - arrival;      // 比「标准 + target」早到每分钟 +100（全程关 = 19:00）
    score += Math.round(early > 0 ? early * SCORE.perMinEarly : early * -SCORE.perMinLate);   // 晚到每分钟 -50
  }
  score = Math.max(0, Math.round(score * ((run.mod && run.mod.scoreK) || 1)));
  const result = { win, reason, npc, arrival, arrivalText: fmtClock(arrival), grade: win ? grade : '—', broken, meal, title, score, stats: tsum, best: run.best, seed: run.seed, daily: run.daily, mod: run.mod ? run.mod.name : '', x: run.x,
    level: run.lv.id, par: run.par.min, parText: fmtClock(run.par.min), vsPar: arrival - run.par.min, route: run.route, family, story: run.story.key };   // 只做加法：已有字段含义不变
  // 关卡：星级（★2 准点线）、带薪摸鱼；所有局：一句提示（失败按死因，关卡到家了按没拿的星）
  result.assist = run.assist;
  result.stars = starsOf(run.lv, result, { assist: run.assist });
  result.starLine = run.lv.def.stars ? starLine(run.lv, run.par.min) : null;
  const known = new Set([...run.learned, ...[...run.teachSet].map(k => TEACH_KEY[k] || k)]);
  if (run.tips.has('dash')) known.add('dash');
  result.tip = deathTip(result, run.lv, known);
  if (!win) { run.done = result; fx(run, 'fail', { reason }); }
  return result;
}
