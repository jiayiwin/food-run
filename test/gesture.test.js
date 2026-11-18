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
