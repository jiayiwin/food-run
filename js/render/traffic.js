// 晚高峰马路（伪 2.5D：后人行道上的违停车 → 跑道 → 马路车流）。这里全是画面，判定都在 run.js 里按 x 静态算。
//   车流：按世界时间 run.wt 生成（暂停、进店时车也停），状态放在 vis.traffic，不进 run；同屏最多 3 辆，没有碰撞、不出预警
//   溅水车：远车道的对向车（和远车道车流同向、同速），位置只看主角离水坑多远（course.js 的 splashState）：
//     主角离水坑 0.8×v 起水面闪白预告（一定在屏幕里），0.55×v 时前轮压到水坑、水墙升起；主角停下车也停
//   蹭车：普通车和溅水车都在外卖电动车周围淡出（rideFade），不从电动车上开过去；蹭车经过的溅水坑不起水墙、不放水声（和车淡出一致）
//   路口：路口窗口和 ▶▶ 区附近不生成车（车身会盖住地面带上的斑马线和 ▶▶）
//   违停车：车身停在后人行道（y −4、不加外圈、按背景调色），车门是障碍贴图，主角走近时从铰链甩开（doorOpenK）
import { TRAFFIC } from '../data/tune.js';
import { OBSTACLES } from '../data/obstacles.js';
import { splashState, doorOpenK, trafficQuiet } from '../game/course.js';
import { propArt } from './art.js';
import { hash } from './scenery.js';
import { clamp, lerp } from './draw.js';
import { bake, bakeSticker, fromImage } from '../gfx/tex.js';
import { gfx } from '../gfx/gfx.js';
import { carVec, CAR_VEC, splashVec, SPLASH_BOX } from './vecprops.js';

const artTex = (id, def) => fromImage(`prop|${id}|${def.src}`, def.img, def.w, def.h, { ox: -(def.ox || 0), oy: def.h - (def.oy || 0) });
// 车的贴图和尺寸：有 AI 图用图（打包时已按马路调色），没有就用代码画的兜底
function car(id) {
  const a = propArt(id === 'parked' ? 'carParked' : 'car_' + id);
  if (a) return { tex: artTex(id, a), w: a.w, h: a.h, anchors: a.anchors || {}, art: true };
  const c = CAR_VEC[id];
  if (id === 'parked') {           // 违停车：车头朝左（迎着主角），停在后人行道 y −4；烘焙时就镜像好，锚点直接用
    const tex = bake('v|car_parked', [-2, -c.h - 7, c.w + 4, c.h + 9], g => { g.translate(c.w, -4); g.scale(-1, 1); carVec(g, id); });
    return { tex, w: c.w, h: c.h, anchors: { head: [4, -4 - c.h * 0.47], tail: [c.w - 2, -4 - c.h * 0.5], hinge: [c.w * 0.54, -4 - c.h * 0.25] }, art: false };
  }
  const tex = bake(`v|car_${id}`, [-2, -c.h - 3, c.w + 4, c.h + 5], g => carVec(g, id));
  return { tex, w: c.w, h: c.h, anchors: { head: [c.w - 4, -c.h * 0.47], tail: [2, -c.h * 0.5] }, art: false };
}
const splashTex = k => bakeSticker(`v|splashWall|${k}`, SPLASH_BOX, g => splashVec(g, k));

// 街道里离路段边缘多远（进出街道 300px 渐隐；不在街道 = 0）
function streetK(lv, x) {
  const s = lv.stageAt(x);
  if (lv.themeOf(s) !== 'street') return 0;
  return clamp(Math.min(x - s.x0, s.x1 - x) / TRAFFIC.edgeFade, 0, 1);
}
// 不生成车的地方：蹭车、▶▶ 区、路口窗口（course.js 的 trafficQuiet）。车身会盖住地面带上的 ▶▶ 和斑马线
function quiet(run, a, b) {
  if (run.ride || (run.choice && run.choice.kind === 'ride')) return true;
  return trafficQuiet(run.course, a, b);
}
// 外卖电动车在不在附近（问「蹭不蹭」、坐车、下车后小哥开走）：这时溅水坑不起水墙、不放水声，和溅水车在电动车周围淡出一致
export function rideNear(run, vis, t) { return !!(run.ride || (run.choice && run.choice.kind === 'ride') || rideLeave(vis, t)); }
const carX = (c, wt) => c.x0 + c.vx * (wt - c.t0);

