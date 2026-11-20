// 写字楼电梯 / 楼梯：路线卡（左楼梯 = 超时默认、右电梯）、两条路开局都排好选哪条装哪条、汇合点之后路线完全一样（题目可能不同）；
// 轿厢是世界停住的房间（≤4.9 秒，到点一定出来），里面只有左右选和关门键；被追时冲进门 = 门夹住追兵；电梯里答错不碎饭盒
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subRng, SALT } from '../js/core/rng.js';
import { planCourse, checkBranch, checkSpacing, installBranch, branchSpan, slotWindow, courseBlocks } from '../js/game/course.js';
import { makeRun, updateRun, input } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { judge } from '../js/game/choice.js';
import { FULL } from '../js/game/level.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { ROUTE, LIFT } from '../js/data/events.js';
import { COURSE_VERSION, LEVELS } from '../js/data/levels.js';
import { ROOM, CHASE, speedAt } from '../js/data/tune.js';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const play = (seed, botOpts, runOpts = {}) => {
  const run = makeRun({ seed, ...runOpts });
  return { run, res: simulate(run, makeBot({ rng: botRng(seed), ...botOpts }), { update: updateRun }) };
};
const BR = LEVELS.full.branch;
const plan = seed => planCourse(subRng(seed, SALT.course), { level: FULL, seed });
const STOPS = ['npc', 'takeout', 'empty'];
// 一帧一帧跑，bot 为 null 时什么都不操作
function stepUntil(run, bot, cond, maxT = 400) {
  while (!run.done && run.t < maxT && !cond(run)) { if (bot) bot(run); updateRun(run, 1 / 60); run.fx.length = 0; }
  return run;
}
const seedWith = kind => [...SEEDS, ...Array.from({ length: 40 }, (_, i) => 100 + i)].find(s => plan(s).branch.beats.some(b => b.kind === kind));

test('电梯数据：全程关 6050 路线卡、6880 电梯门、6920–7700 楼梯间（跑速 ×0.75），路线版本 ≥5（6：家庭剧本的拾取物空地）', () => {
  assert.ok(COURSE_VERSION >= 5);
  assert.deepEqual([BR.card, BR.door, BR.exit], [6050, 6880, 7700]);
  assert.equal(FULL.stageAt(7700).id, 'street', '大门（7700）以后是街道');
  assert.ok(LEVELS.full.slots.some(s => s.x === BR.card && s.kind === 'route' && s.branch === 'lift'));
  assert.ok(!LEVELS.full.slots.some(s => s.x === 5600), '5600 的同事槽换成了路线卡');
  const st = FULL.stageAt(7500);
  assert.equal(st.id, 'stairs'); assert.equal(st.slowK, 0.75); assert.equal(st.gate, false); assert.equal(FULL.themeAt(7500), 'office');
  assert.deepEqual(OBSTACLES.mop, { name: '拖把水桶', w: 34, ground: 34, avoid: 'jump', stages: ['stairs'] });
  assert.ok(OBSTACLES.filebox.stages.includes('stairs') && OBSTACLES.wetsign.stages.includes('stairs'));
});

test('规划：8 个种子 + 200 个种子，停层节拍 ≤4.9 秒；分支区里没有槽、没有路口、没有主路线的障碍；楼梯间只出 stairs 池', () => {
  for (const seed of SEEDS) {
    const c = plan(seed);
    assert.deepEqual(checkBranch(c, FULL), [], `种子 ${seed}`);
    const b = c.branch;
    assert.ok(b.liftT <= ROOM.max + 1e-9 && b.stops >= 1 && b.stops <= 2);
    assert.equal(b.beats[0].kind, 'close'); assert.equal(b.beats[b.beats.length - 1].kind, 'open');
    assert.ok(b.segs.stairs.obstacles.length >= 1, `种子 ${seed} 楼梯间一个障碍都没有`);
    // 门前区、楼梯间、大门后 1 秒路程：主路线一个障碍、一个零钱都没有
    const [a, z] = branchSpan(b);
    assert.equal(c.obstacles.filter(o => o.x + OBSTACLES[o.type].w > a && o.x < z).length, 0);
    assert.equal(c.pickups.filter(k => k.x > a && k.x < z).length, 0);
  }
  const kinds = {};
  for (let seed = 1; seed <= 200; seed++) {
    const b = plan(seed).branch;
    assert.ok(b.liftT <= ROOM.max + 1e-9, `种子 ${seed} 电梯 ${b.liftT}`);
    for (const x of b.beats) if (STOPS.includes(x.kind)) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
    const fl = b.beats.filter(x => STOPS.includes(x.kind)).map(x => x.floor);
    assert.ok(fl.every((f, i) => f >= 2 && f < ROOM.floor0 && (i === 0 || f < fl[i - 1])), `种子 ${seed} 停层 ${fl}`);
  }
  for (const k of STOPS) assert.ok(kinds[k] > 10, `三种停层都会出现：${JSON.stringify(kinds)}`);
  // 路线卡的窗口在门前区之前结束，读题窗口里没障碍
  const w = slotWindow(LEVELS.full.slots.find(s => s.kind === 'route'));
  assert.ok(w[1] < BR.door - ROOM.zone * speedAt(BR.door));
});

