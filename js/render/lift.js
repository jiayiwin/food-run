// 写字楼电梯 / 楼梯的画面（逻辑都在 run.js：路线卡、进门、轿厢的一拍一拍、关门键；这里全是画面）：
//   世界层：电梯厅门（门框 + 两扇门，门洞中心在 branch.door；选了电梯、主角走近就开）、楼梯间的墙（AI 出图的墙面模块，
//           没图时代码画）、楼层号、「安全出口」绿牌
//   屏幕层：轿厢（x 24–351、groundY − 290 … groundY + 6 的固定镜头小房间）：门洞后面的走廊 → 门外的人 → 两扇门 → 轿厢图 →
//           楼层显示 → 里面的人；外卖那一拍拇指区一个大圆关门键
import { ROOM, speedAt } from '../data/tune.js';
import { LIFT } from '../data/events.js';
import { propArt } from './art.js';
import { person, idlePose, cheerPose, runPose } from './rig.js';
import { lookOf, hero } from './looks.js';
import { INK, roundRect, clamp, lerp, ease } from './draw.js';
import { bake, fromImage } from '../gfx/tex.js';
import { gfx } from '../gfx/gfx.js';

const STEEL = '#B9BFCC', AMBER = '#FFB020', HALL = '#F3E6D0', CABIN = '#C9C3D3';
const STOP = { npc: 1, takeout: 1, empty: 1 };
const NAMES = { laoliu: '老刘', ajie: '阿杰', lili: '莉莉', tony: 'Tony', amy: 'Amy', wang: '王阿姨', zhou: '老周', mom: '妈妈', xiaoge: '外卖小哥' };
// 美术图 → 贴图（左下角对齐 (x + ox, oy)，和 world.js 的 artTex 同一个约定）
const artTex = (id, def) => fromImage(`prop|${id}|${def.src}`, def.img, def.w, def.h, { ox: -(def.ox || 0), oy: def.h - (def.oy || 0) });

