// 路线生成：开局按种子把整条路一次排好（每日挑战同一天同一条路）。
//   1) 先给每个选择槽 / 事件留出「读题窗口」，窗口里不放障碍（小区开始窗口后段允许出现障碍：边跳边选）
//   2) 其余路段按「到达时间差」排障碍：两次操作之间至少隔 GAP 秒，用这段路的速度换算成距离
//   3) 再沿跳跃弧线摆零钱、空地上摆一排零钱和少量包子
// 移动障碍（迎面的车）记录的是「和主角相遇的位置」，运行时按主角离它多远倒推它现在在哪，
// 所以不管主角中途怎么减速，它都在算好的地方撞上来，间距表始终成立。
import { OBSTACLES } from '../data/obstacles.js';
import { TUNE, COURSE, CHOICE, speedAt, zoomAt } from '../data/tune.js';

export const GAP = {
  'jump>jump': 0.86, 'jump>slide': 0.70, 'slide>jump': 0.62, 'slide>slide': 0.70,
  moving: 0.15,            // 后一个是迎面移动的，多留一点
  lateAfter: 120000,       // 先不收紧（预留：后期 jump>jump 可降到 0.74）
};
// 每个路段障碍之间的平均额外间隔（秒）：越往后越密
export const DENSITY = { office: 1.0, street: 0.75, park: 0.55, home: 0.45 };

export const kindOf = t => (t.avoid === 'slide' ? 'slide' : 'jump');

export function stageAt(x) {
  const st = COURSE.stages;
  for (let i = st.length - 1; i >= 0; i--) if (x >= st[i].x0) return st[i];
  return st[0];
}

// 某个位置的读题时间（真实秒）
export function choiceTime(x, revisit = false) {
  const s = stageAt(x), [a, b] = CHOICE.time[s.id];
  const k = Math.max(0, Math.min(1, (x - s.x0) / (s.x1 - s.x0)));
  const T = a + (b - a) * k - (revisit ? CHOICE.revisitMinus : 0);
  return Math.max(CHOICE.minTime, T);
}

// 选择槽前后需要空出来的区间
export function slotWindow(slot) {
  const s = stageAt(slot.x), v = speedAt(slot.x) * 1.04;
  let T, slow, clear = CHOICE.clear[s.id];
  if (slot.kind === 'call' || slot.kind === 'ride' || slot.kind === 'store') { T = CHOICE.eventTime[slot.kind]; slow = CHOICE.eventSlow; clear = 1; }
  else { T = choiceTime(slot.x); slow = CHOICE.slow[s.id]; }
  const before = 0.45 * v;
  let after = clear * T * slow * v + CHOICE.after * v;
  if (slot.kind === 'store') after += 0.6 * v;            // 出店后缓一缓
  if (slot.kind === 'mom') after = COURSE.end - slot.x + 10;
  return [slot.x - before, slot.x + after];
}

function gapTime(prev, next) {
  let g = GAP[`${kindOf(prev)}>${kindOf(next)}`];
  if (next.vx) g += GAP.moving;
  return g;
}

// 两个障碍之间最少要隔多远（前一个的左边缘 → 后一个的左边缘）
export function minSpacing(prevType, nextType, x) {
  const a = OBSTACLES[prevType], b = OBSTACLES[nextType];
  return a.w + gapTime(a, b) * speedAt(x) * 1.04;
}

