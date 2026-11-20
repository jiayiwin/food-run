// 界面：HUD、读题气泡、A/B 卡、来电、便利店、提示、路段字卡、过场、晚饭演出、暂停。全部通过 gfx 绘制。
import { RES, CHASE } from '../data/tune.js';
import { NPCS, MOM } from '../data/npcs.js';
import { STORE, CALLERS } from '../data/events.js';
import { isExcuse, choiceShown } from '../game/choice.js';
import { clockMin, fmtClock } from '../game/run.js';
import { roundRect, INK, text as drawText, ease, clamp, lerp } from './draw.js';
import { drawPerson, person, idlePose, POSE_BASE } from './rig.js';
import { lookOf, hero } from './looks.js';
import { gfx } from '../gfx/gfx.js';
import { bake, bakeTemp, makeLru, fromImage, BAKE_RES } from '../gfx/tex.js';
import { mealArt } from './art.js';
import { say } from '../data/address.js';
import { MEMBERS, DOOR_MARKS, FAMILIES } from '../data/family.js';
import { memberOf, doorMark, errandLeft, etaMin } from '../game/story.js';
import { iconTex, ITEM_SHAPE, catTex, dinnerBg, dinnerTable, drawDinnerPeople, drawDinnerTableTop, dinnerHeroDx } from './homes.js';
import { propArt } from './art.js';

const TAG_COLORS = { 工作: '#3d7ad6', 身体: '#2ecc71', 家里: '#ff8a5c', 没钱: '#a1887f', 装傻: '#9b59b6', 真话: '#f7b731', 顶嘴: '#e74c3c', 顺从: '#7f8c8d', 花钱: '#16a085' };

