// 斑马线路口的画面（判定都在 run.js 的 crossK 里，此刻的灯 crossLamp 也在 run.js，这里全是画面）：
//   地面：停止线（白，画在 x−10…x−6）、路面 + 斑马线 7 条（x … x+120，侧视里是一根根竖条）、支路口的后人行道
//   灯杆：停止线左边一根杆，杆顶小灯箱的红 / 绿点和屏幕上的灯牌同步
//   横穿车：主角停下等灯时，一辆车头正面的车从支路深处开过斑马线（y −40 → +60、缩放 0.35 → 1.15、0.8 秒），只是画面
//   灯牌：屏幕右侧 (W − 70, groundY − 300)，56×86。上红下绿 + 站立 / 走路小人 + 读秒（闪绿时是闪烁的「!」）：位置、图形、闪烁三重编码，色弱也分得清
import { CROSS, speedAt } from '../data/tune.js';
import { crossStopX, crossLamp } from '../game/run.js';
export { crossLamp };   // 灯态和过街规则放在一起（run.js），这里转出给画面和提示音用
import { propArt } from './art.js';
import { INK, roundRect, clamp, lerp, ease } from './draw.js';
import { bake, fromImage } from '../gfx/tex.js';
import { gfx } from '../gfx/gfx.js';

const WHITE = '#F2EFE6', ASPHALT = '#3B3846', BACKWALK = '#454152';
const RED = '#FF3B47', GREEN = '#3FDC7A', OFF = '#3A3344';

const blinkOn = t => Math.floor(t * 8) % 2 === 0;     // 4Hz

// ── 世界层：地面、灯杆 ─────────────────────────────────────
export function drawCrossGround(run, x0, x1, t) {
  const cs = run.course.crossings;
  if (!cs || !cs.length) return;
  for (const c of cs) {
    if (c.x + CROSS.zebra < x0 - 40 || c.x - 40 > x1) continue;
    const X = c.x, Z = CROSS.zebra;
    gfx.rect(X, -14, Z, 14, { fill: BACKWALK });                       // 支路口：后人行道断开，看得出路往纵深去
    gfx.rect(X, 1.2, Z, 34.8, { fill: ASPHALT });                      // 路面盖掉人行道砖（地面墨线留着）
    for (let i = 0; i < 7; i++) gfx.rect(X + 18 * i, 3, 12, 30, { fill: WHITE });
    gfx.rect(X - 10, 0, 4, 36, { fill: WHITE });                        // 白色停止线：红灯时主角停在它后面
    // 灯杆 + 杆顶灯箱
    const lamp = crossLamp(run, c), red = lamp && lamp.lit === 'red', green = lamp && (lamp.lit === 'green' || (lamp.lit === 'flash' && blinkOn(t)));
    gfx.rect(X - 32, -150, 4, 150, { fill: INK });
    gfx.rect(X - 36, -172, 12, 22, { fill: '#1E1A26', r: 2, stroke: INK, lw: 1.2 });
    gfx.circle(X - 30, -166, 4, { fill: red ? RED : OFF });
    gfx.circle(X - 30, -156, 4, { fill: green ? GREEN : OFF });
  }
}

