// G1 前半的边角修补：提示条（每局最多 4 条、按优先级、和定格教学不重复、闪绿踩进 ▶▶ 才提示）、红灯前右滑有反馈、
// 长绿灯读秒一路往下数、路口窗口里不许有手写障碍、关卡记录（好友卡打通的关开着、摸鱼局不进最好成绩）、好友卡里不认识的关卡键
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subRng, SALT } from '../js/core/rng.js';
import { planCourse, checkCrossings } from '../js/game/course.js';
import { makeRun, updateRun, input, crossStopX, crossLamp, TIP_MAX, TIP_PRI } from '../js/game/run.js';
import { makeBot } from '../js/game/bot.js';
import { makeLevel, LV, FULL } from '../js/game/level.js';
import { LEVELS, levelDef, isLevelId } from '../js/data/levels.js';
import { CROSS, speedAt } from '../js/data/tune.js';
import { recordLevel, migrate, isOpen } from '../js/core/savefmt.js';
import { friendFromQuery } from '../js/game/share.js';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const step = (run, n = 1) => { for (let i = 0; i < n && !run.done; i++) { updateRun(run, 1 / 60); run.fx.length = 0; } };
// 跑一局，记下弹出来的一次性提示（fx 'tip'）和定格教学（fx 'teach'）的先后
function tipsOf(seed, runOpts, botOpts = {}) {
  const run = makeRun({ seed, seenTips: [], ...runOpts }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', ...botOpts });
  const log = [];
  while (!run.done && run.t < 600) {
    bot(run); updateRun(run, 1 / 60);
    for (const e of run.fx) if (e.type === 'tip' || e.type === 'teach') log.push({ type: e.type, key: e.key || e.kind, x: run.x });
    run.fx.length = 0;
  }
  return { run, log, tips: log.filter(e => e.type === 'tip').map(e => e.key) };
}
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

test('一次性提示每局最多 4 条（新存档、每题选错、手残）：没轮到的这局不记看过，下一局再出', () => {
  assert.equal(TIP_MAX, 4);
  assert.deepEqual(TIP_PRI.slice(0, 4), ['chase', 'dash', 'cross', 'crossRed']);
  let capped = 0;
  for (const seed of SEEDS) for (const level of ['full', 'mon', 'wed']) {
    const { run, tips } = tipsOf(seed, { level }, { choose: 'bad', skill: 0.3, think: 1.6 });
    assert.ok(tips.length <= TIP_MAX, `${level} 种子 ${seed} 出了 ${tips.length} 条：${tips}`);
    if (tips.length === TIP_MAX) capped++;
    for (const k of run.tips) assert.ok(tips.includes(k) || run.taught.size, `${k} 没显示却记成看过`);
  }
  assert.ok(capped > 0, '一局都没碰到上限：测试没测到');
});

test('排队里同时有几条：按优先级出（被追 > 冲刺 > 路口 > 违停车 > … > 记仇 > 饿了）', () => {
  const run = makeRun({ seed: 3, seenTips: [] });
  run.intro = 999;                       // 世界不动（开局卡一直在），只看提示条排队
  run.tipQueue.push({ key: 'hungry', text: '饿坏了：说真话一律放行' }, { key: 'grudge', text: '记仇的人回来了：别再用上次的借口' }, { key: 'cardoor', text: '违停车要开门：跳！' }, { key: 'chase', text: '被追了！跳过障碍甩掉追兵' });
  const order = [];
  for (let i = 0; i < 60 * 14 && run.tipQueue.length; i++) { step(run); if (run.hint && run.hint.key && order[order.length - 1] !== run.hint.key) order.push(run.hint.key); }
  assert.deepEqual(order, ['chase', 'cardoor', 'grudge', 'hungry']);
});

test('提示条不和定格教学重复：周二第一次被追只定格教冲刺、周三第一个闪绿只定格教右滑（提示条不先弹一次）', () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const tue = tipsOf(seed, { level: 'tue' });
    assert.ok(tue.run.taught.has('dash'), `周二种子 ${seed} 没教冲刺`);
    assert.ok(!tue.tips.includes('dash'), `周二种子 ${seed}：冲刺提示条又弹了一次 ${tue.tips}`);
    const wed = tipsOf(seed, { level: 'wed' });
    assert.ok(wed.run.taught.has('crossdash'), `周三种子 ${seed} 没教闪绿`);
    const ti = wed.log.findIndex(e => e.type === 'teach' && e.key === 'crossdash'), ci = wed.log.findIndex(e => e.type === 'tip' && e.key === 'cross');
    assert.ok(ci < 0 || ci > ti, `周三种子 ${seed}：闪绿提示条在定格之前弹了`);
  }
});

