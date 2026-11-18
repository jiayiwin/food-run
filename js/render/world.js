// 跑道带：天空 → 远景 → 中景 → 地面 → 地标 / 障碍 / 拾取 / NPC / 主角 / 特效。镜头以主角脚底为中心随速度拉远。
// 全部通过 gfx 绘制（WebGL 或 Canvas 2D）：矢量画只在第一次用到时烘焙成贴图，之后每帧只摆贴图。
import { TUNE, COURSE, CHASE } from '../data/tune.js';
import { OBSTACLES } from '../data/obstacles.js';
import { obstacleX, stageAt, lookAhead } from '../game/course.js';
import { hitbox } from '../game/player.js';
import { clockMin } from '../game/run.js';
import { INK, ease, clamp, lerp } from './draw.js';
import { sky, hash, THEMES, drawMidCell } from './scenery.js';
import { person, runPose, jumpPose, slidePose, stumblePose, idlePose, cheerPose, bikePose, mixPose } from './rig.js';
import { lookOf, PLAYER } from './looks.js';
import { drawParts, drawFloats } from './fx.js';
import { bgLayer, hasLayer, propArt } from './art.js';
import { bake, bakeTemp, makeLru, fromImage } from '../gfx/tex.js';
import { gfx } from '../gfx/gfx.js';
import { obstacleBox, drawObstacleVec, bunVec, coinVec, deskVec, exitVec, storeVec, boothVec, barrierVec, doorFrameVec, doorLeafVec, warnArrowVec, ebike } from './vecprops.js';

const themeAt = x => stageAt(x).id;
// 调试：?hitbox=1 显示判定框（障碍红、主角绿），用来核对美术图和碰撞是否对齐
export const DEBUG = { hitbox: false };
function drawHitboxes(run, x0, x1) {
  const box = (bx0, by0, bx1, by1, color) => gfx.rect(bx0, by0, bx1 - bx0, by1 - by0, { fill: 'rgba(0,0,0,0)', stroke: color, lw: 1.5 });
  for (const o of run.course.obstacles) {
    const t = OBSTACLES[o.type], ox = obstacleX(o, run.x);
    if (ox + t.w < x0 || ox > x1) continue;
    if (t.hole) box(ox + 10, -2, ox + t.w - 10, 6, '#00e5ff');
    else if (t.overhead) box(ox, -t.overhead[1], ox + t.w, -t.overhead[0], '#ff1744');
    else box(ox, -t.ground, ox + t.w, 0, '#ff1744');
  }
  const p = run.player, hb = hitbox(p);
  box(run.x + hb.x0, hb.y0, run.x + hb.x1, hb.y1, '#00e676');
}

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

// AI 美术图 → 贴图（左下角对齐 (x + ox, oy)）
const artTex = (id, def) => fromImage(`prop|${id}|${def.src}`, def.img, def.w, def.h, { ox: -(def.ox || 0), oy: def.h - (def.oy || 0) });
const prop = (id, box, draw) => { const a = propArt(id); return a ? artTex(id, a) : bake(`v|${id}`, box, draw); };

