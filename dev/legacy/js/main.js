// 启动：平台 → 存档设置 → 场景（标题 / 跑一局 / 战报）→ 循环。
import { ctx, beginFrame, onTouch, now, raf, onShow, onHide, audio, setVibrate, enableShareMenu, launchQuery, onKey, onAudioInterruption } from './platform/index.js';
import { sfx } from './platform/sfx.js';
import { makeLoop } from './core/loop.js';
import { makeGestures } from './core/gesture.js';
import { save } from './save.js';
import { titleScene } from './scenes/title.js';
import { playScene } from './scenes/play.js';
import { resultScene } from './scenes/result.js';
import { sharePayload } from './scenes/result.js';
import { loadArt } from './render/art.js';

const SCENES = { title: titleScene, play: playScene, result: resultScene };
const q = launchQuery();

const game = {
  scene: null, name: '',
  launch: q,
  go(name, opts = {}) { this.name = name; this.scene = SCENES[name](game, { ...opts, bot: q.bot ? +q.bot : 0 }); },
  applySettings() { audio.setMuted(save.settings.mute); sfx.setMuted(save.settings.mute); setVibrate(save.settings.vibrate); },
};
game.applySettings();
loadArt();   // 美术图异步加载，没加载完之前画面用代码绘制兜底

const gestures = makeGestures(e => {
  if (e.type === 'down') sfx.unlock();          // 每次按下都确认音效没被挂起（被打断后能自己恢复）
  if (game.scene && game.scene.input) game.scene.input(e);
});
onTouch({ start: p => gestures.start(p), move: p => gestures.move(p), end: p => gestures.end(p), cancel: p => gestures.cancel(p) });
onKey(key => { sfx.unlock(); if (game.scene && game.scene.input) game.scene.input({ type: 'key', key }); });
onHide(() => { if (game.scene && game.scene.onHide) game.scene.onHide(); audio.stopBgm(); });
const musicOn = () => game.name === 'play' && game.scene.wantsMusic && game.scene.wantsMusic();
onShow(res => {
  sfx.unlock();
  // 热启动：在后台时点了好友的分享卡，参数从 onShow 里来
  const nq = res.query || {};
  if (nq.seed && nq.seed !== game.launch.seed) { game.launch = { ...nq, bot: q.bot }; if (game.name !== 'play') game.go('title'); }
  if (musicOn()) audio.bgm('audio/bgm_run.mp3', 0.45);
});
onAudioInterruption({
  begin: () => { if (game.scene && game.scene.onHide) game.scene.onHide(); },
  end: () => { sfx.unlock(); if (musicOn()) audio.bgm('audio/bgm_run.mp3', 0.45); },
});
enableShareMenu(() => {
  const r = game.name === 'result' && game.scene.result;
  return r ? sharePayload(r) : { title: '下班了，我要回家吃饭！狂奔吧，打工人', query: '' };
});

// 调试入口（浏览器里加参数）：?scene=play&seed=5&bot=1&tutorial=1
if (q.scene === 'play') game.go('play', { seed: +(q.seed || 1) >>> 0, tutorial: q.tutorial === '1', daily: q.daily === '1' });
else game.go('title');

const loop = makeLoop({
  now, raf,
  update(dt) { gestures.tick(now()); if (game.scene.update) game.scene.update(dt); },
  render() { beginFrame(); game.scene.render(ctx); },
});
loop.start();
if (typeof GameGlobal !== 'undefined') GameGlobal.__game = game;   // 调试 / 截图脚本用
