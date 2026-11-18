// 界面：HUD、读题气泡、A/B 卡、来电、便利店、提示、过场字卡、晚饭演出、暂停。
import { COURSE, RES, CHASE } from '../data/tune.js';
import { NPCS, MOM } from '../data/npcs.js';
import { STORE, CALLERS } from '../data/events.js';
import { isExcuse } from '../game/choice.js';
import { clockMin, fmtClock } from '../game/run.js';
import { roundRect, INK, text, wrap, card, ease, clamp, lerp, font } from './draw.js';
import { drawPerson, idlePose, cheerPose, POSE_BASE } from './rig.js';
import { lookOf, PLAYER } from './looks.js';
import { NPCNAME } from './world.js';

const TAG_COLORS = { 工作: '#3d7ad6', 身体: '#2ecc71', 家里: '#ff8a5c', 没钱: '#a1887f', 装傻: '#9b59b6', 真话: '#f7b731', 顶嘴: '#e74c3c', 顺从: '#7f8c8d', 花钱: '#16a085' };

// ── HUD ───────────────────────────────────────────────
export function drawHud(g, run, L, t, buttons) {
  const y = L.hudY;
  // 暂停
  card(g, 12, L.top + 2, 34, 34, 17, 'rgba(255,255,255,.85)', { lw: 2, shadow: 2 });
  g.fillStyle = INK; g.fillRect(23, L.top + 12, 4, 14); g.fillRect(31, L.top + 12, 4, 14);
  buttons.push({ id: 'pause', x: 6, y: L.top - 4, w: 46, h: 46 });

  // 饱腹
  const sat = clamp(run.sat, 0, 100), low = sat < RES.hungry;
  bowlIcon(g, 26, y + 8, low && Math.floor(t * 4) % 2 === 0);
  card(g, 42, y + 2, 104, 14, 7, 'rgba(255,255,255,.9)', { lw: 2, shadow: 0 });
  g.fillStyle = sat > 50 ? '#2ecc71' : sat > RES.hungry ? '#f39c12' : '#e74c3c';
  roundRect(g, 44, y + 4, 100 * sat / 100, 10, 5); g.fill();
  text(g, `¥${run.money}`, 18, y + 30, { size: 15, color: '#fff', lw: 3, align: 'left' });
  if (run.flags.energy) text(g, '⚡能量', 66, y + 30, { size: 12, color: '#f7c948', lw: 3, align: 'left' });

  // 时钟 + 回家进度
  const m = clockMin(run);
  text(g, fmtClock(m), L.W / 2, y + 8, { size: 26, color: '#fff', lw: 5 });
  const px = L.W / 2 - 56, pw = 112, k = clamp(run.x / COURSE.end, 0, 1);
  g.fillStyle = 'rgba(43,34,51,.45)'; roundRect(g, px, y + 26, pw, 6, 3); g.fill();
  for (const s of COURSE.stages.slice(1)) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(px + pw * s.x0 / COURSE.end - 0.5, y + 25, 1.5, 8); }
  g.fillStyle = '#ffd166'; roundRect(g, px, y + 26, pw * k, 6, 3); g.fill();
  houseIcon(g, px + pw + 9, y + 29);
  text(g, run.stage.name, L.W / 2, y + 42, { size: 11, color: '#fff', lw: 3 });

  // 饭盒（命）
  for (let i = 0; i < RES.boxes; i++) lunchbox(g, L.W - 30 - i * 30, y + 8, i < run.boxes);
  text(g, String(run.score), L.W - 16, y + 30, { size: 13, color: '#fff', lw: 3, align: 'right' });
  if (run.combo >= 3) text(g, `连击 ×${run.combo}`, L.W - 16, y + 46, { size: 12, color: '#ffd166', lw: 3, align: 'right' });
}