// ── 背景 ─────────────────────────────────────────────
const q = (v, n) => Math.round(v * n) / n;
function skyGfx(W, groundY, dusk, camX) {
  const d = q(dusk, 40);
  const [a, b, c] = sky(d);
  gfx.vgrad(0, 0, W, groundY + 2, [[0, a], [0.6, b], [1, c]]);
  const sunY = groundY * (0.42 + dusk * 0.7);
  gfx.circle(W * 0.72, sunY, 34, { fill: `rgba(255,${Math.round(220 - d * 90)},${Math.round(140 - d * 60)},${(0.95 - d * 0.6).toFixed(2)})` });
  if (dusk > 0.45) {
    const k = (dusk - 0.45) / 0.55;
    for (let i = 0; i < 18; i++) { const x = (hash(i * 7) * W * 1.5 - camX * 0.02) % W, y = hash(i * 13) * groundY * 0.45; gfx.rect((x + W) % W, y, 1.6, 1.6, { fill: '#fffae6', alpha: k }); }
    gfx.circle(W * 0.2, groundY * 0.18, 13, { fill: '#fffae6', alpha: k });
  }
  const ca = 0.55 - dusk * 0.35;
  for (let i = 0; i < 4; i++) {
    const span = W + 160, x = ((hash(i * 31) * span - camX * 0.06 * (0.6 + i * 0.2)) % span + span) % span - 80, y = 40 + hash(i * 17) * groundY * 0.3;
    for (let j = 0; j < 3; j++) gfx.circle(x + j * 16, y - (j === 1 ? 7 : 0), 13 - (j === 1 ? 0 : 3), { fill: '#fff', alpha: ca });
  }
}
function skylineGfx(W, groundY, dusk, camX) {
  for (const [par, base, colA] of [[0.08, 0.62, [150, 120, 170]], [0.18, 0.74, [120, 95, 145]]]) {
    const cell = 46, off = camX * par, first = Math.floor(off / cell) - 1;
    const c = colA.map(v => Math.round(v * (1 - q(dusk, 20) * 0.35)));
    const fill = `rgb(${c[0]},${c[1]},${c[2]})`;
    for (let i = first; i < first + W / cell + 3; i++) {
      const h = groundY * (1 - base) + hash(i * 3 + par * 1000) * groundY * 0.28;
      const x = i * cell - off, w = cell - 4 + hash(i * 5) * 8;
      gfx.rect(x, groundY - h, w, h, { fill });
      if (dusk > 0.3) for (let k = 0; k < 5; k++) if (hash(i * 11 + k) > 0.55) gfx.rect(x + 5 + (k % 2) * 14, groundY - h + 10 + Math.floor(k / 2) * 16, 6, 7, { fill: '#ffdc8c', alpha: (dusk - 0.3) * 0.9 });
    }
  }
}
// 代码画的中景：每格（90 宽）第一次出现时烘焙，最近用过的留着，其余回收
const midCells = makeLru(18, t => gfx.release(t));
function midGfx(W, groundY, themeFn, camX, dusk) {
  const par = 0.5, cell = 90, off = camX * par, first = Math.floor(off / cell) - 1, db = q(dusk, 4);
  for (let i = first; i < first + W / cell + 3; i++) {
    const theme = themeFn(i * cell / par);
    const tex = midCells.get(`${theme}|${i}|${db}`, () => bakeTemp('mid', [-40, -300, 170, 310], g => drawMidCell(g, theme, i, db), { res: 2 }));
    gfx.draw(tex, i * cell - off, groundY);
  }
}
function groundGfx(W, H, groundY, themeFn, camX) {
  const cell = 40, first = Math.floor(camX / cell) - 1;
  for (let i = first; i < first + W / cell + 3; i++) {
    const x = i * cell - camX, T = THEMES[themeFn(i * cell)];
    gfx.rect(x, groundY, cell + 1, H - groundY, { fill: T.floor });
    gfx.rect(x, groundY, 2, 18, { fill: T.floorLine }); gfx.rect(x + cell / 2, groundY + 18, 2, 18, { fill: T.floorLine });
    gfx.rect(x, groundY + 17, cell + 1, 2, { fill: T.floorLine });
    if (T.curb) {
      gfx.rect(x, groundY + 36, cell + 1, 6, { fill: T.curb }); gfx.rect(x, groundY + 42, cell + 1, H - groundY - 42, { fill: T.road });
      if (i % 3 === 0) gfx.rect(x, groundY + 70, cell * 0.8, 4, { fill: '#f2f2f2' });
    }
    if (T.grass) gfx.rect(x, groundY + 36, cell + 1, H - groundY - 36, { fill: T.grass });
  }
  gfx.rect(0, groundY - 1, W, 2.5, { fill: INK });
}
// AI 背景层：横向平铺，按格子所在世界坐标选路段，多张变体按格子编号确定性地挑
const vhash = n => { let h = (n | 0) * 2654435761; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
// 模块式背景：整条路在视差空间里一次排好（按路段挑模块、随机间距、偶尔镜像），运行时二分查找可见的那几块
const modPlans = new Map();
function modulePlan(name, par, themeFn) {
  const key = name + '|' + (themeFn === themeAt ? 'course' : themeFn(0));     // 标题页只用公司路段，单独一份
  let plan = modPlans.get(key);
  if (plan) return plan;
  plan = [];
  let x = -400, n = 0;
  const end = (COURSE.end + 2000) * par;
  // 视差层和地面速度不同：用「这一块走到屏幕中间时对应的世界坐标」决定它属于哪个路段，和出口地标对得更齐
  const worldOf = px => (px - 187) / par + 207;
  while (x < end) {
    const def = bgLayer(themeFn(worldOf(x)), name) || bgLayer('street', name);
    const mods = def.modules || def.list || [def];
    if (!mods.length) break;
    const m = mods[Math.floor(vhash(n * 7 + 1) * mods.length)];
    const [g0, g1] = def.gap || (def.modules ? [6, 40] : [0, 0]);
    const gap = g0 + vhash(n * 3 + 2) * (g1 - g0);
    plan.push({ x, m, flip: !!def.modules && !def.backdrop && vhash(n * 13 + 5) < 0.3, dy: def.dy || 0, span: m.w + gap, backdrop: def.backdrop });
    x += m.w + gap;
    n++;
  }
  modPlans.set(key, plan);
  return plan;
}
// 模块式 / 条带式背景都按计划表摆（条带按自身宽度平铺，不再被拉伸）
function moduleLayer(name, camX, W, groundY, themeFn) {
  const par = bgLayer('street', name).par, off = camX * par;
  const plan = modulePlan(name, par, themeFn);
  let lo = 0, hi = plan.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (plan[mid].x + plan[mid].span < off) lo = mid + 1; else hi = mid; }
  const top = groundY - groundY / 0.5;                  // 画到屏幕顶（镜头最远缩到 0.5 也够）
  for (let i = lo; i < plan.length; i++) {
    const p = plan[i], sx = p.x - off;
    if (sx > W) break;
    if (sx + p.span < 0) continue;
    if (p.backdrop) {
      // 室内：模块上方和模块之间是墙（窗户本身透明，还能看到外面）
      gfx.rect(sx - 0.5, top, p.span + 1, groundY - p.m.h + p.dy - top + 1, { fill: p.backdrop });
      if (p.span > p.m.w) gfx.rect(sx + p.m.w - 0.5, groundY - p.m.h + p.dy, p.span - p.m.w + 1, p.m.h, { fill: p.backdrop });
    }
    if (sx + p.m.w < 0) continue;
    const tex = fromImage(`bgm|${p.m.src}`, p.m.img, p.m.w, p.m.h);
    gfx.draw(tex, p.flip ? sx + p.m.w : sx, groundY - p.m.h + p.dy, { flip: p.flip });
  }
}
function imageLayer(name, camX, W, groundY, themeFn) { moduleLayer(name, camX, W, groundY, themeFn); }
// 暮色：户外压一层，室内（公司、楼道）不压；路段交界处 300px 内渐变，不一下子跳
function duskAmount(cx, themeFn) {
  if (themeFn !== themeAt) { const id = themeFn(cx); return id === 'office' || id === 'home' ? 0 : 1; }
  let k = 1;
  for (const s of COURSE.stages) if (s.id === 'office' || s.id === 'home') k = Math.min(k, clamp((cx < s.x0 ? s.x0 - cx : cx > s.x1 ? cx - s.x1 : 0) / 300, 0, 1));
  return k;
}
export function drawBackdrop(L, camX, z, dusk, themeFn = themeAt) {
  skyGfx(L.W, L.groundY, dusk, camX);
  if (hasLayer('far')) imageLayer('far', camX, L.W, L.groundY, themeFn);
  else skylineGfx(L.W, L.groundY, dusk, camX);
  gfx.save();
  gfx.translate(0, L.groundY); gfx.scale(z, z); gfx.translate(0, -L.groundY);
  const W = L.W / z, H = L.groundY + (L.H - L.groundY) / z;
  if (hasLayer('mid')) { if (midCells.size) midCells.clear(); imageLayer('mid', camX, W, L.groundY, themeFn); }
  else midGfx(W, L.groundY, themeFn, camX, dusk);
  if (hasLayer('ground')) imageLayer('ground', camX, W, L.groundY, themeFn);
  else groundGfx(W, H, L.groundY, themeFn, camX);
  gfx.restore();
  // 美术图不随天色变：在屏幕空间统一压暮色（之前画在缩放里，顶部会留一条没压到的边）
  const k = duskAmount(camX + L.W / z / 2, themeFn);
  if (dusk > 0 && k > 0 && (hasLayer('mid') || hasLayer('far'))) gfx.rect(0, 0, L.W, L.groundY + (L.H - L.groundY), { fill: '#341e60', alpha: 0.3 * dusk * k });
}

