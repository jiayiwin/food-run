// 家庭剧本：抽家庭、门口出题、来电、交代家务、货架、拾取物、晚饭、称号、饭桌一句、结算摘要。
// run.js / choice.js 只通过下面的 story 对象调用；这里的函数都不碰 run.rng：同种子同故事 → 同一局。
// 故事 'parents.normal'（爸妈家 · 平常日）就是接入前的妈妈：来电、晚饭公式、菜名、称号都一样（门口出题按定稿扩充过，见 js/data/family.js）。
import { FAMILIES, ERRANDS, MEMBERS, SITUATIONS, WEAK, HOME_CALL, ERRAND_CALL, ERRAND_EFFECT, FAMILY_TITLES, DEFAULT_STORY, DOOR_MARKS } from '../data/family.js';
import { TIPS } from '../data/events.js';
import { speedAt } from '../data/tune.js';
import { subRng, SALT } from '../core/rng.js';
import { runTime } from './level.js';

// ── 故事 ───────────────────────────────────────────────────────────
// key = '家庭.故事'（例如 'parents.soy'）；不认识的键返回 null
export function storyOf(key) {
  const [f, s, more] = String(key || '').split('.');
  if (more !== undefined) return null;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fam = own(FAMILIES, f) ? FAMILIES[f] : null, st = fam && own(fam.stories, s) ? fam.stories[s] : null;
  if (!st) return null;
  return { key: `${f}.${s}`, fam, st, errand: st.errand ? ERRANDS[st.errand] : null };
}
export const storyKeys = () => Object.values(FAMILIES).flatMap(f => Object.keys(f.stories).map(s => `${f.id}.${s}`));
// 能通过自由下班 / 今日挑战 / 好友卡出现的故事（关卡专用的 weight 0 不算）
export const isFreeStory = key => { const s = storyOf(key); return !!(s && s.st.weight > 0); };

// ── 抽家庭：自由下班按这一局的种子；今日挑战按当天的种子（周五心情那天全国回奶奶家，其他日子不抽奶奶家）──
const pickW = (r, list) => { let x = r * list.reduce((a, [, w]) => a + w, 0); for (const [k, w] of list) { x -= w; if (x < 0) return k; } return list[list.length - 1][0]; };
export function familyOf(seed, { daily = false, mod = null } = {}) {
  let fams = Object.values(FAMILIES).map(f => [f.id, f.weight]);
  if (daily) fams = mod && mod.id === 'friday' ? [['nainai', 1]] : fams.filter(([id]) => id !== 'nainai');
  const fid = pickW(subRng(seed, SALT.family).next(), fams);
  const sts = Object.entries(FAMILIES[fid].stories).filter(([, st]) => st.weight > 0).map(([id, st]) => [id, st.weight]);
  return `${fid}.${pickW(subRng(seed, SALT.story).next(), sts)}`;
}
// 场景层开局时调一次：关卡写死 > 今日挑战按日期（不看好友卡的 h）> 好友卡带的 h > 自由下班按种子。
//   好友卡没有 h（老版本）、h 不认识、h 是关卡专用的故事：按接入前的老样子跑爸妈家平常日
export function resolveStory({ seed, daily = false, mod = null, level = null, friend = null }) {
  const lk = level && level.story && level.story.key;
  if (lk) return lk;
  if (daily) return familyOf(seed, { daily: true, mod });
  if (friend) return isFreeStory(friend.h) ? storyOf(friend.h).key : DEFAULT_STORY;
  return familyOf(seed);
}
// 好友卡带来的 h 这边认不认识（不认识的卡片上加一行「成绩仅供参考」）
export const friendHomeKnown = friend => !friend || !friend.h || isFreeStory(friend.h);

