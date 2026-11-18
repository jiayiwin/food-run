// 平台层：把用到的 wx.* 收拢到这里，游戏其余部分不直接碰 wx。
// 微信小游戏里 wx 是全局对象；浏览器调试时由 dev/wx-shim.js 提供同名接口。
/* global wx */

const sys = wx.getSystemInfoSync();

// 逻辑分辨率：宽固定 375，高按屏幕比例算。所有游戏坐标都在这个空间里。
export const DESIGN_W = 375;
export const screen = {
  width: sys.windowWidth,
  height: sys.windowHeight,
  dpr: sys.pixelRatio || 2,
  scale: sys.windowWidth / DESIGN_W,        // 逻辑像素 → 屏幕 CSS 像素
  W: DESIGN_W,
  H: Math.round(DESIGN_W * sys.windowHeight / sys.windowWidth),
  // 安全区（逻辑像素）：刘海屏顶部要让出来
  safeTop: Math.round(((sys.safeArea && sys.safeArea.top) || 0) / (sys.windowWidth / DESIGN_W)),
  safeBottom: Math.round((sys.windowHeight - ((sys.safeArea && sys.safeArea.bottom) || sys.windowHeight)) / (sys.windowWidth / DESIGN_W)),
  platform: sys.platform || 'unknown',
};

// 主画布：第一次 createCanvas 拿到的就是上屏画布
export const canvas = wx.createCanvas();
canvas.width = Math.round(screen.width * screen.dpr);
canvas.height = Math.round(screen.height * screen.dpr);
export const ctx = canvas.getContext('2d');
// 每帧开头调用：把坐标系设成逻辑分辨率
export function beginFrame() {
  const k = screen.scale * screen.dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

// 离屏画布（缓存背景、预渲染文字等）
export function offscreen(w, h) {
  const c = wx.createCanvas();
  c.width = Math.ceil(w * screen.scale * screen.dpr);
  c.height = Math.ceil(h * screen.scale * screen.dpr);
  const g = c.getContext('2d');
  const k = screen.scale * screen.dpr;
  g.setTransform(k, 0, 0, k, 0, 0);
  return { canvas: c, ctx: g, w, h };
}

// 触摸：回调拿到逻辑坐标
export function onTouch(handlers) {
  const map = (e, list) => Array.from(list || []).map(t => ({ id: t.identifier, x: t.clientX / screen.scale, y: t.clientY / screen.scale, t: e.timeStamp || Date.now() }));
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
let muted = false;
export const audio = {
  get muted() { return muted; },
  setMuted(m) { muted = !!m; for (const s of Object.values(sounds)) if (s.loop) s.volume = muted ? 0 : s._vol; },
  // 同一首：停过就重新播（之前判断 src 相同直接 return，导致第二局起没有音乐）
  bgm(src, volume = 0.5) {
    const b = sounds.__bgm;
    if (b && b._key === src) {
      b._vol = volume; b.volume = muted ? 0 : volume;
      if (!b._on) { b._on = true; try { b.play(); } catch (e) { /* ignore */ } }
      return;
    }
    if (b) { try { b.stop(); b.destroy(); } catch (e) { /* ignore */ } }
    const a = wx.createInnerAudioContext({ useWebAudioImplement: false });
    a.src = src; a.loop = true; a._key = src; a._vol = volume; a._on = true; a.volume = muted ? 0 : volume;
    try { a.play(); } catch (e) { /* 首次交互前可能失败 */ }
    sounds.__bgm = a;
  },
  stopBgm() { const b = sounds.__bgm; if (b) { b._on = false; try { b.stop(); } catch (e) { /* ignore */ } } },
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
// 本次进入的参数（热启动从分享卡回来时和 launchQuery 不一样）
export function enterQuery() {
  try { return (wx.getEnterOptionsSync && wx.getEnterOptionsSync().query) || launchQuery(); } catch (e) { return launchQuery(); }
}
// 键盘（PC 版微信 / 浏览器调试）
export function onKey(fn) {
  try { wx.onKeyDown && wx.onKeyDown(e => fn(e.key)); } catch (e) { /* 手机上没有 */ }
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
export function snapshot(x, y, w, h) {
  // 把画布的一块存成临时图片（分享用）
  try {
    const k = screen.scale * screen.dpr;
    return canvas.toTempFilePathSync({ x: x * k, y: y * k, width: w * k, height: h * k, destWidth: 500, destHeight: Math.round(500 * h / w) });
  } catch (e) { return ''; }
}

export const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
export const raf = fn => requestAnimationFrame(fn);
