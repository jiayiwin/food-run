// 选主角：两张大卡片，左男主角、右女主角（同一身行头、同一套骨骼）。新玩家第一次进游戏、老存档 gender 为空时各出现一次
// （开局先到这里，确认后去标题页）；之后在标题页底部「主角」能随时回来换。默认高亮当前主角（没选过是男主角），一定要点「就是 TA」确认。
// 左右滑 / 点卡片换高亮。只改存档的 gender、外观和称呼表，不碰别的进度
import { screen } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { layout } from '../render/world.js';
import { INK, ease, clamp } from '../render/draw.js';
import { card } from '../render/ui.js';
import { person, idlePose, cheerPose, runPose } from '../render/rig.js';
import { heroOf, setHero } from '../render/looks.js';
import { gfx } from '../gfx/gfx.js';
import { BGM } from '../data/tune.js';
import { save, persist } from '../save.js';

const text = (s, x, y, o) => gfx.text(s, x, y, o);
export const HERO_CARDS = [{ g: 'm', name: '男主角', sub: '小X · 他' }, { g: 'f', name: '女主角', sub: '小X · 她' }];

// next：确认以后去哪个场景（缺省标题页）；back：能不能不换直接返回（从标题页进来、已经选过时才有）
export function heroScene(game, { next = 'title', nextOpts = {}, back = false } = {}) {
  const L = layout(screen);
  let t = 0, buttons = [], sel = save.gender === 'f' ? 'f' : 'm', pickT = -9;
  const pick = g => { if (g !== sel) { sel = g; pickT = t; sfx.click(); } };

  return {
    music: () => BGM.home,
    update(dt) { t += dt; },
    render() {
      buttons = [];
      gfx.rect(0, 0, L.W, L.H, { fill: '#ffcf8a' });
      for (let i = 0; i < 14; i++) gfx.rect(((i * 53 + t * 20) % (L.W + 60)) - 30, 0, 18, L.H, { fill: 'rgba(255,255,255,.08)' });
      const top = L.top + 8;
      // 高屏：整块（标题 + 卡片 + 按钮）竖着居中，返回键留在左上角
      const h = Math.min(320, L.H - L.bottom - top - 112 - 150), oy = Math.max(0, (L.H - L.bottom - top - (112 + h + 190)) / 2);
      if (back) {
        card(12, top, 64, 34, 17, '#fff', { lw: 2.2, shadow: 2 });
        text('返回', 44, top + 17, { size: 15, color: INK });
        buttons.push({ id: 'back', x: 4, y: top - 6, w: 84, h: 46 });
      }
      text('选一位打工人', L.W / 2, top + oy + 56, { size: 26, color: INK });
      text('下班路上，TA 就是你', L.W / 2, top + oy + 86, { size: 13, color: '#8a5a00', weight: 400 });

      // 两张卡片：矮屏（667）时卡片矮一点
      const gap = 12, w = (L.W - 32 - gap) / 2, y0 = top + oy + 112;
      HERO_CARDS.forEach((c, i) => {
        const x = 16 + i * (w + gap), on = c.g === sel;
        const pop = on ? 1 + 0.04 * ease.outBack(clamp((t - pickT) / 0.25, 0, 1)) : 1;
        gfx.save(); gfx.translate(x + w / 2, y0 + h / 2); gfx.scale(pop); gfx.translate(-(x + w / 2), -(y0 + h / 2));
        card(x, y0, w, h, 20, on ? '#fff3c4' : '#fffaf0', { lw: on ? 4 : 2.4, stroke: on ? '#e67e22' : INK });
        // 站在卡片里：选中的那位欢呼一下再原地小跑，没选中的站着
        const fy = y0 + h - 66, k = Math.min(2.5, (h - 96) / 70);
        gfx.rect(x + 18, fy - 1, w - 36, 3, { fill: 'rgba(43,34,51,.15)', r: 1.5 });
        const pose = !on ? idlePose(t + i) : t - pickT < 0.9 ? cheerPose(t) : runPose((t * 1.4) % 1, 0.3);
        person(gfx, x + w / 2 - 4, fy, heroOf(c.g), pose, { scale: k });
        text(c.name, x + w / 2, y0 + h - 40, { size: 19, color: INK });
        text(c.sub, x + w / 2, y0 + h - 18, { size: 12, color: '#8a7f95', weight: 400 });
        if (on) { gfx.circle(x + w - 22, y0 + 22, 13, { fill: '#2ecc71', stroke: INK, lw: 2 }); text('✓', x + w - 22, y0 + 23, { size: 15, color: '#fff' }); }
        gfx.restore();
        buttons.push({ id: 'pick', arg: c.g, x, y: y0, w, h });
      });

      // 确认（必须点一下）
      const by = y0 + h + 24, pulse = 1 + 0.03 * Math.sin(t * 5);
      gfx.save(); gfx.translate(L.W / 2, by + 30); gfx.scale(pulse);
      card(-110, -30, 220, 60, 30, '#ffd166', { lw: 3 });
      text('就是 TA 了！', 0, 1, { size: 24, color: INK });
      gfx.restore();
      buttons.push({ id: 'ok', x: L.W / 2 - 110, y: by, w: 220, h: 60 });
      if (!back) text('之后在首页底部「换主角」随时能换', L.W / 2, by + 82, { size: 12, color: '#8a5a00', weight: 400 });   // 从首页「换主角」进来的（有返回键）不用再说
    },
    input(e) {
      if (e.type === 'key') {
        if (e.key === 'ArrowLeft' || e.key === 'a') pick('m');
        else if (e.key === 'ArrowRight' || e.key === 'd') pick('f');
        else if (e.key === 'Enter' || e.key === ' ') confirm();
        else if (e.key === 'Escape' && back) leave();
        return;
      }
      if (e.type === 'swipe' && (e.dir === 'left' || e.dir === 'right')) return pick(e.dir === 'left' ? 'm' : 'f');
      if (e.type !== 'tap') return;
      const b = buttons.find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (!b) return;
      if (b.id === 'pick') pick(b.arg);
      else if (b.id === 'ok') confirm();
      else if (b.id === 'back') leave();
    },
    get selected() { return sel; },
  };

  function confirm() {
    sfx.click();
    save.gender = sel; persist();
    setHero(sel);
    game.go(next, nextOpts);
  }
  function leave() { sfx.click(); game.go('title'); }
}
