import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('微信环境模拟：无 DOM、CommonJS 加载，机器人跑完整局不报错、不缺图', () => {
  const r = spawnSync(process.execPath, ['tools/wxsim.mjs'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
