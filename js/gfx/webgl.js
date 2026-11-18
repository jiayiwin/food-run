// WebGL 后端（PixiJS 7）：每次绘制映射到池里复用的精灵 / 九宫格 / 文字对象，按调用顺序直接提交批处理渲染。
// 不把它们挂进场景树（省掉每帧增删子节点），世界矩阵由 gfx 算好直接写进去。
// 微信小游戏没有 DOM：贴图资源用自定义的 WxResource（接受 wx.createImage / wx.createCanvas 的对象），
// Pixi 需要的画布、navigator 等通过 settings.ADAPTER 提供。
import {
  Renderer, Container, Sprite, Text, NineSlicePlane, Texture, BaseTexture, Rectangle, Matrix,
  BaseImageResource, INSTALLED, settings, TextMetrics, TextStyle, SCALE_MODES, MIPMAP_MODES, ContextSystem,
} from '../libs/pixi.js';
import { rawCanvas } from '../platform/index.js';
import { parseColor, BAKE_RES } from './tex.js';
import { roundRect, INK } from '../render/draw.js';

const FONT = ['PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif'];

// 图片 / 画布 → WebGL 贴图（不用 instanceof HTMLImageElement 判断，小游戏里没有这些类）
class WxResource extends BaseImageResource {
  static test(src) { return !!src && typeof src === 'object' && (typeof src.getContext === 'function' || ('naturalWidth' in src) || (src.width > 0 && 'src' in src)); }
}
let installed = false;
function setupPixiForMinigame() {
  if (installed) return;
  installed = true;
  INSTALLED.unshift(WxResource);
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || 'wechat-minigame';
  settings.ADAPTER = {
    createCanvas: (w = 1, h = 1) => rawCanvas(w, h).canvas,
    getCanvasRenderingContext2D: () => (typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D : function () {}),
    getWebGLRenderingContext: () => (typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext : function () {}),
    getNavigator: () => ({ userAgent: ua, gpu: null }),
    getBaseUrl: () => '',
    getFontFaceSet: () => null,
    fetch: () => Promise.reject(new Error('fetch is not available')),
    parseXML: () => null,
  };
  settings.RESOLUTION = 1;
  // 环境探测（instanceof WebGL2RenderingContext 等）在小游戏里可能拿到奇怪的全局：出错就按 WebGL1 处理，不让整个渲染器起不来
  const validate = ContextSystem.prototype.validateContext;
  ContextSystem.prototype.validateContext = function (gl) {
    try { return validate.call(this, gl); } catch (e) { this.supports.uint32Indices = !!gl.getExtension('OES_element_index_uint'); }
  };
  settings.ROUND_PIXELS = false;
}

