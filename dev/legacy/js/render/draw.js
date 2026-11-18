// 绘图小工具：圆角矩形、描边文字、胶囊、阴影。所有尺寸都是逻辑像素。
export const INK = '#2b2233';   // 统一的描边色（深紫黑），贴纸感就靠它

export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 填充 + 描边的圆角块（卡片、按钮、弹窗）
export function card(g, x, y, w, h, r, fill, { stroke = INK, lw = 2.5, shadow = 4 } = {}) {
  if (shadow) { g.fillStyle = 'rgba(43,34,51,.35)'; roundRect(g, x, y + shadow, w, h, r); g.fill(); }
  g.fillStyle = fill; roundRect(g, x, y, w, h, r); g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
export function font(size, weight = 700) { return `${weight} ${size}px ${FONT}`; }

// 描边字：先粗描边再填色
export function text(g, str, x, y, { size = 16, weight = 700, color = '#fff', stroke = INK, lw = 0, align = 'center', baseline = 'middle', maxW } = {}) {
  g.font = font(size, weight);
  g.textAlign = align; g.textBaseline = baseline;
  if (maxW) { const w = g.measureText(str).width; if (w > maxW) { g.font = font(Math.floor(size * maxW / w), weight); } }
  if (lw) { g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(str, x, y); }
  g.fillStyle = color; g.fillText(str, x, y);
}

// 按宽度自动折行（中文逐字），返回行数组
export function wrap(g, str, maxW, size, weight = 700) {
  g.font = font(size, weight);
  const lines = []; let line = '';
  for (const ch of str) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const t = line + ch;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = ch; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export function ellipse(g, x, y, rx, ry, fill) {
  g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

export function line(g, x1, y1, x2, y2, w, color, cap = 'round') {
  g.lineCap = cap; g.lineWidth = w; g.strokeStyle = color;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

// 带描边的粗线（四肢）：先画 ink 粗线，再画彩色细线
export function limb(g, pts, w, color, ink = INK, inkW = 2.4) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.lineWidth = w + inkW * 2; g.strokeStyle = ink; g.stroke();
  g.lineWidth = w; g.strokeStyle = color; g.stroke();
}

export function blob(g, x, y, r, fill, ink = INK, inkW = 2.4) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill(); g.lineWidth = inkW; g.strokeStyle = ink; g.stroke();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  outCubic: u => 1 - Math.pow(1 - u, 3),
  inCubic: u => u * u * u,
  inOutSine: u => -(Math.cos(Math.PI * u) - 1) / 2,
  outBack: u => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
  outElastic: u => (u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};