// ── 世界 ─────────────────────────────────────────────
export function drawWorld(run, L, vis, t) {
  const V = view(run, L), { z, camX } = V;
  const dusk = clamp((clockMin(run) - 18 * 60) / 75, 0, 1);
  drawBackdrop(L, camX, z, dusk);

  gfx.save();
  gfx.translate(0, L.groundY); gfx.scale(z, z); gfx.translate(-camX, 0);
  const x0 = camX - 80, x1 = camX + L.W / z + 120;
  landmarks(run, x0, x1, t);
  const obs = run.course.obstacles;
  for (let i = Math.max(0, run.obIdx - 6); i < obs.length; i++) {
    const o = obs[i], ox = obstacleX(o, run.x);
    if (ox > x1) { if (o.x > x1 + 600) break; continue; }
    if (ox + OBSTACLES[o.type].w < x0) continue;
    drawObstacle(o, ox, t);
  }
  const coinT = prop('coin', [-9, -9, 18, 18], coinVec), bunT = prop('bun', [-17, -17, 34, 34], bunVec);
  for (const pk of run.course.pickups) {
    if (pk.x < x0) continue;
    if (pk.x > x1) break;
    if (pk.taken) continue;
    if (pk.kind === 'coin') gfx.draw(coinT, pk.x, pk.y, { sx: Math.abs(Math.cos(t * 4 + pk.x * 0.01)) * 0.85 + 0.15 });
    else gfx.draw(bunT, pk.x, pk.y + Math.sin(t * 4 + pk.x) * 3);
  }
  drawNpcs(run, V, L, vis, t);
  drawPlayer(run, t, vis);
  if (DEBUG.hitbox) drawHitboxes(run, x0, x1);
  drawParts(vis.fx, 'world');
  drawFloats(vis.fx, 'world');
  gfx.restore();

  edgeWarnings(run, L, t);
  if (run.mod && run.mod.rain && (run.stage.id === 'street' || run.stage.id === 'park')) rain(L, t);
  if (run.v > 340 || run.ride) speedLines(run, L, t);
  if (run.sat < 25) {
    const tex = bake(`vig|${L.H}`, [0, 0, L.W, L.H], g => {
      const gr = g.createRadialGradient(L.W / 2, L.groundY - 120, 120, L.W / 2, L.groundY - 120, 360);
      gr.addColorStop(0, 'rgba(220,150,40,0)'); gr.addColorStop(1, 'rgba(220,150,40,1)');
      g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
    }, { res: 0.5 });
    gfx.draw(tex, 0, 0, { alpha: 0.25 + 0.1 * Math.sin(t * 6) });
  }
}