// 每帧推进车流（只用 run.wt，画面状态放在 vis 里）。camX / viewW：镜头左边缘和可见宽度（世界坐标）
export function stepTraffic(run, vis, camX, viewW) {
  let tr = vis.traffic;
  if (!tr || tr.run !== run) tr = vis.traffic = { run, cars: [], next: run.wt + 0.6, n: 0, dim: 1, rideK: 0, rideDx: 0, ft: null };
  tr.cars = tr.cars.filter(c => { const x = carX(c, run.wt); return x + c.w > camX - 260 && x < camX + viewW + 420; });
  tr.dim += ((run.choice && run.choice.phase === 'open' ? TRAFFIC.dimChoice : 1) - tr.dim) * 0.15;
  if (run.wt < tr.next || run.lv.def.traffic === false) return;
  const n = tr.n++;
  tr.next = run.wt + lerp(TRAFFIC.gap[0], TRAFFIC.gap[1], hash(n * 3 + 1));
  if (tr.cars.length >= TRAFFIC.max || quiet(run, camX - 60, camX + viewW + 60)) return;
  const kinds = TRAFFIC.kinds;
  const kind = kinds[Math.floor(hash(n * 7 + 2) * kinds.length)];
  const lane = kind.lanes[Math.floor(hash(n * 11 + 3) * kind.lanes.length)];
  if (lane === 0 && splashNear(run)) return;                 // 溅水车占着靠路缘的车道
  const c = car(kind.id), far = lane === 0;
  const vx = far ? lerp(TRAFFIC.oncoming[0], TRAFFIC.oncoming[1], hash(n * 13 + 4)) : lerp(TRAFFIC.overtake[0], TRAFFIC.overtake[1], hash(n * 13 + 4));
  const x0 = far ? camX + viewW + 30 : camX - c.w - 30;
  if (streetK(run.lv, x0 + c.w / 2) <= 0 && streetK(run.lv, run.x) <= 0) return;
  tr.cars.push({ id: kind.id, lane, vx, x0, t0: run.wt, w: c.w, flip: far, seed: n });
}
// 前方有溅水的水坑、溅水车正在开（主角离它 1.6×v 以内）
function splashNear(run) {
  const obs = run.course.obstacles;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i], d = o.x - run.x;
    if (d > 1.6 * run.vBase) break;
    if (o.type === 'splash' && d > -200) return true;
  }
  return false;
}

// 一辆车：flip = 朝左开（对向）；dusk > .3 时车灯亮起
function drawCar(c, x, y, { flip = false, alpha = 1, dusk = 0, t = 0, bob = 0 } = {}) {
  if (alpha <= 0.01) return;
  const yy = y - bob;
  gfx.draw(c.tex, flip ? x + c.w : x, yy, { flip, alpha });
  if (dusk > 0.3) {
    const k = clamp((dusk - 0.3) / 0.3, 0, 1) * alpha;
    const ax = p => (flip ? c.w - p[0] : p[0]);
    const { head, tail } = c.anchors;
    if (head) { gfx.circle(x + ax(head), yy + head[1], 9, { fill: '#FFF1C2', alpha: 0.3 * k }); gfx.circle(x + ax(head), yy + head[1], 5, { fill: '#FFF1C2', alpha: 0.6 * k }); }
    if (tail) gfx.circle(x + ax(tail), yy + tail[1], 4, { fill: '#FF3B47', alpha: 0.5 * k });
  }
}

// 下车后小哥开走：0.8 秒，相对主角每秒 520，后 0.4 秒淡出（world.js 画小哥、这里让车避开小哥都用它）。不在开走 = null
export function rideLeave(vis, t) {
  const e = vis.rideEnd != null ? t - vis.rideEnd : -1;
  if (e < 0 || e >= 0.8) return null;
  return { dx: e * 520, alpha: clamp(1 - (e - 0.4) / 0.4, 0, 1) };
}
// 外卖电动车周围不画车（普通车流和溅水车都算，不然车身会从电动车上开过去）：选择卡、蹭车时围着主角，下车后跟着开走的小哥；
// 离中心 <200 全透明、200–300 渐隐。强度 rideK：蹭车和小哥开走时恒为 1；选择卡弹出、小哥走远后按时间缓动（约 0.1 秒），车不会一下冒出来或消失
function rideFade(run, vis, tr, t) {
  const off = rideLeave(vis, t), card = run.choice && run.choice.kind === 'ride';
  const dt = clamp(tr.ft == null ? 0 : t - tr.ft, 0, 1); tr.ft = t;
  if (off) tr.rideDx = off.dx; else if (run.ride || card) tr.rideDx = 0;
  if (run.ride || off) tr.rideK = 1;
  else tr.rideK += ((card ? 1 : 0) - tr.rideK) * (1 - Math.exp(-10 * dt));
  const K = tr.rideK, cx0 = run.x + tr.rideDx;
  return cx => (K < 0.005 ? 1 : 1 - K * (1 - clamp((Math.abs(cx - cx0) - 200) / (TRAFFIC.quiet.ride - 200), 0, 1)));
}