// ── 代码画的兜底（门框 90×128、门洞 44×108；门扇 22×108；轿厢 327×296、门洞在右边）──────────
const HALL_VEC = { w: 90, h: 128, ox: -45, hole: [-22, -108, 44, 108], display: [0, -117], call: [31, -60] };
function hallVec(g) {
  const [hx, hy, hw, hh] = HALL_VEC.hole;
  // 米色石材墙边：只画门洞四周，门洞留空（门扇、开门后的轿厢画在这张图后面，要透出来）
  g.fillStyle = '#EADCC6'; g.fillRect(-45, -128, 90, 128 + hy); g.fillRect(-45, hy, 45 + hx, hh); g.fillRect(hx + hw, hy, 45 - hx - hw, hh);
  g.fillStyle = STEEL;
  g.fillRect(-38, -124, 76, 16); g.fillRect(-38, hy, hx + 38, hh); g.fillRect(hx + hw, hy, 38 - hx - hw, hh);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-34, hy, 3, hh);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-45, -128, 90, 128); g.strokeRect(hx, hy, hw, hh);
  g.fillStyle = '#2B2233'; roundRect(g, -12, -123, 24, 12, 2); g.fill();          // 楼层显示（空白，数字代码写）
  g.fillStyle = '#d8d4e0'; roundRect(g, 27, -70, 8, 20, 2); g.fill(); g.lineWidth = 1.4; g.stroke();
}
function leafVec(g) {
  g.fillStyle = '#C4CAD6'; g.fillRect(0, -108, 22, 108);
  g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(4, -108, 3, 108);
  g.fillStyle = '#3a3344'; g.fillRect(19, -108, 3, 108);
  g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(0, -108, 22, 108);
}
const CAB_VEC = { w: 327, h: 314, oy: 6, hole: [214, -220, 74, 206], display: [251, -241], panel: [193, -154] };
function cabVec(g) {
  const [hx, hy, hw, hh] = CAB_VEC.hole;
  g.fillStyle = '#DCE3EA';
  g.fillRect(0, -308, 327, hy + 308); g.fillRect(0, hy, hx, hh); g.fillRect(hx + hw, hy, 327 - hx - hw, hh);
  g.fillStyle = '#c3cbd6'; for (let x = 60; x < hx; x += 70) g.fillRect(x, -285, 2, 275);
  g.fillStyle = '#eef2f6'; g.fillRect(0, -308, 327, 24);
  g.fillStyle = '#fff6d8'; roundRect(g, 30, -304, 90, 10, 3); g.fill(); roundRect(g, 170, -304, 90, 10, 3); g.fill();
  g.fillStyle = '#AEB7C2'; roundRect(g, 10, -110, 180, 8, 4); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#4a4458'; g.fillRect(0, -10, 327, 16);
  g.fillStyle = '#2B2233'; roundRect(g, hx + 10, hy - 30, hw - 20, 18, 3); g.fill();
  g.fillStyle = '#e8ecf2'; roundRect(g, hx - 30, -175, 16, 46, 3); g.fill(); g.lineWidth = 1.4; g.stroke();
  g.strokeStyle = INK; g.lineWidth = 2.4; g.strokeRect(hx, hy, hw, hh); g.strokeRect(1, -307, 325, 312);
}
function hallTex() {
  const a = propArt('liftHall');
  if (a) return { tex: artTex('liftHall', a), hole: a.hole || HALL_VEC.hole, display: (a.anchors && a.anchors.display) || HALL_VEC.display, call: (a.anchors && a.anchors.call) || HALL_VEC.call };
  return { tex: bake('liftHallVec', [-46, -130, 92, 132], hallVec), ...HALL_VEC };
}
function leafTex() {
  const a = propArt('liftLeaf');
  return a ? { tex: artTex('liftLeaf', a), w: a.w, h: a.h } : { tex: bake('liftLeafVec', [-1, -109, 24, 110], leafVec), w: 22, h: 108 };
}
function cabTex() {
  const a = propArt('liftCab');
  if (a) return { tex: artTex('liftCab', a), hole: a.hole || CAB_VEC.hole, display: (a.anchors && a.anchors.display) || CAB_VEC.display, panel: (a.anchors && a.anchors.panel) || CAB_VEC.panel };
  return { tex: bake('liftCabVec', [-1, -309, 329, 316], cabVec), ...CAB_VEC };
}
// 两扇门：k = 0 关、1 开。左扇往左滑、右扇（翻转）往右滑，最多滑开半个门洞；滑进去的部分被门框 / 轿厢图挡住
function leaves(x, y, hole, k) {
  const L = leafTex(), hw = hole[2] / 2, sx = hw / L.w, sy = hole[3] / L.h, slide = (hw - 2) * clamp(k, 0, 1);
  const hx = x + hole[0], by = y + hole[1] + hole[3];
  gfx.draw(L.tex, hx - slide, by, { sx, sy });
  gfx.draw(L.tex, hx + hole[2] + slide, by, { sx, sy, flip: true });
}