function bowlIcon(g, x, y, hot) {
  g.fillStyle = hot ? '#e74c3c' : '#fff'; g.beginPath(); g.arc(x, y - 1, 9, 0, Math.PI); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(x, y - 2, 8, 4, 0, Math.PI, 0); g.fill(); g.stroke();
}
function houseIcon(g, x, y) {
  g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x + 5, y); g.lineTo(x + 5, y + 6); g.lineTo(x - 5, y + 6); g.lineTo(x - 5, y); g.closePath(); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
}
export function lunchbox(g, x, y, ok, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = ok ? '#ff6b5a' : 'rgba(255,255,255,.35)'; roundRect(g, -12, -8, 24, 17, 4); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.fillStyle = ok ? '#ffd166' : 'rgba(255,255,255,.25)'; roundRect(g, -13, -11, 26, 6, 3); g.fill(); g.stroke();
  if (!ok) { g.strokeStyle = '#2b2233'; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -11); g.lineTo(1, -2); g.lineTo(-3, 3); g.lineTo(2, 9); g.stroke(); }
  g.restore();
}

// ── 读题气泡 ─────────────────────────────────────────
export function drawChoice(g, run, L, vis, t, buttons) {
  const c = run.choice;
  if (!c) return;
  const open = c.phase === 'open';
  const age = c.age;
  const pop = ease.outBack(clamp(age / 0.18, 0, 1));
  const bw = L.W - 32, bh = 122, bx = 16, by = L.groundY - 168 - bh;
  const res = c.res;
  g.save();
  g.translate(L.W / 2, by + bh); g.scale(pop, pop); g.translate(-L.W / 2, -(by + bh));

  if (c.kind === 'call') drawCallBubble(g, c, bx, by, bw, bh, t);
  else {
    const npc = c.kind === 'npc' ? NPCS[c.npc] : c.kind === 'mom' ? MOM : null;
    const fill = res ? (res.good === true ? '#eafff1' : res.good === 'mid' ? '#fff7e0' : '#ffecec') : '#ffffff';
    card(g, bx, by, bw, bh, 16, fill, { lw: 2.6 });
    // 气泡尾巴指向 NPC
    const tx = clamp(vis.npcSX || L.W - 80, bx + 30, bx + bw - 30);
    if (c.kind === 'mom') vis.npcSX = L.W - 40;
    g.fillStyle = fill; g.beginPath(); g.moveTo(tx - 12, by + bh - 2); g.lineTo(tx + 2, by + bh + 16); g.lineTo(tx + 12, by + bh - 2); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(tx - 12, by + bh); g.lineTo(tx + 2, by + bh + 16); g.lineTo(tx + 12, by + bh); g.stroke();
    // 头像 + 名字 + 性格标签
    if (npc) {
      avatar(g, c.npc, bx + 30, by + 30, 20);
      let nx = bx + 58;
      if (c.revisit) { card(g, nx, by + 14, 38, 20, 6, '#e74c3c', { lw: 1.6, shadow: 0 }); text(g, '记仇', nx + 19, by + 24, { size: 12, color: '#fff' }); nx += 44; }
      text(g, npc.name, nx, by + 24, { size: 17, color: INK, align: 'left' });
      g.font = font(17); const nw = g.measureText(npc.name).width;
      text(g, npc.role, nx + nw + 6, by + 25, { size: 11, color: '#8a7f95', weight: 400, align: 'left' });
      let tx2 = bx + bw - 12;
      for (const tr of npc.traits.slice().reverse()) {
        g.font = font(11); const w = g.measureText(tr).width + 12;
        tx2 -= w; card(g, tx2, by + 15, w, 18, 9, '#fff1d6', { lw: 1.4, shadow: 0 }); text(g, tr, tx2 + w / 2, by + 24, { size: 11, color: '#a0522d' }); tx2 -= 4;
      }
    } else {
      eventIcon(g, c.kind, bx + 30, by + 30, t);
      text(g, c.name, bx + 58, by + 24, { size: 17, color: INK, align: 'left' });
    }
    // 台词
    const line = res ? res.react || '' : c.line;
    const pre = !res && c.pre ? c.pre : null;
    if (pre) text(g, pre, bx + 58, by + 44, { size: 12, color: '#8a7f95', weight: 400, align: 'left' });
    const lines = wrap(g, line, bw - 36, 19);
    const ly = by + (pre ? 70 : 64) - (lines.length - 1) * 11;
    lines.slice(0, 2).forEach((s, i) => text(g, s, bx + bw / 2, ly + i * 24, { size: 19, color: res ? (res.good === true ? '#1e8449' : res.good === 'mid' ? '#9a6b00' : '#c0392b') : INK }));
    if (res && c.kind !== 'ride' && c.kind !== 'store') {
      const mark = res.good === true ? (res.reconcile ? '和解！' : '放行') : res.good === 'mid' ? '勉强放行' : c.kind === 'mom' ? '挨骂了' : '被缠上了！';
      card(g, bx + bw - 86, by + bh - 30, 76, 22, 11, res.good === true ? '#2ecc71' : res.good === 'mid' ? '#f39c12' : '#e74c3c', { lw: 1.6, shadow: 0 });
      text(g, mark, bx + bw - 48, by + bh - 19, { size: 12, color: '#fff' });
    }
  }
  // 倒计时条
  if (open) {
    const k = c.hold ? 1 : 1 - c.t / c.T;
    const col = k > 0.5 ? '#2ecc71' : k > 0.25 ? '#f39c12' : '#e74c3c';
    const jit = k < 0.27 && !c.hold ? (Math.random() - 0.5) * 2 : 0;
    g.fillStyle = 'rgba(43,34,51,.15)'; roundRect(g, bx + 14, by + bh - 16, bw - 28, 7, 3.5); g.fill();
    g.fillStyle = col; roundRect(g, bx + 14 + jit, by + bh - 16, (bw - 28) * k, 7, 3.5); g.fill();
  }
  g.restore();

  // A / B 卡
  drawCards(g, run, c, L, t, buttons, age);
}