// 马路车流 + 溅水车：在主角之后画（马路离镜头更近）。远车道先画，近车道后画
export function drawTraffic(run, vis, x0, x1, t) {
  const tr = vis.traffic;
  const dusk = run.lv.duskAt(run.x), dim = tr ? tr.dim : 1;
  const fadeNear = tr ? rideFade(run, vis, tr, t) : () => 1;
  for (const lane of [0, 1]) {
    if (lane === 0) drawSplashCars(run, x0, x1, t, dusk, dim, fadeNear);
    if (!tr) continue;
    for (const c of tr.cars) {
      if (c.lane !== lane) continue;
      const x = carX(c, run.wt);
      if (x > x1 || x + c.w < x0) continue;
      const cx = x + c.w / 2, a = streetK(run.lv, cx) * dim * fadeNear(cx);
      drawCar(car(c.id), x, TRAFFIC.lanes[lane], { flip: c.flip, alpha: a, dusk, t, bob: Math.abs(Math.sin(t * 7 * Math.PI + c.seed)) * 0.8 });
    }
  }
}
// 溅水车（远车道、靠路缘，对向开来）：位置是主角离水坑距离的函数（splashState.ahead）。车头朝左，前轮在车身左起 0.22 处，
// 压水坑那一刻前轮正好在水坑中间。蹭车时和普通车一样在电动车周围淡出（只改画面，判定、路线不动）
const SPLASH_CARS = ['taxi', 'sedan', 'suv'];
function drawSplashCars(run, x0, x1, t, dusk, dim, fadeNear) {
  const obs = run.course.obstacles;
  for (let i = Math.max(0, run.obIdx - 4); i < obs.length; i++) {
    const o = obs[i];
    if (o.x - x1 > 2 * run.vBase) break;
    if (o.type !== 'splash') continue;
    const s = splashState(o, run.x), c = car(SPLASH_CARS[o.id % SPLASH_CARS.length]);
    const x = o.x + OBSTACLES.splash.w / 2 - 0.22 * c.w + s.ahead;
    if (x > x1 + 40 || x + c.w < x0 - 40) continue;
    drawCar(c, x, TRAFFIC.lanes[0], { flip: true, alpha: dim * fadeNear(x + c.w / 2), dusk, t, bob: Math.abs(Math.sin(t * 9 * Math.PI)) * 0.8 });
  }
}

// 溅水的水坑：车来之前水面一闪一闪（预告），车压过去后水墙升起，主角跑过去后淡出。画在障碍层（会撞的，有外圈）
export function drawSplashWall(o, x, run, t, vis) {
  if (vis && rideNear(run, vis, t)) return;               // 蹭车经过：溅水车淡出了，水墙也不起（判定不变：人在马路上碰不到）
  const s = splashState(o, run.x);
  if (s.warn) gfx.draw(bake('splashFlash', [-32, -6, 64, 12], g => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 30, 4, 0, 0, Math.PI * 2); g.fill(); }), x + 28, -2, { alpha: 0.6 * (0.5 + 0.5 * Math.sin(t * 12 * Math.PI)) });
  if (s.rise <= 0 || s.fade <= 0) return;
  const k = s.rise < 0.5 ? 0.4 : s.rise < 1 ? 0.8 : 1;
  gfx.draw(splashTex(k), x, 0, { alpha: s.fade });
}

// 违停车车身（障碍后面、中景之前）：铰链锚点正好落在车门判定框左边缘；双闪 2Hz
export function drawParked(run, x0, x1, t) {
  const obs = run.course.obstacles;
  for (let i = Math.max(0, run.obIdx - 4); i < obs.length; i++) {
    const o = obs[i];
    if (o.x > x1 + 120) break;
    if (o.type !== 'cardoor' || o.x + 80 < x0) continue;
    const c = car('parked'), hinge = c.anchors.hinge || [c.w * 0.54, 0];
    const cx = o.x - hinge[0];
    gfx.draw(c.tex, cx, 0);
    if (Math.floor(t * 4) % 2 === 0) for (const p of [c.anchors.head, c.anchors.tail]) if (p) { gfx.circle(cx + p[0], p[1], 7, { fill: '#FFB020', alpha: 0.35 }); gfx.circle(cx + p[0], p[1], 4, { fill: '#FFB020' }); }
  }
}
// 车门开度（给 world.js 画障碍时用）
export const doorK = (o, run) => doorOpenK(o, run.x);
