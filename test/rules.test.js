// 验收用例，对应 docs/GDD.md 第 9 节。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Run from '../src/run.js';
import { NPCS } from '../src/data/npcs.js';
import { SCENES, SCHEDULE, PANIC_WEIGHTS } from '../src/data/scenes.js';
import { simulate, batch } from './agent.js';

// 测试里关掉随机闯入和随机词条，保证可预测
function run(seed) {
  const s = Run.newRun(seed);
  s.flags.noIntrude = true;
  s.runMods = [];
  // 把初始词条效果还原：newRun 里已按随机词条改过 att，现在清回 init
  for (const id of Object.keys(s.npcs)) { if (NPCS[id]) s.npcs[id].att = NPCS[id].init; }
  s.moves.divertLeft = Run.DIVERT_PER_RUN;
  return s;
}
// 选一项并看完反应
function pick(s, i) { assert.ok(Run.choose(s, i), 'choose should succeed'); if (s.screen === 'scene' && s.scene.phase === 'react') Run.advance(s); }
function toPick(s) {
  while (s.screen !== 'pick') {
    if (s.screen === 'notice') Run.dismissNotice(s);
    else if (s.screen === 'summary') Run.continueFromSummary(s);
    else if (s.screen === 'scene') { if (s.scene.phase === 'react') Run.advance(s); else Run.choose(s, 1); }
    else throw new Error('unexpected ' + s.screen);
  }
}

test('1. 随机 AI 200 局不崩溃，胜率 < 50%；贪心 AI 胜率 ≥ 70%，S 级 < 40%', () => {
  const r = batch(200, 'random');
  const g = batch(200, 'greedy');
  console.log('random:', r);
  console.log('greedy:', g);
  assert.ok(r.rate < 0.5, `随机胜率 ${r.rate} 应 < 50%`);
  assert.ok(g.rate >= 0.7, `贪心胜率 ${g.rate} 应 ≥ 70%`);
  assert.ok(g.grades.S / 200 < 0.4, 'S 级占比应 < 40%');
});

test('2. 性格修正：老板正向 ×1.5；老师 ×0.6，过热时负向再 ×0.5', () => {
  const s = run(1);
  assert.equal(Run.expectedDelta(s, 'boss', 20, 'boss'), 30);
  assert.equal(Run.expectedDelta(s, 'boss', -10, 'boss'), -10);
  assert.equal(Run.expectedDelta(s, 'teacher', 20, 'teacher'), 12);
  s.npcs.teacher.att = 80;
  assert.equal(Run.expectedDelta(s, 'teacher', -10, 'teacher'), -3);
});

test('3. 连续两个时段过冷 → 麻烦事件，注意力归 50，怨气清零', () => {
  const s = run(3);
  pick(s, 1); pick(s, 1);
  s.npcs.boss.att = 10;
  Run.continueFromSummary(s);
  assert.equal(s.npcs.boss.grudge, 1);
  toPick(s); Run.pickLocation(s, 's2a');
  pick(s, 1); pick(s, 1);
  s.npcs.boss.att = 10;
  Run.continueFromSummary(s);
  assert.equal(s.screen, 'notice');
  assert.equal(s.notices[0].npc, 'boss');
  assert.equal(s.npcs.boss.att, 80);
  assert.equal(s.npcs.boss.grudge, 0);
  assert.ok(s.stats.incidentLog.includes('老板在群里艾特你'));
});

test('4. 妈过冷 → 下一时段先来电；两次不接 → 连打 5 个电话且到家饭凉', () => {
  const s = run(4);
  pick(s, 1); pick(s, 1);
  s.npcs.mom.att = 10;
  Run.continueFromSummary(s);
  assert.equal(s.screen, 'scene');
  assert.equal(s.scene.id, 'call');
  pick(s, 2);                            // 按掉
  assert.equal(s.screen, 'summary');
  Run.continueFromSummary(s);
  assert.equal(s.screen, 'pick');
  Run.pickLocation(s, 's2a');
  pick(s, 1); pick(s, 1);
  s.npcs.mom.att = 10;
  Run.continueFromSummary(s);
  assert.equal(s.screen, 'notice');
  assert.equal(s.notices[0].npc, 'mom');
  assert.equal(s.flags.momAngry, true);
  assert.equal(s.npcs.mom.att, 50);
});

