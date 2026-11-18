// 本地存档：设置、纪录、每日挑战、新手引导、看过的提示。
import { storage } from './platform/index.js';
import { daySeed } from './core/rng.js';
import { ALBUM_KEYS } from './data/album.js';

const KEY = 'kbdgr_save_v1';
const DEFAULT = { runs: 0, wins: 0, best: null, daily: null, tutorialDone: false, tips: [], album: [], settings: { mute: false, vibrate: true } };

export const save = (() => {
  const d = storage.get(KEY, null);
  return d ? { ...DEFAULT, ...d, settings: { ...DEFAULT.settings, ...(d.settings || {}) } } : { ...DEFAULT };
})();

export function persist() { storage.set(KEY, save); }

export function dateKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// 一局结束：更新纪录，返回「新纪录」标记
export function recordResult(res, seenTips, said = []) {
  save.runs++;
  save.tips = [...new Set([...save.tips, ...seenTips])];
  const flags = {};
  const had = save.album.length;
  save.album = [...new Set([...save.album, ...said.filter(k => ALBUM_KEYS.has(k))])];
  flags.newExcuses = save.album.length - had;
  if (res.win) {
    save.wins++;
    save.tutorialDone = true;
    if (!save.best || res.arrival < save.best.arrival) { save.best = { arrival: res.arrival, text: res.arrivalText, grade: res.grade, score: res.score }; flags.bestTime = true; }
    if (res.daily && res.seed === daySeed()) {          // 过期的「今日挑战」种子不算今天的纪录
      const k = dateKey();
      if (!save.daily || save.daily.date !== k || res.arrival < save.daily.arrival) { save.daily = { date: k, arrival: res.arrival, text: res.arrivalText, grade: res.grade }; flags.bestDaily = true; }
    }
  } else if (save.runs >= 2) save.tutorialDone = true;
  persist();
  return flags;
}
