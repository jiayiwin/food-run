// 冲刺：右滑一次 0.5 秒 ×1.25，只在被追时 / ▶▶ 区里生效。铁律：不冲刺只丢时间（不撞、不被抓）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRun, updateRun, input, canDash } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { makePlayer, dash, stumble } from '../js/game/player.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { DASH, CHASE, CHOICE, TUNE, speedAt } from '../js/data/tune.js';
import { JUMP_VMIN } from '../js/game/course.js';
import { LEVELS } from '../js/data/levels.js';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const play = (seed, botOpts) => { const run = makeRun({ seed }); return { run, res: simulate(run, makeBot({ rng: botRng(seed), ...botOpts }), { update: updateRun }) }; };

// 把主角放到某个障碍前 dist 处：前面的障碍都算过了、附近没有选择槽，开局加速早就结束
function placeBefore(run, i, dist) {
  const o = run.course.obstacles[i];
  run.intro = 0; run.wt = 30; run.x = o.x - dist;
  run.course.obstacles.forEach((p, j) => { if (j < i) p.done = true; });
  run.obIdx = i;
  run.slotIdx = run.lv.slots.findIndex(s => s.x > run.x);
  run.pending = null; run.choice = null;
  run.stage = run.lv.stageAt(run.x);
  return o;
}
// 找一个静止的障碍：它前面 2.4 秒路程到后面 1.6 秒 + 600px 内没有选择槽（主角放过去以后不会弹题、不会预出现）
function isolated(run) {
  const obs = run.course.obstacles;
  for (let i = 1; i < obs.length; i++) {
    const o = obs[i], v = speedAt(o.x);
    if (o.vx || OBSTACLES[o.type].hole) continue;
    if (run.lv.slots.some(s => s.x > o.x - 2.4 * v - 200 && s.x < o.x + 1.6 * v + 600)) continue;
    return i;
  }
  return -1;
}

test('冲刺：冷却中冲不了；刚进 ▶▶ 区能清冷却；踉跄中冲不了', () => {
  const p = makePlayer();
  assert.equal(dash(p), true);
  assert.equal(p.dashT, DASH.time); assert.equal(p.dashCd, DASH.cooldown);
  assert.equal(dash(p), false, '冷却中');
  assert.equal(dash(p, true), true, 'refresh 清掉冷却');
  const q = makePlayer();
  stumble(q);
  assert.equal(dash(q), false, '踉跄中');
  const r = makePlayer(); dash(r); stumble(r);
  assert.equal(r.dashT, 0, '撞上就不冲了');
});

test('冲刺：不被追、不在 ▶▶ 区，右滑不做事（脚下灰环闪一下）；左滑在跑酷里永远不做事', () => {
  const run = makeRun({ seed: 4 });
  const i = isolated(run); assert.ok(i > 0);
  placeBefore(run, i, 400);
  input(run, 'right');
  assert.equal(run.player.dashT, 0);
  assert.ok(run.fx.some(e => e.type === 'dashNo'));
  assert.equal(canDash(run), false);
  run.fx.length = 0;
  run.chaser = { npc: 'laoliu', gap: 80, phase: 'shake', t: 0 };
  input(run, 'left');
  assert.equal(run.player.dashT, 0);
  assert.equal(canDash(run), true);
  input(run, 'right');
  assert.equal(run.player.dashT, DASH.time);
  assert.equal(run.stats.dashes, 1); assert.equal(run.stats.dashChased, 1);
});

