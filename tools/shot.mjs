// 无头 Chrome 截图 / 自动操作：在精确的手机视口里打开浏览器调试页，按脚本发触摸和按键，按时间点截图。
//   node tools/shot.mjs <输出目录> [--w 390 --h 844 --dpr 2 --notch] [--url /dev/?seed=1] [--script steps.json]
// steps.json：[{ "wait": 1000 }, { "key": "ArrowUp" }, { "swipe": "left" }, { "swipe": [28, -24] }, { "tap": [200, 600] }, { "shot": "名字" }, { "eval": "js" }]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, extname, normalize } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = resolve(argv[0] || 'tmp-shots');
const W = +opt('w', 390), H = +opt('h', 844), DPR = +opt('dpr', 2);
const notch = argv.includes('--notch');
const steps = opt('script') ? JSON.parse(readFileSync(opt('script'), 'utf8')) : [{ wait: 1500 }, { shot: 'screen' }];
mkdirSync(out, { recursive: true });

// 静态服务器（随机端口）
const root = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(root, p)); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    await stat(f); res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const dir = mkdtempSync(join(tmpdir(), 'kb-chrome-'));
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', d => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('chrome 启动超时')), 30000); });
const ws = new WebSocket(wsUrl);
await new Promise(r => { ws.onopen = r; });
let id = 1; const pending = new Map(); const logs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description).join(' ')); else if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = id++; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Runtime.enable'); await S('Page.enable');
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
const url = opt('url', '/dev/');
await S('Page.navigate', { url: `${origin}${url}${url.includes('?') ? '&' : '?'}w=${W}&h=${H}&dpr=${DPR}${notch ? '&notch=1' : ''}` });
await new Promise(r => setTimeout(r, 1200));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function touch(type, x, y) { await S('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }); }
async function swipe(dir, x = W / 2, y = H * 0.65) {
  // dir：'left' / 'right' / 'up' / 'down'（每步 20px），或 [dx, dy] 总位移（斜划，分 4 步走完）
  const d = Array.isArray(dir) ? [dir[0] / 80, dir[1] / 80] : { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  await touch('touchStart', x, y);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', x + d[0] * 20 * i, y + d[1] * 20 * i); await sleep(16); }
  await touch('touchEnd', x, y);
}
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.key) { await S('Input.dispatchKeyEvent', { type: 'keyDown', key: s.key, code: s.key }); await sleep(30); await S('Input.dispatchKeyEvent', { type: 'keyUp', key: s.key, code: s.key }); }
  if (s.tap) { await touch('touchStart', s.tap[0], s.tap[1]); await sleep(60); await touch('touchEnd', s.tap[0], s.tap[1]); }
  if (s.hold) { await touch('touchStart', s.hold[0], s.hold[1]); await sleep(s.hold[2] || 600); await touch('touchEnd', s.hold[0], s.hold[1]); }
  if (s.swipe) await swipe(s.swipe);
  if (s.eval) { const r = await S('Runtime.evaluate', { expression: s.eval, returnByValue: true, awaitPromise: true }); logs.push(`[eval] ${JSON.stringify(r.result?.value)}`); }
  if (s.shot) { const r = await S('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${s.shot}.png`), Buffer.from(r.data, 'base64')); console.log(join(out, `${s.shot}.png`)); }
}
if (logs.length) console.log(logs.join('\n'));
try { await send('Browser.close'); } catch { /* ignore */ }
server.close();
setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } process.exit(0); }, 800);
