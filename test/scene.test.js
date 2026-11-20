// 场景层（没有 DOM 的假微信环境里直接跑 play / title / hero 场景，Canvas 2D 后端画到假画布上，记下画了哪些字、放了哪首 BGM、存档写了什么）：
//   到家演出 / 失败大字卡期间暂停 → 回首页 / 重新下班也把这一局记进存档（只记一次），继续时按场景放对的音乐；
//   失败大字卡下面不留读题气泡和选项卡；饭桌背景五种家都去过也只常驻一张；字号预热表覆盖源码里所有字号；
//   选主角页从首页进来不说「之后在首页底部换主角」；好友卡的家不认识时写「到家」；暂停菜单不叫「摸鱼」；
//   便利店面板一出来就出「货架上有家里要的」，买完 / 出店撤掉；家门口站位、答题人提前知道 / 换人淡入淡出；有娃家视频手机的档位
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = {}, texts = [], music = [];
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return s => ({ width: 12 * [...String(s)].length });
    if (k === 'fillText') return s => texts.push(String(s));
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
globalThis.wx = new Proxy({
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, platform: 'ios', safeArea: { top: 44, bottom: 778 } }),
  createCanvas: () => ({ width: 300, height: 150, getContext: k => (k === '2d' ? ctx2d : null) }),
  createImage: () => ({ width: 64, height: 64 }),
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
  getLaunchOptionsSync: () => ({ query: {} }),
  // BGM 是 loop 的那一路：play / stop 记下来（最后一条就是现在在放什么）
  createInnerAudioContext: () => ({ src: '', loop: false, volume: 1, play() { if (this.loop) music.push(this.src); }, stop() { if (this.loop) music.push('stop'); }, destroy() {}, onEnded() {} }),
}, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^(on|off|show|vibrate|set)/.test(k) ? () => {} : undefined) });

const { screen } = await import('../js/platform/index.js');
const { gfx } = await import('../js/gfx/gfx.js');
const { makeCanvasBackend } = await import('../js/gfx/canvas2d.js');
gfx.use(makeCanvasBackend(wx.createCanvas()));
const { playScene } = await import('../js/scenes/play.js');
const { titleScene } = await import('../js/scenes/title.js');
const { heroScene } = await import('../js/scenes/hero.js');
const { save } = await import('../js/save.js');
const { makeBot } = await import('../js/game/bot.js');
const { layout } = await import('../js/render/world.js');
const { drawDinner, drawPause } = await import('../js/render/ui.js');
const { dinnerBgSize, doorSlots, drawDoorScene, DOOR_FADE, PHONE_TIER } = await import('../js/render/homes.js');
const { makeRun, updateRun } = await import('../js/game/run.js');
const { view } = await import('../js/render/world.js');
const { FONT_SIZES } = await import('../js/render/draw.js');
const { BGM } = await import('../js/data/tune.js');
const { say } = await import('../js/data/address.js');
const { COURSE_VERSION } = await import('../js/data/levels.js');

const L = layout(screen);
function mkGame() { const g = { went: [], launch: {}, go(name, opts) { g.went.push([name, opts]); }, applySettings() {} }; return g; }
const frame = sc => { texts.length = 0; gfx.begin(); sc.render(); gfx.end(); return texts.slice(); };
// 机器人开一局，跑到 until 成立（一步 = 1/60 秒；场景换走了就停）
function drive(sc, game, until, maxSec = 300, opts = {}) {
  const bot = makeBot({ skill: 1, choose: 'good', think: 0.9, ...opts }), n0 = game.went.length;
  for (let i = 0; i < maxSec * 60; i++) {
    if (until(sc.run)) return true;
    if (game.went.length > n0) return false;
    bot(sc.run); sc.update(1 / 60);
    if (i % 30 === 0) frame(sc);                  // 时不时画一帧（预烘焙饭桌、按钮位置都在 render 里）
  }
  return false;
}
// 暂停菜单的按钮（ui.js drawPause：260×300 居中，继续 / 重新下班 / 回到首页）
const pauseY = (L.H - 300) / 2;
const BTN = { resume: [187, pauseY + 92], restart: [187, pauseY + 146], home: [187, pauseY + 200] };
let tapId = 1;
const tap = (sc, [x, y]) => sc.input({ type: 'tap', id: tapId++, x, y, t: 0 });
const tapPause = sc => { frame(sc); tap(sc, [29, L.top + 19]); };     // HUD 左上角的暂停键
const nowMusic = () => music[music.length - 1];