// ── 世界层 ─────────────────────────────────────────────
const stairsOf = (lv, br) => lv.stages.find(s => s.x0 >= br.door && s.x1 <= br.exit + 1 && s.slowK) || null;
const ROW = 170, ROWS = 4;
const WALL_SEQ = [0, 1, 2, 1, 0, 2, 0, 2, 1, 2, 0, 1];          // 墙面模块的排法：相邻不重样
const wallId = (k, row) => WALL_SEQ[(k + row * 5) % WALL_SEQ.length];
export function drawLiftWorld(run, x0, x1, t) {
  const br = run.course.branch;
  if (!br || br.door - 200 > x1 || br.exit + 50 < x0) return;
  const st = stairsOf(run.lv, br);
  // 楼梯间的墙：整段铺墙色（盖住公司的背景），再排墙面模块；楼层号每 270px 一个，往下数到 2 楼（出口是 1 楼大门）
  if (st && st.x1 > x0 && st.x0 < x1) {
    // 竖井的剖面：一层一排墙面（往上几层越来越暗），层与层之间一条楼板；地面换成水泥灰
    const W = st.x1 - st.x0;
    gfx.rect(st.x0, -10 - ROWS * ROW - 1200, W, 1200, { fill: '#9C94AC' });
    for (let row = 0; row < ROWS; row++) {
      const base = -row * ROW;
      gfx.rect(st.x0, base - 10 - 150, W, 150, { fill: '#D9D4DE' });
      let k = 0;
      for (let x = st.x0; x < st.x1 - 20; k++) {
        const wid = wallId(k, row), id = 'stairsWall' + wid, a = propArt(id), w = a ? a.w : 90;
        if (x + w > x0 && x < x1) {
          if (a) gfx.draw(artTex(id, a), x, base);
          else gfx.draw(bake('stairsWallVec|' + wid, [-1, -162, 92, 154], g => wallVec(g, wid)), x, base);
        }
        x += w;
      }
      gfx.rect(st.x0, base - 10 - 150 - 20, W, 20, { fill: '#BDB6C6' });            // 楼板
      gfx.rect(st.x0, base - 10 - 150 - 1.5, W, 1.5, { fill: '#8E86A0' });
      if (row > 0) gfx.rect(st.x0, base - 10 - 150 - 20, W, ROW, { fill: '#2B2233', alpha: 0.08 + 0.07 * row });
    }
    gfx.rect(st.x0, -10, W, 10, { fill: '#BDB6C6' });
    gfx.rect(st.x0, 1.2, W, 600, { fill: '#BCB4C8' });                               // 水泥地
    for (let x = st.x0 + 45; x < st.x1; x += 90) gfx.rect(x, 1.2, 1.5, 34, { fill: '#A39AB2' });
    gfx.rect(st.x0, 17, W, 1.5, { fill: '#A39AB2' });
    // 楼层号：写在头顶的楼板上，跑一段少一层，最后一个是 2F（出口是 1 楼大门）
    const n = Math.max(1, ROOM.floor0 - 2), span = (st.x1 - st.x0) / n;
    for (let i = 0; i < n; i++) {
      const lx = st.x0 + span * (i + 0.5);
      if (lx < x0 - 40 || lx > x1 + 40) continue;
      gfx.text((ROOM.floor0 - 1 - i) + 'F', lx, -170, { size: 15, color: '#5D536E', weight: 700 });
    }
    // 入口上方的「安全出口」绿牌
    if (st.x0 + 40 > x0 && st.x0 - 40 < x1) {
      gfx.rect(st.x0 + 4, -158, 50, 20, { fill: '#2FAE5F', r: 3, stroke: INK, lw: 1.4 });
      gfx.text('安全出口', st.x0 + 29, -148, { size: 10, color: '#fff' });
    }
  }
  // 电梯厅门：选了电梯、主角走近（门前 0.9 秒路程开始、0.5 秒路程全开）就开门；进了轿厢就关上
  if (br.door + 60 > x0 && br.door - 60 < x1) {
    const H = hallTex(), v = speedAt(br.door), d = br.door - run.x;
    const k = br.route === 'lift' && !br.used ? clamp((0.9 * v - d) / (0.4 * v), 0, 1) : 0;
    const [hx, hy, hw, hh] = H.hole, X = br.door;
    if (k > 0) {
      gfx.rect(X + hx, hy, hw, hh, { fill: CABIN });
      gfx.rect(X + hx + 4, hy + 4, hw - 8, 4, { fill: '#FFF6D8' });
    }
    leaves(X, 0, H.hole, k);
    gfx.draw(H.tex, X, 0);
    const [dx, dy] = H.display;
    gfx.text(`${ROOM.floor0}▼`, X + dx, dy, { size: 9, color: AMBER, weight: 700 });
    if (br.route === 'lift' && !br.used) gfx.circle(X + H.call[0], H.call[1] + 5, 2.6, { fill: AMBER });   // 下行键亮着
  }
}
function wallVec(g, i) {
  g.fillStyle = '#D9D4DE'; g.fillRect(0, -160, 90, 150);
  g.fillStyle = '#B8B0C4'; g.fillRect(0, -48, 90, 38);
  g.strokeStyle = '#8E86A0'; g.lineWidth = 1.6; g.strokeRect(0, -160, 90, 150);
  if (i === 0) { g.fillStyle = '#D9443A'; roundRect(g, 22, -140, 44, 40, 3); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); g.strokeStyle = '#fff'; g.beginPath(); g.arc(44, -120, 10, 0, Math.PI * 2); g.stroke(); }
  if (i === 1) { g.fillStyle = '#8E86A0'; g.fillRect(14, -160, 7, 150); }
  if (i === 2) { g.fillStyle = '#F4C98A'; roundRect(g, 20, -150, 50, 14, 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); }
}

