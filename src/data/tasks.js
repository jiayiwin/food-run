// 今日任务：每局开局抽 3 个，结算时判定。check 在结算时调用；failed 在局中实时判定（已不可能完成）。
import { zoneOf } from './npcs.js';

export const TASKS = {
  no_boss_hold: {
    id: 'no_boss_hold', icon: '👔', title: '老板全程没 PUA 住你',
    check: s => !s.stats.incidentLog.some(t => t === '被老板留下再说两句' || t === '被留下加班'),
    failed: s => s.stats.incidentLog.some(t => t === '被老板留下再说两句' || t === '被留下加班'),
  },
  transfers3: {
    id: 'transfers3', icon: '🧨', title: '甩锅 3 次，闭环了属于是',
    check: s => s.stats.transfers >= 3,
    failed: () => false,
  },
  no_panic: {
    id: 'no_panic', icon: '⏱', title: '一次都没慌，松弛感拉满',
    check: s => s.stats.panics === 0,
    failed: s => s.stats.panics > 0,
  },
  lin_safe_end: {
    id: 'lin_safe_end', icon: '🌸', title: '到家时小林刚好没上头',
    check: s => zoneOf(s.npcs.lin.att) === 'safe',
    failed: () => false,
  },
  zhang_safe_end: {
    id: 'zhang_safe_end', icon: '🗣️', title: '到家时小张刚好没上头',
    check: s => zoneOf(s.npcs.zhang.att) === 'safe',
    failed: () => false,
  },
  mom_ok: {
    id: 'mom_ok', icon: '📱', title: '妈没有连环 call',
    check: s => !s.flags.momAngry,
    failed: s => !!s.flags.momAngry,
  },
  perfect5: {
    id: 'perfect5', icon: '✿', title: '完美回避 5 场，偷感很重',
    check: s => s.stats.perfect >= 5,
    failed: () => false,
  },
  hunger30: {
    id: 'hunger30', icon: '🍚', title: '到家时还有活人感（饥饿 ≥ 30）',
    check: s => s.hunger >= 30,
    failed: s => s.hunger < 30 && s.screen === 'result',
  },
  teacher_dodge: {
    id: 'teacher_dodge', icon: '📚', title: '没被老师抓去补课',
    check: s => !s.stats.incidentLog.includes('被老师要求补课'),
    failed: s => s.stats.incidentLog.includes('被老师要求补课'),
  },
  no_trouble: {
    id: 'no_trouble', icon: '💢', title: '没人回头找你麻烦，牛马一夜平安',
    check: s => !s.stats.incidentLog.some(t => /艾特你|说了你|长消息|五个电话/.test(t)),
    failed: s => s.stats.incidentLog.some(t => /艾特你|说了你|长消息|五个电话/.test(t)),
  },
};

export const TASK_IDS = Object.keys(TASKS);
export const TASKS_PER_RUN = 3;
