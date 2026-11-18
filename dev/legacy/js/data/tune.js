// 数值表：跑酷手感、路线、选择、追逐、资源、计分。坐标是逻辑像素，地面 y = 0，向上为负；时间单位秒。
export const TUNE = {
  gravityUp: 2400,        // 上升重力
  gravityDown: 3200,      // 下落重力：落得比升得快，落地更干脆
  jumpV: -720,            // 固定跳高约 108px，滞空约 0.56s（不做按住变高：会和下滑滑铲打架）
  fastFallV: 1100,        // 空中下滑：直接往下砸
  autoSlideAfterFastFall: 0.4,
  slideTime: 0.55,
  slideIn: 0.06, slideOut: 0.08,   // 进入 / 起身时判定框插值
  coyote: 0.08,
  buffer: 0.12,
  stumbleTime: 1.2,       // 撞障碍踉跄：速度 ×0.55，这段时间内线性恢复
  stumbleSpeed: 0.55,
  invulnAfterHit: 1.5,    // 撞完的无敌时间（≥ 踉跄 1.2s + 0.3s），踉跄期间来不及躲的障碍不算
  // 判定框（宽、高），x 以脚底中点为准
  box: { run: [22, 54], slide: [40, 26], air: [22, 50] },
  nearMiss: 6,            // 差这么多像素就撞上 = 惊险
  shrink: 3,              // 障碍判定框四周各缩 3px，擦边不算撞
  // 速度按距离算：v(x) = √(base² + 2·accel·x)，封顶 max。等价于每秒 +1 px/s，但不受中途减速影响，排障碍时能算准
  speed: { base: 240, accel: 1, max: 420 },
  // 镜头：速度越快拉得越远（1.0 → 0.8），保证最高速时也能提前 0.8s 看到障碍
  zoom: { min: 0.8 },
  playerX: 96,            // 主角在屏幕上的 x（左边留给追兵）
};

export function speedAt(x) {
  const s = TUNE.speed;
  return Math.min(s.max, Math.sqrt(s.base * s.base + 2 * s.accel * Math.max(0, x)));
}
export function zoomAt(v) {
  const s = TUNE.speed;
  return 1 - (1 - TUNE.zoom.min) * Math.max(0, Math.min(1, (v - s.base) / (s.max - s.base)));
}

// 路线：四个路段，NPC 和事件的位置（世界 x）事先排好，空出读题的窗口
export const COURSE = {
  stages: [
    { id: 'office', name: '公司', x0: 0, x1: 8000 },
    { id: 'street', name: '街道', x0: 8000, x1: 32000 },
    { id: 'park', name: '小区', x0: 32000, x1: 56000 },
    { id: 'home', name: '回家', x0: 56000, x1: 62000 },
  ],
  end: 62000,
  // 选择槽：npc（从本路段 NPC 池或记仇池里抽）/ call 来电 / ride 外卖小哥 / store 便利店 / gate 保安门禁 / mom 家门口
  slots: [
    { x: 420, kind: 'npc', fixed: 'laoliu' },        // 开局 2 秒就来：3 秒冲突钩子
    { x: 2900, kind: 'npc' },
    { x: 5600, kind: 'npc' },
    { x: 9000, kind: 'npc' },
    { x: 12000, kind: 'call' },
    { x: 14800, kind: 'npc' },
    { x: 17600, kind: 'ride' },
    { x: 22200, kind: 'npc' },
    { x: 25200, kind: 'store' },
    { x: 28200, kind: 'npc' },
    { x: 31000, kind: 'npc' },
    { x: 33800, kind: 'npc' },
    { x: 37200, kind: 'gate', fixed: 'zhou' },
    { x: 40600, kind: 'call' },
    { x: 44000, kind: 'npc' },
    { x: 47600, kind: 'store' },
    { x: 51000, kind: 'npc' },
    { x: 54400, kind: 'npc' },
    { x: 61000, kind: 'mom' },          // 到门口还剩约 2.3 秒：够 1.5 秒读题 + 0.75 秒结果
  ],
};

export const CHOICE = {
  // 读题时间（真实秒）：公司 3.0 → 街道 2.6→2.1 → 小区 2.0→1.7 → 家门 1.5
  time: { office: [3.0, 3.0], street: [2.6, 2.1], park: [2.0, 1.7], home: [1.5, 1.5] },
  // 读题时世界放慢到多少
  slow: { office: 0.5, street: 0.6, park: 0.75, home: 1 },
  // 窗口里前多大比例保证没有障碍（小区开始允许「边跳边选」）
  clear: { office: 1, street: 1, park: 0.6, home: 1 },
  revisitMinus: 0.3, minTime: 1.5,
  guard: 0.15,            // 弹出后 0.15s 内不收选项，防止上一次点击误选
  quick: 1.0,             // 1 秒内选完算「秒选」
  timeoutBad: 0.7,        // 超时：70% 当坏选项处理，30% 对方接了个电话走了
  after: 0.45,            // 选完之后这么久不会有障碍到脸上
  eventTime: { call: 3.0, ride: 2.5, store: 2.5 },
  eventSlow: 0.6,
};

// 追逐：选坏了，NPC 从左后方追上来。干净跑完一定甩得掉；撞一次还能救，撞两次基本被抓
export const CHASE = {
  gap0: 80,               // 初始距离（px）
  slowT: 2.5, slowK: 0.8, // 被搭话拖慢：2.5 秒 ×0.8
  approach: 28,           // 拖慢期间每秒被拉近（干净跑完拖慢期还剩 10）
  shakeT: 4.0,            // 甩开期
  recover: 8,             // 甩开期每秒拉开
  dodge: 18, near: 10, hit: -50,
  escape: 140,
  energy: 60,             // 能量饮料：下次追逐初始距离 +60
  ride: 80,               // 蹭车时每秒拉开
  caughtTime: 1.4,
};

export const RES = {
  clockRate: 15,          // 1 秒世界时间 = 15 秒游戏时间
  sat0: 80, satDrain: 0.3, rideDrain: 0.5,
  money0: 20,
  boxes: 3,
  hit: { sat: -2, min: 0.5 },   // 绊一跤：饱腹 -2、耽误半分钟
  caught: { sat: -5, min: 3 },
  hole: { sat: -3, min: 2, time: 1.0 },
  hungry: 25,             // 饱腹低于这个：说真话一律放行
  bun: 8,                 // 路边包子
};

export const SCORE = {
  per10px: 1, good: 100, quick: 50, near: 30, coin: 10, reconcile: 300,
  moneyLeft: 10, satLeft: 5,
  perMinEarly: 100, perMinLate: -50, target: 19 * 60,   // 19:00 之前到家每早一分钟 +100
  comboStep: 0.02, comboMax: 2,
};

// 评级：到家时间（分钟，从 0 点算）和碎了几个饭盒
export const GRADE = [
  { g: 'S', by: 18 * 60 + 52, broken: 0 },
  { g: 'A', by: 19 * 60 + 0, broken: 1 },
  { g: 'B', by: 19 * 60 + 12, broken: 3 },
];