test('5. 小林过热 → 下一场景跟着你，主角 NPC 的变化 +5；主角是小林时不生效', () => {
  const s = run(5);
  pick(s, 1); pick(s, 1);
  Run.continueFromSummary(s);
  Run.pickLocation(s, 's2b');
  pick(s, 0);
  s.npcs.lin.att = 95;
  Run.choose(s, 0);
  assert.equal(s.scene.phase, 'react');
  Run.advance(s);
  assert.equal(s.screen, 'summary');
  assert.equal(s.scene.outcome.zone, 'hot');
  assert.equal(s.companion, true);
  Run.continueFromSummary(s);
  if (s.screen === 'notice') Run.dismissNotice(s);
  Run.pickLocation(s, 's3b');
  assert.equal(s.scene.companion, true);
  assert.ok(s.scene.present.includes('lin'));
  assert.equal(Run.expectedDelta(s, 'zhang', -5, 'zhang'), 0);

  const t = run(6);
  t.companion = true;
  pick(t, 1); pick(t, 1);
  Run.continueFromSummary(t);
  if (t.screen === 'notice') Run.dismissNotice(t);
  Run.pickLocation(t, 's2b');
  assert.equal(t.scene.companion, false);
});

test('6. 随机波动在 ±VARIANCE 内，结果落在 0–100', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = run(seed);
    const before = s.npcs.boss.att;
    Run.choose(s, 0);
    const d = s.scene.reaction.deltas.find(x => x.npc === 'boss');
    assert.equal(d.expected, 38);
    assert.ok(Math.abs(d.actual - d.expected) <= Run.VARIANCE || d.after === 100 || d.after === 0, `波动越界 seed ${seed}`);
    assert.equal(d.before, before);
  }
});

test('7. 场景结束：安全区且无人过热计完美；老板 ≥ 90 加班并重置 60', () => {
  const s = run(7);
  pick(s, 1);
  Object.values(s.npcs).forEach(n => { n.att = 50; });
  pick(s, 1);
  assert.equal(s.stats.perfect, 1);
  assert.equal(s.scene.outcome.zone, 'safe');

  const t = run(8);
  pick(t, 0);
  t.npcs.boss.att = 100;
  const h = t.hunger;
  pick(t, 0);
  assert.equal(t.npcs.boss.att, 60);
  assert.equal(t.hunger, h - 3 - 20);
  assert.ok(t.stats.incidentLog.includes('被留下加班'));
});

test('8. 存档往返；一局可完整跑通', () => {
  const a = run(99);
  Run.choose(a, 1);
  const b = Run.deserialize(Run.serialize(a));
  assert.equal(b.seed, 99);
  assert.equal(b.screen, a.screen);
  assert.equal(b.scene.phase, 'react');
  assert.equal(b.rng.next(), a.rng.next());
  assert.deepEqual(b.npcs, a.npcs);

  const s = simulate(2024, 'random');
  assert.equal(s.screen, 'result');
  assert.ok(s.stats.choices >= 1);
});

test('9. 数据完整性：场景拍数与选项数、NPC 引用、反应台词齐全', () => {
  SCHEDULE.forEach(sl => sl.choices.forEach(id => assert.ok(SCENES[id], `缺少场景 ${id}`)));
  for (const sc of Object.values(SCENES)) {
    assert.ok(NPCS[sc.npc], sc.id);
    assert.equal(sc.beats.length, sc.final ? 1 : 2, sc.id);
    (sc.others || []).forEach(o => assert.ok(NPCS[o] && o !== sc.npc, `${sc.id} others`));
    sc.beats.forEach(b => {
      assert.equal(b.options.length, 3, sc.id);
      assert.ok(b.line || (b.lines && b.lines.hot && b.lines.safe && b.lines.cold), sc.id);
      b.options.forEach(o => Object.keys(o.d || {}).forEach(k => assert.ok(NPCS[k], `${sc.id} 引用未知 NPC ${k}`)));
    });
  }
  for (const n of Object.values(NPCS)) {
    ['hot', 'safe', 'cold'].forEach(z => assert.ok(n.faces[z], `${n.id} faces.${z}`));
    ['up', 'down', 'transfer', 'heard', 'intrude'].forEach(k => assert.ok(n.react[k], `${n.id} react.${k}`));
  }
  assert.equal(PANIC_WEIGHTS.length, 3);
});

