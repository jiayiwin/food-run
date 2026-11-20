import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGestures } from '../js/core/gesture.js';

function rig() {
  const log = [];
  const g = makeGestures(e => log.push(e));
  return { g, log, types: () => log.map(e => (e.type === 'swipe' ? `swipe-${e.dir}` : e.type)) };
}
const pt = (x, y, t, id = 0) => [{ id, x, y, t }];

test('按住不动 70ms 就发 press，不用等抬手；抬手再补 tap，由场景去重', () => {
  const { g, types } = rig();
  g.start(pt(100, 100, 0));
  g.tick(60);
  assert.ok(!types().includes('press'), '60ms 还不该触发');
  g.tick(75);
  assert.ok(types().includes('press'));
  g.tick(90);
  assert.equal(types().filter(t => t === 'press').length, 1, 'press 只发一次');
  g.end(pt(100, 100, 110));
  assert.deepEqual(types(), ['down', 'press', 'tap', 'up']);
});

test('手指快速点按（<70ms）：直接在抬手时发 tap，没有 press', () => {
  const { g, types } = rig();
  g.start(pt(100, 100, 0));
  g.tick(40);
  g.end(pt(100, 100, 50));
  assert.deepEqual(types(), ['down', 'tap', 'up']);
});

test('手指一直在动就不会误发 press：下滑不会先跳一下', () => {
  const { g, types } = rig();
  g.start(pt(100, 100, 0));
  g.move(pt(100, 108, 40));
  g.tick(80);
  g.move(pt(100, 120, 90));
  g.end(pt(100, 130, 120));
  assert.ok(!types().includes('press'));
  assert.ok(types().includes('swipe-down'));
});

test('滑动 18px 就触发，不等抬手', () => {
  const { g, types } = rig();
  g.start(pt(100, 100, 0));
  g.move(pt(82, 100, 30));
  assert.ok(types().includes('swipe-left'));
});

test('触摸被系统取消后不再发事件', () => {
  const { g, types } = rig();
  g.start(pt(100, 100, 0));
  g.cancel(pt(100, 100, 10));
  g.tick(200);
  assert.deepEqual(types(), ['down']);
});

test('swipe 事件带 dx、dy：数值等于触发时 / 抬手时的位移（场景按模式重新判方向）', () => {
  const { g, log } = rig();
  g.start(pt(100, 100, 0));
  g.move(pt(114, 88, 30));                       // 位移 (14, -12)：约 18.4px，过阈值，滑动时就触发
  const s = log.find(e => e.type === 'swipe');
  assert.ok(s);
  assert.equal(s.dx, 14); assert.equal(s.dy, -12);
  assert.equal(s.dir, 'right');                  // 手势层的方向照旧（|dx| > |dy|），跑酷里由 swipe.js 改判成上划

  const b = rig();
  b.g.start(pt(100, 100, 0, 1));
  b.g.end(pt(90, 89, 40, 1));                    // 没滑够 18px 的小幅快划：抬手时按方向算滑动
  const s2 = b.log.find(e => e.type === 'swipe');
  assert.ok(s2);
  assert.equal(s2.dx, -10); assert.equal(s2.dy, -11);
});
