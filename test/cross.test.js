// 斑马线路口：红灯自动停（只丢时间）、闪绿在 ▶▶ 区冲刺就过、长绿什么都不用做；追兵也守红灯；按主角位置触发；世界停住每局 ≤15 秒
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subRng, SALT } from '../js/core/rng.js';
import { planCourse, checkCrossings, crossWindow, obstacleX, lookAhead, checkSpacing, trafficQuiet } from '../js/game/course.js';
import { makeRun, updateRun, input, canDash, dashReady, crossStopX, crossLamp, crossDashOpen, dashZoneAt } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { parOf } from '../js/game/par.js';
import { FULL } from '../js/game/level.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { STORE } from '../js/data/events.js';
import { COURSE_VERSION, LEVELS } from '../js/data/levels.js';
import { CROSS, CHASE, RES, PAR, DASH, speedAt } from '../js/data/tune.js';
import { courseHash } from '../tools/golden-lib.mjs';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const play = (seed, botOpts, runOpts = {}) => {
  const run = makeRun({ seed, ...runOpts });
  return { run, res: simulate(run, makeBot({ rng: botRng(seed), ...botOpts }), { update: updateRun }) };
};
const step = (run, n = 1) => { for (let i = 0; i < n && !run.done; i++) { updateRun(run, 1 / 60); run.fx.length = 0; } };
// 把主角放到第 i 个路口的停止线前 dist 处：开局结束、附近没有选择槽、前面的障碍都算过了
function placeAt(run, i, dist) {
  const c = run.course.crossings[i];
  run.intro = 0; run.wt = 30; run.x = crossStopX(c) - dist;
  const obs = run.course.obstacles;
  obs.forEach(o => { if (o.x < run.x) o.done = true; });
  run.obIdx = Math.max(0, obs.findIndex(o => !o.done));
  run.slotIdx = run.lv.slots.findIndex(s => s.x > run.x);
  run.pending = null; run.choice = null; run.crossIdx = i; run.cross = null;
  run.stage = run.lv.stageAt(run.x);
  return c;
}

test('路口数据：全程关 3 个、都在街道，路线版本 ≥3（3 路口、4 电梯）', () => {
  assert.ok(COURSE_VERSION >= 3);
  assert.deepEqual(LEVELS.full.crossings.map(c => c.x), [10500, 27000, 29700]);
  for (const c of LEVELS.full.crossings) assert.equal(FULL.themeAt(c.x), 'street');
  assert.ok(CROSS.waitRed[1] <= 1.5 && CROSS.waitMiss <= 1.5 && CROSS.maxWaits === 2 && CROSS.maxRed <= 2);
});

test('规划：路口窗口里没有障碍、没有零钱；和槽、蹭车不冲突；红灯 ≤2、每个等 1.0–1.5 秒；闪绿才有 ▶▶ 区', () => {
  const lights = { green: 0, red: 0, flash: 0 };
  for (const seed of SEEDS) {
    const c = planCourse(subRng(seed, SALT.course), { level: FULL, seed });
    assert.deepEqual(checkCrossings(c, FULL), [], `种子 ${seed}`);
    assert.deepEqual(checkSpacing(c.obstacles), []);
    assert.equal(c.crossings.length, 3);
    for (const x of c.crossings) {
      const [w0, w1] = crossWindow(x);
      assert.equal(x.w0, w0); assert.equal(x.w1, w1);
      assert.equal(c.obstacles.filter(o => o.x + OBSTACLES[o.type].w > w0 && o.x < w1).length, 0, `种子 ${seed} 路口 ${x.x} 窗口里有障碍`);
      assert.equal(c.pickups.filter(k => k.x > w0 && k.x < w1).length, 0, `种子 ${seed} 路口 ${x.x} 窗口里有零钱`);
      assert.ok(['green', 'red', 'flash'].includes(x.light));
      assert.ok(x.wait >= CROSS.waitRed[0] && x.wait <= CROSS.waitRed[1], `等 ${x.wait}`);
      lights[x.light]++;
      const z = c.zones.filter(z => z.kind === 'cross' && z.i === x.i), v = speedAt(x.x);
      if (x.light === 'flash') { assert.equal(z.length, 1); assert.ok(Math.abs(z[0].x0 - (x.x - CROSS.zone[0] * v)) < 1e-9 && Math.abs(z[0].x1 - (x.x - CROSS.zone[1] * v)) < 1e-9); }
      else assert.equal(z.length, 0);
    }
    assert.ok(c.crossings.filter(x => x.light === 'red').length <= CROSS.maxRed);
    // 灯态是单独的随机流：调试覆盖灯态不改路
    for (const xlight of ['red', 'green', 'flash', 'worst']) assert.equal(courseHash(planCourse(subRng(seed, SALT.course), { level: FULL, seed, xlight }), { lights: false }), courseHash(c, { lights: false }));
  }
  assert.ok(lights.green && lights.red && lights.flash, `8 个种子的灯态 ${JSON.stringify(lights)}`);
  // 没给种子（老调用方）：灯全绿、没有 ▶▶ 区
  const n = planCourse(subRng(1, SALT.course), { level: FULL });
  assert.ok(n.crossings.every(x => x.light === 'green') && n.zones.filter(z => z.kind === 'cross').length === 0);
  assert.deepEqual(planCourse(subRng(1, SALT.course), { level: FULL, seed: 1, xlight: 'worst' }).crossings.map(x => x.light), ['red', 'red', 'flash']);
});

