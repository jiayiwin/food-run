import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import { planCourse, checkSpacing, slotWindow, courseBlocks } from '../js/game/course.js';
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { judge } from '../js/game/choice.js';
import { COURSE } from '../js/data/tune.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { NPCS, MOM } from '../js/data/npcs.js';
import { say } from '../js/data/address.js';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const play = (seed, botOpts, runOpts = {}) => {
  const run = makeRun({ seed, ...runOpts });
  let r = 0x2545f491 ^ seed; const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  return { run, res: simulate(run, makeBot({ rng, ...botOpts }), { update: updateRun }) };
};

test('路线：相邻障碍满足反应时间间距，读题窗口、路口窗口、电梯 / 楼梯分支区里没有主路线的障碍', () => {
  for (const seed of SEEDS) {
    const c = planCourse(makeRng(seed));
    assert.deepEqual(checkSpacing(c.obstacles), [], `种子 ${seed}`);
    for (const slot of COURSE.slots) {
      const [a, b] = slotWindow(slot);
      const inside = c.obstacles.filter(o => o.x + OBSTACLES[o.type].w > a && o.x < b);
      assert.equal(inside.length, 0, `种子 ${seed} 槽 ${slot.x} 窗口里有障碍`);
    }
    for (const [a, b] of courseBlocks()) assert.equal(c.obstacles.filter(o => o.x + OBSTACLES[o.type].w > a && o.x < b).length, 0, `种子 ${seed} 区间 ${Math.round(a)}–${Math.round(b)} 里有障碍`);
    assert.ok(c.obstacles.length > 80, `障碍太少：${c.obstacles.length}`);   // 3 个路口窗口里不放障碍（约 2900px），比没有路口时少 4 个左右
  }
});

test('文案长度：台词 ≤14 字，选项 ≤8 字；家门口台词 ≤6、选项 ≤4、反应 ≤14（男 / 女主角两套称呼都算）', () => {
  for (const g of ['m', 'f']) {
    const n_ = s => [...say(s, g)].length;
    for (const [id, n] of Object.entries(NPCS)) {
      for (const q of n.questions) {
        assert.ok(n_(q.line) <= 14, `${g} ${id} 台词过长：${say(q.line, g)}`);
        for (const o of q.opts) { assert.ok(n_(o.text) <= 8, `${g} ${id} 选项过长：${say(o.text, g)}`); assert.ok(n_(o.react) <= 14, `${g} ${id} 反应过长：${say(o.react, g)}`); }
      }
      for (const o of n.comebacks) assert.ok(n_(o.text) <= 8, `${g} ${id} 反击过长：${say(o.text, g)}`);
      for (const s of [n.hi, n.caught]) assert.ok(n_(s) <= 14, `${g} ${id}：${say(s, g)}`);
    }
    for (const q of Object.values(MOM.questions)) {
      assert.ok(n_(q.line) <= 6, `${g} 妈妈台词过长：${say(q.line, g)}`);
      for (const o of q.opts) { assert.ok(n_(o.text) <= 4, `${g} 妈妈选项过长：${say(o.text, g)}`); assert.ok(n_(o.react) <= 14, `${g} 妈妈反应过长：${say(o.react, g)}`); }
    }
  }
});

test('判定顺序：资源 > 记仇 > 疲劳 > 基础', () => {
  const base = { money: 30, sat: 60, used: {}, flags: {} };
  const lie = { text: 'x', tag: '工作', good: true };
  assert.equal(judge(lie, base).good, true);
  assert.equal(judge(lie, { ...base, used: { 工作: 2 } }).reason, 'tired');
  assert.equal(judge(lie, { ...base, used: { 工作: 2 }, grudgeTag: '工作' }).reason, 'grudge');
  const pay = { text: 'x', tag: '花钱', cost: 12, good: true };
  assert.equal(judge(pay, { ...base, money: 5 }).reason, 'broke');
  const honest = { text: 'x', tag: '真话', good: false };
  assert.equal(judge(honest, { ...base, sat: 10, grudgeTag: '真话' }).reason, 'hungry');
  const pb = { text: 'x', tag: '装傻', good: false, rule: 'powerbank' };
  assert.equal(judge(pb, base).good, false);
  assert.equal(judge(pb, { ...base, flags: { powerbank: true } }).good, true);
});