function drawCallBubble(g, c, bx, by, bw, bh, t) {
  const res = c.res;
  card(g, bx, by, bw, bh, 18, '#2b2233', { lw: 2.6 });
  const shake = c.phase === 'open' ? Math.sin(t * 50) * 2 : 0;
  g.save(); g.translate(bx + 34 + shake, by + 40);
  g.fillStyle = '#2ecc71'; roundRect(g, -14, -22, 28, 44, 6); g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.fillRect(-9, -16, 18, 26);
  g.restore();
  if (c.npc) avatar(g, c.npc, bx + 34, by + 40, 12);
  text(g, `${c.name} 来电`, bx + 64, by + 26, { size: 17, color: '#fff', align: 'left' });
  text(g, res ? res.react : c.line, bx + 64, by + 58, { size: 17, color: res ? '#ffd166' : '#d0c8dc', align: 'left', maxW: bw - 80 });
  if (!res) { for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i / 3) % 1; g.globalAlpha = 1 - k; g.strokeStyle = '#2ecc71'; g.lineWidth = 2; g.beginPath(); g.arc(bx + 34, by + 40, 26 + k * 18, -0.6, 0.6); g.stroke(); } g.globalAlpha = 1; }
}

function drawCards(g, run, c, L, t, buttons, age) {
  const gap = 11, w = (L.W - 32 - gap) / 2, h = Math.min(108, L.cardsH), y = L.cardsY + (L.cardsH - h) / 2;
  c.opts.forEach((opt, i) => {
    const x = 16 + i * (w + gap);
    const appear = ease.outBack(clamp((age - i * 0.04) / 0.2, 0, 1));
    let s = appear, alpha = 1;
    if (c.phase === 'result') {
      if (c.picked === i) s = 1 + 0.1 * ease.outCubic(clamp(c.rt / 0.15, 0, 1));
      else { alpha = Math.max(0, 1 - c.rt / 0.25); }
    }
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha;
    g.translate(x + w / 2, y + h / 2); g.scale(s, s); g.translate(-(x + w / 2), -(y + h / 2));
    let fill = '#fff8ec';
    if (c.kind === 'call') fill = i === 0 ? '#d8f8e1' : '#ffe0e0';
    card(g, x, y, w, h, 16, fill, { lw: 2.6 });
    // 标签：借口类型 + 已用次数 / 价格
    if (opt.tag) {
      const col = TAG_COLORS[opt.tag] || '#888';
      card(g, x + 10, y + 10, 42, 20, 10, col, { lw: 1.4, shadow: 0 });
      text(g, opt.tag, x + 31, y + 20, { size: 12, color: '#fff' });
      const n = run.used[opt.tag] || 0;
      if (isExcuse(opt.tag) && n > 0) text(g, `已用×${n}`, x + 58, y + 20, { size: 12, color: n >= 2 ? '#e74c3c' : '#f39c12', align: 'left' });
      if (opt.cost) text(g, `¥${opt.cost}`, x + w - 12, y + 20, { size: 13, color: run.money < opt.cost ? '#e74c3c' : '#16a085', align: 'right' });
      if (c.grudgeTag && opt.tag === c.grudgeTag) text(g, '上次说过', x + w - 12, y + 20, { size: 11, color: '#e74c3c', align: 'right' });
    }
    text(g, opt.text, x + w / 2, y + h / 2 + (opt.tag ? 6 : 0), { size: [...opt.text].length > 6 ? 19 : 22, color: INK, maxW: w - 16 });
    text(g, i === 0 ? '◀ 左滑' : '右滑 ▶', x + w / 2, y + h - 14, { size: 11, color: '#b3a8bd', weight: 400 });
    // 结果印章
    if (c.phase === 'result' && c.picked === i && c.res && c.kind !== 'call' && c.kind !== 'ride' && c.kind !== 'store') {
      const good = c.res.good;
      const col = good === true ? '#2ecc71' : good === 'mid' ? '#f39c12' : '#e74c3c';
      g.save(); g.translate(x + w - 24, y + h - 30); g.rotate(-0.2);
      g.lineWidth = 3; g.strokeStyle = col; g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.stroke();
      text(g, good === true ? '✓' : good === 'mid' ? '~' : '✗', 0, 1, { size: 22, color: col });
      g.restore();
    }
    g.restore();
    if (c.phase === 'open') buttons.push({ id: 'card', arg: i, x, y, w, h });
  });
}

