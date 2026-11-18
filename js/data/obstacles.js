// 障碍目录。数值都用跳跃弧线核算过（固定跳高 108、滞空 0.56s）：悬空横杆顶边 ≥120 跳不过只能滑；跳跃类在最低速 240 时也跳得过。
//坐标：x 是障碍左边缘（世界坐标），地面 y = 0，高度向上为正。
//   avoid: 'jump' 只能跳 / 'slide' 只能滑 / 'either' 都行
//   ground：地面障碍的高度；overhead：悬空障碍 [离地底边, 顶边]
//   vx：自身额外的迎面速度（px/s，正数 = 朝主角冲来）；platform：顶面能站
export const OBSTACLES = {
  // 公司
  filebox:   { name: '文件箱', w: 32, ground: 36, avoid: 'jump', stages: ['office'] },
  chair:     { name: '滑行转椅', w: 36, ground: 40, avoid: 'jump', vx: 60, warn: true, stages: ['office'] },
  banner:    { name: '「Q4 冲刺」横幅', w: 90, overhead: [48, 130], avoid: 'slide', stages: ['office'] },
  gate:      { name: '闸机', w: 40, overhead: [34, 46], avoid: 'either', stages: ['office'], tutorial: true },
  wetsign:   { name: '小心地滑', w: 24, ground: 40, avoid: 'jump', stages: ['office'] },
  // 街道
  puddle:    { name: '水坑', w: 56, ground: 6, avoid: 'jump', light: true, stages: ['street', 'park'] },
  cone:      { name: '锥桶', w: 24, ground: 36, avoid: 'jump', stages: ['street'] },
  bike:      { name: '溜坡的共享单车', w: 60, ground: 36, avoid: 'jump', vx: 90, warn: true, stages: ['street', 'park'] },
  shopbar:   { name: '店招横杆', w: 70, overhead: [48, 130], avoid: 'slide', stages: ['street'] },
  step:      { name: '台阶', w: 160, ground: 40, avoid: 'jump', platform: true, stages: ['street', 'park'] },
  leash:     { name: '遛狗绳', w: 90, ground: 24, avoid: 'jump', stages: ['street', 'park'] },
  scaffold:  { name: '脚手架', w: 80, overhead: [48, 140], avoid: 'slide', stages: ['street'] },
  manhole:   { name: '没盖的井', w: 52, hole: true, avoid: 'jump', warn: true, stages: ['street'] },
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