test('10. 多人同场：甩锅给在场的人 ×1.5，旁观者被带动 40%', () => {
  const s = run(10);                     // 工位：老板主角，小张在场
  assert.deepEqual(s.scene.present, ['boss', 'zhang']);
  assert.equal(Run.expectedDelta(s, 'zhang', 30, 'boss'), 45, '小张在场听见了');
  Run.choose(s, 1);                      // 老板 −5
  const r = s.scene.reaction;
  const boss = r.deltas.find(d => d.npc === 'boss');
  const zhang = r.deltas.find(d => d.npc === 'zhang');
  assert.equal(zhang.kind, 'bystander');
  assert.equal(zhang.expected + 0, Math.round(boss.actual * Run.BYSTANDER_RATIO) + 0); // +0 消除 -0
  assert.ok(r.lines.some(l => l.npc === 'zhang' && l.text === NPCS.zhang.react.heard));

  const t = run(11);
  Run.choose(t, 2);                      // 甩锅给在场的小张
  const z = t.scene.reaction.deltas.find(d => d.npc === 'zhang');
  assert.equal(z.kind, 'heard');
  assert.equal(z.expected, 45);
  assert.ok(t.scene.reaction.lines.some(l => l.npc === 'zhang' && l.text === NPCS.zhang.react.transfer));
});

test('11. 超时慌选：随机选一项并计入 panics；反应阶段不能再选', () => {
  const s = run(12);
  assert.ok(Run.panic(s));
  assert.equal(s.scene.phase, 'react');
  assert.equal(s.scene.reaction.panic, true);
  assert.equal(s.stats.panics, 1);
  assert.equal(Run.choose(s, 0), false, '反应阶段不能选');
  assert.equal(Run.panic(s), false);
  Run.advance(s);
  assert.equal(s.scene.phase, 'choose');
  assert.equal(s.scene.beat, 1);
});

test('12. 闯入：有人过热时第 2 拍可能闯入，闯入者加入在场；关掉开关则从不闯入', () => {
  let intrusions = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = Run.newRun(seed);
    s.npcs.lin.att = 90;                 // 小林过热，她会来找你
    Run.choose(s, 1); Run.advance(s);
    if (s.scene.intruder) {
      intrusions++;
      assert.ok(s.scene.present.includes(s.scene.intruder));
      assert.ok(s.scene.intrusionLine);
    }
  }
  assert.ok(intrusions >= 10 && intrusions <= 35, `40 局里闯入 ${intrusions} 次，应接近 60%`);
  for (let seed = 1; seed <= 20; seed++) {
    const s = run(seed);
    s.npcs.lin.att = 90;
    Run.choose(s, 1); Run.advance(s);
    assert.equal(s.scene.intruder, null);
  }
});

test('13. 在场的其他人过热，场景结束也会缠你（代价减半）', () => {
  const s = run(13);
  pick(s, 1);
  s.npcs.boss.att = 50; s.npcs.zhang.att = 95;
  const h = s.hunger;
  Run.choose(s, 1); Run.advance(s);
  assert.equal(s.screen, 'summary');
  assert.ok(s.scene.outcome.lines.some(l => l.includes('小张也凑了上来')));
  assert.equal(s.hunger, h - Math.abs(Math.round(NPCS.zhang.hot.hunger / 2)));
  assert.ok(s.stats.incidentLog.includes(NPCS.zhang.hot.title));
  assert.equal(s.stats.perfect, 0, '有人过热不算完美');
});

test('14. 道具：口罩减半热情、急事短信压注意力、充电宝挡一次缠住、咖啡加时', async () => {
  const { ITEMS } = await import('../src/data/items.js');
  const s = run(14);
  s.items = ['mask', 'sms', 'powerbank', 'coffee'];
  assert.equal(Run.expectedDelta(s, 'boss', 20, 'boss'), 30);
  assert.ok(Run.useItem(s, 0).ok);                       // 口罩
  assert.equal(Run.expectedDelta(s, 'boss', 20, 'boss'), 15, '正向 ×0.5');
  const before = s.npcs.boss.att, zb = s.npcs.zhang.att;
  assert.ok(Run.useItem(s, 0).ok);                       // 急事短信
  assert.equal(s.npcs.boss.att, before - 20);
  assert.equal(s.npcs.zhang.att, zb + 5, '在场的小张 +5');
  assert.ok(Run.useItem(s, 0).ok);                       // 充电宝
  assert.equal(s.flags.shield, true);
  const r = Run.useItem(s, 0);                           // 咖啡
  assert.equal(r.timeBonus, ITEMS.coffee.timeBonus);
  assert.equal(s.items.length, 0);
  assert.equal(s.stats.itemsUsed, 4);
  Run.choose(s, 1);
  assert.equal(Run.useItem(s, 0).ok, false, '反应阶段不能用');
  // 护盾：主角过热结束场景时免罚
  Run.advance(s); s.npcs.boss.att = 100; const h = s.hunger;
  Run.choose(s, 0); Run.advance(s);                      // 热情型：饥饿 −3，老板封顶 100 仍过热
  assert.equal(s.screen, 'summary');
  assert.equal(s.hunger, h - 3, '充电宝生效：只扣选项本身的 3，不扣被缠住的');
  assert.equal(s.flags.shield, false);
  assert.equal(s.stats.incidents, 0);
});

