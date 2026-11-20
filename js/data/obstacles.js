// 障碍目录。数值都用跳跃弧线核算过（固定跳高 108、滞空 0.56s）：悬空横杆顶边 ≥120 跳不过只能滑；跳跃类在最低速 240 时也跳得过。
//坐标：x 是障碍左边缘（世界坐标），地面 y = 0，高度向上为正。
//   avoid: 'jump' 只能跳 / 'slide' 只能滑 / 'either' 都行
//   ground：地面障碍的高度；overhead：悬空障碍 [离地底边, 顶边]
//   vx：自身额外的迎面速度（px/s，正数 = 朝主角冲来）；platform：顶面能站；light：轻碰（踩上去只减速、湿身，不踉跄）
//   flat：贴地平的（水坑），不画接地软影
export const OBSTACLES = {
  // 公司
  filebox:   { name: '文件箱', w: 32, ground: 36, avoid: 'jump', stages: ['office', 'stairs'] },
  chair:     { name: '滑行转椅', w: 36, ground: 40, avoid: 'jump', vx: 60, warn: true, stages: ['office'] },
  banner:    { name: '「Q4 冲刺」横幅', w: 90, overhead: [48, 130], avoid: 'slide', stages: ['office'] },
  gate:      { name: '闸机', w: 40, overhead: [34, 46], avoid: 'either', stages: ['office'], tutorial: true },
  wetsign:   { name: '小心地滑', w: 24, ground: 40, avoid: 'jump', stages: ['office', 'stairs'] },
  // 楼梯间（走楼梯那条路才有）：保洁的拖把水桶，和「小心地滑」同一个保洁语义
  mop:       { name: '拖把水桶', w: 34, ground: 34, avoid: 'jump', stages: ['stairs'] },
  // 街道
  puddle:    { name: '水坑', w: 56, ground: 6, avoid: 'jump', light: true, flat: true, stages: ['street', 'park'] },
  cone:      { name: '锥桶', w: 24, ground: 36, avoid: 'jump', stages: ['street'] },
  bike:      { name: '溜坡的共享单车', w: 60, ground: 36, avoid: 'jump', vx: 90, warn: true, stages: ['street', 'park'] },
  shopbar:   { name: '店招横杆', w: 70, overhead: [48, 130], avoid: 'slide', stages: ['street'] },
  step:      { name: '台阶', w: 160, ground: 40, avoid: 'jump', platform: true, stages: ['street', 'park'] },
  leash:     { name: '遛狗绳', w: 90, ground: 20, avoid: 'jump', stages: ['street', 'park'] },   // 20：和拆图后的绳子 + 狗对齐（原 24 比看到的高）
  scaffold:  { name: '脚手架', w: 80, overhead: [48, 140], avoid: 'slide', stages: ['street'] },
  manhole:   { name: '没盖的井', w: 52, hole: true, avoid: 'jump', warn: true, stages: ['street'] },
  // 晚高峰马路：违停车停在后人行道上，后门朝跑道甩开（判定按 x 静态，和开门动画无关）。pop：主角离车门 pop × v 时开始开门
  //   判定高 44：车门图不含外圈 45 高，顶上那一点是车窗框的圆角（擦边不算撞）；44 和垃圾桶一样高，低于最高的跳类（快递三轮 50），最低速 240 也跳得过
  cardoor:   { name: '违停车开门', w: 30, ground: 44, avoid: 'jump', warn: true, stages: ['street'], pop: 1.1 },
  // 溅水：不进随机池。排完路以后用单独的随机流把街道里 35% 的水坑原地改成它（位置、宽度、躲法都不变），近车道的车压过去溅起水墙
  splash:    { name: '溅水的水坑', w: 56, ground: 30, avoid: 'jump', light: true, flat: true, stages: [] },
  // 小区
  trike:     { name: '快递三轮', w: 72, ground: 50, avoid: 'jump', platform: true, stages: ['park'] },
  sheet:     { name: '晾晒被单', w: 100, overhead: [48, 120], avoid: 'slide', stages: ['park'] },
  scooter:   { name: '滑板车小孩', w: 30, ground: 40, avoid: 'jump', vx: 50, warn: true, stages: ['park'] },
  bin:       { name: '分类垃圾桶', w: 30, ground: 44, avoid: 'jump', stages: ['park'] },
  // 家门（楼道）
  parcel:    { name: '快递纸箱', w: 40, ground: 34, avoid: 'jump', stages: ['home'] },
  ebikeHall: { name: '楼道电动车', w: 64, ground: 46, avoid: 'jump', stages: ['home'] },
};

export function obstacleBox(o) {
  const t = OBSTACLES[o.type];
  if (t.hole) return null;                       // 洞不是实体，按「脚下没地面」处理
  if (t.overhead) return { x0: o.x, x1: o.x + t.w, y0: -t.overhead[1], y1: -t.overhead[0] };
  return { x0: o.x, x1: o.x + t.w, y0: -t.ground, y1: 0 };
}