// ── 来电：第 n 个来电槽是不是家人、说什么。效果所有家庭都是同一个常量 HOME_CALL ──
export const callForced = (story, n) => !!(story.errand && story.errand.give.by === 'call' && n === 0);
export function callerFor(story, n) {
  const { fam, errand } = story, forced = callForced(story, n);
  const who = forced ? errand.from : fam.caller.who;
  const c = fam.caller.who === who ? fam.caller : { who, line: '' };
  return {
    who, name: c.name || MEMBERS[who].name, line: forced ? errand.give.line : c.line, errand: forced ? errand.id : null,
    pick: { text: '接', react: forced ? ERRAND_CALL.pick : c.pick, eff: HOME_CALL.pick },
    hang: { text: '挂', react: forced ? ERRAND_CALL.hang : c.hang, eff: HOME_CALL.hang },
  };
}

// ── 门口：关卡 / 故事指定 > 钩子 > 家庭强情况（按性格排序）> 弱情况按种子轮换 ──
export function doorQuestion(story, s) {
  const { fam, st, errand } = story;
  for (const [k, qq, dinner] of st.door || []) if (SITUATIONS[k](s)) return { key: `story:${k}`, who: qq.who || fam.door[0], q: qq, dinner: dinner || null };
  if (errand) { const k = s.errand === 'done' ? 'done' : 'miss', qq = errand.door[k]; return { key: `errand:${k}`, who: qq.who || errand.from, q: qq, dinner: null }; }
  for (const k of fam.order) if (fam.questions[k] && SITUATIONS[k](s)) return { key: k, who: fam.questions[k].who || fam.door[0], q: fam.questions[k], dinner: null };
  const weak = WEAK.filter(k => fam.questions[k] && SITUATIONS[k](s));
  const k = weak[Math.floor(subRng(s.seed, SALT.door).next() * weak.length)];
  return { key: k, who: fam.questions[k].who || fam.door[0], q: fam.questions[k], dinner: null };
}
// 门口答题人能不能提前知道（画面用：家门口的人从回家路段一出来就站对，不用等预出题那一刻再换人）。
//   按 doorQuestion 的顺序走一遍所有可能：故事 / 关卡写死的题（碰到一定成立的 always、或 intact 和 broken 两头都写了就到头），
//   有钩子时钩子的两道题兜底，没有就是家庭的全部题。可能的答题人只有一个 → 他；不止一个 → null
export function doorAsker(story) {
  const { fam, st, errand } = story, who = new Set(), seen = new Set();
  for (const [k, qq] of st.door || []) {
    who.add(qq.who || fam.door[0]); seen.add(k);
    if (k === 'always' || (seen.has('intact') && seen.has('broken'))) return who.size === 1 ? [...who][0] : null;
  }
  if (errand) for (const qq of Object.values(errand.door)) who.add(qq.who || errand.from);
  else for (const qq of Object.values(fam.questions)) who.add(qq.who || fam.door[0]);
  return who.size === 1 ? [...who][0] : null;
}
// 预计到家时刻（分钟）：给定时钟 + 从这里跑到家的纯跑时间。只看位置：同一个位置、同一个时钟永远同一个值。
// 门口快照（晚到 / 早到 / 失约）和 HUD 上的截止便签都用它，所以便签变灰和门口追问对得上
export function etaMin(run, clock) {
  const lv = run.lv, end = lv.end - 20;
  return clock + (run.x < end ? runTime(lv, run.x, end) : 0) * lv.clockRate / 60;
}
// 门口快照：在门口终题预出题时（离门约 1.6 秒）拍一次
export function doorSnapshot(run, clockMin) {
  return {
    flags: run.flags, clockMin: etaMin(run, clockMin), par: run.par.min, home: run.lv.def.par.home, sat: run.sat, boxes: run.boxes,
    shops: run.stats.shops, rides: run.stats.rides, wet: !!run.flags.splashed,          // 湿身只认被车溅（普通水坑太常见，会把这道题顶成最常见的一道）
    errand: run.fam.errand ? run.fam.errand.state : null, seed: run.seed,
  };
}

