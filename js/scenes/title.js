// 标题页：夕阳办公室、三步玩法图示、「下班！」/ 选关 / 今日挑战 / 好友挑战。
// 「下班！」去当前进度的关卡（新玩家是序章，老玩家和四关都打完的是自由下班）；今日挑战和好友卡永远可点，不看解锁
import { screen } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { randomSeed, daySeed } from '../core/rng.js';
import { layout, drawBackdrop, TITLE_CTX } from '../render/world.js';
import { friendFromQuery } from '../game/share.js';
import { person, idlePose, runPose } from '../render/rig.js';
import { hero, lookOf } from '../render/looks.js';
import { INK } from '../render/draw.js';
import { lunchbox, card, avatar } from '../render/ui.js';
import { gfx } from '../gfx/gfx.js';
import { BGM } from '../data/tune.js';
import { modifierOf } from '../data/modifiers.js';
import { albumCount } from '../data/album.js';
import { LEVELS, LEVEL_ORDER, levelDef } from '../data/levels.js';
import { mainTarget, starCount, cleared } from '../core/savefmt.js';
import { storyOf, friendHomeKnown, resolveStory } from '../game/story.js';

const text = (s, x, y, o) => gfx.text(s, x, y, o);
import { save, persist, dateKey } from '../save.js';

