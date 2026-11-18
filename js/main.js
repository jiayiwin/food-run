// 启动：平台 → 存档设置 → 场景（标题 / 跑一局 / 战报）→ 循环。
import { onTouch, now, raf, onShow, onHide, audio, setVibrate, enableShareMenu, launchQuery, onKey, onAudioInterruption } from './platform/index.js';
import { initGfx, gfx } from './gfx/index.js';
import { sfx } from './platform/sfx.js';
import { makeLoop } from './core/loop.js';
import { makeGestures } from './core/gesture.js';
import { save } from './save.js';
import { titleScene } from './scenes/title.js';
import { playScene } from './scenes/play.js';
import { resultScene } from './scenes/result.js';
import { albumScene } from './scenes/album.js';
import { sharePayload, shareImage } from './scenes/result.js';
import { loadArt, ART } from './render/art.js';
import { DEBUG } from './render/world.js';
import { installDiagnostics, reportError, drawDebugHud } from './debug.js';

const SCENES = { title: titleScene, play: playScene, result: resultScene, album: albumScene };
// 游戏里用到的字号 × 粗细：开局前在标题页分帧测好字体度量
const fontQueue = [];
for (const size of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 34, 38, 40, 44, 50, 56]) for (const w of [700, 400]) fontQueue.push([size, w]);
const q = launchQuery();
installDiagnostics(q);
DEBUG.hitbox = q.hitbox === '1';
initGfx(q.gfx === 'canvas' ? 'canvas' : 'webgl');   // WebGL 优先，失败自动退回 Canvas 2D

const game = {
  scene: null, name: '',
  launch: q,
  go(name, opts = {}) { this.name = name; this.scene = SCENES[name](game, { ...opts, bot: q.bot ? +q.bot : 0 }); syncMusic(); },
  applySettings() { audio.setMuted(save.settings.mute); sfx.setMuted(save.settings.mute); setVibrate(save.settings.vibrate); },
};
game.applySettings();
loadArt();   // 美术图异步加载，没加载完之前画面用代码绘制兜底

// 场景决定放哪首：music() 返回 [文件, 音量]，返回空就静音
function syncMusic() {
  const m = game.scene && game.scene.music ? game.scene.music() : null;
  if (m) audio.bgm(m[0], m[1]); else audio.stopBgm();
}
let kicked = false;
const gestures = makeGestures(e => {
  if (e.type === 'down') {
    sfx.unlock();                               // 每次按下都确认音效没被挂起（被打断后能自己恢复）
    if (!kicked) { kicked = true; audio.kick(); }
  }
  if (game.scene && game.scene.input) game.scene.input(e);
});
onTouch({ start: p => gestures.start(p), move: p => gestures.move(p), end: p => gestures.end(p), cancel: p => gestures.cancel(p) });
onKey(key => { sfx.unlock(); if (game.scene && game.scene.input) game.scene.input({ type: 'key', key }); });
onHide(() => { if (game.scene && game.scene.onHide) game.scene.onHide(); audio.stopBgm(); });
onShow(res => {
  sfx.unlock();
  // 热启动：在后台时点了好友的分享卡，参数从 onShow 里来
  const nq = res.query || {};
  if (nq.seed && nq.seed !== game.launch.seed) { game.launch = { ...nq, bot: q.bot }; if (game.name !== 'play') game.go('title'); }
  syncMusic();
});
onAudioInterruption({
  begin: () => { if (game.scene && game.scene.onHide) game.scene.onHide(); },
  end: () => { sfx.unlock(); audio.stopBgm(); syncMusic(); },   // 被打断时系统已暂停播放：先复位再重新放
});
enableShareMenu(() => {
  const r = game.name === 'result' && game.scene.result;
  return r ? sharePayload(r, shareImage(r)) : { title: '下班了，我要回家吃饭！狂奔吧，打工人', query: '' };
});

// 调试入口（浏览器里加参数）：?scene=play&seed=5&bot=1&tutorial=1
if (q.scene === 'play') game.go('play', { seed: +(q.seed || 1) >>> 0, tutorial: q.tutorial === '1', daily: q.daily === '1' });
else game.go('title');

const loop = makeLoop({
  now, raf, onError: reportError,
  update(dt) { gestures.tick(now()); if (game.scene.update) game.scene.update(dt); },
  render() {
    for (let i = 0; i < 2 && ART.uploadQueue.length; i++) gfx.preload(ART.uploadQueue.shift());   // 美术图分帧预上传显存
    for (let i = 0; i < 3 && fontQueue.length; i++) gfx.warmFont(...fontQueue.shift());           // 字号分帧预热
    gfx.begin(); game.scene.render(); gfx.bars(); drawDebugHud(); gfx.end();
  },   // bars：宽屏两侧黑边盖住溢出的画面
});
loop.start();
if (typeof GameGlobal !== 'undefined') GameGlobal.__game = game;   // 调试 / 截图脚本用
