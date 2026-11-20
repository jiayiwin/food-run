// 晚高峰马路：违停车开门（跳类障碍）、车溅水（只认车溅）、蹭车画到马路上（不吃人行道上的零钱）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subRng, SALT } from '../js/core/rng.js';
import { planCourse, checkSpacing, doorOpenK, splashState, lookAhead } from '../js/game/course.js';
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { story, etaMin } from '../js/game/story.js';
import { FAMILIES } from '../js/data/family.js';
import { FULL } from '../js/game/level.js';
import { OBSTACLES, obstacleBox } from '../js/data/obstacles.js';
import { MOM } from '../js/data/npcs.js';
import { COURSE_VERSION } from '../js/data/levels.js';
import { TRAFFIC, speedAt } from '../js/data/tune.js';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };

// 把主角放到第 i 个障碍前 dist 处，附近没有选择槽、前面的障碍都算过了
function placeBefore(run, i, dist) {
  const o = run.course.obstacles[i];
  run.intro = 0; run.wt = 30; run.x = o.x - dist;
  run.course.obstacles.forEach((p, j) => { if (j < i) p.done = true; });
  run.obIdx = i; run.slotIdx = run.lv.slots.findIndex(s => s.x > run.x + 1200);
  run.pending = null; run.choice = null; run.stage = run.lv.stageAt(run.x);
  return o;
}
// 找一个附近没有选择槽的某种障碍（后一个障碍按间距表一定在它后面一大截，站着跑过去不会顺带撞上别的）
function lone(run, type) {
  const obs = run.course.obstacles;
  for (let i = 1; i < obs.length - 1; i++) {
    const o = obs[i];
    if (o.type !== type) continue;
    if (run.lv.slots.some(s => s.x > o.x - 1200 && s.x < o.x + 300)) continue;
    return i;
  }
  return -1;
}
// 站着不跳，一路跑过第 i 个障碍
function runThrough(run, i) {
  const o = run.course.obstacles[i];
  while (run.x < o.x + OBSTACLES[o.type].w + 30 && !run.done) { updateRun(run, 1 / 60); run.fx.length = 0; }
}

test('新障碍登记完整：违停车开门（跳，44 高）、溅水的水坑（跳，30 高，轻碰）', () => {
  const d = OBSTACLES.cardoor, s = OBSTACLES.splash;
  assert.ok(d.name && d.w === 30 && d.ground === 44 && d.avoid === 'jump' && d.stages.includes('street') && d.warn && d.pop > 0.9);
  assert.ok(s.name && s.w === OBSTACLES.puddle.w && s.ground === 30 && s.avoid === 'jump' && s.light && s.stages.length === 0);
  assert.deepEqual(obstacleBox({ type: 'cardoor', x: 100 }), { x0: 100, x1: 130, y0: -44, y1: 0 });
  assert.deepEqual(obstacleBox({ type: 'splash', x: 100 }), { x0: 100, x1: 156, y0: -30, y1: 0 });
  assert.ok(d.ground < OBSTACLES.trike.ground, '最低速 240 也跳得过（不高于现有最高的跳类）');
  assert.equal(OBSTACLES.leash.ground, 20);
  assert.ok(COURSE_VERSION >= 2);
});

test('溅水只出在街道，而且就是原地换掉的水坑（位置、宽度不变，间距表照样成立）', () => {
  let n = 0;
  for (const seed of SEEDS) {
    const a = planCourse(subRng(seed, SALT.course), { level: FULL, seed });
    const b = planCourse(subRng(seed, SALT.course), { level: FULL, seed: null });   // 不转换
    assert.equal(a.obstacles.length, b.obstacles.length);
    a.obstacles.forEach((o, i) => {
      const p = b.obstacles[i];
      assert.equal(o.x, p.x);
      if (o.type === 'splash') { n++; assert.equal(p.type, 'puddle'); assert.equal(FULL.themeAt(o.x), 'street', `种子 ${seed} 溅水出在 ${FULL.themeAt(o.x)}`); }
      else assert.equal(o.type, p.type);
    });
    assert.deepEqual(checkSpacing(a.obstacles), []);
  }
  assert.ok(n >= SEEDS.length, `8 个种子一共只有 ${n} 个溅水`);
  // 小区的水坑不转
  const all = SEEDS.flatMap(seed => planCourse(subRng(seed, SALT.course), { level: FULL, seed }).obstacles);
  assert.ok(all.some(o => o.type === 'puddle' && FULL.themeAt(o.x) === 'park'));
  assert.ok(all.filter(o => o.type === 'cardoor').every(o => FULL.themeAt(o.x) === 'street'));
});

test('完美操作：0 碰撞到家，而且真的跳过了违停车门', () => {
  let doors = 0;
  for (const seed of SEEDS) {
    const run = makeRun({ seed });
    const res = simulate(run, makeBot({ rng: botRng(seed), skill: 1, choose: 'good' }), { update: updateRun });
    assert.ok(res && res.win, `种子 ${seed}：${res && res.reason}`);
    assert.equal(res.stats.hits, 0, `种子 ${seed} 撞了`);
    doors += run.course.obstacles.filter(o => o.type === 'cardoor' && o.done && !o.hit).length;
  }
  assert.ok(doors > 0, '一个车门都没遇到');
});