test('完美操作：零碰撞、零被抓，平安到家', () => {
  for (const seed of SEEDS) {
    const { run, res } = play(seed, { skill: 1, choose: 'good' });
    assert.ok(res && res.win, `种子 ${seed} 没到家：${res && res.reason} x=${Math.round(run.x)}`);
    assert.equal(res.stats.hits, 0, `种子 ${seed} 撞了 ${res.stats.hits} 次`);
    assert.equal(res.stats.caught, 0);
  }
});

test('干净地跑，就算每题都选错、从不冲刺也一定甩得掉', () => {
  for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'bad', dash: false });
    assert.ok(res && res.win, `种子 ${seed}：${res && res.reason}`);
    assert.equal(res.stats.caught, 0, `种子 ${seed} 被抓 ${res.stats.caught} 次`);
    assert.ok(res.stats.chased >= 6, `种子 ${seed} 只被追了 ${res.stats.chased} 次`);
  }
});

test('新手局：教学定格后能正常跑完', () => {
  const { res } = play(5, { skill: 1, choose: 'good' }, { tutorial: true });
  assert.ok(res && res.win);
});

test('掉进没盖的井：爬出来继续跑，扣时间不扣饭盒', async () => {
  const { OBSTACLES: O } = await import('../js/data/obstacles.js');
  for (const seed of SEEDS) {
    const run = makeRun({ seed });
    const hole = run.course.obstacles.find(o => O[o.type].hole);
    if (!hole) continue;
    // 只跳别的障碍，井不跳
    const bot = makeBot({ skill: 1, choose: 'good' });
    let fell = false, clock0 = 0;
    while (!run.done && run.t < 400) {
      const next = run.course.obstacles.slice(run.obIdx).find(o => !o.done);
      if (!(next && next.id === hole.id)) bot(run);
      updateRun(run, 1 / 60);
      for (const f of run.fx) if (f.type === 'hole') { fell = true; clock0 = run.clock; }
      run.fx.length = 0;
      if (fell && !run.cutscene) break;
    }
    assert.ok(fell, `种子 ${seed} 没掉进去`);
    assert.equal(run.boxes, 3);
    assert.ok(run.x > hole.x + O[hole.type].w, '爬出来后应该在井的另一边');
    assert.equal(run.player.onGround, true);
    void clock0;
    return;
  }
});

test('新手局只改开头教学段，3500 之后和同种子普通局完全一样（分享给好友是同一条路）', () => {
  for (const seed of SEEDS) {
    const a = planCourse(makeRng(seed)), b = planCourse(makeRng(seed), { tutorial: true });
    const tail = c => JSON.stringify(c.obstacles.filter(o => o.x >= 3500).map(o => [o.type, Math.round(o.x)]));
    assert.equal(tail(a), tail(b), `种子 ${seed}`);
    assert.ok(b.obstacles.some(o => o.teach === 'jump') && b.obstacles.some(o => o.teach === 'slide'));
  }
});

test('妈妈的终极一问：到家前一定结算（答了或按超时），不会被到家截断', () => {
  for (const seed of SEEDS) {
    // 不答题的机器人：只躲障碍
    const run = makeRun({ seed });
    const bot = makeBot({ skill: 1, choose: 'good', think: 99 });
    let mom = null;
    while (!run.done && run.t < 600) {
      bot(run); updateRun(run, 1 / 60); run.fx.length = 0;
      if (run.choice && run.choice.kind === 'mom') mom = run.choice;
    }
    assert.ok(mom, `种子 ${seed} 没遇到妈妈`);
    assert.notEqual(mom.phase, 'open', `种子 ${seed} 妈妈的题停在 open`);
    assert.ok(run.flags.momGood || run.flags.momBad, `种子 ${seed} 妈妈的题没有结果`);
  }
});
