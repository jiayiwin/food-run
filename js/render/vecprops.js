// 代码绘制的障碍、地标（Canvas 2D）。运行时不逐帧画它们，而是各烘焙一次成贴图（见 world.js）。
// 原点约定：x = 0 是障碍左边缘 / 地标锚点，y = 0 是地面，向上为负。
import { roundRect, INK, text } from './draw.js';
import { OBSTACLES } from '../data/obstacles.js';
import { STORE } from '../data/events.js';
import { puddle, curb, boxes, bike, ebike, leash, manhole, warnSign, wetSign, officeChair, coin } from './props.js';
import { drawPerson, idlePose } from './rig.js';

const st = (g, w = 2.2) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };

// 每种障碍烘焙时的画布范围：[左, 上, 宽, 高]（相对障碍左边缘和地面）
export function obstacleBox(type) {
  const T = OBSTACLES[type], w = T.w;
  const box = (L, top, R = L, below = 12) => [-L, -top, w + L + R, top + below];
  switch (type) {
    case 'leash': return box(36, 74, 30);
    case 'manhole': return box(50, 68, 36);
    case 'ebikeHall': return box(14, 70, 26);
    case 'bike': return box(20, 54);
    case 'scooter': return box(10, 50);
    case 'trike': return box(6, 72);
    case 'puddle': return box(6, 16);
    case 'chair': return box(8, 52);
    case 'sheet': return box(14, T.overhead[1] + 14);
    case 'scaffold': return box(4, T.overhead[1] + 24);
    case 'banner': case 'shopbar': case 'gate': return box(6, T.overhead[1] + 34);
    default: return box(8, (T.ground || 40) + 12);
  }
}

export function drawObstacleVec(g, type) {
  const T = OBSTACLES[type], x = 0;
  switch (type) {
    case 'filebox': boxes(g, x, 0, T.w, T.ground); break;
    case 'parcel': boxes(g, x, 0, T.w, T.ground); break;
    case 'chair': officeChair(g, x, 0, 0); break;
    case 'wetsign': wetSign(g, x, 0); break;
    case 'puddle': puddle(g, x, 0, T.w, 0); break;
    case 'step': curb(g, x, 0, T.w, T.ground); break;
    case 'bike': bike(g, x, 0, T.w, 0, null, -1); break;
    case 'leash': leash(g, x, 0, T.w, 0); break;
    case 'manhole': warnSign(g, x - 40, 0); manhole(g, x, 0, T.w, 0); break;
    case 'ebikeHall': ebike(g, x - 8, 0, 80, 0, false); break;
    case 'cone': cone(g, x, T.w, T.ground); break;
    case 'bin': bin(g, x, T.w, T.ground); break;
    case 'trike': trike(g, x, T.w, T.ground); break;
    case 'scooter': scooterKid(g, x); break;
    case 'banner': hanging(g, x, T, '#e74c3c', 'Q4 冲刺！', '#ffe08a'); break;
    case 'shopbar': hanging(g, x, T, '#f7b731', '烤串 · 啤酒', '#2b2233'); break;
    case 'scaffold': scaffold(g, x, T); break;
    case 'sheet': sheet(g, x, T, 0); break;
    case 'gate': hanging(g, x, T, '#9aa3b5', '', '#fff'); break;
    default: g.fillStyle = '#f0f'; g.fillRect(x, -(T.ground || 20), T.w, T.ground || 20);
  }
}

