// 路线生成：开局按种子把整条路一次排好（每日挑战同一天同一条路）。
//   1) 先给每个选择槽 / 事件留出「读题窗口」，窗口里不放障碍（小区开始窗口后段允许出现障碍：边跳边选）
//   2) 其余路段按「到达时间差」排障碍：两次操作之间至少隔 GAP 秒，用这段路的速度换算成距离
//   3) 再沿跳跃弧线摆零钱、空地上摆一排零钱和少量包子
// 移动障碍（迎面的车）记录的是「和主角相遇的位置」，运行时按主角离它多远倒推它现在在哪，
// 所以不管主角中途怎么减速，它都在算好的地方撞上来，间距表始终成立。
import { OBSTACLES } from '../data/obstacles.js';
import { TUNE, CHOICE, TRAFFIC, CROSS, ROOM, ASSIST, speedAt, zoomAt } from '../data/tune.js';
import { subRng, SALT } from '../core/rng.js';
import { RIDE } from '../data/events.js';
import { FULL, toLevel } from './level.js';

export const GAP = {
  'jump>jump': 0.86, 'jump>slide': 0.70, 'slide>jump': 0.62, 'slide>slide': 0.70,
  moving: 0.15,            // 后一个是迎面移动的，多留一点
  lateAfter: 120000,       // 先不收紧（预留：后期 jump>jump 可降到 0.74）
};
// 每个路段障碍之间的平均额外间隔（秒）：越往后越密
export const DENSITY = { office: 1.0, street: 0.75, park: 0.55, home: 0.45, stairs: 0.9 };

export const kindOf = t => (t.avoid === 'slide' ? 'slide' : 'jump');

// 跳类障碍最低要多快才跳得过（px/s）：滞空时脚底高过「障碍高 − 擦边」的那段时间里，要横着走完「障碍宽 + 主角宽 − 两边擦边 + 两边各留 8px」。
// 障碍目录按最低速 240 核过，都 ≤ 240；被缠住（×0.6）之类的减速可能压到这以下，运行时按它托底（见 run.js 的 slowFloor）
export const JUMP_VMIN = Object.fromEntries(Object.entries(OBSTACLES).map(([id, t]) => {
  if (t.avoid !== 'jump' || t.platform || t.light || t.hole || !t.ground) return [id, 0];
  const top = 0.5 * TUNE.jumpV * TUNE.jumpV / TUNE.gravityUp, dh = top - (t.ground - TUNE.shrink);   // 跳高 108
  const air = Math.sqrt(2 * dh / TUNE.gravityUp) + Math.sqrt(2 * dh / TUNE.gravityDown);
  return [id, (t.w + TUNE.box.air[0] - 2 * TUNE.shrink + 16) / air];
}));

// 下面几个查询都有关卡参数，不传 = 全程关（旧签名照旧能用）
export function stageAt(x, lv = FULL) { return toLevel(lv).stageAt(x); }

// 某个位置的读题时间（真实秒）
export function choiceTime(x, revisit = false, lv = FULL) { return toLevel(lv).choiceTime(x, revisit); }