// 卡片：圆角 + 描边 + 底部阴影（和原 Canvas 版 card() 一样的默认值）
const card = (x, y, w, h, r, fill, { stroke = INK, lw = 2.5, shadow = 4, alpha } = {}) => gfx.rect(x, y, w, h, { fill, r, stroke, lw, shadow, alpha });
const text = (s, x, y, o) => gfx.text(s, x, y, o);
// 按宽度折行（中文逐字）
const wrapCache = new Map();
function wrap(str, maxW, size, weight = 700) {
  str = say(str);                       // {称呼} 先换成当前主角的词再折行
  const key = `${str}|${maxW}|${size}|${weight}`;
  const hit = wrapCache.get(key);
  if (hit) return hit;
  if (wrapCache.size > 500) wrapCache.clear();
  const out = wrapRaw(str, maxW, size, weight);
  wrapCache.set(key, out);
  return out;
}
function wrapRaw(str, maxW, size, weight) {
  const lines = []; let line = '';
  for (const ch of str) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const t = line + ch;
    if (gfx.measure(t, { size, weight }) > maxW && line) { lines.push(line); line = ch; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// ── 小图标（各烘焙一次）─────────────────────────────────
const stroke = (g, w = 2) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };
const bowlTex = hot => bake(`ico|bowl|${hot}`, [-11, -12, 22, 15], g => {
  g.fillStyle = hot ? '#e74c3c' : '#fff'; g.beginPath(); g.arc(0, -1, 9, 0, Math.PI); g.closePath(); g.fill(); stroke(g);
  g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(0, -2, 8, 4, 0, Math.PI, 0); g.fill(); stroke(g);
});
const houseTex = () => bake('ico|house', [-9, -9, 18, 17], g => {
  g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(-7, 0); g.lineTo(0, -7); g.lineTo(7, 0); g.lineTo(5, 0); g.lineTo(5, 6); g.lineTo(-5, 6); g.lineTo(-5, 0); g.closePath(); g.fill(); stroke(g, 1.6);
});
export const lunchboxTex = ok => bake(`ico|box|${ok}`, [-15, -13, 30, 24], g => {
  g.fillStyle = ok ? '#ff6b5a' : 'rgba(255,255,255,.35)'; roundRect(g, -12, -8, 24, 17, 4); g.fill(); stroke(g);
  g.fillStyle = ok ? '#ffd166' : 'rgba(255,255,255,.25)'; roundRect(g, -13, -11, 26, 6, 3); g.fill(); stroke(g);
  if (!ok) { g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -11); g.lineTo(1, -2); g.lineTo(-3, 3); g.lineTo(2, 9); g.stroke(); }
});
export function lunchbox(x, y, ok, s = 1) { gfx.draw(lunchboxTex(ok), x, y, { sx: s, sy: s }); }
const tailTex = fill => bake(`ico|tail|${fill}`, [-14, -3, 28, 22], g => {
  g.fillStyle = fill; g.beginPath(); g.moveTo(-12, -2); g.lineTo(2, 16); g.lineTo(12, -2); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-12, 0); g.lineTo(2, 16); g.lineTo(12, 0); g.stroke();
});
const phoneTex = () => bake('ico|phone', [-16, -24, 32, 48], g => {
  g.fillStyle = '#2ecc71'; roundRect(g, -14, -22, 28, 44, 6); g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.fillRect(-9, -16, 18, 26);
});
const ringTex = () => bake('ico|ring', [-1, -26, 30, 52], g => { g.strokeStyle = '#2ecc71'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 26, -0.6, 0.6); g.stroke(); });
const arrowTex = () => bake('ico|arrow', [-4, -15, 72, 30], g => {
  g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(50, 0); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(60, 0); g.lineTo(50 + Math.cos(2.4) * 14, Math.sin(2.4) * 14); g.lineTo(50 + Math.cos(-2.4) * 14, Math.sin(-2.4) * 14); g.closePath(); g.fill();
});
const itemTex = id => bake(`ico|item|${id}`, [-30, -36, 60, 60], g => {
  g.lineWidth = 2; g.strokeStyle = INK;
  if (id === 'onigiri') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -24); g.quadraticCurveTo(28, 18, 0, 18); g.quadraticCurveTo(-28, 18, 0, -24); g.fill(); g.stroke(); g.fillStyle = INK; g.fillRect(-9, 4, 18, 14); }
  else if (id === 'oden') {
    g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(0, 12, 26, 10, 0, 0, Math.PI); g.fill(); g.stroke();
    g.strokeStyle = '#a0522d'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 8); g.lineTo(0, -28); g.stroke();
    for (const [dy, c] of [[-20, '#f5deb3'], [-8, '#fff'], [4, '#ffcc80']]) { g.fillStyle = c; g.beginPath(); g.arc(0, dy, 7, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); }
  } else { g.fillStyle = '#e74c3c'; roundRect(g, -11, -24, 22, 44, 5); g.fill(); g.stroke(); drawText(g, '⚡', 0, -2, { size: 16, color: '#ffd166' }); }
});
// 路线卡右上角的小图：之字台阶（楼梯）/ 方框里上下三角（电梯），18×18、1.6px 墨线
const routeIcon = r => bake(`ico|route|${r}`, [-10, -10, 20, 20], g => {
  g.lineWidth = 1.6; g.strokeStyle = '#7D6E8F'; g.lineJoin = 'round';
  if (r === 'stairs') { g.beginPath(); g.moveTo(-8, 8); g.lineTo(-8, 3); g.lineTo(-3, 3); g.lineTo(-3, -2); g.lineTo(2, -2); g.lineTo(2, -7); g.lineTo(8, -7); g.stroke(); }
  else {
    roundRect(g, -8, -9, 16, 18, 2); g.stroke(); g.fillStyle = '#7D6E8F';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, -1.5); g.lineTo(-4, -1.5); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, 6); g.lineTo(4, 1.5); g.lineTo(-4, 1.5); g.closePath(); g.fill();
  }
});
export function avatarTex(npc) {
  if (MEMBERS[npc] && MEMBERS[npc].cat) {                 // 橘子：坐姿图的上半截（头）
    const a = propArt('juzi_sit');
    return bake(`avatar|${npc}|${a ? 1 : 0}`, [-22, -22, 44, 44], g => {
      g.save(); g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fillStyle = '#f39c3c55'; g.fill(); g.clip();
      if (a) { const k = 50 / a.h; g.drawImage(a.img, -a.w * k / 2 + 2, -16, a.w * k, a.h * k); }
      else { g.fillStyle = '#f39c3c'; g.beginPath(); g.arc(2, 4, 14, 0, Math.PI * 2); g.fill(); }
      g.restore(); g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    });
  }
  const look = lookOf(npc), art = look.art ? 1 : 0, fr = AVATAR_FRAME[look.id] || AVATAR_FRAME.none;
  return bake(`avatar|${look.id || npc}|${art}`, [-22, -22, 44, 44], g => {     // 'player' 跟着当前主角换（按外观 id 缓存）
    g.save(); g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2);
    g.fillStyle = (look.color || '#dddddd') + '55'; g.fill(); g.clip();
    const s = 20 / 16;
    g.translate(fr.dx, fr.dy); g.scale(fr.k, fr.k);
    drawPerson(g, -4 * s, 52 * s, look, { ...POSE_BASE, shR: -20, shL: 20 }, { scale: s / (look.scale || 1) });   // 头像按头的大小来：朵朵（0.62 倍）、奶奶（0.9 倍）的头也填满圆
    g.restore();
    g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  });
}
// 头像取景：女主角的马尾甩在脑后（左边），整个头缩小一点、往右挪，马尾露在圈里（标题页「换主角」按钮上和男主角一眼分得开）
const AVATAR_FRAME = { none: { k: 1, dx: 0, dy: 0 }, playerF: { k: 0.8, dx: 5, dy: 2 } };
export function avatar(npc, cx, cy, r) { gfx.draw(avatarTex(npc), cx, cy, { sx: r / 20, sy: r / 20 }); }
// 星（结算页、选关页、开局卡）：亮的金黄、没亮的灰底虚边；锁（没解锁的关卡）
const starTex = on => bake(`ico|star|${on ? 1 : 0}`, [-21, -21, 42, 42], g => {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 8.4 : 19; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 1); }
  g.closePath(); g.lineJoin = 'round';
  g.fillStyle = on ? '#ffd166' : 'rgba(43,34,51,.12)'; g.fill();
  g.lineWidth = 2.6; g.strokeStyle = on ? INK : 'rgba(43,34,51,.35)'; g.stroke();
  if (on) { g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-5, -6, 3, 5, -0.6, 0, Math.PI * 2); g.fill(); }
});
export function starIcon(x, y, r, on, s = 1) { const k = (r / 19) * s; gfx.draw(starTex(on), x, y, { sx: k, sy: k }); }
const lockTex = () => bake('ico|lock', [-14, -18, 28, 34], g => {
  g.lineWidth = 2.6; g.strokeStyle = '#8a7f95'; g.beginPath(); g.arc(0, -4, 7, Math.PI, 0); g.lineTo(7, 2); g.moveTo(-7, 2); g.lineTo(-7, -4); g.stroke();
  g.fillStyle = '#b3a8bd'; roundRect(g, -11, 1, 22, 15, 4); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.fillStyle = INK; g.fillRect(-1.2, 5, 2.4, 6);
});
export function lockIcon(x, y) { gfx.draw(lockTex(), x, y); }