test('主角停在停止线后时，后面最近的迎面移动障碍也在画面外（不会冻在半路）', () => {
  for (const seed of SEEDS) {
    const c = planCourse(subRng(seed, SALT.course), { level: FULL, seed });
    for (const x of c.crossings) {
      const px = crossStopX(x), ahead = lookAhead(speedAt(px));
      for (const o of c.obstacles) if (o.vx && o.x > x.x) assert.ok(obstacleX(o, px) > px + ahead + 20, `种子 ${seed} 路口 ${x.x}：${o.type}@${Math.round(o.x)} 停着时画在 ${Math.round(obstacleX(o, px) - px)}px`);
    }
  }
});

test('三种灯态 × 8 个种子 × 完美操作：0 碰撞、到家；每次等灯 ≤1.5 秒、每局最多等 2 次', () => {
  for (const xlight of ['red', 'green', 'flash']) {
    for (const seed of SEEDS) {
      const { run, res } = play(seed, { skill: 1, choose: 'good' }, { xlight });
      const s = res.stats;
      assert.ok(res.win, `${xlight} 种子 ${seed}：${res.reason}`);
      assert.equal(s.hits, 0, `${xlight} 种子 ${seed} 撞了`);
      assert.equal(s.crossings, 3);
      assert.ok(s.stopMax.cross <= 1.5 + 1e-9, `${xlight} 种子 ${seed} 等了 ${s.stopMax.cross}`);
      assert.ok(s.crossWaits <= CROSS.maxWaits);
      if (xlight === 'flash') { assert.equal(s.crossDash, 3, '完美操作一定冲过闪绿'); assert.equal(s.crossWaits, 0); assert.ok(run.flags.crossDash); }
      if (xlight === 'green') assert.equal(s.crossWaits, 0);
      if (xlight === 'red') { assert.equal(s.crossWaits, 2); assert.deepEqual(s.crossLog.map(l => l.result), ['wait', 'wait', 'green'], '等满 2 次，第 3 个红灯变绿'); }
    }
  }
});

test('不冲刺 × 全闪绿：每个路口都停下等一轮（等满 2 次后第 3 个变绿），只丢时间：不撞、不碎饭盒、不断连击', () => {
  for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'good', dash: false }, { xlight: 'flash' });
    const s = res.stats;
    assert.ok(res.win);
    assert.equal(s.hits, 0); assert.equal(s.caught, 0); assert.equal(res.broken, 0);
    assert.equal(s.crossWaits, Math.min(3, CROSS.maxWaits));
    assert.deepEqual(s.crossLog.map(l => [l.light, l.result]), [['flash', 'miss'], ['flash', 'miss'], ['green', 'green']]);
    assert.equal(s.crossDash, 0);
    assert.ok(Math.abs(s.stopMax.cross - CROSS.waitMiss) < 1e-9);
  }
  // 停下等灯时：连击不断、饱腹只按正常速度掉、饭盒不动、时钟照走
  const run = makeRun({ seed: 3, xlight: 'red' });
  placeAt(run, 0, 1.0 * speedAt(10000));
  run.combo = 17;
  while (run.cross == null || run.cross.phase !== 'wait') step(run);
  const sat0 = run.sat, clock0 = run.clock, wt0 = run.wt;
  while (run.cross.phase === 'wait') step(run);
  assert.equal(run.combo, 17);
  assert.equal(run.boxes, RES.boxes);
  assert.ok(Math.abs((sat0 - run.sat) - RES.satDrain * (run.wt - wt0)) < 1e-6, '饱腹只按正常速度掉');
  assert.ok(Math.abs((run.clock - clock0) - (run.wt - wt0) * run.lv.clockRate) < 1e-6, '时钟按真实时间照走，不额外罚');
});