// 选择槽前后需要空出来的区间。readPlus：读题时间额外加多少秒（带薪摸鱼 +0.3）
const EVENT_SLOT = ['call', 'ride', 'store', 'route'];
export function slotWindow(slot, lv = FULL, { readPlus = 0 } = {}) {
  lv = toLevel(lv);
  const s = lv.stageAt(slot.x), th = lv.themeOf(s), v = speedAt(slot.x) * 1.04;
  if (slot.kind === 'chase') return [slot.x - 0.45 * v, slot.x + 0.8 * v];    // 追逐槽：不出题，追兵冲出来那一段不放障碍
  let T, slow, clear = CHOICE.clear[th];
  if (EVENT_SLOT.includes(slot.kind)) { T = CHOICE.eventTime[slot.kind] ?? CHOICE.eventTime.call; slow = CHOICE.eventSlow; clear = 1; }
  else { T = lv.choiceTime(slot.x) + readPlus; slow = CHOICE.slow[th]; }
  const before = 0.45 * v;
  let after = clear * T * slow * v + CHOICE.after * v;
  if (slot.kind === 'store') after += 0.6 * v;            // 出店后缓一缓
  if (slot.kind === 'mom') after = lv.end - slot.x + 10;
  return [slot.x - before, slot.x + after];
}
// 斑马线路口的窗口：停止线前 2.0 秒路程（灯牌出现）到斑马线后 0.5 秒路程。整段不放障碍、不摆零钱，
// 也就没有迎面移动的障碍被「按主角位置倒推」冻在半路（主角停在线后时，后面最近的车也在画面外）
export function crossWindow(c) {
  const v = speedAt(c.x);
  return [c.x - CROSS.show * v, c.x + CROSS.zebra + CROSS.after * v];
}
// 电梯 / 楼梯分支占的那一段：门前 ▶▶ 区（门前 ROOM.zone 秒路程）→ 电梯门 → 楼梯间 → 汇合点（大门）后 ROOM.exitClear 秒路程。
// 主路线在这一段里不放任何东西；楼梯间的障碍单独排（branchPlan），选了楼梯才装上
export function branchSpan(b) {
  return b ? [b.door - ROOM.zone * speedAt(b.door) - 20, b.exit + ROOM.exitClear * speedAt(b.exit)] : null;
}
// 整条路上不放障碍的区间：选择槽窗口 + 路口窗口 + 分支区。家庭剧本的拾取物空地也按它避让
export function courseBlocks(lv = FULL, { readPlus = 0 } = {}) {
  lv = toLevel(lv);
  const out = [...lv.slots.map(s => slotWindow(s, lv, { readPlus })), ...(lv.def.crossings || []).map(crossWindow)];
  if (lv.def.branch) out.push(branchSpan(lv.def.branch));
  return out;
}
// 蹭车那一段（选择卡 + 坐车）：路口、包子都要避开
export const rideSpans = lv => toLevel(lv).slots.filter(s => s.kind === 'ride').map(s => [s.x, s.x + (CHOICE.eventTime.ride * CHOICE.eventSlow + RIDE.time * RIDE.speedK) * speedAt(s.x)]);

function gapTime(prev, next) {
  let g = GAP[`${kindOf(prev)}>${kindOf(next)}`];
  if (next.vx) g += GAP.moving;
  return g;
}

// 两个障碍之间最少要隔多远（前一个的左边缘 → 后一个的左边缘）
export function minSpacing(prevType, nextType, x) {
  const a = OBSTACLES[prevType], b = OBSTACLES[nextType];
  return a.w + gapTime(a, b) * speedAt(x) * 1.04;
}

