// 跑一局：把输入翻译成动作，把逻辑事件翻译成音效 / 震动 / 粒子，画面分层绘制。
import { screen, vibrate, audio } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { makeRun, updateRun, input } from '../game/run.js';
import { makeBot } from '../game/bot.js';
import { fmtClock, clockMin } from '../game/run.js';
import { COURSE, CHOICE } from '../data/tune.js';
import { layout, drawWorld, view, NPCNAME } from '../render/world.js';
import { drawHud, drawChoice, drawShop, drawHint, drawStageBanner, drawCutscene, drawDinner, drawPause } from '../render/ui.js';
import { makeFx, burst, float, shake, flash, stepFx, shakeOffset, drawParts, drawFloats } from '../render/fx.js';
import { text, card, INK, ease, clamp } from '../render/draw.js';
import { save, persist, recordResult } from '../save.js';
import { NPCS } from '../data/npcs.js';

const STAGE_SUB = { street: '出了公司大门', park: '进了小区', home: '上楼！' };

export function playScene(game, { seed, daily = false, tutorial = false, friend = null, bot = 0 }) {
  const L = layout(screen);
  const run = makeRun({ seed, daily, tutorial, seenTips: save.tips });
  const vis = { fx: makeFx(), ghost: null, chaseFrom: null, banner: null, npcSX: 0 };
  let t = 0, paused = false, failT = 0, buttons = [];
  const botStep = bot ? makeBot({ skill: bot >= 2 ? 1 : 0.85, choose: bot >= 3 ? 'bad' : 'smart', think: 0.9 }) : null;
  audio.bgm('audio/bgm_run.mp3', 0.45);

  function handleFx() {
    const V = view(run, L), p = run.player;
    for (const e of run.fx) {
      switch (e.type) {
        case 'go': sfx.ring(); float(vis.fx, '下班！', L.W / 2, L.groundY - 200, { size: 34, color: '#ffd166', life: 1.1 }); break;
        case 'jump': sfx.jump(); burst(vis.fx, run.x - 6, 0, { n: 4, color: '#d8cfc4', speed: 60, up: 20, life: 0.35, size: 3 }); break;
        case 'land': sfx.land(); break;
        case 'slide': sfx.slide(); burst(vis.fx, run.x - 14, -2, { n: 5, color: '#d8cfc4', speed: 70, up: 30, life: 0.4 }); break;
        case 'fastfall': sfx.whoosh(); break;
        case 'hit': sfx.hit(); vibrate('heavy'); shake(vis.fx, 5, 0.18); burst(vis.fx, run.x + 8, -50, { n: 5, color: '#ffd166', kind: 'star', speed: 90, up: 60, life: 0.7, size: 3 }); break;
        case 'splash': sfx.whoosh(); burst(vis.fx, run.x, -4, { n: 12, color: '#7fb8e6', speed: 110, up: 140, life: 0.5, size: 3 }); float(vis.fx, '裤腿湿了', run.x, -80, { space: 'world', size: 13, color: '#bfe3ff' }); break;
        case 'near': sfx.pop(); float(vis.fx, '惊险！+30', TUNE_PX(), L.groundY - 120, { size: 18, color: '#ffd166' }); break;
        case 'coin': sfx.coin(); burst(vis.fx, e.x, e.y, { n: 4, color: '#f7c948', speed: 60, up: 40, life: 0.3, size: 2 }); break;
        case 'bun': sfx.good(); float(vis.fx, '包子 +8', TUNE_PX(), L.groundY - 120, { size: 16, color: '#fff' }); break;
        case 'choice': sfx.pop(); vibrate('light'); break;
        case 'hurry': sfx.tick(); break;
        case 'good': {
          sfx.good(); vibrate('medium');
          const c = run.choice;
          if (c && c.kind === 'npc') { const wx = V.camX + vis.npcSX / V.z; vis.ghost = { npc: e.npc, wx, good: true, t }; burst(vis.fx, wx, -40, { n: 14, color: '#fff', kind: 'paper', speed: 140, up: 120, life: 0.9, size: 3 }); }
          float(vis.fx, e.quick ? '秒选！+150' : '+100', L.W / 2, L.groundY - 300, { size: 20, color: '#2ecc71' });
          break;
        }
        case 'mid': sfx.click(); break;
        case 'bad': sfx.bad(); vibrate('heavy'); shake(vis.fx, 4, 0.15); if (e.npc !== 'mom') vis.chaseFrom = { sx: vis.npcSX || 200, t }; break;
        case 'escape': sfx.good(); float(vis.fx, `甩掉${NPCNAME(e.npc)}了！`, L.W / 2, L.groundY - 160, { size: 20, color: '#2ecc71' }); break;
        case 'caught': sfx.caught(); vibrate('heavy'); shake(vis.fx, 8, 0.25); flash(vis.fx, '#e74c3c', 0.5); break;
        case 'restore': float(vis.fx, '和解！饭盒 +1', L.W / 2, L.groundY - 330, { size: 20, color: '#ffd166', life: 1.4 }); break;
        case 'hole': sfx.hit(); vibrate('heavy'); shake(vis.fx, 6, 0.2); break;
        case 'ride': sfx.speedup(); break;
        case 'rideEnd': sfx.whoosh(); break;
        case 'shop': sfx.pop(); break;
        case 'buy': sfx.coin(); break;
        case 'broke': sfx.bad(); float(vis.fx, '钱不够……', L.W / 2, L.groundY - 260, { size: 18, color: '#e74c3c' }); break;
        case 'leave': sfx.click(); break;
        case 'answer': case 'hangup': sfx.click(); break;
        case 'stage': vis.banner = { name: e.name, sub: `${fmtClock(clockMin(run))} · ${STAGE_SUB[e.id] || ''}`, t }; sfx.whoosh(); break;
        case 'tip': sfx.pop(); break;
        case 'arrive': sfx.win(); audio.stopBgm(); break;
        case 'fail': sfx.lose(); vibrate('heavy'); audio.stopBgm(); break;
        default: break;
      }
    }
    run.fx.length = 0;
    void p;
  }
  const TUNE_PX = () => 120;

  function finish() {
    const flags = recordResult(run.done, [...run.tips]);
    game.go('result', { result: run.done, flags, friend });
  }

  return {
    update(dt) {
      if (paused) return;
      t += dt;
      if (botStep) botStep(run);
      updateRun(run, dt);
      handleFx();
      stepFx(vis.fx, dt);
      if (run.done) {
        if (run.done.win) finish();
        else { failT += dt; if (failT > 2.0) finish(); }
      }
    },
    render(g) {
      buttons = [];
      const [sx, sy] = shakeOffset(vis.fx);
      g.save(); g.translate(sx, sy);
      if (run.ending && run.ending.t > 0.9) {
        drawDinner(g, L, run.ending.result, t);
        const a = clamp(1 - (run.ending.t - 0.9) / 0.3, 0, 1);
        if (a > 0) { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, 0, L.W, L.H); }
        g.restore();
        return;
      }
      drawWorld(g, run, L, vis, t);
      if (run.ending && run.ending.t > 0.6) { g.fillStyle = `rgba(255,255,255,${clamp((run.ending.t - 0.6) / 0.3, 0, 1)})`; g.fillRect(0, 0, L.W, L.H); }
      g.restore();
      // 读题时四角压暗
      if (run.choice && run.choice.phase === 'open') {
        const k = clamp(run.choice.t / 0.15, 0, 1) * 0.35;
        const gr = g.createRadialGradient(L.W / 2, L.groundY - 100, 160, L.W / 2, L.groundY - 100, 420);
        gr.addColorStop(0, 'rgba(20,10,30,0)'); gr.addColorStop(1, `rgba(20,10,30,${k})`);
        g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
      }
      drawHud(g, run, L, t, buttons);
      drawStageBanner(g, L, vis.banner, t);
      drawChoice(g, run, L, vis, t, buttons);
      drawCutscene(g, run, L, t);
      drawShop(g, run, L, t, buttons);
      drawHint(g, run, L, t);
      drawParts(g, vis.fx, 'screen');
      drawFloats(g, vis.fx, 'screen');
      if (vis.fx.flash > 0) { g.fillStyle = vis.fx.flashColor; g.globalAlpha = vis.fx.flash * 0.5; g.fillRect(0, 0, L.W, L.H); g.globalAlpha = 1; }
      if (run.intro > 0) introCard(g, L, run, t);
      if (run.done && !run.done.win) failCard(g, L, run.done, failT);
      if (paused) { buttons.length = 0; drawPause(g, L, save.settings, buttons); }   // 暂停时只有暂停菜单能点
    },
    input(e) {
      if (e.type === 'key' && (e.key === 'Escape' || e.key === 'p')) { paused ? resume() : pause(); return; }
      if (e.type === 'key' && e.key === 'Enter' && paused) { resume(); return; }
      if (e.type === 'tap' || e.type === 'down') {
        const b = buttons.slice().reverse().find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
        if (e.type === 'down') return;
        if (b) return onButton(b);
        if (paused || run.shop) return;            // 便利店里点空白处什么都不做（之前会当成「上滑」买了关东煮）
        input(run, 'jump');
        return;
      }
      if (paused) return;
      if (e.type === 'swipe') input(run, e.dir === 'up' ? 'jump' : e.dir === 'down' ? 'slide' : e.dir);
      if (e.type === 'key') {
        const k = e.key;
        if (k === 'ArrowUp' || k === ' ' || k === 'w') input(run, 'jump');
        else if (k === 'ArrowDown' || k === 's') input(run, 'slide');
        else if (k === 'ArrowLeft' || k === 'a') input(run, 'left');
        else if (k === 'ArrowRight' || k === 'd') input(run, 'right');
        else if (k === '1' || k === '2' || k === '3') input(run, 'card', +k - 1);
      }
    },
    onHide() { if (!run.ending && !run.done) pause(); },   // 吃饭演出没有操作，切后台回来让它接着放
    wantsMusic() { return !paused && !run.done && !run.ending; },
    skip(sec, until) { for (let i = 0; i < sec * 60 && !run.done; i++) { this.update(1 / 60); if (until && until(run)) break; } },   // 调试：快进
    get run() { return run; },
  };

  function pause() { if (!paused) { paused = true; audio.stopBgm(); keepTips(); } }
  function resume() { if (paused) { paused = false; audio.bgm('audio/bgm_run.mp3', 0.45); } }
  function keepTips() { save.tips = [...new Set([...save.tips, ...run.tips])]; persist(); }

  function onButton(b) {
    sfx.click();
    switch (b.id) {
      case 'pause': pause(); break;
      case 'resume': resume(); break;
      case 'restart': keepTips(); game.go('play', { seed: daily || friend ? seed : (Math.random() * 1e9) >>> 0, daily, friend, tutorial }); break;
      case 'home': keepTips(); audio.stopBgm(); game.go('title'); break;
      case 'sound': save.settings.mute = !save.settings.mute; game.applySettings(); persist(); break;
      case 'vibrate': save.settings.vibrate = !save.settings.vibrate; game.applySettings(); persist(); break;
      case 'card': {
        // 弹题后 0.15 秒内的点击不算选择（防误触），但也别吞掉：当成跳
        const c = run.choice;
        if (c && c.phase === 'open' && c.t < CHOICE.guard && !c.hold) input(run, 'jump'); else input(run, 'card', b.arg);
        break;
      }
      case 'buy': input(run, 'card', b.arg); break;
      case 'leave': input(run, 'leave'); break;
      default: break;
    }
  }
}

