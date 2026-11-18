// 「下班战报」：竖版截图卡 + 再跑一次 / 炫耀一下。
import { screen, share, rawCanvas, exportCanvas } from '../platform/index.js';
import { drawShareCard } from '../render/shareCard.js';
import { sfx } from '../platform/sfx.js';
import { randomSeed } from '../core/rng.js';
import { layout, NPCNAME } from '../render/world.js';
import { INK, ease, clamp } from '../render/draw.js';
import { avatar, card } from '../render/ui.js';
import { gfx } from '../gfx/gfx.js';
import { bake, fromImage } from '../gfx/tex.js';
import { mealArt } from '../render/art.js';
import { BGM } from '../data/tune.js';

const text = (s, x, y, o) => gfx.text(s, x, y, o);

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function resultScene(game, { result: r, flags = {}, friend = null }) {
  const L = layout(screen);
  let t = 0, buttons = [];
  const cardBox = { x: 14, y: L.top + 40, w: L.W - 28, h: 0 };

  return {
    get result() { return r; },
    music: () => BGM.home,
    update(dt) { t += dt; },
    render() {
      buttons = [];
      gfx.rect(0, 0, L.W, L.H, { fill: r.win ? '#ffcf8a' : '#5b4a6b' });
      for (let i = 0; i < 14; i++) gfx.rect(((i * 53 + t * 20) % (L.W + 60)) - 30, 0, 18, L.H, { fill: 'rgba(255,255,255,.08)' });
      const k = ease.outBack(clamp(t / 0.4, 0, 1));
      const { x, y, w } = cardBox;
      const h = Math.min(L.H - L.bottom - y - 130, 560);
      cardBox.h = h;
      gfx.save(); gfx.translate(L.W / 2, y + h / 2); gfx.scale(0.9 + 0.1 * k); gfx.translate(-L.W / 2, -(y + h / 2));
      card(x, y, w, h, 18, '#fffaf0', { lw: 3 });
      const d = new Date();
      // 页眉
      gfx.rect(x, y, w, 48, { fill: r.win ? '#ff8a5c' : '#7f6a8f', r: 18 }); gfx.rect(x, y + 30, w, 18, { fill: r.win ? '#ff8a5c' : '#7f6a8f' });
      text('下班战报', x + 18, y + 25, { size: 20, color: '#fff', align: 'left' });
      text(`${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}${r.daily ? ` · ${r.mod || '今日挑战'}` : ''}`, x + w - 16, y + 25, { size: 13, color: '#fff', align: 'right', weight: 400 });

      let cy = y + 96;
      if (r.win) {
        text(r.arrivalText, x + 26, cy, { size: 56, color: INK, align: 'left' });
        text('到家', x + 26 + 150, cy + 12, { size: 18, color: '#8a7f95', align: 'left' });
        stamp(x + w - 62, cy - 2, r.grade, t);
      } else {
        text('没能下班', x + 26, cy, { size: 44, color: '#c0392b', align: 'left' });
        stamp(x + w - 62, cy - 2, '✗', t);
      }
      cy += 46;
      // 称号
      card(x + 20, cy - 14, w - 40, 30, 15, '#2b2233', { lw: 0, shadow: 0 });
      text(`称号：「${r.title}」`, L.W / 2, cy + 1, { size: 15, color: '#ffd166' });
      cy += 40;
      // 晚饭
      bowl(x + 46, cy + 14, r.meal);
      text('今晚的饭', x + 84, cy, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
      text(r.meal.name, x + 84, cy + 22, { size: 20, color: INK, align: 'left', maxW: w - 110 });
      cy += 52;
      // 最离谱借口
      line(x + 20, cy - 8, w - 40);
      text('今日最离谱借口', x + 22, cy + 8, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
      if (flags.newExcuses) text(`图鉴新增 ${flags.newExcuses} 条`, x + w - 22, cy + 8, { size: 12, color: '#e74c3c', align: 'right' });
      if (r.best) {
        text(`「${r.best.text}」`, x + 22, cy + 34, { size: 22, color: '#e74c3c', align: 'left', maxW: w - 44 });
        text(`—— 回 ${NPCNAME(r.best.npc)} 的「${r.best.line}」`, x + 22, cy + 58, { size: 11, color: '#8a7f95', align: 'left', weight: 400, maxW: w - 44 });
      } else text('一句废话没说，跑就完了', x + 22, cy + 34, { size: 17, color: INK, align: 'left' });
      cy += 80;
      // 拦住你的人
      line(x + 20, cy - 8, w - 40);
      text('拦住你的人', x + 22, cy + 8, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
      const by = r.stats.caughtBy;
      if (by.length) by.slice(0, 4).forEach((n, i) => { avatar(n, x + 40 + i * 48, cy + 38, 18); text(NPCNAME(n), x + 40 + i * 48, cy + 64, { size: 10, color: INK, weight: 400 }); });
      else text('没人拦得住你', x + 22, cy + 38, { size: 17, color: INK, align: 'left' });
      cy += 80;
      // 数据
      if (cy + 60 < y + h) {
        const s = r.stats;
        const cells = [[`${s.good}/${s.choices}`, '好回答'], [String(s.nearMiss), '惊险'], [`${s.chased} 次`, '被追'], [String(r.score), '得分']];
        const cw = (w - 40) / 4;
        cells.forEach(([v, lb], i) => { text(v, x + 20 + cw * (i + 0.5), cy + 14, { size: 17, color: INK, maxW: cw - 4 }); text(lb, x + 20 + cw * (i + 0.5), cy + 36, { size: 11, color: '#8a7f95', weight: 400 }); });
      }
      if (flags.bestTime || flags.bestDaily) { gfx.save(); gfx.translate(x + w - 40, y + 62); gfx.rotate(0.2); card(-40, -12, 80, 24, 12, '#e74c3c', { lw: 1.6, shadow: 0 }); text('新纪录！', 0, 0, { size: 13, color: '#fff' }); gfx.restore(); }
      if (y + h - 22 > cy + 42) text('狂奔吧，打工人', L.W / 2, y + h - 16, { size: 11, color: '#c4b8cf', weight: 400 });   // 矮屏放不下就不画落款
      gfx.restore();

      // 好友对比
      let fy = y + h + 18;
      if (friend && friend.time) {
        const win = r.win && r.arrivalText <= friend.time.padStart(5, '0');
        text(`好友 ${friend.time} 到家 · 你${r.win ? ' ' + r.arrivalText : '没到家'}${win ? '，赢了！' : '，再来一次？'}`, L.W / 2, fy, { size: 14, color: '#fff', lw: 3 });
        fy += 22;
      }
      // 按钮
      const bw = (L.W - 44) / 2, bh = 52, b0 = Math.min(L.H - L.bottom - 76, fy + 6);
      card(16, b0, bw, bh, 26, '#ffd166', { lw: 2.6 }); text('再跑一次', 16 + bw / 2, b0 + bh / 2, { size: 19, color: INK });
      card(28 + bw, b0, bw, bh, 26, '#ffffff', { lw: 2.6 }); text('炫耀一下', 28 + bw + bw / 2, b0 + bh / 2, { size: 19, color: INK });
      buttons.push({ id: 'again', x: 16, y: b0, w: bw, h: bh }, { id: 'share', x: 28 + bw, y: b0, w: bw, h: bh });
      text('回首页', L.W / 2, b0 + bh + 22, { size: 14, color: '#fff', lw: 3 });
      buttons.push({ id: 'home', x: L.W / 2 - 50, y: b0 + bh + 6, w: 100, h: 32 });
    },
    input(e) {
      if (t < 0.6) return;                       // 卡片还在弹出：吃掉上一场景残留的点击，免得跳过战报
      if (e.type === 'key' && e.key === 'Enter') return press('again');
      if (e.type !== 'tap') return;
      const b = buttons.find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (b) press(b.id);
    },
  };

  function press(id) {
    sfx.click();
    if (id === 'again') return game.go('play', { seed: r.daily || friend ? r.seed : randomSeed(), daily: r.daily, friend });
    if (id === 'home') return game.go('title');
    if (id === 'share') {
      share(sharePayload(r, shareImage(r)));
    }
  }
}

// 分享：微信卡片图按 5:4 显示，单独画一张 500×400 的图，不截屏幕
export const shareQuery = r => `seed=${r.seed}&t=${r.win ? r.arrivalText : ''}&d=${r.daily ? 1 : 0}`;
export function sharePayload(r, imageUrl) { return { title: shareTitle(r), query: shareQuery(r), ...(imageUrl ? { imageUrl } : {}) }; }
let lastShare = null;
export function shareImage(r) {
  if (lastShare && lastShare.r === r) return lastShare.url;
  const { canvas, ctx } = rawCanvas(500, 400);
  drawShareCard(ctx, r);
  lastShare = { r, url: exportCanvas(canvas, 500, 400) };
  return lastShare.url;
}

export function shareTitle(r) {
  if (r.win) return `我 ${r.arrivalText} 就到家吃上${r.meal.name}了，你几点？`;
  return r.reason === 'starve' ? '我饿晕在下班路上了……' : `我被${NPCNAME(r.npc)}拦下了，今晚吃${r.meal.name}……`;
}

function stamp(x, y, s, t) {
  const k = ease.outBack(clamp((t - 0.25) / 0.3, 0, 1));
  if (k <= 0) return;
  const col = s === 'S' ? '#e74c3c' : s === 'A' ? '#ff8a5c' : s === 'B' ? '#3d7ad6' : '#7f8c8d';
  gfx.save(); gfx.translate(x, y); gfx.rotate(-0.2); gfx.scale(2 - k); gfx.alpha(Math.min(1, k));
  gfx.circle(0, 0, 32, { stroke: col, lw: 4, fill: 'rgba(255,255,255,0)' });
  gfx.circle(0, 0, 26, { stroke: col, lw: 1.5, fill: 'rgba(255,255,255,0)' });
  text(s, 0, 2, { size: 38, color: col });
  gfx.restore();
}
function bowl(x, y, meal) {
  const a = mealArt(meal);
  if (a) { const k = 44 / a.w; gfx.draw(fromImage(`meal|${a.src}`, a.img, a.w, a.h, { ox: a.w / 2, oy: a.h }), x, y + 12, { sx: k, sy: k }); return; }
  gfx.draw(bake(`bowl|${meal.name}`, [-24, -16, 48, 30], g => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -6, 22, 0, Math.PI); g.closePath(); g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = meal.color || (meal.tier < 0 ? '#bbb' : '#f2c14e'); g.beginPath(); g.ellipse(0, -6, 20, 7, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = meal.side || '#eee'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-9 + i * 9, -9, 3.5, 0, Math.PI * 2); g.fill(); }
  }), x, y);
}
function line(x, y, w) { for (let d = 0; d < w; d += 8) gfx.rect(x + d, y - 0.75, Math.min(4, w - d), 1.5, { fill: '#eadfce' }); }