// 一条路：选择槽窗口 → 手写障碍 → 随机段（按种子）→ 零钱、包子 → 新手局替换开头一段。
//   level：关卡（缺省全程关）；seed：这条路的种子（溅水、路口灯态按它起子随机流；null = 不转溅水、灯全绿）
//   xlight：调试 / 测试用，覆盖路口灯态 'red' | 'green' | 'flash' | 'worst'（前两个红、其余闪绿）。只改灯，不改路
//   readPlus：读题多几秒（带薪摸鱼），窗口按它放宽；assist：带薪摸鱼的子随机流，随机段障碍删掉 ASSIST.cut（手写、教学障碍不删）
//   全程关只有一条随机段 { x0: 900 }（test/fixtures/routes.json 锁住同种子的路）
export function planCourse(rng, { level = FULL, tutorial = false, seed = null, readPlus = 0, xlight = null, assist = null } = {}) {
  const lv = toLevel(level), def = lv.def;
  const obstacles = [], pickups = [];
  const blocks = courseBlocks(lv, { readPlus });
  const free = (a, b) => !blocks.some(([x0, x1]) => b > x0 && a < x1);

  for (const f of def.fixed) obstacles.push({ ...f, fixed: true });
  // 随机段：prev / sameRun 跨段延续（同一种最多连 2 个、两个台阶不挨着）
  const ctx = { prev: null, sameRun: 0 };
  for (const seg of def.gen) {
    // 段前紧挨着的手写障碍也算「上一个」：随机段的第一个障碍照样和它保持反应间距
    const f = def.fixed.filter(o => o.x < seg.x0).sort((a, b) => a.x - b.x).pop();
    if (f && (!ctx.prev || f.x > ctx.prev.x)) { ctx.prev = { type: f.type, x: f.x }; ctx.sameRun = 0; }
    // 段里（和段后）的手写障碍：随机障碍前后都要和它满足间距表（genSegment 里避让）
    genSegment(rng, lv, seg, blocks, free, obstacles, ctx, def.fixed.filter(o => o.x >= seg.x0).sort((a, b) => a.x - b.x));
  }
  // 带薪摸鱼：随机段的障碍按子随机流正好删掉 ASSIST.cut（四舍五入到个），手写、教学障碍不删。在摆零钱之前删：删掉的障碍上方不留零钱
  if (assist) {
    const rand = obstacles.filter(o => !o.fixed && !o.teach);
    const drop = new Set(assist.shuffle(rand.slice()).slice(0, Math.round(rand.length * ASSIST.cut)));
    for (let i = obstacles.length - 1; i >= 0; i--) if (drop.has(obstacles[i])) obstacles.splice(i, 1);
  }

  arcCoins(rng, obstacles, pickups);
  // 空地：长间隔里摆一排零钱；户外每个路段放两个包子（要跳一下才吃得到）。
  // 蹭车那一段不摆包子：人坐在马路上的电动车上够不着（包子顺延到后面的空地，每段还是两个）
  const sorted = obstacles.slice().sort((a, b) => a.x - b.x);
  const buns = {};
  const rideSpan = rideSpans(lv);
  const onRide = x => rideSpan.some(([a, b]) => x > a && x < b);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i], ta = OBSTACLES[a.type];
    const g0 = a.x + ta.w + 60, g1 = b.x - 60 - (b.vx ? 120 : 0);
    const st = lv.themeAt(g0);
    if (g1 - g0 < 260 || !free(g0, g1)) continue;
    if ((buns[st] || 0) < 2 && st !== 'office' && st !== 'home' && !onRide((g0 + g1) / 2) && rng.chance(0.3)) { buns[st] = (buns[st] || 0) + 1; pickups.push({ kind: 'bun', x: (g0 + g1) / 2, y: -88 }); continue; }
    if (rng.chance(0.2)) for (let k = 0; k < 3; k++) pickups.push({ kind: 'coin', x: g0 + 30 + k * 34, y: -22 });
  }
  // 新手局：只把开头一段（全程关 900–3500）换成两个教学障碍，后面整条路和同种子的普通局完全一样（分享给好友也是同一条路）
  if (tutorial && def.tutorialSpan) {
    const [ta, tb] = def.tutorialSpan, keep = o => o.x < ta || o.x >= tb;
    for (let i = obstacles.length - 1; i >= 0; i--) if (!keep(obstacles[i])) obstacles.splice(i, 1);
    for (let i = pickups.length - 1; i >= 0; i--) if (!keep(pickups[i])) pickups.splice(i, 1);
    for (const f of def.tutorialFixed) obstacles.push({ ...f });     // 复制一份：运行时会改它的位置
  }
  pickups.sort((a, b) => a.x - b.x);
  obstacles.sort((a, b) => a.x - b.x);
  obstacles.forEach((o, i) => { o.id = i; });
  if (seed != null) splashPuddles(obstacles, lv, subRng(seed, SALT.splash));
  const crossings = planCrossings(lv, seed, xlight);
  // ▶▶ 区：闪绿的路口，停止线前 1.0 ~ 0.1 秒路程（运行时被改成绿灯的路口会把它关掉）
  const zones = crossings.filter(c => c.light === 'flash').map(c => { const v = speedAt(c.x); return { kind: 'cross', i: c.i, x0: c.x - CROSS.zone[0] * v, x1: c.x - CROSS.zone[1] * v }; });
  const branch = def.branch ? branchPlan(lv, def.branch, seed) : null;
  if (branch) zones.push(branch.zone);                 // 电梯门前 ▶▶ 区：先关着，路线卡选了电梯才打开
  return { obstacles, pickups, blocks, crossings, branch, zones };
}

