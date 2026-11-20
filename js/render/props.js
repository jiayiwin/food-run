// 障碍和道具的代码绘制。原点约定：x 是障碍左边缘，y 是地面（向上为负）。尺寸和判定框一致，方便对照调手感。
import { roundRect, INK, blob, limb } from './draw.js';
import { drawPerson, runPose, bikePose } from './rig.js';

const stroke = (g, w = 2.4) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };

export function puddle(g, x, y, w = 70, t = 0) {
  g.fillStyle = '#7fb8e6'; g.beginPath(); g.ellipse(x + w / 2, y - 2, w / 2, 7, 0, 0, Math.PI * 2); g.fill(); stroke(g, 2);
  g.fillStyle = '#c8e6ff'; g.beginPath(); g.ellipse(x + w / 2 - 10 + Math.sin(t * 4) * 3, y - 4, 10, 2.4, 0, 0, Math.PI * 2); g.fill();
}

export function curb(g, x, y, w = 44, h = 34, tread = null) {   // 台阶 / 路沿，顶面能站；tread：顶面一条踏步边（和美术图的 post.tread 同色，标出「能站」）
  g.fillStyle = '#b7b0a8'; roundRect(g, x, y - h, w, h, 3); g.fill(); stroke(g);
  g.fillStyle = '#d6d0c8'; g.fillRect(x + 2, y - h + 2, w - 4, 6);
  if (tread) { g.fillStyle = tread; roundRect(g, x + 1, y - h + 1, w - 2, 4, 2); g.fill(); g.fillStyle = INK; g.fillRect(x + 2, y - h + 5, w - 4, 1); }
}

export function boxes(g, x, y, w = 48, h = 56) {       // 快递纸箱堆
  g.fillStyle = '#d9a066'; roundRect(g, x, y - h / 2, w, h / 2, 2); g.fill(); stroke(g);
  g.fillStyle = '#e8b47c'; roundRect(g, x + 6, y - h, w - 12, h / 2, 2); g.fill(); stroke(g);
  g.fillStyle = '#c7894f'; g.fillRect(x + w / 2 - 3, y - h / 2, 6, h / 2); g.fillRect(x + w / 2 - 3, y - h, 6, h / 2);
  g.fillStyle = '#fff'; roundRect(g, x + 10, y - h / 2 + 8, 14, 9, 1); g.fill();
}

// 悬空横杆：top / bottom 是相对地面的高度（正数），只能滑过去
export function bar(g, x, y, w = 60, bottom = 40, top = 110, kind = 'construction') {
  const yb = y - bottom, yt = y - top;
  g.fillStyle = '#5b5866'; g.fillRect(x + 2, yt, 5, top); g.fillRect(x + w - 7, yt, 5, top);
  if (kind === 'gate') {                // 闸机杆：灰色闸机 + 黄黑杆
    g.fillStyle = '#9aa3b5'; roundRect(g, x - 4, y - 70, 18, 70, 3); g.fill(); stroke(g, 2);
  }
  const h = Math.max(10, yb - yt);
  g.save(); roundRect(g, x - 4, yt + h - 16, w + 8, 16, 4); g.clip();
  for (let i = -2; i < (w + 8) / 10 + 2; i++) { g.fillStyle = i % 2 ? '#f7b731' : '#2b2233'; g.beginPath(); g.moveTo(x - 4 + i * 10, yt + h); g.lineTo(x + 6 + i * 10, yt + h - 16); g.lineTo(x + 16 + i * 10, yt + h - 16); g.lineTo(x + 6 + i * 10, yt + h); g.fill(); }
  g.restore(); roundRect(g, x - 4, yt + h - 16, w + 8, 16, 4); stroke(g);
  if (kind === 'construction') { g.fillStyle = '#ff6b5a'; g.beginPath(); g.arc(x + w / 2, yt + h - 22, 5, 0, Math.PI * 2); g.fill(); stroke(g, 1.6); }
}