// ── HUD ───────────────────────────────────────────────
export function drawHud(run, L, t, buttons) {
  const y = L.hudY;
  card(12, L.top + 2, 34, 34, 17, 'rgba(255,255,255,.85)', { lw: 2, shadow: 2 });
  gfx.rect(23, L.top + 12, 4, 14, { fill: INK }); gfx.rect(31, L.top + 12, 4, 14, { fill: INK });
  buttons.push({ id: 'pause', x: 6, y: L.top - 4, w: 46, h: 46 });

  const sat = clamp(run.sat, 0, 100), low = sat < RES.hungry;
  gfx.draw(bowlTex(low && Math.floor(t * 4) % 2 === 0), 26, y + 8);
  card(42, y + 2, 104, 14, 7, 'rgba(255,255,255,.9)', { lw: 2, shadow: 0 });
  if (sat > 0.5) gfx.rect(44, y + 4, 100 * sat / 100, 10, { fill: sat > 50 ? '#2ecc71' : sat > RES.hungry ? '#f39c12' : '#e74c3c', r: 5 });
  text(`¥${run.money}`, 18, y + 30, { size: 15, color: '#fff', lw: 3, align: 'left', id: 'hud-money' });
  if (run.flags.energy) text('⚡能量', 66, y + 30, { size: 12, color: '#f7c948', lw: 3, align: 'left' });

  text(fmtClock(clockMin(run)), L.W / 2, y + 8, { size: 26, color: '#fff', lw: 5, id: 'hud-clock' });
  // 进度条：按这一关的起终点算；路段刻度跳过小路段（楼梯间之类）
  const lv = run.lv, span = lv.end - lv.x0, px = L.W / 2 - 56, pw = 112, k = clamp((run.x - lv.x0) / span, 0, 1);
  gfx.rect(px, y + 26, pw, 6, { fill: 'rgba(43,34,51,.45)', r: 3 });
  for (const s of lv.stages.slice(1)) if (!s.minor) gfx.rect(px + pw * (s.x0 - lv.x0) / span - 0.5, y + 25, 1.5, 8, { fill: 'rgba(255,255,255,.7)' });
  if (k > 0.01) gfx.rect(px, y + 26, pw * k, 6, { fill: '#ffd166', r: 3 });
  gfx.draw(houseTex(), px + pw + 9, y + 29);
  text(run.stage.name, L.W / 2, y + 42, { size: 11, color: '#fff', lw: 3 });

  for (let i = 0; i < RES.boxes; i++) lunchbox(L.W - 30 - i * 30, y + 8, i < run.boxes);
  text(String(run.score), L.W - 16, y + 30, { size: 13, color: '#fff', lw: 3, align: 'right', id: 'hud-score' });
  if (run.combo >= 3) text(`连击 ×${run.combo}`, L.W - 16, y + 46, { size: 12, color: '#ffd166', lw: 3, align: 'right', id: 'hud-combo' });
  drawErrandNotes(run, L, t);
  // 带薪摸鱼：右上角小标签（连击下面，不压灯牌：灯牌在 groundY − 300）
  if (run.assist) { const ay = y + (run.combo >= 3 ? 56 : 40); card(L.W - 72, ay, 58, 20, 10, 'rgba(46,204,113,.92)', { lw: 1.6, shadow: 0 }); text('摸鱼中', L.W - 43, ay + 10, { size: 11, color: '#fff' }); }
}

// HUD 便签（钱数下面，高 22 的圆角卡）：① 家里交代的事（白底待办 / 绿底 ✓ 办好 / 灰底 过了最后一个能办的地方，挂了电话的角上红「未接」）；
// ② 接了家里电话：「18:56 前到家」（预计到家晚于它就变灰）。快到能办的地方时便签跳一下
const etaMemo = { run: null, x: 0, rem: 0 };
function drawErrandNotes(run, L, t) {
  let y = L.hudY + 44;
  const note = (icon, label, state, extra) => {
    const w = gfx.measure(label, { size: 12 }) + 40, bounce = extra.bounce ? -Math.abs(Math.sin((run.t - extra.bounce) * 12)) * 4 : 0;
    const fill = state === 'done' ? '#d8f8e1' : state === 'gone' ? 'rgba(220,214,226,.92)' : '#ffffff';
    card(12, y + bounce, w, 22, 11, fill, { lw: 1.8, shadow: 0 });
    gfx.draw(iconTex(icon), 25, y + 11 + bounce, { sx: 0.75, sy: 0.75, alpha: state === 'gone' ? 0.5 : 1 });
    text(label, 37, y + 11 + bounce, { size: 12, color: state === 'gone' ? '#8a7f95' : INK, align: 'left' });
    if (state === 'done') text('✓', 12 + w - 9, y + 11 + bounce, { size: 12, color: '#1e8449' });
    if (extra.missed) { card(6, y - 6 + bounce, 26, 13, 6, '#e74c3c', { lw: 1.2, shadow: 0 }); text('未接', 19, y + 0.5 + bounce, { size: 8, color: '#fff' }); }
    y += 26;
  };
  const e = run.fam && run.fam.errand, d = run.story && run.story.errand;
  if (e && d && e.state !== 'none') {
    const near = run.fam.nearT != null && run.t - run.fam.nearT < 0.6 && e.state === 'todo' ? run.fam.nearT : null;
    note(d.icon.shape, d.name, e.state === 'done' ? 'done' : errandLeft(run) ? 'todo' : 'gone', { missed: e.missed, bounce: near });
  }
  if (run.fam && run.fam.deadline != null) {
    // 剩下路程的纯跑分钟数（积分到终点，全程关上万步）只在主角每跑 40px 时重算一次，每帧只加上当前时钟（只是画面上的灰不灰，不进逻辑）
    if (etaMemo.run !== run || Math.abs(run.x - etaMemo.x) >= 40) { etaMemo.run = run; etaMemo.x = run.x; etaMemo.rem = etaMin(run, 0); }
    const late = clockMin(run) + etaMemo.rem > run.fam.deadline;
    note('clock', `${fmtClock(run.fam.deadline)} 前到家`, late ? 'gone' : 'todo', {});
  }
}