// ── 地标：工位、出口、小区大门、便利店、门禁、家门 ─────────────
const arm = { rot: 0, t: 0 };
function landmarks(run, x0, x1, t) {
  const inView = (a, b) => b > x0 && a < x1;
  if (inView(-200, 60)) gfx.draw(prop('desk', [-156, -92, 122, 96], deskVec), 0, 0);
  for (const s of COURSE.stages.slice(1)) {
    if (!inView(s.x0 - 100, s.x0 + 100)) continue;
    gfx.draw(prop('gate_' + s.id, [-76, -182, 152, 186], g => exitVec(g, s.id)), s.x0, 0);
  }
  for (const slot of COURSE.slots) {
    if (slot.kind === 'store' && inView(slot.x + 40, slot.x + 300)) {
      const x = slot.x + 120;
      gfx.draw(prop('store', [-74, -154, 168, 158], storeVec), x, 0);
      const sx0 = propArt('store') ? x + 10 : x - 26;
      for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; gfx.circle(sx0 + Math.sin(k * 6 + i) * 4, -60 - k * 30, 5 + k * 4, { fill: '#fff', alpha: (1 - k) * 0.8 }); }
    }
    if (slot.kind === 'gate' && inView(slot.x + 100, slot.x + 400)) {
      const x = slot.x + 240;
      gfx.draw(prop('gateBooth', [-4, -114, 108, 118], boothVec), x, 0);
      // 栏杆：主角走近就抬起；只有老周这题答错了才放下拦着
      const c = run.choice, mine = c && c.npc === 'zhou';
      const bad = mine && c.res && c.res.good === false, clear = run.x < x - 75 || run.x > x + 20;
      const target = (bad ? !clear : run.x > x - 160) ? 1.35 : 0;
      arm.rot += (target - arm.rot) * Math.min(1, Math.max(0, t - arm.t) * 10); arm.t = t;
      const armArt = propArt('gateArm');
      gfx.draw(prop('gateArm', [-122, -5, 124, 10], barrierVec), x + (armArt ? 4.6 : 5), armArt ? -40 : -54, { rot: arm.rot });
    }
  }
  if (inView(COURSE.end - 120, COURSE.end + 120)) {
    const x = COURSE.end + 10, open = run.ending ? clamp(run.ending.t / 0.5, 0, 1) : 0;
    if (propArt('homeDoor')) {
      gfx.draw(artTex('homeDoor', propArt('homeDoor')), x, 0);
      if (open > 0) gfx.rect(x, -136, 62, 136, { fill: '#ffe9b0', alpha: open * 0.9 });
      gfx.text('家', x + 31, -152, { size: 16, color: '#fff', lw: 4 });
    } else {
      gfx.draw(prop('homeDoorFrame', [-8, -160, 80, 162], doorFrameVec), x, 0);
      gfx.draw(prop('homeDoor', [-1, -1, 64, 128], doorLeafVec), x, -126, { sx: 1 - open * 0.85 });
    }
  }
}

