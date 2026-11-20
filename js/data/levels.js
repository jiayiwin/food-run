// 关卡：一条路线 = 路段 + 选择槽 + 手写障碍 + 随机段（吃种子）+ 路口 + 分支。坐标是世界 x，速度公式全局通用：
// 短关卡从 x0 起跑（例如从 6000 开始，起步就是 264 px/s），speedAt、移动障碍、间距表、机器人都不用改。
//
// 字段（全程关以外的关卡在序章 / 周一到周三上线时补齐；缺省值见 js/game/level.js）：
//   x0 / end                      起点、终点（到家 = end − 20）
//   stages  [{ id, name, x0, x1, theme?, slowK?, gate?, minor? }]
//           theme 画面和读题时间按哪个路段算（缺省 = id，例如楼梯间 theme: 'office'）；slowK 跑速系数（楼梯间 0.75）；
//           gate: false 不画出口门；minor: true 进度条上不画刻度
//   slots   [{ x, kind, fixed?, caller?, npc?, line?, hold?, branch? }]
//           kind：npc / call / ride / store / gate / mom / chase（不出题，追兵直接冲出来）/ route（路线卡，配 branch）；caller 指定来电人（家庭剧本用）
//   gen     随机段 [{ x0, x1?, densityK?, pool? }]：x1 缺省 = end − 260；densityK 乘到路段的平均间隔上（>1 更稀）；pool 限定障碍种类
//   fixed   手写障碍 [{ type, x, teach? }]（不吃种子，零钱不沿它摆）
//   tutorialSpan / tutorialFixed   新手局：只把这一段换成教学障碍，其余和同种子普通局一样
//   seed    null = 用这一局的种子排路；关卡写死一个，保证每次同一条路（题目和左右顺序仍随这一局的种子）
//   clockRate  时钟倍率（1 秒世界时间 = 多少秒游戏时间）。不写 = 按本关纯跑时长自动缩放，让每关都在 18:46 前后到家；
//              罚时（撞一下、被抓、进店……）的游戏分钟数按同一比例缩放，换算成真实秒数和全程关一样
//   par     { slack, grade: [S, A, B], meal: [3 档, 2 档, 1 档], target, star, home: { early, promise, late } }：都是「本路线标准时间 + N 分钟」，
//           单位是这一关时钟上的游戏分钟（关卡时钟按纯跑时长缩放过：1 分钟 = 纯跑时长 / 46.6 秒，用 node tools/balance.mjs --level <id> 校准）；
//           star 是 ★2 的准点线；home 是门口题的阈值（家庭剧本用；关卡里按「同样的真实秒数」从不缩放的稿子换算过来）
//   dusk    天色按路线位置从 [起点, 终点] 插值
//   story   家庭剧本：{ key }（关卡写死故事；全程关留空，按规则抽，见 js/game/story.js 的 resolveStory）
//   traffic true = 街道路段画晚高峰车流（纯画面）；false 关掉
//   crossings [{ x, light?, wait? }]  斑马线路口，x 是停止线；light 'green' | 'red' | 'flash' 写死灯态（不写按种子抽），wait 红灯等几秒
//   branch  电梯 / 楼梯分支 { id, card, door, exit, beats }：card 路线卡的槽位；door 电梯门（门洞中心，门前 ▶▶ 区 = 门前 ROOM.zone 秒路程）；
//           exit 两条路的汇合点（楼梯间跑完 / 电梯门打开都到这里）；beats 'seed' = 停层节拍按种子排，或写死 ['npc', 'takeout']。
//           楼梯间是 [door, exit] 里的子路段（stages 里写 slowK 0.75、gate: false、minor: true），障碍按子随机流单独排，选了楼梯才装上
//   teach   定格教学（每关最多 3 个，学过的不再定格）：choose 第一题等你选 / jump、slide 手写障碍上的 teach / dash 第一次被追 /
//           lift 电梯里第一拍外卖等你点关门 / crossdash 第一个闪绿路口进 ▶▶ 区时等你右滑
//   learn   通关后写进存档的「学会了」（全程关的软版本看它）：jump / slide / choose / chase / cardoor / dash / lift / cross
//   rules   { chase: false } 答错不追（序章：只有反应台词，不会失败）
//   stars   [★1, ★2, ★3]：★1 到家、★2 准点线（par.star）且最多碎 1 个饭盒、★3 本关绝活（test(stats)）；tip3 没拿 ★3 时结算页的一句提示
//   slots 里的追逐槽 { kind: 'chase', npc, line, hold? }：不出题，追兵从左后方冲出来直接追，头顶喊 line；hold: 'door' 跑到电梯门前甩不掉
import { COURSE, RES } from './tune.js';

