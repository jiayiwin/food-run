// 每日词条：「今日挑战」每天一个规则变化，由当天的种子决定，全国相同。
//   money     开局多给的钱
//   coinK     捡一枚硬币算几块
//   satK      饱腹消耗倍率
//   readMinus 读题时间减少（秒），不低于 CHOICE.minTime
//   mealBonus 晚饭档次加成
//   scoreK    得分倍率
//   rain      户外下雨（只影响画面）
export const MODIFIERS = [
  { id: 'friday', name: '周五心情', desc: '晚饭加菜，得分 ×1.2', mealBonus: 1, scoreK: 1.2 },
  { id: 'payday', name: '发薪日', desc: '捡钱翻倍，开局多 ¥10', coinK: 2, money: 10 },
  { id: 'rain', name: '暴雨', desc: '淋雨好饿，饱腹掉得快', satK: 1.3, rain: true },
  { id: 'monday', name: '周一综合征', desc: '脑子慢，读题少 0.3 秒', readMinus: 0.3 },
];

export const modifierOf = seed => MODIFIERS[(seed >>> 0) % MODIFIERS.length];
