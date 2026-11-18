// 分享卡片图（500×400，微信按 5:4 显示）：到家时间 + 评级、称号、今晚的饭、今日最离谱借口。用 Canvas 2D 单独画，不依赖游戏画面。
import { text, card, INK, roundRect } from './draw.js';
import { NPCS } from '../data/npcs.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function drawShareCard(g, r) {
  const W = 500, H = 400;
  g.fillStyle = r.win ? '#ffcf8a' : '#5b4a6b'; g.fillRect(0, 0, W, H);
  card(g, 14, 14, W - 28, H - 28, 22, '#fffaf0', { lw: 4, shadow: 0 });
  g.fillStyle = r.win ? '#ff8a5c' : '#7f6a8f'; roundRect(g, 14, 14, W - 28, 64, 22); g.fill(); g.fillRect(14, 50, W - 28, 28);
  const d = new Date();
  text(g, '下班战报', 40, 47, { size: 30, color: '#fff', align: 'left' });
  text(g, `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}${r.daily ? ' · 今日挑战' : ''}`, W - 40, 48, { size: 18, color: '#fff', align: 'right', weight: 400 });
  if (r.win) {
    text(g, r.arrivalText, 40, 138, { size: 84, color: INK, align: 'left' });
    text(g, '到家', 262, 156, { size: 26, color: '#8a7f95', align: 'left' });
    stamp(g, W - 88, 136, r.grade);
  } else {
    text(g, '没能下班', 40, 136, { size: 64, color: '#c0392b', align: 'left' });
    stamp(g, W - 88, 136, '✗');
  }
  g.fillStyle = INK; roundRect(g, 40, 196, W - 80, 44, 22); g.fill();
  text(g, `称号：「${r.title}」`, W / 2, 218, { size: 22, color: '#ffd166', maxW: W - 110 });
  text(g, `今晚的饭：${r.meal.name}`, 40, 274, { size: 24, color: INK, align: 'left', maxW: W - 80 });
  if (r.best) {
    text(g, `最离谱借口：「${r.best.text}」`, 40, 318, { size: 24, color: '#e74c3c', align: 'left', maxW: W - 80 });
    const who = NPCS[r.best.npc] ? NPCS[r.best.npc].name : '';
    text(g, `—— 回${who}的「${r.best.line}」`, 40, 352, { size: 16, color: '#8a7f95', align: 'left', weight: 400, maxW: W - 80 });
  } else text(g, '一句废话没说，跑就完了', 40, 318, { size: 22, color: INK, align: 'left' });
}

function stamp(g, x, y, s) {
  const col = s === 'S' ? '#e74c3c' : s === 'A' ? '#ff8a5c' : s === 'B' ? '#3d7ad6' : '#7f8c8d';
  g.save(); g.translate(x, y); g.rotate(-0.2);
  g.lineWidth = 6; g.strokeStyle = col; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 41, 0, Math.PI * 2); g.stroke();
  text(g, s, 0, 3, { size: 58, color: col });
  g.restore();
}
