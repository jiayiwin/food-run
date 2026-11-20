// 选关页「一周通勤」：序章 + 周一到周三，每关三颗星和最好成绩；没解锁的显示锁和「先通关××」。
// 第 5 张是自由下班（打完周一解锁），底部「今日挑战」永远可点。点卡片进关，左右滑没有效果。
import { screen } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { randomSeed, daySeed } from '../core/rng.js';
import { layout } from '../render/world.js';
import { INK, ease, clamp } from '../render/draw.js';
import { card, starIcon, lockIcon } from '../render/ui.js';
import { gfx } from '../gfx/gfx.js';
import { BGM } from '../data/tune.js';
import { LEVELS, LEVEL_ORDER } from '../data/levels.js';
import { modifierOf } from '../data/modifiers.js';
import { isOpen, fullOpen, cleared } from '../core/savefmt.js';
import { save, dateKey } from '../save.js';

const text = (s, x, y, o) => gfx.text(s, x, y, o);
// 「快 1 分」/「慢 2 分」/「准点」：取整分钟的到家时刻 − 标准（标准是整分钟，所以等于 floor(到家 − 标准)），和星级判定同一个口径
export const vsText = v => { const d = Math.floor(v + 1e-9); return d < 0 ? `快 ${-d} 分` : d > 0 ? `慢 ${d} 分` : '准点'; };

export function levelsScene(game) {
  const L = layout(screen);
  let t = 0, buttons = [], shake = null;
  const mod = modifierOf(daySeed());

  return {
    music: () => BGM.home,
    update(dt) { t += dt; },
    render() {
      buttons = [];
      gfx.rect(0, 0, L.W, L.H, { fill: '#ffcf8a' });
      for (let i = 0; i < 14; i++) gfx.rect(((i * 53 + t * 20) % (L.W + 60)) - 30, 0, 18, L.H, { fill: 'rgba(255,255,255,.08)' });
      // 顶栏（右上角留给微信胶囊按钮）
      const top = L.top + 8;
      card(12, top, 64, 34, 17, '#fff', { lw: 2.2, shadow: 2 });
      text('返回', 44, top + 17, { size: 15, color: INK });
      buttons.push({ id: 'back', x: 4, y: top - 6, w: 84, h: 46 });
      text('一周通勤', L.W / 2, top + 17, { size: 20, color: INK });

      // 卡片：343×76，竖排；矮屏时缩小间距
      const n = LEVEL_ORDER.length + 1, y0 = top + 50, room = L.H - L.bottom - 70 - y0;
      const ch = 76, gap = Math.max(6, Math.min(18, (room - n * ch) / (n - 1)));
      const x = 16, w = L.W - 32;
      const k = i => ease.outBack(clamp((t - i * 0.05) / 0.3, 0, 1));
      LEVEL_ORDER.forEach((id, i) => {
        const def = LEVELS[id], open = isOpen(save, id), rec = save.levels[id] || {};
        const y = y0 + i * (ch + gap), s = 0.9 + 0.1 * k(i), dx = shake && shake.id === id ? Math.sin((t - shake.t) * 50) * 5 * clamp(1 - (t - shake.t) / 0.35, 0, 1) : 0;
        gfx.save(); gfx.translate(x + w / 2 + dx, y + ch / 2); gfx.scale(s); gfx.translate(-(x + w / 2), -(y + ch / 2));
        card(x, y, w, ch, 16, open ? '#fffaf0' : '#e9dfd2', { lw: 2.6 });
        text(`第 ${i + 1} 关`, x + 16, y + 18, { size: 11, color: '#8a7f95', align: 'left', weight: 400 });
        text(def.name, x + 16, y + 40, { size: 18, color: open ? INK : '#8a7f95', align: 'left', maxW: w - 150 });
        text(def.sub, x + 16, y + 61, { size: 12, color: open ? '#a0522d' : '#a99db3', align: 'left', weight: 400, maxW: w - 150 });
        if (open) {
          const st = rec.stars || [];
          for (let j = 0; j < 3; j++) starIcon(x + w - 96 + j * 30, y + 28, 12, !!st[j]);
          text(cleared(save, id) && rec.best != null ? `最好 ${vsText(rec.best)}` : '还没通关', x + w - 66, y + 56, { size: 12, color: '#8a7f95', weight: 400 });
        } else {
          lockIcon(x + w - 66, y + 30);
          text(`先通关${LEVELS[LEVEL_ORDER[i - 1]].short}`, x + w - 66, y + 58, { size: 12, color: '#8a7f95', weight: 400 });
        }
        gfx.restore();
        buttons.push({ id: 'lv', arg: id, x, y, w, h: ch });
      });
      // 自由下班
      {
        const i = LEVEL_ORDER.length, y = y0 + i * (ch + gap), open = fullOpen(save), s = 0.9 + 0.1 * k(i);
        const dx = shake && shake.id === 'full' ? Math.sin((t - shake.t) * 50) * 5 * clamp(1 - (t - shake.t) / 0.35, 0, 1) : 0;
        gfx.save(); gfx.translate(x + w / 2 + dx, y + ch / 2); gfx.scale(s); gfx.translate(-(x + w / 2), -(y + ch / 2));
        card(x, y, w, ch, 16, open ? '#ffd166' : '#e9dfd2', { lw: 2.6 });
        text('自由下班', x + 16, y + 30, { size: 18, color: open ? INK : '#8a7f95', align: 'left' });
        text('完整下班路 · 约 200 秒 · 每局新路线', x + 16, y + 54, { size: 12, color: open ? '#8a5a00' : '#a99db3', align: 'left', weight: 400, maxW: w - 130 });
        if (open) text(save.best ? `最快 ${save.best.text} · ${save.best.grade}` : '还没跑过', x + w - 60, y + ch / 2, { size: 12, color: '#8a5a00', weight: 400 });
        else { lockIcon(x + w - 60, y + 30); text('通关周一解锁', x + w - 60, y + 58, { size: 12, color: '#8a7f95', weight: 400 }); }
        gfx.restore();
        buttons.push({ id: 'full', x, y, w, h: ch });
      }
      // 今日挑战（永远可点）
      const by = L.H - L.bottom - 58;
      card(L.W / 2 - 110, by, 220, 46, 23, '#ffffff', { lw: 2.4 });
      const d = save.daily && save.daily.date === dateKey() ? `最佳 ${save.daily.text}` : mod.name;
      text('今日挑战', L.W / 2 - 50, by + 23, { size: 17, color: INK });
      text(d, L.W / 2 + 52, by + 24, { size: 11, color: '#8a7f95', weight: 400, maxW: 100 });
      buttons.push({ id: 'daily', x: L.W / 2 - 110, y: by, w: 220, h: 46 });
    },
    input(e) {
      if (e.type === 'key' && e.key === 'Escape') return press({ id: 'back' });
      if (e.type !== 'tap') return;
      const b = buttons.find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (b) press(b);
    },
  };

  function press(b) {
    if (b.id === 'back') { sfx.click(); return game.go('title'); }
    if (b.id === 'daily') { sfx.click(); return game.go('play', { seed: daySeed(), daily: true, tutorial: !save.tutorialDone }); }
    if (b.id === 'full') {
      if (!fullOpen(save)) { sfx.bad(); shake = { id: 'full', t }; return; }
      sfx.click(); return game.go('play', { seed: randomSeed(), tutorial: !save.tutorialDone });
    }
    if (b.id === 'lv') {
      if (!isOpen(save, b.arg)) { sfx.bad(); shake = { id: b.arg, t }; return; }
      sfx.click(); return game.go('play', { seed: randomSeed(), level: b.arg });
    }
  }
}
