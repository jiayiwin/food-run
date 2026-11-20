// 路线快照：node tools/golden.mjs           校验（和 test/fixtures/routes.json 逐项比对）
//          node tools/golden.mjs --write   重写（路线有意改动时用，同时把 js/data/levels.js 的 COURSE_VERSION +1）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture } from './golden-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'test/fixtures/routes.json');
let cv = 1;
try { cv = (await import('../js/data/levels.js')).COURSE_VERSION; } catch (e) { /* 关卡数据化之前：版本号按 1 */ }

const now = buildFixture(cv);
if (process.argv.includes('--write')) {
  mkdirSync(dirname(FILE), { recursive: true });
  // 一项一行：diff 时一眼看出是哪个种子变了
  const block = v => (Array.isArray(v) || typeof v !== 'object' ? JSON.stringify(v)
    : `{${Object.entries(v).map(([s, x]) => `\n  ${JSON.stringify(s)}: ${JSON.stringify(x)}`).join(',')}${Object.keys(v).length ? '\n ' : ''}}`);
  writeFileSync(FILE, `{\n${Object.entries(now).map(([k, v]) => ` ${JSON.stringify(k)}: ${block(v)}`).join(',\n')}\n}\n`);
  console.log(`已写入 ${Object.keys(now.full).length} 个种子的路线、${Object.keys(now.bot).length} 局机器人结果（cv ${cv}）`);
  process.exit(0);
}
if (!existsSync(FILE)) { console.log('没有快照：先跑 node tools/golden.mjs --write'); process.exit(1); }
const fx = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
if (fx.cv !== now.cv) bad.push(`版本号：快照 ${fx.cv}，代码 ${now.cv}`);
for (const k of ['full', 'tutorial', 'bot', 'levels', 'stories']) for (const s of new Set([...Object.keys(fx[k] || {}), ...Object.keys(now[k])])) if (JSON.stringify((fx[k] || {})[s]) !== JSON.stringify(now[k][s])) bad.push(`${k} ${s}：快照 ${JSON.stringify((fx[k] || {})[s])}，现在 ${JSON.stringify(now[k][s])}`);
if (JSON.stringify(fx.windows) !== JSON.stringify(now.windows)) bad.push('读题窗口变了');
console.log(bad.length ? `不一致 ${bad.length} 项：\n${bad.slice(0, 20).join('\n')}` : `路线快照一致（cv ${now.cv}，${Object.keys(fx.full).length} 个种子 × 普通 / 新手，${Object.keys(fx.bot).length} 局机器人，${Object.keys(fx.levels || {}).length} 项关卡，${Object.keys(fx.stories || {}).length} 项家庭故事）`);
process.exit(bad.length ? 1 : 0);
