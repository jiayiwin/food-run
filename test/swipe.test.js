import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySwipe, swipeMode, noteSwipe, SWIPE } from '../js/core/swipe.js';
import { CHOICE } from '../js/data/tune.js';
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot } from '../js/game/bot.js';

test('斜划：跑酷时横向要明显（> 竖直 1.4 倍）才算左右，答题时仍按原规则', () => {
  assert.equal(classifySwipe({ dx: 14, dy: -12 }, 'run'), 'up');         // 斜 40° 往上：跳，不丢这一跳
  assert.equal(classifySwipe({ dx: 14, dy: -12 }, 'answer'), 'right');   // 同一下在答题时 = 选右边
  assert.equal(classifySwipe({ dx: 20, dy: -10 }, 'run'), 'right');      // 2.0 > 1.4：明显的横划
  assert.equal(classifySwipe({ dx: -20, dy: -15 }, 'run'), 'up');        // 1.33 < 1.4
  assert.equal(classifySwipe({ dx: -20, dy: -15 }, 'answer'), 'left');
  assert.equal(classifySwipe({ dx: 14, dy: 12 }, 'pre'), 'down');        // 快弹题时和跑酷同一个规则：斜下划 = 滑铲
  assert.equal(classifySwipe({ dx: 14, dy: 12 }, 'shop'), 'right');      // 便利店里左右是选货，按原规则
  for (const m of ['run', 'pre', 'answer', 'shop', 'room']) assert.equal(classifySwipe({ dx: 0, dy: 18 }, m), 'down');
  assert.equal(SWIPE.runRatio, 1.4);
});

test('滑动模式：答题 / 快弹题或刚选完 / 跑酷 / 便利店', () => {
  const base = { x: 1000, v: 300, choice: null, pending: null, shop: null };
  assert.equal(swipeMode(base), 'run');
  assert.equal(swipeMode({ ...base, choice: { phase: 'open' } }), 'answer');
  assert.equal(swipeMode({ ...base, choice: { phase: 'result', rt: 0.1 } }), 'pre');
  assert.equal(swipeMode({ ...base, choice: { phase: 'result', rt: CHOICE.dashGuard } }), 'run');
  // NPC 已经站在画面里、但离弹题还远：仍按跑酷算；离弹题不到 0.6 秒路程才归答题
  assert.equal(swipeMode({ ...base, pending: { slot: { x: 1000 + 300 * 1.2 } } }), 'run');
  assert.equal(swipeMode({ ...base, pending: { slot: { x: 1000 + 300 * 0.5 } } }), 'pre');
  assert.equal(swipeMode({ ...base, shop: {} }), 'shop');
  assert.equal(swipeMode({ ...base, shop: {}, choice: { phase: 'open' } }), 'shop');
});

test('滑动埋点：按模式计数，跑酷横划后 0.5 秒内撞上记一次误划；不影响这一局怎么跑', () => {
  const run = makeRun({ seed: 7 });
  noteSwipe(run, 'run', 'right');                              // 开局卡（intro）里的滑动不算
  assert.deepEqual({ ...run.stats.swipe }, { run: 0, runH: 0, pre: 0, answer: 0, misfire: 0 });
  run.intro = 0;
  noteSwipe(run, 'run', 'up');
  noteSwipe(run, 'run', 'right');
  noteSwipe(run, 'pre', 'left');
  noteSwipe(run, 'answer', 'left');
  noteSwipe(run, 'shop', 'left');
  const s = run.stats.swipe;
  assert.deepEqual({ ...s }, { run: 2, runH: 1, pre: 1, answer: 1, misfire: 0 });
  assert.equal(run.lastHSwipe, run.t);
  // 教学定格、到家过场、结束以后的滑动也不算
  const before = JSON.stringify(run.stats.swipe);
  for (const st of [{ teach: { kind: 'jump' } }, { ending: { t: 0, total: 3.4 } }, { done: { win: true } }]) { const r2 = Object.assign(Object.create(null), run, st); noteSwipe(r2, 'run', 'right'); }
  assert.equal(JSON.stringify(run.stats.swipe), before);

  // 两局同种子同操作：一局里不停地记横划，结果（到家时刻、碰撞、分数）完全一样
  const play = noisy => {
    let r = 0x2545f491; const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const run = makeRun({ seed: 7 }), bot = makeBot({ rng, skill: 0.6, choose: 'smart', think: 1.3 });
    let k = 0;
    while (!run.done && run.t < 900) { bot(run); if (noisy && k++ % 30 === 0) noteSwipe(run, 'run', 'right'); updateRun(run, 1 / 60); run.fx.length = 0; }
    return run;
  };
  const a = play(false), b = play(true);
  assert.equal(a.done.arrival, b.done.arrival);
  assert.equal(a.done.score, b.done.score);
  assert.equal(a.stats.hits, b.stats.hits);
  assert.ok(b.stats.swipe.misfire <= b.stats.hits);
  assert.ok(b.stats.hits === 0 || b.stats.swipe.misfire > 0, '撞的时候刚横划过，应该记成误划');
});