test('追兵也守红灯：刹车、等灯、起步时追兵的距离和计时都冻住；每题选错 + 不冲刺 + 全红：0 被抓', () => {
  for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'bad', dash: false }, { xlight: 'red' });
    assert.ok(res.win, `种子 ${seed}：${res.reason}`);
    assert.equal(res.stats.caught, 0, `种子 ${seed} 被抓`);
  }
  const run = makeRun({ seed: 5, xlight: 'red' });
  placeAt(run, 1, 0.5 * speedAt(27000));
  run.chaser = { npc: 'wang', gap: 30, phase: 'slow', t: 1.0 };
  while (!run.cross || run.cross.phase !== 'brake') step(run);
  const g0 = run.chaser.gap, t0 = run.chaser.t;
  while (run.cross && run.cross.phase !== 'pass' && run.x < run.course.crossings[1].x + CROSS.zebra - 1) {
    step(run);
    if (run.cross && ['brake', 'wait', 'go'].includes(run.cross.phase)) { assert.equal(run.chaser.gap, g0); assert.equal(run.chaser.t, t0); }
  }
  assert.ok(run.chaser && run.stats.caught === 0, '红灯前后都没被抓');
});

test('被追时冲过闪绿灯：踏上斑马线那一刻追兵被红灯拦下（crossEscape），+100', () => {
  const run = makeRun({ seed: 9, xlight: 'flash' });
  const c = placeAt(run, 0, 1.3 * speedAt(10500));
  run.chaser = { npc: 'tony', gap: 20, phase: 'shake', t: 0 };
  while (run.x < c.x - CROSS.zone[0] * speedAt(c.x) + 5) step(run);
  assert.ok(canDash(run));
  const score0 = run.score;
  input(run, 'right');
  assert.ok(run.player.dashT > 0);
  while (run.x < c.x + 2 && !run.done) step(run);
  assert.equal(run.chaser, null);
  assert.equal(run.stats.crossEscape, 1); assert.equal(run.stats.crossDash, 1);
  assert.ok(run.score >= score0 + CROSS.dashScore);
  // 闪绿已经开始刹车、但还在 ▶▶ 区里冲：照样过
  const r2 = makeRun({ seed: 9, xlight: 'flash' }), c2 = placeAt(r2, 0, 1.3 * speedAt(10500));
  while (!r2.cross || r2.cross.phase !== 'brake') step(r2);
  assert.ok(r2.x < c2.x - CROSS.zone[1] * speedAt(c2.x), '刹车开始时还在 ▶▶ 区里');
  assert.ok(canDash(r2));
  input(r2, 'right');
  assert.equal(r2.cross.phase, 'pass');
  while (r2.cross && !r2.done) step(r2);
  assert.equal(r2.stats.crossWaits, 0); assert.equal(r2.stats.crossDash, 1);
});