// ── 障碍：每种烘焙一次 ─────────────────────────────────────
export function obstacleTex(type) {
  return prop(type, obstacleBox(type), g => drawObstacleVec(g, type));
}
function drawObstacle(o, x, t) {
  const T = OBSTACLES[o.type];
  if (o.type === 'manhole' && propArt('manhole') && propArt('warnSign')) gfx.draw(artTex('warnSign', propArt('warnSign')), x - 40, 0);
  gfx.draw(obstacleTex(o.type), x, T.vx ? -Math.abs(Math.sin(t * 12 + o.id)) * 1.5 : 0);
  if (o.type === 'banner' && propArt('banner')) gfx.text('Q4 冲刺！', x + 45, -99, { size: 14, color: '#ffe08a', lw: 3, stroke: '#8e1f1f' });
}

// ── NPC：读题前站在前方，读题时朝主角走来（走到跟前 = 时间到），选完被甩下 / 变成追兵 ─────
function drawNpcs(run, V, L, vis, t) {
  const toW = sx => V.camX + sx / V.z;
  const pend = run.pending;
  if (pend && pend.q) {
    const look = lookOf(pend.q.npc);
    if (pend.slot.kind === 'mom') {}                    // 妈妈统一在下面画
    else {
      // 题还没弹出：NPC 站在画面右侧往里走，弹题那一刻正好走到 x=300（之前站在固定世界坐标，只提前 0.3 秒才进画面）
      const lead = Math.max(0, pend.slot.x - run.x), k = clamp(lead / (1.5 * Math.max(run.v, 1)), 0, 1);
      const sx = 300 + 90 * k, wx = toW(sx);
      person(gfx, wx, 0, look, runPose((t * 1.2) % 1, 0.1), { flip: -1 });
      gfx.text(NPCNAME(pend.q.npc), wx, -84, { size: 12, color: '#fff', lw: 3 });
      pend.wx = wx;                 // 弹题时从这里开始走
    }
  }
  const c = run.choice;
  if (c && (c.kind === 'npc' || c.kind === 'mom')) {
    const look = lookOf(c.npc);
    if (c.kind === 'mom') {}
    else if (c.phase === 'open') {
      const k = ease.inOutSine(clamp(c.t / c.T, 0, 1));
      const sx = lerp(Math.min(V.sx(c.wx), 330), TUNE.playerX + 44, k);
      person(gfx, toW(sx), 0, look, runPose((t * 1.4) % 1, 0.2), { flip: -1 });
      vis.npcSX = sx;
    }
  }
  // 妈妈：进入回家路段后从门里出来迎（最远站在屏幕 x=330），弹题、答完、走到门口都看得见
  const momSlot = COURSE.slots.findIndex(s => s.kind === 'mom');
  if ((run.slotIdx >= momSlot || (pend && pend.slot.kind === 'mom')) && (!run.ending || run.ending.t < 0.8)) {
    const door = COURSE.end + 30, msx = Math.min(V.sx(door), 330), walking = msx < V.sx(door) - 1;
    const good = (c && c.kind === 'mom' && c.res && c.res.good === true) || run.flags.momGood;
    person(gfx, toW(msx), 0, lookOf('mom'), good ? cheerPose(t) : walking ? runPose((t * 1.1) % 1, 0.05) : idlePose(t), { flip: -1 });
    if (c && c.kind === 'mom') vis.npcSX = msx;
  }
  if (c && c.kind === 'ride') {
    const k = c.phase === 'open' ? ease.outCubic(clamp(c.t / (c.T * 0.6), 0, 1)) : 1;
    const gone = c.phase === 'result' && c.picked !== 0 ? c.rt * 600 : 0;
    const wx = run.x - 150 + 110 * k + gone;
    gfx.draw(rideTex(), wx, 0);
    vis.npcSX = V.sx(wx + 40);
  }
  if (c && c.kind === 'store') vis.npcSX = V.sx(c.x + 130);
  const gh = vis.ghost;
  if (gh && gh.good) {
    const age = t - gh.t;
    if (age < 1.6) person(gfx, gh.wx, 0, lookOf(gh.npc), { ...idlePose(t), head: -12, shR: 30, elR: 80 }, { flip: -1, alpha: 1 - age / 1.6 });
  }
  const ch = run.chaser, cs = run.cutscene;
  if (ch || (cs && cs.kind === 'caught')) {
    const npc = ch ? ch.npc : cs.npc;
    let sx = ch ? TUNE.playerX - 34 - clamp(ch.gap, 0, 150) * 0.55 : TUNE.playerX - 16;
    if (ch && vis.chaseFrom && t - vis.chaseFrom.t < 0.5) sx = lerp(vis.chaseFrom.sx, sx, ease.outCubic((t - vis.chaseFrom.t) / 0.5));
    const pose = cs ? { ...idlePose(t), shR: 80, elR: 10, lean: 12 } : runPose((t * 2.6) % 1, 1.2);
    person(gfx, toW(sx), 0, chaserLook(npc), pose, { flip: 1 });
    if (ch) {
      // 甩开进度：跟着追兵，但不出屏幕左边
      const mx = toW(Math.max(sx, 34)), k = clamp(ch.gap / CHASE.escape, 0, 1), danger = ch.gap < 30;
      gfx.rect(mx - 24, -104, 48, 12, { fill: '#fff', r: 6, stroke: INK, lw: 1.6 });
      if (k > 0.02) gfx.rect(mx - 22, -102, 44 * k, 8, { fill: danger ? '#e74c3c' : '#2ecc71', r: 4 });
      gfx.text(ch.phase === 'slow' ? '站住！' : '别跑！', mx, -118, { size: 13, color: '#fff', lw: 3, stroke: danger ? '#c0392b' : INK });
    }
  }
}
const chaserLooks = new Map();
function chaserLook(npc) {
  let l = chaserLooks.get(npc);
  if (!l) { l = { ...lookOf(npc), eyes: 'squint', mouth: 'open', mood: 'angry', id: (lookOf(npc).id || npc) + ':chase' }; chaserLooks.set(npc, l); }
  if (l.art !== lookOf(npc).art) l.art = lookOf(npc).art;      // 美术图异步加载完后跟上
  return l;
}
const rideTex = () => prop('rider', [-14, -70, 110, 74], g => ebike(g, 0, 0, 80, 0, true));
const NAMES = { laoliu: '老刘', ajie: '阿杰', lili: '莉莉', tony: 'Tony', amy: 'Amy', wang: '王阿姨', zhou: '老周', mom: '妈妈' };
export const NPCNAME = id => NAMES[id] || '';

