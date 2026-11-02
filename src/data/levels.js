// 饭点危机等级：赢一次解锁下一级。效果逐级叠加（Lv N 包含 Lv 1..N 全部规则）。
export const MAX_LEVEL = 8;

export const LEVELS = [
  { lv: 1, icon: '⏱️', name: '赶时间',   desc: '每句倒计时 −1.5 秒' },
  { lv: 2, icon: '🥱', name: '空腹出门', desc: '每个时段饥饿多扣 1' },
  { lv: 3, icon: '🎒', name: '两手空空', desc: '开局没有道具' },
  { lv: 4, icon: '🚪', name: '爱凑热闹', desc: '对话中途有人闯入的概率更高' },
  { lv: 5, icon: '👀', name: '眼尖',     desc: '装透明成功率 −15%，支走次数 −1' },
  { lv: 6, icon: '🎲', name: '祸不单行', desc: '今日词条变成 3 条' },
  { lv: 7, icon: '🍞', name: '没吃午饭', desc: '开局饥饿只有 92' },
  { lv: 8, icon: '🌪️', name: '情绪化',   desc: '注意力随机波动从 ±10 变成 ±15' },
];

// 规则数值（run.js / main.js 读取）
export const LV_TIMER_CUT = 1500;
export const LV_SLOT_HUNGER = 1;
export const LV_INTRUDE_RANDOM = 0.35;
export const LV_DODGE_CUT = 0.15;
export const LV_START_HUNGER = 92;
export const LV_VARIANCE = 15;
