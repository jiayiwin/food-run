// 启动：平台 → 存档设置 → 场景（标题 / 跑一局 / 战报）→ 循环。
import { onTouch, now, raf, onShow, onHide, audio, setVibrate, enableShareMenu, launchQuery, onKey, onAudioInterruption } from './platform/index.js';
import { initGfx, gfx } from './gfx/index.js';
import { sfx } from './platform/sfx.js';
import { makeLoop } from './core/loop.js';
import { makeGestures } from './core/gesture.js';
import { save, debugSave } from './save.js';
import { titleScene } from './scenes/title.js';
import { playScene } from './scenes/play.js';
import { resultScene } from './scenes/result.js';
import { albumScene } from './scenes/album.js';
import { levelsScene } from './scenes/levels.js';
import { heroScene } from './scenes/hero.js';
import { setHero } from './render/looks.js';
import { storyOf } from './game/story.js';
import { sharePayload, shareImage } from './scenes/result.js';
import { loadArt, ART } from './render/art.js';
import { DEBUG } from './render/world.js';
import { installDiagnostics, reportError, drawDebugHud } from './debug.js';
import { FONT_SIZES } from './render/draw.js';

const SCENES = { title: titleScene, play: playScene, result: resultScene, album: albumScene, levels: levelsScene, hero: heroScene };
// 游戏里用到的字号 × 粗细：开局前在标题页分帧测好字体度量（字号表在 render/draw.js 的 FONT_SIZES）
const fontQueue = [];
for (const size of FONT_SIZES) for (const w of [700, 400]) fontQueue.push([size, w]);
const q = launchQuery();
installDiagnostics(q);
debugSave(q.save);                                  // 调试：?save=new 新玩家 / ?save=old v1 老玩家（只在内存里）
DEBUG.hitbox = q.hitbox === '1';
// 主角：存档里选过的那位；调试 ?gender=m|f 只在内存里换（不写存档、不弹选主角页）
const debugG = q.gender === 'm' || q.gender === 'f' ? q.gender : null;
setHero(debugG || save.gender || 'm');
initGfx(q.gfx === 'canvas' ? 'canvas' : 'webgl');   // WebGL 优先，失败自动退回 Canvas 2D

const game = {
  scene: null, name: '',
  launch: q,
  go(name, opts = {}) { audio.duck(1); this.name = name; this.scene = SCENES[name](game, { ...opts, bot: q.bot ? +q.bot : 0 }); syncMusic(); },   // 换场景：电梯里压低的 BGM 先恢复
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
  // 种子、关卡、家任何一个不同，都算一张新的好友卡
  const same = nq.seed === game.launch.seed && (nq.lv || 'full') === (game.launch.lv || 'full') && (nq.h || '') === (game.launch.h || '');
  if (nq.seed && !same) { game.launch = { ...nq, bot: q.bot }; if (game.name !== 'play' && game.name !== 'hero') game.go('title'); }   // 选主角页上不打断：选完去标题页就能看到好友卡
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

// 调试入口（浏览器里加参数）：?scene=play&seed=5&bot=1&tutorial=1&level=full|prologue|mon|tue|wed&xlight=red|green|flash|worst（覆盖路口灯态）
//   &gender=m|f：这次用哪位主角（只在内存里）；?scene=hero 选主角页
//   &route=lift|stairs：路线卡机器人选哪条（缺省电梯），人玩时是超时默认走哪条；&assist=1：带薪摸鱼（只在关卡里有）
//   &story=cat.catfood：家庭剧本的故事（'家庭.故事'，关卡里以关卡写死的为准）
//   ?scene=levels 选关页、?scene=title 标题页（存档还没选过主角时照样先到选主角页，和正常启动一样；加 &gender=m|f 直接到标题页）；&save=new|old 当成新玩家 / 老玩家
if (q.scene === 'play') game.go('play', { seed: +(q.seed || 1) >>> 0, level: q.level || 'full', tutorial: q.tutorial === '1', daily: q.daily === '1', xlight: q.xlight || null, route: q.route === 'lift' || q.route === 'stairs' ? q.route : null, assist: q.assist === '1', story: storyOf(q.story) ? q.story : null });
else if (q.scene === 'levels') game.go('levels');
else if (q.scene === 'hero') game.go('hero', { back: !!save.gender });
else if (!save.gender && !debugG) game.go('hero');        // 新玩家第一次进游戏、老存档还没选过主角：先选主角（选完去标题页，好友卡照样在标题页）
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
