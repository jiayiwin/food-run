// 发布前回归：整体走查里抓到的问题，修好后在这里守住
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRun, updateRun, clockMin } from '../js/game/run.js';
import { makeBot } from '../js/game/bot.js';
import { choiceShown } from '../js/game/choice.js';
import { etaMin } from '../js/game/story.js';
import { migrate, recordLevel, mainTarget, isOpen, fullOpen } from '../js/core/savefmt.js';
import { LEVEL_ORDER } from '../js/data/levels.js';

// 跑一局，每帧调 onStep(run)；返回结果
function drive(run, bot, onStep, maxT = 400) {
  for (let i = 0; i < maxT * 60 && !run.done; i++) { bot(run); updateRun(run, 1 / 60); onStep(run); }
  return run.done;
}

test('便利店：选了「进店」以后「进店」卡不再画（面板就是反馈，出店后也不冒出来）；「路过」照常显示反馈', () => {
  let underAll = 0, passedAll = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    // 每家都进、什么都不买：面板开着的每一帧（「进店」的结果卡还要留 0.75 秒）、出店后，选择卡都不画
    let inShop = 0, under = 0;
    const r = makeRun({ seed });
    drive(r, makeBot({ skill: 1, choose: 'good', store: 'always', shop: 'idle' }), run => {
      const c = run.choice;
      if (run.shop) { inShop++; if (c) under++; assert.ok(!choiceShown(c), `seed ${seed}: 面板下面不压「进店」卡`); }
      else if (c && c.kind === 'store' && c.phase === 'result') assert.ok(!choiceShown(c), `seed ${seed}: 出店后「进店」卡不再冒出来`);
    });
    assert.ok(inShop > 0, `seed ${seed}: 进过店`);
    // 路过：结果卡（「咽了下口水」）照常画
    let passed = 0;
    const r2 = makeRun({ seed });
    drive(r2, makeBot({ skill: 1, choose: 'good' }), run => {
      const c = run.choice;
      if (c && c.kind === 'store' && c.phase === 'result' && c.picked === 1) { passed++; assert.ok(choiceShown(c)); }
      if (c && c.phase === 'open') assert.ok(choiceShown(c), '读题时一定画');
    });
    underAll += under; passedAll += passed;
  }
  assert.ok(underAll > 0, '面板刚弹出时「进店」的结果卡还在（以前会画在面板下面）'); assert.ok(passedAll > 0, '路过也测到了');
  assert.equal(choiceShown(null), false);
});

test('HUD「18:56 前到家」便签按 40px 缓存剩下路程：etaMin 对时钟是线性的（缓存的剩余分钟 + 当前时钟 = 每帧重算）', () => {
  const r = makeRun({ seed: 3 });
  const bot = makeBot({ skill: 1, choose: 'good' });
  let n = 0;
  drive(r, bot, run => {
    if (run.ending || ++n % 97) return;
    const c = clockMin(run);
    assert.ok(Math.abs(etaMin(run, c) - (c + etaMin(run, 0))) < 1e-9);
    // 主角跑 40px 里剩下路程最多差多少：街道最慢 240px/s、时钟 ×15 → 40 / 240 × 15 / 60 ≈ 0.042 分钟
    const k = run.lv.clockRate / 60, x = run.x;
    run.x = x + 40; const a = etaMin(run, 0); run.x = x;
    assert.ok(etaMin(run, 0) - a < 40 / 240 * k + 1e-6);
  });
});

test('全新存档一路打到自由下班：「下班！」依次去序章 → 周一 → 周二 → 周三 → 自由下班，打完周一解锁自由下班；老存档（runs > 0、没选主角）全开、主角待选', () => {
  const s = migrate(null);
  assert.equal(s.gender, null);
  const seen = [];
  for (const id of LEVEL_ORDER) {
    assert.equal(mainTarget(s), id); assert.ok(isOpen(s, id), id);
    seen.push(id);
    recordLevel(s, { level: id, win: true, stars: [true, true, true], vsPar: -1, arrivalText: '18:47' }, []);
    if (id === 'prologue') assert.ok(!fullOpen(s), '序章打完还没解锁自由下班');
    if (id === 'mon') assert.ok(fullOpen(s), '打完周一解锁自由下班');
  }
  assert.deepEqual(seen, LEVEL_ORDER);
  assert.equal(mainTarget(s), 'full');
  const old = migrate({ runs: 12, wins: 9, tutorialDone: true, tips: ['chase'], album: [], settings: { mute: false, vibrate: true } });
  assert.equal(old.gender, null, '老存档没有 gender：一进游戏先到选主角页');
  assert.equal(old.legacy, true); assert.equal(mainTarget(old), 'full');
  for (const id of LEVEL_ORDER) assert.ok(isOpen(old, id), id);
  assert.ok(fullOpen(old));
});
