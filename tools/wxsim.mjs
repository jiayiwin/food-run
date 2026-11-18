// 微信环境模拟：每个文件单独转成 CommonJS（和开发者工具一样），在没有 DOM 的沙箱里启动游戏，用机器人跑完整一局。
// 沙箱里拿不到 WebGL，所以走 Canvas 2D 后端；用来抓模块加载顺序、DOM 依赖、美术文件缺失、运行时报错。
//   node tools/wxsim.mjs
import { transformSync } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [], missing = [];
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const mkCanvas = () => ({ width: 300, height: 150, getContext: t => (t === '2d' ? ctx2d : null), toTempFilePathSync: () => 'tmp.png' });
const mkImage = () => {
  const img = { width: 64, height: 64 };
  Object.defineProperty(img, 'src', { set(v) { if (!existsSync(resolve(ROOT, v))) missing.push(v); setTimeout(() => img.onload && img.onload(), 0); } });
  return img;
};
let clock = 0, rafCb = null;
const wx = new Proxy({
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, platform: 'ios', safeArea: { top: 47, bottom: 810 } }),
  createCanvas: mkCanvas, createImage: mkImage, getStorageSync: () => '', setStorageSync() {},
  getLaunchOptionsSync: () => ({ query: { scene: 'play', seed: '3', bot: '2' } }),
  createInnerAudioContext: () => ({ play() {}, stop() {}, destroy() {}, onEnded() {} }),
}, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^(on|off|show|vibrate)/.test(k) ? () => {} : undefined) });
const sandbox = {
  wx, setTimeout, clearTimeout, Promise,
  console: { log() {}, warn() {}, error: (...a) => errors.push(a.join(' ')) },
  performance: { now: () => clock },
  requestAnimationFrame: f => { rafCb = f; return 1; },
};
sandbox.GameGlobal = sandbox;
const context = vm.createContext(sandbox);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const { code } = transformSync(readFileSync(file, 'utf8'), { format: 'cjs', target: 'es2017', loader: 'js' });
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(p => load(resolve(dirname(file), p)), module, module.exports);
  return module.exports;
}
const step = () => { clock += 1000 / 60; const f = rafCb; rafCb = null; if (f) f(); };

load(resolve(ROOT, 'game.js'));
await new Promise(r => setTimeout(r, 200));                 // 等美术图「加载」完
let frames = 0;
while (frames < 30000 && sandbox.__game.name === 'play') { step(); frames++; }
for (let i = 0; i < 120; i++) step();                       // 战报页也渲染一会儿

const ok = sandbox.__game.name === 'result' && !errors.length && !missing.length;
console.log(`模块 ${cache.size} 个 · 跑了 ${frames} 帧 · 结束场景 ${sandbox.__game.name} · 报错 ${errors.length} · 缺图 ${missing.length}`);
for (const e of errors.slice(0, 5)) console.log('报错：', e.slice(0, 500));
for (const m of missing.slice(0, 10)) console.log('缺图：', relative(ROOT, resolve(ROOT, m)));
process.exit(ok ? 0 : 1);