// 迎面骑车的人：整体 72×60
const CYCLIST = { skin: '#f2c6a0', hair: '#5a3e2b', hairStyle: 'slick', shirt: '#ffffff', jacket: '#46a35e', pants: '#34495e', shoes: '#2b2233', scale: 0.9 };
export function bike(g, x, y, w = 72, t = 0, rider = CYCLIST, flip = -1, frame = '#ff6b5a') {
  const cx = x + w / 2;
  const wheel = (wx) => { g.beginPath(); g.arc(wx, y - 13, 12, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); g.save(); g.translate(wx, y - 13); g.rotate(-t * 12 * flip); g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.moveTo(0, -10); g.lineTo(0, 10); g.lineWidth = 1.2; g.stroke(); g.restore(); };
  wheel(cx - 22); wheel(cx + 22);
  g.lineWidth = 3.4; g.strokeStyle = frame; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 22, y - 13); g.lineTo(cx - 4, y - 30); g.lineTo(cx + 14, y - 30); g.lineTo(cx + 22, y - 13); g.moveTo(cx - 4, y - 30); g.lineTo(cx + 2, y - 13); g.lineTo(cx - 22, y - 13); g.stroke();
  if (rider) drawPerson(g, cx - 4 * flip, y + 6, rider, bikePose(t * 1.6 % 1), { flip });   // 屁股落在车座（y-30）上
  // 车铃
  g.fillStyle = '#f7b731'; g.beginPath(); g.arc(cx + 16 * flip, y - 34, 3, 0, Math.PI * 2); g.fill();
}