test('到家演出（饭桌之前）点暂停 → 回到首页：这一局照样进存档（赢的局、关卡通关、回过的家），只记一次', () => {
  const game = mkGame(), sc = playScene(game, { seed: 7, level: 'mon' });
  assert.ok(drive(sc, game, r => r.ending && r.ending.t > 0.3));
  const runs = save.runs, wins = save.wins, clears = (save.levels.mon && save.levels.mon.clears) || 0;
  tapPause(sc);
  assert.ok(frame(sc).includes('歇口气……'), '暂停菜单');
  tap(sc, BTN.home);
  assert.deepEqual(game.went.map(w => w[0]), ['title']);
  assert.equal(save.runs, runs + 1);
  assert.equal(save.wins, wins + 1);
  assert.equal(save.levels.mon.clears, clears + 1);
  assert.ok(save.homes.includes('parents'), '回过爸妈家');
  assert.equal(store.kbdgr_save_v1.runs, runs + 1, '写进本地存档');
  tap(sc, BTN.home);                                                   // 场景已经换走：再点也不会记第二次
  assert.equal(save.runs, runs + 1);
});

test('饭桌上暂停 → 继续：放到家音乐（不是跑酷 BGM）；演完正常结算只记一次', () => {
  const game = mkGame(), sc = playScene(game, { seed: 7, level: 'mon' });
  assert.ok(drive(sc, game, r => r.ending && r.ending.t > 1.2));
  assert.equal(nowMusic(), BGM.home[0], '到家那一刻换到家音乐');
  const runs = save.runs;
  sc.input({ type: 'key', key: 'p' });                                // 饭桌上没有暂停键，键盘 / 切后台照样能暂停
  assert.equal(nowMusic(), 'stop');
  assert.equal(sc.music(), null);
  tap(sc, (frame(sc), BTN.resume));
  assert.equal(nowMusic(), BGM.home[0], '继续：接着放到家音乐');
  assert.deepEqual(sc.music(), BGM.home);
  drive(sc, game, () => false, 10);
  assert.equal(game.went[0][0], 'result');
  assert.equal(save.runs, runs + 1, '正常结算记一次');
});

test('失败大字卡期间暂停 → 回到首页 / 重新下班：输的局进存档（局数、关卡失败、连败 +1），继续时不放 BGM', () => {
  for (const btn of ['home', 'restart']) {
    const game = mkGame(), sc = playScene(game, { seed: 7, level: 'mon' });
    assert.ok(drive(sc, game, r => r.x > 3000 && !r.choice));
    sc.run.sat = 0.01;
    assert.ok(drive(sc, game, r => r.done, 5));
    assert.equal(sc.run.done.win, false);
    const runs = save.runs, wins = save.wins, L0 = save.levels.mon || {}, fails = L0.fails || 0, streak = L0.streak || 0;
    sc.update(0.5);
    tapPause(sc);
    tap(sc, (frame(sc), BTN.resume));
    assert.equal(nowMusic(), 'stop', '失败卡：继续以后也不放音乐');
    tapPause(sc);
    tap(sc, (frame(sc), BTN[btn]));
    assert.equal(game.went[0][0], btn === 'home' ? 'title' : 'play', btn);
    assert.equal(save.runs, runs + 1, btn);
    assert.equal(save.wins, wins, btn);
    assert.equal(save.levels.mon.fails, fails + 1, btn);
    assert.equal(save.levels.mon.streak, streak + 1, `${btn}：连败计数`);
  }
});

test('还在跑的时候暂停 → 回到首页 / 重新下班：不记这一局（和以前一样）；继续放跑酷 BGM', () => {
  const game = mkGame(), sc = playScene(game, { seed: 7, level: 'mon' });
  assert.ok(drive(sc, game, r => r.x > 2000 && !r.choice));
  const runs = save.runs;
  tapPause(sc);
  tap(sc, (frame(sc), BTN.resume));
  assert.equal(nowMusic(), BGM.run[0]);
  tapPause(sc);
  tap(sc, (frame(sc), BTN.home));
  assert.equal(game.went[0][0], 'title');
  assert.equal(save.runs, runs);
});

test('答题时饿晕：失败大字卡下面不画读题气泡、选项卡', () => {
  const game = mkGame(), sc = playScene(game, { seed: 7, level: 'mon' });
  assert.ok(drive(sc, game, r => r.choice && r.choice.kind === 'npc' && r.choice.phase === 'open' && r.choice.t > 0.3, 120, { think: 9 }));
  const c = sc.run.choice, strs = [say(c.line), ...c.opts.map(o => say(o.text))];
  assert.ok(strs.every(s => frame(sc).includes(s)), '饿晕之前：气泡和选项卡都在');
  sc.run.sat = 0.01;
  assert.ok(drive(sc, game, r => r.done, 3, { think: 9 }));
  assert.equal(sc.run.choice, c, '题还开着（世界停了）');
  sc.update(0.5);
  const after = frame(sc);
  assert.ok(after.includes('饿晕了'));
  for (const s of strs) assert.ok(!after.includes(s), `不该再画：${s}`);
});