// ── 读题气泡 ─────────────────────────────────────────
export function drawChoice(run, L, vis, t, buttons) {
  const c = run.choice;
  if (!choiceShown(c)) return;                     // 进了店：便利店面板就是反馈，「进店」卡不画
  const open = c.phase === 'open', age = c.age;
  const pop = ease.outBack(clamp(age / 0.18, 0, 1));
  // 气泡底边固定在跑道上方；矮屏时不压到 HUD
  const bw = L.W - 32, bh = 122, bx = 16, by = Math.max(L.hudY + 56, L.groundY - 168 - bh);
  const res = c.res;
  gfx.save();
  gfx.translate(L.W / 2, by + bh); gfx.scale(pop); gfx.translate(-L.W / 2, -(by + bh));
  if (c.kind === 'call') drawCallBubble(c, bx, by, bw, bh, t);
  else {
    const npc = c.kind === 'npc' ? NPCS[c.npc] : c.kind === 'mom' ? memberOf(run.story, c.npc) || MOM : null;   // 家门口：这个家里的人（名字、身份、性格标签）
    const fill = res ? (res.good === true ? '#eafff1' : res.good === 'mid' ? '#fff7e0' : '#ffecec') : '#ffffff';
    card(bx, by, bw, bh, 16, fill, { lw: 2.6 });
    gfx.draw(tailTex(fill), clamp(vis.npcSX || L.W - 80, bx + 30, bx + bw - 30), by + bh);
    if (npc) {
      avatar(c.npc, bx + 30, by + 30, 20);
      let nx = bx + 58;
      if (c.revisit) { card(nx, by + 14, 38, 20, 6, '#e74c3c', { lw: 1.6, shadow: 0 }); text('记仇', nx + 19, by + 24, { size: 12, color: '#fff' }); nx += 44; }
      text(npc.name, nx, by + 24, { size: 17, color: INK, align: 'left' });
      const nw = gfx.measure(npc.name, { size: 17 });
      text(npc.role, nx + nw + 6, by + 25, { size: 11, color: '#8a7f95', weight: 400, align: 'left' });
      let tx2 = bx + bw - 12;
      for (const tr of npc.traits.slice().reverse()) {
        const w = gfx.measure(tr, { size: 11 }) + 12;
        tx2 -= w; card(tx2, by + 15, w, 18, 9, '#fff1d6', { lw: 1.4, shadow: 0 }); text(tr, tx2 + w / 2, by + 24, { size: 11, color: '#a0522d' }); tx2 -= 4;
      }
    } else {
      const ico = c.kind === 'ride' ? ['#f7b731', '外卖', 12] : c.kind === 'route' ? ['#2E6BFF', '梯', 16] : ['#2e86de', '24h', 12];   // 路线卡：蓝圆「梯」
      gfx.circle(bx + 30, by + 30, 20, { fill: ico[0], stroke: INK, lw: 2 });
      text(ico[1], bx + 30, by + 31, { size: ico[2], color: '#fff' });
      text(c.name, bx + 58, by + 24, { size: 17, color: INK, align: 'left' });
    }
    const line = res ? res.react || '' : c.line;
    const pre = !res && c.pre ? c.pre : null;
    if (pre) text(pre, bx + 58, by + 44, { size: 12, color: '#8a7f95', weight: 400, align: 'left' });
    const lines = wrap(line, bw - 36, 19);
    const ly = by + (pre ? 70 : 64) - (lines.length - 1) * 11;
    lines.slice(0, 2).forEach((s, i) => text(s, bx + bw / 2, ly + i * 24, { size: 19, color: res ? (res.good === true ? '#1e8449' : res.good === 'mid' ? '#9a6b00' : '#c0392b') : INK }));
    if (res && c.kind !== 'ride' && c.kind !== 'store' && c.kind !== 'route') {
      const mark = c.kind === 'mom' ? doorMark(run.story, res.good) : res.good === true ? (res.reconcile ? '和解！' : '放行') : res.good === 'mid' ? '勉强放行' : res.noChase ? '挨白眼了' : '被缠上了！';   // 门口：开饭！/ 还行 / 每家不同的答坏
      card(bx + bw - 86, by + bh - 30, 76, 22, 11, res.good === true ? '#2ecc71' : res.good === 'mid' ? '#f39c12' : '#e74c3c', { lw: 1.6, shadow: 0 });
      text(mark, bx + bw - 48, by + bh - 19, { size: 12, color: '#fff' });
    }
  }
  if (open) {
    const k = c.hold ? 1 : 1 - c.t / c.T;
    const col = k > 0.5 ? '#2ecc71' : k > 0.25 ? '#f39c12' : '#e74c3c';
    const jit = k < 0.27 && !c.hold ? (Math.random() - 0.5) * 2 : 0;
    gfx.rect(bx + 14, by + bh - 16, bw - 28, 7, { fill: 'rgba(43,34,51,.15)', r: 3.5 });
    if (k > 0.01) gfx.rect(bx + 14 + jit, by + bh - 16, (bw - 28) * k, 7, { fill: col, r: 3.5 });
  }
  gfx.restore();
  drawCards(run, c, L, t, buttons, age);
}