// ── 晚饭：mealTier()（时间档 + 原有加减）之后剧本再调一次：钩子办了 +1、忘了最高 2 档；序章保底 ──
export function mealAdjust(story, tier, errandState) {
  if (story.errand) {
    const e = ERRAND_EFFECT[errandState === 'done' ? 'done' : 'miss'];
    tier = Math.max(0, Math.min(3, tier + (e.mood || 0)));
    if (e.cap != null) tier = Math.min(tier, e.cap);
  }
  if (story.st.mealMin != null) tier = Math.max(tier, story.st.mealMin);
  return tier;
}
export function mealFor(story, tier, takeout) {
  if (takeout && tier <= 1) return { ...story.fam.takeout, tier };
  const m = (story.st.meals && story.st.meals[tier]) || story.fam.meals[tier];
  return { ...m, tier };
}
// 饭桌一句：故事指定 > 钩子结果 > 门口答坏 > 晚饭 ≥2 档 > 平常
export function dinnerLine(story, { door, errand, tier }) {
  if (door && door.dinner) return door.dinner;
  if (story.errand) return story.errand.dinner[errand === 'done' ? 'done' : 'miss'];
  const d = story.fam.dinner;
  if (door && door.good === false) return d.bad;
  return tier >= 2 ? d.top : d.any;
}
// 称号：钩子称号插在通用称号前 4 条（稀有）之后；家庭称号插在「人形外卖」之前（见 run.js 的 finish）
export function famTitles(story) {
  return {
    errand: story.errand ? [{ name: story.errand.title, test: f => f.errand === 'done' }] : [],
    family: [...(story.fam.titles || []), ...(story.errand ? FAMILY_TITLES : [])],
  };
}
// 某个家里的某个人（cast 覆盖身份小字）
export function memberOf(story, who) { const m = MEMBERS[who]; return m ? { ...m, ...((story && story.fam.cast && story.fam.cast[who]) || {}) } : null; }
// 门口结果角标：答好「开饭！」、中「还行」、答坏每家不同
export const doorMark = (story, good) => (good === true ? DOOR_MARKS.good : good === 'mid' ? DOOR_MARKS.mid : story.fam.marks.bad);