test('两条路开局都排好、选哪条装哪条：汇合点（大门）之后、电梯门之前两条路完全一样；楼梯路装上楼梯间，电梯路门后什么都没有', () => {
  const key = arr => JSON.stringify(arr.map(o => [o.type || o.kind, Math.round(o.x * 100), o.y != null ? Math.round(o.y) : 0]));
  for (const seed of SEEDS) {
    const L = plan(seed), S = plan(seed);
    assert.ok(installBranch(L, 'lift')); assert.ok(installBranch(S, 'stairs'));
    assert.equal(installBranch(S, 'lift'), false, '只装一次');
    const after = c => c.obstacles.filter(o => o.x >= BR.exit), before = c => c.obstacles.filter(o => o.x < BR.door);
    assert.equal(key(after(L)), key(after(S)), `种子 ${seed} 大门之后不一样`);
    assert.equal(key(before(L)), key(before(S)), `种子 ${seed} 电梯门之前不一样`);
    assert.equal(key(L.pickups.filter(k => k.x >= BR.exit)), key(S.pickups.filter(k => k.x >= BR.exit)));
    const mid = c => c.obstacles.filter(o => o.x >= BR.door && o.x < BR.exit);
    assert.equal(mid(L).length, 0);
    assert.equal(key(mid(S)), key(S.branch.segs.stairs.obstacles));
    assert.ok(mid(S).every(o => OBSTACLES[o.type].stages.includes('stairs') && FULL.stageAt(o.x).id === 'stairs'));
    // 装上以后整条路照样满足间距表、窗口里没障碍，id 不重复
    assert.deepEqual(checkSpacing(S.obstacles), [], `种子 ${seed} 楼梯路间距`);
    assert.equal(new Set(S.obstacles.map(o => o.id)).size, S.obstacles.length);
    for (const [a, b] of courseBlocks(FULL).slice(0, -1)) assert.equal(S.obstacles.filter(o => o.x + OBSTACLES[o.type].w > a && o.x < b).length, 0);
    // 门前 ▶▶ 区：只有选了电梯才打开
    assert.equal(L.zones.find(z => z.kind === 'lift').off, false);
    assert.equal(S.zones.find(z => z.kind === 'lift').off, true);
  }
});

test('两条路 × 8 个种子 × 完美机器人：0 碰撞、0 被抓、到家；电梯一局在轿厢里最多 4.9 秒；走了哪条路写进 flags', () => {
  for (const route of ['lift', 'stairs']) for (const seed of SEEDS) {
    const { run, res } = play(seed, { skill: 1, choose: 'good', route });
    assert.ok(res && res.win, `${route} 种子 ${seed}：${res && res.reason} x=${Math.round(run.x)}`);
    assert.equal(res.stats.hits, 0, `${route} 种子 ${seed} 撞了 ${res.stats.hits} 次`);
    assert.equal(res.stats.caught, 0);
    assert.equal(res.route, route); assert.equal(run.stats.route, route);
    assert.equal(!!run.flags.tookLift, route === 'lift'); assert.equal(!!run.flags.tookStairs, route === 'stairs');
    if (route === 'lift') {
      assert.ok(res.stats.stopMax.room > 1 && res.stats.stopMax.room <= ROOM.max + 1 / 60, `轿厢 ${res.stats.stopMax.room}`);
      assert.equal(run.course.obstacles.filter(o => o.x >= BR.door && o.x < BR.exit).length, 0);
    } else {
      assert.equal(res.stats.stopMax.room, 0);
      const seg = run.course.branch.segs.stairs.obstacles;
      assert.equal(run.course.obstacles.filter(o => o.branch === 'stairs' && o.done && !o.hit).length, seg.length, '楼梯间的障碍都跳过去了');
    }
  }
  // 每题选错、从不冲刺的完美机器人，两条路都一定甩得掉（电梯里答错：出门被追；下一个人迎上来时让开）
  for (const route of ['lift', 'stairs']) for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'bad', dash: false, route });
    assert.ok(res && res.win, `${route} 种子 ${seed} 选错：${res && res.reason}`);
    assert.equal(res.stats.caught, 0, `${route} 种子 ${seed} 被抓`);
  }
});