function drawCallBubble(c, bx, by, bw, bh, t) {
  const res = c.res;
  card(bx, by, bw, bh, 18, '#2b2233', { lw: 2.6 });
  gfx.draw(phoneTex(), bx + 34 + (c.phase === 'open' ? Math.sin(t * 50) * 2 : 0), by + 40);
  if (c.npc) avatar(c.npc, bx + 34, by + 40, 12);
  text(`${c.name} 来电`, bx + 82, by + 26, { size: 17, color: '#fff', align: 'left' });     // 让开来电光圈
  text(res ? res.react : c.line, bx + 82, by + 58, { size: 17, color: res ? '#ffd166' : '#d0c8dc', align: 'left', maxW: bw - 98 });
  if (!res) for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i / 3) % 1, s = (26 + k * 18) / 26; gfx.draw(ringTex(), bx + 34, by + 40, { sx: s, sy: s, alpha: 1 - k }); }
}

function drawCards(run, c, L, t, buttons, age) {
  const gap = 11, w = (L.W - 32 - gap) / 2, h = Math.min(108, L.cardsH), y = L.cardsY + (L.cardsH - h) / 2;
  c.opts.forEach((opt, i) => {
    const x = 16 + i * (w + gap);
    let s = ease.outBack(clamp((age - i * 0.04) / 0.2, 0, 1)), alpha = 1;
    if (c.phase === 'result') {
      if (c.picked === i) s = 1 + 0.1 * ease.outCubic(clamp(c.rt / 0.15, 0, 1));
      else alpha = Math.max(0, 1 - c.rt / 0.25);
    }
    if (alpha <= 0 || s <= 0.01) return;
    gfx.save(); gfx.alpha(alpha);
    gfx.translate(x + w / 2, y + h / 2); gfx.scale(s); gfx.translate(-(x + w / 2), -(y + h / 2));
    const fill = c.kind === 'call' ? (i === 0 ? '#d8f8e1' : '#ffe0e0') : '#fff8ec';
    card(x, y, w, h, 16, fill, { lw: 2.6 });
    if (opt.tag) {
      card(x + 10, y + 10, 42, 20, 10, TAG_COLORS[opt.tag] || '#888', { lw: 1.4, shadow: 0 });
      text(opt.tag, x + 31, y + 20, { size: 12, color: '#fff' });
      const n = run.used[opt.tag] || 0;
      if (isExcuse(opt.tag) && n > 0) text(`已用×${n}`, x + 58, y + 20, { size: 12, color: n >= 2 ? '#e74c3c' : '#f39c12', align: 'left' });
      if (opt.cost) text(`¥${opt.cost}`, x + w - 12, y + 20, { size: 13, color: run.money < opt.cost ? '#e74c3c' : '#16a085', align: 'right' });
      if (c.grudgeTag && opt.tag === c.grudgeTag) text('上次说过', x + w - 12, y + 20, { size: 11, color: '#e74c3c', align: 'right' });
    }
    text(opt.text, x + w / 2, y + h / 2 + (opt.tag ? 6 : opt.note ? -8 : 0), { size: [...say(opt.text)].length > 6 ? 19 : 22, color: INK, maxW: w - 16 });
    if (opt.note) text(opt.note, x + w / 2, y + h / 2 + 14, { size: 11, color: '#8a7f95', weight: 400, maxW: w - 16 });   // 路线卡的小字：多跑一段 / 预计停 N 层
    if (opt.route) gfx.draw(routeIcon(opt.route), x + w - 20, y + 20);
    text(i === 0 ? '◀ 左滑' : '右滑 ▶', x + w / 2, y + h - 14, { size: 11, color: '#b3a8bd', weight: 400 });
    if (c.phase === 'result' && c.picked === i && c.res && c.kind !== 'call' && c.kind !== 'ride' && c.kind !== 'store' && c.kind !== 'route') {
      const good = c.res.good, col = good === true ? '#2ecc71' : good === 'mid' ? '#f39c12' : '#e74c3c';
      gfx.save(); gfx.translate(x + w - 24, y + h - 30); gfx.rotate(-0.2);
      gfx.circle(0, 0, 17, { stroke: col, lw: 3, fill: 'rgba(255,255,255,0)' });
      text(good === true ? '✓' : good === 'mid' ? '~' : '✗', 0, 1, { size: 22, color: col });
      gfx.restore();
    }
    gfx.restore();
    if (c.phase === 'open') buttons.push({ id: 'card', arg: i, x, y, w, h });
  });
}

