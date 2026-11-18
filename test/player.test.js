import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, jump, swipeDown, stepPlayer, hitbox } from '../js/game/player.js';
import { TUNE } from '../js/data/tune.js';

const DT = 1 / 60;
test('固定跳高约 108px，滞空约 0.56s', () => {
  const p = makePlayer();
  jump(p);
  let t = 0, peak = 0, air = 0;
  while (t < 2) { stepPlayer(p, DT, 300); t += DT; peak = Math.min(peak, p.y); if (!p.onGround) air += DT; if (p.onGround && t > 0.05) break; }
  assert.ok(-peak > 104 && -peak < 112, `跳高 ${(-peak).toFixed(1)}px`);
  assert.ok(air > 0.52 && air < 0.6, `滞空 ${air.toFixed(2)}s`);
});

test('滑铲 0.55 秒后自动站起；滑铲时判定框变矮', () => {
  const p = makePlayer();
  swipeDown(p);
  assert.equal(p.state, 'slide');
  for (let i = 0; i < 6; i++) stepPlayer(p, DT, 300);         // 过了 0.06s 的进入段
  assert.ok(hitbox(p).y1 - hitbox(p).y0 < 30, `滑铲判定高 ${hitbox(p).y1 - hitbox(p).y0}`);
  let t = 6 * DT; while (p.state === 'slide' && t < 2) { stepPlayer(p, DT, 300); t += DT; }
  assert.ok(Math.abs(t - TUNE.slideTime) < 0.05, `滑了 ${t.toFixed(2)}s`);
});

test('空中下滑急降，落地自动接滑铲；落地前按的跳在落地瞬间执行', () => {
  const p = makePlayer();
  jump(p);
  for (let i = 0; i < 12; i++) stepPlayer(p, DT, 300);
  swipeDown(p);
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) { stepPlayer(p, DT, 300); landed = p.onGround; }
  assert.ok(landed); assert.equal(p.state, 'slide');

  const q = makePlayer();
  jump(q);
  while (!(q.vy > 0 && q.y > -10)) stepPlayer(q, DT, 300);   // 快落地了
  jump(q);                                                       // 提前按跳：进缓冲
  let jumpedAgain = false;
  for (let i = 0; i < 20; i++) { stepPlayer(q, DT, 300); if (q.events.includes('jump')) jumpedAgain = true; }
  assert.ok(jumpedAgain, '缓冲的跳没有执行');
});

test('走出台阶边缘后 0.08 秒内还能起跳（土狼时间）', () => {
  const p = makePlayer();
  p.y = -34; p.ground = -34;
  stepPlayer(p, DT, 300, { supportTop: -34 });
  stepPlayer(p, DT, 300, { supportTop: 0 });       // 走出边缘
  assert.equal(p.onGround, false);
  stepPlayer(p, DT, 300, { supportTop: 0 });
  jump(p);
  assert.equal(p.state, 'jump'); assert.ok(p.vy < 0);
});