test('冲刺：快弹题、读题、选完 0.35 秒内的右滑归答题，不冲刺；卡片照常选中', () => {
  const run = makeRun({ seed: 3 });
  const bot = makeBot({ rng: botRng(3), think: 99, dash: false });   // 只躲障碍、不答题
  while (!(run.choice && run.choice.phase === 'open' && run.choice.kind === 'npc' && run.choice.t > CHOICE.guard + 0.05)) { bot(run); updateRun(run, 1 / 60); run.fx.length = 0; }
  run.chaser = { npc: 'laoliu', gap: 80, phase: 'shake', t: 0 };
  assert.equal(canDash(run), false, '读题时环是灰的');
  run.chaser = null;                                                // 选错时不要「被追又选错当场被逮」
  input(run, 'right');
  assert.equal(run.choice.picked, 1, '读题时右滑 = 选右边');
  assert.equal(run.player.dashT, 0);
  if (!run.chaser) run.chaser = { npc: 'laoliu', gap: 80, phase: 'shake', t: 0 };
  assert.equal(canDash(run), false, '刚选完环是灰的');
  input(run, 'right');                                              // 刚选完
  assert.equal(run.player.dashT, 0);
  while (run.choice && run.choice.rt < CHOICE.dashGuard) updateRun(run, 1 / 60);
  if (!run.chaser) run.chaser = { npc: 'laoliu', gap: 80, phase: 'shake', t: 0 };
  // 快弹题：离下一个槽不到 0.6 秒路程
  run.pending = { slot: { x: run.x + 0.3 * Math.max(run.v, 1), kind: 'npc' }, q: null, wx: 0 };
  assert.equal(canDash(run), false);
  input(run, 'right');
  assert.equal(run.player.dashT, 0);
  run.pending = { slot: { x: run.x + 2 * Math.max(run.v, 1), kind: 'npc' }, q: null, wx: 0 };
  if (run.player.state !== 'stumble') { assert.equal(canDash(run), true); input(run, 'right'); assert.equal(run.player.dashT, DASH.time); }
});

test('冲刺的速度：前方 1.05 秒路程内有障碍就不加速，更远才 ×1.25（间距表永远成立）', () => {
  for (const seed of SEEDS) {
    for (const [dist, k] of [[1.0, 1], [2.0, DASH.k]]) {
      const run = makeRun({ seed });
      const i = isolated(run); assert.ok(i > 0, `种子 ${seed} 没找到空旷的地方`);
      const o = run.course.obstacles[i], v = speedAt(o.x - dist * speedAt(o.x));
      placeBefore(run, i, dist * v);
      run.chaser = { npc: 'laoliu', gap: 80, phase: 'shake', t: 0 };
      input(run, 'dash');
      assert.equal(run.player.dashT, DASH.time);
      const vb = speedAt(run.x);
      updateRun(run, 1 / 60);
      assert.ok(Math.abs(run.v - vb * k) < 1e-6, `种子 ${seed} 距离 ${dist}×v：速度 ${run.v} vs ${vb * k}`);
    }
  }
});

test('冲刺：每题选错、每次被追都冲刺的完美操作：0 碰撞、0 被抓、到家', () => {
  for (const seed of SEEDS) {
    const { run, res } = play(seed, { skill: 1, choose: 'bad', dash: true });
    assert.ok(res && res.win, `种子 ${seed}：${res && res.reason} x=${Math.round(run.x)}`);
    assert.equal(res.stats.hits, 0, `种子 ${seed} 撞了 ${res.stats.hits} 次`);
    assert.equal(res.stats.caught, 0);
    // 冲刺只在被追时、闪绿路口的 ▶▶ 区里（每个闪绿路口最多一次）、电梯门前的 ▶▶ 区里（坐电梯时最多一次）
    assert.ok(res.stats.dashChased > 0 && res.stats.dashes - res.stats.dashChased <= res.stats.crossDash + (res.stats.route === 'lift' ? 1 : 0), `种子 ${seed} 冲刺 ${res.stats.dashes} 次，被追时 ${res.stats.dashChased}`);
  }
});

test('铁律：每题选错、从不冲刺，干净地跑也一定甩得掉', () => {
  for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'bad', dash: false });
    assert.ok(res && res.win, `种子 ${seed}：${res && res.reason}`);
    assert.equal(res.stats.caught, 0);
    assert.equal(res.stats.dashes, 0);
  }
});