// 路线版本：同种子排出的路有任何变化就 +1（分享卡、今日挑战靠它判断是否同一条路）
//   1 初版；2 晚高峰马路（违停车开门进街道障碍池、街道 35% 的水坑换成溅水的水坑）；3 斑马线路口（路口窗口里不放障碍）；
//   4 写字楼电梯：5600 的同事槽换成 6050 的路线卡，门前 ▶▶ 区 + 楼梯间（6920–8000，按子随机流单独排）+ 大门后 1 秒空地；
//   5 全程关楼梯间缩短到 6920–7700（大门、街道起点从 8000 挪到 7700，两条路 S 率接近），路线快照开始锁路口的灯态和等灯秒数
//   6 家庭剧本：带拾取物的故事（爸爸的快递、帮拿外卖、周二关）剔掉拾取点前 0.9 秒、后 1.0 秒路程里的障碍；周二关的路因此变了。
//     自由下班的平常日（没有拾取物）和以前同种子逐个相同
export const COURSE_VERSION = 6;

export const LEVELS = {
  full: {
    id: 'full', name: '自由下班', sub: '完整下班路 · 约 200 秒',
    x0: 0, end: COURSE.end,
    stages: COURSE.stages,
    slots: COURSE.slots,
    gen: [{ x0: 900 }],
    fixed: [],
    tutorialSpan: [900, 3500],
    tutorialFixed: [{ type: 'filebox', x: 1500, teach: 'jump' }, { type: 'banner', x: 2250, teach: 'slide' }],
    crossings: [{ x: 10500 }, { x: 27000 }, { x: 29700 }],   // 三个都在街道：前后两个槽的读题窗口之间、避开蹭车（见 test/cross.test.js 的 checkCrossings）
    branch: { id: 'lift', card: 6050, door: 6880, exit: 7700, beats: 'seed' },   // 路线卡 6050、电梯门 6880、楼梯间 6920–7700（见 tune.js 的 ROOM）
    traffic: true,
    seed: null,
    clockRate: RES.clockRate,             // 全程关就是基准：固定 15 倍速（纯跑 186.4 秒 ≈ 46.6 游戏分钟）
    teach: [], learn: [], rules: {},
    dusk: [0.02, 0.72],
    // slack 2.5 → 2.2：标准时间按两条路里慢的那条算（楼梯间 / 轿厢标称时长），全程关 18:49 或 18:50（没红灯 18:49、两个红灯 18:50、一个红灯看电梯停几层；node tools/balance.mjs 写区间和众数）
    // home：门口题的阈值（家庭剧本，按门口快照时的预计到家时刻）：早到 ≤ 标准、接了电话却晚于标准 +7（失约，HUD 便签写「18:56 前到家」）、
    //       晚于标准 +11（晚到）。定稿按快照时的时钟写的是 −1 / +5 / +9，改成预计到家时刻后按 node tools/balance.mjs --family 重定
    par: { slack: 2.2, grade: [3, 11, 23], meal: [3, 13, 26], target: 11, home: { early: 0, promise: 7, late: 11 } },
    stars: null,                          // 全程关只评 S/A/B/C
    story: {},
  },

  // ── 一周通勤：每关只引入一样新东西，按「教 → 变 → 合 → 考」排。关卡写死 seed：同一关每次同一条路（题目和左右仍随这一局） ──
  // 序章（约 40 秒）：只教跳、滑铲、左右选；答错不追，不会失败
  prologue: {
    id: 'prologue', name: '序章 · 入职第一天', short: '序章', sub: '新：跳、滑铲、左右选',
    x0: 0, end: 9800, seed: 101,
    stages: [
      { id: 'office', name: '公司', x0: 0, x1: 4200 },
      { id: 'street', name: '街道', x0: 4200, x1: 7600 },
      { id: 'home', name: '回家', x0: 7600, x1: 9800 },
    ],
    slots: [
      { x: 420, kind: 'npc', fixed: 'laoliu' },       // 第一题：世界停住等你选（teach choose）
      { x: 3200, kind: 'npc', fixed: 'ajie' },
      { x: 8800, kind: 'mom' },                       // end − 1000
    ],
    fixed: [{ type: 'filebox', x: 1500, teach: 'jump' }, { type: 'banner', x: 2250, teach: 'slide' }],
    // 只出静止的跳 / 滑障碍（不出移动障碍、井、违停车、水坑），比全程关稀
    gen: [{ x0: 2700, x1: 7400, densityK: 1.6, pool: ['filebox', 'wetsign', 'banner', 'cone', 'shopbar', 'leash'] }, { x0: 7700, x1: 8500 }],
    traffic: false,
    teach: ['choose', 'jump', 'slide'], learn: ['jump', 'slide', 'choose'],
    rules: { chase: false },
    par: { slack: 1.5, grade: [3, 11, 23], meal: [3, 13, 26], target: 11, star: 3, home: { early: -5, promise: 10, late: 29 } },
    stars: [{ id: 'home', text: '到家' }, { id: 'ontime', text: '准点到家' }, { id: 'clean', text: '一次没撞', test: s => s.hits === 0 }],
    tip3: '看清再跳，一次都别撞',
    story: { key: 'parents.prologue' },
  },
  // 周一（约 75 秒）：教被追和饭盒（Tony 冲出来追的固定追逐槽）；街道开始有车流、违停车开门（4300 手写一辆，首遇提示）
  mon: {
    id: 'mon', name: '周一 · 准点下班', short: '周一', sub: '新：被追、饭盒',
    x0: 0, end: 18800, seed: 102,
    stages: [
      { id: 'office', name: '公司', x0: 0, x1: 3000 },
      { id: 'street', name: '街道', x0: 3000, x1: 16000 },
      { id: 'home', name: '回家', x0: 16000, x1: 18800 },
    ],
    slots: [
      { x: 420, kind: 'npc', fixed: 'laoliu' }, { x: 2400, kind: 'npc' }, { x: 5000, kind: 'npc' },
      { x: 7600, kind: 'call', caller: 'mom' },        // 家里来电（谁打来由故事决定）
      { x: 10200, kind: 'npc' },
      { x: 12000, kind: 'chase', npc: 'tony', line: '{帅哥}别跑！办张卡！' },
      { x: 15000, kind: 'npc' }, { x: 17800, kind: 'mom' },
    ],
    fixed: [{ type: 'cardoor', x: 4300 }],
    gen: [{ x0: 900 }],
    traffic: true,
    teach: [], learn: ['chase', 'cardoor'],
    par: { slack: 1.5, grade: [4, 12, 24], meal: [4, 14, 28], target: 12, star: 4, home: { early: -3, promise: 8, late: 16 } },
    stars: [{ id: 'home', text: '到家' }, { id: 'ontime', text: '准点到家' }, { id: 'shake', text: '被追后甩掉追兵', test: s => s.escaped >= 1 }],
    tip3: '被追了别慌：跳过障碍就能甩开',
    story: { key: 'parents.mon' },
  },
  // 周二（约 90 秒）：教冲刺（第一次被追定格）和写字楼电梯（第一拍外卖等你点关门）。老刘 4700 冲出来追，跑到电梯门前都甩不掉
  tue: {
    id: 'tue', name: '周二 · 电梯里的人', short: '周二', sub: '新：冲刺、电梯',
    x0: 1000, end: 22600, seed: 103,
    stages: [
      { id: 'office', name: '公司', x0: 1000, x1: 6490 },
      { id: 'stairs', name: '楼梯间', x0: 6490, x1: 7700, theme: 'office', slowK: 0.75, gate: false, minor: true },
      { id: 'street', name: '街道', x0: 7700, x1: 20000 },
      { id: 'home', name: '回家', x0: 20000, x1: 22600 },
    ],
    slots: [
      { x: 1420, kind: 'npc', fixed: 'lili' }, { x: 3200, kind: 'npc' },
      { x: 4700, kind: 'chase', npc: 'laoliu', line: '小X！等我一起坐电梯！', hold: 'door' },
      { x: 5600, kind: 'route', branch: 'lift' },
      { x: 10000, kind: 'call', caller: 'mom' },
      { x: 12600, kind: 'npc' }, { x: 15400, kind: 'npc' }, { x: 17900, kind: 'npc' },
      { x: 21600, kind: 'mom' },
    ],
    branch: { id: 'lift', card: 5600, door: 6450, exit: 7700, beats: ['npc', 'takeout'] },   // 停两层：同事出题 → 外卖小哥（教关门）
    gen: [{ x0: 1250 }],
    traffic: true,
    teach: ['dash', 'lift'], learn: ['dash', 'lift'],
    par: { slack: 1.5, grade: [4, 12, 24], meal: [4, 14, 28], target: 12, star: 4, home: { early: -2, promise: 10, late: 17 } },
    stars: [{ id: 'home', text: '到家' }, { id: 'ontime', text: '准点到家' }, { id: 'door', text: '电梯门夹住追兵', test: s => s.doorShut >= 1 }],
    tip3: '被追时冲进电梯，门会夹住追兵',
    story: { key: 'parents.tue' },
  },
  // 周三（约 100 秒）：教路口和 ▶▶ 冲刺区。四个路口灯态写死：闪绿（首遇定格教右滑）→ 绿 → 闪绿 → 闪绿（小区门口）
  wed: {
    id: 'wed', name: '周三 · 第一个路口', short: '周三', sub: '新：路口、▶▶ 冲刺区',
    x0: 6000, end: 34600, seed: 104,
    stages: [
      { id: 'office', name: '公司', x0: 6000, x1: 8000 },
      { id: 'street', name: '街道', x0: 8000, x1: 27000 },
      { id: 'park', name: '小区', x0: 27000, x1: 32000 },
      { id: 'home', name: '回家', x0: 32000, x1: 34600 },
    ],
    slots: [
      { x: 6420, kind: 'npc', fixed: 'laoliu' }, { x: 8800, kind: 'npc' },
      { x: 10700, kind: 'call', caller: 'mom' },
      { x: 15600, kind: 'npc' }, { x: 20600, kind: 'npc' }, { x: 22900, kind: 'store' },
      { x: 28000, kind: 'npc' }, { x: 31000, kind: 'gate', fixed: 'zhou' },
      { x: 33600, kind: 'mom' },
    ],
    crossings: [{ x: 13100, light: 'flash' }, { x: 18100, light: 'green' }, { x: 24900, light: 'flash' }, { x: 26600, light: 'flash' }],
    gen: [{ x0: 6900 }],
    traffic: true,
    teach: ['crossdash'], learn: ['cross'],
    // ★2 线 +0（准点 = 不晚于标准）：给奶奶买润喉糖不加时钟分钟（家里要的东西都不加），买糖的人不丢 ★2；
    // 以前 +6 是给「进店给自己买吃的」留的 3 分钟 × 时钟缩放，机器人改买糖以后普通档 ★2 从 30/40 涨到 39/40，按 +0 校回 29/40（老手 38/40、手残 2/40）
    par: { slack: 1.5, grade: [6, 14, 26], meal: [6, 16, 30], target: 14, star: 0, home: { early: -2, promise: 8, late: 16 } },
    stars: [{ id: 'home', text: '到家' }, { id: 'ontime', text: '准点到家' }, { id: 'nowait', text: '所有路口都不用等灯', test: s => s.crossings >= 4 && s.crossWaits === 0 }],
    tip3: '闪绿灯时右滑，冲过斑马线',
    story: { key: 'parents.wed' },
  },
};
export const LEVEL_ORDER = ['prologue', 'mon', 'tue', 'wed'];   // 序章 + 周一到周三：选关页、解锁链、标题页「下班！」都按这个顺序
export const isLevelId = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEVELS, id);   // 'constructor' 之类的键不算关卡
export const levelOf = id => (isLevelId(id) ? LEVELS[id] : LEVELS.full);   // 'constructor' 之类的键不会取到原型上的东西
// 一周通勤里的某一关（不是全程关、键名合法）→ 关卡数据，否则 null。标题页、好友卡、结算页、分享卡、存档都用它判断「这是不是一关」
export const levelDef = id => (id !== 'full' && isLevelId(id) ? LEVELS[id] : null);
