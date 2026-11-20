// 路线快照（黄金快照）的计算部分：tools/golden.mjs 和 test/level.test.js 共用。
//   routes：同种子排出的路（普通局 / 新手局），只看障碍和拾取物的种类、位置
//   bot：几种固定机器人跑完整局的结果（到家时刻、得分、评级、晚饭、称号……），锁住「重构不改玩法」
//   windows：全程关每个选择槽的读题窗口
//   levels：序章、周一到周三（关卡写死了种子，一关一条路）：路线哈希、带薪摸鱼的路线哈希、完美机器人跑一局的结果
//   stories：带拾取物的家庭故事（爸妈家·爸爸的快递、合租屋·帮拿外卖）：拾取点前后的空地是剔掉的，同种子 + 同故事永远同一条路
// 路线有意改动时（加马路、路口、电梯……）：node tools/golden.mjs --write，同时把 COURSE_VERSION +1
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { slotWindow } from '../js/game/course.js';
import { COURSE } from '../js/data/tune.js';
import { LEVEL_ORDER } from '../js/data/levels.js';

export const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];

// FNV-1a 32 位，输出 8 位十六进制
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const r2 = v => Math.round(v * 100) / 100;
// 一条路的哈希：障碍 [种类, x, 教学] + 拾取物 [种类, x, y]，位置保留两位小数；有电梯 / 楼梯分支的再加上开局排好的
// 停层节拍和楼梯间的障碍、零钱（两条路都排好了，选哪条装哪条）；有路口的再加上每个路口的灯态和红灯等几秒（cv 5 起：
// 灯态也是「同一条路」的一部分，好友卡上同种子的灯不一样就不是同一局）。lights: false 只比障碍和拾取物（测试「调试覆盖灯态不改路」用）
export function courseHash(course, { lights = true } = {}) {
  const b = course.branch, seg = b && b.segs.stairs, xs = lights ? course.crossings || [] : [];
  return fnv(JSON.stringify([
    course.obstacles.map(o => [o.type, r2(o.x), o.teach || '']),
    course.pickups.map(p => [p.kind, r2(p.x), r2(p.y)]),
    ...(b ? [b.beats.map(x => [x.kind, x.floor || x.to || 0]), seg.obstacles.map(o => [o.type, r2(o.x)]), seg.pickups.map(p => [p.kind, r2(p.x), r2(p.y)])] : []),
    ...(xs.length ? [xs.map(c => [c.x, c.light, r2(c.wait)])] : []),
  ]));
}
// 玩家真正跑的那条路：和开局时 makeRun 排出来的一样
export const routeHash = (seed, opts = {}) => courseHash(makeRun({ seed, ...opts }).course);

// 机器人：和 test/run.test.js 同一个随机数（只影响操作误差和思考时间）
export const BOTS = {
  perfect: { skill: 1, choose: 'good' },
  bad: { skill: 1, choose: 'bad' },
  normal: { skill: 0.6, choose: 'smart', think: 1.3 },
  clumsy: { skill: 0.3, choose: 'random', think: 1.6 },
};
export function botResult(seed, botName, runOpts = {}) {
  const run = makeRun({ seed, ...runOpts });
  let r = 0x2545f491 ^ seed;
  const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  const d = simulate(run, makeBot({ rng, ...BOTS[botName] }), { update: updateRun });
  const s = d.stats;
  return [d.win ? d.arrivalText : d.reason, Number(d.arrival.toFixed(6)), d.score, d.grade, d.meal.name, d.title, s.hits, s.caught, s.good, s.choices, s.shops, Math.round(d.x)];
}

export function buildFixture(cv) {
  const fx = { cv, full: {}, tutorial: {}, bot: {}, windows: [], levels: {}, stories: {} };
  for (const seed of SEEDS) {
    fx.full[seed] = routeHash(seed);
    fx.tutorial[seed] = routeHash(seed, { tutorial: true });
    for (const b of Object.keys(BOTS)) fx.bot[`${b}|${seed}`] = botResult(seed, b);
  }
  // 今日挑战（四个词条各一局）和新手局
  for (const seed of [1, 2, 3, 4]) fx.bot[`daily|${seed}`] = botResult(seed, 'perfect', { daily: true });
  for (const seed of [5, 6]) fx.bot[`tutorial|${seed}`] = botResult(seed, 'perfect', { tutorial: true });
  fx.windows = COURSE.slots.map(s => slotWindow(s).map(v => Number(v.toFixed(4))));
  for (const story of ['parents.parcel', 'share.takeaway']) for (const seed of SEEDS) fx.stories[`${story}|${seed}`] = routeHash(seed, { story });
  for (const id of LEVEL_ORDER) {
    fx.levels[id] = routeHash(1, { level: id });
    fx.levels[`${id}|assist`] = routeHash(1, { level: id, assist: true });
    fx.levels[`${id}|perfect`] = botResult(1, 'perfect', { level: id });
  }
  return fx;
}
