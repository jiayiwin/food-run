// 跑道带：天空 → 远景 → 中景 → 地面 → 地标 / 障碍 / 拾取 / NPC / 主角 / 特效。镜头以主角脚底为中心随速度拉远。
// 全部通过 gfx 绘制（WebGL 或 Canvas 2D）：矢量画只在第一次用到时烘焙成贴图，之后每帧只摆贴图。
import { TUNE, CHASE, DASH, TRAFFIC } from '../data/tune.js';
import { OBSTACLES } from '../data/obstacles.js';
import { obstacleX, lookAhead } from '../game/course.js';
import { hitbox } from '../game/player.js';
import { dashReady, dashZoneAt, crossHold, crossDashOpen } from '../game/run.js';
import { FULL } from '../game/level.js';
import { INK, ease, clamp, lerp, roundRect } from './draw.js';
import { sky, hash, THEMES, drawMidCell } from './scenery.js';
import { person, runPose, jumpPose, slidePose, stumblePose, idlePose, cheerPose, bikePose, mixPose } from './rig.js';
import { lookOf, hero } from './looks.js';
import { drawParts, drawFloats } from './fx.js';
import { bgLayer, hasLayer, propArt } from './art.js';
import { veilAt, veilAlpha, FOG } from './veil.js';
import { bake, bakeTemp, bakeSticker, makeLru, fromImage } from '../gfx/tex.js';
import { gfx } from '../gfx/gfx.js';
import { obstacleBox, drawObstacleVec, bunVec, coinVec, deskVec, exitVec, storeVec, boothVec, barrierVec, doorFrameVec, doorLeafVec, warnSignVec, ebike, dashRingVec, dashMarkVec, leashLadyVec, warnSignPropVec, LEASH_LADY_BOX, WARN_SIGN_BOX } from './vecprops.js';
import { stepTraffic, drawTraffic, drawSplashWall, drawParked, doorK, rideLeave } from './traffic.js';
import { drawCrossGround, drawCrossCar } from './cross.js';
import { drawLiftWorld } from './lift.js';
import { drawDoorScene, drawDoorDecor, drawErrandPickup } from './homes.js';
import { MEMBERS } from '../data/family.js';

