// 借口图鉴：按人翻页，说过的回答点亮，没说过的显示问号。左右滑或点按钮翻页。
// 顶上三个分组标签（公司 / 路上 / 家里人，写各组点亮了几条），点一下跳到这一组的第一个人。
// 家里人一条都没点亮、存档里也没回过他住的家（save.homes）的：剪影 +「还没回过这个家」；回过家只是没轮到他问的（比如爸爸）照常显示攻略
import { screen } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { layout } from '../render/world.js';
import { INK } from '../render/draw.js';
import { avatar, card } from '../render/ui.js';
import { gfx } from '../gfx/gfx.js';
import { BGM } from '../data/tune.js';
import { ALBUM, ALBUM_GROUPS, albumCount, groupCount, unseenMember } from '../data/album.js';
import { save } from '../save.js';

const text = (s, x, y, o) => gfx.text(s, x, y, o);
const GOOD_COLOR = { true: '#2ecc71', mid: '#f39c12', false: '#e74c3c' };

export function albumScene(game) {
  const L = layout(screen);
  const have = new Set(save.album), visited = new Set(save.homes || []);
  const { got, total } = albumCount(have);
  let page = 0, t = 0, buttons = [];
  // 一人的回答太多（妈妈二十多条）时分几页：每页最多 rows 行（行高不小于 24），翻页一页一页翻
  const top0 = L.top + 8, y00 = top0 + 84, h0 = L.H - L.bottom - y00 - 66, rows = Math.max(6, Math.floor((h0 - 82) / 24));
  const PAGES = ALBUM.flatMap(e => { const n = Math.ceil(e.items.length / rows) || 1; return Array.from({ length: n }, (_, k) => ({ e, items: e.items.slice(k * rows, (k + 1) * rows), k, n })); });
  const turn = d => { sfx.click(); page = (page + d + PAGES.length) % PAGES.length; };
  const back = () => { sfx.click(); game.go('title'); };

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
      text(`借口图鉴 ${got}/${total}`, L.W / 2, top + 17, { size: 20, color: INK });

      // 分组标签
      const pg = PAGES[page], e = pg.e, gw = (L.W - 24 - 12) / 3;
      ALBUM_GROUPS.forEach((gr, i) => {
        const gx = 12 + i * (gw + 6), on = e.group === gr.id, n = groupCount(have, gr.id);
        card(gx, top + 44, gw, 28, 14, on ? '#ffd166' : 'rgba(255,255,255,.8)', { lw: 1.8, shadow: 0 });
        text(`${gr.name} ${n.got}/${n.total}`, gx + gw / 2, top + 58, { size: 12, color: INK, maxW: gw - 10 });
        buttons.push({ id: 'group', arg: gr.id, x: gx, y: top + 40, w: gw, h: 36 });
      });

      // 当前这个人
      const y0 = top + 84, h = L.H - L.bottom - y0 - 66;
      card(12, y0, L.W - 24, h, 18, '#fffaf0', { lw: 3 });
      const mine = e.items.filter(it => have.has(it.key)).length, unseen = unseenMember(e, have, visited);
      avatar(e.id, 46, y0 + 38, 24);
      if (unseen) gfx.circle(46, y0 + 38, 24, { fill: '#2b2233', alpha: 0.78 });     // 还没回过这个家：剪影
      const nm = pg.n > 1 ? `${e.name} ${pg.k + 1}/${pg.n}` : e.name;
      text(nm, 82, y0 + 24, { size: 20, color: INK, align: 'left' });
      text(e.role, 90 + gfx.measure(nm, { size: 20 }), y0 + 26, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
      text(`${mine}/${e.items.length}`, L.W - 28, y0 + 24, { size: 14, color: mine === e.items.length ? '#e74c3c' : '#8a7f95', align: 'right' });
      text(unseen ? '还没回过这个家' : e.hint, 82, y0 + 48, { size: 12, color: '#8a7f95', align: 'left', weight: 400, maxW: L.W - 110 });

      // 回答列表
      const ry = y0 + 72, rh = Math.min(38, (h - 82) / Math.max(1, pg.items.length));
      pg.items.forEach((it, i) => {
        const y = ry + rh * (i + 0.5);
        if (i) gfx.rect(26, ry + rh * i - 0.5, L.W - 52, 1, { fill: '#eadfce' });
        if (have.has(it.key)) {
          gfx.circle(32, y, 4, { fill: GOOD_COLOR[String(it.good)] || '#8a7f95' });
          text(it.text, 44, y, { size: 14, color: INK, align: 'left', maxW: 128 });
          if (it.react) text(`「${it.react}」`, L.W - 26, y, { size: 12, color: '#8a7f95', align: 'right', weight: 400, maxW: 168 });
        } else {
          gfx.circle(32, y, 4, { fill: '#d8cfc4' });
          text('？？？', 44, y, { size: 14, color: '#c4b8cf', align: 'left' });
        }
      });

      // 翻页
      const by = L.H - L.bottom - 54, bw = 104;
      card(12, by, bw, 44, 22, '#fff', { lw: 2.4 });
      text('上一位', 12 + bw / 2, by + 22, { size: 16, color: INK });
      buttons.push({ id: 'prev', x: 12, y: by, w: bw, h: 44 });
      card(L.W - 12 - bw, by, bw, 44, 22, '#ffd166', { lw: 2.4 });
      text('下一位', L.W - 12 - bw / 2, by + 22, { size: 16, color: INK });
      buttons.push({ id: 'next', x: L.W - 12 - bw, y: by, w: bw, h: 44 });
      text(`${page + 1} / ${PAGES.length}`, L.W / 2, by + 22, { size: 14, color: INK });
    },
    input(ev) {
      if (ev.type === 'key') {
        if (ev.key === 'ArrowLeft') turn(-1);
        else if (ev.key === 'ArrowRight') turn(1);
        else if (ev.key === 'Escape') back();
        return;
      }
      if (ev.type === 'swipe') {
        if (ev.dir === 'left') turn(1);
        else if (ev.dir === 'right') turn(-1);
        return;
      }
      if (ev.type !== 'tap') return;
      const b = buttons.find(b => ev.x >= b.x && ev.x <= b.x + b.w && ev.y >= b.y && ev.y <= b.y + b.h);
      if (!b) return;
      if (b.id === 'back') back();
      else if (b.id === 'group') { sfx.click(); page = Math.max(0, PAGES.findIndex(x => x.e.group === b.arg)); }
      else turn(b.id === 'next' ? 1 : -1);
    },
  };
}
