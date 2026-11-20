// 平台层：把用到的 wx.* 收拢到这里，游戏其余部分不直接碰 wx。
// 微信小游戏里 wx 是全局对象；浏览器调试时由 dev/wx-shim.js 提供同名接口。
/* global wx */

const sys = wx.getSystemInfoSync();

// 逻辑分辨率：宽固定 375，高按屏幕比例算。所有游戏坐标都在这个空间里。
// 比 375×667 更「矮胖」的屏幕（iPad、展开的折叠屏）：高度固定 667，按高度缩放，左右留黑边居中。
export const DESIGN_W = 375, MIN_H = 667;
const wide = sys.windowHeight / sys.windowWidth < MIN_H / DESIGN_W;
const SCALE = wide ? sys.windowHeight / MIN_H : sys.windowWidth / DESIGN_W;
export const screen = {
  width: sys.windowWidth,
  height: sys.windowHeight,
  dpr: Math.min(3, sys.pixelRatio || 2),
  scale: SCALE,                             // 逻辑像素 → 屏幕 CSS 像素
  offsetX: wide ? (sys.windowWidth - DESIGN_W * SCALE) / 2 : 0,   // 左右黑边（CSS 像素）
  W: DESIGN_W,
  H: wide ? MIN_H : Math.round(DESIGN_W * sys.windowHeight / sys.windowWidth),
  // 安全区（逻辑像素）：刘海屏顶部要让出来
  safeTop: Math.round(((sys.safeArea && sys.safeArea.top) || 0) / SCALE),
  safeBottom: Math.round((sys.windowHeight - ((sys.safeArea && sys.safeArea.bottom) || sys.windowHeight)) / SCALE),
  platform: sys.platform || 'unknown',
};

// 主画布：第一次 createCanvas 拿到的就是上屏画布。上下文由 js/gfx 决定（WebGL 优先，失败退回 2D），这里不要先拿。
export const canvas = wx.createCanvas();
canvas.width = Math.round(screen.width * screen.dpr);
canvas.height = Math.round(screen.height * screen.dpr);

// 触摸：回调拿到逻辑坐标
export function onTouch(handlers) {
  const map = (e, list) => Array.from(list || []).map(t => ({ id: t.identifier, x: (t.clientX - screen.offsetX) / screen.scale, y: t.clientY / screen.scale, t: now() }));   // 统一用 now()：微信的 e.timeStamp 和帧循环不是同一个时钟
  if (handlers.start) wx.onTouchStart(e => handlers.start(map(e, e.changedTouches), e));
  if (handlers.move) wx.onTouchMove(e => handlers.move(map(e, e.changedTouches), e));
  if (handlers.end) wx.onTouchEnd(e => handlers.end(map(e, e.changedTouches), e));
  if (handlers.cancel) wx.onTouchCancel(e => handlers.cancel(map(e, e.changedTouches), e));
}

// 本地存档
export const storage = {
  get(key, fallback = null) {
    try { const v = wx.getStorageSync(key); return v === '' || v == null ? fallback : v; } catch (e) { return fallback; }
  },
  set(key, value) { try { wx.setStorageSync(key, value); } catch (e) { /* 存不下就算了 */ } },
};

// 震动：短震（light / medium / heavy）
let vibrateOn = true;
export function vibrate(type = 'light') {
  if (!vibrateOn) return;
  try { wx.vibrateShort({ type }); } catch (e) { /* 部分机型不支持 type */ }
}
export function setVibrate(on) { vibrateOn = !!on; }

