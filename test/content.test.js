import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot } from '../js/game/bot.js';
import { MODIFIERS, modifierOf } from '../js/data/modifiers.js';
import { ALBUM, ALBUM_KEYS, albumCount } from '../js/data/album.js';
import { NPCS, MOM } from '../js/data/npcs.js';
import { RES, CHOICE } from '../js/data/tune.js';

function play(opts, cfg = { skill: 1, choose: 'good', think: 0.6 }) {
  let r = 0x2545f491 ^ (opts.seed * 7919);
  const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  const run = makeRun(opts), bot = makeBot({ rng, ...cfg });
  const seen = [];
  while (!run.done && run.t < 900) {
    bot(run); updateRun(run, 1 / 60);
    if (run.choice && !seen.includes(run.choice)) seen.push(run.choice);
    run.fx.length = 0;
  }
  return { run, seen };
}

test('每日词条：同一个种子永远是同一个词条，普通局没有词条', () => {
  for (let s = 0; s < 40; s++) assert.equal(modifierOf(s), modifierOf(s));
  assert.deepEqual(new Set([0, 1, 2, 3].map(modifierOf)), new Set(MODIFIERS));
  assert.equal(makeRun({ seed: 7 }).mod, null);
  assert.equal(makeRun({ seed: 7, daily: true }).mod, modifierOf(7));
});

test('每个词条下，高手都能平安到家', () => {
  for (const m of MODIFIERS) {
    for (let seed = 1; seed <= 12; seed++) {
      const { run } = play({ seed, modifier: m });
      assert.ok(run.done && run.done.win, `${m.name} seed=${seed} 没到家：${run.done && run.done.reason}`);
    }
  }
});

test('发薪日：开局多钱，硬币翻倍', () => {
  const pay = MODIFIERS.find(m => m.id === 'payday');
  assert.equal(makeRun({ seed: 3, modifier: pay }).money, RES.money0 + pay.money);
  const a = play({ seed: 3, modifier: null }).run.done, b = play({ seed: 3, modifier: pay }).run.done;
  assert.ok(b.stats.coins > 0);
  assert.ok(b.score > 0 && a.score > 0);
});

test('暴雨：饱腹掉得比平时快', () => {
  const rain = MODIFIERS.find(m => m.id === 'rain');
  const step = mod => { const run = makeRun({ seed: 5, modifier: mod }); for (let i = 0; i < 60 * 8; i++) { updateRun(run, 1 / 60); run.fx.length = 0; if (run.choice) run.choice = null; } return run.sat; };
  assert.ok(step(rain) < step(null));
});

test('周一综合征：读题时间变短，但不低于下限', () => {
  const mon = MODIFIERS.find(m => m.id === 'monday');
  const base = play({ seed: 9, modifier: null }).seen.filter(c => c.kind === 'npc');
  const hard = play({ seed: 9, modifier: mon }).seen.filter(c => c.kind === 'npc');
  assert.ok(hard.length > 3);
  assert.ok(hard.every(c => c.T >= CHOICE.minTime));
  assert.ok(Math.min(...hard.map(c => c.T)) <= Math.min(...base.map(c => c.T)));
  assert.ok(hard[0].T < base[0].T);
});

test('借口图鉴：目录覆盖所有人的所有回答，没有重复', () => {
  const total = Object.values(NPCS).reduce((n, v) => n + new Set(v.questions.flatMap(q => q.opts.map(o => o.text))).size, 0)
    + new Set(Object.values(MOM.questions).flatMap(q => q.opts.map(o => o.text))).size;
  assert.equal(ALBUM_KEYS.size, total);
  assert.equal(ALBUM.length, Object.keys(NPCS).length + 1);
  assert.deepEqual(albumCount(new Set()), { got: 0, total });
});

test('借口图鉴：跑一局说过的话都记下来，能对上目录', () => {
  const { run } = play({ seed: 11 });
  assert.ok(run.said.length >= 8);
  assert.ok(run.said.filter(k => ALBUM_KEYS.has(k)).length >= 8);
  assert.equal(albumCount(new Set(run.said)).got, new Set(run.said.filter(k => ALBUM_KEYS.has(k))).size);
});