// ── 主角 ─────────────────────────────────────────────
const playerLooks = new Map();
function playerLook(eyes, mouth) {
  const key = `${eyes || ''}|${mouth || ''}`;
  let l = playerLooks.get(key);
  if (!l) { l = { ...PLAYER, id: `player:${key}` }; if (eyes) l.eyes = eyes; if (mouth) l.mouth = mouth; playerLooks.set(key, l); }
  if (l.art !== PLAYER.art) l.art = PLAYER.art;
  return l;
}
function drawPlayer(run, t, vis) {
  const p = run.player, x = run.x;
  const look = playerLook(run.chaser ? 'wide' : null, run.sat < 25 ? 'open' : null);
  if (run.intro > 0) { person(gfx, x, 0, look, run.intro > 0.5 ? { ...idlePose(t), head: -8 } : cheerPose(t)); return; }
  if (run.ending) {
    const e = run.ending.t, dx = Math.min(1, e / 0.7) * 60;
    if (e < 0.8) person(gfx, x + dx, 0, look, runPose((t * 2.4) % 1, 0.6), { alpha: e < 0.6 ? 1 : 1 - (e - 0.6) / 0.2 });
    return;
  }
  if (run.ride) {
    if (propArt('rider')) {
      person(gfx, x - 30, -22, playerLook('happy', null), { ...bikePose(0.25), hipR: 90, knR: 140, hipL: 90, knL: 140, shR: 150, elR: 10, shL: 30, elL: 40, lean: -6 });
      gfx.draw(rideTex(), x - 40, 0);
    } else {
      gfx.draw(rideTex(), x - 40, 0);
      person(gfx, x - 22, -30, playerLook('happy', null), { ...bikePose(0.25), hipR: 90, knR: 90, hipL: 85, knL: 95, shR: 150, elR: 10, shL: 30, elL: 40, lean: -6 });
    }
    return;
  }
  const cs = run.cutscene;
  if (cs && cs.kind === 'hole') {
    person(gfx, x, p.y, playerLook('wide', 'open'), cheerPose(t), { alpha: clamp(1 - p.y / 90, 0, 1) });
    const ox = obstacleX(cs.o, x);
    gfx.rect(x - 60, 1, 120, 260, { fill: THEMES[themeAt(x)].floor });
    gfx.rect(x - 60, 0, 120, 2.5, { fill: INK });
    gfx.draw(obstacleTex('manhole'), ox, 0);
    return;
  }
  if (cs && cs.kind === 'caught') { person(gfx, x, 0, playerLook('wide', 'open'), { ...runPose((t * 3) % 1, 0.6), lean: 24 }); return; }
  let pose;
  if (p.state === 'stumble') pose = stumblePose(t);
  else if (p.state === 'slide') {
    const el = p.slideTotal - p.slideT, k = Math.min(1, el / 0.06, p.slideT / 0.08);
    pose = mixPose(runPose(p.runPhase), slidePose(), Math.max(0, Math.min(1, k)));
  } else if (!p.onGround) pose = jumpPose(p.vy);
  else pose = runPose(p.runPhase, Math.min(1.4, run.v / 300));
  const blink = p.invulnT > 0 && Math.floor(t * 16) % 2 === 0;
  person(gfx, x, p.y, look, pose, { alpha: blink ? 0.45 : 1, stretch: vis.sq || 0 });
}