test('灯和右滑的结果对得上：闪绿路口里环是青色（右滑能冲）的每一帧灯都不是红的；刹车时还在 ▶▶ 区里闪绿、出了区才变红', () => {
  // 每一帧都查：能冲 ⇒ 灯不红；刹车中「灯闪绿」⇔ 能冲；灯红时提示条不再叫你冲
  const check = (run, tag, seen) => {
    const s = run.cross;
    if (!s || s.phase === 'far' || s.light !== 'flash') return;
    const lamp = crossLamp(run, run.course.crossings[run.crossIdx]);
    if (dashReady(run)) assert.notEqual(lamp.lit, 'red', `${tag}：${s.phase} 环是青色，灯却是红的`);
    if (s.phase === 'brake') {
      assert.equal(lamp.lit === 'flash', dashReady(run), `${tag}：刹车中灯 ${lamp.lit}、dashReady ${dashReady(run)}`);
      assert.equal(lamp.lit === 'flash', crossDashOpen(run));
      seen[lamp.lit] = (seen[lamp.lit] || 0) + 1;
    }
    if (lamp.lit === 'red') {
      assert.equal(canDash(run), false, `${tag}：灯红了还能冲`);
      assert.ok(!(run.hint && ['cross', 'dash'].includes(run.hint.key)), `${tag}：${s.phase} 灯红了，提示条还叫你右滑`);
    }
  };
  const seen = {};
  for (const seed of SEEDS) for (let i = 0; i < 3; i++) {
    const run = makeRun({ seed, xlight: 'flash' }), c = placeAt(run, i, 2.3 * speedAt(LEVELS.full.crossings[i].x));
    run.course.obstacles.forEach(o => { if (o.x < c.x + 2000) o.done = true; });
    run.obIdx = Math.max(0, run.course.obstacles.findIndex(o => !o.done));
    while (run.crossIdx === i && !run.done) { step(run); check(run, `种子 ${seed} 路口 ${i}`, seen); }
    assert.deepEqual(run.stats.crossLog.map(l => l.result), ['miss']);
  }
  assert.ok(seen.flash > 0 && seen.red > 0, `刹车中两种灯都见过 ${JSON.stringify(seen)}`);
  // 整局：完美 / 被追不冲 / 只在被追时冲，全闪绿
  for (const seed of SEEDS) for (const bo of [{ choose: 'good' }, { choose: 'bad', dash: false }, { choose: 'bad', dash: 'chase' }]) {
    const run = makeRun({ seed, xlight: 'flash' });
    simulate(run, makeBot({ rng: botRng(seed), skill: 1, ...bo }), { update: (r, dt) => { updateRun(r, dt); check(r, `种子 ${seed} ${JSON.stringify(bo)}`, {}); } });
    assert.ok(run.done && run.stats.hits === 0);
  }
  // 刹车中、灯已经红了（出了 ▶▶ 区）：右滑不冲、不加分，照样停下等一轮；被追时也一样
  for (const chased of [false, true]) {
    const run = makeRun({ seed: 9, xlight: 'flash' }), c = placeAt(run, 0, 1.3 * speedAt(10500));
    if (chased) run.chaser = { npc: 'tony', gap: 60, phase: 'shake', t: 0 };
    while (!(run.cross && run.cross.phase === 'brake' && crossLamp(run, c).lit === 'red')) step(run);
    const score0 = run.score;
    assert.ok(run.x > c.x - CROSS.zone[1] * speedAt(c.x), '已经出了 ▶▶ 区');
    assert.equal(dashReady(run), false);
    input(run, 'right');
    assert.equal(run.cross.phase, 'brake'); assert.equal(run.player.dashT, 0); assert.equal(run.score, score0);
    while (run.crossIdx === 0 && !run.done) step(run);
    assert.deepEqual(run.stats.crossLog.map(l => l.result), ['miss']); assert.equal(run.stats.crossDash, 0);
  }
  // 刹车中、灯还闪绿（还在 ▶▶ 区里）：右滑就过，灯牌一直是闪绿
  const r3 = makeRun({ seed: 9, xlight: 'flash' }), c3 = placeAt(r3, 0, 1.3 * speedAt(10500));
  while (!(r3.cross && r3.cross.phase === 'brake' && r3.cross.t > 0.3)) step(r3);
  assert.equal(crossLamp(r3, c3).lit, 'flash');
  input(r3, 'right');
  assert.equal(r3.cross.phase, 'pass'); assert.equal(crossLamp(r3, c3).lit, 'flash');
});