test('便利店：面板一出来就出「货架上有家里要的」（进店卡的结果还没消失也出），出店就撤掉', () => {
  const game = mkGame(), sc = playScene(game, { seed: 6, level: 'wed' });
  sc.run.tips.delete('errandStore');
  assert.ok(drive(sc, game, r => !!r.shop, 300, { store: 'always', shop: 'idle' }));
  sc.update(1 / 60);
  const r = sc.run;
  assert.equal(r.choice && r.choice.kind, 'store', '进店卡的结果还在');
  assert.equal(r.hint && r.hint.key, 'errandStore', '面板一出来就显示');
  assert.ok(frame(sc).includes('货架上有家里要的'));
  for (let i = 0; i < 30; i++) sc.update(1 / 60);
  r.shop.t = 0.3;
  sc.input({ type: 'key', key: 'ArrowRight' });                       // 0.75 秒内就买了第 3 格
  assert.ok(r.shop && r.shop.closeT > 0, '买了，面板正在收');
  assert.ok(!(r.hint && r.hint.key === 'errandStore'), '买完就撤掉（不和「润喉糖 ✓」飘字叠在一起）');
  for (let i = 0; i < 60 && r.shop; i++) sc.update(1 / 60);
  assert.equal(r.shop, null);
  assert.ok(!(r.hint && r.hint.key === 'errandStore'), '出店撤掉');
  assert.ok(!r.tipQueue.some(q => q.key === 'errandStore'));
});

test('饭桌背景：五种家都去过也只常驻一张（换家时释放上一张）', () => {
  const rel = [], B = gfx.backend, orig = B.release;
  B.release = t => { rel.push(t.key); };
  try {
    const fams = ['parents', 'share', 'cat', 'kid', 'nainai', 'parents'];
    fams.forEach((id, i) => {
      gfx.begin();
      drawDinner(L, { arrivalText: '18:50', meal: { name: '红烧肉', tier: 3 }, family: { id, guests: [], dinner: '' } }, 1);
      gfx.end();
      assert.equal(dinnerBgSize(), 1, id);
      if (i) assert.ok(rel.some(k => k.startsWith(`dinner|${fams[i - 1]}|`)), `换到 ${id} 时释放 ${fams[i - 1]} 的背景`);
    });
  } finally { B.release = orig; }
});

test('字号预热表（main.js 的 fontQueue 用 FONT_SIZES）覆盖源码里所有「size: 整数」（≥6）', () => {
  const files = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'libs') walk(p); } else if (f.endsWith('.js')) files.push(p); } };
  walk(join(ROOT, 'js'));
  const used = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/size: ?(\d+)\b(?!\.)/g)) if (+m[1] >= 6) used.add(+m[1]);
  const miss = [...used].filter(s => !FONT_SIZES.includes(s)).sort((a, b) => a - b);
  assert.deepEqual(miss, [], `没预热的字号：${miss}`);
  for (const s of [8, 9, 64, 84]) assert.ok(FONT_SIZES.includes(s), s);
  assert.match(readFileSync(join(ROOT, 'js/main.js'), 'utf8'), /for \(const size of FONT_SIZES\)/);
});

test('暂停菜单的标题不叫「摸鱼」（和带薪摸鱼分开）', () => {
  texts.length = 0; gfx.begin(); drawPause(L, save.settings, []); gfx.end();
  assert.ok(texts.length && texts.every(s => !s.includes('摸鱼')), texts.join(' '));
});

test('选主角页：从首页「换主角」进来（有返回键）不再说「之后在首页底部换主角」；第一次进游戏照样说', () => {
  const tip = '之后在首页底部「换主角」随时能换';
  assert.ok(!frame(heroScene(mkGame(), { back: true })).includes(tip));
  assert.ok(frame(heroScene(mkGame(), { back: false })).includes(tip));
});