function cone(g, x, w, h) {
  g.fillStyle = '#ff7f2a'; g.beginPath(); g.moveTo(x + 3, 0); g.lineTo(x + w / 2 - 3, -h); g.lineTo(x + w / 2 + 3, -h); g.lineTo(x + w - 3, 0); g.closePath(); g.fill(); st(g);
  g.fillStyle = '#fff'; g.fillRect(x + 7, -h * 0.55, w - 14, 5);
  g.fillStyle = '#ff7f2a'; roundRect(g, x - 2, -5, w + 4, 5, 2); g.fill(); st(g, 1.6);
}
function bin(g, x, w, h) {
  g.fillStyle = '#4caf50'; roundRect(g, x, -h + 6, w, h - 6, 4); g.fill(); st(g);
  g.fillStyle = '#388e3c'; roundRect(g, x - 3, -h, w + 6, 8, 3); g.fill(); st(g, 1.8);
  text(g, '♻', x + w / 2, -h / 2 + 2, { size: 13, color: '#fff' });
}
function trike(g, x, w, h) {
  for (const wx of [x + 12, x + w - 12]) { g.fillStyle = INK; g.beginPath(); g.arc(wx, -9, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9aa3b5'; g.beginPath(); g.arc(wx, -9, 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#3d7ad6'; roundRect(g, x, -h, w, h - 14, 4); g.fill(); st(g);
  g.fillStyle = '#d9a066'; roundRect(g, x + 8, -h - 14, 26, 14, 2); g.fill(); st(g, 1.6);
  text(g, '快递', x + w / 2 + 6, -h / 2 - 6, { size: 11, color: '#fff' });
}
function scooterKid(g, x) {
  g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x + 2, -4); g.lineTo(x + 28, -4); g.moveTo(x + 4, -4); g.lineTo(x + 2, -40); g.lineTo(x + 10, -40); g.stroke();
  g.fillStyle = '#ff6b5a'; for (const wx of [x + 4, x + 26]) { g.beginPath(); g.arc(wx, -3, 3.5, 0, Math.PI * 2); g.fill(); }
  drawPerson(g, x + 16, -6, { skin: '#ffd8bd', hair: '#2b2233', hairStyle: 'bob', shirt: '#7bed9f', jacket: '#7bed9f', pants: '#3742fa', shoes: '#fff', mouth: 'open', scale: 0.62 }, { ...idlePose(0), shR: 70, elR: 10, shL: 60, elL: 10, hipR: 10, hipL: -12, lean: -6 }, { flip: -1 });
}
// 悬空障碍：整块画实，不留「看起来能钻 / 能跳」的空当
function hanging(g, x, T, color, label, ink) {
  const [b, top] = T.overhead;
  g.fillStyle = '#5b5866'; g.fillRect(x + 4, -top - 30, 4, 30); g.fillRect(x + T.w - 8, -top - 30, 4, 30);
  g.fillStyle = color; roundRect(g, x, -top, T.w, top - b, 4); g.fill(); st(g);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 2, -b - 8, T.w - 4, 6);
  if (label) text(g, label, x + T.w / 2, -(top + b) / 2, { size: 13, color: ink, maxW: T.w - 8 });
  g.save(); roundRect(g, x, -b - 7, T.w, 7, 2); g.clip();
  for (let i = 0; i < T.w / 8 + 2; i++) { g.fillStyle = i % 2 ? '#f7b731' : INK; g.fillRect(x + i * 8, -b - 7, 8, 7); }
  g.restore();
}
function scaffold(g, x, T) {
  const [b, top] = T.overhead;
  g.fillStyle = '#7f8c8d'; g.fillRect(x, -top - 20, 5, top + 20); g.fillRect(x + T.w - 5, -top - 20, 5, top + 20);
  g.fillStyle = 'rgba(46,160,90,.85)'; g.fillRect(x + 2, -top, T.w - 4, top - b); st(g);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
  for (let i = 8; i < T.w; i += 10) { g.beginPath(); g.moveTo(x + i, -top); g.lineTo(x + i, -b); g.stroke(); }
  text(g, '施工中', x + T.w / 2, -(top + b) / 2, { size: 13, color: '#fff' });
  g.fillStyle = '#f7b731'; g.fillRect(x, -b - 6, T.w, 6); st(g, 1.6);
}
function sheet(g, x, T, t) {
  const [b, top] = T.overhead;
  g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - 10, -top - 6); g.lineTo(x + T.w + 10, -top - 6); g.stroke();
  g.fillStyle = '#8ecae6'; g.beginPath(); g.moveTo(x, -top - 6);
  g.lineTo(x + T.w, -top - 6);
  for (let i = 10; i >= 0; i--) g.lineTo(x + T.w * i / 10, -b + Math.sin(t * 3 + i) * 2.5);
  g.closePath(); g.fill(); st(g);
  g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + 12 + i * 16, -top + 20 + (i % 2) * 22, 4, 0, Math.PI * 2); g.fill(); }
}
export function bunVec(g) {
  g.fillStyle = 'rgba(255,240,180,.5)'; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(0, 2, 11, 9, 0, Math.PI, 0); g.lineTo(11, 5); g.lineTo(-11, 5); g.closePath(); g.fill(); st(g, 1.8);
  g.strokeStyle = '#d9c3a0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-3, -5); g.lineTo(0, -1); g.lineTo(3, -5); g.stroke();
}
export function coinVec(g) { coin(g, 0, 0, 0); }

