// 跑道带：天空 → 远景 → 中景 → 地面 → 障碍 / 拾取 / NPC / 主角。镜头以主角脚底为中心随速度拉远。
import { TUNE, COURSE, CHASE } from '../data/tune.js';
import { OBSTACLES } from '../data/obstacles.js';
import { STORE } from '../data/events.js';
import { obstacleX, stageAt, lookAhead } from '../game/course.js';
import { clockMin } from '../game/run.js';
import { roundRect, INK, text, card, ease, clamp, lerp } from './draw.js';
import { drawSky, drawSkyline, drawMid, drawGround } from './scenery.js';
import { puddle, curb, boxes, bike, ebike, leash, manhole, warnSign, wetSign, officeChair, coin } from './props.js';
import { drawPerson, runPose, jumpPose, slidePose, stumblePose, idlePose, cheerPose, bikePose, mixPose } from './rig.js';
import { lookOf, PLAYER } from './looks.js';
import { drawParts, drawFloats } from './fx.js';
import { bgLayer, hasLayer, propArt, drawProp } from './art.js';

const themeAt = x => stageAt(x).id;
const st = (g, w = 2.2) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };

export function layout(screen) {
  const W = 375, H = screen.H, top = Math.max(screen.safeTop, 20), bottom = screen.safeBottom;
  const groundY = H - bottom - 150;
  return { W, H, top, bottom, groundY, hudY: top + 44, cardsY: groundY + 28, cardsH: H - bottom - 14 - (groundY + 28) };
}

// 世界 → 屏幕
export function view(run, L) {
  const z = run.zoom, camX = run.x - TUNE.playerX / z;
  return { z, camX, sx: wx => (wx - camX) * z, sy: wy => L.groundY + wy * z };
}

// 背景：天空（代码渐变）→ 远景 → 中景 → 地面。有美术图就用图，四个路段缺一张就整层回退到代码绘制。
export function drawBackdrop(g, L, camX, z, dusk, themeFn = themeAt) {
  drawSky(g, L.W, L.groundY, dusk, camX);
  if (hasLayer('far')) imageLayer(g, 'far', camX, L.W, L.groundY, themeFn);
  else drawSkyline(g, L.W, L.groundY, dusk, camX);
  g.save();
  g.translate(0, L.groundY); g.scale(z, z); g.translate(0, -L.groundY);
  const W = L.W / z, H = L.groundY + (L.H - L.groundY) / z;
  if (hasLayer('mid')) imageLayer(g, 'mid', camX, W, L.groundY, themeFn);
  else drawMid(g, W, L.groundY, themeFn, camX, dusk);
  if (hasLayer('ground')) imageLayer(g, 'ground', camX, W, L.groundY, themeFn);
  else drawGround(g, W, H, L.groundY, themeFn, camX);
  // 美术图不随天色变：统一压一层暮色
  if (dusk > 0 && (hasLayer('mid') || hasLayer('far'))) { g.fillStyle = `rgba(52,30,96,${0.3 * dusk})`; g.fillRect(0, 0, W, H); }
  g.restore();
}