export function avatar(g, npc, cx, cy, r) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = (lookOf(npc).color || '#ddd') + '55'; g.fill();
  g.clip();
  const s = r / 16;
  drawPerson(g, cx - 4 * s, cy + 52 * s, lookOf(npc), { ...POSE_BASE, shR: -20, shL: 20 }, { scale: s });
  g.restore();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
}

function eventIcon(g, kind, cx, cy, t) {
  g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fillStyle = kind === 'ride' ? '#f7b731' : '#2e86de'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  text(g, kind === 'ride' ? '外卖' : '24h', cx, cy + 1, { size: 12, color: '#fff' });
  void t;
}

// ── 便利店 ─────────────────────────────────────────
export function drawShop(g, run, L, t, buttons) {
  const s = run.shop;
  if (!s) return;
  const k = ease.outCubic(clamp(s.t / 0.2, 0, 1));
  g.fillStyle = `rgba(30,20,40,${0.55 * k})`; g.fillRect(0, 0, L.W, L.H);
  const pw = L.W - 24, ph = 300, px = 12, py = L.groundY - 250 + (1 - k) * 40;
  card(g, px, py, pw, ph, 18, '#fffaf0', { lw: 2.6 });
  g.fillStyle = '#2e86de'; roundRect(g, px, py, pw, 44, 18); g.fill(); g.fillRect(px, py + 24, pw, 20);
  text(g, '便利店 · 只能挑一样', px + 16, py + 23, { size: 17, color: '#fff', align: 'left' });
  text(g, `钱包 ¥${run.money}`, px + pw - 16, py + 23, { size: 15, color: '#ffd166', align: 'right' });
  const cw = (pw - 32 - 16) / 3;
  STORE.items.forEach((it, i) => {
    const x = px + 16 + i * (cw + 8), y = py + 58, h = 168;
    const can = run.money >= it.price, picked = s.picked === i;
    g.save(); g.globalAlpha = can ? 1 : 0.45;
    card(g, x, y, cw, h, 14, picked ? '#d8f8e1' : '#ffffff', { lw: 2.2 });
    itemIcon(g, it.id, x + cw / 2, y + 48, t);
    text(g, it.name, x + cw / 2, y + 98, { size: 16, color: INK, maxW: cw - 8 });
    text(g, `¥${it.price}`, x + cw / 2, y + 122, { size: 18, color: can ? '#e67e22' : '#999' });
    text(g, it.note, x + cw / 2, y + 148, { size: 11, color: '#7f8c8d', weight: 400, maxW: cw - 8 });
    g.restore();
    text(g, ['◀', '▲', '▶'][i], x + cw / 2, y + h + 12, { size: 12, color: '#b3a8bd', weight: 400 });
    if (s.closeT <= 0) buttons.push({ id: 'buy', arg: i, x, y, w: cw, h });
  });
  const by = py + ph - 46;
  card(g, px + pw / 2 - 80, by, 160, 34, 17, '#eee', { lw: 2, shadow: 2 });
  text(g, '不买了，走（下滑）', px + pw / 2, by + 17, { size: 13, color: INK });
  if (s.closeT <= 0) buttons.push({ id: 'leave', x: px + pw / 2 - 80, y: by, w: 160, h: 34 });
  // 剩余时间
  g.fillStyle = '#e0d6ea'; roundRect(g, px + 16, py + ph - 8, pw - 32, 4, 2); g.fill();
  g.fillStyle = '#2e86de'; roundRect(g, px + 16, py + ph - 8, (pw - 32) * (1 - s.t / s.T), 4, 2); g.fill();
}
function itemIcon(g, id, x, y, t) {
  g.lineWidth = 2; g.strokeStyle = INK;
  if (id === 'onigiri') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y - 24); g.quadraticCurveTo(x + 28, y + 18, x, y + 18); g.quadraticCurveTo(x - 28, y + 18, x, y - 24); g.fill(); g.stroke(); g.fillStyle = '#2b2233'; g.fillRect(x - 9, y + 4, 18, 14); }
  else if (id === 'oden') {
    g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(x, y + 12, 26, 10, 0, 0, Math.PI); g.fill(); g.stroke();
    g.strokeStyle = '#a0522d'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, y - 28); g.stroke();
    for (const [dy, c] of [[-20, '#f5deb3'], [-8, '#fff'], [4, '#ffcc80']]) { g.fillStyle = c; g.beginPath(); g.arc(x, y + dy, 7, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); }
    for (let i = 0; i < 2; i++) { const k = (t + i / 2) % 1; g.globalAlpha = (1 - k) * 0.7; g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 10 + i * 20, y - 30 - k * 14, 4 + k * 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  } else { g.fillStyle = '#e74c3c'; roundRect(g, x - 11, y - 24, 22, 44, 5); g.fill(); g.stroke(); text(g, '⚡', x, y - 2, { size: 16, color: '#ffd166' }); }
}

