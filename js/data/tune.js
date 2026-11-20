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
  modRamp: 0.5,           // 减速效果（被缠住 ×0.6、踩水 ×0.85、被追拖慢 ×0.8）结束时限速回升：0.6 → 1 用 0.5 秒，按慢速起跳的那一下照样跳得过
  // 判定框（宽、高），x 以脚底中点为准
  box: { run: [22, 54], slide: [40, 26], air: [22, 50] },
  nearMiss: 14,           // 差这么多像素就撞上 = 惊险
  shrink: 3,              // 障碍判定框四周各缩 3px，擦边不算撞
  // 速度按距离算：v(x) = √(base² + 2·accel·x)，封顶 max。等价于每秒 +1 px/s，但不受中途减速影响，排障碍时能算准
  speed: { base: 240, accel: 1, max: 420 },
  // 镜头：速度越快拉得越远（1.0 → 0.8），保证最高速时也能提前 0.8s 看到障碍
  zoom: { min: 0.8 },
  playerX: 96,            // 主角在屏幕上的 x（左边留给追兵）
};

// 背景音乐：[文件, 音量]
export const BGM = { run: ['audio/bgm_run.mp3', 0.45], home: ['audio/bgm_home.mp3', 0.4] };

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
    { id: 'office', name: '公司', x0: 0, x1: 6920 },
    // 楼梯间：写字楼电梯旁的安全通道（只有路线卡选了楼梯才跑这一段；电梯路从 6880 的电梯门直接到 7700 的大门）。
    // 780px × 0.75 ≈ 3.9 秒，和轿厢的 3.4–4.9 秒差不多：两条路的 S 率接近（原来 6920–8000 约 5.4 秒，楼梯路完美机器人 S 率低 4.5 个百分点）
    { id: 'stairs', name: '楼梯间', x0: 6920, x1: 7700, theme: 'office', slowK: 0.75, gate: false, minor: true },
    { id: 'street', name: '街道', x0: 7700, x1: 32000 },
    { id: 'park', name: '小区', x0: 32000, x1: 56000 },
    { id: 'home', name: '回家', x0: 56000, x1: 62000 },
  ],
  end: 62000,
  // 选择槽：npc（从本路段 NPC 池或记仇池里抽）/ call 来电 / ride 外卖小哥 / store 便利店 / gate 保安门禁 / mom 家门口 / route 路线卡
  slots: [
    { x: 420, kind: 'npc', fixed: 'laoliu' },        // 开局 2 秒就来：3 秒冲突钩子
    { x: 2900, kind: 'npc' },
    { x: 6050, kind: 'route', branch: 'lift' },      // 电梯还是楼梯（原来 5600 的第三位同事改成电梯停层时进来的人）
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
  eventTime: { call: 3.0, ride: 2.5, store: 2.5, route: 2.5 },
  eventSlow: 0.6,
  dashGuard: 0.35,        // 选完后这么久内的右滑归答题（不冲刺）
  dashPendGuard: 0.6,     // NPC 预出现、离弹题不到 0.6 秒路程时，横划归答题（什么都不做，也不冲刺）
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
  dash: 25,               // 一次冲刺甩开 25px（冲刺的 0.5 秒里匀速加上）
};

// 冲刺：右滑一次 0.5 秒 ×1.25。只在被追时、或者脚下是 ▶▶ 区时生效，其余时候右滑不做事（铁律：不冲只丢时间）
export const DASH = {
  k: 1.25, time: 0.5, cooldown: 2.5,
  clear: 1.05,            // 前方 1.05 秒路程内有没过的障碍：速度不加（只给甩追兵的距离），障碍间距表永远成立
};