// 图片
export function loadImage(src) {
  return new Promise(resolve => {
    const img = wx.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 音频：BGM 一路循环，音效按名字建对象池
const sounds = {};
let muted = false, duckK = 1;              // duckK：BGM 临时压低的倍率（电梯里 0.6）。暂停 / 切后台 / 切静音再恢复时照样按它算
const bgmVol = v => (muted ? 0 : v * duckK);
export const audio = {
  get muted() { return muted; },
  get duckK() { return duckK; },
  setMuted(m) { muted = !!m; for (const s of Object.values(sounds)) if (s.loop) s.volume = bgmVol(s._vol); },
  // 同一首：停过就重新播（之前判断 src 相同直接 return，导致第二局起没有音乐）
  bgm(src, volume = 0.5) {
    const b = sounds.__bgm;
    if (b && b._key === src) {
      b._vol = volume; b.volume = bgmVol(volume);
      if (!b._on) { b._on = true; try { b.play(); } catch (e) { /* ignore */ } }
      return;
    }
    if (b) { try { b.stop(); b.destroy(); } catch (e) { /* ignore */ } }
    const a = wx.createInnerAudioContext({ useWebAudioImplement: false });
    a.src = src; a.loop = true; a._key = src; a._vol = volume; a._on = true; a.volume = bgmVol(volume);
    try { a.play(); } catch (e) { /* 首次交互前可能失败 */ }
    sounds.__bgm = a;
  },
  // 部分机型要等第一次触摸才允许出声：按下时再试一次
  kick() { const b = sounds.__bgm; if (b && b._on) { try { b.play(); } catch (e) { /* ignore */ } } },
  stopBgm() { const b = sounds.__bgm; if (b) { b._on = false; try { b.stop(); } catch (e) { /* ignore */ } } },
  // 临时压低 BGM（电梯里 0.6），duck(1) 恢复；不换曲、不停。倍率记下来：暂停后继续、切后台回来、切静音都不丢
  duck(k = 1) { duckK = k; const b = sounds.__bgm; if (b) b.volume = bgmVol(b._vol); },
  play(name, src, volume = 0.8) {
    if (muted) return;
    const pool = sounds[name] || (sounds[name] = []);
    let a = pool.find(x => x._idle);
    if (!a) {
      if (pool.length >= 4) a = pool[0];
      else { a = wx.createInnerAudioContext({ useWebAudioImplement: true }); a.src = src; a.onEnded(() => { a._idle = true; }); pool.push(a); }
    }
    a._idle = false; a.volume = volume;
    try { a.stop(); a.play(); } catch (e) { /* ignore */ }
  },
};

// 启动参数（分享卡片带来的 seed / 到家时间）
export function launchQuery() {
  try { return (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().query) || {}; } catch (e) { return {}; }
}
// 键盘（PC 版微信 / 浏览器调试）
export function onKey(fn) {
  try { wx.onKeyDown && wx.onKeyDown(e => fn(e.key)); } catch (e) { /* 手机上没有 */ }
}

// 诊断：当前是开发版 / 体验版 / 正式版；全局报错；原生弹窗（渲染器坏了也能显示）
export function envVersion() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion || ''; } catch (e) { return ''; }
}
export function onAppError(fn) {
  try {
    if (wx.onError) wx.onError(r => fn((r && (r.stack || r.message)) || r));
    if (wx.onUnhandledRejection) wx.onUnhandledRejection(r => fn((r && r.reason) || r));
  } catch (e) { /* ignore */ }
}
export function showAlert(title, content) {
  try { wx.showModal({ title, content, showCancel: false }); } catch (e) { /* ignore */ }
}
// 复制到剪贴板（开发版结算页复制埋点用）
export function copyText(data) {
  try { wx.setClipboardData({ data: String(data) }); return true; } catch (e) { return false; }
}

// 生命周期
export function onShow(fn) { wx.onShow && wx.onShow(res => fn(res || {})); }
// 来电、闹钟等打断音频：结束后要把音乐和音效恢复
export function onAudioInterruption({ begin, end }) {
  try { if (begin && wx.onAudioInterruptionBegin) wx.onAudioInterruptionBegin(begin); if (end && wx.onAudioInterruptionEnd) wx.onAudioInterruptionEnd(end); } catch (e) { /* ignore */ }
}
export function onHide(fn) { wx.onHide && wx.onHide(fn); }

// 分享（结算页截图）
export function share({ title, imageUrl, query = '' }) {
  try { wx.shareAppMessage({ title, imageUrl, query }); } catch (e) { /* 开发环境没有 */ }
}
export function enableShareMenu(getPayload) {
  try {
    wx.showShareMenu && wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
    wx.onShareAppMessage && wx.onShareAppMessage(() => getPayload());
    wx.onShareTimeline && wx.onShareTimeline(() => { const p = getPayload(); return { title: p.title, query: p.query, imageUrl: p.imageUrl }; });
  } catch (e) { /* ignore */ }
}
// 独立的像素画布（不按逻辑分辨率缩放）：画分享图之类固定尺寸的图片
export function rawCanvas(w, h) {
  const c = wx.createCanvas();
  c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}
export function exportCanvas(c, w, h) {
  try { return c.toTempFilePathSync({ x: 0, y: 0, width: w, height: h, destWidth: w, destHeight: h }); } catch (e) { return ''; }
}

export const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
export const raf = fn => requestAnimationFrame(fn);