// ── 提示、路段字卡、过场 ─────────────────────────────
export function drawHint(g, run, L, t) {
  const h = run.hint;
  if (!h || run.cutscene) return;
  const a = h.total > 100 ? 1 : clamp(h.t / 0.3, 0, 1) * clamp((h.total - h.t) / 0.15 + 0.2, 0, 1);
  g.save(); g.globalAlpha = a;
  g.font = font(15); const w = g.measureText(h.text).width + 36;
  const y = run.choice ? L.groundY - 324 : L.groundY - 210;
  card(g, L.W / 2 - w / 2, y, w, 34, 17, 'rgba(43,34,51,.86)', { stroke: '#ffd166', lw: 2, shadow: 0 });
  text(g, h.text, L.W / 2, y + 17, { size: 15, color: '#fff' });
  g.restore();
  if (run.teach) gestureHand(g, L.W / 2 + 70, L.groundY - 70, run.teach.kind === 'jump' ? -1 : 1, t);
  if (run.choice && run.choice.hold) gestureHand(g, L.W / 2, L.cardsY + L.cardsH + 2, 0, t);
}
function gestureHand(g, x, y, dir, t) {
  // 手势示意：箭头 + 沿箭头滑动的指尖
  const k = (t * 1.3) % 1;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const arrow = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(x1 + Math.cos(a) * 10, y1 + Math.sin(a) * 10); g.lineTo(x1 + Math.cos(a + 2.4) * 14, y1 + Math.sin(a + 2.4) * 14); g.lineTo(x1 + Math.cos(a - 2.4) * 14, y1 + Math.sin(a - 2.4) * 14); g.closePath(); g.fill();
  };
  let fx, fy;
  if (dir === 0) { arrow(x - 20, y, x - 70, y); arrow(x + 20, y, x + 70, y); const s = Math.sin(t * 3); fx = x + s * 60; fy = y; }
  else { arrow(x, y - dir * 30, x, y + dir * 30); fx = x; fy = y - dir * 30 + dir * 60 * ease.outCubic(k); }
  g.globalAlpha = dir === 0 ? 1 : 1 - k * 0.5;
  g.fillStyle = '#ffd166'; g.beginPath(); g.arc(fx, fy, 13, 0, Math.PI * 2); g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  g.restore();
}