// ── 一局里的钩子状态（只读写 run.fam，不碰 run.rng）──────────────────
//   run.fam = { errand: { id, state: 'none' | 'todo' | 'done', missed, by } | null, door, deadline, pickX }
export function makeFam(story) {
  const e = story.errand;
  return { errand: e ? { id: e.id, state: e.give.by === 'start' ? 'todo' : 'none', missed: false, by: null } : null, door: null, deadline: null, pickX: null };
}
export const errandOpen = run => !!(run.fam.errand && run.fam.errand.state === 'todo');
function tip(run, key) { if (run.tipFn) run.tipFn(key, TIPS[key]); }
export function assignErrand(run, missed) {
  const e = run.fam.errand;
  if (!e || e.state !== 'none') return false;
  e.state = 'todo'; e.missed = !!missed;
  run.fx.push({ type: 'errandGive', id: e.id, missed: !!missed });
  tip(run, 'errand');
  return true;
}
export function fulfilErrand(run, by) {
  const e = run.fam.errand;
  if (!e || e.state !== 'todo') return false;
  e.state = 'done'; e.by = by;
  run.fx.push({ type: 'errandDone', id: e.id, by, name: run.story.errand.name });
  return true;
}
// 还有没有能办的地方：店里办的看后面还有没有没开过的便利店；跳起来够的看拾取物过没过
export function errandLeft(run) {
  if (!errandOpen(run)) return false;
  const d = run.story.errand;
  if (d.carrier.kind === 'store') return run.lv.slots.some((s, i) => s.kind === 'store' && (i >= run.slotIdx || (run.choice && run.choice.kind === 'store'))) || !!run.shop;
  return run.fam.pickX != null && run.x < run.fam.pickX + 20;
}
// 离下一个能办的地方还有几秒路程（HUD 便签跳动、提示音用）；没有 = Infinity
export function errandAhead(run) {
  if (!errandOpen(run)) return Infinity;
  const d = run.story.errand, v = Math.max(1, speedAt(run.x));
  if (d.carrier.kind === 'pickup') return run.fam.pickX != null && run.fam.pickX > run.x ? (run.fam.pickX - run.x) / v : Infinity;
  const s = run.lv.slots.slice(run.slotIdx).find(s => s.kind === 'store');
  return s ? (s.x - run.x) / v : Infinity;
}
// 便利店：有店里能办的待办时，货架第 3 格（原来的能量饮料）换成家里要的；进店卡的台词也换成它
export function shopItems(run, base) {
  const items = base.slice(), d = run.story.errand;
  if (errandOpen(run) && d.carrier.kind === 'store') { items[2] = { ...d.carrier.item, sat: 0, fam: d.id }; tip(run, 'errandStore'); }
  return items;
}
export function storeLine(run, base) {
  const d = run.story.errand;
  return errandOpen(run) && d.carrier.kind === 'store' ? `${d.carrier.item.note}：${d.carrier.item.name}` : base;
}
// 位置锚点：'stage:<路段 id>:<比例>'；落在任何读题窗口 / 路口 / 分支区里就往后挪出去
export function anchorX(at, lv, blocks = []) {
  const [kind, a, b] = String(at).split(':');
  if (kind !== 'stage') return null;
  const s = lv.stages.find(s => s.id === a);
  if (!s) return null;
  let x = s.x0 + Number(b) * (s.x1 - s.x0);
  for (let i = 0; i < 20; i++) { const bl = blocks.find(([p, q]) => x >= p && x <= q); if (!bl) break; x = bl[1] + 1; }
  return x;
}
export const PICKUP_PAD = [0.9, 1.0];     // 拾取物前 / 后这么多秒路程不放障碍（跳起来够它不会撞上别的，也不会跳别的顺手捞到）
const padOf = x => { const v = speedAt(x) * 1.04; return [x - PICKUP_PAD[0] * v, x + PICKUP_PAD[1] * v]; };
// 拾取点和它的空地：空地和所有窗口（读题、路口、分支区）都不重叠，重叠就往后挪
export function famReserve(story, lv, blocks) {
  const d = story.errand;
  if (!d || d.carrier.kind !== 'pickup') return { reserve: [], x: null };
  let x = anchorX(d.carrier.at, lv, blocks);
  for (let i = 0; i < 20 && x != null; i++) {
    const [p, q] = padOf(x), bl = blocks.find(([a, b]) => b >= p && a <= q);
    if (!bl) break;
    x = bl[1] + PICKUP_PAD[0] * speedAt(bl[1]) * 1.04 + 1;
  }
  return x == null || x > lv.end - 400 ? { reserve: [], x: null } : { reserve: [padOf(x)], x };
}
// 开局时把拾取物摆上路（空地已经由 carve 剔好）；离它 60px 内的零钱 / 包子删掉，免得一跳两得
export function placeErrandPickup(course, story, x) {
  if (x == null) return;
  course.pickups = course.pickups.filter(k => Math.abs(k.x - x) > 60);
  course.pickups.push({ kind: 'errand', id: story.errand.id, shape: story.errand.carrier.shape, x, y: -88 });
  course.pickups.sort((a, b) => a.x - b.x);
}

// ── 结算摘要（结果里的 family 字段）──────────────────────────────────
export function famSummary(run, { tier, grade, broken, win, reason }) {
  const { key, fam, st, errand } = run.story, d = run.fam.door, e = run.fam.errand;
  const es = e ? (e.state === 'done' ? 'done' : 'miss') : null;
  return {
    key, id: fam.id, name: fam.name, storyName: st.name, line: run.famLine,
    door: d, errand: e ? { id: e.id, name: errand.name, state: es, share: errand.share[es] } : null,
    dinner: win ? dinnerLine(run.story, { door: d, errand: es, tier }) : '',
    away: win ? '' : fam.away[reason === 'starve' ? 'starve' : 'caught'],
    share: fam.share, guests: st.guests || [],
    t: { good: d ? d.good : null, key: d ? d.key : null, errand: es, tier, grade, broken, happy: !!run.flags.momHappy },   // 称号判定用
  };
}