test('房间超时也能出来：轿厢里什么都不做（不答题、不关门），4.9 秒内一定出门，照常到家', () => {
  for (const seed of SEEDS) {
    const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift' });
    stepUntil(run, bot, r => !!r.room);
    assert.ok(run.room, `种子 ${seed} 没进电梯`);
    const t0 = run.t;
    stepUntil(run, null, r => !r.room, t0 + 10);
    assert.equal(run.room, null);
    assert.ok(run.t - t0 <= ROOM.max + 1 / 60 + 1e-9, `种子 ${seed} 在轿厢里 ${(run.t - t0).toFixed(3)} 秒`);
    assert.equal(run.x, BR.exit + 4);
    assert.equal(run.boxes, 3, '电梯里超时不碎饭盒');
    stepUntil(run, bot, r => !!r.done);
    assert.ok(run.done && run.done.win, `种子 ${seed}：${run.done && run.done.reason}`);
  }
});

test('电梯里答错：不碎饭盒，出门后那位同事照常追（gap0）；追兵已经跟进来时答错不叠加', () => {
  const seed = seedWith('npc');
  assert.ok(seed, '找不到停层有同事的种子');
  for (const chased of [false, true]) {
    const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift', dash: false });
    stepUntil(run, bot, r => r.x > BR.door - 1.2 * speedAt(BR.door));
    if (chased) run.chaser = { npc: 'lili', gap: 50, phase: 'shake', t: 0 };
    stepUntil(run, bot, r => !!r.room);
    assert.ok(run.room);
    assert.equal(run.room.chaserIn, chased);
    const gapIn = chased ? run.chaser.gap : null;
    stepUntil(run, null, r => !r.room || (r.choice && r.choice.room && r.choice.phase === 'open' && r.choice.t > 0.2), run.t + 6);
    const c = run.choice;
    assert.ok(c && c.room && c.kind === 'npc', '电梯里没出题');
    const wrong = c.opts.findIndex(o => judge(o, { money: run.money, sat: run.sat, used: run.used, flags: run.flags }).good === false);
    input(run, 'card', wrong >= 0 ? wrong : 0);
    assert.equal(run.chaser ? run.chaser.npc : null, chased ? 'lili' : null, '电梯里不追');
    assert.equal(run.boxes, 3);
    stepUntil(run, null, r => !r.room, run.t + 6);
    assert.equal(run.boxes, 3, '电梯里答错不碎饭盒');
    if (wrong < 0) continue;
    if (!chased) { assert.equal(run.chaser.npc, c.npc); assert.equal(run.chaser.gap, CHASE.gap0); assert.equal(run.chaser.phase, 'slow'); }
    else { assert.equal(run.chaser.npc, 'lili', '跟进来的追兵接着追，不换人'); assert.equal(run.chaser.gap, gapIn, '出门时距离和进门时一样'); }
    assert.equal(run.stats.caught, 0);
  }
});

test('门夹追兵：被追时在门前 ▶▶ 区冲刺 → 当场甩掉（+200、flags.doorShut）；不冲刺 → 追兵跟进来，出门接着追', () => {
  for (const seed of SEEDS.slice(0, 4)) {
    for (const dash of [true, false]) {
      const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift', dash });
      stepUntil(run, bot, r => r.x > BR.door - 1.3 * speedAt(BR.door));
      run.chaser = { npc: 'laoliu', gap: 40, phase: 'shake', t: 0 };
      const score0 = run.score;
      stepUntil(run, bot, r => !!r.room);
      assert.ok(run.room, `种子 ${seed} 没进电梯`);
      if (dash) {
        assert.equal(run.stats.doorShut, 1, `种子 ${seed} 冲刺进门没夹住`);
        assert.equal(run.chaser, null); assert.equal(run.flags.doorShut, true); assert.equal(run.room.shut, true);
        assert.ok(run.score - score0 >= ROOM.shutScore);
      } else {
        assert.equal(run.stats.doorShut, 0); assert.equal(run.room.chaserIn, true);
        const g = run.chaser.gap, t = run.chaser.t;
        stepUntil(run, null, r => !r.room, run.t + 6);
        assert.ok(run.chaser && run.chaser.npc === 'laoliu');
        assert.equal(run.chaser.gap, g); assert.equal(run.chaser.t, t);
      }
      stepUntil(run, bot, r => !!r.done);
      assert.ok(run.done.win); assert.equal(run.stats.caught, 0);
    }
  }
});