// ── 屏幕空间：右缘预警、速度线 ─────────────────────────────
function edgeWarnings(run, L, t) {
  const ahead = lookAhead(run.vBase);
  for (let i = run.obIdx; i < run.course.obstacles.length; i++) {
    const o = run.course.obstacles[i], T = OBSTACLES[o.type];
    const ox = obstacleX(o, run.x);
    if (ox - run.x > ahead + run.vBase * 0.9) break;
    if (!T.warn || ox - run.x < ahead - 10) continue;
    const on = Math.floor(t * 8) % 2 === 0;
    gfx.draw(bake(`warn|${on}`, [-2, -18, 30, 36], g => warnArrowVec(g, on ? '#ff4757' : '#ffa502')), L.W - 34, L.groundY - 34);
  }
}
// 暴雨词条：压暗天色 + 斜着落的雨丝
function rain(L, t) {
  gfx.rect(0, 0, L.W, L.groundY + 40, { fill: '#1c2a44', alpha: 0.16 });
  const h = L.groundY + 30, span = L.W + 20;
  for (let i = 0; i < 36; i++) {
    const y = ((t * (520 + (i % 5) * 60) + i * 137.7) % (h + 30)) - 20;
    const x = (((i * 71.3 - y * 0.25) % span) + span) % span - 10;
    gfx.line(x, y, x - 4, y + 16, { color: '#cfe3ff', w: 1.4, alpha: 0.45 });
  }
}
function speedLines(run, L, t) {
  const n = run.ride ? 14 : 8, k = run.ride ? 0.45 : 0.25 * clamp((run.v - 340) / 80, 0, 1);
  if (k <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.3, y = L.groundY - 30 - ((seed * 7.1) % 200);
    const len = run.v * 0.12, x = L.W - ((t * run.v * 1.6 + seed * 40) % (L.W + len));
    gfx.line(x, y, x + len, y, { color: '#fff', w: 2, alpha: k });
  }
}

export { PLAYER };