test('站着不跳撞上溅水：被车溅了（flags.splashed），饭盒不碎、不算撞；普通水坑只是裤腿湿了', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const run = makeRun({ seed }), i = lone(run, 'splash');
    if (i < 0) continue;
    placeBefore(run, i, 260);
    runThrough(run, i);
    assert.equal(run.flags.splashed, true, `种子 ${seed}`);
    assert.equal(run.boxes, 3); assert.equal(run.stats.hits, 0);
    assert.ok(run.course.obstacles[i].hit);
    checked++;
    const r2 = makeRun({ seed }), j = lone(r2, 'puddle');
    if (j < 0) continue;
    placeBefore(r2, j, 260);
    runThrough(r2, j);
    assert.equal(r2.stats.wet, true);
    assert.ok(!r2.flags.splashed, '普通水坑不算被车溅');
  }
  assert.ok(checked >= 2, `只核对了 ${checked} 个种子`);
});

test('门口终题：被车溅了出「裤子咋湿了」；生气优先，湿身排在外卖、晚到前（家庭剧本的顺序）；普通水坑不算', () => {
  const run = makeRun({ seed: 2 });
  const mid = run.par.min + 3 - etaMin(run, 0), late = mid + 30;   // 预计到家：标准 +3（不早不晚）/ +33（晚到）
  assert.equal(story.door(run, mid).key, 'normal');
  run.stats.wet = true;
  assert.equal(story.door(run, mid).key, 'normal', '踩普通水坑湿了裤腿：不算');
  run.flags.splashed = true;
  assert.equal(story.door(run, mid).key, 'wet');
  assert.equal(story.door(run, mid).q, FAMILIES.parents.questions.wet);
  assert.equal(story.door(run, late).key, 'wet', '湿身排在晚到前');
  run.flags.takeout = true;
  assert.equal(story.door(run, mid).key, 'wet', '湿身排在外卖前');
  run.flags.momAngry = true;
  assert.equal(story.door(run, mid).key, 'angry');
  const q = MOM.questions.mom5;
  assert.equal(q.id, 'mom5');
  assert.ok([...q.line].length <= 6 && q.opts.every(o => [...o.text].length <= 4));
  assert.ok(q.opts.some(o => o.good === true), '有能过的选项');
});

test('蹭车：人在马路上，不吃人行道上的零钱和包子', () => {
  const run = makeRun({ seed: 5 });
  run.intro = 0; run.wt = 30; run.x = 18000; run.obIdx = run.course.obstacles.findIndex(o => o.x > 18000); run.slotIdx = run.lv.slots.findIndex(s => s.x > 30000);
  run.stage = run.lv.stageAt(run.x);
  run.course.pickups = [-22, -60, -100].flatMap((y, k) => [0, 1, 2].map(i => ({ kind: k === 2 ? 'bun' : 'coin', x: 18060 + i * 80 + k * 300, y })));
  run.pkIdx = 0;
  run.ride = { t: 5, total: 5, detour: false };
  const money = run.money;
  for (let f = 0; f < 60 * 3 && run.ride; f++) { updateRun(run, 1 / 60); run.fx.length = 0; }
  assert.ok(run.x > 18060 + 2 * 80 + 600 + 30, `没跑过拾取物：${run.x}`);
  assert.ok(run.course.pickups.every(p => !p.taken));
  assert.equal(run.money, money);
});

test('按位置触发：车门开度、溅水车和水墙只看主角离它多远，和时间无关', () => {
  const o = { type: 'cardoor', x: 20000 }, v = speedAt(o.x);
  assert.equal(doorOpenK(o, o.x - 2 * v), 0.15, '远处关着');
  assert.ok(Math.abs(doorOpenK(o, o.x - 0.9 * v) - 1) < 1e-9, '0.9×v 全开');
  assert.equal(doorOpenK(o, o.x - 0.5 * v), 1);
  assert.ok(doorOpenK(o, o.x - 1.0 * v) > 0.15 && doorOpenK(o, o.x - 1.0 * v) < 1);
  // 两局走到同一个位置、真实时间不同：开度一样
  const a = makeRun({ seed: 1 }), b = makeRun({ seed: 1 });
  a.x = b.x = o.x - 1.02 * v; a.t = 3; b.t = 77; a.wt = 2; b.wt = 50;
  assert.equal(doorOpenK(o, a.x), doorOpenK(o, b.x));
  const s = { type: 'splash', x: 20000 }, S = TRAFFIC.splash;
  assert.equal(splashState(s, s.x - (S.warn + 0.01) * v).warn, false, '0.8×v 之前水面不闪');
  assert.equal(splashState(s, s.x - (S.warn - 0.01) * v).warn, true, '0.8×v 起水面闪白预告');
  assert.ok(Math.abs(splashState(s, s.x - S.hit * v).ahead) < 1e-9, '0.55×v 时前轮压到水坑');
  assert.ok(splashState(s, s.x - S.warn * v).ahead > 0, '预告时车还在水坑右边（对向开来）');
  assert.ok(Math.abs(splashState(s, s.x - S.warn * v).ahead - (S.warn - S.hit) * S.car) < 1e-6, '主角每跑 1 秒的路，车开 200px（远车道车流的速度）');
  assert.equal(splashState(s, s.x - (S.hit + 0.01) * v).rise, 0, '水墙在车压到之前不起');
  assert.equal(splashState(s, s.x - (S.hit - 0.13) * v).rise, 1, '主角到之前水墙已经升满');
  assert.equal(splashState(s, s.x + OBSTACLES.splash.w + 0.31 * v).fade, 0);
  // 预告一定在屏幕里：街道里任何速度下，水坑中心离主角 warn×v 时都在镜头右缘以内
  for (let x = 8000; x <= 32000; x += 500) { const vv = speedAt(x); assert.ok(S.warn * vv + 28 < lookAhead(vv) - 8, `x=${x}：预告时水坑在画面外`); }
});
