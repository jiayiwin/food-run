// 画面特效：粒子、飘字、震屏。只管表现，不影响逻辑。
import { text } from './draw.js';

export function makeFx() {
  return { parts: [], floats: [], shake: 0, shakeT: 0, flash: 0, flashColor: '#fff' };
}

// 粒子（世界坐标或屏幕坐标，由 space 决定）
export function burst(fx, x, y, { n = 8, color = '#fff', speed = 120, up = 80, life = 0.6, size = 3, space = 'world', gravity = 500, kind = 'dot' } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life, t: 0, color, size: size * (0.6 + Math.random() * 0.8), space, gravity, kind, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
  }
}
export function float(fx, str, x, y, { color = '#fff', size = 16, life = 0.9, space = 'screen', rise = 40 } = {}) {
  fx.floats.push({ str, x, y, color, size, life, t: 0, space, rise });
}
export function shake(fx, amount = 4, time = 0.15) { fx.shake = Math.max(fx.shake, amount); fx.shakeT = Math.max(fx.shakeT, time); }
export function flash(fx, color = '#fff', a = 0.6) { fx.flash = a; fx.flashColor = color; }

export function stepFx(fx, dt) {
  for (const p of fx.parts) { p.t += dt; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
  fx.parts = fx.parts.filter(p => p.t < p.life);
  if (fx.parts.length > 80) fx.parts.splice(0, fx.parts.length - 80);
  for (const f of fx.floats) f.t += dt;
  fx.floats = fx.floats.filter(f => f.t < f.life);
  if (fx.shakeT > 0) { fx.shakeT -= dt; if (fx.shakeT <= 0) fx.shake = 0; }
  fx.flash = Math.max(0, fx.flash - dt * 3);
}

export function shakeOffset(fx) {
  if (!fx.shake) return [0, 0];
  return [(Math.random() - 0.5) * 2 * fx.shake, (Math.random() - 0.5) * 2 * fx.shake];
}

export function drawParts(g, fx, space) {
  for (const p of fx.parts) {
    if (p.space !== space) continue;
    const a = 1 - p.t / p.life;
    g.globalAlpha = a;
    g.fillStyle = p.color;
    if (p.kind === 'paper') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); g.restore(); }
    else if (p.kind === 'star') { text(g, '★', p.x, p.y, { size: p.size * 4, color: p.color }); }
    else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
}
export function drawFloats(g, fx, space) {
  for (const f of fx.floats) {
    if (f.space !== space) continue;
    const k = f.t / f.life;
    g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const s = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : 1.1 - Math.min(0.1, (k - 0.12));
    text(g, f.str, f.x, f.y - f.rise * k, { size: f.size * s, color: f.color, lw: 4 });
  }
  g.globalAlpha = 1;
}