// 零钱：跳跃类障碍上方 15% 概率沿弧线摆 3 枚（手写、教学障碍不摆，也不消耗随机数）
function arcCoins(rng, obstacles, pickups) {
  for (const o of obstacles) {
    const t = OBSTACLES[o.type];
    if (kindOf(t) !== 'jump' || t.platform || t.vx || o.teach || o.fixed || !rng.chance(0.15)) continue;
    const v = speedAt(o.x), cx = o.x + t.w / 2;
    for (let k = -1; k <= 1; k++) {
      const u = (k * 42) / v;                                  // 离最高点的时间
      const g = u < 0 ? TUNE.gravityUp : TUNE.gravityDown;
      const h = 108 - 0.5 * g * u * u;
      pickups.push({ kind: 'coin', x: cx + k * 42, y: -(h + 26) });
    }
  }
}

// ── 电梯 / 楼梯分支 ─────────────────────────────────────
// 开局两条路都按子随机流排好（不碰主路线的 rng：调电梯、楼梯间不会把整条路洗牌），路线卡选哪条就装哪条：
//   楼梯：门后的楼梯间子路段（slowK 0.75），障碍只出 stairs 池（拖把水桶、文件箱、小心地滑），装进 course.obstacles；
//   电梯：门前 ▶▶ 区打开，主角跑到 door 进轿厢（世界停住的房间，见 run.js），出来直接在 exit。两条路 x 跨度相同，
//   汇合点（exit）之后完全是同一条路。seed 为 null（测试直接排路）时停层是一层同事，楼梯间按 0 号种子排
export function branchPlan(lv, def, seed) {
  const beats = liftBeats(def, seed != null ? subRng(seed, SALT.lift) : null);
  const stairs = stairsSeg(lv, def, subRng(seed != null ? seed : 0, SALT.stairs));
  const v = speedAt(def.door);
  return {
    ...def, beats, stops: beats.filter(b => STOP[b.kind]).length,
    liftT: beats.reduce((a, b) => a + b.T, 0),                // 轿厢标称时长（每一拍都走满）：标准时间按它算
    segs: { stairs, lift: { obstacles: [], pickups: [] } },
    zone: { kind: 'lift', x0: def.door - ROOM.zone * v, x1: def.door, off: true },
    route: null, used: false,
  };
}
const STOP = { npc: ROOM.npcBeat, takeout: ROOM.takeout, empty: ROOM.empty };
// 停层节拍：关门 → 下行 → 停层 → 下行 → [停层 → 下行] → 开门。每次停层是同事（出题）/ 外卖小哥（可关门）/ 空层之一。
// 子随机流固定取 4 个数（停几层、谁、顺序、停哪层）；写死节拍的关卡（周二教学）照样取，只是不用前三个
function liftBeats(def, r) {
  let kinds = Array.isArray(def.beats) ? def.beats.slice() : ['npc'], where = 0.5;
  if (r) {
    const two = r.next() < ROOM.two, pick = r.next(), order = r.next();
    where = r.next();
    if (!Array.isArray(def.beats)) {
      const tab = two ? ROOM.pair : ROOM.one, tot = tab.reduce((a, e) => a + e.w, 0);
      let acc = 0;
      kinds = tab[tab.length - 1].v;
      for (const e of tab) { acc += e.w / tot; if (pick < acc) { kinds = e.v; break; } }
      kinds = two && order < 0.5 ? [kinds[1], kinds[0]] : kinds.slice();
    }
  }
  // 停哪层：公司在 floor0 楼，停层在 floor0 − 1 … 2 楼之间（从上往下），最后到 1 楼
  const top = ROOM.floor0 - 1, n = kinds.length;
  const floors = [];
  for (let i = 0; i < n; i++) {
    const hi = (floors[i - 1] ?? top + 1) - 1, lo = 2 + (n - 1 - i);      // 给后面的停层留出楼层
    floors.push(hi - Math.min(hi - lo, Math.floor(where * (hi - lo + 1))));
  }
  const out = [{ kind: 'close', T: ROOM.doorClose }];
  let from = ROOM.floor0;
  kinds.forEach((k, i) => { out.push({ kind: 'down', T: ROOM.down, from, to: floors[i] }, { kind: k, T: STOP[k], floor: floors[i] }); from = floors[i]; });
  out.push({ kind: 'down', T: ROOM.down, from, to: 1 }, { kind: 'open', T: ROOM.doorOpen, floor: 1 });
  return out;
}
// 楼梯间：楼梯子路段里单独排一段随机障碍（入口后 stairsIn、出口前 stairsOut 秒路程不放），零钱照常沿跳跃弧线摆
function stairsSeg(lv, def, r) {
  const st = lv.stageAt(def.door + 41), obstacles = [], pickups = [];
  if (st.x1 <= def.door + 41) return { obstacles, pickups };
  const x0 = Math.max(st.x0, def.door + 40) + ROOM.stairsIn * speedAt(st.x0), x1 = def.exit - ROOM.stairsOut * speedAt(def.exit);
  genSegment(r, lv, { x0, x1 }, [], () => true, obstacles, { prev: null, sameRun: 0 });
  arcCoins(r, obstacles, pickups);
  for (const o of obstacles) { o.branch = 'stairs'; delete o.id; }
  return { obstacles, pickups };
}
// 路线卡选定以后把这条路装上（只装一次）：楼梯间的障碍按 x 插进 course.obstacles（id 接在主路线后面），电梯打开门前 ▶▶ 区。
// 插进去的都在主角前面（路线卡的窗口在门前区之前结束），obIdx / pkIdx 不用动
export function installBranch(course, route) {
  const b = course.branch;
  if (!b || b.route) return false;
  b.route = route;
  const seg = b.segs[route] || b.segs.stairs;
  let id = course.obstacles.reduce((m, o) => Math.max(m, o.id), -1) + 1;
  const ins = (arr, item) => { let i = arr.length; while (i > 0 && arr[i - 1].x > item.x) i--; arr.splice(i, 0, item); };
  for (const o of seg.obstacles) ins(course.obstacles, { ...o, id: id++ });
  for (const p of seg.pickups) ins(course.pickups, { ...p });
  b.zone.off = route !== 'lift';
  return true;
}
// 校验分支（测试用）：节拍总时长 ≤ ROOM.max；分支区里没有主路线的障碍和零钱、没有别的槽（预出现 + 读题窗口）、没有路口；
// 路线卡的窗口在门前区之前结束；楼梯间只出 stairs 池的障碍、都在楼梯间里、间距表成立。返回冲突列表
export function checkBranch(course, lv = FULL) {
  lv = toLevel(lv);
  const b = course.branch, bad = [];
  if (!b) return bad;
  const span = branchSpan(b), hit = (a0, a1) => a1 > span[0] && a0 < span[1];
  if (b.liftT > ROOM.max + 1e-9) bad.push(`电梯 ${b.liftT.toFixed(2)} 秒`);
  for (const o of course.obstacles) if (!o.branch && hit(o.x, o.x + OBSTACLES[o.type].w)) bad.push(`主路线障碍 ${o.type}@${Math.round(o.x)}`);
  const own = new Set(b.segs.stairs.pickups.map(p => `${p.x}|${p.y}`));
  for (const k of course.pickups) if (hit(k.x - 12, k.x + 12) && !own.has(`${k.x}|${k.y}`)) bad.push(`零钱 @${Math.round(k.x)}`);
  for (const s of lv.slots) {
    const v = speedAt(s.x), w = slotWindow(s, lv), pre = [s.x - Math.max(520, 1.6 * v) - 0.45 * v * 1.04, w[1]];
    if (s.x === b.card) { if (w[1] > b.zone.x0) bad.push('路线卡的窗口压到门前区'); }
    else if (hit(pre[0], pre[1])) bad.push(`槽 ${s.x}`);
  }
  if (!lv.slots.some(s => s.x === b.card && s.kind === 'route')) bad.push('没有路线卡');
  for (const c of course.crossings || []) if (hit(c.w0, c.w1)) bad.push(`路口 ${c.x}`);
  const st = lv.stageAt(b.door + 41), seg = b.segs.stairs.obstacles;
  for (const o of seg) {
    if (!OBSTACLES[o.type].stages.includes('stairs')) bad.push(`楼梯间出了 ${o.type}`);
    if (o.x < Math.max(st.x0, b.door + 40) || o.x + OBSTACLES[o.type].w > b.exit) bad.push(`楼梯间障碍 ${o.type}@${Math.round(o.x)} 出界`);
  }
  if (checkSpacing(seg).length) bad.push('楼梯间间距');
  return bad;
}

