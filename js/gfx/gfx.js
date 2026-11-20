// 统一的即时绘制接口：画面代码每帧按顺序调用（顺序即层级），底层交给 WebGL（PixiJS）或 Canvas 2D 后端。
// 坐标都是逻辑像素（宽 375）。用法：
//   gfx.begin()                                   每帧开始
//   gfx.save() / restore() / translate / scale / rotate / alpha(a)     变换和透明度栈
//   gfx.draw(tex, x, y, { w, h, rot, sx, sy, flip, alpha })           画贴图：贴图原点落在 (x, y)
//   gfx.rect(x, y, w, h, { fill, r, stroke, lw, shadow, alpha })      圆角矩形（卡片、按钮、条）
//   gfx.circle(x, y, r, { fill, stroke, lw, alpha })
//   gfx.line(x1, y1, x2, y2, { color, w, alpha })
//   gfx.text(str, x, y, { size, weight, color, stroke, lw, align, baseline, maxW, alpha, id })
//   gfx.vgrad(x, y, w, h, stops, { alpha })      竖直渐变（stops: [[0, '#fff'], [1, '#000']]）
//   gfx.end()                                     每帧结束（WebGL 后端在这里统一提交）
import { canvas, screen } from '../platform/index.js';
import { say } from '../data/address.js';   // 文案里的 {称呼} 按当前主角换词（见 js/data/address.js）：画字、量宽、预热都在这里换

const stack = [];
let m = [1, 0, 0, 1, 0, 0], a = 1;
let B = null;                         // 当前后端
const base = () => { const k = screen.scale * screen.dpr; return [k, 0, 0, k, (screen.offsetX || 0) * screen.dpr, 0]; };

function mul(t, [a2, b2, c2, d2, e2, f2]) {
  const [a1, b1, c1, d1, e1, f1] = t;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

export const gfx = {
  get kind() { return B ? B.kind : 'none'; },
  get backend() { return B; },
  use(backend) { B = backend; },

  begin(clear = '#1d1b26') { stack.length = 0; m = base(); a = 1; B.begin(clear); },
  end() { B.end(); },

  save() { stack.push([m, a]); },
  restore() { const s = stack.pop(); if (s) { m = s[0]; a = s[1]; } },
  translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
  scale(x, y = x) { m = mul(m, [x, 0, 0, y, 0, 0]); },
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); m = mul(m, [c, s, -s, c, 0, 0]); },
  alpha(k) { a *= k; },
  get matrix() { return m; },
  get globalAlpha() { return a; },

  // 贴图：w/h 默认贴图自身大小；rot 绕 (x, y) 旋转；sx/sy 绕 (x, y) 缩放；flip 左右镜像
  draw(tex, x, y, o = {}) {
    if (!tex) return;
    const al = a * (o.alpha ?? 1);
    if (al <= 0.003) return;
    const w = o.w ?? tex.w, h = o.h ?? tex.h;
    let t = mul(m, [1, 0, 0, 1, x, y]);
    if (o.rot) { const c = Math.cos(o.rot), s = Math.sin(o.rot); t = mul(t, [c, s, -s, c, 0, 0]); }
    const fx = (o.flip ? -1 : 1) * (o.sx ?? 1) * w / tex.w, fy = (o.sy ?? 1) * h / tex.h;
    if (fx !== 1 || fy !== 1) t = mul(t, [fx, 0, 0, fy, 0, 0]);
    if (tex.ox || tex.oy) t = mul(t, [1, 0, 0, 1, -tex.ox, -tex.oy]);
    B.image(tex, t, al, o.tint);
  },
  rect(x, y, w, h, o = {}) {
    if (w <= 0 || h <= 0) return;
    const al = a * (o.alpha ?? 1);
    if (al <= 0.003) return;
    const r = Math.min(o.r || 0, w / 2, h / 2);
    if (o.shadow) B.rect(mul(m, [1, 0, 0, 1, x, y + o.shadow]), w, h, { fill: 'rgba(43,34,51,.35)', r }, al);
    B.rect(mul(m, [1, 0, 0, 1, x, y]), w, h, { fill: o.fill, r, stroke: o.stroke, lw: o.lw ?? (o.stroke ? 2.5 : 0) }, al);
  },
  circle(x, y, r, o = {}) {
    const al = a * (o.alpha ?? 1);
    if (al <= 0.003 || r <= 0) return;
    if (!o.stroke) { B.dot(mul(m, [1, 0, 0, 1, x, y]), r, o.fill || '#fff', al); return; }    // 无描边的圆：共用一张圆形贴图染色
    B.rect(mul(m, [1, 0, 0, 1, x - r, y - r]), r * 2, r * 2, { fill: o.fill, r, stroke: o.stroke, lw: o.lw ?? (o.stroke ? 2 : 0) }, al);
  },
  line(x1, y1, x2, y2, o = {}) {
    const al = a * (o.alpha ?? 1), w = o.w ?? 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (al <= 0.003 || len <= 0) return;
    const ang = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(ang), s = Math.sin(ang);
    const t = mul(mul(m, [1, 0, 0, 1, x1, y1]), [c, s, -s, c, 0, 0]);
    B.rect(mul(t, [1, 0, 0, 1, 0, -w / 2]), len, w, { fill: o.color || '#fff', r: o.cap === 'round' ? w / 2 : 0 }, al);
  },
  text(str, x, y, o = {}) {
    if (str == null || str === '') return;
    const al = a * (o.alpha ?? 1);
    if (al <= 0.003) return;
    B.text(say(String(str)), mul(m, [1, 0, 0, 1, x, y]), o, al);
  },
  vgrad(x, y, w, h, stops, o = {}) {
    const al = a * (o.alpha ?? 1);
    if (al <= 0.003) return;
    B.vgrad(mul(m, [1, 0, 0, 1, x, y]), w, h, stops, al);
  },
  release(tex) { if (tex && B) B.release(tex); },
  // 宽屏（iPad、展开的折叠屏）左右黑边：盖住画到 375 宽以外的东西
  bars(c = '#1d1b26') {
    const ox = screen.offsetX || 0;
    if (ox <= 0) return;
    const t = base(), bw = ox / screen.scale + 1;
    B.rect(mul(t, [1, 0, 0, 1, -bw, 0]), bw, screen.H + 2, { fill: c }, 1);
    B.rect(mul(t, [1, 0, 0, 1, 375, 0]), bw, screen.H + 2, { fill: c }, 1);
  },
  warmFont(size, weight = 700) { if (B && B.warmFont) B.warmFont(size, weight); },
  preload(src) { if (B && B.preload && src) B.preload(src); },
  warm(str, o = {}) { if (B && B.warm && str) B.warm(say(String(str)), o); },
  // 文字宽度（逻辑像素），排版用
  measure(str, o = {}) { return B.measure(say(String(str)), o); },
};

export { canvas };
