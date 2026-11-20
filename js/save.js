// 本地存档：设置、纪录、每日挑战、新手引导、看过的提示、关卡（星级、解锁、连败）。格式和迁移在 core/savefmt.js（纯函数）。
import { storage } from './platform/index.js';
import { daySeed } from './core/rng.js';
import { ALBUM_KEYS } from './data/album.js';
import { levelDef } from './data/levels.js';
import { migrate, recordLevel, recordHome, DEFAULT } from './core/savefmt.js';

const KEY = 'kbdgr_save_v1';                // 键名不变：旧版本回滚后读到 v2 存档也能玩（只是忽略新字段）
let keep = true;                            // 调试用的假存档（?save=new|old）不写回本地

export const save = migrate(storage.get(KEY, null));

export function persist() { if (keep) storage.set(KEY, save); }

// 调试：?save=new 当成新玩家、?save=old 当成 v1 的老玩家（只在内存里，不覆盖真存档）
export function debugSave(kind) {
  const d = kind === 'new' ? null : kind === 'old' ? { runs: 12, wins: 9, best: { arrival: 1130.2, text: '18:50', grade: 'S', score: 12000 }, tutorialDone: true, tips: ['chase', 'tired'], album: [], settings: { mute: false, vibrate: true } } : undefined;
  if (d === undefined) return false;
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, migrate(d));
  keep = false;
  return true;
}

export function dateKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// 一局结束：更新纪录，返回结算页要的标记（新纪录、图鉴新增、新点亮的星、刚解锁的关卡 / 自由下班、连败次数）。
// 一局只调一次（play.js 的 record()：正常结算、到家演出 / 失败卡期间暂停后回首页或重开，都走它）
//   全程关（自由下班、今日挑战、好友卡）照旧更新最快到家、今日挑战；关卡更新 levels[id]（星级并集、最好成绩、连败）
export function recordResult(res, seenTips, said = []) {
  save.runs++;
  save.tips = [...new Set([...save.tips, ...seenTips])];
  let flags = {};
  const had = save.album.length;
  save.album = [...new Set([...save.album, ...said.filter(k => ALBUM_KEYS.has(k))])];
  recordHome(save, res);                              // 回过哪个家（借口图鉴「还没回过这个家」）
  const level = res.level || 'full';
  const def = levelDef(level);
  if (def) {
    if (res.win) save.wins++;
    flags = recordLevel(save, res, def.learn || []);
  } else if (res.win) {
    save.wins++;
    save.tutorialDone = true;
    if (!save.best || res.arrival < save.best.arrival) { save.best = { arrival: res.arrival, text: res.arrivalText, grade: res.grade, score: res.score }; flags.bestTime = true; }
    if (res.daily && res.seed === daySeed()) {          // 过期的「今日挑战」种子不算今天的纪录
      const k = dateKey();
      if (!save.daily || save.daily.date !== k || res.arrival < save.daily.arrival) { save.daily = { date: k, arrival: res.arrival, text: res.arrivalText, grade: res.grade }; flags.bestDaily = true; }
    }
  } else if (save.runs >= 2) save.tutorialDone = true;
  if (save.tutorialDone) save.learned = [...new Set([...save.learned, 'jump', 'slide', 'choose'])];   // 全程关的新手局教过的
  flags.newExcuses = save.album.length - had;
  persist();
  return flags;
}
export { DEFAULT };