// 路口灯态：单独的随机流（调灯不会把整条路洗牌）。按权重抽，红灯超过 maxRed 改成闪绿；红灯等 1.0–1.5 秒
const XLIGHT = { red: () => 'red', green: () => 'green', flash: () => 'flash', worst: i => (i < 2 ? 'red' : 'flash') };
function planCrossings(lv, seed, xlight) {
  const crng = seed != null ? subRng(seed, SALT.cross) : null, W = CROSS.weights;
  let reds = 0;
  return (lv.def.crossings || []).map((c, i) => {
    let light = 'green', wait = CROSS.waitRed[1];
    if (crng) {                                       // 每个路口固定取两次数：写死灯态、调试覆盖都不影响后面路口的抽签
      light = crng.weighted([{ w: W.green, v: 'green' }, { w: W.red, v: 'red' }, { w: W.flash, v: 'flash' }]);
      wait = crng.range(CROSS.waitRed[0], CROSS.waitRed[1]);
      if (light === 'red' && ++reds > CROSS.maxRed) light = 'flash';
    }
    if (c.light) light = c.light;
    if (c.wait != null) wait = c.wait;
    if (XLIGHT[xlight]) light = XLIGHT[xlight](i);
    const [w0, w1] = crossWindow(c);
    return { i, x: c.x, light, wait, w0, w1 };
  });
}