test('等灯时冲不了、左滑不做事；能跳（原地）', () => {
  const run = makeRun({ seed: 4, xlight: 'red' });
  placeAt(run, 0, 0.4 * speedAt(10500));
  run.chaser = { npc: 'laoliu', gap: 90, phase: 'shake', t: 0 };
  while (!run.cross || run.cross.phase !== 'wait') step(run);
  assert.equal(canDash(run), false);
  input(run, 'right'); input(run, 'left');
  assert.equal(run.player.dashT, 0);
  const x0 = run.x;
  input(run, 'jump'); step(run, 5);
  assert.ok(run.player.y < 0, '原地跳起来了');
  assert.equal(run.x, x0, '等灯时不往前走');
});

test('按主角位置触发：同种子两局、一局中途被拖慢 3 秒，路口出现灯牌 / 开始刹车的位置和灯态都一样', () => {
  const trace = slowFirst => {
    const run = makeRun({ seed: 2026, xlight: 'worst' });
    placeAt(run, 0, 2.6 * speedAt(10500));
    if (slowFirst) run.mods.push({ k: 0.6, t: 3 });
    const at = {};
    let last = null;
    while (run.crossIdx === 0 && !run.done) {
      step(run);
      const ph = run.cross && run.cross.phase;
      if (ph && ph !== last) { at[ph] = { x: run.x, light: run.cross.light }; last = ph; }
    }
    return at;
  };
  const a = trace(false), b = trace(true), c = LEVELS.full.crossings[0], v = speedAt(c.x), stop = c.x - CROSS.stopBack;
  for (const ph of ['show', 'brake']) {
    assert.equal(a[ph].light, b[ph].light);
    const want = stop - (ph === 'show' ? CROSS.show : CROSS.brake) * v;
    // 判断用的是这一帧移动前的位置，记录的是移动后的：落在 [want, want + 两帧路程) 里（和真实时间、前面被拖慢多久无关）
    for (const r of [a, b]) assert.ok(r[ph].x >= want && r[ph].x < want + 2 * v / 60 + 0.5, `${ph} 在 ${r[ph].x}，应在 ${want}`);
  }
  assert.equal(a.wait.x, stop); assert.equal(b.wait.x, stop);
});

test('标准时间：红灯按「刹车 0.35 + 等待 + 起步 0.25」秒算进去（最多 2 个）；实际损失和它对得上', () => {
  for (const seed of SEEDS) {
    const g = makeRun({ seed, xlight: 'green' }), r = makeRun({ seed, xlight: 'red' });
    const reds = r.course.crossings.slice(0, CROSS.maxWaits);
    const want = reds.reduce((a, c) => a + CROSS.brake + c.wait + PAR.startLoss, 0) * FULL.clockRate / 60;
    assert.ok(Math.abs((r.par.raw - g.par.raw) - want) < 1e-9, `种子 ${seed}`);
    assert.equal(r.par.min, parOf(r.course, r.lv).min);
  }
  // 同一段路：红灯比绿灯多用的时间 ≈ 0.35 + 等待 + 0.25（±0.12 秒）
  const cost = xlight => {
    const run = makeRun({ seed: 6, xlight }), c = placeAt(run, 2, 3 * speedAt(29700)), w0 = run.wt;
    while (run.x < c.x + CROSS.zebra + 100) step(run);
    return { t: run.wt - w0, wait: c.wait };
  };
  const a = cost('green'), b = cost('red');
  assert.ok(Math.abs((b.t - a.t) - (CROSS.brake + b.wait + PAR.startLoss)) < 0.12, `多用 ${(b.t - a.t).toFixed(3)} 秒`);
});

test('路口窗口里不生成车流（车身会盖住斑马线和 ▶▶）', () => {
  const { course } = makeRun({ seed: 1, xlight: 'flash' });
  for (const c of course.crossings) {
    assert.ok(trafficQuiet(course, c.w0 - 50, c.w0 + 10), '镜头刚碰到路口窗口');
    assert.ok(trafficQuiet(course, c.x - 200, c.x + 200));
    assert.ok(!trafficQuiet(course, c.w1 + 80, c.w1 + 500), '过了路口照常有车');
  }
  assert.ok(!trafficQuiet(course, 22000, 22420));
});