// 背景按「画面上下文」排：游戏里就是这一局的关卡 run.lv（路段、主题、起终点）；标题页用固定一个主题、不做路段过渡
export const TITLE_CTX = { id: 'title', fixed: 'office', themeAt: () => 'office', stages: [], x0: 0, end: FULL.end };
const ctxOf = c => (typeof c === 'function' ? { id: 'fn|' + c(0), fixed: c(0), themeAt: c, stages: [], x0: 0, end: FULL.end } : c || FULL);
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
// 会撞的和能捡的（米白外圈）：美术图打包时加外圈；没有美术图时矢量兜底烘焙时加同样的外圈，语义不变
const RIMMED = new Set([...Object.keys(OBSTACLES), 'coin', 'bun', 'rider']);
const prop = (id, box, draw) => { const a = propArt(id); return a ? artTex(id, a) : RIMMED.has(id) ? bakeSticker(`v|${id}`, box, draw) : bake(`v|${id}`, box, draw); };

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
// 后人行道：美术中景整体往上抬（spec 里 mid.dy：户外和楼道 −14、公司 −10），地面线上面露出一条比地面亮 6% 的后沿带，
// 顶上一条白色细分界线；公司是一条踢脚线。画在背景罩之后，不被压暗。障碍、主角、地标照旧站在 y = 0
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
const BACK = Object.fromEntries(Object.entries(THEMES).map(([id, T]) => [id, id === 'office' ? T.floorLine : shade(T.floor, 1.06)]));
const backH = id => { const d = hasLayer('mid') && bgLayer(id, 'mid'); return d ? Math.max(0, -(d.dy || 0)) : 0; };
function groundGfx(W, H, groundY, themeFn, camX) {
  const cell = 40, first = Math.floor(camX / cell) - 1;
  for (let i = first; i < first + W / cell + 3; i++) {
    const id = themeFn(i * cell), x = i * cell - camX, T = THEMES[id], bh = backH(id);
    if (bh > 0) {
      gfx.rect(x, groundY - bh, cell + 1, bh, { fill: BACK[id] });
      if (id !== 'office') gfx.rect(x, groundY - bh, cell + 1, 1, { fill: 'rgba(255,255,255,.45)' });
    }
    gfx.rect(x, groundY, cell + 1, H - groundY, { fill: T.floor });
    gfx.rect(x, groundY, 2, 18, { fill: T.floorLine }); gfx.rect(x + cell / 2, groundY + 18, 2, 18, { fill: T.floorLine });
    gfx.rect(x, groundY + 17, cell + 1, 2, { fill: T.floorLine });
    if (T.curb) {
      gfx.rect(x, groundY + 36, cell + 1, 6, { fill: T.curb }); gfx.rect(x, groundY + 42, cell + 1, H - groundY - 42, { fill: T.road });
      if (i % 3 === 0) gfx.rect(x, groundY + 92, cell * 0.8, 4, { fill: '#f2f2f2' });     // 车道分隔线：在远、近两条车道的车轮线中间
    }
    if (T.grass) gfx.rect(x, groundY + 36, cell + 1, H - groundY - 36, { fill: T.grass });
  }
  gfx.rect(0, groundY - 1, W, 2.5, { fill: INK });
}
// AI 背景层：横向平铺，按格子所在世界坐标选路段，多张变体按格子编号确定性地挑
const vhash = n => { let h = (n | 0) * 2654435761; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
// 模块式背景：整条路在视差空间里一次排好（按路段挑模块、随机间距、偶尔镜像），运行时二分查找可见的那几块
const modPlans = new Map();
function modulePlan(name, par, ctx) {
  const key = name + '|' + ctx.id;                     // 每个关卡、标题页各一份
  let plan = modPlans.get(key);
  if (plan) return plan;
  plan = [];
  const themeFn = ctx.themeAt;
  let x = ctx.x0 * par - 400, n = 0;
  const end = (ctx.end + 2000) * par;
  // 视差层和地面速度不同：用「这一块走到屏幕中间时对应的世界坐标」决定它属于哪个路段，和出口地标对得更齐
  const worldOf = px => (px - 187) / par + 207;
  while (x < end) {
    const def = bgLayer(themeFn(worldOf(x)), name) || bgLayer('street', name);
    const mods = def.modules || def.list || [def];
    if (!mods.length) break;
    const m = mods[Math.floor(vhash(n * 7 + 1) * mods.length)];
    const [g0, g1] = def.gap || (def.modules ? [6, 40] : [0, 0]);
    const gap = g0 + vhash(n * 3 + 2) * (g1 - g0);
    plan.push({ x, m, flip: !!def.modules && !def.backdrop && vhash(n * 13 + 5) < 0.3, dy: def.dy || 0, span: m.w + gap, backdrop: def.backdrop, full: !!def.backdropFull });
    x += m.w + gap;
    n++;
  }
  modPlans.set(key, plan);
  return plan;
}
// 模块式 / 条带式背景都按计划表摆（条带按自身宽度平铺，不再被拉伸）
function moduleLayer(name, camX, W, groundY, ctx) {
  const par = bgLayer('street', name).par, off = camX * par;
  const plan = modulePlan(name, par, ctx);
  let lo = 0, hi = plan.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (plan[mid].x + plan[mid].span < off) lo = mid + 1; else hi = mid; }
  const top = groundY - groundY / 0.5;                  // 画到屏幕顶（镜头最远缩到 0.5 也够）
  for (let i = lo; i < plan.length; i++) {
    const p = plan[i], sx = p.x - off;
    if (sx > W) break;
    if (sx + p.span < 0) continue;
    if (p.backdrop) {
      if (p.full) gfx.rect(sx - 0.5, top, p.span + 1, groundY + p.dy - top + 1, { fill: p.backdrop });   // 楼道：抠图透明的地方背后整块铺墙，不漏出天空
      else {
        // 公司：模块上方和模块之间是墙（窗户本身透明，还能看到外面）
        gfx.rect(sx - 0.5, top, p.span + 1, groundY - p.m.h + p.dy - top + 1, { fill: p.backdrop });
        if (p.span > p.m.w) gfx.rect(sx + p.m.w - 0.5, groundY - p.m.h + p.dy, p.span - p.m.w + 1, p.m.h, { fill: p.backdrop });
      }
    }
    if (sx + p.m.w < 0) continue;
    const tex = fromImage(`bgm|${p.m.src}`, p.m.img, p.m.w, p.m.h);
    gfx.draw(tex, p.flip ? sx + p.m.w : sx, groundY - p.m.h + p.dy, { flip: p.flip });
  }
}
function imageLayer(name, camX, W, groundY, ctx) { moduleLayer(name, camX, W, groundY, ctx); }
// 暮色：户外压一层，室内（公司、楼道、楼梯间）不压；路段交界处 300px 内渐变，不一下子跳
const INDOOR = { office: 1, home: 1 };
function duskAmount(cx, ctx) {
  if (ctx.fixed) return INDOOR[ctx.fixed] ? 0 : 1;
  let k = 1;
  for (const s of ctx.stages) if (INDOOR[s.theme || s.id]) k = Math.min(k, clamp((cx < s.x0 ? s.x0 - cx : cx > s.x1 ? cx - s.x1 : 0) / 300, 0, 1));
  return k;
}
// 层序：天空 → 远景 → 中景 → 背景罩（只压到地面线）→ 地面（含后人行道）→ 地面轻罩（户外入夜才有）。障碍、人物、拾取物在这之后画，不受罩子影响
// ctx：画面上下文（关卡 run.lv / TITLE_CTX；老调用方传「坐标 → 主题」的函数也认）
export function drawBackdrop(L, camX, z, dusk, ctx = FULL, { rain = false } = {}) {
  ctx = ctxOf(ctx);
  const themeFn = ctx.themeAt;
  skyGfx(L.W, L.groundY, dusk, camX);
  if (hasLayer('far')) imageLayer('far', camX, L.W, L.groundY, ctx);
  else skylineGfx(L.W, L.groundY, dusk, camX);
  gfx.save();
  gfx.translate(0, L.groundY); gfx.scale(z, z); gfx.translate(0, -L.groundY);
  const W = L.W / z, H = L.groundY + (L.H - L.groundY) / z;
  if (hasLayer('mid')) { if (midCells.size) midCells.clear(); imageLayer('mid', camX, W, L.groundY, ctx); }
  else midGfx(W, L.groundY, themeFn, camX, dusk);
  gfx.restore();
  // 美术图不随天色变：在屏幕空间压罩子。户外 = max(路段保底, 0.3 × 暮色)，楼道固定压暗，公司不压、加一层浅雾
  const cx = camX + L.W / z / 2, k = duskAmount(cx, ctx), art = hasLayer('mid') || hasLayer('far');
  if (art) {
    const v = veilAt(cx, ctx), a = veilAlpha(v, dusk, k);
    if (a > 0.003) gfx.rect(0, 0, L.W, L.groundY, { fill: v.color, alpha: a });
    if (v.fog > 0.003) gfx.vgrad(0, L.groundY - FOG.h * z, L.W, FOG.h * z, [[0, 'rgba(239,227,245,0)'], [1, FOG.color]], { alpha: v.fog });
  }
  if (rain) gfx.rect(0, 0, L.W, L.groundY, { fill: '#1c2a44', alpha: 0.16 });   // 暴雨压暗：只压背景，跑道上的东西照样看得清
  gfx.save();
  gfx.translate(0, L.groundY); gfx.scale(z, z); gfx.translate(0, -L.groundY);
  if (hasLayer('ground')) imageLayer('ground', camX, W, L.groundY, ctx);
  else groundGfx(W, H, L.groundY, themeFn, camX);
  gfx.restore();
  if (art && dusk > 0 && k > 0) gfx.rect(0, L.groundY, L.W, L.H - L.groundY, { fill: '#341e60', alpha: 0.15 * dusk * k });
}