// 校验路口位置（测试用）：路口窗口不碰任何槽的「预出现 + 读题窗口」（再往前留 0.45 秒路程）、不碰蹭车段和分支区、
// 没有手写障碍（关卡的 fixed、新手局的 tutorialFixed：它们不走随机段的避让），两个路口之间至少隔 1.5 秒路程。返回冲突列表
export function checkCrossings(course, lv = FULL) {
  lv = toLevel(lv);
  const bad = [], cs = course.crossings || [];
  const hit = (a, b) => a[1] > b[0] && a[0] < b[1];
  for (const c of cs) {
    const w = [c.w0, c.w1];
    if (lv.themeAt(c.w0) !== lv.themeAt(c.w1)) bad.push({ x: c.x, why: '跨路段' });
    for (const s of lv.slots) {
      const v = speedAt(s.x), pre = [s.x - Math.max(520, 1.6 * v) - 0.45 * v * 1.04, slotWindow(s, lv)[1]];
      if (hit(w, pre)) bad.push({ x: c.x, why: `槽 ${s.x}` });
    }
    for (const r of rideSpans(lv)) if (hit(w, r)) bad.push({ x: c.x, why: '蹭车' });
    const b = lv.def.branch;
    if (b && hit(w, [b.card, b.exit])) bad.push({ x: c.x, why: '分支' });
    for (const f of [...(lv.def.fixed || []), ...(lv.def.tutorialFixed || [])]) if (hit(w, [f.x, f.x + OBSTACLES[f.type].w])) bad.push({ x: c.x, why: `手写障碍 ${f.type}@${f.x}` });
  }
  for (let i = 1; i < cs.length; i++) if (cs[i].x - (cs[i - 1].x + CROSS.zebra) < CROSS.gap * speedAt(cs[i].x)) bad.push({ x: cs[i].x, why: '离上一个路口太近' });
  return bad;
}

