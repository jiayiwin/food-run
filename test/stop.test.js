// 世界停住（便利店、电梯、等红灯）每局合计 ≤15 秒：便利店 2 家 × 3.25（不买等到超时 3 + 关门 0.25）+ 电梯 ≤4.9 + 等灯 2 次 × 1.5 = 14.4。
// 教学定格、新手第一题是玩家自己控制的，不算。电梯在 updateRoom 里自己累计，通用累计排除 run.room（不重复算）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { STORE } from '../js/data/events.js';
import { ROOM, CROSS } from '../js/data/tune.js';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const play = (seed, botOpts, runOpts = {}) => {
  const run = makeRun({ seed, ...runOpts });
  return { run, res: simulate(run, makeBot({ rng: botRng(seed), ...botOpts }), { update: updateRun }) };
};

test('预算：便利店 3 秒、电梯 ≤4.9 秒、每次等灯 ≤1.5 秒且每局最多 2 次，加起来 ≤15 秒', () => {
  assert.equal(STORE.time, 3);
  assert.ok(2 * (STORE.time + 0.25) + ROOM.max + CROSS.maxWaits * Math.max(CROSS.waitRed[1], CROSS.waitMiss) <= 15);
});

test('世界停住：每局合计 ≤15 秒；电梯 ≤4.9、每次等灯 ≤1.5、便利店 ≤3.25（两条路 × 进店买 / 不买 × 两个红灯 / 全闪绿不冲）', () => {
  for (const seed of SEEDS)
    for (const route of ['lift', 'stairs'])
      for (const shop of ['buy', 'idle'])                  // idle：进店但什么都不买，等到超时（最坏）
        for (const xlight of ['worst', 'flash']) {          // worst：两个红灯；flash + dash:false：每个路口都没冲
          const { res } = play(seed, { skill: 1, choose: 'good', route, shop, store: 'always', dash: false, close: false }, { xlight });
          const s = res.stats, tag = `种子 ${seed} ${route}/${shop}/${xlight}`;
          assert.ok(res.win, `${tag}：${res.reason}`);
          assert.ok(s.stopT <= 15, `${tag} 停了 ${s.stopT.toFixed(2)} 秒`);
          assert.ok(s.stopMax.room <= ROOM.max + 1 / 60, `${tag} 电梯 ${s.stopMax.room}`);
          assert.ok(s.stopMax.cross <= 1.5 + 1 / 60, `${tag} 等灯 ${s.stopMax.cross}`);
          assert.ok(s.stopMax.shop <= STORE.time + 0.25 + 1 / 60, `${tag} 便利店 ${s.stopMax.shop}`);
          assert.ok(s.crossWaits <= CROSS.maxWaits);
          if (route === 'stairs') assert.equal(s.stopMax.room, 0);
          if (shop === 'idle') assert.equal(s.shops, 0);
        }
});

test('世界停住：一周通勤四关也 ≤15 秒（便利店进店不买、两个红灯、不冲刺、周二两条路）；定格教学不算', () => {
  const LV_RUNS = [['prologue', [null]], ['mon', [null]], ['tue', ['lift', 'stairs']], ['wed', [null]]];
  for (const [level, routes] of LV_RUNS) for (const route of routes) for (const seed of SEEDS.slice(0, 3)) for (const shop of ['buy', 'idle']) {
    const { res } = play(seed, { skill: 1, choose: 'good', route: route || 'lift', shop, store: 'always', dash: false, close: false }, { level, xlight: level === 'wed' ? 'worst' : null });
    const s = res.stats, tag = `${level}/${route || '-'}/${shop} 种子 ${seed}`;
    assert.ok(res.win, `${tag}：${res.reason}`);
    assert.ok(s.stopT <= 15, `${tag} 停了 ${s.stopT.toFixed(2)} 秒`);
    assert.ok(s.stopMax.room <= ROOM.max + 1 / 60 && s.stopMax.cross <= 1.5 + 1 / 60 && s.stopMax.shop <= STORE.time + 0.25 + 1 / 60, tag);
    if (level === 'wed') assert.equal(s.crossWaits, CROSS.maxWaits, `${tag} 两个红灯都等了`);
  }
});

test('电梯不重复累计：轿厢里的每一帧，世界停住只加一次 dt；出门以后不再算', () => {
  for (const seed of SEEDS) {
    const run = makeRun({ seed, xlight: 'green' }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift' });
    let roomT = 0, frames = 0;
    while (!run.done && run.t < 600) {
      bot(run);
      const inRoom = !!run.room, s0 = run.stats.stopT;
      updateRun(run, 1 / 60); run.fx.length = 0;
      if (inRoom) { frames++; roomT += 1 / 60; assert.ok(Math.abs(run.stats.stopT - s0 - 1 / 60) < 1e-9, `种子 ${seed} 轿厢里一帧加了 ${run.stats.stopT - s0}`); }
    }
    assert.ok(frames > 60, `种子 ${seed} 没进电梯`);
    assert.ok(Math.abs(run.stats.stopMax.room - roomT) <= 1 / 60 + 1e-9, `种子 ${seed}：轿厢 ${run.stats.stopMax.room} vs 帧数 ${roomT}`);
  }
});

test('教学定格不算世界停住（周二教学「点一下：关门」在 F 阶段接上；房间里有 teach 时不推进、不计时）', () => {
  const run = makeRun({ seed: 1 }), bot = makeBot({ rng: botRng(1), skill: 1, choose: 'good', route: 'lift' });
  while (!run.room && run.t < 400) { bot(run); updateRun(run, 1 / 60); run.fx.length = 0; }
  assert.ok(run.room);
  run.teach = { kind: 'lift' };
  const r0 = run.room.t, s0 = run.stats.stopT, c0 = run.clock;
  for (let i = 0; i < 120; i++) { updateRun(run, 1 / 60); run.fx.length = 0; }
  assert.equal(run.room.t, r0); assert.equal(run.stats.stopT, s0); assert.equal(run.clock, c0);
});