// ── 屏幕层：轿厢 ────────────────────────────────────────
const PANEL_X = 24;
const angryLooks = new Map();
function angryLook(npc) {
  let l = angryLooks.get(npc);
  const base = lookOf(npc);
  if (!l) { l = { ...base, eyes: 'squint', mouth: 'open', mood: 'angry', id: (base.id || npc) + ':chase' }; angryLooks.set(npc, l); }
  if (l.art !== base.art) l.art = base.art;
  return l;
}
// 轿厢此刻的样子（纯函数：只看 run.room 的拍子和时间）
export function roomView(r) {
  const B = r.beats, cur = B[Math.min(r.bi, B.length - 1)], prev = B[r.bi - 1], bt = r.bi < B.length ? r.bt : cur.T;
  let door = 0;
  if (cur.kind === 'close') door = 1 - clamp(bt / (r.shut ? 0.22 : cur.T), 0, 1);          // 门夹追兵：门合得更快
  else if (cur.kind === 'down') door = prev && STOP[prev.kind] && !prev.closed ? clamp(1 - bt / 0.3, 0, 1) : 0;
  else if (cur.kind === 'takeout' && cur.closed) door = clamp(1 - (bt - cur.closedAt) / 0.2, 0, 1);
  else if (STOP[cur.kind]) door = clamp(bt / 0.25, 0, 1);
  else if (cur.kind === 'open') door = clamp(bt / 0.3, 0, 1);
  let floor = ROOM.floor0, moving = false;
  if (cur.kind === 'down') { moving = true; floor = Math.round(lerp(cur.from, cur.to, clamp(bt / cur.T, 0, 1))); }
  else if (cur.floor) floor = cur.floor;
  else if (cur.kind === 'close') floor = ROOM.floor0;
  // 进来的人：已经过去的停层里的同事，没被关在外面的外卖小哥
  const inside = [];
  for (let i = 0; i < Math.min(r.bi, B.length); i++) {
    const b = B[i];
    if (b.kind === 'npc' && b.npc) inside.push({ id: b.npc });
    if (b.kind === 'takeout' && !b.closed) inside.push({ id: 'xiaoge' });
  }
  return { cur, bt, door, floor, moving, inside };
}
export function drawRoom(run, L, vis, t, buttons) {
  const r = run.room;
  if (!r) return;
  const V = roomView(r), C = cabTex(), X = PANEL_X, Y = L.groundY;
  const [hx, hy, hw, hh] = C.hole, HX = X + hx, HY = Y + hy;
  const inK = ease.outCubic(clamp(r.t / 0.15, 0, 1));
  gfx.rect(0, 0, L.W, L.H, { fill: '#1e1428', alpha: 0.6 * inK });
  gfx.save();
  gfx.translate(L.W / 2, Y); gfx.scale(0.94 + 0.06 * inK); gfx.translate(-L.W / 2, -Y);
  // 门洞后面：走廊（停在哪层写哪层）
  gfx.rect(HX, HY, hw, hh, { fill: HALL });
  gfx.rect(HX, HY + hh - 14, hw, 14, { fill: '#D8C6A8' });
  gfx.text(`${V.floor}F`, HX + hw / 2, HY + 26, { size: 15, color: '#A08A6A', weight: 700 });
  // 门外的人：外卖小哥等着进来 / 被门夹住的追兵
  const cur = V.cur, bt = V.bt, mid = HX + hw / 2;
  if (cur.kind === 'takeout' && !cur.inside) person(gfx, mid, Y - 2, lookOf('xiaoge'), runPose((t * 2.2) % 1, 0.15), { flip: -1, scale: 1.2 });
  if (cur.kind === 'close' && r.shut && r.chaser) person(gfx, mid + 6, Y - 2, angryLook(r.chaser), runPose((t * 2.6) % 1, 1.0), { flip: -1, scale: 1.2 });
  leaves(X, Y, C.hole, V.door);
  if (cur.kind === 'close' && r.shut && r.chaser && V.door < 0.3 && bt < 0.6) {
    // 门缝里压扁的追兵（sx 0.35），门板跟着抖一下
    gfx.save(); gfx.translate(mid, Y - 2); gfx.scale(0.35, 1); person(gfx, 0, 0, angryLook(r.chaser), idlePose(t), { flip: -1, scale: 1.2 }); gfx.restore();
  }
  gfx.draw(C.tex, X, Y);
  // 楼层显示：大字号楼层 + ▼（下行时）
  const [dx, dy] = C.display;
  gfx.text(`${V.floor}${V.moving ? '▼' : ''}`, X + dx, Y + dy, { size: 18, color: AMBER, weight: 700, id: 'lift-floor' });
  // 按钮面板上，按了关门键的那一下亮一颗
  if (cur.kind === 'takeout' && cur.closed && bt - cur.closedAt < 0.3) gfx.circle(X + C.panel[0], Y + C.panel[1] + 12, 3.5, { fill: AMBER });
  // 里面的人：主角在左；跟进来的追兵；停层进来的人站右边
  const px = X + 78;
  const cheer = r.shut && r.t < 1.2;
  person(gfx, px, Y - 2, hero(), cheer ? cheerPose(t) : idlePose(t), { scale: 1.2 });
  let slot = 0;
  const spot = () => X + 150 + 34 * (slot++);
  if (r.chaserIn && r.chaser) { const cx = spot(); person(gfx, cx, Y - 2, angryLook(r.chaser), { ...idlePose(t), shR: 70, elR: 120, shL: -70, elL: 120 }, { flip: -1, scale: 1.2 }); gfx.text(NAMES[r.chaser] || '', cx, Y - 140, { size: 12, color: '#fff', lw: 3 }); }
  for (const p of V.inside) person(gfx, spot(), Y - 2, lookOf(p.id), idlePose(t + slot), { flip: -1, scale: 1.2 });
  // 这一拍正在进门的人
  let npcSX = null;
  if (cur.kind === 'npc' && cur.npc) {
    const k = ease.outCubic(clamp(bt / 0.35, 0, 1)), sx = lerp(mid, spot(), k);
    person(gfx, sx, Y - 2, lookOf(cur.npc), k < 1 ? runPose((t * 2) % 1, 0.2) : idlePose(t), { flip: -1, scale: 1.2 });
    if (!run.choice || !run.choice.room) gfx.text(NAMES[cur.npc] || '', sx, Y - 140, { size: 12, color: '#fff', lw: 3 });   // 读题时名字在气泡里
    npcSX = sx;
  }
  if (cur.kind === 'takeout' && cur.inside) {
    const k = ease.outCubic(clamp((bt - ROOM.closeWin) / 0.1, 0, 1)), sx = lerp(mid, spot(), k);
    person(gfx, sx, Y - 2, lookOf('xiaoge'), idlePose(t), { flip: -1, scale: 1.2 });
  }
  if (cur.kind === 'empty' && V.door > 0.6) gfx.text(LIFT.empty, mid, HY + hh / 2, { size: 12, color: '#7D6E8F', weight: 400 });
  gfx.restore();
  vis.npcSX = npcSX != null ? npcSX : mid;              // 读题气泡的尾巴指向进来的人
  if (cur.kind === 'takeout') closeKey(run, L, t, buttons);
}
// 关门键：拇指区大圆钮（圆心 W/2、卡片区中间，半径 44）。能按时 4Hz 脉冲 + 下面一条 0.7 秒的倒计时条
function closeKey(run, L, t, buttons) {
  const r = run.room, b = r.beats[r.bi];
  if (!b || !run.liftBtn) return;
  const cx = L.W / 2, cy = L.cardsY + L.cardsH / 2, R = 44;
  const pressed = b.closed && r.bt - b.closedAt < 0.15, on = r.btn;
  const s = pressed ? 0.94 : on ? 1 + 0.06 * (0.5 + 0.5 * Math.sin(t * 8 * Math.PI)) : 1;
  gfx.save(); gfx.translate(cx, cy); gfx.scale(s);
  gfx.alpha(on || pressed ? 1 : 0.6);
  gfx.circle(0, 0, R + 3, { fill: '#FFFFFF', stroke: INK, lw: 2 });
  gfx.circle(0, 0, R, { fill: pressed ? '#2FB862' : on ? '#3FDC7A' : '#9AA3B5' });
  gfx.draw(bake('closeIcon', [-17, -11, 34, 22], g => {
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-15, -9); g.lineTo(-3, 0); g.lineTo(-15, 9); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(15, -9); g.lineTo(3, 0); g.lineTo(15, 9); g.closePath(); g.fill();
    g.fillRect(-1.2, -10, 2.4, 20);
  }), 0, -8);
  gfx.text('关门', 0, 20, { size: 13, color: '#fff', lw: 3 });
  gfx.restore();
  if (on) {
    const k = clamp(1 - r.bt / ROOM.closeWin, 0, 1);
    gfx.rect(cx - 44, cy + 50, 88, 5, { fill: 'rgba(255,255,255,.35)', r: 2.5 });
    gfx.rect(cx - 44, cy + 50, 88 * k, 5, { fill: '#FFFFFF', r: 2.5 });
    buttons.push({ id: 'liftClose', x: cx - R - 10, y: cy - R - 10, w: 2 * R + 20, h: 2 * R + 20 });
  }
}