// 外卖电动车（同向慢行）：80×58
const RIDER = { skin: '#f2c6a0', hair: '#f7b731', hairStyle: 'helmet', shirt: '#f7b731', jacket: '#f7b731', pants: '#34495e', shoes: '#2b2233', scale: 0.9 };
export function ebike(g, x, y, w = 80, t = 0, rider = true, body = '#4bb3a8') {
  const cx = x + w / 2;
  for (const wx of [cx - 26, cx + 26]) { g.beginPath(); g.arc(wx, y - 11, 10, 0, Math.PI * 2); g.fillStyle = '#2b2233'; g.fill(); g.fillStyle = '#9aa3b5'; g.beginPath(); g.arc(wx, y - 11, 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = body; roundRect(g, cx - 30, y - 30, 60, 14, 6); g.fill(); stroke(g);
  g.fillStyle = body; g.beginPath(); g.moveTo(cx + 18, y - 30); g.lineTo(cx + 28, y - 52); g.lineTo(cx + 32, y - 52); g.lineTo(cx + 26, y - 26); g.fill(); stroke(g, 2);
  // 外卖箱
  g.fillStyle = '#f7b731'; roundRect(g, cx - 38, y - 62, 30, 30, 4); g.fill(); stroke(g);
  g.fillStyle = INK; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('外卖', cx - 23, y - 44);
  if (rider) drawPerson(g, cx - 4, y + 1, RIDER, { ...bikePose(0.25), hipR: 70, knR: 70, hipL: 60, knL: 60 }, { flip: 1 });   // 坐在车座上，脚踩踏板
}

// 遛狗绳：狗在右，绳子从大妈手里（x − 4, −36）拉到狗脖子。大妈单独画（leashLady，不加外圈：她不会撞，绳和狗才会）。
// 绳子和美术图换色后一样：4px 荧光绿 #B6F23A + 墨线，在红店面前也看得见
const AUNTIE = { skin: '#f2c6a0', hair: '#7a4a3a', hairStyle: 'perm', shirt: '#ff6b9d', jacket: '#ff6b9d', pants: '#5a4a7a', shoes: '#2b2233', scale: 0.92 };
export function leash(g, x, y, w = 120, t = 0) {
  dog(g, x + w - 14, y, t);
  const rope = () => { g.beginPath(); g.moveTo(x - 4, y - 36); g.quadraticCurveTo(x + w / 2, y - 14 + Math.sin(t * 6) * 3, x + w - 24, y - 20); };
  g.lineCap = 'round'; rope(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
  rope(); g.strokeStyle = '#B6F23A'; g.lineWidth = 4; g.stroke();
}
export function leashLady(g, x, y) {
  drawPerson(g, x - 16, y - 4, AUNTIE, { ...runPose(0), lean: 0, hipR: 6, hipL: -6, knR: 4, knL: 4, shR: 70, elR: 10, shL: -10, elL: 20, bob: 0 }, { flip: 1 });
}
export function dog(g, x, y, t = 0) {
  const b = Math.sin(t * 14) * 2;
  g.fillStyle = '#f2b36b'; g.beginPath(); g.ellipse(x, y - 14 + b * 0.3, 14, 9, 0, 0, Math.PI * 2); g.fill(); stroke(g, 2);
  g.beginPath(); g.arc(x + 12, y - 22 + b * 0.3, 7, 0, Math.PI * 2); g.fill(); stroke(g, 2);
  g.fillStyle = INK; g.beginPath(); g.arc(x + 15, y - 23, 1.4, 0, Math.PI * 2); g.fill();
  limb(g, [[x - 8, y - 8], [x - 10 + b, y]], 3, '#f2b36b', INK, 1.6); limb(g, [[x + 6, y - 8], [x + 8 - b, y]], 3, '#f2b36b', INK, 1.6);
  limb(g, [[x - 13, y - 16], [x - 20, y - 22 + b]], 3, '#f2b36b', INK, 1.6);
}

// 开着的井盖：地面上的洞（w 宽），前面立一块「施工中」牌（预警）
export function manhole(g, x, y, w = 56, t = 0) {
  g.fillStyle = '#2b2233'; g.beginPath(); g.ellipse(x + w / 2, y + 2, w / 2, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5b5866'; g.beginPath(); g.ellipse(x + w + 14, y - 2, 16, 5, 0, 0, Math.PI * 2); g.fill(); stroke(g, 2);
}
export function warnSign(g, x, y) {      // 施工中立牌
  g.fillStyle = '#5b5866'; g.fillRect(x + 8, y - 38, 3, 38);
  g.fillStyle = '#f7b731'; g.beginPath(); g.moveTo(x + 9.5, y - 62); g.lineTo(x + 24, y - 36); g.lineTo(x - 5, y - 36); g.closePath(); g.fill(); stroke(g, 2);
  g.fillStyle = INK; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('!', x + 9.5, y - 41);
}

export function wetSign(g, x, y) {       // 小心地滑（公司路段的「台阶」）
  g.fillStyle = '#f7b731'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y - 40); g.lineTo(x + 24, y); g.closePath(); g.fill(); stroke(g, 2);
  g.fillStyle = INK; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText('小心', x + 12, y - 16); g.fillText('地滑', x + 12, y - 7);
}

export function officeChair(g, x, y, t = 0) {
  g.fillStyle = '#2b2233'; g.fillRect(x + 18, y - 22, 4, 16);
  for (const dx of [4, 20, 36]) { g.beginPath(); g.arc(x + dx, y - 3, 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#E0409A'; roundRect(g, x + 2, y - 30, 36, 9, 4); g.fill(); stroke(g, 2);   // 和美术图换色后一样：品红（不和地面的浅紫撞色）
  roundRect(g, x + 26, y - 44, 10, 18, 4); g.fill(); stroke(g, 2);
}

// 金币 / 零钱
export function coin(g, x, y, t = 0) {
  const s = Math.abs(Math.cos(t * 4));
  g.fillStyle = '#f7c948'; g.beginPath(); g.ellipse(x, y, 7 * s + 1, 7, 0, 0, Math.PI * 2); g.fill(); stroke(g, 2);
  if (s > 0.5) { g.fillStyle = '#c99a1a'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', x, y + 0.5); }
}
