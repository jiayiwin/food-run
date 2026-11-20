// 关卡上下文：把关卡数据（js/data/levels.js）变成路线生成、运行、渲染都要用的查询函数。
// 全程关是缺省值：course.js / run.js 的旧签名不传关卡时就按全程关算，结果和关卡数据化之前逐字节一样。
import { CHOICE, CLOCK, PAR, RES, speedAt } from '../data/tune.js';
import { LEVELS, LEVEL_ORDER, levelOf } from '../data/levels.js';

const themeKey = s => s.theme || s.id;          // 读题时间、放慢、背景按主题查（楼梯间按公司算）
const DEFAULTS = {
  x0: 0, gen: [], fixed: [], tutorialSpan: null, tutorialFixed: [], crossings: [], branch: null, traffic: true,
  seed: null, clockRate: null, teach: [], learn: [], rules: {}, dusk: [0.02, 0.72], stars: null, story: {},
};
const PAR_DEFAULT = { slack: 0, grade: [3, 11, 23], meal: [3, 13, 26], target: 11, star: 3, home: { early: 0, promise: 7, late: 11 } };
// 定格教学的种类 → 存档里「学会了」的键（学过的不再定格）
export const TEACH_KEY = { choose: 'choose', jump: 'jump', slide: 'slide', dash: 'dash', lift: 'lift', crossdash: 'cross' };
// 按一周通勤的进度，这一关该不该已经提到某个机制（learn 的键）：本关或前面的关学它才算。每关只教一样新东西，
// 后面关卡的东西别提前提示（周一不提冲刺）。全程关（软版本：玩家可能一关都没打过）和一周通勤以外的关卡一律算该提
export function dueAt(lv, key) {
  const i = LEVEL_ORDER.indexOf(lv.id);
  return i < 0 || LEVEL_ORDER.slice(0, i + 1).some(id => (LEVELS[id].learn || []).includes(key));
}

// [a, b) 这段路纯跑要多少世界秒：每 5px 一步，按步中点的速度算，路段有跑速系数（slowK）的按系数放慢
export function runTime(lv, a, b) {
  const h = PAR.step;
  let t = 0;
  for (let x = a; x < b; x += h) t += Math.min(h, b - x) / (speedAt(x + h / 2) * (lv.stageAt(x).slowK || 1));
  return t;
}

export function makeLevel(raw) {
  const def = { ...DEFAULTS, ...raw, par: { ...PAR_DEFAULT, ...(raw.par || {}) } };
  const st = def.stages, x0 = def.x0;
  const stageAt = x => { for (let i = st.length - 1; i >= 0; i--) if (x >= st[i].x0) return st[i]; return st[0]; };
  const lv = {
    def, id: def.id, x0, end: def.end, stages: st, slots: def.slots,
    stageAt,
    themeAt: x => themeKey(stageAt(x)),
    themeOf: themeKey,
    // 某个位置的读题时间（真实秒）：按主题查表，在路段内线性插值
    choiceTime(x, revisit = false) {
      const s = stageAt(x), [a, b] = CHOICE.time[themeKey(s)];
      const k = Math.max(0, Math.min(1, (x - s.x0) / (s.x1 - s.x0)));
      const T = a + (b - a) * k - (revisit ? CHOICE.revisitMinus : 0);
      return Math.max(CHOICE.minTime, T);
    },
    // 天色：按路线位置插值（不跟着时钟走，撞了几下天也不会突然黑）
    duskAt: x => def.dusk[0] + (def.dusk[1] - def.dusk[0]) * Math.max(0, Math.min(1, (x - x0) / (def.end - x0))),
  };
  // 本关「标准时长」：起步损失 + 纯跑到家。时钟倍率按它缩放：每关纯跑一遍都走过约 46.6 游戏分钟（18:46 前后到家）
  lv.runT = runTime(lv, x0, def.end - 20);
  lv.pureT = PAR.startLoss + lv.runT;
  lv.clockRate = def.clockRate || (PAR.refMin * 60) / lv.pureT;
  lv.clockK = lv.clockRate / RES.clockRate;   // 罚时分钟数的缩放系数：全程关正好 1
  lv.clockStart = def.clockStart != null ? def.clockStart : CLOCK.start;
  return lv;
}

// 星级（关卡）：★1 到家；★2 到家时刻取整分钟 ≤ 标准 + par.star，且碎饭盒 ≤ 1；★3 本关绝活（stars[2].test(stats)）。
// 三颗各自独立判定，没到家一颗都不亮；带薪摸鱼这一局 ★3 不点亮（最多两星）。全程关没有星级（null）
export function starsOf(lv, res, { assist = false } = {}) {
  const def = lv.def;
  if (!def.stars) return null;
  const win = !!(res && res.win);
  const s2 = win && Math.floor(res.arrival) <= res.par + def.par.star && res.broken <= 1;
  const t3 = def.stars[2] && def.stars[2].test;
  const s3 = win && !assist && !!(t3 && t3(res.stats));
  return [win, s2, s3];
}
// 进入这个路段要不要弹路段字卡：小路段（楼梯间之类，minor）不弹
export const stageBanner = (lv, id) => { const s = lv.stages.find(st => st.id === id); return !(s && s.minor); };
// ★2 的准点线（分钟）：结算页写「18:50 内到家」（到家时刻取整分钟 ≤ 这条线就算，18:50:59 也算）
export const starLine = (lv, par) => par + lv.def.par.star;

const cache = new Map();
export const LV = id => { if (!cache.has(id)) cache.set(id, makeLevel(levelOf(id))); return cache.get(id); };
export const FULL = LV('full');
// 关卡参数统一入口：关卡 id、关卡数据、makeLevel 的结果都认，不传 = 全程关
export const toLevel = l => (!l || (typeof l !== 'string' && typeof l !== 'object') ? FULL : typeof l === 'string' ? LV(l)
  : l.def && l.stageAt ? l : LEVELS[l.id] === l ? LV(l.id) : makeLevel(l));
