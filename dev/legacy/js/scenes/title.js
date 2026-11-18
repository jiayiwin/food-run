// 标题页：夕阳办公室、三步玩法图示、「下班！」/ 今日挑战 / 好友挑战。
import { screen } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { randomSeed, daySeed } from '../core/rng.js';
import { layout, drawBackdrop } from '../render/world.js';
import { drawPerson, idlePose, runPose } from '../render/rig.js';
import { PLAYER, lookOf } from '../render/looks.js';
import { text, card, INK, ease, clamp, roundRect } from '../render/draw.js';
import { lunchbox } from '../render/ui.js';
import { save, persist, dateKey } from '../save.js';

export function titleScene(game) {
  const L = layout(screen);
  let t = 0, buttons = [];
  // 好友分享卡带来的种子；「今日挑战」只有还是今天的种子才算每日挑战
  const fseed = game.launch && game.launch.seed ? +game.launch.seed >>> 0 : null;
  const friend = fseed != null ? { seed: fseed, time: game.launch.t || '', daily: game.launch.d === '1' && fseed === daySeed() } : null;

  return {
    update(dt) { t += dt; },
    render(g) {
      buttons = [];
      const gy = L.groundY;
      drawBackdrop(g, L, 40 + t * 6, 1, 0.05, () => 'office');
      // 工位前伸懒腰的主角 + 门口探头的老刘
      drawPerson(g, 110, gy, PLAYER, { ...idlePose(t), shR: 150 + Math.sin(t * 2) * 10, elR: 20, shL: -150, elL: 20 }, { scale: 1.5 });
      const peek = 0.5 + 0.5 * Math.sin(t * 0.9);
      drawPerson(g, L.W - 40 + (1 - peek) * 40, gy, lookOf('laoliu'), idlePose(t), { flip: -1, scale: 1.5 });
      if (peek > 0.7) { card(g, L.W - 196, gy - 128, 150, 30, 14, '#fff', { lw: 2.2, shadow: 2 }); text(g, '小X，这么早走啊？', L.W - 121, gy - 113, { size: 13, color: INK }); }

      // 标题
      const ty = L.top + 92;
      g.save(); g.translate(L.W / 2, ty); g.rotate(-0.05);
      const bob = Math.sin(t * 3) * 2;
      text(g, '狂奔吧，', -40, -26 + bob, { size: 40, color: '#fff', lw: 9 });
      text(g, '打工人', 40, 22 - bob, { size: 50, color: '#ffd166', lw: 10 });
      g.restore();
      text(g, '— 下班了，我要回家吃饭 —', L.W / 2, ty + 70, { size: 14, color: '#fff', lw: 4 });

      // 三步图示
      const sy = ty + 104, sw = 108, sh = 92;
      const steps = [['躲障碍', '上滑跳 · 下滑铲'], ['两秒选回答', '左滑 / 右滑'], ['别被逮 3 次', '回家吃上热饭']];
      steps.forEach(([a, b], i) => {
        const x = 16 + i * (sw + 7);
        card(g, x, sy, sw, sh, 14, 'rgba(255,250,240,.94)', { lw: 2.2 });
        stepIcon(g, i, x + sw / 2, sy + 30, t);
        text(g, a, x + sw / 2, sy + 62, { size: 14, color: INK });
        text(g, b, x + sw / 2, sy + 80, { size: 11, color: '#8a7f95', weight: 400 });
      });

      // 按钮
      let by = Math.max(sy + sh + 24, gy - 250);
      if (friend) {
        card(g, 40, by, L.W - 80, 50, 25, '#ff8a5c', { lw: 2.6 });
        text(g, friend.time ? `好友 ${friend.time} 到家 · 跑同一条路` : '好友没能下班 · 替他跑一次', L.W / 2, by + 25, { size: 16, color: '#fff' });
        buttons.push({ id: 'friend', x: 40, y: by, w: L.W - 80, h: 50 });
        by += 62;
      }
      const pulse = 1 + 0.03 * Math.sin(t * 5);
      g.save(); g.translate(L.W / 2, by + 32); g.scale(pulse, pulse);
      card(g, -110, -32, 220, 64, 32, '#ffd166', { lw: 3 });
      text(g, '下班！', 0, save.tutorialDone ? 1 : -6, { size: 28, color: INK });
      if (!save.tutorialDone) text(g, '第一次跑带教学', 0, 18, { size: 11, color: '#8a5a00', weight: 400 });
      g.restore();
      buttons.push({ id: 'start', x: L.W / 2 - 110, y: by, w: 220, h: 64 });
      by += 76;
      card(g, L.W / 2 - 110, by, 220, 46, 23, '#ffffff', { lw: 2.4 });
      const d = save.daily && save.daily.date === dateKey() ? `今日最佳 ${save.daily.text}` : '全国同一条路';
      text(g, '今日挑战', L.W / 2 - 30, by + 23, { size: 17, color: INK });
      text(g, d, L.W / 2 + 52, by + 24, { size: 11, color: '#8a7f95', weight: 400 });
      buttons.push({ id: 'daily', x: L.W / 2 - 110, y: by, w: 220, h: 46 });

      // 底部：纪录 + 开关
      const fy = L.H - L.bottom - 30;
      const best = save.best ? `最快 ${save.best.text} 到家 · ${save.best.grade}` : '还没准点下班过';
      text(g, `${best} · 共 ${save.runs} 局`, L.W / 2, fy - 34, { size: 12, color: '#fff', lw: 3 });
      const tg = (id, label, on, x) => { card(g, x, fy - 14, 76, 28, 14, on ? 'rgba(216,248,225,.95)' : 'rgba(238,238,238,.9)', { lw: 1.8, shadow: 0 }); text(g, `${label}${on ? '开' : '关'}`, x + 38, fy, { size: 12, color: INK }); buttons.push({ id, x, y: fy - 18, w: 76, h: 36 }); };
      tg('sound', '声音 ', !save.settings.mute, L.W / 2 - 84);
      tg('vibrate', '震动 ', save.settings.vibrate, L.W / 2 + 8);
    },
    input(e) {
      if (e.type === 'key' && (e.key === 'Enter' || e.key === ' ')) return start('start');
      if (e.type !== 'tap') return;
      const b = buttons.find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (b) start(b.id);
    },
  };

  function start(id) {
    sfx.click();
    if (id === 'sound') { save.settings.mute = !save.settings.mute; game.applySettings(); persist(); return; }
    if (id === 'vibrate') { save.settings.vibrate = !save.settings.vibrate; game.applySettings(); persist(); return; }
    const tutorial = !save.tutorialDone;           // 不管从哪个入口进，第一局都带教学（路线不变）
    if (id === 'friend') return game.go('play', { seed: friend.seed, daily: friend.daily, friend, tutorial });
    if (id === 'daily') return game.go('play', { seed: daySeed(), daily: true, tutorial });
    game.go('play', { seed: randomSeed(), tutorial: !save.tutorialDone });
  }
}

function stepIcon(g, i, x, y, t) {
  if (i === 0) {
    const k = (t * 1.2) % 1, jy = -Math.sin(k * Math.PI) * 14;
    g.fillStyle = '#d9a066'; roundRect(g, x + 8, y + 2, 16, 14, 2); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
    drawPerson(g, x - 10, y + 16 + jy, PLAYER, runPose((t * 2) % 1), { scale: 0.45 });
  } else if (i === 1) {
    for (const [dx, c] of [[-18, '#fff8ec'], [18, '#fff8ec']]) { card(g, x + dx - 15, y - 12, 30, 24, 6, c, { lw: 1.6, shadow: 0 }); }
    text(g, 'A', x - 18, y, { size: 13, color: INK }); text(g, 'B', x + 18, y, { size: 13, color: INK });
    const s = Math.sin(t * 3) * 10;
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x + s, y + 18, 5, 0, Math.PI * 2); g.fill(); g.stroke();
  } else {
    for (let k = 0; k < 3; k++) lunchbox(g, x - 26 + k * 26, y + 2, k < 2 || Math.floor(t * 2) % 2 === 0, 0.8);
  }
  void clamp; void ease;
}