export function drawStageBanner(g, L, banner, t) {
  if (!banner) return;
  const age = t - banner.t;
  if (age > 1.8) return;
  const k = age < 0.3 ? ease.outCubic(age / 0.3) : age > 1.4 ? 1 - (age - 1.4) / 0.4 : 1;
  g.save(); g.globalAlpha = k;
  const y = L.groundY - 250;
  g.fillStyle = 'rgba(43,34,51,.7)'; g.fillRect(0, y - 26, L.W, 52);
  text(g, banner.name, L.W / 2 + (1 - k) * 60, y - 2, { size: 26, color: '#ffd166', lw: 0 });
  text(g, banner.sub, L.W / 2, y + 19, { size: 12, color: '#fff', weight: 400 });
  g.restore();
}

export function drawCutscene(g, run, L, t) {
  const cs = run.cutscene;
  if (!cs) return;
  const age = cs.total - cs.t;
  if (cs.kind === 'caught') {
    g.fillStyle = `rgba(192,57,43,${0.25 * clamp(1 - age / 0.4, 0, 1)})`; g.fillRect(0, 0, L.W, L.H);
    const y = L.groundY - 280;
    text(g, '被逮住了！', L.W / 2, y, { size: 34 * ease.outBack(clamp(age / 0.25, 0, 1)), color: '#fff', lw: 6, stroke: '#c0392b' });
    if (cs.line) {
      g.font = font(17); const w = g.measureText(`「${cs.line}」`).width + 30;
      card(g, L.W / 2 - w / 2, y + 26, w, 40, 14, '#fff', { lw: 2.4 });
      text(g, `「${cs.line}」`, L.W / 2, y + 46, { size: 17, color: INK });
    }
    lunchbox(g, L.W / 2, y + 100, age < 0.5, 1.6);
    text(g, `饭盒 -1 · 耽误 ${RES.caught.min} 分钟`, L.W / 2, y + 132, { size: 14, color: '#fff', lw: 3 });
  } else if (cs.kind === 'hole') {
    text(g, '掉井里了！', L.W / 2, L.groundY - 230, { size: 30, color: '#fff', lw: 6, stroke: '#2b2233' });
    text(g, `爬出来花了 ${RES.hole.min} 分钟`, L.W / 2, L.groundY - 198, { size: 14, color: '#fff', lw: 3 });
  }
}

