// 调试：障碍陈列（/dev/?props=1）
import { ctx, screen, beginFrame, now, raf } from './legacy/js/platform/index.js';
import * as P from './legacy/js/render/props.js';
import { text } from './legacy/js/render/draw.js';
const t0 = now();
const items = [
  ['水坑 70×8', (g, x, y, t) => P.puddle(g, x - 35, y, 70, t)],
  ['台阶 44×34', (g, x, y) => P.curb(g, x - 22, y)],
  ['纸箱 48×56', (g, x, y) => P.boxes(g, x - 24, y)],
  ['施工横杆', (g, x, y) => P.bar(g, x - 30, y, 60, 40, 110)],
  ['闸机杆', (g, x, y) => P.bar(g, x - 30, y, 60, 40, 110, 'gate')],
  ['迎面单车', (g, x, y, t) => P.bike(g, x - 36, y, 72, t)],
  ['外卖电动车', (g, x, y, t) => P.ebike(g, x - 40, y, 80, t)],
  ['遛狗绳', (g, x, y, t) => P.leash(g, x - 60, y, 120, t)],
  ['井盖+立牌', (g, x, y, t) => { P.warnSign(g, x - 52, y); P.manhole(g, x - 28, y, 56, t); }],
  ['小心地滑', (g, x, y) => P.wetSign(g, x - 12, y)],
  ['转椅', (g, x, y) => P.officeChair(g, x - 20, y)],
  ['零钱', (g, x, y, t) => P.coin(g, x, y - 30, t)],
];
function frame() {
  const t = (now() - t0) / 1000;
  beginFrame();
  ctx.fillStyle = '#ffe7c7'; ctx.fillRect(0, 0, screen.W, screen.H);
  items.forEach(([name, f], i) => {
    const x = 64 + (i % 3) * 124, y = 150 + Math.floor(i / 3) * 175;
    ctx.fillStyle = '#d9c2a0'; ctx.fillRect(x - 58, y, 116, 3);
    f(ctx, x, y, t);
    text(ctx, name, x, y + 22, { size: 12, color: '#2b2233' });
  });
  raf(frame);
}
frame();
