// 事件与结算文案：来电、外卖小哥、便利店、晚饭、称号。
export const CALLERS = {
  mom: {
    name: '妈妈', line: '吃饭没？快回来！',
    pick: { text: '接', react: '嗯嗯嗯，马上到', eff: { slow: 3, slowK: 0.75, flag: 'momHappy' } },
    hang: { text: '挂', react: '（嘟——嘟——）', eff: { flag: 'momAngry' } },
  },
  boss: {
    name: '老刘', line: '小X啊，明天的PPT……',
    pick: { text: '接', react: '「再改改，就一点」', eff: { sat: -10 } },
    hang: { text: '挂', react: '（假装手机没电）', eff: { grudge: 'hangup' } },
  },
  unknown: {
    name: '陌生号码', line: '138****0000',
    pick: { text: '接', react: null, eff: { gamble: true } },   // 一半是外卖到了，一半是贷款推销
    hang: { text: '挂', react: '（世界清净了）', eff: {} },
  },
};
export const UNKNOWN_OUTCOMES = [
  { react: '您的外卖放门卫了', eff: { flag: 'takeout' } },
  { react: '您有一笔贷款额度……', eff: { slow: 2, slowK: 0.7 } },
];

export const RIDE = {
  name: '外卖小哥', line: '兄弟，顺路捎你？',
  opts: [{ text: '蹭！', ride: true }, { text: '算了', ride: false }],
  time: 5, speedK: 1.6,
  detour: { p: 0.25, react: '「帮我送一单上楼」', min: 2, money: 8 },
  done: '「到了兄弟，给个好评！」',
};

export const STORE = {
  name: '便利店', line: '关东煮飘香……',
  opts: [{ text: '进店', enter: true }, { text: '路过', enter: false }],
  min: 3, time: 4,
  items: [
    { id: 'onigiri', name: '饭团', price: 6, sat: 25, note: '+25 饱腹' },
    { id: 'oden', name: '关东煮', price: 10, sat: 40, note: '+40 饱腹' },
    { id: 'energy', name: '能量饮料', price: 8, sat: 10, note: '下次被追先跑 60', flag: 'energy' },
  ],
};

// 晚饭：0 泡面 → 3 红烧肉
export const MEALS = [
  { name: '泡面', color: '#f2c14e', side: '#e8a33d' },
  { name: '剩菜热一热', color: '#a8c66c', side: '#c9a26b' },
  { name: '番茄炒蛋', color: '#ff7a59', side: '#ffd84d' },
  { name: '红烧肉', color: '#b5482f', side: '#7fbf5a' },
];
export const TAKEOUT = { name: '放门卫的外卖', color: '#ffb347', side: '#e05a47' };
export const STARVE = { meal: '路边大爷的火腿肠', text: '饿晕在路口，被好心大爷扶起来' };

// 称号：按顺序取第一个满足的
export const TITLES = [
  { name: '职场端水大师', test: s => s.bad === 0 && s.choices >= 8 },
  { name: '借口永动机', test: s => s.excuseKinds >= 5 },
  { name: '被追了四条街', test: s => s.chased >= 4 },
  { name: '饿到眼冒金星', test: s => s.minSat < 12 },
  { name: '诚实的打工人', test: s => (s.tags['真话'] || 0) >= 5 },
  { name: '社交恐怖分子', test: s => (s.tags['顶嘴'] || 0) >= 3 },
  { name: '跑酷打工人', test: s => s.nearMiss >= 3 },
  { name: '老好人', test: s => (s.tags['顺从'] || 0) >= 4 },
  { name: '和解大师', test: s => s.reconciled >= 2 },
  { name: '人形外卖', test: s => s.rides >= 1 && s.hits <= 2 },
  { name: '准点下班人', test: () => true },
];

// 开局三步图示 / 新手提示
export const TIPS = {
  jump: '上滑 / 点一下：跳',
  slide: '下滑：滑铲',
  choose: '左滑选左边，右滑选右边',
  chase: '被追了！跳过障碍甩掉追兵',
  tired: '同一类借口用到第 3 次就不灵了',
  grudge: '记仇的人回来了：别再用上次的借口',
};