// 溅水：街道里一部分水坑原地换成「会被车溅起水墙」的水坑（单独的随机流，不动主路线；位置、宽度、躲法都不变，间距表照样成立）
function splashPuddles(obstacles, lv, srng) {
  for (const o of obstacles) if (o.type === 'puddle' && !o.fixed && lv.themeAt(o.x) === 'street' && srng.chance(TRAFFIC.splash.p)) o.type = 'splash';
}

// 一条随机段：按「到达时间差」排障碍，撞进读题窗口就跳到窗口后面重排，不跨路段。
// fixed：段里和段后的手写障碍（按 x 排好）：候选离下一个手写障碍不够间距（或已经越过它）时，把手写障碍当成「上一个」，从它后面接着排
function genSegment(rng, lv, seg, blocks, free, obstacles, ctx, fixed = []) {
  const push = (type, x, extra = {}) => {
    obstacles.push({ type, x, id: obstacles.length, ...extra });
    ctx.sameRun = ctx.prev && ctx.prev.type === type ? ctx.sameRun + 1 : 0;
    ctx.prev = { type, x };
  };
  const dk = seg.densityK || 1;
  const end = seg.x1 != null ? seg.x1 : lv.end - 260;
  let x = seg.x0, fi = 0;
  while (x < end) {
    const st = lv.stageAt(x), prev = ctx.prev;
    const pool = poolOf(st, lv, seg);
    let type;
    for (let tries = 0; tries < 10; tries++) {
      type = rng.pick(pool);
      if (prev && type === prev.type && ctx.sameRun >= 1) continue;      // 同一种最多连 2 个
      if (prev && OBSTACLES[prev.type].platform && OBSTACLES[type].platform) continue;
      break;
    }
    const t = OBSTACLES[type];
    const v = speedAt(x) * 1.04;
    let nx = x;
    if (prev) nx = Math.max(nx, prev.x + minSpacing(prev.type, type, x));
    nx += rng.range(0, (DENSITY[st.id] ?? DENSITY[lv.themeOf(st)]) * dk * v);
    if (nx + t.w > end) break;
    const f = fixed[fi];
    if (f && nx + minSpacing(type, f.type, nx) > f.x) {
      // 放下去会挤到手写障碍（或者已经越过它了）：手写障碍算「上一个」，从它后面接着排
      ctx.prev = { type: f.type, x: f.x }; ctx.sameRun = 0;
      x = Math.max(x, f.x + OBSTACLES[f.type].w);
      fi++;
      continue;
    }
    if (!free(nx - 20, nx + t.w + 20)) {
      // 撞进了读题窗口：跳到窗口后面重新排
      const b = blocks.find(([x0, x1]) => nx + t.w + 20 > x0 && nx - 20 < x1);
      x = b[1] + 1;
      continue;
    }
    // 障碍换路段时不跨界（一个障碍不要横在两种地面上）
    const st2 = lv.stageAt(nx + t.w);
    if (st2.id !== st.id) { x = st2.x0 + 0.3 * v; continue; }
    push(type, nx, t.vx ? { vx: t.vx } : {});
    x = nx + t.w;
  }
}
// 段内障碍池：按路段 id 查（楼梯间有自己的 stairs 池），查不到按主题；随机段可以再限定种类
function poolOf(st, lv, seg) {
  const by = id => Object.keys(OBSTACLES).filter(k => OBSTACLES[k].stages.includes(id) && !OBSTACLES[k].tutorial && (!seg.pool || seg.pool.includes(k)));
  const p = by(st.id);
  return p.length ? p : by(lv.themeOf(st));
}