test('路口窗口里只出路口自己的提示：别的提示排队，过完再出', () => {
  const run = makeRun({ seed: 1, xlight: 'flash' });
  placeAt(run, 0, 2.2 * speedAt(10500));
  while (!run.cross || run.cross.phase === 'far') step(run);
  run.tipQueue.push({ key: 'hungry', text: '饿坏了：说真话一律放行' });   // 灯牌出来以后才排进来
  let sawCross = false;
  while (run.crossIdx === 0) { step(run); if (run.hint && run.cross) { assert.ok(run.hint.text !== '饿坏了：说真话一律放行', '路口里出了别的提示'); sawCross = sawCross || run.hint.text.includes('闪绿'); } }
  assert.ok(sawCross, '第一次遇到闪绿有提示');
  while (run.tipQueue.length && !run.done) step(run);
  assert.ok(run.tips.has('hungry'), '过完路口再出');
});

test('路口提示不被队头卡住：正在显示别的规则提示、队头还压着一条，红灯灯牌一出来、闪绿一踩进 ▶▶ 区路口提示就出', () => {
  const firstPhase = (run, key, idx) => {
    let at = null;
    while (run.crossIdx === idx && !run.done) {
      step(run);
      if (!at && run.hint && run.hint.key === key) {
        at = run.cross ? run.cross.phase : 'none';
        if (key === 'cross') { const z = dashZoneAt(run); assert.ok(z && z.kind === 'cross', '闪绿提示要等踩进 ▶▶ 区才出（之前右滑只会白划）'); }
      }
      // 路口提示出来以后，路口里只有路口提示（闪绿在进 ▶▶ 区之前，原来显示着的那条可以接着显示完）
      if (at && run.cross && run.cross.phase !== 'far' && run.hint && run.hint.key) assert.ok(run.hint.key.startsWith('cross') || run.hint.key === 'dash', `路口里出了 ${run.hint.key}`);
    }
    return at;
  };
  // 闪绿 / 红灯 × 正在显示的提示刚出来（放回队头，过完路口再出）/ 已经显示了 1.6 秒（算看过）
  for (const [xlight, key] of [['flash', 'cross'], ['red', 'crossRed']]) for (const fresh of [true, false]) {
    const run = makeRun({ seed: 1, xlight });
    placeAt(run, 0, (xlight === 'flash' ? 1.5 : 2.4) * speedAt(10500));   // 闪绿：离 ▶▶ 区 0.5 秒，原来那条提示被顶掉时还不满 1 秒
    run.hint = { text: '违停车要开门：跳！', t: fresh ? 2.6 : 1.0, total: 2.6, key: 'cardoor' }; run.tips.add('cardoor');
    run.tipQueue.push({ key: 'hungry', text: '饿坏了：说真话一律放行' });
    const at = firstPhase(run, key, 0);
    assert.ok(at === 'show' || at === 'brake', `${xlight}：路口提示在 ${at} 才出`);
    assert.ok(run.tips.has(key));
    assert.equal(run.tipQueue.some(q => q.key === 'cardoor'), fresh, fresh ? '刚出来就被顶掉：放回队里' : '显示过 1 秒以上：算看过');
    while (run.tipQueue.length && !run.done) step(run);
    assert.ok(run.tips.has('hungry') && run.tips.has('cardoor'), '过完路口别的提示照常出');
  }
  // 闪绿路口里被追：路口提示看过了的话，「右滑冲刺」可以在灯牌阶段出（排在别的提示后面也一样）
  const run = makeRun({ seed: 1, xlight: 'flash', seenTips: ['cross'] });
  placeAt(run, 0, 2.4 * speedAt(10500));
  run.chaser = { npc: 'tony', gap: 90, phase: 'shake', t: 0 };
  while (!run.cross || run.cross.phase === 'far') step(run);
  run.tipQueue.push({ key: 'cardoor', text: '违停车要开门：跳！' }, { key: 'dash', text: '被追时右滑：冲刺！' });
  step(run);
  assert.equal(run.hint && run.hint.key, 'dash');
  assert.equal(run.cross.phase, 'show');
});