// 「来障碍走廊」：主角前方、地面线附近（屏幕 x 120 以右、地面线上 150 到下 10）。全屏暗角烘焙时把这块挖掉（边缘 24px 羽化），
// 被追、饿了的时候也不会盖住要跳要滑的东西
export function cutCorridor(g, L) {
  const x0 = 120, x1 = L.W + 30, y0 = L.groundY - 150, y1 = L.groundY + 10, f = 24, n = 12;
  g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < n; i++) { const d = i * f / n; g.fillRect(x0 + d, y0 + d, x1 - x0 - d, y1 - y0 - 2 * d); }
  g.restore();
}
const inCorridor = (L, x, y) => x > 120 && y > L.groundY - 150 && y < L.groundY + 10;

// ── 世界 ─────────────────────────────────────────────
export function drawWorld(run, L, vis, t) {
  const V = view(run, L), { z, camX } = V;
  const dusk = run.lv.duskAt(run.x), th = run.lv.themeOf(run.stage);   // 天色按路线位置走（撞几下不会突然天黑）
  const rainy = !!(run.mod && run.mod.rain && (th === 'street' || th === 'park'));
  drawBackdrop(L, camX, z, dusk, run.lv, { rain: rainy });

  gfx.save();
  gfx.translate(0, L.groundY); gfx.scale(z, z); gfx.translate(-camX, 0);
  const x0 = camX - 80, x1 = camX + L.W / z + 120;
  drawCrossGround(run, x0, x1, t);            // 斑马线路口：停止线、斑马线、灯杆（地面上，什么都盖不住）
  drawLiftWorld(run, x0, x1, t);              // 楼梯间的墙、电梯厅门（在别的地标后面）
  landmarks(run, x0, x1, t);
  drawParked(run, x0, x1, t);                 // 后人行道上的违停车（不会撞，按背景调色）
  drawZones(run, x0, x1, t);                  // ▶▶ 冲刺区地面标记
  const obs = run.course.obstacles;
  for (let i = Math.max(0, run.obIdx - 6); i < obs.length; i++) {
    const o = obs[i], ox = obstacleX(o, run.x);
    if (ox > x1) { if (o.x > x1 + 600) break; continue; }
    if (ox + OBSTACLES[o.type].w < x0) continue;
    drawObstacle(o, ox, t, run, vis);
  }
  const coinT = prop('coin', [-9, -9, 18, 18], coinVec), bunT = prop('bun', [-17, -17, 34, 34], bunVec);
  for (const pk of run.course.pickups) {
    if (pk.x < x0) continue;
    if (pk.x > x1) break;
    if (pk.taken) continue;
    if (pk.kind === 'errand') { drawErrandPickup(run, pk, t); continue; }    // 家里要的东西：交代过、还没办时才画（金色光圈 + 「家」字小牌）
    if (pk.y > -40) gfx.draw(shadowTex(), pk.x, 1, { sx: 0.16, alpha: 0.2 });   // 贴地的零钱、包子才有小影子；弧线上的不画（会误导落点）
    if (pk.kind === 'coin') gfx.draw(coinT, pk.x, pk.y, { sx: Math.abs(Math.cos(t * 4 + pk.x * 0.01)) * 0.85 + 0.15 });
    else gfx.draw(bunT, pk.x, pk.y + Math.sin(t * 4 + pk.x) * 3);
  }
  drawNpcs(run, V, L, vis, t);
  drawCrossCar(run, t, false);                // 横穿车：还远的时候在主角后面
  drawPlayer(run, t, vis);
  drawCrossCar(run, t, true);                 // 开近了在主角前面
  stepTraffic(run, vis, camX, L.W / z);
  drawTraffic(run, vis, x0, x1, t);           // 马路在跑道前面（离镜头更近）
  if (DEBUG.hitbox) drawHitboxes(run, x0, x1);
  drawParts(vis.fx, 'world');
  drawFloats(vis.fx, 'world');
  gfx.restore();

  edgeWarnings(run, L, t);
  if (rainy) rain(L, t);
  if (run.v > 340 || run.ride) speedLines(run, L, t);
  if (run.sat < 25) {
    const tex = bake(`vig|${L.H}`, [0, 0, L.W, L.H], g => {
      const gr = g.createRadialGradient(L.W / 2, L.groundY - 120, 120, L.W / 2, L.groundY - 120, 360);
      gr.addColorStop(0, 'rgba(220,150,40,0)'); gr.addColorStop(1, 'rgba(220,150,40,1)');
      g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
      cutCorridor(g, L);
    }, { res: 0.5 });
    gfx.draw(tex, 0, 0, { alpha: 0.25 + 0.1 * Math.sin(t * 6) });
  }
}

