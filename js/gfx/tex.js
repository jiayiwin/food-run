// 贴图句柄：图片、图集里的一块、或把一段 Canvas 2D 矢量画「烘焙」成的位图，统一成同一种结构，两个渲染后端都认。
//   { key, w, h, src, sx, sy, sw, sh, ox, oy }
//   w/h  逻辑尺寸（画出来多大）
//   src  图片或画布；sx/sy/sw/sh 是它里面的像素区域
//   ox/oy 绘制原点在贴图里的位置（逻辑单位）：draw(tex, x, y) 让这个点落在 (x, y)
import { rawCanvas, screen } from '../platform/index.js';

// 烘焙分辨率：每个逻辑像素对应多少真实像素（屏幕缩放 × dpr，封顶 3，省显存）
export const BAKE_RES = Math.min(3, Math.max(1, screen.scale * screen.dpr));

const cache = new Map();
export const texCount = () => cache.size;

// 把一段矢量画画成贴图。box = [left, top, width, height]（逻辑单位，相对绘制原点），draw(ctx) 在原点坐标系里画
export function bake(key, box, draw, { res = BAKE_RES } = {}) {
  let t = cache.get(key);
  if (t) return t;
  const [left, top, w, h] = box;
  const pw = Math.max(1, Math.ceil(w * res)), ph = Math.max(1, Math.ceil(h * res));
  const { canvas, ctx } = rawCanvas(pw, ph);
  ctx.setTransform(res, 0, 0, res, -left * res, -top * res);
  draw(ctx);
  t = { key, w: pw / res, h: ph / res, src: canvas, sx: 0, sy: 0, sw: pw, sh: ph, ox: -left, oy: -top };   // 尺寸按实际像素换算，免得边缘留一条缝
  cache.set(key, t);
  return t;
}

// 已加载的图片 → 贴图（w/h 逻辑尺寸，默认按 dpr 2 的图算）
export function fromImage(key, img, w, h, { ox = 0, oy = 0, sx = 0, sy = 0, sw, sh } = {}) {
  let t = cache.get(key);
  if (t) return t;
  sw = sw || img.width; sh = sh || img.height;
  t = { key, w: w ?? sw / 2, h: h ?? sh / 2, src: img, sx, sy, sw, sh, ox, oy };
  cache.set(key, t);
  return t;
}

export const getTex = key => cache.get(key) || null;

// 临时烘焙（不进全局缓存，由调用方自己做 LRU 回收，回收时调 gfx.release）
export function bakeTemp(key, box, draw, { res = BAKE_RES } = {}) {
  const [left, top, w, h] = box;
  const pw = Math.max(1, Math.ceil(w * res)), ph = Math.max(1, Math.ceil(h * res));
  const { canvas, ctx } = rawCanvas(pw, ph);
  ctx.setTransform(res, 0, 0, res, -left * res, -top * res);
  draw(ctx);
  return { key, w: pw / res, h: ph / res, src: canvas, sx: 0, sy: 0, sw: pw, sh: ph, ox: -left, oy: -top };
}

// 简单 LRU：按 key 取贴图，超过上限回收最久没用的
export function makeLru(limit, release) {
  const map = new Map();
  return {
    get(key, make) {
      let v = map.get(key);
      if (v) { map.delete(key); map.set(key, v); return v; }
      v = make();
      map.set(key, v);
      if (map.size > limit) { const [k0, v0] = map.entries().next().value; map.delete(k0); release(v0); }
      return v;
    },
    get size() { return map.size; },
    clear() { for (const v of map.values()) release(v); map.clear(); },
  };
}

// 颜色字符串 → { rgb: 0xRRGGBB, a }（支持 #rgb #rgba #rrggbb #rrggbbaa rgb() rgba()）
const colorCache = new Map();
export function parseColor(c) {
  if (c == null) return null;
  let v = colorCache.get(c);
  if (v) return v;
  let r = 0, g = 0, b = 0, a = 1;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(s => parseFloat(s)); [r, g, b] = p; if (p.length > 3) a = p[3]; }
  }
  v = { rgb: (r << 16) | (g << 8) | b, a };
  colorCache.set(c, v);
  return v;
}
