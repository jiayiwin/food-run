// 美术资源加载：按清单异步加载图片，加载好的挂到对应位置；没加载好之前一律用代码绘制兜底。
import { loadImage } from '../platform/index.js';
import { ART_MANIFEST } from '../data/art.js';
import { NPC_LOOKS, PLAYER } from './looks.js';

export const STAGES = ['office', 'street', 'park', 'home'];
export const ART = { bg: {}, props: {}, ready: false, loading: null, uploadQueue: [] };

export function loadArt() {
  if (ART.loading) return ART.loading;
  // 浏览器调试可以用 dev 页注入的清单覆盖（对比不同美术风格）
  const m = (typeof GameGlobal !== 'undefined' && GameGlobal.__ART_OVERRIDE) || ART_MANIFEST;
  const base = m.base || '';
  const jobs = [];
  for (const [stage, layers] of Object.entries(m.bg || {})) {
    for (const [name, def] of Object.entries(layers)) {
      if (def.modules) {          // 模块式背景：一栋栋楼分开存，运行时随机拼
        jobs.push(Promise.all(def.modules.map(v => loadImage(base + v.src))).then(imgs => {
          const mods = def.modules.map((v, i) => ({ ...v, img: imgs[i] })).filter(v => v.img);
          if (mods.length) (ART.bg[stage] = ART.bg[stage] || {})[name] = { ...def, modules: mods };
        }));
        continue;
      }
      // 多张变体（同一路段几段不同的街景轮流出现，避免两秒一重复）
      const list = def.variants || [def];
      jobs.push(Promise.all(list.map(v => loadImage(base + v.src))).then(imgs => {
        const ok = list.map((v, i) => ({ ...v, img: imgs[i] })).filter(v => v.img);
        if (ok.length) (ART.bg[stage] = ART.bg[stage] || {})[name] = { ...def, img: ok[0].img, w: ok[0].w, h: ok[0].h, list: ok };
      }));
    }
  }
  // 道具 / 障碍 / 地标：{ src, w, h, ox, oy }，w/h 逻辑像素，左下角画在 (x + ox, oy)（地面 y = 0，向上为负）
  for (const [id, def] of Object.entries(m.props || {})) {
    jobs.push(loadImage(base + def.src).then(img => { if (img) ART.props[id] = { ...def, img }; }));
  }
  for (const [id, def] of Object.entries(m.chars || {})) {
    jobs.push(loadImage(base + def.src).then(img => {
      const look = id === 'player' ? PLAYER : NPC_LOOKS[id];
      if (img && look) look.art = { ...def, img };
    }));
  }
  ART.loading = Promise.all(jobs).then(() => {
    ART.ready = true;
    // 所有美术图排队预上传显存：标题页期间每帧传 2 张，开局第一次画到时不卡
    for (const layers of Object.values(ART.bg)) for (const d of Object.values(layers)) for (const m of d.modules || d.list || [d]) if (m.img) ART.uploadQueue.push(m.img);
    for (const d of Object.values(ART.props)) ART.uploadQueue.push(d.img);
    for (const l of [PLAYER, ...Object.values(NPC_LOOKS)]) if (l.art) ART.uploadQueue.push(l.art.img);
  });
  return ART.loading;
}

export const bgLayer = (stage, name) => (ART.bg[stage] && ART.bg[stage][name]) || null;
// 某一层四个路段都有图才用图（避免一半代码一半图片的拼接感）
export const hasLayer = name => STAGES.every(s => bgLayer(s, name));
export const propArt = id => ART.props[id] || null;
// 晚饭 → 美术图
const MEAL_ART = { 红烧肉: 'meal_hongshaorou', 番茄炒蛋: 'meal_tomatoegg', 剩菜热一热: 'meal_leftovers', 泡面: 'meal_noodles', 放门卫的外卖: 'meal_takeout' };
export const mealArt = meal => (meal && MEAL_ART[meal.name] && ART.props[MEAL_ART[meal.name]]) || null;
// 画一张道具图：左下角对齐 (x + ox, oy)；bob 给移动的东西加一点上下颠
export function drawProp(g, def, x, { bob = 0, flip = false } = {}) {
  const px = x + (def.ox || 0), py = (def.oy || 0) - def.h + bob;
  if (!flip) { g.drawImage(def.img, px, py, def.w, def.h); return; }
  g.save(); g.translate(px + def.w, py); g.scale(-1, 1); g.drawImage(def.img, 0, 0, def.w, def.h); g.restore();
}