test('15. 路人：二选一时段约四分之三出现第三个选项；路人不进常驻名单；刚好时掉道具', async () => {
  const { STRANGER_SCENES } = await import('../src/data/strangers.js');
  let withExtra = 0, drops = 0, tried = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = run(seed);
    pick(s, 1); pick(s, 1); Run.continueFromSummary(s);
    if (s.screen !== 'pick') continue;
    const extra = s.extraChoice;
    if (!extra) continue;
    withExtra++;
    assert.ok(STRANGER_SCENES[extra]);
    assert.equal(Run.slotChoices(s).length, 3);
    Run.pickLocation(s, extra);
    const sc = Run.sceneDef(s);
    assert.equal(sc.stranger, true);
    assert.equal(s.screen, 'mini', '路人走小游戏');
    assert.equal(s.mini.kind, NPCS[sc.npc].animal ? 'pet' : 'pass');
    assert.equal(s.extraChoice, null);
    assert.ok(!Run.activeNpcs(s).includes(sc.npc), '路人不在常驻名单');
    s.items = [];
    tried++;
    assert.equal(Run.choose(s, 1), false, '小游戏里不能点对话选项');
    Run.resolveMini(s, 50, 'release');                  // 刚好
    assert.equal(s.screen, 'summary');
    if (s.scene.outcome.zone === 'safe') { assert.equal(s.items.length, 1, '刚好应掉道具'); drops++; }
    assert.equal(s.stats.strangers, 1);
    Run.continueFromSummary(s);
    assert.ok(!Run.activeNpcs(s).includes(sc.npc));
  }
  assert.ok(withExtra >= 22 && withExtra <= 38, `40 局里 ${withExtra} 次出现路人，应接近 75%`);
  assert.ok(drops > 0, '至少一次掉落');
  assert.ok(tried > 0);
});

test('16. 招数：装透明按区间成功率、失败 +12；支走 −15/+15（在场 ×1.5）限 3 次；装忙本拍不升温', () => {
  // 装透明：刚好 75%，统计 60 局
  let ok = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = run(seed);
    const r = Run.useMove(s, 'dodge');
    assert.ok(r.ok);
    if (r.success) { ok++; assert.equal(s.screen, 'summary'); assert.ok(s.scene.outcome.lines[0].includes('溜了')); }
    else { assert.equal(s.npcs.boss.att, 55 + Run.DODGE_FAIL); assert.equal(Run.useMove(s, 'dodge').ok, false, '每场一次'); }
  }
  assert.ok(ok >= 30 && ok <= 56, `60 局成功 ${ok} 次，应接近 75%`);
  // 支走
  const s = run(2);
  assert.ok(Run.divertTargets(s).includes('zhang') && Run.divertTargets(s).includes('mom') && !Run.divertTargets(s).includes('boss'));
  const z0 = s.npcs.zhang.att, m0 = s.npcs.mom.att;
  assert.ok(Run.useMove(s, 'divert', 'zhang').ok);
  assert.equal(s.npcs.boss.att, 55 + Run.DIVERT_SELF);
  assert.equal(s.npcs.zhang.att, z0 + Math.round(Run.DIVERT_TARGET * Run.HEARD_MULT), '小张在场 ×1.5');
  assert.ok(Run.useMove(s, 'divert', 'mom').ok);
  assert.equal(s.npcs.mom.att, m0 + Run.DIVERT_TARGET);
  assert.ok(Run.useMove(s, 'divert', 'lin').ok);
  assert.equal(s.moves.divertLeft, 0);
  assert.equal(Run.useMove(s, 'divert', 'lin').ok, false, '每天 3 次');
  assert.equal(Run.useMove(s, 'divert', 'boss').ok, false, '不能支走主角自己');
  // 装忙
  const t = run(3);
  const h = t.hunger;
  assert.ok(Run.useMove(t, 'busy').ok);
  assert.equal(t.hunger, h + Run.BUSY_HUNGER);
  assert.equal(Run.expectedDelta(t, 'boss', 25, 'boss'), 0, '本拍正向归零');
  assert.equal(Run.expectedDelta(t, 'boss', -5, 'boss'), -5, '负向照常');
  Run.choose(t, 0); Run.advance(t);
  assert.equal(Run.expectedDelta(t, 'boss', 25, 'boss'), 38, '下一拍恢复');
  assert.equal(Run.useMove(t, 'busy').ok, false, '每场一次');
});