// ── 到家：开门 → 饭桌 ──────────────────────────────
export function drawDinner(g, L, result, t) {
  const meal = result.meal;
  const gr = g.createLinearGradient(0, 0, 0, L.H);
  gr.addColorStop(0, '#ffe2b8'); gr.addColorStop(1, '#ffb88c');
  g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
  // 吊灯
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(L.W / 2, 0); g.lineTo(L.W / 2, L.H * 0.2); g.stroke();
  g.fillStyle = '#fff3c4'; g.beginPath(); g.moveTo(L.W / 2 - 40, L.H * 0.24); g.lineTo(L.W / 2 - 18, L.H * 0.2); g.lineTo(L.W / 2 + 18, L.H * 0.2); g.lineTo(L.W / 2 + 40, L.H * 0.24); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,240,180,.35)'; g.beginPath(); g.moveTo(L.W / 2 - 40, L.H * 0.24); g.lineTo(L.W / 2 - 150, L.H * 0.7); g.lineTo(L.W / 2 + 150, L.H * 0.7); g.lineTo(L.W / 2 + 40, L.H * 0.24); g.fill();
  // 近景：凳子上扒饭的主角、桌子、碗；饭好的时候妈妈站在一边
  const S = 2.2, fy = L.H * 0.76, ty = fy - 64, stool = fy - 38;
  g.fillStyle = '#c08552'; g.fillRect(0, fy, L.W, L.H - fy);
  g.fillStyle = '#8b5a2b'; g.fillRect(54, stool, 70, 10); g.fillRect(62, stool + 10, 8, fy - stool - 10); g.fillRect(108, stool + 10, 8, fy - stool - 10);
  if (meal.tier >= 2) drawPerson(g, L.W - 62, fy, lookOf('mom'), { ...idlePose(t), shR: 40, elR: 60, mouth: 'smile' }, { flip: -1, scale: S });
  const chew = Math.sin(t * 14) > 0;
  drawPerson(g, 92, stool + 25 * S, { ...PLAYER, eyes: 'happy', mouth: chew ? 'open' : 'smile' }, { ...POSE_BASE, head: chew ? 12 : 2, hipR: 88, knR: 88, hipL: 82, knL: 92, shR: 85, elR: 70, shL: 70, elL: 85, lean: 12 }, { scale: S });
  g.fillStyle = '#a0522d'; roundRect(g, 120, ty, L.W - 210, 16, 5); g.fill(); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#8b4513'; g.fillRect(132, ty + 16, 10, fy - ty - 16); g.fillRect(L.W - 112, ty + 16, 10, fy - ty - 16);
  // 碗
  const bx = 178, by = ty;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by - 22, 38, 0, Math.PI); g.closePath(); g.fill(); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
  g.fillStyle = meal.color || '#f2c14e'; g.beginPath(); g.ellipse(bx, by - 22, 36, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = meal.side || '#fff'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(bx - 22 + i * 9, by - 26 + (i % 2) * 5, 5.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#5b9bd5'; g.fillRect(bx - 38, by - 16, 76, 3);
  for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3) % 1; g.globalAlpha = (1 - k) * 0.8; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx - 16 + i * 16, by - 40 - k * 44); g.quadraticCurveTo(bx - 6 + i * 16, by - 50 - k * 44, bx - 16 + i * 16, by - 62 - k * 44); g.stroke(); }
  g.globalAlpha = 1;
  text(g, `${result.arrivalText} 到家`, L.W / 2, L.H * 0.3, { size: 34, color: '#fff', lw: 7 });
  text(g, `今晚吃：${meal.name}`, L.W / 2, L.H * 0.3 + 44, { size: 20, color: '#fff', lw: 5 });
}

// ── 暂停 ───────────────────────────────────────────
export function drawPause(g, L, settings, buttons) {
  g.fillStyle = 'rgba(30,20,40,.7)'; g.fillRect(0, 0, L.W, L.H);
  const w = 260, h = 300, x = (L.W - w) / 2, y = (L.H - h) / 2;
  card(g, x, y, w, h, 20, '#fffaf0', { lw: 2.6 });
  text(g, '摸鱼中……', L.W / 2, y + 36, { size: 22, color: INK });
  const btn = (id, label, by, fill) => { card(g, x + 30, by, w - 60, 44, 22, fill, { lw: 2.4 }); text(g, label, L.W / 2, by + 22, { size: 17, color: INK }); buttons.push({ id, x: x + 30, y: by, w: w - 60, h: 44 }); };
  btn('resume', '继续跑', y + 70, '#ffd166');
  btn('restart', '重新下班', y + 124, '#ffffff');
  btn('home', '回到首页', y + 178, '#ffffff');
  const tg = (id, label, on, bx) => { card(g, bx, y + 240, 96, 34, 17, on ? '#d8f8e1' : '#eee', { lw: 2, shadow: 0 }); text(g, `${label} ${on ? '开' : '关'}`, bx + 48, y + 257, { size: 14, color: INK }); buttons.push({ id, x: bx, y: y + 240, w: 96, h: 34 }); };
  tg('sound', '声音', !settings.mute, x + 26);
  tg('vibrate', '震动', settings.vibrate, x + w - 122);
}

export { TAG_COLORS, CALLERS, CHASE, lerp };
