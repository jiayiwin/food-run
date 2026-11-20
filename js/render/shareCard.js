// 分享卡片图（500×400，微信按 5:4 显示）：到家时间 + 评级、称号、今晚的饭、今日最离谱借口。用 Canvas 2D 单独画，不依赖游戏画面。
import { text, card, INK, roundRect } from './draw.js';
import { NPCS } from '../data/npcs.js';
import { MEMBERS } from '../data/family.js';
import { levelDef } from '../data/levels.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function drawShareCard(g, r) {
  const W = 500, H = 400;
  g.fillStyle = r.win ? '#ffcf8a' : '#5b4a6b'; g.fillRect(0, 0, W, H);
  card(g, 14, 14, W - 28, H - 28, 22, '#fffaf0', { lw: 4, shadow: 0 });
  g.fillStyle = r.win ? '#ff8a5c' : '#7f6a8f'; roundRect(g, 14, 14, W - 28, 64, 22); g.fill(); g.fillRect(14, 50, W - 28, 28);
  const d = new Date();
  text(g, '下班战报', 40, 47, { size: 30, color: '#fff', align: 'left' });
  const lv = levelDef(r.level);     // 关卡：页眉写关名，印章写几颗星
  text(g, lv ? `${lv.name}${r.assist ? ' · 带薪摸鱼' : ''}` : `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}${r.daily ? ' · 今日挑战' : ''}`, W - 40, 48, { size: 18, color: '#fff', align: 'right', weight: lv ? 700 : 400 });
  if (r.win) {
    text(g, r.arrivalText, 40, 138, { size: 84, color: INK, align: 'left' });
    text(g, '到家', 262, 156, { size: 26, color: '#8a7f95', align: 'left' });
    stamp(g, W - 88, 136, lv && r.stars ? `★${r.stars.filter(Boolean).length}` : r.grade, lv && r.assist ? '摸鱼' : '');   // 带薪摸鱼：印章里加一行小字
  } else {
    text(g, '没能下班', 40, 136, { size: 64, color: '#c0392b', align: 'left' });
    stamp(g, W - 88, 136, '✗');
  }
  g.fillStyle = INK; roundRect(g, 40, 196, W - 80, 44, 22); g.fill();
  text(g, `称号：「${r.title}」`, W / 2, 218, { size: 22, color: '#ffd166', maxW: W - 110 });
  const fl = r.family, home = fl && fl.line ? `回的是：${fl.name}${fl.errand ? ` · ${fl.errand.share}` : ''}` : '';   // 自由下班 / 今日挑战：回的是哪个家
  text(g, `今晚的饭：${r.meal.name}`, 40, home ? 266 : 274, { size: 24, color: INK, align: 'left', maxW: W - 80 });
  if (home) text(g, home, 40, 297, { size: 17, color: '#8a7f95', align: 'left', weight: 400, maxW: W - 80 });
  const by = home ? 330 : 318;
  if (r.best) {
    text(g, `最离谱借口：「${r.best.text}」`, 40, by, { size: 24, color: '#e74c3c', align: 'left', maxW: W - 80 });
    const who = NPCS[r.best.npc] ? NPCS[r.best.npc].name : MEMBERS[r.best.npc] ? MEMBERS[r.best.npc].name : '';
    text(g, `—— 回${who}的「${r.best.line}」`, 40, by + 32, { size: 16, color: '#8a7f95', align: 'left', weight: 400, maxW: W - 80 });
  } else text(g, '一句废话没说，跑就完了', 40, by, { size: 22, color: INK, align: 'left' });
}

function stamp(g, x, y, s, sub = '') {
  const col = s === 'S' ? '#e74c3c' : s === 'A' ? '#ff8a5c' : s === 'B' ? '#3d7ad6' : s[0] === '★' ? '#e6a100' : '#7f8c8d';
  g.save(); g.translate(x, y); g.rotate(-0.2);
  g.lineWidth = 6; g.strokeStyle = col; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 41, 0, Math.PI * 2); g.stroke();
  if (sub) { text(g, s, 0, -8, { size: 30, color: col }); text(g, sub, 0, 20, { size: 15, color: col }); }
  else text(g, s, 0, 3, { size: s.length > 1 ? 40 : 58, color: col });
  g.restore();
}