test('同一个人不出现两次：被门夹在外面的、跟进轿厢的追兵，不会再从下一层走进来出题（周二老刘 16 个种子；全程关塞一个追兵）', () => {
  // 周二：老刘 4700 冲出来追、门前甩不掉；冲刺 = 门夹住，不冲 = 跟进来。停层同事那一拍照样有人进来出题（阿杰或莉莉）
  for (let seed = 1; seed <= 16; seed++) for (const dash of [true, false]) for (const choose of ['good', 'bad']) {
    const run = makeRun({ seed, level: 'tue', learned: ['dash', 'lift'] }), bot = makeBot({ rng: botRng(seed), skill: 1, choose, route: 'lift', dash });
    stepUntil(run, bot, r => !!r.room, 200);
    const tag = `周二 种子 ${seed} ${dash ? '冲刺' : '不冲'} ${choose}`;
    assert.ok(run.room && run.room.chaser === 'laoliu', `${tag}：老刘没追到电梯门前`);
    assert.equal(run.room.shut, dash, tag); assert.equal(run.room.chaserIn, !dash, tag);
    const nb = run.room.beats.find(b => b.kind === 'npc');
    assert.ok(nb && nb.npc && nb.npc !== 'laoliu', `${tag}：停层进来的是 ${nb && nb.npc}`);
    let asked = null;
    while (run.room) { bot(run); updateRun(run, 1 / 60); if (run.choice && run.choice.room) asked = run.choice.npc; run.fx.length = 0; }
    assert.ok(asked && asked !== 'laoliu', `${tag}：电梯里出题的是 ${asked}`);
  }
  // 全程关：门前被谁追，停层进来的就不是谁（挑停层有同事的种子）
  const npcSeeds = [...SEEDS, ...Array.from({ length: 40 }, (_, i) => 100 + i)].filter(s => plan(s).branch.beats.some(b => b.kind === 'npc')).slice(0, 4);
  assert.equal(npcSeeds.length, 4);
  for (const seed of npcSeeds) for (const npc of ['laoliu', 'ajie', 'lili']) for (const dash of [true, false]) {
    const run = makeRun({ seed, route: 'lift' }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift', dash });
    stepUntil(run, bot, r => r.x > BR.door - 1.3 * speedAt(BR.door));
    run.chaser = { npc, gap: 40, phase: 'shake', t: 0 };
    stepUntil(run, bot, r => !!r.room);
    assert.ok(run.room && run.room.chaser === npc);
    const nb = run.room.beats.find(b => b.kind === 'npc');
    assert.ok(nb && nb.npc && nb.npc !== npc, `全程关 种子 ${seed} 追兵 ${npc}：停层进来的是 ${nb && nb.npc}`);
  }
});

test('关门键：外卖那一拍 0.7 秒内点一下 100% 有效（+50），省下这一拍；没点只是小哥进来，没有惩罚', () => {
  const seed = seedWith('takeout');
  for (const close of [true, false]) {
    const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift', close });
    stepUntil(run, bot, r => r.room && r.room.beats[r.room.bi].kind === 'takeout' && r.room.btn);
    const b = run.room.beats[run.room.bi], score0 = run.score, t0 = run.t;
    assert.equal(run.room.btn, true);
    stepUntil(run, bot, r => !r.room || r.room.beats[r.room.bi] !== b);
    const used = run.t - t0;
    if (close) { assert.equal(b.closed, true); assert.equal(run.stats.liftClose, 1); assert.ok(run.score - score0 >= ROOM.closeScore); assert.ok(used < ROOM.takeout - 0.1, `关门后这一拍还走了 ${used}`); }
    else { assert.ok(!b.closed); assert.equal(b.inside, true); assert.ok(Math.abs(used - ROOM.takeout) < 0.05); assert.equal(run.score, score0); }
    assert.equal(run.boxes, 3);
  }
  // 关门键只在外卖那一拍有用：别的时候点了什么都不做
  const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift' });
  stepUntil(run, bot, r => !!r.room);
  const s0 = run.score;
  input(run, 'close'); input(run, 'jump');
  assert.equal(run.stats.liftClose, 0); assert.equal(run.score, s0);
});

test('轿厢里只有左右选和点按钮：跳、滑铲、冲刺都没有；世界停住，时钟照常按真实时间走', () => {
  const run = makeRun({ seed: 3 }), bot = makeBot({ rng: botRng(3), skill: 1, choose: 'good', route: 'lift' });
  stepUntil(run, bot, r => !!r.room);
  const x = run.x, c0 = run.clock, wt = run.wt;
  for (const a of ['jump', 'slide', 'dash', 'right', 'left']) input(run, a);
  const p = run.player;
  assert.equal(p.y, 0); assert.equal(p.state, 'run'); assert.equal(p.dashT, 0);
  for (let i = 0; i < 30 && run.room; i++) { updateRun(run, 1 / 60); run.fx.length = 0; }
  assert.equal(run.x, x, '轿厢里不往前跑'); assert.equal(run.wt, wt, '世界时间不走');
  assert.ok(Math.abs(run.clock - c0 - 0.5 * run.lv.clockRate) < 1e-6, '时钟按真实时间走（不另加分钟）');
});

test('路线卡：左楼梯、右电梯，不随种子换边；小字写停几层；超时 = 走楼梯；进门按主角位置（被拖慢也在门洞中心进）', () => {
  for (const seed of SEEDS) {
    const run = makeRun({ seed }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'none' });
    stepUntil(run, bot, r => r.choice && r.choice.kind === 'route');
    const c = run.choice;
    assert.deepEqual(c.opts.map(o => o.route), ['stairs', 'lift']);
    assert.equal(c.opts[1].note, `预计停 ${run.course.branch.stops} 层`);
    assert.equal(c.T, 2.5);
    stepUntil(run, bot, r => !r.choice || r.choice.phase !== 'open');
    assert.equal(run.route, 'stairs', `种子 ${seed} 超时没走楼梯`);
    assert.equal(run.stats.timeouts, 1, '只有路线卡超时');
  }
  // 进门的位置和时间无关：一局在门前被拖慢（×0.6，3 秒），照样在 door 进轿厢
  for (const slow of [false, true]) {
    const run = makeRun({ seed: 2 }), bot = makeBot({ rng: botRng(2), skill: 1, choose: 'good', route: 'lift' });
    stepUntil(run, bot, r => r.x > BR.door - 600);
    if (slow) run.mods.push({ k: 0.6, t: 3 });
    let xIn = null;
    stepUntil(run, bot, r => { if (r.room && xIn == null) xIn = r.x; return !!r.room; });
    assert.equal(xIn, BR.door);
  }
});

