// NPC 外观：每人一个剪影级道具 + 一个主色，64px 头像和远处剪影里都能一眼认出。
import { roundRect, INK } from './draw.js';
import { LOOKS } from './rig.js';
import { setAddressGender } from '../data/address.js';

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
// 外卖小哥的外卖袋：14×12 的黄色圆角方袋 + 提手（和马路上那个外卖小哥同一身行头：珊瑚红头盔、奶油色风衣）
const takeoutBag = (g, x, y) => {
  g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - 3, y); g.quadraticCurveTo(x + 2, y - 6, x + 7, y); g.stroke();
  g.fillStyle = '#FFC529'; roundRect(g, x - 5, y, 14, 12, 3); g.fill(); st(g, 1.8);
};
// 家里人的手持道具（矢量兜底；AI 小臂图里已经画了）：遥控器、游戏手柄、恐龙玩偶、吸管杯；奶奶的一碗饺子单独画（homes.js，端平不跟着手腕转）
const remote = (g, x, y) => { g.fillStyle = '#2b2233'; roundRect(g, x - 2, y - 2, 5, 13, 2); g.fill(); g.fillStyle = '#ff6b5a'; g.fillRect(x - 0.5, y + 1, 2, 2); };
const gamepad = (g, x, y) => { g.fillStyle = '#8a8f9e'; roundRect(g, x - 6, y - 1, 13, 8, 4); g.fill(); st(g, 1.4); g.fillStyle = INK; g.fillRect(x - 3, y + 2, 3, 1.4); g.beginPath(); g.arc(x + 4, y + 2.5, 1.2, 0, Math.PI * 2); g.fill(); };
const dino = (g, x, y) => { g.fillStyle = '#4caf7a'; g.beginPath(); g.ellipse(x + 1, y + 6, 4, 5, 0, 0, Math.PI * 2); g.fill(); st(g, 1.4); g.beginPath(); g.arc(x + 4, y + 1, 3, 0, Math.PI * 2); g.fill(); st(g, 1.4); };
const sippy = (g, x, y) => { g.fillStyle = '#5bb8c4'; roundRect(g, x - 3, y, 7, 9, 2); g.fill(); st(g, 1.4); g.fillStyle = '#ff8a7a'; g.fillRect(x - 3, y - 2, 7, 3); g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 1, y - 2); g.lineTo(x + 2, y - 6); g.stroke(); };
const headphones = (g, r) => { g.strokeStyle = '#8a8f9e'; g.lineWidth = 2.4; g.beginPath(); g.arc(-1, 6, r - 2, 0.3 * Math.PI, 0.75 * Math.PI); g.stroke(); g.fillStyle = '#ff8a7a'; g.beginPath(); g.arc(-4, r - 1, 3.4, 0, Math.PI * 2); g.fill(); st(g, 1.4); };
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
  // 电梯里的外卖小哥（还没有骨骼美术，一直用这套矢量：珊瑚红头盔 + 黄外卖袋，和马路上那位同一配色）
  xiaoge: { skin: '#ffd2b0', hair: '#f26b5b', hairStyle: 'helmet', shirt: '#f3e9d8', jacket: '#f3e9d8', pants: '#2f3b52', shoes: '#2b2233', mouth: 'open', holding: takeoutBag, color: '#f26b5b' },
  // 家庭剧本的家里人（立绘是 AI 出图 chars.dad / dapeng / duoduo / laolao / nainai；这里是图没加载时的兜底）。橘子是猫，用三张姿势图（homes.js）
  dad: { skin: '#f2c6a0', hair: '#8a8a8a', hairStyle: 'slick', shirt: '#ffffff', jacket: '#7a9e7e', pants: '#4a4f63', shoes: '#2b2233', eyes: 'squint', holding: remote, scale: 1.02, color: '#7a9e7e' },
  dapeng: { skin: '#f2c6a0', hair: '#2b2233', hairStyle: 'slick', shirt: '#2e6b4f', jacket: '#2e6b4f', pants: '#2b2233', shoes: '#f7d046', eyes: 'squint', mouth: 'smile', hat: headphones, holding: gamepad, scale: 1.06, color: '#2e6b4f' },
  duoduo: { skin: '#ffd8bd', hair: '#3a2b2b', hairStyle: 'bob', shirt: '#ffd166', jacket: '#ffd166', pants: '#ff9fc0', shoes: '#ffffff', mouth: 'open', holding: dino, scale: 0.62, headK: 1.12, color: '#ffd166' },
  laolao: { skin: '#f2c6a0', hair: '#9a9a9a', hairStyle: 'perm', shirt: '#8e4f7a', jacket: '#8e4f7a', pants: '#6b7a3a', shoes: '#e8d8b8', eyes: 'glasses', mouth: 'open', holding: sippy, scale: 0.96, color: '#8e4f7a' },
  nainai: { skin: '#f2c6a0', hair: '#eeeeee', hairStyle: 'bun', shirt: '#2f3e6b', jacket: '#2f3e6b', pants: '#2b2233', shoes: '#2b2233', eyes: 'happy', mouth: 'smile', scale: 0.9, color: '#2f3e6b' },
};
// 主角：男 / 女两套外观（立绘 chars.player / chars.playerF），按存档 save.gender 取。画主角的地方一律用 hero()，别直接拿某一套
export const HEROES = { m: LOOKS.player, f: LOOKS.playerF };
HEROES.m.id = 'player'; HEROES.f.id = 'playerF';
for (const [id, l] of Object.entries(NPC_LOOKS)) l.id = id;     // 烘焙部件按 id 缓存
let heroG = 'm';
// 换主角：外观和称呼表一起换（main.js 开局、选主角页确认、调试参数 ?gender=f 调它）
export function setHero(g) { heroG = g === 'f' ? 'f' : 'm'; setAddressGender(heroG); }
export const heroGender = () => heroG;
export const hero = () => HEROES[heroG];
export const heroOf = g => HEROES[g === 'f' ? 'f' : 'm'];
// 'player' = 当前主角（头像、开局交代的气泡）；'playerF' 指定女主角
export const lookOf = id => (id === 'playerF' ? HEROES.f : id === 'player' ? hero() : NPC_LOOKS[id] || hero());