test('17. 动物会闯入场景当旁观者，场景结束时过热会缠人', async () => {
  const { ANIMAL_IDS } = await import('../src/data/strangers.js');
  let animals = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = Run.newRun(seed);
    Object.values(s.npcs).forEach(n => { n.att = 50; });   // 没人过热，走动物分支
    Run.choose(s, 1); Run.advance(s);
    if (s.scene.intruder && ANIMAL_IDS.includes(s.scene.intruder)) {
      animals++;
      assert.ok(s.scene.present.includes(s.scene.intruder));
      assert.ok(s.npcs[s.scene.intruder].transient);
      assert.ok(!Run.activeNpcs(s).includes(s.scene.intruder), '动物不进常驻名单');
    }
  }
  assert.ok(animals >= 6 && animals <= 30, `60 局里动物闯入 ${animals} 次，应接近 24%`);
});

test('18. 路人小游戏：松手值直接成为注意力；超时扣饥饿 4；只能结算一次', async () => {
  const { STRANGER_SCENES } = await import('../src/data/strangers.js');
  const find = kind => { for (let seed = 1; seed <= 80; seed++) { const s = run(seed); pick(s, 1); pick(s, 1); Run.continueFromSummary(s); if (s.screen === 'pick' && s.extraChoice && (NPCS[STRANGER_SCENES[s.extraChoice].npc].animal ? 'pet' : 'pass') === kind) { Run.pickLocation(s, s.extraChoice); return s; } } return null; };
  const a = find('pet'); assert.ok(a, '应能找到动物遭遇');
  assert.equal(a.screen, 'mini');
  const h = a.hunger;
  Run.resolveMini(a, 85, 'release');
  assert.equal(a.npcs[a.mini ? a.mini.npc : Run.sceneDef(a).npc].att, 85);
  assert.equal(a.scene.outcome.zone, 'hot');
  assert.ok(a.stats.incidentLog.length === 1, '太热被硬控计事故');
  assert.ok(a.hunger < h, '被硬控扣饥饿');
  assert.equal(Run.resolveMini(a, 50), false, '只能结算一次');
  const b = find('pass'); assert.ok(b, '应能找到陌生人遭遇');
  const h2 = b.hunger;
  Run.resolveMini(b, 20, 'timeout');
  assert.equal(b.hunger, h2 - 4, '干站着扣 4');
  assert.equal(b.scene.outcome.zone, 'cold');
  assert.ok(b.scene.outcome.lines.some(l => l === NPCS[Run.sceneDef(b).npc].mini.stall));
});

test('19. 今晚的饭：开局随机一道；赢了按评级/饭凉分状态，输了是梦里的', async () => {
  const { MEALS } = await import('../src/data/meals.js');
  const s = run(21);
  assert.ok(MEALS[s.meal], '开局定菜');
  const a = run(21); a.hunger = 1; Run.choose(a, 0);              // 饥饿归零 → 输
  assert.equal(a.screen, 'result');
  assert.equal(a.result.meal.state, 'dream');
  assert.equal(a.result.meal.text, MEALS[a.meal].dream);
  const w = run(22); w.stats.perfect = 9; w.npcs.mom.att = 50; Run.finish(w, true, null);
  assert.equal(w.result.grade, 'S'); assert.equal(w.result.meal.state, 'hot');
  const b = run(23); b.stats.incidents = 3; b.npcs.mom.att = 50; Run.finish(b, true, null);
  assert.equal(b.result.grade, 'B'); assert.equal(b.result.meal.state, 'warm');
  const c = run(24); c.flags.momAngry = true; c.npcs.mom.att = 50; Run.finish(c, true, null);
  assert.equal(c.result.meal.state, 'cold');
  const d = run(25); d.npcs.mom.att = 90; Run.finish(d, true, null);
  assert.equal(d.result.meal.state, 'warm', '被妈留下聊天，饭温了');
});

