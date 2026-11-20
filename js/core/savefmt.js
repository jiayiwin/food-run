// 存档格式 v2 和迁移（纯函数，不碰 platform：node 测试直接调；js/save.js 只负责读写）。
// 键名不变（kbdgr_save_v1）：迁移只加字段、不删旧字段，旧版本读到 v2 存档等于忽略新字段。
import { LEVEL_ORDER } from '../data/levels.js';
import { FAMILIES } from '../data/family.js';

export const SAVE_VER = 2;
export const DEFAULT = {
  ver: SAVE_VER, runs: 0, wins: 0, best: null, daily: null, tutorialDone: false, tips: [], album: [], settings: { mute: false, vibrate: true },
  levels: {},            // { mon: { stars: [true, false, true], best: -0.8, bestText: '18:46', clears: 2, fails: 0, streak: 0, open: true } }
  unlock: { full: false },
  learned: [],           // 学会的机制：jump / slide / choose / chase / cardoor / dash / lift / cross（全程关的软版本、关卡的定格教学看它）
  legacy: false,         // 从 v1 升级来的老玩家：全部解锁，「下班！」保持自由下班
  gender: null,          // 主角性别：null 还没选（一进游戏先到选主角页）/ 'm' / 'f'
  homes: [],             // 回过的家（家庭 id：parents / share / cat / kid / nainai，到家了才算）：借口图鉴「还没回过这个家」看它
};
const clone = v => JSON.parse(JSON.stringify(v));
const uniq = arr => [...new Set(arr)];
const BASIC = ['jump', 'slide', 'choose'];
// 改过字的回答：老存档里的图鉴键换成新键（一人一猫统一叫「罐头」：「先喂猫粮」改成「先喂它」）
const ALBUM_RENAME = { 'juzi:先喂猫粮': 'juzi:先喂它' };
// 没有 homes 的老存档：按图鉴里点亮过谁补（点亮过某个家里人的回答 = 回过他家）。家里人 → 他住的家
const MEMBER_HOME = Object.fromEntries(Object.values(FAMILIES).flatMap(f => f.door.map(m => [m, f.id])));
export const homesFromAlbum = album => uniq(album.map(k => MEMBER_HOME[String(k).split(':')[0]]).filter(Boolean));
// 一局到家：记下回的是哪个家（结果里的 family.id）
export function recordHome(s, res) {
  const id = res && res.win && res.family && res.family.id;
  if (id && !s.homes.includes(id)) s.homes = [...s.homes, id];
}

export function migrate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return clone(DEFAULT);
  const s = {
    ...clone(DEFAULT), ...clone(d),
    settings: { ...DEFAULT.settings, ...(d.settings || {}) },
    levels: clone(d.levels && typeof d.levels === 'object' ? d.levels : {}),
    unlock: { ...DEFAULT.unlock, ...(d.unlock || {}) },
    learned: Array.isArray(d.learned) ? d.learned.slice() : [],
    tips: Array.isArray(d.tips) ? d.tips.slice() : [], album: Array.isArray(d.album) ? uniq(d.album.map(k => ALBUM_RENAME[k] || k)) : [],
  };
  s.homes = Array.isArray(d.homes) ? d.homes.slice() : homesFromAlbum(s.album);
  if (!d.ver) {                                    // v1 → v2：只加字段，不删任何旧字段
    s.ver = SAVE_VER;
    if ((d.runs || 0) > 0) {                       // 老玩家：全部解锁，学过的按全程关算（跳、滑、选、被追）
      s.legacy = true; s.unlock.full = true;
      for (const id of LEVEL_ORDER) s.levels[id] = { ...(s.levels[id] || {}), open: true };
      s.learned = uniq([...s.learned, ...BASIC, 'chase']);
    } else if (d.tutorialDone) s.learned = uniq([...s.learned, ...BASIC]);
  }
  return s;
}

const lvRec = (s, id) => s.levels[id] || null;
export const cleared = (s, id) => !!(lvRec(s, id) && lvRec(s, id).clears > 0);
// 关卡开没开：序章永远开；老玩家全开；其余打完上一关才开
export function isOpen(s, id) {
  const i = LEVEL_ORDER.indexOf(id);
  if (i < 0) return false;
  return i === 0 || !!(lvRec(s, id) && lvRec(s, id).open) || cleared(s, LEVEL_ORDER[i - 1]);
}
// 自由下班：打完周一（第 2 关）解锁；老玩家直接开。今日挑战和好友卡不看这个
export const fullOpen = s => !!s.unlock.full || cleared(s, 'mon');
// 标题页「下班！」去哪：老玩家保持自由下班；新玩家去第一个没打过的关卡，四关都打完了去自由下班
export function mainTarget(s) {
  if (s.legacy) return 'full';
  return LEVEL_ORDER.find(id => !cleared(s, id)) || 'full';
}
export const nextLevel = id => { const i = LEVEL_ORDER.indexOf(id); return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null; };
export const starCount = (s, id) => ((lvRec(s, id) && lvRec(s, id).stars) || []).filter(Boolean).length;
// 带薪摸鱼能不能开：同一关连败 n 次
export const assistOffer = (s, id, n = 2) => !!(lvRec(s, id) && (lvRec(s, id).streak || 0) >= n);

// 关卡一局结束（纯函数，改 s）：通关数、星级（三位取历史并集）、最好成绩（到家 − 标准，分钟；摸鱼局不算）、连败、开关（通关 = 开）；通关后把本关教的并进 learned。
// learn：本关通关后学会的机制。返回结算页要的标记：新点亮几颗星、是不是新纪录、刚解锁的下一关 / 自由下班
export function recordLevel(s, res, learn = []) {
  const id = res.level;
  if (!LEVEL_ORDER.includes(id)) return {};
  const wasFull = fullOpen(s), next = nextLevel(id), wasNext = next ? isOpen(s, next) : true;
  const L = s.levels[id] = { stars: [false, false, false], best: null, bestText: null, clears: 0, fails: 0, streak: 0, ...(s.levels[id] || {}) };
  const flags = { newStars: 0 };
  if (res.win) {
    L.clears = (L.clears || 0) + 1; L.streak = 0;
    L.open = true;                                  // 好友卡打通了还锁着的关：之后选关页也开着
    const got = res.stars || [true, false, false];
    const old = (L.stars || []).slice(0, 3);
    L.stars = [0, 1, 2].map(i => !!(old[i] || got[i]));
    flags.newStars = L.stars.filter(Boolean).length - old.filter(Boolean).length;
    // 带薪摸鱼的成绩不进最好成绩（障碍少、读题长，不是同一条路）
    if (!res.assist && (L.best == null || res.vsPar < L.best)) { if (L.best != null) flags.bestLevel = true; L.best = +res.vsPar.toFixed(3); L.bestText = res.arrivalText; }
    s.learned = uniq([...(s.learned || []), ...learn]);
    if (BASIC.every(k => s.learned.includes(k))) s.tutorialDone = true;
  } else {
    L.fails = (L.fails || 0) + 1; L.streak = (L.streak || 0) + 1;
  }
  if (!wasFull && fullOpen(s)) flags.unlockFull = true;
  if (next && !wasNext && isOpen(s, next)) flags.unlockNext = next;
  flags.streak = L.streak;
  return flags;
}
