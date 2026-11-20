// 浏览器里调试用的 wx 适配层：只实现游戏用到的那几个接口，行为尽量贴近微信小游戏。
// 参数：?w=390&h=844 固定画面尺寸（默认铺满窗口）；?notch=1 模拟刘海屏安全区；?dpr=2 指定像素比。
// 好友卡的 h 是家庭剧本的故事（h=share.tissue），和屏幕高度同名：只有纯数字的 w / h 当屏幕尺寸，也不进启动参数
(function () {
  const q = new URLSearchParams(location.search);
  const nav = navigator, imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');   // 严格模式会藏掉这些全局，先存下来
  const isSize = (k, v) => (k === 'w' || k === 'h') && /^\d+$/.test(v);
  const size = k => +(q.getAll(k).find(v => isSize(k, v)) || 0);
  const W = size('w') || window.innerWidth;
  const H = size('h') || window.innerHeight;
  const DPR = +q.get('dpr') || window.devicePixelRatio || 2;
  const notch = q.get('notch') === '1';
  let screenCanvas = null;
  const handlers = { start: [], move: [], end: [], cancel: [], show: [], hide: [], keydown: [], keyup: [] };

  function touchEvent(e, phase) {
    const r = screenCanvas.getBoundingClientRect();
    const t = { identifier: e.pointerId, clientX: e.clientX - r.left, clientY: e.clientY - r.top };
    return { touches: phase === 'end' ? [] : [t], changedTouches: [t], timeStamp: performance.now() };
  }

  const wx = {
    getSystemInfoSync() {
      return {
        windowWidth: W, windowHeight: H, screenWidth: W, screenHeight: H, pixelRatio: DPR, platform: 'devtools',
        safeArea: { top: notch ? 47 : 0, bottom: notch ? H - 34 : H, left: 0, right: W, width: W, height: H - (notch ? 81 : 0) },
      };
    },
    createCanvas() {
      const c = document.createElement('canvas');
      if (!screenCanvas) {
        screenCanvas = c;
        Object.assign(c.style, { width: W + 'px', height: H + 'px', display: 'block', touchAction: 'none', userSelect: 'none' });
        document.body.appendChild(c);
        const down = new Set();
        c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); down.add(e.pointerId); handlers.start.forEach(f => f(touchEvent(e, 'start'))); });
        c.addEventListener('pointermove', e => { if (down.has(e.pointerId)) handlers.move.forEach(f => f(touchEvent(e, 'move'))); });
        c.addEventListener('pointerup', e => { if (down.delete(e.pointerId)) handlers.end.forEach(f => f(touchEvent(e, 'end'))); });
        c.addEventListener('pointercancel', e => { if (down.delete(e.pointerId)) handlers.cancel.forEach(f => f(touchEvent(e, 'end'))); });
      }
      c.toTempFilePathSync = () => c.toDataURL('image/png');
      return c;
    },
    createImage() {
      // 小游戏里图片路径相对包根目录；浏览器调试页在 /dev/ 下，补成根路径
      const img = new Image(), d = imgSrc;
      Object.defineProperty(img, 'src', { get() { return d.get.call(img); }, set(v) { v = String(v); d.set.call(img, /^(https?:|data:|blob:|\/)/.test(v) ? v : '/' + v); } });
      return img;
    },
    onTouchStart: f => handlers.start.push(f),
    onTouchMove: f => handlers.move.push(f),
    onTouchEnd: f => handlers.end.push(f),
    onTouchCancel: f => handlers.cancel.push(f),
    offTouchStart() { handlers.start.length = 0; },
    getLaunchOptionsSync() { return { query: Object.fromEntries([...q.entries()].filter(([k, v]) => !isSize(k, v))), scene: 1001 }; },
    onKeyDown: f => handlers.keydown.push(f),
    onKeyUp: f => handlers.keyup.push(f),
    onShow: f => handlers.show.push(f),
    onHide: f => handlers.hide.push(f),
    getStorageSync(key) { try { const v = localStorage.getItem('wx:' + key); return v == null ? '' : JSON.parse(v); } catch (e) { return ''; } },
    setStorageSync(key, value) { localStorage.setItem('wx:' + key, JSON.stringify(value)); },
    removeStorageSync(key) { localStorage.removeItem('wx:' + key); },
    vibrateShort() { if (nav.vibrate) nav.vibrate(12); },
    vibrateLong() { if (nav.vibrate) nav.vibrate(400); },
    createInnerAudioContext() {
      const a = new Audio();
      const ended = [];
      a.addEventListener('ended', () => ended.forEach(f => f()));
      return {
        get src() { return a.src; }, set src(v) { a.src = '/' + String(v).replace(/^\//, ''); },
        get loop() { return a.loop; }, set loop(v) { a.loop = v; },
        get volume() { return a.volume; }, set volume(v) { a.volume = Math.max(0, Math.min(1, v)); },
        play() { a.play().catch(() => {}); }, pause() { a.pause(); }, stop() { a.pause(); a.currentTime = 0; },
        destroy() { a.pause(); a.src = ''; }, onEnded(f) { ended.push(f); },
      };
    },
    createWebAudioContext() { const C = window.AudioContext || window.webkitAudioContext; return C ? new C() : null; },
    loadFont() { return null; },
    showShareMenu() {}, onShareAppMessage() {}, shareAppMessage(o) { console.log('[wx.shareAppMessage]', o); },
    showToast(o) { console.log('[wx.showToast]', o && o.title); },
    setClipboardData(o) { console.log('[wx.setClipboardData]', o && o.data); if (nav.clipboard) nav.clipboard.writeText(String(o && o.data)).catch(() => {}); },
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? handlers.hide : handlers.show).forEach(f => f({})));
  window.addEventListener('keydown', e => { if (!e.repeat) handlers.keydown.forEach(f => f({ key: e.key, code: e.code, timeStamp: performance.now() })); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); });
  window.addEventListener('keyup', e => handlers.keyup.forEach(f => f({ key: e.key, code: e.code, timeStamp: performance.now() })));
  window.wx = wx;
  window.GameGlobal = window;
  // ?wxstrict=1：把微信小游戏里没有的 DOM 全局变量藏起来，检验渲染层不依赖它们（适配层是否到位）
  window.__devFetch = window.fetch.bind(window);
  if (q.get('wxstrict')) {
    for (const k of ['HTMLCanvasElement', 'HTMLImageElement', 'HTMLVideoElement', 'ImageBitmap', 'OffscreenCanvas', 'createImageBitmap', 'CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'DOMParser', 'fetch', 'XMLHttpRequest', 'navigator', 'location', 'FontFace']) {
      try { delete window[k]; if (k in window) Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true }); } catch (e) { console.warn('cannot hide', k); }
    }
    console.log('wxstrict: DOM globals hidden');
  }
})();
