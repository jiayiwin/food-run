// 代码绘制的障碍、地标（Canvas 2D）。运行时不逐帧画它们，而是各烘焙一次成贴图（见 world.js）。
// 原点约定：x = 0 是障碍左边缘 / 地标锚点，y = 0 是地面，向上为负。
import { roundRect, INK, text } from './draw.js';
import { OBSTACLES } from '../data/obstacles.js';
import { STORE } from '../data/events.js';
import { puddle, curb, boxes, bike, ebike, leash, leashLady, manhole, warnSign, wetSign, officeChair, coin } from './props.js';
import { drawPerson, idlePose } from './rig.js';

const st = (g, w = 2.2) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };

// 每种障碍烘焙时的画布范围：[左, 上, 宽, 高]（相对障碍左边缘和地面）
export function obstacleBox(type) {
  const T = OBSTACLES[type], w = T.w;
  const box = (L, top, R = L, below = 12) => [-L, -top, w + L + R, top + below];
  switch (type) {
    case 'leash': return box(8, 44, 30);
    case 'manhole': return box(6, 16, 36);
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
    // 下面几样的颜色跟着美术图的换色走：台阶黄踏步边、单车蓝车架、遛狗绳荧光绿、楼道电动车黄车身
    case 'step': curb(g, x, 0, T.w, T.ground, '#FFD60A'); break;
    case 'bike': bike(g, x, 0, T.w, 0, null, -1, '#1FA2FF'); break;
    case 'leash': leash(g, x, 0, T.w, 0); break;
    case 'manhole': manhole(g, x, 0, T.w, 0); break;              // 前面的施工牌不会撞：单独画、不加外圈（warnSignPropVec）
    case 'ebikeHall': ebike(g, x - 8, 0, 80, 0, false, '#FFD60A'); break;
    case 'cone': cone(g, x, T.w, T.ground); break;
    case 'bin': bin(g, x, T.w, T.ground); break;
    case 'trike': trike(g, x, T.w, T.ground); break;
    case 'scooter': scooterKid(g, x); break;
    case 'banner': hanging(g, x, T, '#e74c3c', 'Q4 冲刺！', '#ffe08a'); break;
    case 'shopbar': hanging(g, x, T, '#f7b731', '烤串 · 啤酒', '#2b2233'); break;
    case 'scaffold': scaffold(g, x, T); break;
    case 'sheet': sheet(g, x, T, 0); break;
    case 'gate': hanging(g, x, T, '#9aa3b5', '', '#fff'); break;
    case 'cardoor': carDoor(g, x, T.w, T.ground); break;
    case 'splash': puddle(g, x, 0, T.w, 0); break;              // 水坑本身照画，水墙另外叠（splashVec）
    case 'mop': mopBucket(g, x, T.w, T.ground); break;
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
  // 只能滑的障碍底边的蓝白斜纹在 world.js 里统一画（有没有美术图都一样）
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
// 楼梯间的拖把水桶（兜底）：亮黄圆角桶 + 灰色挤水器 + 斜靠的拖把杆（整个剪影不高出判定框）
function mopBucket(g, x, w, h) {
  g.strokeStyle = '#E8D7B0'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 10, -h * 0.55); g.lineTo(x + 4, -h + 1); g.stroke();
  g.fillStyle = '#8E8AA6'; roundRect(g, x + w * 0.52, -h * 0.82, w * 0.36, h * 0.34, 3); g.fill(); st(g, 1.6);
  g.fillStyle = '#FFD60A'; roundRect(g, x + 2, -h * 0.58, w - 4, h * 0.5, 4); g.fill(); st(g);
  g.fillStyle = '#E0B400'; g.fillRect(x + w - 10, -h * 0.5, 5, h * 0.36);
  g.fillStyle = INK; for (const cx of [x + 8, x + w - 8]) { g.beginPath(); g.arc(cx, -4, 3.5, 0, Math.PI * 2); g.fill(); }
}
// 违停车的后门（兜底）：深紫灰门板 + 淡蓝车窗 + 左缘一条车漆外沿和两个铰链，铰链在左、自由边在右
function carDoor(g, x, w, h) {
  const win = h * 0.38;
  g.fillStyle = '#8FA3BF'; roundRect(g, x, -h, 6, h, 2); g.fill(); st(g, 1.6);
  g.fillStyle = '#4B4458'; g.beginPath(); g.moveTo(x + 4, -h); g.lineTo(x + w - 8, -h + 2); g.lineTo(x + w, -h + win); g.lineTo(x + w - 1, -3); g.quadraticCurveTo(x + w - 1, 0, x + w - 4, 0); g.lineTo(x + 4, 0); g.closePath(); g.fill(); st(g);
  g.fillStyle = '#C9CCF2'; g.beginPath(); g.moveTo(x + 7, -h + 4); g.lineTo(x + w - 9, -h + 5); g.lineTo(x + w - 4, -h + win - 2); g.lineTo(x + 7, -h + win - 2); g.closePath(); g.fill(); st(g, 1.4);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 11, -h + win - 5); g.lineTo(x + 17, -h + 7); g.stroke();
  g.fillStyle = '#6B6478'; roundRect(g, x + 8, -h * 0.42, w - 13, 5, 2); g.fill(); st(g, 1.2);
  g.fillStyle = '#E8283C'; g.fillRect(x + w - 9, -7, 5, 3);
  g.fillStyle = INK; for (const yy of [-h * 0.72, -h * 0.3]) g.fillRect(x - 1.5, yy, 4, 5);
}
// 溅水水墙：k = 0.4 / 0.8 / 1.0 三帧（升起 → 满 → 落），烘焙时加米白外圈（会撞的）。原点 = 水坑左缘、地面
export function splashVec(g, k) {
  g.fillStyle = '#5BC0EB'; g.beginPath(); g.ellipse(28, -2, 30, 4, 0, 0, Math.PI * 2); g.fill(); st(g, 1.4);
  const xs = [4, 13, 22, 32, 42, 51], hs = [16, 24, 30, 30, 26, 16];
  for (let i = 0; i < 6; i++) {
    const cx = xs[i], hh = hs[i] * k, lean = (i - 2.5) * 0.9;
    g.beginPath(); g.moveTo(cx - 5, -1); g.quadraticCurveTo(cx - 4 + lean, -hh * 0.6, cx + lean * 1.6, -hh); g.quadraticCurveTo(cx + 4 + lean, -hh * 0.6, cx + 5, -1); g.closePath();
    g.globalAlpha = 0.9; g.fillStyle = '#7FD4FF'; g.fill(); g.globalAlpha = 1;
    g.lineWidth = 1.8; g.strokeStyle = INK; g.stroke();
    g.strokeStyle = '#E8FAFF'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + lean * 0.4, -3); g.lineTo(cx + lean * 1.2, -hh * 0.75); g.stroke();
  }
  const drops = [[8, -22, 2.4], [18, -30, 2], [27, -34, 3], [37, -31, 2.2], [47, -26, 2.6], [55, -18, 2]];
  for (const [dx, dy, r] of drops) { const y = -2 + (dy + 2) * Math.min(1, k + 0.15); g.fillStyle = '#E8FAFF'; g.beginPath(); g.arc(dx, Math.max(-34, y), r, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke(); }
}
export const SPLASH_BOX = [-6, -40, 70, 46];
// 马路上的车（兜底）：圆角车身 + 车厢 + 车窗 + 两个轮子，朝右；原点在左下角（轮子底）
export const CAR_VEC = {
  sedan: { w: 106, h: 60, body: '#8FA3BF', low: '#7A8DAA' },
  taxi: { w: 115, h: 66, body: '#F5C84C', low: '#2F6F68', sign: true },
  suv: { w: 121, h: 70, body: '#EDEAF0', low: '#C9C3D6' },
  van: { w: 107, h: 78, body: '#7FC8B0', low: '#6AB39B', box: true },
  parked: { w: 106, h: 60, body: '#9BA3B4', low: '#878FA2' },
};
export function carVec(g, id) {
  const c = CAR_VEC[id], w = c.w, h = c.h, r = h * 0.17;
  const top = c.sign ? -h + 6 : -h;
  if (c.sign) { g.fillStyle = '#fff'; roundRect(g, w * 0.42, -h, w * 0.16, 7, 2); g.fill(); st(g, 1.4); }
  g.fillStyle = c.body;
  if (c.box) roundRect(g, 2, top, w - 6, h - r, 10); else { roundRect(g, w * 0.16, top, w * 0.6, h * 0.42, 12); g.fill(); st(g); roundRect(g, 1, -h * 0.62, w - 2, h * 0.62 - r * 0.6, 12); }
  g.fill(); st(g);
  g.fillStyle = c.low; g.fillRect(4, -h * 0.34, w - 8, h * 0.18);
  g.fillStyle = '#C9CCF2';
  if (c.box) { roundRect(g, w * 0.72, top + 8, w * 0.2, h * 0.3, 4); g.fill(); st(g, 1.4); g.fillStyle = '#F6EBD2'; roundRect(g, w * 0.36, top + 8, w * 0.22, h * 0.6, 4); g.fill(); st(g, 1.4); }
  else for (const [a, b] of [[0.22, 0.44], [0.47, 0.7]]) { roundRect(g, w * a, top + 6, w * (b - a), h * 0.27, 5); g.fill(); st(g, 1.4); }
  for (const wx of [w * 0.22, w * 0.78]) { g.fillStyle = INK; g.beginPath(); g.arc(wx, -r, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#F6EBD2'; g.beginPath(); g.arc(wx, -r, r * 0.45, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#FFF1C2'; g.beginPath(); g.arc(w - 4, -h * 0.47, 4, 0, Math.PI * 2); g.fill(); st(g, 1.2);
  g.fillStyle = '#E8283C'; roundRect(g, 0, -h * 0.55, 4, 9, 2); g.fill();
}
// 冲刺：鞋底提示环（30×8 椭圆环 + 右边一个小 ▶），原点在脚底中点。under：衬底色（青环衬白、灰环衬深紫：公司浅紫地面上灰环也看得见）
export function dashRingVec(g, color, under = '#fff') {
  g.beginPath(); g.ellipse(0, 0, 16, 4.5, 0, 0, Math.PI * 2);
  g.globalAlpha = 0.22; g.fillStyle = color; g.fill(); g.globalAlpha = 1;
  g.strokeStyle = under; g.lineWidth = 4.8; g.stroke();
  g.strokeStyle = color; g.lineWidth = 2.6; g.stroke();
  g.fillStyle = color; g.beginPath(); g.moveTo(19, -3.5); g.lineTo(26, 0); g.lineTo(19, 3.5); g.closePath(); g.fill();
  g.lineWidth = 1.2; g.strokeStyle = under; g.stroke();
}
// ▶▶ 地面标记：白色圆角底板 34×12 + 两个青色人字箭头。原点在底板中心
export function dashMarkVec(g, shift = 0) {
  g.globalAlpha = 0.92; g.fillStyle = '#fff'; roundRect(g, -17, -6, 34, 12, 4); g.fill(); g.globalAlpha = 1;
  g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
  g.strokeStyle = '#00B8D9'; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const cx of [-4.5 + shift, 4.5 + shift]) { g.beginPath(); g.moveTo(cx - 3.5, -4); g.lineTo(cx + 3.5, 0); g.lineTo(cx - 3.5, 4); g.stroke(); }
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
// 不会撞的陪衬：遛狗的大妈、井盖前的施工牌（没外圈）。原点 = 所属障碍的 x（施工牌画在 x − 40）
export const LEASH_LADY_BOX = [-44, -84, 50, 88], WARN_SIGN_BOX = [-8, -66, 36, 70];
export const leashLadyVec = g => leashLady(g, 0, 0);
export const warnSignPropVec = g => warnSign(g, 0, 0);
// 右缘预警牌：白底圆角方牌 + 红「!」，左边一个指向左的小三角（提示「从右边冲过来」）。原点在牌子中心
export function warnSignVec(g) {
  g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(-14, -7); g.lineTo(-22, 0); g.lineTo(-14, 7); g.closePath(); g.fill(); st(g, 2.2);
  g.fillStyle = '#FFFFFF'; roundRect(g, -14, -14, 28, 28, 6); g.fill(); st(g, 2.2);
  text(g, '!', 0, 1, { size: 20, color: '#E8283C' });
}
export { ebike };