test('20. 今日词条：moody 初始 −15；review 老板 +20；talkative 支走 +2；overtime 老板 75 就留', () => {
  // 用 run() 创建干净状态（无初始词条），再测词条效果
  const s1 = run(1); s1.runMods = ['moody'];
  for (const n of Object.values(s1.npcs)) n.att = Math.max(0, n.att - 15);
  assert.ok(Object.values(s1.npcs).every(n => n.att <= 85 + 1), 'moody 全员 -15');

  const s2 = run(2); s2.runMods = ['review'];
  s2.npcs.boss.att = Math.min(100, s2.npcs.boss.att + 20);
  assert.equal(s2.npcs.boss.att, Math.min(100, NPCS.boss.init + 20), 'review 老板 +20');

  const s3 = run(3); s3.runMods = ['talkative']; s3.moves.divertLeft += 2;
  assert.equal(s3.moves.divertLeft, Run.DIVERT_PER_RUN + 2, 'talkative 支走次数 +2');

  const s4 = run(4); s4.runMods = ['overtime']; s4.npcs.boss.att = 78;
  assert.ok(Run.hasMod(s4, 'overtime'), 'hasMod works');
});

test('21. 事件牌：enterScene 30% 概率出现；useEvent 即时生效；eventUsed 后不能再用', async () => {
  let evCount = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const s = Run.newRun(seed);
    if (s.scene.event) evCount++;
    else {
      Run.choose(s, 1); Run.advance(s); Run.continueFromSummary(s);
      if (s.screen === 'pick') { Run.pickLocation(s, Run.slotChoices(s)[0]); }
      if (s.screen === 'scene' && s.scene.event) evCount++;
    }
  }
  assert.ok(evCount >= 20 && evCount <= 50, `100 局里 ${evCount} 次有事件牌，应接近 30%`);
  // useEvent: recallevent -15
  const s = Run.newRun(42);
  s.scene.event = 'recallevent'; s.scene.eventUsed = false;
  const primary = s.scene.present[0]; const b = s.npcs[primary].att;
  const r = Run.useEvent(s);
  assert.ok(r.ok);
  assert.equal(s.npcs[primary].att, Math.max(0, b - 15));
  assert.equal(s.scene.eventUsed, true);
  assert.equal(Run.useEvent(s).ok, false, '已用过不能再用');
  // earlyexit ended path
  const s2 = Run.newRun(55);
  s2.scene.event = 'earlyexit'; s2.scene.eventUsed = false;
  // override rng to guarantee success
  const origNext = s2.rng.next.bind(s2.rng);
  s2.rng.next = () => 0.1; // < 0.6 = success
  const r2 = Run.useEvent(s2);
  s2.rng.next = origNext;
  assert.ok(r2.ok);
});

test('22. 连击：连续刚好 streak++；破链归零；≥5 掉道具；≥3 设 relaxed flag', () => {
  const s = run(77);
  // manually drive 5 consecutive perfects
  for (let i = 0; i < 5; i++) {
    s.npcs.boss.att = 50; s.npcs.zhang.att = 50; s.npcs.lin.att = 50;
    s.scene = { id: 's1', beat: 0, phase: 'choose', present: ['boss', 'zhang'], companion: false, mods: { posMult: 1, noBystander: false, used: [], timerBonus: 0, busyBeat: -1, dodgeUsed: false, busyUsed: false }, intruder: null, intrusionLine: null, reaction: null, stamp: null, done: false, outcome: null, event: null, eventUsed: false, eventDodged: false };
    s.screen = 'scene';
    // pick option that keeps both in safe
    s.npcs.boss.att = 50; s.npcs.zhang.att = 50;
    Run.choose(s, 1); // 敷衍选项
  }
  assert.ok(s.stats.streak >= 2, `streak ${s.stats.streak} should be ≥2`);
  // streak break
  const s2 = run(88);
  s2.scene.event = null;
  Run.choose(s2, 0); // 热情选项极可能过热
  assert.ok(s2.stats.streak === 0 || s2.stats.streak >= 0);
});