export function titleScene(game) {
  const L = layout(screen);
  let t = 0, buttons = [];
  // 好友分享卡带来的种子、关卡；「今日挑战」只有还是今天的种子才算每日挑战
  const mod = modifierOf(daySeed()), album = albumCount(new Set(save.album));
  const friend = friendFromQuery(game.launch, daySeed());

  return {
    music: () => BGM.home,
    update(dt) { t += dt; },
    render() {
      buttons = [];
      const gy = L.groundY;
      drawBackdrop(L, 40 + t * 6, 1, 0.05, TITLE_CTX);
      // 标题
      const ty = L.top + 92;
      gfx.save(); gfx.translate(L.W / 2, ty); gfx.rotate(-0.05);
      const bob = Math.sin(t * 3) * 2;
      text('狂奔吧，', -40, -26 + bob, { size: 40, color: '#fff', lw: 9 });
      text('打工人', 40, 22 - bob, { size: 50, color: '#ffd166', lw: 10 });
      gfx.restore();
      text('— 下班了，我要回家吃饭 —', L.W / 2, ty + 70, { size: 14, color: '#fff', lw: 4 });

      // 按钮区高度先算好：矮屏 / 有好友邀请时，三步图示缩小，按钮不压主角
      const stackH = (friend ? 62 : 0) + 76 + 46;
      const target = mainTarget(save), stars = LEVEL_ORDER.reduce((n, id) => n + starCount(save, id), 0);
      const room = gy - 130 - (ty + 104);                  // 标题下方到主角头顶之间的空间
      const compact = room < 92 + 24 + stackH;
      const sy = ty + (compact ? 92 : 104), sw = 108, sh = compact ? 70 : 92;
      const steps = [['躲障碍', '上滑跳 · 下滑铲'], ['两秒选回答', '左滑 / 右滑'], ['别被逮 3 次', '回家吃上热饭']];
      steps.forEach(([a, b], i) => {
        const x = 16 + i * (sw + 7);
        card(x, sy, sw, sh, 14, 'rgba(255,250,240,.94)', { lw: 2.2 });
        if (!compact) stepIcon(i, x + sw / 2, sy + 30, t);
        text(a, x + sw / 2, sy + (compact ? 26 : 62), { size: 14, color: INK });
        text(b, x + sw / 2, sy + (compact ? 46 : 80), { size: 11, color: '#8a7f95', weight: 400 });
      });
      let by = Math.max(sy + sh + (compact ? 14 : 24), gy - 250 - (friend ? 62 : 0));
      const peopleVisible = by + stackH < gy - 96;          // 按钮压到人了就不画人和气泡

      // 工位前伸懒腰的主角 + 门口探头的老刘
      if (peopleVisible) {
        person(gfx, 110, gy, hero(), { ...idlePose(t), shR: 125 + Math.sin(t * 2) * 10, elR: -20, shL: -150, elL: 20 }, { scale: 1.5 });
        const peek = 0.5 + 0.5 * Math.sin(t * 0.9);
        person(gfx, L.W - 40 + (1 - peek) * 40, gy, lookOf('laoliu'), idlePose(t), { flip: -1, scale: 1.5 });
        if (peek > 0.7 && !friend && gy - 128 > by + stackH + 6) { card(L.W - 196, gy - 128, 150, 30, 14, '#fff', { lw: 2.2, shadow: 2 }); text('小X，这么早走啊？', L.W - 121, gy - 113, { size: 13, color: INK }); }
      }

      if (friend) {
        card(40, by, L.W - 80, 50, 25, '#ff8a5c', { lw: 2.6 });
        const fl = levelDef(friend.level);
        // 第二行小字：好友开了带薪摸鱼 / 跑的是旧版路线 / 好友回的家这个版本还没有（只写一条：摸鱼 > 旧版路线 > 家）
        const note = friend.assist ? '好友开了带薪摸鱼，成绩仅供参考' : friend.stale ? '好友跑的是旧版路线，成绩仅供参考' : !friendHomeKnown(friend) ? '好友回的家你这还没有，成绩仅供参考' : '';
        // 自由下班：写好友回的是哪个家（跑同一条路、回同一个家）；好友回的家这边不认识时只写「到家」（这边按爸妈家跑，和下面的「仅供参考」一致）
        const fh = !fl && friendHomeKnown(friend) && storyOf(resolveStory({ seed: friend.seed, friend })), home = fh ? `回到${fh.fam.name}` : '到家';
        text(friend.time ? (fl ? `好友在${fl.short} ${friend.time} 到家 · 跑同一关` : `好友 ${friend.time} ${home} · 跑同一条路`) : '好友没能下班 · 替 TA 跑一次', L.W / 2, by + (note ? 19 : 25), { size: 16, color: '#fff', maxW: L.W - 96 });
        if (note) text(note, L.W / 2, by + 38, { size: 11, color: '#fff3e0', weight: 400 });
        buttons.push({ id: 'friend', x: 40, y: by, w: L.W - 80, h: 50 });
        by += 62;
      }
      const pulse = 1 + 0.03 * Math.sin(t * 5);
      gfx.save(); gfx.translate(L.W / 2, by + 32); gfx.scale(pulse);
      card(-110, -32, 220, 64, 32, '#ffd166', { lw: 3 });
      text('下班！', 0, -6, { size: 28, color: INK });
      text(target === 'full' ? '自由下班 · 约 200 秒' : LEVELS[target].name, 0, 18, { size: 11, color: '#8a5a00', weight: 400 });
      gfx.restore();
      buttons.push({ id: 'start', x: L.W / 2 - 110, y: by, w: 220, h: 64 });
      by += 76;
      // 一行两个半宽按钮：选关（小字写一共几颗星）/ 今日挑战（小字写词条或今天的最好成绩）
      const hw = 106, lx = L.W / 2 - 110, rx = L.W / 2 + 4;
      card(lx, by, hw, 46, 23, '#ffffff', { lw: 2.4 });
      text('选关', lx + hw / 2, by + 16, { size: 16, color: INK });
      text(`★ ${stars}/${LEVEL_ORDER.length * 3}`, lx + hw / 2, by + 34, { size: 11, color: '#8a7f95', weight: 400 });
      buttons.push({ id: 'levels', x: lx, y: by, w: hw, h: 46 });
      card(rx, by, hw, 46, 23, '#ffffff', { lw: 2.4 });
      const d = save.daily && save.daily.date === dateKey() ? `最佳 ${save.daily.text}` : mod.id === 'friday' ? '回奶奶家' : mod.name;   // 周五心情：全国回奶奶家（词条名在开局提示里）
      text('今日挑战', rx + hw / 2, by + 16, { size: 16, color: INK });
      text(d, rx + hw / 2, by + 34, { size: 11, color: '#8a7f95', weight: 400, maxW: hw - 14 });
      buttons.push({ id: 'daily', x: rx, y: by, w: hw, h: 46 });

      // 底部：纪录 + 开关（不和按钮重叠）
      const fy = Math.max(L.H - L.bottom - 30, by + 46 + 52);
      // 纪录：自由下班的最快到家 + 一周通勤打通几关、几颗星（只打了关卡的新玩家也有纪录可看）
      const lvDone = LEVEL_ORDER.filter(id => cleared(save, id)).length, rec = [];
      if (save.best) rec.push(`最快 ${save.best.text} 到家 · ${save.best.grade}`);
      if (lvDone) rec.push(save.best ? `★${stars}/${LEVEL_ORDER.length * 3}` : `通关 ${lvDone} 关 · ★${stars}/${LEVEL_ORDER.length * 3}`);
      text(`${rec.length ? rec.join(' · ') : '还没准点下班过'} · 共 ${save.runs} 局`, L.W / 2, fy - 34, { size: 12, color: '#fff', lw: 3, maxW: L.W - 24 });
      // 底部一排：声音 / 震动 / 主角（换男女主角）/ 图鉴
      const x0 = L.W / 2 - 166;
      const tg = (id, label, on, x) => { card(x, fy - 14, 70, 28, 14, on ? 'rgba(216,248,225,.95)' : 'rgba(238,238,238,.9)', { lw: 1.8, shadow: 0 }); text(`${label}${on ? '开' : '关'}`, x + 35, fy, { size: 12, color: INK }); buttons.push({ id, x, y: fy - 18, w: 70, h: 36 }); };
      tg('sound', '声音 ', !save.settings.mute, x0);
      tg('vibrate', '震动 ', save.settings.vibrate, x0 + 76);
      card(x0 + 152, fy - 14, 82, 28, 14, 'rgba(255,250,240,.95)', { lw: 1.8, shadow: 0 });
      avatar('player', x0 + 167, fy, 12);            // 头像框比别的小图标大一圈：女主角的马尾露得出来（取景见 ui.js 的 AVATAR_FRAME）
      text('换主角', x0 + 204, fy, { size: 12, color: INK });
      buttons.push({ id: 'hero', x: x0 + 152, y: fy - 18, w: 82, h: 36 });
      card(x0 + 240, fy - 14, 92, 28, 14, '#ffd166', { lw: 1.8, shadow: 0 });
      text(`图鉴 ${album.got}/${album.total}`, x0 + 286, fy, { size: 12, color: INK });
      buttons.push({ id: 'album', x: x0 + 240, y: fy - 18, w: 92, h: 36 });
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
    if (id === 'album') return game.go('album');
    if (id === 'hero') return game.go('hero', { back: true });
    if (id === 'levels') return game.go('levels');
    const tutorial = !save.tutorialDone;           // 全程关：不管从哪个入口进，第一局都带教学（路线不变）。关卡自己教（序章）
    if (id === 'friend') return game.go('play', { seed: friend.seed, level: friend.level, daily: friend.daily, friend, tutorial: friend.level === 'full' && tutorial });
    if (id === 'daily') return game.go('play', { seed: daySeed(), daily: true, tutorial });
    // 「下班！」：当前进度的关卡（主角开局就选好了：没选过的存档一进游戏先到选主角页，见 main.js）
    const target = mainTarget(save);
    if (target === 'full') return game.go('play', { seed: randomSeed(), tutorial });
    game.go('play', { seed: randomSeed(), level: target });
  }
}

function stepIcon(i, x, y, t) {
  if (i === 0) {
    const k = (t * 1.2) % 1, jy = -Math.sin(k * Math.PI) * 14;
    gfx.rect(x + 8, y + 2, 16, 14, { fill: '#d9a066', r: 2, stroke: INK, lw: 1.6 });
    person(gfx, x - 10, y + 16 + jy, hero(), runPose((t * 2) % 1), { scale: 0.45 });
  } else if (i === 1) {
    for (const dx of [-18, 18]) card(x + dx - 15, y - 12, 30, 24, 6, '#fff8ec', { lw: 1.6, shadow: 0 });
    text('A', x - 18, y, { size: 13, color: INK }); text('B', x + 18, y, { size: 13, color: INK });
    gfx.circle(x + Math.sin(t * 3) * 10, y + 18, 5, { fill: '#ffd166', stroke: INK, lw: 2 });
  } else {
    for (let k = 0; k < 3; k++) lunchbox(x - 26 + k * 26, y + 2, k < 2 || Math.floor(t * 2) % 2 === 0, 0.8);
  }
}