// 生成完整条路之后，把预留区间里的障碍和拾取物剔掉（和新手局替换开头一段是同一个做法；家庭剧本的拾取物空地用它）。
// rng 消耗不变：区间外的路和同种子的平常日逐个相同；只删不加，间距只会变大
export function carve(course, spans) {
  if (!spans || !spans.length) return course;
  const inSpan = (a, b) => spans.some(([p, q]) => b > p && a < q);
  course.obstacles = course.obstacles.filter(o => !inSpan(o.x - 20, o.x + OBSTACLES[o.type].w + 20));
  course.pickups = course.pickups.filter(k => !inSpan(k.x - 12, k.x + 12));
  course.obstacles.forEach((o, i) => { o.id = i; });
  return course;
}

// 车流（纯画面）不生成的地方：路口窗口、▶▶ 区 ±60px。[a, b] 是镜头看得到的世界区间
export function trafficQuiet(course, a, b) {
  const q = TRAFFIC.quiet.zone;
  if ((course.crossings || []).some(c => c.w1 > a && c.w0 < b)) return true;
  return (course.zones || []).some(z => z.x1 + q > a && z.x0 - q < b);
}

// 运行时：移动障碍此刻的位置（按主角离相遇点多远倒推）
export function obstacleX(o, playerX) {
  if (!o.vx) return o.x;
  const dx = o.x - playerX;
  return o.x + o.vx * dx / speedAt(playerX);
}

// 画面用的进度（纯函数，只看主角离它多远：同一个位置永远同一个画面，不挂真实时间）
const clamp01 = u => Math.max(0, Math.min(1, u));
// 违停车车门开度（横向缩放 0.15 → 1，铰链在左缘）：主角离车门 pop × v 时开始甩开，再走 0.2 × v 全开（v 按车门处的速度）
export function doorOpenK(o, playerX) {
  const v = speedAt(o.x), d = o.x - playerX, pop = OBSTACLES[o.type].pop || 1.1;
  return 0.15 + 0.85 * clamp01((pop * v - d) / (0.2 * v));
}
// 溅水：warn（主角离水坑 ≤ warn×v 之后为 true：水面闪白预告）、车离压水坑还差多远 ahead（世界 px，> 0 = 还在水坑右边开过来，
// 按「主角每跑 1px、车开 car/v px」换算，主角停下车也停）、水墙升起 rise（压到后 0.12×v 内升满）、主角跑过去以后 0.3×v 内淡出 fade
export function splashState(o, playerX) {
  const v = speedAt(o.x), d = o.x - playerX, S = TRAFFIC.splash;
  const warn = d <= S.warn * v && d > S.hit * v;
  const ahead = (d - S.hit * v) * S.car / v;
  const rise = clamp01((S.hit * v - d) / (0.12 * v));
  const fade = 1 - clamp01((playerX - (o.x + OBSTACLES[o.type].w)) / (0.3 * v));
  return { warn, ahead, rise, fade, v };
}

// 校验：相邻障碍是否满足最小间距（测试用）
export function checkSpacing(list) {
  const bad = [];
  for (let i = 1; i < list.length; i++) {
    const need = minSpacing(list[i - 1].type, list[i].type, list[i - 1].x) / 1.04;
    const have = list[i].x - list[i - 1].x;
    if (have < need - 0.5) bad.push({ i, a: list[i - 1].type, b: list[i].type, have: Math.round(have), need: Math.round(need) });
  }
  return bad;
}

// 镜头里能往前看多远（世界 px）
export function lookAhead(v) { return (375 - TUNE.playerX) / zoomAt(v); }