// ── 便利店 ─────────────────────────────────────────
export const shopTop = L => L.groundY - 250;          // 面板上沿（滑进来停住以后）：提示条放在它上面
export function drawShop(run, L, t, buttons) {
  const s = run.shop;
  if (!s) return;
  const k = ease.outCubic(clamp(s.t / 0.2, 0, 1));
  gfx.rect(0, 0, L.W, L.H, { fill: '#1e1428', alpha: 0.55 * k });
  const pw = L.W - 24, ph = 300, px = 12, py = shopTop(L) + (1 - k) * 40;
  card(px, py, pw, ph, 18, '#fffaf0', { lw: 2.6 });
  gfx.rect(px, py, pw, 44, { fill: '#2e86de', r: 18 }); gfx.rect(px, py + 24, pw, 20, { fill: '#2e86de' });
  text('便利店 · 只能挑一样', px + 16, py + 23, { size: 17, color: '#fff', align: 'left' });
  text(`钱包 ¥${run.money}`, px + pw - 16, py + 23, { size: 15, color: '#ffd166', align: 'right' });
  const cw = (pw - 32 - 16) / 3;
  (s.items || STORE.items).forEach((it, i) => {         // 货架：这一局的（家庭剧本可以换第 3 格）
    const x = px + 16 + i * (cw + 8), y = py + 58, h = 168;
    const can = run.money >= it.price, picked = s.picked === i;
    gfx.save(); gfx.alpha(can ? 1 : 0.45);
    card(x, y, cw, h, 14, picked ? '#d8f8e1' : it.fam ? '#ffe08a' : '#ffffff', { lw: 2.2 });
    if (it.fam) gfx.draw(iconTex(ITEM_SHAPE[it.id] || 'box', 2.2), x + cw / 2, y + 44);
    else gfx.draw(itemTex(it.id), x + cw / 2, y + 48);
    if (it.fam) { gfx.circle(x + cw - 14, y + 14, 11, { fill: '#e74c3c', stroke: INK, lw: 1.6 }); text('家', x + cw - 14, y + 14, { size: 12, color: '#fff' }); }
    if (it.id === 'oden') for (let j = 0; j < 2; j++) { const q = (t + j / 2) % 1; gfx.circle(x + cw / 2 - 10 + j * 20, y + 18 - q * 14, 4 + q * 3, { fill: '#fff', alpha: (1 - q) * 0.7 }); }
    text(it.name, x + cw / 2, y + 98, { size: 16, color: INK, maxW: cw - 8 });
    text(`¥${it.price}`, x + cw / 2, y + 122, { size: 18, color: can ? '#e67e22' : '#999' });
    text(it.note, x + cw / 2, y + 148, { size: 11, color: '#7f8c8d', weight: 400, maxW: cw - 8 });
    gfx.restore();
    text(['◀', '▲', '▶'][i], x + cw / 2, y + h + 12, { size: 12, color: '#b3a8bd', weight: 400 });
    if (s.closeT <= 0) buttons.push({ id: 'buy', arg: i, x, y, w: cw, h });
  });
  const by = py + ph - 46;
  card(px + pw / 2 - 80, by, 160, 34, 17, '#eee', { lw: 2, shadow: 2 });
  text('不买了，走（下滑）', px + pw / 2, by + 17, { size: 13, color: INK });
  if (s.closeT <= 0) buttons.push({ id: 'leave', x: px + pw / 2 - 80, y: by, w: 160, h: 34 });
  gfx.rect(px + 16, py + ph - 8, pw - 32, 4, { fill: '#e0d6ea', r: 2 });
  const left = 1 - s.t / s.T;
  if (left > 0.01) gfx.rect(px + 16, py + ph - 8, (pw - 32) * left, 4, { fill: '#2e86de', r: 2 });
}

// ── 提示、路段字卡、过场 ─────────────────────────────
export function drawHint(run, L, t) {
  const h = run.hint;
  if (!h || run.cutscene) return;
  const a = h.total > 100 ? 1 : clamp(h.t / 0.3, 0, 1) * clamp((h.total - h.t) / 0.15 + 0.2, 0, 1);
  const w = gfx.measure(h.text, { size: 15 }) + 36;
  // 便利店里放到面板上沿外面（不压货架卡片，矮屏也是）；读题时放到「+100」飘字上方；电梯里教关门时放到轿厢上面（不压轿厢里的人和外卖小哥的台词）
  const y = run.shop ? shopTop(L) - 42 : run.choice ? Math.max(L.hudY + 20, L.groundY - 384) : run.room ? Math.max(L.hudY + 70, L.groundY - 350) : L.groundY - 210;
  gfx.save(); gfx.alpha(a);
  card(L.W / 2 - w / 2, y, w, 34, 17, 'rgba(43,34,51,.86)', { stroke: '#ffd166', lw: 2, shadow: 0 });
  text(h.text, L.W / 2, y + 17, { size: 15, color: '#fff' });
  gfx.restore();
  if (run.teach) {
    const k = run.teach.kind;
    if (k === 'lift') gestureHand(L.W / 2 + 26, L.cardsY + L.cardsH / 2 + 22, 'tap', t);       // 点关门键
    else if (k === 'dash' || k === 'crossdash') gestureHand(L.W / 2 + 20, L.groundY - 70, 'right', t);
    else gestureHand(L.W / 2 + 70, L.groundY - 70, k === 'jump' ? -1 : 1, t);
  }
  if (run.choice && run.choice.hold) gestureHand(L.W / 2, L.groundY + 14, 0, t);       // 地面线和卡片之间的空当
}
// 手势示意：箭头 + 沿箭头滑动的指尖
function gestureHand(x, y, dir, t) {
  const k = (t * 1.3) % 1;
  let fx, fy;
  if (dir === 'tap') {                                  // 点一下：指尖按下去再抬起来
    const s = 1 - 0.25 * Math.sin(k * Math.PI);
    gfx.circle(x, y, 22 * (0.6 + k * 0.6), { fill: 'rgba(255,255,255,0)', stroke: '#ffd166', lw: 3, alpha: 1 - k });
    gfx.circle(x, y, 13 * s, { fill: '#ffd166', stroke: INK, lw: 3 });
    return;
  }
  if (dir === 'right') { gfx.draw(arrowTex(), x - 30, y, { sx: 1.0 }); fx = x - 30 + 60 * ease.outCubic(k); fy = y; }
  else if (dir === 0) { gfx.draw(arrowTex(), x - 20, y, { rot: Math.PI, sx: 0.85 }); gfx.draw(arrowTex(), x + 20, y, { sx: 0.85 }); fx = x + Math.sin(t * 3) * 60; fy = y; }
  else { gfx.draw(arrowTex(), x, y - dir * 30, { rot: dir * Math.PI / 2, sx: 1.0 }); fx = x; fy = y - dir * 30 + dir * 60 * ease.outCubic(k); }
  gfx.circle(fx, fy, 13, { fill: '#ffd166', stroke: INK, lw: 3, alpha: dir === 0 ? 1 : 1 - k * 0.5 });
}

