// 验收用例，对应 docs/GDD.md 第 12 节。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Run from '../src/run.js';
import { startBattle, playCard, endTurn, canPlay } from '../src/battle.js';
import { makeCard } from '../src/data/cards.js';
import { simulate, batch } from './agent.js';

function fresh(seed = 42) {
  const s = Run.newRun(seed);
  s.screen = 'battle';
  return s;
}
function hand(state, ...ids) {
  const b = state.battle;
  b.hand = ids.map(id => makeCard(id));
  b.energy = 99;
  return b;
}

test('1. 随机 AI 200 局不崩溃（崩溃回归；瞎点允许 0 胜）', () => {
  const r = batch(200, 'random');
  console.log('random:', r);
  assert.ok(r.rate < 0.3, '随机策略不应轻松通关');
});

test('1b. 贪心 AI 200 局胜率在 30%–90%（有难度、也可通关）', () => {
  const g = batch(200, 'greedy');
  console.log('greedy:', g);
  assert.ok(g.rate >= 0.3 && g.rate <= 0.9, `贪心胜率 ${g.rate} 应落在 30%–90%`);
});

test('2. 借口用烂了：同名第 3 次起说服减半，跨遭遇生效', () => {
  const s = fresh();
  startBattle(s, 'colleague');
  let b = hand(s, 'jiali', 'jiali');
  playCard(s, b.hand[0].uid);
  assert.equal(b.lastPlayed.persuade, 6);
  playCard(s, b.hand[0].uid);
  assert.equal(b.lastPlayed.persuade, 6);
  // 换一个遭遇
  startBattle(s, 'intern');
  b = hand(s, 'jiali');
  playCard(s, b.hand[0].uid);
  assert.equal(b.lastPlayed.persuade, 3);
  assert.equal(b.lastPlayed.worn, true);
});

test('3. 饥饿 < 20：≥2 费与绝招锁定；饥饿归零判负', () => {
  const s = fresh();
  startBattle(s, 'colleague');
  const b = hand(s, 'xianzou', 'houlianpi', 'jiali', 'weixiao');
  s.hunger = 15;
  assert.equal(canPlay(s, b, b.hand[0]).ok, false, '2 费借口应锁定');
  assert.equal(canPlay(s, b, b.hand[1]).ok, false, '绝招应锁定');
  assert.equal(canPlay(s, b, b.hand[2]).ok, true, '1 费借口可用');
  assert.equal(canPlay(s, b, b.hand[3]).ok, true, '0 费社交可用');
  s.hunger = 1;
  endTurn(s);
  assert.equal(b.over, 'lose');
});

test('4. 老板疑心 ≥ 5 触发加班；汇报进展压疑心', () => {
  const s = fresh();
  s.face = 60;
  startBattle(s, 'boss');
  let b = hand(s, 'jiali', 'jiali', 'jishi', 'weiteng', 'xianzou');
  b.stick = 999; b.stickMax = 999; // 别把老板打跑
  const five = b.hand.map(c => c.uid);
  five.forEach(uid => playCard(s, uid));
  assert.equal(b.suspicion, 5);
  const face = s.face;
  endTurn(s);
  assert.equal(s.face, face - 15, '加班应扣面子 15');
  assert.equal(b.suspicion, 0, '加班后疑心清零');
  b = hand(s, 'jiali', 'jiali', 'jiali', 'huibao');
  playCard(s, b.hand[0].uid); playCard(s, b.hand[0].uid); playCard(s, b.hand[0].uid);
  assert.equal(b.suspicion, 3);
  playCard(s, b.hand[0].uid);
  assert.equal(b.suspicion, 0);
  assert.equal(b.lastPlayed.persuade, 7);
});

test('5. 接过家人电话则家门 BOSS 跳过阶段 2；挂电话阶段 2 粘性 +10', () => {
  const s = fresh();
  s.flags.familyCalled = true;
  startBattle(s, 'home');
  let b = hand(s, 'yanji');
  assert.equal(b.phaseName, '饭还没好');
  playCard(s, b.hand[0].uid);
  assert.equal(b.phaseName, '外卖迟到了');
  assert.equal(b.phaseIdx, 2);

  const t = fresh(7);
  t.flags.familyHungUp = true;
  startBattle(t, 'home');
  b = hand(t, 'yanji');
  playCard(t, b.hand[0].uid);
  assert.equal(b.phaseName, '先把垃圾倒了');
  assert.equal(b.stick, 30);
});

test('5b. 家门 BOSS 三阶段全清即胜利', () => {
  const s = fresh();
  startBattle(s, 'home');
  const b = s.battle;
  for (let i = 0; i < 3; i++) { hand(s, 'yanji'); playCard(s, b.hand[0].uid); }
  assert.equal(b.over, 'win');
  Run.settleBattle(s);
  assert.equal(s.screen, 'result');
  assert.equal(s.result.win, true);
});

test('6. 存档往返：序列化后随机序列与状态一致', () => {
  const a = Run.newRun(99);
  const first = Run.reachable(a)[0];
  Run.enterNode(a, first.row, first.idx);
  const json = Run.serialize(a);
  const b = Run.deserialize(json);
  assert.equal(b.seed, 99);
  assert.equal(b.screen, a.screen);
  assert.equal(b.rng.next(), a.rng.next());
  assert.deepEqual(b.deck.map(c => c.uid), a.deck.map(c => c.uid));
});

test('7. 地图：每层节点连通，倒数第二层必有补给，末层为 BOSS', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = Run.newRun(seed);
    s.map.forEach(act => {
      const rows = act.rows;
      assert.equal(rows[rows.length - 1][0].type, 'boss');
      assert.ok(rows[rows.length - 2].some(n => n.type === 'rest'));
      assert.equal(rows[0].every(n => n.type === 'fight'), true);
      for (let r = 0; r < rows.length - 1; r++) {
        rows[r].forEach(n => assert.ok(n.next.length > 0));
        rows[r + 1].forEach((_, i) => assert.ok(rows[r].some(n => n.next.includes(i))));
      }
    });
  }
});

test('8. 一局可完整跑通（种子 2024，随机策略）', () => {
  const s = simulate(2024, 'random');
  assert.equal(s.screen, 'result');
  assert.ok(s.stats.nodes >= 1);
});