test('冲刺的追兵收益：同一次被追，冲刺版甩得更早或拉开的距离多 ≥20', () => {
  let better = 0;
  for (const seed of SEEDS) {
    const first = dash => {
      const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'bad', dash });
      let on = false, t0 = 0, peak = 0;
      while (!run.done && run.t < 400) {
        bot(run); updateRun(run, 1 / 60); run.fx.length = 0;
        if (run.chaser) { if (!on) { on = true; t0 = run.wt; } peak = Math.max(peak, run.chaser.gap); }
        else if (on) return { len: run.wt - t0, peak };
      }
      return null;
    };
    const a = first(false), b = first(true);
    assert.ok(a && b, `种子 ${seed} 没被追`);
    assert.ok(b.len <= a.len + 1e-9, `种子 ${seed} 冲刺了反而甩得更慢`);
    if (b.len < a.len - 0.2 || b.peak >= a.peak + 20) better++;
  }
  assert.ok(better >= SEEDS.length - 1, `只有 ${better} 个种子冲刺有收益`);
  assert.equal(CHASE.dash, 25);
});

test('减速结束时限速回升（0.6 → 1 至少 0.5 秒，不一下跳回原速）', () => {
  for (const seed of SEEDS) {
    const run = makeRun({ seed });
    const i = isolated(run); assert.ok(i > 0);
    placeBefore(run, i, 3 * speedAt(run.course.obstacles[i].x));
    run.mods.push({ k: 0.6, t: 0.3 });
    let last = null, maxRise = 0;
    for (let f = 0; f < 90; f++) {
      updateRun(run, 1 / 60); run.fx.length = 0;
      const k = run.v / run.vBase;
      if (last != null) maxRise = Math.max(maxRise, k - last);
      last = k;
    }
    assert.ok(Math.abs(last - 1) < 1e-9, `种子 ${seed} 没回到原速：${last}`);
    assert.ok(maxRise <= (1 - 0.6) / TUNE.modRamp / 60 + 1e-9, `种子 ${seed} 一帧回升了 ${maxRise}`);
  }
});

test('减速托底：跳类障碍最低要多快才跳得过都 ≤ 240（最低速）；遛狗绳前面减速不压到它以下', () => {
  for (const [id, v] of Object.entries(JUMP_VMIN)) assert.ok(v <= TUNE.speed.base, `${id} 要 ${v.toFixed(0)}`);
  assert.ok(JUMP_VMIN.leash > 0.6 * speedAt(9000), '被缠住的 ×0.6 在街道里确实会压到遛狗绳以下（所以要托底）');
  let checked = 0;
  for (const seed of SEEDS) {
    const run = makeRun({ seed, xlight: 'green' });
    const i = run.course.obstacles.findIndex((o, j) => j > 0 && o.type === 'leash' && run.course.obstacles[j - 1].x < o.x - 600 && !run.lv.slots.some(s => Math.abs(s.x - o.x) < 900));
    if (i < 0) continue;
    const o = placeBefore(run, i, 2.5 * speedAt(run.course.obstacles[i].x));
    run.mods.push({ k: 0.6, t: 10 });
    while (run.x < o.x - 60) { updateRun(run, 1 / 60); run.fx.length = 0; if (o.x - run.x < 1.2 * run.vBase) assert.ok(run.v >= JUMP_VMIN.leash - 1e-6, `种子 ${seed} 离绳 ${Math.round(o.x - run.x)} 时速度 ${run.v.toFixed(0)}`); }
    checked++;
  }
  assert.ok(checked >= 3, `只核对了 ${checked} 个种子`);
});

test('公平：以前因为减速结束撞上的种子，满技能机器人 0 碰撞（smart / bad 选法、冲不冲刺，有路口和没路口的路）', () => {
  const noCross = { ...LEVELS.full, id: 't-nocross', crossings: [] };
  for (const seed of [41, 138, 216, 241, 253, 327])
    for (const level of ['full', noCross])
      for (const cfg of [{ choose: 'smart', dash: true }, { choose: 'smart', dash: false }, { choose: 'bad', dash: true }, { choose: 'bad', dash: false }]) {
        const run = makeRun({ seed, daily: seed % 5 === 0, level });
        const res = simulate(run, makeBot({ rng: botRng(seed), skill: 1, ...cfg }), { update: updateRun });
        assert.ok(res && res.win, `种子 ${seed} ${level.id || level} ${JSON.stringify(cfg)}：${res && res.reason}`);
        assert.equal(res.stats.hits, 0, `种子 ${seed} ${level.id || level} ${JSON.stringify(cfg)} 撞了`);
        assert.equal(res.stats.caught, 0);
      }
});