test('被追时停在红灯前右滑：冲不了，但灰环闪一下（dashNo，带 held）；不被追时照旧只闪灰环', () => {
  const run = makeRun({ seed: 1, xlight: 'red' });
  placeAt(run, 0, 1.2 * speedAt(10500));
  run.chaser = { npc: 'tony', gap: 90, phase: 'shake', t: 0 };
  for (let i = 0; i < 600 && !(run.cross && run.cross.phase === 'wait'); i++) step(run);
  assert.equal(run.cross.phase, 'wait');
  run.fx.length = 0;
  input(run, 'dash');
  const no = run.fx.find(e => e.type === 'dashNo');
  assert.ok(no && no.held, JSON.stringify(run.fx));
  assert.equal(run.stats.dashes, 0);
  run.chaser = null; run.fx.length = 0;
  input(run, 'dash');
  assert.ok(run.fx.some(e => e.type === 'dashNo'));
});

test('长绿灯读秒：走到停止线、走上斑马线一路往下数，不会停在 4；等完红灯起步也有读秒', () => {
  const run = makeRun({ seed: 1, xlight: 'green' });
  const c = placeAt(run, 0, 1.9 * speedAt(10500));
  const nums = [];
  while (run.crossIdx === 0 && !run.done) { step(run); const l = crossLamp(run, c); if (l && l.lit === 'green') nums.push(l.num); }
  assert.ok(nums.length > 30 && nums.every(n => typeof n === 'number'));
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i] <= nums[i - 1], '读秒只减不增');
  assert.ok(nums[0] - nums[nums.length - 1] >= 2, `从 ${nums[0]} 数到 ${nums[nums.length - 1]}`);
  assert.ok(nums[nums.length - 1] <= 4 && nums[nums.length - 1] >= 3, `走到斑马线那头还剩 ${nums[nums.length - 1]} 秒（比走过去长）`);
  // 红灯等完起步（go）：有读秒
  const red = makeRun({ seed: 1, xlight: 'red' });
  const c2 = placeAt(red, 0, 1.2 * speedAt(10500));
  for (let i = 0; i < 900 && !(red.cross && red.cross.phase === 'go'); i++) step(red);
  assert.equal(red.cross.phase, 'go');
  const l = crossLamp(red, c2);
  assert.equal(l.lit, 'green'); assert.equal(typeof l.num, 'number');
});

test('路口窗口里不许有手写障碍（关卡的 fixed / 新手局的 tutorialFixed）：checkCrossings 查得出来', () => {
  for (const id of Object.keys(LEVELS)) assert.deepEqual(checkCrossings(planCourse(subRng(1, SALT.course), { level: id, seed: 1 }), id).filter(b => /手写/.test(b.why)), [], id);
  const def = { ...LEVELS.wed, id: 't-fixedx', fixed: [{ type: 'filebox', x: LEVELS.wed.crossings[1].x - 100 }] };
  const lv = makeLevel(def);
  const bad = checkCrossings(planCourse(subRng(1, SALT.course), { level: lv, seed: 1 }), lv);
  assert.ok(bad.some(b => b.x === LEVELS.wed.crossings[1].x && /手写障碍 filebox/.test(b.why)), JSON.stringify(bad));
});

test('关卡记录：好友卡打通还锁着的关 → 开着（选关页不再显示锁）；带薪摸鱼的成绩不进最好成绩', () => {
  const s = migrate({ ver: 2, runs: 1 });
  assert.equal(isOpen(s, 'wed'), false);
  recordLevel(s, { level: 'wed', win: true, stars: [true, true, false], vsPar: -1, arrivalText: '18:47' });
  assert.equal(s.levels.wed.open, true); assert.equal(isOpen(s, 'wed'), true);
  const a = migrate({ ver: 2, runs: 1 });
  recordLevel(a, { level: 'mon', win: true, assist: true, stars: [true, true, false], vsPar: -3, arrivalText: '18:45' });
  assert.equal(a.levels.mon.best, null, '摸鱼局不写最好成绩');
  assert.equal(a.levels.mon.clears, 1);
  recordLevel(a, { level: 'mon', win: true, stars: [true, false, false], vsPar: 2, arrivalText: '18:50' });
  assert.equal(a.levels.mon.best, 2);
  const f = recordLevel(a, { level: 'mon', win: true, assist: true, stars: [true, true, false], vsPar: -5, arrivalText: '18:43' });
  assert.equal(a.levels.mon.best, 2); assert.ok(!f.bestLevel);
});

test('好友卡 / 标题页：不认识的关卡键（lv=constructor）按全程关，不会取到原型上的东西', () => {
  for (const lv of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nope']) {
    assert.equal(isLevelId(lv), false, lv); assert.equal(levelDef(lv), null, lv);
    assert.equal(friendFromQuery({ seed: '5', lv }).level, 'full', lv);
  }
  assert.equal(levelDef('full'), null); assert.equal(levelDef('mon'), LEVELS.mon);
  assert.equal(friendFromQuery({ seed: '5', lv: 'tue' }).level, 'tue');
  assert.equal(LV('constructor').id, 'full'); assert.equal(FULL.id, 'full');
  void CROSS;
});
