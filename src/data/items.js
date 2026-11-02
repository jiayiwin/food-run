// 道具。kind：atk 攻（压对方注意力）/ def 防（挡后果）/ heal 补（回饥饿）/ time 时间（加倒计时）
export const KIND_LABEL = { atk: '攻', def: '防', heal: '补', time: '时' };

export const ITEMS = {
  mask: { id: 'mask', name: '口罩', icon: '😷', kind: 'atk', desc: '本场对方的热情减半（正向变化 ×0.5）', flavor: '戴上口罩，谁都认不出你。' },
  earbuds: { id: 'earbuds', name: '耳机', icon: '🎧', kind: 'atk', desc: '立刻让主角注意力 −10', flavor: '「啊？你说什么？」' },
  sms: { id: 'sms', name: '急事短信', icon: '📨', kind: 'atk', desc: '主角 −20；在场其他人 +5（显得你很忙）', flavor: '手机一震，「家里有急事」。' },
  powerbank: { id: 'powerbank', name: '充电宝', icon: '🔋', kind: 'def', desc: '下一次被缠住不扣饥饿、不算事故', flavor: '「手机没电了，我先走！」' },
  sunglasses: { id: 'sunglasses', name: '墨镜', icon: '🕶️', kind: 'def', desc: '本场旁观者不会被你的态度带动', flavor: '谁也看不出你在看谁。' },
  snack: { id: 'snack', name: '关东煮', icon: '🍢', kind: 'heal', desc: '饥饿 +10', flavor: '先垫一口。' },
  coffee: { id: 'coffee', name: '咖啡', icon: '☕', kind: 'time', desc: '本拍倒计时 +5 秒', flavor: 'CPU 清醒了。', timeBonus: 5000 },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const MAX_ITEMS = 3;
