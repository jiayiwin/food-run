// 事件与结算文案：来电、外卖小哥、便利店、晚饭、称号。提到主角性别的词写 {键}（见 js/data/address.js）
// 来电：老刘、陌生号码。「家里来电」（'mom' 是历史名）由家庭剧本决定谁打来、说什么（js/data/family.js 的 caller + HOME_CALL）
export const CALLERS = {
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
  name: '外卖小哥', line: '{外卖:兄弟}，顺路捎你？',
  opts: [{ text: '蹭！', ride: true }, { text: '算了', ride: false }],
  time: 5, speedK: 1.6,
  detour: { p: 0.25, react: '「帮我送一单上楼」', min: 2, money: 8 },
  done: '「到了{外卖:兄弟}，给个好评！」',
};

export const STORE = {
  name: '便利店', line: '关东煮飘香……',
  opts: [{ text: '进店', enter: true }, { text: '路过', enter: false }],
  min: 3, time: 3,        // 进店世界停住 3 秒（不买等到超时 + 关门 0.25 = 3.25）：两家店 + 电梯 + 两次红灯 ≤15 秒
  items: [
    { id: 'onigiri', name: '饭团', price: 6, sat: 25, note: '+25 饱腹' },
    { id: 'oden', name: '关东煮', price: 10, sat: 40, note: '+40 饱腹' },
    { id: 'energy', name: '能量饮料', price: 8, sat: 10, note: '下次被追先跑 60', flag: 'energy' },
  ],
};

// 路线卡：左右固定（左楼梯 = 超时默认，右电梯），不随机换边，玩家可以提前想好。note 是卡片上的小字，N 开局按种子算好（停几层）
export const ROUTE = {
  lift: {
    name: '电梯厅', line: '电梯还是楼梯？',
    opts: [{ text: '走楼梯', note: '多跑一段', route: 'stairs' }, { text: '坐电梯', note: '预计停 N 层', route: 'lift' }],
    react: { lift: '叮——电梯来了', stairs: '安全通道，冲！' },
  },
};
// 电梯里的台词（飘字，≤14 字）
export const LIFT = {
  xiaoge: { name: '外卖小哥', hi: '等等！餐要超时了！', thanks: '谢了{外卖:兄弟}！', out: '哎——我的单！' },
  empty: '（门开了，没人）',
  key: '据说这个键是装饰',            // 第一次出现关门键
};

// 晚饭（0–3 档）和外卖：每个家庭自己一套，见 js/data/family.js 的 meals / takeout
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
  // 家庭剧本（一局最多 4 条新提示，按 run.js 的 TIP_PRI 排）
  errand: '家里交代的事：路上顺手办',
  errandStore: '货架上有家里要的',
  errandJump: '家里要的东西：跳起来拿',
  promise: '答应了马上到：别迟到',
};