export function planCourse(rng, { tutorial = false } = {}) {
  const obstacles = [], pickups = [];
  const blocks = COURSE.slots.map(slotWindow);
  const free = (a, b) => !blocks.some(([x0, x1]) => b > x0 && a < x1);

  let prev = null, sameRun = 0;
  const push = (type, x, extra = {}) => {
    obstacles.push({ type, x, id: obstacles.length, ...extra });
    sameRun = prev && prev.type === type ? sameRun + 1 : 0;
    prev = { type, x };
  };

  let x = 900;

  const end = COURSE.end - 260;
  while (x < end) {
    const st = stageAt(x);
    const pool = Object.keys(OBSTACLES).filter(k => OBSTACLES[k].stages.includes(st.id) && !OBSTACLES[k].tutorial);
    let type;
    for (let tries = 0; tries < 10; tries++) {
      type = rng.pick(pool);
      if (prev && type === prev.type && sameRun >= 1) continue;      // 同一种最多连 2 个
      if (prev && OBSTACLES[prev.type].platform && OBSTACLES[type].platform) continue;
      break;
    }
    const t = OBSTACLES[type];
    const v = speedAt(x) * 1.04;
    let nx = x;
    if (prev) nx = Math.max(nx, prev.x + minSpacing(prev.type, type, x));
    nx += rng.range(0, DENSITY[st.id] * v);
    if (nx + t.w > end) break;
    if (!free(nx - 20, nx + t.w + 20)) {
      // 撞进了读题窗口：跳到窗口后面重新排
      const b = blocks.find(([x0, x1]) => nx + t.w + 20 > x0 && nx - 20 < x1);
      x = b[1] + 1;
      continue;
    }
    // 障碍换路段时不跨界（一个障碍不要横在两种地面上）
    if (stageAt(nx + t.w).id !== st.id) { x = stageAt(nx + t.w).x0 + 0.3 * v; continue; }
    push(type, nx, t.vx ? { vx: t.vx } : {});
    x = nx + t.w;
  }

  // 零钱：跳跃类障碍上方 35% 概率沿弧线摆 3 枚
  for (const o of obstacles) {
    const t = OBSTACLES[o.type];
    if (kindOf(t) !== 'jump' || t.platform || t.vx || o.teach || !rng.chance(0.15)) continue;
    const v = speedAt(o.x), cx = o.x + t.w / 2;
    for (let k = -1; k <= 1; k++) {
      const u = (k * 42) / v;                                  // 离最高点的时间
      const g = u < 0 ? TUNE.gravityUp : TUNE.gravityDown;
      const h = 108 - 0.5 * g * u * u;
      pickups.push({ kind: 'coin', x: cx + k * 42, y: -(h + 26) });
    }
  }
  // 空地：长间隔里摆一排零钱；每个路段放两个包子（要跳一下才吃得到）
  const sorted = obstacles.slice().sort((a, b) => a.x - b.x);
  let buns = { street: 0, park: 0, office: 0, home: 0 };
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i], ta = OBSTACLES[a.type];
    const g0 = a.x + ta.w + 60, g1 = b.x - 60 - (b.vx ? 120 : 0);
    const st = stageAt(g0).id;
    if (g1 - g0 < 260 || !free(g0, g1)) continue;
    if (buns[st] < 2 && st !== 'office' && st !== 'home' && rng.chance(0.3)) { buns[st]++; pickups.push({ kind: 'bun', x: (g0 + g1) / 2, y: -88 }); continue; }
    if (rng.chance(0.2)) for (let k = 0; k < 3; k++) pickups.push({ kind: 'coin', x: g0 + 30 + k * 34, y: -22 });
  }
  // 新手局：只把开头一段（900–3500）换成两个教学障碍，后面整条路和同种子的普通局完全一样（分享给好友也是同一条路）
  if (tutorial) {
    const keep = o => o.x < 900 || o.x >= 3500;
    for (let i = obstacles.length - 1; i >= 0; i--) if (!keep(obstacles[i])) obstacles.splice(i, 1);
    for (let i = pickups.length - 1; i >= 0; i--) if (!keep(pickups[i])) pickups.splice(i, 1);
    obstacles.push({ type: 'filebox', x: 1500, teach: 'jump' }, { type: 'banner', x: 2250, teach: 'slide' });
  }
  pickups.sort((a, b) => a.x - b.x);
  obstacles.sort((a, b) => a.x - b.x);
  obstacles.forEach((o, i) => { o.id = i; });
  return { obstacles, pickups, blocks };
}

// 运行时：移动障碍此刻的位置（按主角离相遇点多远倒推）
export function obstacleX(o, playerX) {
  if (!o.vx) return o.x;
  const dx = o.x - playerX;
  return o.x + o.vx * dx / speedAt(playerX);
}

// 校验：相邻障碍是否满足最小间距（测试用）
export function checkSpacing(list) {
  const bad = [];
  for (let i = 1; i < list.length; i++) {
    const need = minSpacing(list[i - 1].type, list[i].type, list[i - 1].x) / 1.04;
    const have = list[i].x - list[i - 1].x;
    if (have < need - 0.5) bad.push({ i, a: list[i - 1].type, b: list[i].type, have: Math.round(have), need: Math.round(need) });
  }
  return bad;
}

// 镜头里能往前看多远（世界 px）
export function lookAhead(v) { return (375 - TUNE.playerX) / zoomAt(v); }