export function makeWebglBackend(canvas) {
  setupPixiForMinigame();
  const renderer = new Renderer({
    view: canvas, width: canvas.width, height: canvas.height, resolution: 1,
    antialias: false, autoDensity: false, backgroundAlpha: 1, background: 0x1d1b26,
    powerPreference: 'high-performance', clearBeforeRender: true,
  });
  if (!renderer.gl) throw new Error('webgl context unavailable');

  // 一帧的绘制列表：root.render 时按顺序画
  const list = [];
  const root = new Container();
  root.render = function (r) { for (let i = 0; i < list.length; i++) list[i].render(r); };

  // 贴图：每个图片 / 画布一个 BaseTexture，区域各自一个 Texture
  const bases = new Map();
  function pixiTex(tex) {
    if (tex.pixi) return tex.pixi;
    let bt = bases.get(tex.src);
    if (!bt) {
      bt = new BaseTexture(new WxResource(tex.src), { scaleMode: SCALE_MODES.LINEAR, mipmap: MIPMAP_MODES.OFF });
      bases.set(tex.src, bt);
    }
    tex.pixi = new Texture(bt, new Rectangle(tex.sx, tex.sy, tex.sw, tex.sh));
    return tex.pixi;
  }

  // 对象池：精灵按顺序复用
  const sprites = [];
  let si = 0;
  const M = new Matrix();
  function place(obj, t, extraScaleX, extraScaleY, al, tintRGB) {
    const wt = obj.transform.worldTransform;
    wt.set(t[0] * extraScaleX, t[1] * extraScaleX, t[2] * extraScaleY, t[3] * extraScaleY, t[4], t[5]);
    obj.transform._worldID++;
    obj.worldAlpha = al;
    if (tintRGB != null && obj.tint !== tintRGB) obj.tint = tintRGB;
    list.push(obj);
  }

  // 纯色块：一张 4×4 白图拉伸 + 染色
  const white = (() => { const { canvas: c, ctx } = rawCanvas(4, 4); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4, 4); return { key: '__white', w: 4, h: 4, src: c, sx: 0, sy: 0, sw: 4, sh: 4, ox: 0, oy: 0 }; })();

  // 圆角矩形：按 (填充, 描边, 半径, 线宽) 烘一张小图，用九宫格拉伸到任意尺寸
  const rrTex = new Map();
  function roundRectTex(fill, stroke, r, lw) {
    const key = `${fill}|${stroke}|${r.toFixed(1)}|${lw}`;
    let t = rrTex.get(key);
    if (t) return t;
    const res = BAKE_RES, b = r + lw, size = Math.ceil((b * 2 + 2) * res);
    const { canvas: c, ctx } = rawCanvas(size, size);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    const s = size / res, in_ = lw / 2;
    roundRect(ctx, in_, in_, s - lw, s - lw, Math.max(0, r - in_ + lw / 2));
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
    const base = new BaseTexture(new WxResource(c), { scaleMode: SCALE_MODES.LINEAR });
    t = { tex: new Texture(base), border: Math.ceil(b * res), res };
    rrTex.set(key, t);
    return t;
  }
  const nines = new Map();     // key → [NineSlicePlane...]（同一帧同款可能出现多次）
  const nineUse = new Map();
  function nine(key, info) {
    let arr = nines.get(key);
    if (!arr) { arr = []; nines.set(key, arr); }
    const i = nineUse.get(key) || 0;
    nineUse.set(key, i + 1);
    if (!arr[i]) arr[i] = new NineSlicePlane(info.tex, info.border, info.border, info.border, info.border);
    return arr[i];
  }

  // 文字：同样的字 + 样式复用同一个 Text 对象（只在内容变化时重绘）；带 id 的是会变的数字，固定槽位复用
  const texts = new Map(), textUse = new Map(), textLastUsed = new Map();
  const idTexts = new Map(), measures = new Map();
  let frame = 0;
  function styleOf(o) {
    return new TextStyle({
      fontFamily: FONT, fontSize: o.size || 16, fontWeight: String(o.weight || 700),
      fill: o.color || '#fff', stroke: o.stroke || INK, strokeThickness: o.lw || 0, lineJoin: 'round',
      padding: Math.ceil((o.lw || 0) / 2) + 2,
    });
  }
  function textObj(str, o) {
    if (o.id) {
      let t = idTexts.get(o.id);
      const sk = `${o.size}|${o.weight}|${o.color}|${o.stroke}|${o.lw}`;
      if (!t) { t = new Text(str, styleOf(o)); t.resolution = BAKE_RES; t._sk = sk; idTexts.set(o.id, t); }
      else {
        if (t._sk !== sk) { t.style = styleOf(o); t._sk = sk; }
        if (t.text !== str) t.text = str;
      }
      return t;
    }
    const key = `${str}|${o.size}|${o.weight}|${o.color}|${o.stroke}|${o.lw}`;
    let arr = texts.get(key);
    if (!arr) { arr = []; texts.set(key, arr); }
    const i = textUse.get(key) || 0;
    textUse.set(key, i + 1);
    textLastUsed.set(key, frame);
    if (!arr[i]) { const t = new Text(str, styleOf(o)); t.resolution = BAKE_RES; arr[i] = t; }
    return arr[i];
  }
  function sweepTexts() {
    if (frame % 120) return;
    for (const [key, last] of textLastUsed) {
      if (frame - last > 600) { for (const t of texts.get(key) || []) t.destroy(true); texts.delete(key); textLastUsed.delete(key); }
    }
  }

  // 渐变：按色标烘一张 1×64 的竖条，拉伸使用
  const grads = new Map();
  function gradTex(stops) {
    const key = JSON.stringify(stops);
    let t = grads.get(key);
    if (t) return t;
    const { canvas: c, ctx } = rawCanvas(2, 64);
    const gr = ctx.createLinearGradient(0, 0, 0, 64);
    for (const [p, col] of stops) gr.addColorStop(p, col);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 2, 64);
    t = { key: 'g' + key, w: 2, h: 64, src: c, sx: 0, sy: 0, sw: 2, sh: 64, ox: 0, oy: 0 };
    if (grads.size > 300) grads.clear();
    grads.set(key, t);
    return t;
  }

  const disc = (() => { const n = 64, { canvas: c, ctx } = rawCanvas(n, n); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(n / 2, n / 2, n / 2 - 1, 0, Math.PI * 2); ctx.fill(); return { key: '__disc', w: n, h: n, src: c, sx: 0, sy: 0, sw: n, sh: n, ox: 0, oy: 0 }; })();
  function sprite() {
    let s = sprites[si];
    if (!s) { s = new Sprite(Texture.EMPTY); sprites[si] = s; }
    si++;
    return s;
  }
  function image(tex, t, al, tint) {
    const s = sprite();
    const pt = pixiTex(tex);
    if (s.texture !== pt) s.texture = pt;
    s.anchor.set(0, 0);
    // 世界矩阵把「贴图逻辑尺寸」映射到屏幕；精灵自身顶点是贴图像素，所以再乘一个 逻辑/像素 的缩放
    let tintRGB = 0xffffff;
    if (tint) { const c = parseColor(tint); tintRGB = c.rgb; }
    place(s, t, tex.w / tex.sw, tex.h / tex.sh, al, tintRGB);
  }

  return {
    kind: 'webgl',
    renderer,
    begin() { list.length = 0; si = 0; nineUse.clear(); textUse.clear(); frame++; },
    end() { renderer.render(root); sweepTexts(); },
    image,
    rect(t, w, h, s, al) {
      if (!s.r && !s.stroke) {
        // 纯色直角矩形：白图染色
        const c = parseColor(s.fill || '#fff');
        const sp = sprite();
        const pt = pixiTex(white);
        if (sp.texture !== pt) sp.texture = pt;
        sp.anchor.set(0, 0);
        place(sp, t, w / 4, h / 4, al * c.a, c.rgb);
        return;
      }
      const info = roundRectTex(s.fill || null, s.stroke || null, s.r || 0, s.lw || 0);
      const key = `${s.fill}|${s.stroke}|${(s.r || 0).toFixed(1)}|${s.lw || 0}`;
      const n = nine(key, info);
      const pw = w * info.res, ph = h * info.res;
      if (n.width !== pw) n.width = pw;
      if (n.height !== ph) n.height = ph;
      const b = Math.min(info.border, pw / 2, ph / 2);
      if (n.leftWidth !== b) { n.leftWidth = n.rightWidth = n.topHeight = n.bottomHeight = b; }
      place(n, t, 1 / info.res, 1 / info.res, al, null);
    },
    text(str, t, o, al) {
      const tx = textObj(str, o);
      const align = o.align || 'center', base = o.baseline || 'middle';
      tx.anchor.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, base === 'top' ? 0 : base === 'bottom' || base === 'alphabetic' ? 1 : 0.5);
      tx.updateText(true);
      let k = 1;
      if (o.maxW) { const lw = tx.texture.orig.width; if (lw > o.maxW) k = o.maxW / lw; }
      place(tx, t, k, k, al, null);
    },
    dot(t, r, fill, al) {
      const c = parseColor(fill), sp = sprite(), pt = pixiTex(disc);
      if (sp.texture !== pt) sp.texture = pt;
      sp.anchor.set(0.5, 0.5);
      place(sp, t, (2 * r) / 64, (2 * r) / 64, al * c.a, c.rgb);
    },
    vgrad(t, w, h, stops, al) {
      const g = gradTex(stops);
      const sp = sprite();
      const pt = pixiTex(g);
      if (sp.texture !== pt) sp.texture = pt;
      sp.anchor.set(0, 0);
      place(sp, t, w / 2, h / 64, al, 0xffffff);
    },
    // 预热：提前生成文字纹理并传到显存（不占本帧的使用计数），弹题那一帧就不用现做
    warm(str, o) {
      const key = `${str}|${o.size}|${o.weight}|${o.color}|${o.stroke}|${o.lw}`;
      let arr = texts.get(key);
      if (!arr) { arr = []; texts.set(key, arr); }
      textLastUsed.set(key, frame);
      if (arr[0]) return;
      const t = new Text(str, styleOf(o)); t.resolution = BAKE_RES; t.updateText(true);
      renderer.texture.bind(t.texture.baseTexture);
      arr[0] = t;
    },
    measure(str, o) {
      const key = `${str}|${o.size || 16}|${o.weight || 700}`;
      let w = measures.get(key);
      if (w == null) { w = TextMetrics.measureText(str, styleOf(o)).width; if (measures.size > 2000) measures.clear(); measures.set(key, w); }
      return w;
    },
    // 字体度量预热：Pixi 第一次遇到某个字号 / 粗细要逐像素扫一遍字形高度（几毫秒），提前在标题页做掉
    warmFont(size, weight) { TextMetrics.measureFont(styleOf({ size, weight }).toFontString()); },
    // 预上传：把图片提前传进显存（第一次画到它时就不用现传，避免卡一下）
    preload(src) {
      if (!src || bases.has(src)) return;
      const bt = new BaseTexture(new WxResource(src), { scaleMode: SCALE_MODES.LINEAR, mipmap: MIPMAP_MODES.OFF });
      bases.set(src, bt);
      renderer.texture.bind(bt);
    },
    release(tex) {
      if (tex.pixi) { tex.pixi.destroy(false); tex.pixi = null; }
      const bt = bases.get(tex.src);
      if (bt) { bt.destroy(); bases.delete(tex.src); }
    },
    stats() { return { gl: renderer.context.webGLVersion, sprites: si, list: list.length, textures: bases.size, texts: texts.size }; },
  };
  void M;
}