// ── 地标：工位、出口、小区大门、便利店、门禁、家门 ─────────────
const arm = { rot: 0, t: 0 };
function landmarks(run, x0, x1, t) {
  const inView = (a, b) => b > x0 && a < x1, lv = run.lv;
  if (inView(lv.x0 - 200, lv.x0 + 60)) gfx.draw(prop('desk', [-156, -92, 122, 96], deskVec), lv.x0, 0);
  for (const s of lv.stages.slice(1)) {
    if (s.gate === false || !inView(s.x0 - 100, s.x0 + 100)) continue;
    gfx.draw(prop('gate_' + s.id, [-76, -182, 152, 186], g => exitVec(g, s.id)), s.x0, 0);
  }
  for (const slot of lv.slots) {
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
  if (inView(lv.end - 120, lv.end + 120)) {
    const x = lv.end + 10, open = run.ending ? clamp(run.ending.t / 0.5, 0, 1) : 0;
    if (propArt('homeDoor')) {
      gfx.draw(artTex('homeDoor', propArt('homeDoor')), x, 0);
      drawDoorDecor(run, x, open, t);            // 门开着的暖光（家里人出来迎了）、门上贴的东西：电费便签 / 儿童画 / 福字……
      gfx.text('家', x + 31, -152, { size: 16, color: '#fff', lw: 4 });
    } else {
      gfx.draw(prop('homeDoorFrame', [-8, -160, 80, 162], doorFrameVec), x, 0);
      gfx.draw(prop('homeDoor', [-1, -1, 64, 128], doorLeafVec), x, -126, { sx: 1 - open * 0.85 });
      drawDoorDecor(run, x, 0, t);
    }
  }
}

// ── 障碍：每种烘焙一次 ─────────────────────────────────────
export function obstacleTex(type) {
  return prop(type, obstacleBox(type), g => drawObstacleVec(g, type));
}
// 接地软影：落地障碍宽 = 判定宽 + 10、alpha .35；悬空障碍在地面画同宽的淡投影（alpha .18），标出要滑铲的区间
const shadowTex = () => bake('shadow', [-50, -5, 100, 10], g => {
  g.save(); g.scale(1, 0.18);
  const gr = g.createRadialGradient(0, 0, 4, 0, 0, 50);
  gr.addColorStop(0, 'rgba(43,34,51,.9)'); gr.addColorStop(1, 'rgba(43,34,51,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill(); g.restore();
});
// 只能滑过去的悬空障碍：判定框底边一条 6px 蓝白斜纹（跳的障碍不加任何条纹）
const slideEdgeTex = w => bake(`edge|${w}`, [-1, -7, w + 2, 8], g => {
  roundRect(g, 0, -6, w, 6, 2); g.save(); g.clip();
  for (let i = -1; i < w / 8 + 2; i++) { g.fillStyle = i % 2 ? '#FFFFFF' : '#2E6BFF'; g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + 8, 0); g.lineTo(i * 8 + 14, -6); g.lineTo(i * 8 + 6, -6); g.fill(); }
  g.restore(); roundRect(g, 0, -6, w, 6, 2); g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke();
});
function drawObstacle(o, x, t, run, vis) {
  const T = OBSTACLES[o.type];
  if (!T.hole && !T.flat) gfx.draw(shadowTex(), x + T.w / 2, 1, { sx: (T.w + (T.overhead ? 0 : 10)) / 100, alpha: T.overhead ? 0.18 : 0.35 });   // 平的（水坑）不画影子
  if (o.type === 'manhole') gfx.draw(prop('warnSign', WARN_SIGN_BOX, warnSignPropVec), x - 40, 0);   // 施工牌不会撞：没外圈（有图用图）
  if (o.type === 'splash') { gfx.draw(obstacleTex('puddle'), x, 0); drawSplashWall(o, x, run, t, vis); return; }   // 水坑照画，水墙叠在上面
  if (o.type === 'cardoor') { gfx.draw(obstacleTex('cardoor'), x, 0, { sx: doorK(o, run) }); return; }       // 铰链在左缘：按主角离车门多远甩开
  gfx.draw(obstacleTex(o.type), x, T.vx ? -Math.abs(Math.sin(t * 12 + o.id)) * 1.5 : 0);
  if (o.type === 'leash') gfx.draw(prop('leashLady', LEASH_LADY_BOX, leashLadyVec), x, 0);   // 大妈在判定框左边、没外圈：盖住绳子左端，手握着绳
  if (o.type === 'banner' && propArt('banner')) gfx.text('Q4 冲刺！', x + 45, -99, { size: 14, color: '#ffe08a', lw: 3, stroke: '#8e1f1f' });
  if (T.avoid === 'slide') gfx.draw(slideEdgeTex(T.w), x, -T.overhead[0]);
}

// ▶▶ 冲刺区（路口闪绿灯、电梯门前）：人行道带 y +6…+18，每 60px 一个，箭头 0.5 秒一循环往前滑。电梯门前的区选了电梯才打开、进门就收掉
function drawZones(run, x0, x1, t) {
  const zs = run.course.zones;
  if (!zs || !zs.length) return;
  const shift = Math.round((1 - (t * 2) % 1) * 2), alpha = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * 4 * Math.PI));
  const tex = bake(`dashMark|${shift}`, [-19, -8, 38, 16], g => dashMarkVec(g, shift));
  for (const zn of zs) {
    if (zn.x1 < x0 || zn.x0 > x1 || zn.off) continue;
    if (zn.kind === 'lift' && (run.room || (run.course.branch && run.course.branch.used))) continue;
    if (zn.kind === 'cross') { const s = run.cross; if (!s || s.i !== zn.i || s.light !== 'flash' || !(s.phase === 'show' || crossDashOpen(run))) continue; }   // 只在闪绿、还能冲时出现（刹车出了 ▶▶ 区、灯变红就收掉）
    for (let x = zn.x0 + 17; x <= zn.x1 - 17; x += 60) gfx.draw(tex, x, 12, { alpha });
  }
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
  if (c && (c.kind === 'npc' || c.kind === 'mom') && !c.room) {          // 电梯里的题：人画在轿厢里（lift.js）
    const look = lookOf(c.npc);
    if (c.kind === 'mom') {}
    else if (c.phase === 'open') {
      const k = ease.inOutSine(clamp(c.t / c.T, 0, 1));
      const sx = lerp(Math.min(V.sx(c.wx), 330), TUNE.playerX + 44, k);
      person(gfx, toW(sx), 0, look, runPose((t * 1.4) % 1, 0.2), { flip: -1 });
      vis.npcSX = sx;
    }
  }
  // 家门口：答题的人进入回家路段后从门里出来迎（最远站在屏幕 x=330），其他家里人站在门框里（js/render/homes.js）
  drawDoorScene(run, V, vis, t);
  if (c && c.kind === 'ride' && !run.ride) {
    // 问「蹭不蹭」时小哥靠到路缘、停在主角身后（不被下面的答案卡挡住）；蹭的话上车那 0.25 秒一起回到马路上（drawPlayer）
    const k = c.phase === 'open' ? ease.outCubic(clamp(c.t / (c.T * 0.6), 0, 1)) : 1;
    const gone = c.phase === 'result' && c.picked !== 0 ? c.rt * 600 : 0;
    const wx = run.x + RIDE_CARD_DX - 85 * (1 - k) + gone;
    gfx.draw(rideTex(), wx, RIDE_CARD_Y);
    vis.npcSX = V.sx(wx + 40);
  }
  if (c && c.kind === 'store') vis.npcSX = V.sx(c.x + 130);
  if (c && c.kind === 'route' && run.course.branch) vis.npcSX = clamp(V.sx(run.course.branch.door), 60, L.W - 60);   // 路线卡的尾巴指向电梯门
  const gh = vis.ghost;
  if (gh && gh.good) {
    const age = t - gh.t;
    if (age < 1.6) person(gfx, gh.wx, 0, lookOf(gh.npc), { ...idlePose(t), head: -12, shR: 30, elR: 80 }, { flip: -1, alpha: 1 - age / 1.6 });
  }
  const ch = run.room && run.room.chaserIn ? null : run.chaser, cs = run.cutscene;   // 追兵跟进了轿厢：人画在轿厢里（lift.js），世界层不再画
  if (ch || (cs && cs.kind === 'caught')) {
    const npc = ch ? ch.npc : cs.npc;
    let sx = ch ? TUNE.playerX - 34 - clamp(ch.gap, 0, 150) * 0.55 : TUNE.playerX - 16;
    if (ch && vis.chaseFrom && t - vis.chaseFrom.t < 0.5) sx = lerp(vis.chaseFrom.sx, sx, ease.outCubic((t - vis.chaseFrom.t) / 0.5));
    const pose = cs ? { ...idlePose(t), shR: 80, elR: 10, lean: 12 } : crossHold(run) && run.v < 1 ? { ...idlePose(t), shR: 150, elR: 20 } : runPose((t * 2.6) % 1, 1.2);   // 追兵也守红灯：站住干着急
    person(gfx, toW(sx), 0, chaserLook(npc), pose, { flip: 1 });
    if (ch) {
      // 甩开进度：跟着追兵，但不出屏幕左边
      const mx = toW(Math.max(sx, 34)), k = clamp(ch.gap / CHASE.escape, 0, 1), danger = ch.gap < 30;
      gfx.rect(mx - 24, -104, 48, 12, { fill: '#fff', r: 6, stroke: INK, lw: 1.6 });
      if (k > 0.02) gfx.rect(mx - 22, -102, 44 * k, 8, { fill: danger ? '#e74c3c' : '#2ecc71', r: 4 });
      const say = ch.line && run.t - ch.lineT < 1.6;        // 追逐槽：冲出来时头顶喊一句（1.6 秒），之后照常「站住！」
      if (say) {
        const bw = gfx.measure(ch.line, { size: 13 }) + 18, cx = toW(Math.max(sx, 8 + (bw * V.z) / 2));
        gfx.rect(cx - bw / 2, -136, bw, 24, { fill: '#fff', r: 10, stroke: INK, lw: 1.8 });
        gfx.text(ch.line, cx, -124, { size: 13, color: '#c0392b' });
      } else gfx.text(ch.phase === 'slow' ? '站住！' : '别跑！', mx, -118, { size: 13, color: '#fff', lw: 3, stroke: danger ? '#c0392b' : INK });
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
const ROAD_Y = TRAFFIC.road;                    // 蹭车：电动车和主角画在马路上（世界 y，正数朝下）
const RIDE_CARD_Y = TRAFFIC.card, RIDE_CARD_DX = -92;    // 问「蹭不蹭」时小哥停在路缘、主角身后（电动车左缘离主角 92，整个在屏幕里）
// 主角离地的高度：上车 0.25 秒从人行道跳到马路上，下车 0.25 秒跳回来
function rideHop(run, vis, t) {
  if (run.ride) return ease.inOutSine(clamp((run.ride.total - run.ride.t) / 0.25, 0, 1));
  if (vis.rideEnd != null && t - vis.rideEnd < 0.25) return 1 - ease.inOutSine((t - vis.rideEnd) / 0.25);
  return 0;
}
const NAMES = { laoliu: '老刘', ajie: '阿杰', lili: '莉莉', tony: 'Tony', amy: 'Amy', wang: '王阿姨', zhou: '老周', mom: '妈妈', xiaoge: '外卖小哥' };
export const NPCNAME = id => NAMES[id] || (MEMBERS[id] && MEMBERS[id].name) || '';   // 路上的人 + 家里人（借口图鉴、最离谱借口）

// ── 主角 ─────────────────────────────────────────────
// 主角的表情变体（慌张、开心……）：按当前主角（男 / 女）各缓存一份
const playerLooks = new Map();
export function playerLook(eyes, mouth) {
  const H = hero(), key = `${H.id}|${eyes || ''}|${mouth || ''}`;
  let l = playerLooks.get(key);
  if (!l) { l = { ...H, id: `${H.id}:${eyes || ''}|${mouth || ''}` }; if (eyes) l.eyes = eyes; if (mouth) l.mouth = mouth; playerLooks.set(key, l); }
  if (l.art !== H.art) l.art = H.art;
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
    const hop = rideHop(run, vis, t), y = ROAD_Y * hop;
    // 上车：小哥从路缘（RIDE_CARD_Y、主角身后）和主角一起回到马路上，0.25 秒后到位
    const bx = x - 40 + (RIDE_CARD_DX + 40) * (1 - hop), by = lerp(RIDE_CARD_Y, ROAD_Y, hop);
    if (propArt('rider')) {
      person(gfx, x - 30, y - 22, playerLook('happy', null), { ...bikePose(0.25), hipR: 90, knR: 140, hipL: 90, knL: 140, shR: 150, elR: 10, shL: 30, elL: 40, lean: -6 });
      gfx.draw(rideTex(), bx, by);
    } else {
      gfx.draw(rideTex(), bx, by);
      person(gfx, x - 22, y - 30, playerLook('happy', null), { ...bikePose(0.25), hipR: 90, knR: 90, hipL: 85, knL: 95, shR: 150, elR: 10, shL: 30, elL: 40, lean: -6 });
    }
    return;
  }
  const leave = rideLeave(vis, t);
  if (leave) gfx.draw(rideTex(), x - 40 + leave.dx, ROAD_Y, { alpha: leave.alpha });   // 小哥开走（马路上的车会避开他，见 traffic.js）
  const cs = run.cutscene;
  if (cs && cs.kind === 'hole') {
    person(gfx, x, p.y, playerLook('wide', 'open'), cheerPose(t), { alpha: clamp(1 - p.y / 90, 0, 1) });
    const ox = obstacleX(cs.o, x);
    gfx.rect(x - 60, 1, 120, 260, { fill: THEMES[run.lv.themeAt(x)].floor });
    gfx.rect(x - 60, 0, 120, 2.5, { fill: INK });
    gfx.draw(obstacleTex('manhole'), ox, 0);
    return;
  }
  if (cs && cs.kind === 'caught') { person(gfx, x, 0, playerLook('wide', 'open'), { ...runPose((t * 3) % 1, 0.6), lean: 24 }); return; }
  const hopY = ROAD_Y * rideHop(run, vis, t);       // 下车跳回人行道的 0.25 秒：环、速度线跟着画面上的人走
  dashRing(run, vis, t, hopY);
  // 冲过闪绿：冲刺姿势一直保持到踏上斑马线（「冲刺状态下踏上斑马线」）
  const xs = run.cross, xc = xs && run.course.crossings[run.crossIdx], carry = !!(xs && xs.how === 'dash' && xc && x < xc.x + 12);
  const dashing = p.dashT > 0 || carry;
  let pose;
  if (p.state === 'stumble') pose = stumblePose(t);
  else if (p.state === 'slide') {
    const el = p.slideTotal - p.slideT, k = Math.min(1, el / 0.06, p.slideT / 0.08);
    pose = mixPose(runPose(p.runPhase), slidePose(), Math.max(0, Math.min(1, k)));
  } else if (!p.onGround) pose = jumpPose(p.vy);
  else if (dashing) { const rp = runPose(p.runPhase, 1.6); pose = { ...rp, lean: rp.lean + 14 }; }   // 冲刺：大步 + 前倾
  else if (run.v < 1 && p.onGround) pose = idlePose(t);                 // 停在路口等灯
  else pose = runPose(p.runPhase, Math.min(1.4, run.v / 300));
  if (dashing) {                                   // 鞋底甩出 3 条速度线：先描一道深色底，浅色地面（公司浅紫）上也看得见
    const a = carry ? 1 : Math.min(1, (p.dashT / DASH.time) * 2);
    for (let i = 0; i < 3; i++) {
      const lx = x - 14 - i * 5, ly = p.y + hopY - 3 - i * 7;
      gfx.line(lx, ly, lx - 20 - i * 7, ly, { color: INK, w: 4.2, alpha: a * 0.55, cap: 'round' });
      gfx.line(lx, ly, lx - 20 - i * 7, ly, { color: '#BFF3FF', w: 2.2, alpha: a * 0.95, cap: 'round' });
    }
  }
  const blink = p.invulnT > 0 && Math.floor(t * 16) % 2 === 0;
  person(gfx, x, p.y + hopY, look, pose, { alpha: blink ? 0.45 : 1, stretch: vis.sq || 0 });
}
// 鞋底提示环：被追或在 ▶▶ 区时画在脚下。青色 = 现在右滑就能冲（和 tryDash 同一个 dashReady：刚进没冲过的 ▶▶ 区，冷却中也能冲）；
// 灰色 = 冷却中（按冷却进度从小变大）或快弹题时右滑归答题。不被追时右滑：灰环闪一下（不出字）
function dashRing(run, vis, t, hopY = 0) {
  const p = run.player;
  const show = !!(run.chaser || dashZoneAt(run)) && !run.ride && !run.cutscene;
  const no = vis.dashNo != null && t - vis.dashNo < 0.25;
  if (!show && !no) return;
  const ready = show && dashReady(run);
  const k = ready || !show ? 1 : p.dashCd > 0 ? 0.65 + 0.35 * (1 - p.dashCd / DASH.cooldown) : 1;
  // 灰环衬一圈深紫：公司浅紫地面上也看得出「现在冲不了」；冷却进度从 0.65 倍大小长回原大
  const tex = bake(ready ? 'dashRing|on' : 'dashRing|off3', [-20, -8, 48, 16], g => (ready ? dashRingVec(g, '#00B8D9') : dashRingVec(g, '#B8B3CC', INK)));
  // 右滑没冲成：环鼓一下再缩回、闪两下（被追时环本来就亮着，只改透明度看不出来）
  const age = no ? (t - vis.dashNo) / 0.25 : 1, pulse = no ? 1 + 0.35 * (1 - age) : 1;
  const alpha = no ? (Math.floor(age * 4) % 2 ? 0.35 : 1) : ready ? 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * 8)) : 0.8;
  gfx.draw(tex, run.x, 2 + hopY, { sx: k * pulse, sy: k * pulse, alpha: no ? alpha : Math.max(alpha, show ? 0.8 : 0) });
}