test('路口外不消耗路口提示：不显示、不记看过，留给下一个路口', () => {
  const run = makeRun({ seed: 1, xlight: 'flash' });
  placeAt(run, 0, 4 * speedAt(10500));
  run.tipQueue.push({ key: 'cross', text: '闪绿灯：右滑冲过去！' }, { key: 'cardoor', text: '违停车要开门：跳！' });
  step(run);
  assert.ok(!run.tips.has('cross') && !run.tipQueue.some(q => q.key === 'cross'), '路口外：路口提示直接丢掉');
  assert.equal(run.hint && run.hint.key, 'cardoor', '后面的提示照常出');
  // 路口里一直被别的画面提示占着（不是规则提示，不顶掉）：这个路口没出成，过完也不补、不记看过
  const r2 = makeRun({ seed: 1, xlight: 'flash' });
  placeAt(r2, 0, 2.4 * speedAt(10500));
  r2.hint = { text: '帮小哥送了一单', t: 30, total: 30 };
  while (r2.crossIdx === 0 && !r2.done) step(r2);
  step(r2);
  assert.ok(!r2.tips.has('cross') && !r2.tipQueue.some(q => q.key === 'cross'));
  r2.hint = null;
  placeAt(r2, 1, 2.4 * speedAt(27000));
  let at = null;
  while (r2.crossIdx === 1 && !r2.done) { step(r2); if (!at && r2.hint && r2.hint.key === 'cross') at = r2.cross.phase; }
  assert.equal(at, 'show', '下一个闪绿路口再出');
  assert.ok(r2.tips.has('cross'));
});

test('鞋底环和右滑同一个判断：被追、冷却中刚进 ▶▶ 区，环是青色、右滑也能冲', () => {
  const run = makeRun({ seed: 9, xlight: 'flash' });
  const c = placeAt(run, 0, 1.3 * speedAt(10500));
  run.chaser = { npc: 'tony', gap: 20, phase: 'shake', t: 0 };
  run.player.dashCd = DASH.cooldown;                                   // 刚冲过：冷却中
  assert.ok(canDash(run) && !dashReady(run), '区外、冷却中：环灰');
  input(run, 'right');
  assert.equal(run.player.dashT, 0, '环灰时右滑确实冲不了');
  while (run.x < c.x - CROSS.zone[0] * speedAt(c.x) + 5) step(run);
  assert.ok(run.player.dashCd > 0, '还在冷却');
  assert.ok(dashReady(run), '刚进没冲过的 ▶▶ 区：环是青色');
  input(run, 'right');
  assert.ok(run.player.dashT > 0, '右滑冲出去了');
  assert.equal(dashReady(run), false, '冲完：冷却中、这个区也冲过了，环变灰');
  while (run.x < c.x + 2 && !run.done) step(run);
  assert.equal(run.chaser, null, '冲过闪绿当场甩掉');
});

test('世界停住：每局合计 ≤15 秒；每次等灯 ≤1.5、每家便利店不买等到超时也有上限', () => {
  for (const seed of SEEDS) for (const shop of ['buy', 'idle']) for (const xlight of ['worst', 'flash']) {
    const { res } = play(seed, { skill: 1, choose: 'good', store: 'always', shop, dash: false }, { xlight });
    const s = res.stats;
    assert.ok(res.win, `种子 ${seed} ${shop}/${xlight}：${res.reason}`);
    assert.ok(s.stopT <= 15, `种子 ${seed} ${shop}/${xlight} 停了 ${s.stopT.toFixed(2)} 秒`);
    assert.ok(s.stopMax.cross <= 1.5 + 1e-9);
    assert.ok(s.stopMax.shop <= STORE.time + 0.25 + 0.2, `便利店停了 ${s.stopMax.shop.toFixed(2)} 秒`);
    assert.ok(s.crossWaits <= CROSS.maxWaits);
    if (shop === 'idle') assert.equal(s.shops, 0);
  }
});

test('冲刺成功的那一下横划不算「横划完马上撞上」的误划', async () => {
  const { noteSwipe } = await import('../js/core/swipe.js');
  const run = makeRun({ seed: 9, xlight: 'flash' });
  const c = placeAt(run, 0, 1.3 * speedAt(10500));
  while (run.x < c.x - CROSS.zone[0] * speedAt(c.x) + 5) step(run);
  noteSwipe(run, 'run', 'right');
  assert.equal(run.lastHSwipe, run.t);
  input(run, 'right');
  assert.ok(run.player.dashT > 0);
  assert.equal(run.lastHSwipe, -9, '冲成了：不记这一下横划');
  void CHASE;
});