test('直接被放到电梯门后面（测试 / 调试）：这一段不算，不装楼梯间、不进电梯', () => {
  const run = makeRun({ seed: 5 });
  const n = run.course.obstacles.length;
  run.intro = 0; run.wt = 30; run.x = BR.door + 300; run.slotIdx = run.lv.slots.findIndex(s => s.x > run.x); run.stage = run.lv.stageAt(run.x);
  for (let i = 0; i < 5; i++) { updateRun(run, 1 / 60); run.fx.length = 0; }
  assert.equal(run.course.branch.used, true); assert.equal(run.route, null); assert.equal(run.room, null);
  assert.equal(run.course.obstacles.length, n);
});

test('平衡：8 个种子完美机器人，两条路到家时刻的中位数差 ≤1.5 分钟；楼梯慢一点、电梯有题有停层', () => {
  const med = arr => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
  const arr = { lift: [], stairs: [] };
  for (const route of ['lift', 'stairs']) for (const seed of SEEDS) arr[route].push(play(seed, { skill: 1, choose: 'good', route }).res.arrival);
  const d = med(arr.stairs) - med(arr.lift);
  assert.ok(Math.abs(d) <= 1.5, `楼梯 − 电梯 = ${d.toFixed(2)} 分钟`);
});

test('文案：路线卡台词 ≤14 字、选项 ≤8 字、小字 ≤8 字；电梯里的台词 ≤14 字', () => {
  const R = ROUTE.lift;
  assert.ok([...R.line].length <= 14);
  for (const o of R.opts) { assert.ok([...o.text].length <= 8, o.text); assert.ok([...o.note.replace('N', '2')].length <= 8, o.note); }
  for (const s of Object.values(R.react)) assert.ok([...s].length <= 14, s);
  for (const s of [LIFT.xiaoge.hi, LIFT.xiaoge.thanks, LIFT.xiaoge.out, LIFT.empty, LIFT.key, '门夹住王阿姨了！+200', '出了电梯再算账！']) assert.ok([...s].length <= 14, s);
});