// ── 屏幕空间：右缘预警、速度线 ─────────────────────────────
function edgeWarnings(run, L, t) {
  const ahead = lookAhead(run.vBase);
  for (let i = run.obIdx; i < run.course.obstacles.length; i++) {
    const o = run.course.obstacles[i], T = OBSTACLES[o.type];
    const ox = obstacleX(o, run.x);
    if (ox - run.x > ahead + run.vBase * 0.9) break;
    if (!T.warn || ox - run.x < ahead - 10) continue;
    const k = 1 + 0.12 * (Math.floor(t * 8) % 2);        // 缩放脉冲（不换色：红店面前也认得出）
    gfx.draw(bake('warn2', [-24, -17, 41, 34], warnSignVec), L.W - 20, L.groundY - 34, { sx: k, sy: k });
  }
}
// 暴雨词条：斜着落的雨丝（压暗天色在 drawBackdrop 里，只压背景）
function rain(L, t) {
  const h = L.groundY + 30, span = L.W + 20;
  for (let i = 0; i < 36; i++) {
    const y = ((t * (520 + (i % 5) * 60) + i * 137.7) % (h + 30)) - 20;
    const x = (((i * 71.3 - y * 0.25) % span) + span) % span - 10;
    gfx.line(x, y, x - 4, y + 16, { color: '#cfe3ff', w: 1.4, alpha: inCorridor(L, x, y + 8) ? 0.15 : 0.45 });
  }
}
function speedLines(run, L, t) {
  const n = run.ride ? 14 : 8, k = run.ride ? 0.45 : 0.25 * clamp((run.v - 340) / 80, 0, 1);
  if (k <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.3, y = L.groundY - 150 - ((seed * 7.1) % 120);     // 只在走廊上方：不划过要跳要滑的东西
    const len = run.v * 0.12, x = L.W - ((t * run.v * 1.6 + seed * 40) % (L.W + len));
    gfx.line(x, y, x + len, y, { color: '#fff', w: 2, alpha: k });
  }
}

export { hero };