// 地标
export function deskVec(g) {
  g.fillStyle = '#e8d8c8'; roundRect(g, -150, -46, 110, 8, 3); g.fill(); st(g);
  g.fillStyle = '#5b5866'; g.fillRect(-140, -38, 6, 38); g.fillRect(-56, -38, 6, 38);
  g.fillStyle = '#2b2233'; roundRect(g, -120, -86, 50, 34, 4); g.fill(); g.fillStyle = '#7fd1ff'; g.fillRect(-116, -82, 42, 26);
  g.fillStyle = '#5b5866'; g.fillRect(-98, -52, 6, 6);
  text(g, '18:00', -95, -69, { size: 11, color: '#2b2233' });
}
export function exitVec(g, stage) {
  if (stage === 'street') { g.fillStyle = '#9aa3b5'; g.fillRect(-46, -150, 10, 150); g.fillRect(36, -150, 10, 150); g.fillStyle = '#5cb85c'; roundRect(g, -34, -146, 68, 22, 4); g.fill(); st(g); text(g, '出口 EXIT', 0, -135, { size: 12, color: '#fff' }); }
  if (stage === 'park') { g.fillStyle = '#c0392b'; g.fillRect(-60, -160, 14, 160); g.fillRect(46, -160, 14, 160); roundRect(g, -70, -176, 140, 28, 6); g.fill(); st(g); text(g, '幸福里小区', 0, -162, { size: 15, color: '#ffe08a' }); }
  if (stage === 'home') { g.fillStyle = '#8d6e63'; roundRect(g, -50, -170, 100, 170, 4); g.fill(); st(g); g.fillStyle = '#5d4037'; g.fillRect(-36, -140, 72, 140); text(g, '3 栋', 0, -156, { size: 13, color: '#fff' }); }
}
export function storeVec(g) {
  g.fillStyle = '#ffffff'; roundRect(g, -70, -150, 160, 150, 6); g.fill(); st(g);
  g.fillStyle = '#2e86de'; roundRect(g, -70, -150, 160, 30, 6); g.fill(); st(g);
  text(g, STORE.name + ' 24h', 10, -135, { size: 15, color: '#fff' });
  g.fillStyle = 'rgba(255,236,170,.9)'; g.fillRect(-58, -110, 64, 70); g.fillRect(18, -110, 60, 110);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-58, -110, 64, 70); g.strokeRect(18, -110, 60, 110);
}
export function boothVec(g) {
  g.fillStyle = '#e0e0e0'; roundRect(g, 30, -110, 70, 110, 4); g.fill(); st(g);
  g.fillStyle = '#7fd1ff'; g.fillRect(40, -96, 50, 30);
  text(g, '门卫', 65, -40, { size: 12, color: '#2b2233' });
  g.fillStyle = '#5b5866'; g.fillRect(0, -60, 10, 60);
}
export function barrierVec(g) { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c0392b' : '#fff'; g.fillRect(-120 + i * 20, -3, 20, 6); } }
export function doorFrameVec(g) {
  g.fillStyle = '#6d4c41'; g.fillRect(-6, -132, 74, 132);
  g.fillStyle = '#ffe9b0'; g.fillRect(0, -126, 62, 126);
  text(g, '家', 31, -146, { size: 16, color: '#fff', lw: 4 });
}
export function doorLeafVec(g) {
  g.fillStyle = '#a1887f'; g.fillRect(0, 0, 62, 126); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(0, 0, 62, 126);
  g.fillStyle = '#f7c948'; g.beginPath(); g.arc(50, 66, 4, 0, Math.PI * 2); g.fill();
}
export function warnArrowVec(g, color) {
  g.fillStyle = color; g.beginPath(); g.moveTo(26, 0); g.lineTo(0, -16); g.lineTo(0, 16); g.closePath(); g.fill(); st(g, 2);
  text(g, '!', 9, 1, { size: 16, color: '#fff' });
}
export { ebike };