// ── 接入点：run.js / choice.js 只通过它调用 ─────────────────────────────
export const story = {
  pickCaller: (run, slot) => slot.caller || (callForced(run.story, run.callers.length) ? 'mom' : null),   // null = 走原来的随机抽签（rng 调用次数不变）
  caller: (run, n) => callerFor(run.story, n),                       // 'mom' 是「家里来电」的历史名，打来的是谁由故事决定
  door: (run, clockMin) => doorQuestion(run.story, doorSnapshot(run, clockMin)),
  introLine: run => (run.quiet ? null : run.story.st.intro || null),  // [成员 id, 一句话]；好友卡带来的新玩家第一局不显示
  onCall(run, c, i) {                                                // 接 / 挂完家里来电：交代家务（挂了也记下）、失约截止时间
    if (c.caller !== 'mom') return;
    if (c.errand) assignErrand(run, i !== 0);
    if (i === 0 && run.story.fam.order.includes('promise') && run.fam.deadline == null) {
      run.fam.deadline = run.par.min + run.lv.def.par.home.promise;
      tip(run, 'promise');
    }
  },
  shopItems,
  storeLine,
  onBuy(run, it, i) {                                                // 家里要的：扣钱；不加饱腹、不加时钟分钟、不计入 shops
    if (!it.fam) return false;
    const s = run.shop;
    run.money -= it.price; run.stats.famBuys = (run.stats.famBuys || 0) + 1;
    fulfilErrand(run, 'store');
    s.picked = i; s.closeT = 0.55;
    run.fx.push({ type: 'buy', item: it.id, fam: true });
    return true;
  },
  onPickup: (run, pk) => (errandOpen(run) ? fulfilErrand(run, 'pickup') : false),   // 还没交代 / 已经办了：不收
  step(run) {                                                        // 每帧（世界在走时）：离下一个能办的地方还有 2 秒路程，HUD 便签跳一下、叮一声
    if (!errandOpen(run)) return;
    const a = errandAhead(run);
    if (a > 2) return;
    const d = run.story.errand, at = d.carrier.kind === 'pickup' ? run.fam.pickX : (run.lv.slots.slice(run.slotIdx).find(s => s.kind === 'store') || {}).x;
    if (run.fam.nearAt === at) return;
    run.fam.nearAt = at; run.fam.nearT = run.t;
    run.fx.push({ type: 'errandNear', id: d.id });
    if (d.carrier.kind === 'pickup') tip(run, 'errandJump');
  },
  mealAdjust: (run, tier) => mealAdjust(run.story, tier, run.fam.errand && run.fam.errand.state),
  titles(run, base) {                                                // 称号表：稀有通用 4 条 → 钩子 → 性格 5 条 → 家庭 → 人形外卖 / 准点下班人
    const ft = famTitles(run.story), wrap = l => l.map(t => ({ name: t.name, fam: true, test: x => !!(x.fam && t.test(x.fam.t)) }));
    if (!ft.errand.length && !ft.family.length) return base;
    return [...base.slice(0, 4), ...wrap(ft.errand), ...base.slice(4, 9), ...wrap(ft.family), ...base.slice(9)];
  },
  summary: (run, res) => famSummary(run, res),
};
// 路线：生成完整条路之后要剔掉的区间（拾取物空地）。顺手把拾取点记在 run.fam.pickX（makeRun 摆拾取物用）
export function storySpans(run, lv, blocks) {
  const r = famReserve(run.story, lv, blocks);
  run.fam.pickX = r.x;
  return r.reserve;
}