// 晚高峰马路（只在街道）：前景车流纯画面、没有碰撞；车的 y 是车底边离地面线的世界 y（正数 = 往下，人行道 0…+36，车道从 +42 起）
export const TRAFFIC = {
  gap: [1.5, 4.0],                                   // 每 1.5–4 秒（世界时间）一辆
  lanes: [76, 108],                                  // 远车道（靠路缘）/ 近车道（靠镜头）：最高的车在远车道车顶也只到 +4，不压跑道
  oncoming: [-260, -180], overtake: [520, 640],      // 远车道对向开来 / 近车道从后面超过主角，世界速度 px/s
  max: 3, dimChoice: 0.3, edgeFade: 300,             // 同屏最多 3 辆；读题时 alpha .3；进出街道 300px 渐隐
  // 车型和能走的车道（0 远、1 近）。图 id = 'car_' + id，没有图的车型走代码兜底；面包车太高，只走近车道
  kinds: [{ id: 'sedan', lanes: [0, 1] }, { id: 'taxi', lanes: [0, 1] }, { id: 'suv', lanes: [0, 1] }, { id: 'van', lanes: [1] }],
  quiet: { ride: 300, zone: 60 },                    // 蹭车 ±300、▶▶ 区 ±60、路口窗口内不生成车：车身会盖住地面带上的东西
  road: 64, card: 26,                                // 蹭车时电动车画在马路上的世界 y；问「蹭不蹭」时小哥先靠到路缘（不被答案卡挡住）
  // 溅水：街道 35% 的水坑。远车道一辆对向车（和远车道车流同向、同速）开过来压水坑，全按主角离水坑多远算（不按时间）：
  //   离 warn×v 起水面闪白预告（街道最高速时镜头也能看到 0.9×v，预告一定在屏幕里）；hit×v 时前轮压到水坑、水墙升起
  splash: { p: 0.35, warn: 0.8, hit: 0.55, car: 200 },
};

// 斑马线路口（只在街道，按主角位置触发）。灯态开局按种子定好，定义为「主角到停止线那一刻」的灯：
//   绿：直接过；闪绿：停止线前 ▶▶ 区里冲刺就过（+100、被追时当场甩掉追兵），没冲就停下等一轮；红：自动停在停止线后等 1.0–1.5 秒。
//   不操作永远安全：只丢时间，不断连击、不扣饱腹、不碎饭盒。每局最多等 2 次，等满后后面的路口在灯牌出现时改成绿灯
export const CROSS = {
  show: 2.0,              // 离停止线 2.0 秒路程：灯牌出现、开始过街提示音（这时停止线还不在画面里，所以灯牌是屏幕 UI）
  zone: [1.0, 0.1],       // ▶▶ 区：停止线前 1.0 ~ 0.1 秒路程（只在闪绿时有）
  brake: 0.35,            // 停止线前 0.35 秒路程开始匀减速刹车（比照常跑过多用 0.35 秒）
  zebra: 120, after: 0.5, // 斑马线长 120px；过街后 0.5 秒路程不放障碍
  stopBack: 24,           // 停在停止线位置（x）前 24px：主角脚尖在白线后（白线画在 x−10…x−6，斑马线从 x 开始）
  waitRed: [1.0, 1.5], waitMiss: 1.5, maxWaits: 2, ramp: 0.5,   // 红灯等多久 / 闪绿没冲等多久 / 每局最多等几次 / 变绿后 0.5 秒提到全速
  weights: { green: 0.35, red: 0.30, flash: 0.35 }, maxRed: 2,
  dashScore: 100,
  gap: 1.5,               // 两个路口之间至少隔 1.5 秒路程
};