test('好友卡：好友回的家这边不认识 → 只写「到家」，下面「仅供参考」；认识的家写「回到××」', () => {
  const g = mkGame();
  g.launch = { seed: '5', t: '18:52', h: 'moon.base', cv: String(COURSE_VERSION), lv: 'full' };
  const a = frame(titleScene(g));
  assert.ok(a.includes('好友 18:52 到家 · 跑同一条路'), a.join(' | '));
  assert.ok(a.includes('好友回的家你这还没有，成绩仅供参考'));
  assert.ok(!a.some(s => s.includes('回到爸妈家')));
  g.launch = { ...g.launch, h: 'share.tissue' };
  const b = frame(titleScene(g));
  assert.ok(b.includes('好友 18:52 回到合租屋 · 跑同一条路'), b.join(' | '));
  assert.ok(!b.some(s => s.includes('仅供参考')));
});

test('家门口站位：一个人 330、两个人 330 / 352、三个人（周三奶奶来住）288 / 318 / 348，都在屏幕里、从左到右不重叠；门进了画面跟着门走，顺序不变', () => {
  const far = 900;
  assert.deepEqual(doorSlots(0, far, far), { walk: 330, frame: [] });
  assert.deepEqual(doorSlots(1, far, far), { walk: 330, frame: [352] });
  const three = doorSlots(2, far, far);
  assert.deepEqual(three, { walk: 288, frame: [318, 348] });
  for (const dsx of [far, 300, 200, 120]) {
    const p = doorSlots(2, dsx, dsx + 9), xs = [p.walk, ...p.frame];
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 29.9, `门在 ${dsx}：${xs}`);
    assert.ok(xs[xs.length - 1] <= 348, `门在 ${dsx}：最右 ${xs[xs.length - 1]}`);
  }
});

test('家门口答题人：能提前知道的（周三是奶奶）一出来就是他；不知道的（爸妈家平常日，饿着到门口是爸爸问）先站妈妈，预出题时淡入淡出换成爸爸', () => {
  const momIdx = r => r.lv.slots.findIndex(s => s.kind === 'mom');
  const before = r => r.slotIdx >= momIdx(r) && !r.pending;
  function at(opts, until, poke) {
    const run = makeRun({ seed: opts.seed, level: opts.level, story: opts.story }), bot = makeBot({ skill: 1, choose: 'good', think: 0.9 });
    for (let i = 0; i < 400 * 60 && !until(run); i++) { bot(run); updateRun(run, 1 / 60); run.fx.length = 0; if (poke) poke(run); }
    return run;
  }
  const vis = {}, draw = (run, t) => { gfx.begin(); drawDoorScene(run, view(run, L), vis, t); gfx.end(); };
  // 周三：奶奶来住，问话的是奶奶（润喉糖）：预出题前后都是她，不换人
  const wed = at({ seed: 6, level: 'wed' }, before);
  draw(wed, 1);
  assert.equal(vis.doorWho, 'nainai');
  const wed2 = at({ seed: 6, level: 'wed' }, r => r.pending && r.pending.slot.kind === 'mom');
  draw(wed2, 2);
  assert.equal(vis.doorWho, 'nainai'); assert.equal(vis.doorFade, undefined, '没换人');
  // 爸妈家平常日：饿着到门口 → 爸爸问「吃了没？」
  for (const k of Object.keys(vis)) delete vis[k];
  const hungry = r => { if (before(r) && r.sat > 20) r.sat = 20; };
  const par = at({ seed: 21, story: 'parents.normal' }, before);
  draw(par, 10);
  assert.equal(vis.doorWho, 'mom', '还不知道谁问：先站妈妈');
  const par2 = at({ seed: 21, story: 'parents.normal' }, r => r.pending && r.pending.slot.kind === 'mom', hungry);
  assert.equal(par2.pending.q.npc, 'dad');
  draw(par2, 11);
  assert.equal(vis.doorWho, 'dad');
  assert.deepEqual(vis.doorFade, { from: 'mom', t: 11 }, '换人：从妈妈淡到爸爸');
  assert.ok(DOOR_FADE >= 0.3 && DOOR_FADE <= 0.6);
});

test('有娃家饭桌：视频手机 ≥2 档就立在桌上（和饭桌一句「{老婆}在视频里笑了」同一条线），1 档没有', () => {
  assert.equal(PHONE_TIER, 2);
  const B = gfx.backend, orig = B.image, keys = [];
  B.image = (tex, ...a) => { keys.push(tex.key); return orig.call(B, tex, ...a); };
  try {
    for (const [tier, has] of [[3, true], [2, true], [1, false]]) {
      keys.length = 0;
      gfx.begin(); drawDinner(L, { arrivalText: '18:50', meal: { name: '番茄炒蛋', tier }, family: { id: 'kid', guests: [], dinner: '' } }, 1); gfx.end();
      assert.equal(keys.includes('dinner|phone'), has, `${tier} 档`);
    }
  } finally { B.image = orig; }
});
