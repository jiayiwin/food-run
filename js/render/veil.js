// 背景罩（tune.js 的 VEIL）：纯函数，不碰画布，测试里可以直接调。
// 按镜头中心所在路段取罩子，路段交界 300px 内两段的颜色、透明度、浅雾线性过渡；户外再和暮色取大。
import { VEIL } from '../data/tune.js';
import { FULL } from '../game/level.js';

const VEILS = Object.fromEntries(Object.entries(VEIL).map(([id, v]) => [id, { rgb: [1, 3, 5].map(i => parseInt(v.color.slice(i, i + 2), 16)), alpha: v.alpha, fog: v.fog ? v.fog.alpha : 0 }]));
export const FOG = VEIL.office.fog;
const lerp = (a, b, t) => a + (b - a) * t;
const cache = new Map();

// cx：镜头中心的世界坐标；ctx：关卡（缺省全程关，按主题取罩子、路段交界过渡）；
// 也可以传「世界坐标 → 主题」的函数或带 fixed 的上下文（标题页：固定一个主题，不做过渡）
// 返回 { color: 'rgb(...)', alpha, fog }，同一个位置永远同一个对象
export function veilAt(cx, ctx = null) {
  const fixed = typeof ctx === 'function' ? ctx : ctx && ctx.fixed ? () => ctx.fixed : null;
  const lv = fixed ? null : ctx || FULL;
  let ia = fixed ? fixed(cx) : lv.themeAt(cx), ib = ia, k = 0;
  if (!VEILS[ia]) ia = ib = 'street';
  if (lv) {
    const st = lv.stages, i = st.indexOf(lv.stageAt(cx)), s = st[i];
    if (i > 0 && cx - s.x0 < 150) { ib = lv.themeOf(st[i - 1]); k = 0.5 - (cx - s.x0) / 300; }
    else if (i < st.length - 1 && s.x1 - cx < 150) { ib = lv.themeOf(st[i + 1]); k = 0.5 - (s.x1 - cx) / 300; }
    if (!VEILS[ib]) ib = ia;
  }
  k = Math.round(k * 30) / 30;
  const key = `${ia}|${ib}|${k}`;
  let v = cache.get(key);
  if (!v) {
    const a = VEILS[ia], b = VEILS[ib], c = a.rgb.map((x, j) => Math.round(lerp(x, b.rgb[j], k)));
    v = { color: `rgb(${c[0]},${c[1]},${c[2]})`, alpha: lerp(a.alpha, b.alpha, k), fog: lerp(a.fog, b.fog, k) };
    cache.set(key, v);
  }
  return v;
}

// 实际压多少：户外 = max(路段保底, 0.3 × 暮色 × 户外系数)；楼道是固定的保底；公司 0
export const veilAlpha = (v, dusk, outdoor) => Math.max(v.alpha, 0.3 * dusk * outdoor);