// 写字楼电梯（全程关公司段末）。路线卡选「坐电梯」后跑到门口进轿厢：轿厢是世界停住的小房间，只有点按钮（关门键）和
//   左右选（同事的题）两种操作，跳、滑铲、冲刺都关掉；时钟照常按真实时间走（不另加分钟）。停 1–2 层，每层三种情况之一：
//   同事进来出一道题 / 外卖小哥（点关门键不让进）/ 空层。被追时在门前 ▶▶ 区冲刺 = 门在追兵面前合上，当场甩掉；
//   没冲刺追兵跟着挤进来，出门接着追。电梯里答错不碎饭盒，出门后按 gap0 开始追。停层节拍开局按种子排好（子随机流）
export const ROOM = {
  max: 4.9,                        // 轿厢最多 4.9 秒（世界停住每局 ≤15 秒的预算里占 4.9）
  doorClose: 0.4, doorOpen: 0.4, down: 0.4,
  npcT: 1.6, npcBeat: 2.1,         // 同事：读题 1.6 秒，这一拍最长 2.1 秒
  takeout: 0.8, closeWin: 0.7,     // 外卖小哥：0.7 秒内点一下 = 关门不让进，省下这一拍剩下的时间
  empty: 0.8,                      // 空层：门开了没人，又关上
  closeScore: 50, shutScore: 200, exitInvuln: 0.6,
  floor0: 6,                       // 公司在 6 楼：楼梯间墙上的楼层号、轿厢里的楼层显示都从这里往下数
  zone: 1.0,                       // 门前 ▶▶ 区：门前 1.0 秒路程（只在选了电梯以后出现）
  exitClear: 1.0,                  // 大门后 1.0 秒路程不放障碍：电梯门一开就是路
  stairsIn: 0.5, stairsOut: 0.3,   // 楼梯间里的障碍离入口、出口至少隔多少秒路程
  // 停几层、每层是谁（按权重抽）：停 2 层 50%；1 层：同事 / 外卖 / 空层；2 层：两种不同的情况，顺序随机
  two: 0.5,
  one: [{ w: 0.55, v: ['npc'] }, { w: 0.3, v: ['takeout'] }, { w: 0.15, v: ['empty'] }],
  pair: [{ w: 0.7, v: ['npc', 'takeout'] }, { w: 0.2, v: ['npc', 'empty'] }, { w: 0.1, v: ['takeout', 'empty'] }],
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
  perMinEarly: 100, perMinLate: -50,   // 比「本路线标准时间 + 关卡 par.target」早到每分钟 +100、晚到每分钟 -50（全程关 = 19:00）
  comboStep: 0.02, comboMax: 2,
};

// 评级：相对本路线标准时间 par。到家时刻取整分钟 ≤ par + 关卡的 par.grade[i]、碎饭盒 ≤ broken
// 全程关 par = 18:49、grade = [3, 11, 23]，和以前的绝对线（S ≤18:52、A ≤19:00、B ≤19:12）逐分钟一致
export const GRADE_REL = [{ g: 'S', broken: 0 }, { g: 'A', broken: 1 }, { g: 'B', broken: 3 }];

// 本路线标准时间（js/game/par.js）和关卡时钟
export const PAR = {
  startLoss: 0.25,        // 起步加速（0.5 秒线性提速）少跑的那 0.25 秒
  step: 5,                // 数值积分步长（px）
  refMin: 46.6,           // 关卡时钟缩放的基准：纯跑一遍走过多少游戏分钟（= 全程关 186.4 秒 × 15 倍速）
};
export const CLOCK = { start: 18 * 60 };   // 下班时刻：所有关卡都从 18:00 出发

// 带薪摸鱼（只在关卡里有：同一关连败 ASSIST.streak 次后结算页可以开）：读题多 readPlus 秒（读题窗口按它放宽，窗口里照样没障碍）、
// 随机段障碍按子随机流删掉 cut（手写、教学障碍不删；只删不加，间距只会变大），这一局最多 maxStars 颗星
export const ASSIST = { readPlus: 0.3, cut: 0.15, maxStars: 2, streak: 2 };

// 背景罩色：只压远景 + 中景（地面、障碍、人物、拾取物画在它后面，不受影响）。路段交界 300px 内渐变。
// 户外实际 alpha = max(alpha, 0.3 × 暮色)：白天也有保底，傍晚继续变暗。公司反过来不压暗，地面线以上一层浅雾。
// art-src/spec.json 里每段中景的 veil 抄同一份（打包时算跳跃带指标用），test/art.test.js 逐段比对
export const VEIL = {
  office: { color: '#341E60', alpha: 0, fog: { color: '#EFE3F5', alpha: 0.12, h: 70 } },
  street: { color: '#341E60', alpha: 0.2 },
  park: { color: '#341E60', alpha: 0.22 },
  home: { color: '#3A2A40', alpha: 0.22 },            // 昏暗楼道
};
