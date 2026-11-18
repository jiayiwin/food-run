// NPC 外观：每人一个剪影级道具 + 一个主色，64px 头像和远处剪影里都能一眼认出。
import { roundRect, INK } from './draw.js';
import { LOOKS } from './rig.js';

const st = (g, w = 1.8) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };

const thermos = (g, x, y) => { g.fillStyle = '#3d7a5a'; roundRect(g, x - 3, y - 13, 7, 14, 2); g.fill(); st(g); g.fillStyle = '#9aa3b5'; g.fillRect(x - 3, y - 15, 7, 3); };
const milkTea = (g, x, y) => {
  g.fillStyle = '#f3dcc0'; g.beginPath(); g.moveTo(x - 4, y - 14); g.lineTo(x + 5, y - 14); g.lineTo(x + 3.5, y + 1); g.lineTo(x - 2.5, y + 1); g.closePath(); g.fill(); st(g, 1.6);
  g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + 1, y - 14); g.lineTo(x + 4, y - 20); g.stroke();
  g.fillStyle = INK; for (const [a, b] of [[-1, -2], [1.5, -3], [0, -1]]) { g.beginPath(); g.arc(x + a, y + b, 1.1, 0, Math.PI * 2); g.fill(); }
};
const megaphone = (g, x, y) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 12, y - 10); g.lineTo(x + 12, y + 4); g.lineTo(x, y); g.closePath(); g.fill(); st(g); g.fillStyle = '#ff6b5a'; g.fillRect(x - 3, y - 4, 4, 5); };
const scissors = (g, x, y) => { g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y - 9); g.moveTo(x + 2, y - 8); g.lineTo(x + 10, y - 1); g.stroke(); g.fillStyle = '#ff6b5a'; g.beginPath(); g.arc(x - 1, y + 1, 2.4, 0, Math.PI * 2); g.fill(); };
const laptop = (g, x, y) => { g.save(); g.translate(x, y); g.rotate(-0.25); g.fillStyle = '#9aa3b5'; roundRect(g, -2, -14, 16, 12, 2); g.fill(); st(g, 1.6); g.fillStyle = '#7fd1ff'; g.fillRect(0, -12, 12, 8); g.restore(); };
const basket = (g, x, y) => {
  g.fillStyle = '#c98a4b'; g.beginPath(); g.arc(x + 2, y + 2, 8, 0, Math.PI); g.closePath(); g.fill(); st(g, 1.6);
  g.strokeStyle = '#5cb85c'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - 2, y + 2); g.lineTo(x - 6, y - 12); g.moveTo(x + 2, y + 2); g.lineTo(x + 1, y - 13); g.stroke();
};
const flashlight = (g, x, y) => { g.fillStyle = '#2b2233'; roundRect(g, x - 2, y - 3, 12, 6, 2); g.fill(); g.fillStyle = 'rgba(255,240,150,.45)'; g.beginPath(); g.moveTo(x + 10, y - 2); g.lineTo(x + 40, y - 12); g.lineTo(x + 40, y + 12); g.lineTo(x + 10, y + 2); g.fill(); };
const spatula = (g, x, y) => { g.strokeStyle = '#7a4a3a'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + 6, y - 12); g.stroke(); g.fillStyle = '#c9ced8'; roundRect(g, x + 3, y - 20, 8, 9, 2); g.fill(); st(g, 1.4); };
const guardCap = (g, r) => { g.fillStyle = '#2f4a7a'; g.beginPath(); g.ellipse(0, -r + 2, r + 2, 6, 0, Math.PI, 0); g.fill(); st(g); g.fillStyle = INK; g.fillRect(-2, -r + 1, r + 9, 3); g.fillStyle = '#f7c948'; g.beginPath(); g.arc(1, -r - 1, 2.2, 0, Math.PI * 2); g.fill(); };

export const NPC_LOOKS = {
  laoliu: { skin: '#f2c6a0', hair: '#5a4a3a', hairStyle: 'bald', shirt: '#ffffff', pants: '#4a4f63', shoes: '#2b2233', tie: '#c0392b', eyes: 'squint', holding: thermos, scale: 1.04, color: '#c0392b' },
  ajie: { skin: '#ffd2b0', hair: '#3a2b2b', hairStyle: 'messy', shirt: '#b8c0cf', jacket: '#9aa3b5', pants: '#2f3b52', shoes: '#ffffff', eyes: 'glasses', mouth: 'open', holding: milkTea, color: '#7f8fa6' },
  lili: { skin: '#ffd8bd', hair: '#2b2233', hairStyle: 'bob', shirt: '#ff9f43', jacket: '#ff9f43', pants: '#34495e', shoes: '#ff6b5a', mouth: 'smile', eyes: 'happy', holding: megaphone, color: '#ff9f43' },
  tony: { skin: '#f2c6a0', hair: '#f7d046', hairStyle: 'pompadour', shirt: '#2b2233', jacket: '#2b2233', pants: '#2b2233', shoes: '#ffffff', apron: '#5a4a7a', mouth: 'smile', holding: scissors, color: '#f7d046' },
  amy: { skin: '#ffd8bd', hair: '#5a3e2b', hairStyle: 'bun', shirt: '#d1c4e9', jacket: '#b39ddb', pants: '#3d3d5c', shoes: '#2b2233', holding: laptop, color: '#9575cd' },
  wang: { skin: '#f2c6a0', hair: '#6b4a3a', hairStyle: 'perm', shirt: '#ff6b9d', jacket: '#ff6b9d', pants: '#5a4a7a', shoes: '#2b2233', mouth: 'open', holding: basket, scale: 0.94, color: '#ff6b9d' },
  zhou: { skin: '#e8b48f', hair: '#2b2233', hairStyle: 'slick', shirt: '#2f4a7a', jacket: '#2f4a7a', pants: '#24395f', shoes: '#2b2233', eyes: 'squint', hat: guardCap, holding: flashlight, color: '#2f4a7a' },
  mom: { skin: '#ffd2b0', hair: '#3a2b2b', hairStyle: 'bun', shirt: '#e8a0bf', jacket: '#e8a0bf', pants: '#5a4a7a', shoes: '#ff6b5a', apron: '#fff3e0', mouth: 'flat', holding: spatula, color: '#e8a0bf' },
};
export const PLAYER = LOOKS.player;
PLAYER.id = 'player';
for (const [id, l] of Object.entries(NPC_LOOKS)) l.id = id;     // 烘焙部件按 id 缓存
export const lookOf = id => NPC_LOOKS[id] || PLAYER;