export function drawStageBanner(L, banner, t) {
  if (!banner) return;
  const age = t - banner.t;
  if (age > 1.8) return;
  const k = age < 0.3 ? ease.outCubic(age / 0.3) : age > 1.4 ? 1 - (age - 1.4) / 0.4 : 1;
  const y = L.groundY - 250;
  gfx.save(); gfx.alpha(k);
  gfx.rect(0, y - 26, L.W, 52, { fill: 'rgba(43,34,51,.7)' });
  text(banner.name, L.W / 2 + (1 - k) * 60, y - 2, { size: 26, color: '#ffd166' });
  text(banner.sub, L.W / 2, y + 19, { size: 12, color: '#fff', weight: 400 });
  gfx.restore();
}

export function drawCutscene(run, L, t) {
  const cs = run.cutscene;
  if (!cs) return;
  const age = cs.total - cs.t;
  if (cs.kind === 'caught') {
    const fa = 0.25 * clamp(1 - age / 0.4, 0, 1);
    if (fa > 0.01) gfx.rect(0, 0, L.W, L.H, { fill: '#c0392b', alpha: fa });
    const y = Math.max(L.hudY + 70, L.groundY - 280);
    const s = ease.outBack(clamp(age / 0.25, 0, 1));
    gfx.save(); gfx.translate(L.W / 2, y); gfx.scale(Math.max(0.05, s));
    text('被逮住了！', 0, 0, { size: 34, color: '#fff', lw: 6, stroke: '#c0392b' });
    gfx.restore();
    if (cs.line) {
      const w = gfx.measure(`「${cs.line}」`, { size: 17 }) + 30;
      card(L.W / 2 - w / 2, y + 26, w, 40, 14, '#fff', { lw: 2.4 });
      text(`「${cs.line}」`, L.W / 2, y + 46, { size: 17, color: INK });
    }
    lunchbox(L.W / 2, y + 100, age < 0.5, 1.6);
    text(`饭盒 -1 · 耽误 ${RES.caught.min} 分钟`, L.W / 2, y + 132, { size: 14, color: '#fff', lw: 3 });
  } else if (cs.kind === 'hole') {
    text('掉井里了！', L.W / 2, L.groundY - 230, { size: 30, color: '#fff', lw: 6, stroke: INK });
    text(`爬出来花了 ${RES.hole.min} 分钟`, L.W / 2, L.groundY - 198, { size: 14, color: '#fff', lw: 3 });
  }
}

// ── 到家：开门 → 饭桌 ──────────────────────────────
// 背景（墙、灯、光、地板、凳子）和前景（桌子、没有美术图时的碗）各烘焙一张；人物和热气每帧动。
// 两张都只留当前这一顿的（换家 / 换菜时释放上一张，不常驻显存）；到家演出白屏那几帧先烘焙好、传进显存（prepareDinner），进饭桌那一帧不卡
const frontSlot = makeLru(1, t => gfx.release(t));
function dinnerTex(L, result) {
  const meal = result.meal, fam = (result.family && result.family.id) || 'parents', hx = dinnerHeroDx(result);
  const fy = L.H * 0.76, ty = fy - 64, stool = fy - 38, bx = 178 + hx;   // hx：有客人时一桌人往右让（主角、凳子、碗一起挪）
  const bg = dinnerBg(L, fam, fy, ty, stool, hx);          // 每个家一张：墙色、灯、电视 / 冰箱 / 福字……（js/render/homes.js）
  const mArt = mealArt(meal);
  const fk = `dinnerFront|${fam}|${L.H}|${mArt ? 'art' : meal.name}|${hx}`;
  const front = frontSlot.get(fk, () => bakeTemp(fk, [100, ty - 64, 210, fy - ty + 68], g => {
    dinnerTable(g, L, fam, ty, fy);
    const by = ty;
    if (mArt) return;      // 有美术图：碗单独画
    g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by - 22, 38, 0, Math.PI); g.closePath(); g.fill(); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
    g.fillStyle = meal.color || '#f2c14e'; g.beginPath(); g.ellipse(bx, by - 22, 36, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = meal.side || '#fff'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(bx - 22 + i * 9, by - 26 + (i % 2) * 5, 5.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#5b9bd5'; g.fillRect(bx - 38, by - 16, 76, 3);
  }));
  return { bg, front, mArt, hx, fy, ty, stool, bx };
}
// 饭桌上的三行字：到家时刻、今晚吃什么、饭桌一句（家庭剧本）
function dinnerLines(L, result) {
  const out = [[`${result.arrivalText} 到家`, L.H * 0.3, { size: 34, color: '#fff', lw: 7 }], [`今晚吃：${result.meal.name}`, L.H * 0.3 + 44, { size: 20, color: '#fff', lw: 5 }]];
  const line = result.family && result.family.dinner;
  if (line) out.push([line, L.H * 0.3 + 74, { size: 15, color: '#fff', lw: 4, maxW: L.W - 40 }]);
  return out;
}
// 到家演出还在开门、白屏时调（play.js），一帧只做一件：step 0 烘焙背景并传进显存，step 1 前景和菜的图，step 2–4 三行大字各一行（WebGL 后端现做大字也要几毫秒）
export const DINNER_PREP_STEPS = 5;
export function prepareDinner(L, result, step) {
  if (step >= 2) { const l = dinnerLines(L, result)[step - 2]; if (l) gfx.warm(l[0], l[2]); return; }
  const d = dinnerTex(L, result), tex = step === 0 ? d.bg : d.front;
  gfx.preload(tex.src);
  if (step === 1 && d.mArt) gfx.preload(d.mArt.img);
}
export function drawDinner(L, result, t) {
  const { bg, front, mArt, hx, fy, ty, stool, bx } = dinnerTex(L, result), S = 2.2;
  gfx.draw(bg, 0, 0);
  drawDinnerPeople(L, result, t, fy, ty, stool, S, 'back');      // 桌子后面坐着的（爸爸）、站在主角身后的客人（来住的奶奶）
  drawDinnerPeople(L, result, t, fy, ty, stool, S, 'front');     // 右边站着的、高脚椅上的朵朵、椅子上的橘子
  const chew = Math.sin(t * 14) > 0;
  person(gfx, 92 + hx, stool + 25 * S, dinnerLook(chew), { ...POSE_BASE, head: chew ? 12 : 2, hipR: 88, knR: 88, hipL: 82, knL: 92, shR: 85, elR: 70, shL: 70, elL: 85, lean: 12 }, { scale: S });
  gfx.draw(front, 0, 0);
  if (mArt) gfx.draw(fromImage(`meal|${mArt.src}`, mArt.img, mArt.w, mArt.h, { ox: mArt.w / 2, oy: mArt.h }), bx, ty + 4, { sx: 0.95, sy: 0.95 });
  drawDinnerTableTop(L, result, t, ty);                          // 笔记本电脑、视频通话的手机（立在碗边上：画在碗之后，视频头像不被碗沿挡住）
  const steam = bake('steam', [-6, -24, 12, 26], g => { g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -10, 0, -22); g.stroke(); });
  for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3) % 1; gfx.draw(steam, bx - 16 + i * 16, ty - 40 - k * 44, { alpha: (1 - k) * 0.8 }); }
  for (const [s, y, o] of dinnerLines(L, result)) text(s, L.W / 2, y, o);
}
const dinnerLooks = {};
function dinnerLook(chew) {
  const H = hero(), k = `${H.id}|${chew ? 'open' : 'smile'}`;
  if (!dinnerLooks[k]) dinnerLooks[k] = { ...H, eyes: 'happy', mouth: chew ? 'open' : 'smile', id: `${H.id}:dinner:${chew ? 'open' : 'smile'}` };
  dinnerLooks[k].art = H.art;
  return dinnerLooks[k];
}