function introCard(g, L, run, t) {
  const k = clamp(run.intro / 0.3, 0, 1);
  g.save(); g.globalAlpha = k;
  text(g, '17:59:5' + Math.min(9, Math.floor((1.1 - run.intro) * 9)), L.W / 2, L.groundY - 260, { size: 30, color: '#fff', lw: 6 });
  text(g, '下班倒计时……', L.W / 2, L.groundY - 226, { size: 15, color: '#fff', lw: 4 });
  g.restore();
  void t;
}

function failCard(g, L, res, ft) {
  const k = ease.outCubic(clamp(ft / 0.4, 0, 1));
  g.fillStyle = `rgba(30,20,40,${0.65 * k})`; g.fillRect(0, 0, L.W, L.H);
  g.save(); g.translate(L.W / 2, L.H * 0.42); g.rotate(-0.12); g.scale(0.6 + 0.4 * ease.outBack(clamp(ft / 0.35, 0, 1)), 0.6 + 0.4 * ease.outBack(clamp(ft / 0.35, 0, 1)));
  g.lineWidth = 6; g.strokeStyle = '#e74c3c'; g.strokeRect(-110, -40, 220, 80);
  text(g, res.reason === 'starve' ? '饿晕了' : '没能下班', 0, 2, { size: 40, color: '#e74c3c' });
  g.restore();
  g.globalAlpha = k;
  text(g, res.meal.text, L.W / 2, L.H * 0.42 + 80, { size: 16, color: '#fff', lw: 3, maxW: L.W - 40 });
  text(g, `今晚的饭：${res.meal.name}`, L.W / 2, L.H * 0.42 + 112, { size: 20, color: '#ffd166', lw: 4, maxW: L.W - 40 });
  g.globalAlpha = 1;
}

export { NPCS, COURSE, card, INK };