// 横向平铺的图片层：每一格按它对应的世界坐标选路段，路段有多张变体时按格子编号确定性地挑一张。
// 各变体宽度可以不同，所以按「格子宽度 = 该层参考宽度」排位，图片按自身宽高画、左对齐。
const vhash = n => { let h = (n | 0) * 2654435761; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
function imageLayer(g, name, camX, W, groundY, themeFn) {
  const ref = bgLayer('street', name);
  const par = ref.par, tw = ref.w, off = camX * par;
  for (let k = Math.floor(off / tw); k * tw - off < W; k++) {
    const def = bgLayer(themeFn((k * tw + tw / 2) / par), name) || ref;
    const list = def.list || [def];
    const v = list[Math.floor(vhash(k) * list.length)];
    g.drawImage(v.img, k * tw - off, groundY - v.h + (def.dy || 0), tw + 0.5, v.h);
  }
}

export function drawWorld(g, run, L, vis, t) {
  const V = view(run, L), { z, camX } = V;
  const dusk = clamp((clockMin(run) - 18 * 60) / 75, 0, 1);
  drawBackdrop(g, L, camX, z, dusk);

  // 世界坐标：原点在地面线、世界 x = 0
  g.save();
  g.translate(0, L.groundY); g.scale(z, z); g.translate(-camX, 0);
  const x0 = camX - 80, x1 = camX + L.W / z + 120;
  landmarks(g, run, x0, x1, t);
  // 障碍
  const obs = run.course.obstacles;
  for (let i = Math.max(0, run.obIdx - 6); i < obs.length; i++) {
    const o = obs[i], ox = obstacleX(o, run.x);
    if (ox > x1) { if (o.x > x1 + 600) break; continue; }
    if (ox + OBSTACLES[o.type].w < x0) continue;
    drawObstacle(g, o, ox, t);
  }
  // 拾取
  for (const pk of run.course.pickups) {
    if (pk.x < x0) continue;
    if (pk.x > x1) break;
    if (pk.taken) continue;
    const pa = propArt(pk.kind);
    if (pa) { const s = pk.kind === 'coin' ? Math.abs(Math.cos(t * 4 + pk.x * 0.01)) * 0.8 + 0.2 : 1; g.save(); g.translate(pk.x, pk.y + (pk.kind === 'bun' ? Math.sin(t * 4 + pk.x) * 3 : 0)); g.scale(s, 1); g.drawImage(pa.img, -pa.w / 2, -pa.h / 2, pa.w, pa.h); g.restore(); }
    else if (pk.kind === 'coin') coin(g, pk.x, pk.y, t + pk.x * 0.01);
    else bun(g, pk.x, pk.y + Math.sin(t * 4 + pk.x) * 3);
  }
  drawNpcs(g, run, V, L, vis, t);
  drawPlayer(g, run, t);
  drawParts(g, vis.fx, 'world');
  drawFloats(g, vis.fx, 'world');
  g.restore();

  edgeWarnings(g, run, V, L, t);
  if (run.v > 340 || run.ride) speedLines(g, run, L, t);
  // 饿到眼冒金星：四周泛黄
  if (run.sat < 25) {
    const a = 0.25 + 0.1 * Math.sin(t * 6);
    const gr = g.createRadialGradient(L.W / 2, L.groundY - 120, 120, L.W / 2, L.groundY - 120, 360);
    gr.addColorStop(0, 'rgba(255,200,80,0)'); gr.addColorStop(1, `rgba(220,150,40,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
  }
}

// ── 地标：工位、出口、小区大门、便利店、门禁、家门 ─────────────
function landmarks(g, run, x0, x1, t) {
  const inView = (a, b) => b > x0 && a < x1;
  // 工位（起点）
  const desk = propArt('desk');
  if (desk && inView(-200, 60)) drawProp(g, desk, -160);
  else if (inView(-200, 60)) {
    g.fillStyle = '#e8d8c8'; roundRect(g, -150, -46, 110, 8, 3); g.fill(); st(g);
    g.fillStyle = '#5b5866'; g.fillRect(-140, -38, 6, 38); g.fillRect(-56, -38, 6, 38);
    g.fillStyle = '#2b2233'; roundRect(g, -120, -86, 50, 34, 4); g.fill(); g.fillStyle = '#7fd1ff'; g.fillRect(-116, -82, 42, 26);
    g.fillStyle = '#5b5866'; g.fillRect(-98, -52, 6, 6);
    text(g, '18:00', -95, -69, { size: 11, color: '#2b2233' });
  }
  // 路段分界：出口 / 小区大门 / 楼门
  for (const s of COURSE.stages.slice(1)) {
    if (!inView(s.x0 - 100, s.x0 + 100)) continue;
    const x = s.x0;
    const gate = propArt('gate_' + s.id);
    if (gate) { drawProp(g, gate, x - gate.w / 2); continue; }
    if (s.id === 'street') { g.fillStyle = '#9aa3b5'; g.fillRect(x - 46, -150, 10, 150); g.fillRect(x + 36, -150, 10, 150); g.fillStyle = '#5cb85c'; roundRect(g, x - 34, -146, 68, 22, 4); g.fill(); st(g); text(g, '出口 EXIT', x, -135, { size: 12, color: '#fff' }); }
    if (s.id === 'park') { g.fillStyle = '#c0392b'; g.fillRect(x - 60, -160, 14, 160); g.fillRect(x + 46, -160, 14, 160); roundRect(g, x - 70, -176, 140, 28, 6); g.fill(); st(g); text(g, '幸福里小区', x, -162, { size: 15, color: '#ffe08a' }); }
    if (s.id === 'home') { g.fillStyle = '#8d6e63'; roundRect(g, x - 50, -170, 100, 170, 4); g.fill(); st(g); g.fillStyle = '#5d4037'; g.fillRect(x - 36, -140, 72, 140); text(g, '3 栋', x, -156, { size: 13, color: '#fff' }); }
  }
  // 便利店 / 门禁：读题槽附近
  for (const slot of COURSE.slots) {
    if (slot.kind === 'store' && inView(slot.x + 40, slot.x + 300)) { const a = propArt('store'); if (a) drawProp(g, a, slot.x + 50); else storeFront(g, slot.x + 120, t, run); }
    if (slot.kind === 'gate' && inView(slot.x + 100, slot.x + 400)) { const a = propArt('gateBooth'); if (a) drawProp(g, a, slot.x + 240); else gateBooth(g, slot.x + 240, run); }
  }
  // 家门
  if (inView(COURSE.end - 120, COURSE.end + 120)) {
    const x = COURSE.end + 10, open = run.ending ? clamp(run.ending.t / 0.5, 0, 1) : 0;
    g.fillStyle = '#6d4c41'; g.fillRect(x - 6, -132, 74, 132);
    g.fillStyle = '#ffe9b0'; g.fillRect(x, -126, 62, 126);
    g.save(); g.translate(x, -126); g.scale(1 - open * 0.85, 1);
    g.fillStyle = '#a1887f'; g.fillRect(0, 0, 62, 126); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(0, 0, 62, 126);
    g.fillStyle = '#f7c948'; g.beginPath(); g.arc(50, 66, 4, 0, Math.PI * 2); g.fill();
    g.restore();
    text(g, '家', x + 31, -146, { size: 16, color: '#fff', lw: 4 });
  }
}

function storeFront(g, x, t, run) {
  g.fillStyle = '#ffffff'; roundRect(g, x - 70, -150, 160, 150, 6); g.fill(); st(g);
  g.fillStyle = '#2e86de'; roundRect(g, x - 70, -150, 160, 30, 6); g.fill(); st(g);
  text(g, STORE.name + ' 24h', x + 10, -135, { size: 15, color: '#fff' });
  g.fillStyle = 'rgba(255,236,170,.9)'; g.fillRect(x - 58, -110, 64, 70); g.fillRect(x + 18, -110, 60, 110);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x - 58, -110, 64, 70); g.strokeRect(x + 18, -110, 60, 110);
  // 关东煮热气
  for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; g.globalAlpha = 1 - k; g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 26 + Math.sin(k * 6 + i) * 4, -60 - k * 30, 5 + k * 4, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  void run;
}
function gateBooth(g, x, run) {
  g.fillStyle = '#e0e0e0'; roundRect(g, x + 30, -110, 70, 110, 4); g.fill(); st(g);
  g.fillStyle = '#7fd1ff'; g.fillRect(x + 40, -96, 50, 30);
  text(g, '门卫', x + 65, -40, { size: 12, color: '#2b2233' });
  const opened = run.choice && run.choice.kind === 'npc' && run.choice.npc === 'zhou' && run.choice.res && run.choice.res.good;
  g.fillStyle = '#5b5866'; g.fillRect(x, -60, 10, 60);
  g.save(); g.translate(x + 5, -54); g.rotate(opened ? -1.2 : 0);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c0392b' : '#fff'; g.fillRect(-120 + i * 20, -3, 20, 6); }
  g.restore();
}

// ── 障碍 ─────────────────────────────────────────────
export function drawObstacle(g, o, x, t) {
  const T = OBSTACLES[o.type];
  const art = propArt(o.type);
  if (art) {
    if (o.type === 'manhole') warnArt(g, x - 40);
    drawProp(g, art, x, { bob: T.vx ? Math.abs(Math.sin(t * 12 + o.id)) * -1.5 : 0 });
    return;
  }
  switch (o.type) {
    case 'filebox': boxes(g, x, 0, T.w, T.ground); break;
    case 'parcel': boxes(g, x, 0, T.w, T.ground); break;
    case 'chair': officeChair(g, x, 0, t); break;
    case 'wetsign': wetSign(g, x, 0); break;
    case 'puddle': puddle(g, x, 0, T.w, t); break;
    case 'step': curb(g, x, 0, T.w, T.ground); break;
    case 'bike': bike(g, x, 0, T.w, t, null, -1); break;
    case 'leash': leash(g, x, 0, T.w, t); break;
    case 'manhole': warnSign(g, x - 40, 0); manhole(g, x, 0, T.w, t); break;
    case 'ebikeHall': ebike(g, x - 8, 0, 80, 0, false); break;
    case 'cone': cone(g, x, T.w, T.ground); break;
    case 'bin': bin(g, x, T.w, T.ground); break;
    case 'trike': trike(g, x, T.w, T.ground); break;
    case 'scooter': scooterKid(g, x, t); break;
    case 'banner': hanging(g, x, T, '#e74c3c', 'Q4 冲刺！', '#ffe08a'); break;
    case 'shopbar': hanging(g, x, T, '#f7b731', '烤串 · 啤酒', '#2b2233'); break;
    case 'scaffold': scaffold(g, x, T); break;
    case 'sheet': sheet(g, x, T, t); break;
    case 'gate': hanging(g, x, T, '#9aa3b5', '', '#fff'); break;
    default: g.fillStyle = '#f0f'; g.fillRect(x, -(T.ground || 20), T.w, T.ground || 20);
  }
}
function warnArt(g, x) { const a = propArt('warnSign'); if (a) drawProp(g, a, x); else warnSign(g, x, 0); }
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
  g.fillStyle = '#fff'; text(g, '快递', x + w / 2 + 6, -h / 2 - 6, { size: 11, color: '#fff' });
}
function scooterKid(g, x, t) {
  g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x + 2, -4); g.lineTo(x + 28, -4); g.moveTo(x + 4, -4); g.lineTo(x + 2, -40); g.lineTo(x + 10, -40); g.stroke();
  g.fillStyle = '#ff6b5a'; for (const wx of [x + 4, x + 26]) { g.beginPath(); g.arc(wx, -3, 3.5, 0, Math.PI * 2); g.fill(); }
  drawPerson(g, x + 16, -6, { skin: '#ffd8bd', hair: '#2b2233', hairStyle: 'bob', shirt: '#7bed9f', jacket: '#7bed9f', pants: '#3742fa', shoes: '#fff', mouth: 'open', scale: 0.62 }, { ...idlePose(t), shR: 70, elR: 10, shL: 60, elL: 10, hipR: 10, hipL: -12, lean: -6 }, { flip: -1 });
}
// 悬空障碍：整块画实，不留「看起来能钻 / 能跳」的空当
function hanging(g, x, T, color, label, ink) {
  const [b, top] = T.overhead;
  g.fillStyle = '#5b5866'; g.fillRect(x + 4, -top - 30, 4, 30); g.fillRect(x + T.w - 8, -top - 30, 4, 30);
  g.fillStyle = color; roundRect(g, x, -top, T.w, top - b, 4); g.fill(); st(g);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 2, -b - 8, T.w - 4, 6);
  if (label) text(g, label, x + T.w / 2, -(top + b) / 2, { size: 13, color: ink, maxW: T.w - 8 });
  // 底边黄黑警示
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
function bun(g, x, y) {
  g.fillStyle = 'rgba(255,240,180,.5)'; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(x, y + 2, 11, 9, 0, Math.PI, 0); g.lineTo(x + 11, y + 5); g.lineTo(x - 11, y + 5); g.closePath(); g.fill(); st(g, 1.8);
  g.strokeStyle = '#d9c3a0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 3, y - 5); g.lineTo(x, y - 1); g.lineTo(x + 3, y - 5); g.stroke();
}

// ── NPC：读题前站在前方，读题时朝主角走来（走到跟前 = 时间到），选完被甩下 / 变成追兵 ─────
function drawNpcs(g, run, V, L, vis, t) {
  const toW = sx => V.camX + sx / V.z;
  const pend = run.pending;
  if (pend && pend.q) {
    const look = lookOf(pend.q.npc);
    if (pend.slot.kind === 'mom') {
      drawPerson(g, COURSE.end + 30, 0, look, idlePose(t), { flip: -1 });
    } else {
      drawPerson(g, pend.wx, 0, look, idlePose(t), { flip: -1 });
      text(g, NPCNAME(pend.q.npc), pend.wx, -84, { size: 12, color: '#fff', lw: 3 });
    }
  }
  const c = run.choice;
  if (c && (c.kind === 'npc' || c.kind === 'mom')) {
    const look = lookOf(c.npc);
    if (c.kind === 'mom') {
      drawPerson(g, COURSE.end + 30, 0, look, c.phase === 'result' && c.res.good === true ? cheerPose(t) : idlePose(t), { flip: -1 });
    } else if (c.phase === 'open') {
      const k = ease.inOutSine(clamp(c.t / c.T, 0, 1));
      const sx0 = V.sx(c.wx), sx = lerp(sx0, TUNE.playerX + 44, k);
      drawPerson(g, toW(sx), 0, look, runPose((t * 1.4) % 1, 0.2), { flip: -1 });
      vis.npcSX = sx;
    }
  }
  // 事件：外卖小哥从身后骑上来并排；便利店气泡指向店门
  if (c && c.kind === 'ride') {
    const k = c.phase === 'open' ? ease.outCubic(clamp(c.t / (c.T * 0.6), 0, 1)) : 1;
    const gone = c.phase === 'result' && c.picked !== 0 ? c.rt * 600 : 0;
    const wx = run.x - 150 + 110 * k + gone;
    ebike(g, wx, 0, 80, t);
    vis.npcSX = V.sx(wx + 40);
  }
  if (c && c.kind === 'store') vis.npcSX = V.sx(c.x + 130);
  // 选完：好 → 愣在原地被甩下；坏 → 由追兵接管
  const gh = vis.ghost;
  if (gh && gh.good) {
    const age = t - gh.t;
    if (age < 1.6) drawPerson(g, gh.wx, 0, lookOf(gh.npc), { ...idlePose(t), head: -12, shR: 30, elR: 80 }, { flip: -1, alpha: 1 - age / 1.6 });
  }
  // 追兵
  const ch = run.chaser, cs = run.cutscene;
  if (ch || (cs && cs.kind === 'caught')) {
    const npc = ch ? ch.npc : cs.npc;
    let sx = ch ? TUNE.playerX - 34 - clamp(ch.gap, 0, 150) * 0.55 : TUNE.playerX - 16;
    if (ch && vis.chaseFrom && t - vis.chaseFrom.t < 0.5) sx = lerp(vis.chaseFrom.sx, sx, ease.outCubic((t - vis.chaseFrom.t) / 0.5));
    const pose = cs ? { ...idlePose(t), shR: 80, elR: 10, lean: 12 } : runPose((t * 2.6) % 1, 1.2);
    const look = { ...lookOf(npc), eyes: 'squint', mouth: 'open' };
    drawPerson(g, toW(sx), 0, look, pose, { flip: 1 });
    if (ch) {
      // 甩开进度
      const wx = toW(sx), k = clamp(ch.gap / CHASE.escape, 0, 1), danger = ch.gap < 30;
      card(g, wx - 24, -104, 48, 12, 6, '#fff', { lw: 1.6, shadow: 0 });
      g.fillStyle = danger ? '#e74c3c' : '#2ecc71'; roundRect(g, wx - 22, -102, 44 * k, 8, 4); g.fill();
      text(g, ch.phase === 'slow' ? '站住！' : '别跑！', wx, -118, { size: 13, color: '#fff', lw: 3, stroke: danger ? '#c0392b' : INK });
    }
  }
}
const NAMES = { laoliu: '老刘', ajie: '阿杰', lili: '莉莉', tony: 'Tony', amy: 'Amy', wang: '王阿姨', zhou: '老周', mom: '妈妈' };
export const NPCNAME = id => NAMES[id] || '';

// ── 主角 ─────────────────────────────────────────────
function drawPlayer(g, run, t) {
  const p = run.player, x = run.x;
  const look = { ...PLAYER };
  if (run.chaser) look.eyes = 'wide';
  if (run.sat < 25) look.mouth = 'open';
  if (run.intro > 0) { drawPerson(g, x, 0, look, run.intro > 0.5 ? { ...idlePose(t), head: -8 } : cheerPose(t)); return; }
  if (run.ending) {
    const e = run.ending.t;
    const dx = Math.min(1, e / 0.7) * 60;
    if (e < 0.8) drawPerson(g, x + dx, 0, look, runPose((t * 2.4) % 1, 0.6), { alpha: e < 0.6 ? 1 : 1 - (e - 0.6) / 0.2 });
    return;
  }
  if (run.ride) {
    ebike(g, x - 40, 0, 80, t);
    drawPerson(g, x - 22, -30, { ...look, eyes: 'happy' }, { ...bikePose(0.25), hipR: 90, knR: 90, hipL: 85, knL: 95, shR: 150, elR: 10, shL: 30, elL: 40, lean: -6 });
    return;
  }
  const cs = run.cutscene;
  if (cs && cs.kind === 'hole') {
    g.save(); g.beginPath(); g.rect(x - 60, -200, 120, 200); g.clip();
    drawPerson(g, x, p.y, { ...look, eyes: 'wide', mouth: 'open' }, cheerPose(t));
    g.restore(); return;
  }
  if (cs && cs.kind === 'caught') { drawPerson(g, x, 0, { ...look, eyes: 'wide', mouth: 'open' }, { ...runPose((t * 3) % 1, 0.6), lean: 24 }); return; }
  let pose;
  if (p.state === 'stumble') pose = stumblePose(t);
  else if (p.state === 'slide') {
    const el = p.slideTotal - p.slideT, k = Math.min(1, el / 0.06, p.slideT / 0.08);
    pose = mixPose(runPose(p.runPhase), slidePose(), Math.max(0, Math.min(1, k)));
  } else if (!p.onGround) pose = jumpPose(p.vy);
  else pose = runPose(p.runPhase, Math.min(1.4, run.v / 300));
  const blink = p.invulnT > 0 && Math.floor(t * 16) % 2 === 0;
  drawPerson(g, x, p.y, look, pose, { alpha: blink ? 0.45 : 1 });
}

// ── 屏幕空间：右缘预警、速度线 ─────────────────────────────
function edgeWarnings(g, run, V, L, t) {
  const ahead = lookAhead(run.vBase);
  for (let i = run.obIdx; i < run.course.obstacles.length; i++) {
    const o = run.course.obstacles[i], T = OBSTACLES[o.type];
    const ox = obstacleX(o, run.x);
    if (ox - run.x > ahead + run.vBase * 0.9) break;
    if (!T.warn || ox - run.x < ahead - 10) continue;
    const blinkOn = Math.floor(t * 8) % 2 === 0;
    const y = L.groundY - 34;
    g.fillStyle = blinkOn ? '#ff4757' : '#ffa502';
    g.beginPath(); g.moveTo(L.W - 8, y); g.lineTo(L.W - 34, y - 16); g.lineTo(L.W - 34, y + 16); g.closePath(); g.fill(); st(g, 2);
    text(g, '!', L.W - 25, y + 1, { size: 16, color: '#fff' });
  }
}
function speedLines(g, run, L, t) {
  const n = run.ride ? 14 : 8, k = run.ride ? 0.45 : 0.25 * clamp((run.v - 340) / 80, 0, 1);
  g.strokeStyle = `rgba(255,255,255,${k})`; g.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.3, y = L.groundY - 30 - ((seed * 7.1) % 200);
    const len = run.v * 0.12, x = L.W - ((t * run.v * 1.6 + seed * 40) % (L.W + len));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
  }
}

export { PLAYER };