// ── 横穿车：主角停下等灯时从支路深处开过斑马线 ─────────────────────
const CAR_BOX = [-40, -70, 80, 74];
function carFrontVec(g) {               // 兜底：车头正面（和出租车同色），原点在底边中点
  const st = (w = 2.2) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };
  g.fillStyle = INK; for (const x of [-30, 18]) { roundRect(g, x, -10, 12, 10, 3); g.fill(); }
  g.fillStyle = '#F5C84C'; g.beginPath(); g.moveTo(-26, -34); g.lineTo(-20, -52); g.lineTo(20, -52); g.lineTo(26, -34); g.closePath(); g.fill(); st();
  g.fillStyle = '#C9CCF2'; g.beginPath(); g.moveTo(-20, -36); g.lineTo(-16, -48); g.lineTo(16, -48); g.lineTo(20, -36); g.closePath(); g.fill(); st(1.6);
  g.fillStyle = '#fff'; roundRect(g, -8, -59, 16, 7, 2); g.fill(); st(1.4);
  g.fillStyle = '#2F6F68'; roundRect(g, -34, -36, 68, 28, 8); g.fill(); st();
  g.fillStyle = '#F5C84C'; g.fillRect(-32, -34, 64, 8);
  g.fillStyle = '#FFF1C2'; for (const x of [-22, 22]) { g.beginPath(); g.arc(x, -22, 5.5, 0, Math.PI * 2); g.fill(); st(1.6); }
  g.fillStyle = '#3A3344'; roundRect(g, -11, -27, 22, 9, 3); g.fill(); st(1.4);
  g.fillStyle = '#F6EBD2'; roundRect(g, -33, -13, 66, 6, 3); g.fill(); st(1.4);
}
const carTex = () => { const a = propArt('carFront'); return a ? fromImage(`prop|carFront|${a.src}`, a.img, a.w, a.h, { ox: -(a.ox || 0), oy: a.h - (a.oy || 0) }) : bake('v|carFront', CAR_BOX, carFrontVec); };
const coneTex = () => bake('xcone', [-52, -1, 104, 52], g => {
  const gr = g.createLinearGradient(0, 0, 0, 50); gr.addColorStop(0, 'rgba(255,248,220,0.9)'); gr.addColorStop(1, 'rgba(255,248,220,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(-20, 0); g.lineTo(20, 0); g.lineTo(50, 50); g.lineTo(-50, 50); g.closePath(); g.fill();
});
// 横穿车的进度：等灯这一段里，最后 0.95 秒开过去（等 1.0 秒也来得及），之前路面先打一道车灯光锥。不在等灯 = null
export function crossCar(run) {
  const s = run.cross;
  if (!s || s.phase !== 'wait') return null;
  const start = Math.max(0.05, s.wait - 0.95);
  return { k: (s.t - start) / 0.8, cone: clamp(s.t / start, 0, 1), c: run.course.crossings[run.crossIdx] };
}
// front = false：画在主角前面之前（还远、缩放 < 0.8）；true：开近了，画在主角之后
export function drawCrossCar(run, t, front) {
  const st = crossCar(run);
  if (!st) return;
  const X = st.c.x + CROSS.zebra / 2;
  if (!front && st.k < 0) gfx.draw(coneTex(), X, -14, { alpha: 0.35 * st.cone });
  if (st.k < 0 || st.k > 1) return;
  const k = ease.inOutSine(st.k), s = lerp(0.35, 1.15, k);
  if ((s >= 0.8) !== front) return;
  const a = clamp((1 - st.k) / 0.15, 0, 1);
  gfx.draw(carTex(), X, lerp(-40, 60, k), { sx: s, sy: s, alpha: a });
}

// ── 屏幕层：灯牌 ─────────────────────────────────────────
function manVec(g, walk, color) {     // 小人：高约 18，原点在灯的圆心
  g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round'; g.lineWidth = 2.6;
  g.beginPath(); g.arc(0, -7.5, 3.4, 0, Math.PI * 2); g.fill();
  roundRect(g, -3.4, -3.6, 6.8, 8.6, 2.6); g.fill();
  const seg = (a, b, c, d) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); };
  if (walk) { seg(-1, 4, -5, 10); seg(1.2, 4, 5.4, 9.6); seg(-3, -2, -6.6, 2.6); seg(3, -2, 6.4, -4.6); }
  else { seg(-1.6, 4, -1.6, 10.4); seg(1.6, 4, 1.6, 10.4); seg(-3.8, -2, -4.4, 4); seg(3.8, -2, 4.4, 4); }
}
const manTex = (walk, color) => bake(`xman|${walk ? 'w' : 's'}|${color}`, [-10, -13, 20, 26], g => manVec(g, walk, color));
const glowTex = color => bake(`xglow|${color}`, [-20, -20, 40, 40], g => {
  const gr = g.createRadialGradient(0, 0, 6, 0, 0, 20); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
});
export const BOARD = { w: 56, h: 86, dx: 70, dy: 300 };   // 左上角在 (W − 70, groundY − 300)
export function drawCrossBoard(run, L, V, vis, t) {
  const cs = run.course.crossings;
  if (!cs || !cs.length) return;
  const c = cs[run.crossIdx], live = c ? crossLamp(run, c) : null;
  const st = vis.xboard || (vis.xboard = { i: -1, pop: 1, last: null, lastT: -9, c: null });
  let lamp = live, fade = 1;
  if (live) { st.i = c.i; st.last = live; st.lastT = t; st.c = c; st.pop = clamp((run.t - (run.cross.t0 ?? run.t)) / 0.2, 0, 1); }
  else if (st.last && t - st.lastT < 0.35) { lamp = st.last; fade = 1 - (t - st.lastT) / 0.35; }   // 过完路口淡出
  else return;
  const bx = L.W - BOARD.dx, by = L.groundY - BOARD.dy, W = BOARD.w, H = BOARD.h;
  const pop = ease.outBack(st.pop);                  // 弹出动画按这一局的时间算（截图冻住画面也是弹完的样子）
  // 灯杆进了画面：一根细白线连到杆顶灯箱（告诉玩家这块牌子就是前面那盏灯）
  const pc = st.c, px = V.sx(pc.x - 30), py = V.sy(-172);
  if (px > -10 && px < bx - 6) gfx.line(bx, by + H / 2, px, py, { color: '#fff', w: 1, alpha: 0.6 * fade });
  gfx.save(); gfx.alpha(fade);
  gfx.translate(bx + W / 2, by + H / 2); gfx.scale(Math.max(0.05, pop)); gfx.translate(-(bx + W / 2), -(by + H / 2));
  gfx.rect(bx, by, W, H, { fill: '#1E1A26', r: 8, stroke: '#FFFFFF', lw: 2, shadow: 3 });
  const redOn = lamp.lit === 'red', greenOn = lamp.lit === 'green' || (lamp.lit === 'flash' && blinkOn(t));
  for (const [cy, on, color, walk] of [[22, redOn, RED, false], [54, greenOn, GREEN, true]]) {
    gfx.circle(bx + W / 2, by + cy, 15, { fill: '#2A2433' });
    if (on) gfx.draw(glowTex(color), bx + W / 2, by + cy, { alpha: 0.55 });
    gfx.draw(manTex(walk, on ? color : OFF), bx + W / 2, by + cy);
  }
  const num = lamp.num;
  if (num != null && (num !== '!' || blinkOn(t))) gfx.text(String(num), bx + W / 2, by + 77, { size: 16, color: '#fff', id: 'cross-num' });
  gfx.restore();
}

// 过街提示音的节奏（秒）：离「要发生的事」（到停止线 / 变绿）越近越急，0.5 → 0.12。不在路口 = 0
export function crossBeepGap(run) {
  const s = run.cross;
  if (!s || s.phase === 'far' || s.phase === 'pass' || s.phase === 'go') return 0;
  const c = run.course.crossings[run.crossIdx], vb = Math.max(1, speedAt(run.x));
  const left = s.phase === 'wait' ? s.wait - s.t : Math.max(0, crossStopX(c) - run.x) / vb;
  return lerp(0.12, 0.5, clamp(left / CROSS.show, 0, 1));
}