// ── 暂停 ───────────────────────────────────────────
export function drawPause(L, settings, buttons) {
  gfx.rect(0, 0, L.W, L.H, { fill: 'rgba(30,20,40,.7)' });
  const w = 260, h = 300, x = (L.W - w) / 2, y = (L.H - h) / 2;
  card(x, y, w, h, 20, '#fffaf0', { lw: 2.6 });
  text('歇口气……', L.W / 2, y + 36, { size: 22, color: INK });   // 不叫「摸鱼」：和关卡里的带薪摸鱼（右上角「摸鱼中」标签）分开
  const btn = (id, label, by, fill) => { card(x + 30, by, w - 60, 44, 22, fill, { lw: 2.4 }); text(label, L.W / 2, by + 22, { size: 17, color: INK }); buttons.push({ id, x: x + 30, y: by, w: w - 60, h: 44 }); };
  btn('resume', '继续跑', y + 70, '#ffd166');
  btn('restart', '重新下班', y + 124, '#ffffff');
  btn('home', '回到首页', y + 178, '#ffffff');
  const tg = (id, label, on, bx) => { card(bx, y + 240, 96, 34, 17, on ? '#d8f8e1' : '#eee', { lw: 2, shadow: 0 }); text(`${label} ${on ? '开' : '关'}`, bx + 48, y + 257, { size: 14, color: INK }); buttons.push({ id, x: bx, y: y + 240, w: 96, h: 34 }); };
  tg('sound', '声音', !settings.mute, x + 26);
  tg('vibrate', '震动', settings.vibrate, x + w - 122);
}

// 文字预热：NPC 刚出现（离弹题还有约 1.5 秒）时把这道题会用到的字都排进队列，每帧生成几个，弹题那一帧就不卡
export function warmQueue(q, L) {
  const out = [];
  if (!q) return out;
  const npc = NPCS[q.npc] || (q.mom ? MEMBERS[q.npc] : null);
  const bw = L.W - 32;
  const push = (str, o) => { if (str) out.push([str, o]); };
  if (npc) {
    push(npc.name, { size: 17, color: INK }); push(npc.role, { size: 11, color: '#8a7f95', weight: 400 });
    for (const tr of npc.traits) push(tr, { size: 11, color: '#a0522d' });
  }
  if (q.pre) push(q.pre, { size: 12, color: '#8a7f95', weight: 400 });
  for (const s of wrap(q.line, bw - 36, 19)) push(s, { size: 19, color: INK });
  for (const opt of q.opts || []) {
    push(opt.text, { size: [...say(opt.text)].length > 6 ? 19 : 22, color: INK });
    if (opt.tag) push(opt.tag, { size: 12, color: '#fff' });
    if (opt.react) for (const s of wrap(opt.react, bw - 36, 19)) for (const col of ['#1e8449', '#9a6b00', '#c0392b']) push(s, { size: 19, color: col });
  }
  for (const m of ['放行', '勉强放行', '被缠上了！', '和解！']) push(m, { size: 12, color: '#fff' });
  if (q.mom) for (const m of [DOOR_MARKS.good, DOOR_MARKS.mid, ...Object.values(FAMILIES).map(f => f.marks.bad)]) push(m, { size: 12, color: '#fff' });
  return out;
}

export { TAG_COLORS, CALLERS, CHASE, lerp, card };
