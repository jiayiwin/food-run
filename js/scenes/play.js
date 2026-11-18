// 跑一局：把输入翻译成动作，把逻辑事件翻译成音效 / 震动 / 粒子，画面分层绘制。
import { screen, vibrate, audio } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { makeRun, updateRun, input } from '../game/run.js';
import { makeBot } from '../game/bot.js';
import { fmtClock, clockMin } from '../game/run.js';
import { COURSE, CHOICE, BGM } from '../data/tune.js';
import { layout, drawWorld, view, NPCNAME } from '../render/world.js';
import { drawHud, drawChoice, drawShop, drawHint, drawStageBanner, drawCutscene, drawDinner, drawPause, warmQueue } from '../render/ui.js';
import { makeFx, burst, float, shake, flash, stepFx, shakeOffset, drawParts, drawFloats } from '../render/fx.js';
import { ease, clamp, lerp } from '../render/draw.js';
import { gfx } from '../gfx/gfx.js';
import { bake } from '../gfx/tex.js';
import { save, persist, recordResult } from '../save.js';
import { NPCS } from '../data/npcs.js';

const STAGE_SUB = { street: '出了公司大门', park: '进了小区', home: '上楼！' };

export function playScene(game, { seed, daily = false, tutorial = false, friend = null, bot = 0 }) {
  const L = layout(screen);
  const run = makeRun({ seed, daily, tutorial, seenTips: save.tips });
  const vis = {
    fx: makeFx(), ghost: null, chaseFrom: null, banner: null, npcSX: 0,
    stop: 0,                        // 顿帧：撞上的瞬间世界停一下
    sq: 0, sqV: 0, fastFall: false, // 主角拉伸 / 压扁（弹簧）
    comboTier: 0, coinN: 0, coinT: -9, foot: 0, heart: 0, danger: 0,
  };
  let t = 0, paused = false, failT = 0, buttons = [];
  const taken = new Set(), downs = new Map();   // taken：这次触摸已经用 press 跳过了，抬手不再算一次
  const botStep = bot ? makeBot({ skill: bot >= 2 ? 1 : 0.85, choose: bot >= 3 ? 'bad' : 'smart', think: 0.9 }) : null;

  function handleFx() {
    const V = view(run, L), p = run.player;
    for (const e of run.fx) {
      switch (e.type) {
        case 'go': sfx.ring(); float(vis.fx, '下班！', L.W / 2, L.groundY - 268, { size: 34, color: '#ffd166', life: 1.1 }); break;
        case 'jump': sfx.jump(); vis.sqV += 3.2; burst(vis.fx, run.x - 6, 0, { n: 4, color: '#d8cfc4', speed: 60, up: 20, life: 0.35, size: 3 }); break;
        case 'land': {
          const heavy = vis.fastFall; vis.fastFall = false;
          sfx.land(heavy); vis.sq = heavy ? -0.28 : -0.16;
          burst(vis.fx, run.x, p.y - 2, { n: heavy ? 8 : 3, color: '#d8cfc4', speed: heavy ? 120 : 60, up: 20, life: 0.3, size: heavy ? 3.2 : 2.4 });
          if (heavy) shake(vis.fx, 2.5, 0.09);
          break;
        }
        case 'slide': sfx.slide(); burst(vis.fx, run.x - 14, -2, { n: 5, color: '#d8cfc4', speed: 70, up: 30, life: 0.4 }); break;
        case 'fastfall': sfx.whoosh(); vis.fastFall = true; vis.sq = 0.2; break;
        case 'hit': sfx.hit(); vibrate('heavy'); vis.stop = 0.07; vis.sq = -0.22; shake(vis.fx, 5, 0.18); burst(vis.fx, run.x + 8, -50, { n: 5, color: '#ffd166', kind: 'star', speed: 90, up: 60, life: 0.7, size: 3 }); break;
        case 'splash': sfx.whoosh(); burst(vis.fx, run.x, -4, { n: 12, color: '#7fb8e6', speed: 110, up: 140, life: 0.5, size: 3 }); float(vis.fx, '裤腿湿了', run.x, -80, { space: 'world', size: 13, color: '#bfe3ff' }); break;
        case 'near': sfx.near(); burst(vis.fx, run.x, p.y - 30, { n: 6, color: '#ffd166', kind: 'star', speed: 100, up: 30, life: 0.5, size: 2.5 }); float(vis.fx, '惊险！+30', TUNE_PX(), L.groundY - 120, { size: 18, color: '#ffd166' }); break;
        case 'coin':
          vis.coinN = t - vis.coinT < 0.9 ? Math.min(vis.coinN + 1, 12) : 0; vis.coinT = t;
          sfx.coin(vis.coinN); burst(vis.fx, e.x, e.y, { n: 4, color: '#f7c948', speed: 60, up: 40, life: 0.3, size: 2 });
          break;
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
        case 'caught': sfx.caught(); vibrate('heavy'); vis.stop = 0.12; shake(vis.fx, 8, 0.25); flash(vis.fx, '#e74c3c', 0.5); break;
        case 'restore': float(vis.fx, '和解！饭盒 +1', L.W / 2, L.groundY - 330, { size: 20, color: '#ffd166', life: 1.4 }); break;
        case 'hole': sfx.hit(); vibrate('heavy'); vis.stop = 0.06; shake(vis.fx, 6, 0.2); break;
        case 'ride': sfx.speedup(); break;
        case 'rideEnd': sfx.whoosh(); break;
        case 'shop': sfx.pop(); break;
        case 'buy': sfx.coin(); break;
        case 'broke': sfx.bad(); float(vis.fx, '钱不够……', L.W / 2, L.groundY - 260, { size: 18, color: '#e74c3c' }); break;
        case 'leave': sfx.click(); break;
        case 'answer': case 'hangup': sfx.click(); break;
        case 'stage': vis.banner = { name: e.name, sub: `${fmtClock(clockMin(run))} · ${STAGE_SUB[e.id] || ''}`, t }; sfx.whoosh(); break;
        case 'tip': sfx.pop(); break;
        case 'arrive': sfx.win(); audio.bgm(...BGM.home); break;
        case 'fail': sfx.lose(); vibrate('heavy'); audio.stopBgm(); break;
        default: break;
      }
    }
    run.fx.length = 0;
    // 连击里程碑：每 10 连庆祝一次
    const tier = Math.floor(run.combo / 10);
    if (tier > vis.comboTier) {
      sfx.combo(tier); vibrate('light');
      float(vis.fx, `连击 ${tier * 10}！`, L.W / 2, L.hudY + 104, { size: 26, color: '#ffd166', life: 1.1 });   // 放在 HUD 下方：不压题目气泡
    }
    vis.comboTier = tier;
  }
  // 每帧的小表现：拉伸弹簧、脚下扬尘、被追上时的心跳
  function ambient(dt) {
    const p = run.player;
    vis.sqV += (-320 * vis.sq - 22 * vis.sqV) * dt;
    vis.sq = clamp(vis.sq + vis.sqV * dt, -0.3, 0.3);
    const foot = Math.floor(p.runPhase * 2);
    if (foot !== vis.foot) {
      vis.foot = foot;
      if (p.onGround && p.state === 'run' && !run.ride && !run.cutscene && !run.ending && run.v > 120) burst(vis.fx, run.x - 10, -2, { n: 1, color: '#d8cfc4', speed: 20, up: 25, life: 0.35, size: 2.5, gravity: -30 });
    }
    const ch = run.chaser;
    vis.danger += ((ch && !run.cutscene ? clamp(1 - ch.gap / 60, 0, 1) : 0) - vis.danger) * Math.min(1, dt * 6);
    vis.heart -= dt;
    if (vis.danger > 0.05 && vis.heart <= 0) { sfx.heart(); vis.heart = lerp(0.72, 0.4, vis.danger); }
  }
  const TUNE_PX = () => 120;
  // 文字预热：每帧最多生成 3 个，提前把下一道题的字准备好
  let warmFor = null, warmList = [];
  function warmStep() {
    const q = run.pending && run.pending.q;
    if (q && q !== warmFor) { warmFor = q; warmList = warmQueue(q, L); }
    for (let i = 0; i < 3 && warmList.length; i++) { const [s, o] = warmList.shift(); gfx.warm(s, o); }
  }

  function finish() {
    const flags = recordResult(run.done, [...run.tips], run.said);
    game.go('result', { result: run.done, flags, friend });
  }

  return {
    update(dt) {
      if (paused) return;
      if (vis.stop > 0) { vis.stop -= dt; stepFx(vis.fx, dt); return; }   // 顿帧：世界停住，粒子继续飞
      t += dt;
      if (botStep) botStep(run);
      updateRun(run, dt);
      handleFx();
      ambient(dt);
      stepFx(vis.fx, dt);
      if (run.done) {
        if (run.done.win) finish();
        else { failT += dt; if (failT > 2.0) finish(); }
      }
    },
    render() {
      buttons = [];
      const [sx, sy] = shakeOffset(vis.fx);
      gfx.save(); gfx.translate(sx, sy);
      if (run.ending && run.ending.t > 0.9) {
        drawDinner(L, run.ending.result, t);
        const a = clamp(1 - (run.ending.t - 0.9) / 0.3, 0, 1);
        if (a > 0) gfx.rect(0, 0, L.W, L.H, { fill: '#fff', alpha: a });
        gfx.restore();
        return;
      }
      warmStep();
      drawWorld(run, L, vis, t);
      if (run.ending && run.ending.t > 0.6) gfx.rect(0, 0, L.W, L.H, { fill: '#fff', alpha: clamp((run.ending.t - 0.6) / 0.3, 0, 1) });
      gfx.restore();
      // 追兵贴上来：屏幕四周泛红，越近越重
      if (vis.danger > 0.02) {
        const tex = bake(`vigDanger|${L.H}`, [0, 0, L.W, L.H], g => {
          const gr = g.createRadialGradient(L.W / 2, L.groundY - 120, 90, L.W / 2, L.groundY - 120, 330);
          gr.addColorStop(0, 'rgba(231,76,60,0)'); gr.addColorStop(1, 'rgba(231,76,60,0.85)');
          g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
        }, { res: 0.5 });
        gfx.draw(tex, 0, 0, { alpha: vis.danger * (0.6 + 0.25 * Math.sin(t * 9)) });
      }
      // 读题时四角压暗（径向渐变烘焙一次，按强度调透明度）
      if (run.choice && run.choice.phase === 'open') {
        const k = clamp(run.choice.t / 0.15, 0, 1);
        const tex = bake(`vigChoice|${L.H}`, [0, 0, L.W, L.H], g => {
          const gr = g.createRadialGradient(L.W / 2, L.groundY - 100, 160, L.W / 2, L.groundY - 100, 420);
          gr.addColorStop(0, 'rgba(20,10,30,0)'); gr.addColorStop(1, 'rgba(20,10,30,0.35)');
          g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
        }, { res: 0.5 });
        gfx.draw(tex, 0, 0, { alpha: k });
      }
      drawHud(run, L, t, buttons);
      drawStageBanner(L, vis.banner, t);
      drawChoice(run, L, vis, t, buttons);
      drawCutscene(run, L, t);
      drawShop(run, L, t, buttons);
      if (!run.done) drawHint(run, L, t);          // 失败卡下面不留冻住的提示
      drawParts(vis.fx, 'screen');
      drawFloats(vis.fx, 'screen');
      if (vis.fx.flash > 0) gfx.rect(0, 0, L.W, L.H, { fill: vis.fx.flashColor, alpha: vis.fx.flash * 0.5 });
      if (run.intro > 0) introCard(L, run);
      if (run.done && !run.done.win) failCard(L, run.done, failT);
      if (paused) { buttons.length = 0; drawPause(L, save.settings, buttons); }   // 暂停时只有暂停菜单能点
    },
    input(e) {
      if (e.type === 'key' && (e.key === 'Escape' || e.key === 'p')) { paused ? resume() : pause(); return; }
      if (e.type === 'key' && e.key === 'Enter' && paused) { resume(); return; }
      if (e.type === 'down') { taken.delete(e.id); downs.set(e.id, e.t); return; }
      const hit = () => buttons.slice().reverse().find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (e.type === 'press') {                    // 按住不动：不等抬手先跳。按在按钮上的留给抬手时的 tap
        if (paused || run.shop || hit()) return;
        taken.add(e.id);
        input(run, 'jump');
        return;
      }
      if (e.type === 'tap') {
        if (taken.has(e.id)) return;               // 已经跳过了；抬手时冒出来的选项卡也不算选中
        const b = hit();
        if (b) return onButton(b, e);
        if (paused || run.shop) return;            // 便利店里点空白处什么都不做（之前会当成「上滑」买了关东煮）
        input(run, 'jump');
        return;
      }
      if (paused) return;
      if (e.type === 'swipe') {
        if (e.dir === 'up' && taken.has(e.id)) return;   // 按住后又往上划：同一下，不跳两次
        input(run, e.dir === 'up' ? 'jump' : e.dir === 'down' ? 'slide' : e.dir);
      }
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
    music() { return paused || run.done ? null : run.ending ? BGM.home : BGM.run; },
    skip(sec, until) { for (let i = 0; i < sec * 60 && !run.done; i++) { this.update(1 / 60); if (until && until(run)) break; } },   // 调试：快进
    get run() { return run; },
  };

  function pause() { if (!paused) { paused = true; audio.stopBgm(); keepTips(); } }
  function resume() { if (paused) { paused = false; audio.bgm(...BGM.run); } }
  function keepTips() { save.tips = [...new Set([...save.tips, ...run.tips])]; persist(); }

  function onButton(b, e) {
    sfx.click();
    switch (b.id) {
      case 'pause': pause(); break;
      case 'resume': resume(); break;
      case 'restart': keepTips(); game.go('play', { seed: daily || friend ? seed : (Math.random() * 1e9) >>> 0, daily, friend, tutorial }); break;
      case 'home': keepTips(); audio.stopBgm(); game.go('title'); break;
      case 'sound': save.settings.mute = !save.settings.mute; game.applySettings(); persist(); break;
      case 'vibrate': save.settings.vibrate = !save.settings.vibrate; game.applySettings(); persist(); break;
      case 'card': {
        // 弹题后 0.15 秒内的点击、弹题前就按下的手指都不算选择（防误触），但也别吞掉：当成跳
        const c = run.choice, heldFor = (e.t - (downs.has(e.id) ? downs.get(e.id) : e.t)) / 1000;
        if (c && c.phase === 'open' && !c.hold && (c.t < CHOICE.guard || heldFor >= c.t)) input(run, 'jump'); else input(run, 'card', b.arg);
        break;
      }
      case 'buy': input(run, 'card', b.arg); break;
      case 'leave': input(run, 'leave'); break;
      default: break;
    }
  }
}

function introCard(L, run) {
  gfx.save(); gfx.alpha(clamp(run.intro / 0.3, 0, 1));
  gfx.text('17:59:5' + Math.min(9, Math.floor((1.1 - run.intro) * 9)), L.W / 2, L.groundY - 260, { size: 30, color: '#fff', lw: 6, id: 'intro-clock' });
  gfx.text('下班倒计时……', L.W / 2, L.groundY - 226, { size: 15, color: '#fff', lw: 4 });
  gfx.restore();
}

function failCard(L, res, ft) {
  const k = ease.outCubic(clamp(ft / 0.4, 0, 1));
  gfx.rect(0, 0, L.W, L.H, { fill: '#1e1428', alpha: 0.65 * k });
  const s = 0.6 + 0.4 * ease.outBack(clamp(ft / 0.35, 0, 1));
  gfx.save(); gfx.translate(L.W / 2, L.H * 0.42); gfx.rotate(-0.12); gfx.scale(s);
  gfx.rect(-110, -40, 220, 80, { stroke: '#e74c3c', lw: 6, r: 2, fill: 'rgba(0,0,0,0)' });
  gfx.text(res.reason === 'starve' ? '饿晕了' : '没能下班', 0, 2, { size: 40, color: '#e74c3c' });
  gfx.restore();
  gfx.save(); gfx.alpha(k);
  gfx.text(res.meal.text, L.W / 2, L.H * 0.42 + 80, { size: 16, color: '#fff', lw: 3, maxW: L.W - 40 });
  gfx.text(`今晚的饭：${res.meal.name}`, L.W / 2, L.H * 0.42 + 112, { size: 20, color: '#ffd166', lw: 4, maxW: L.W - 40 });
  gfx.restore();
}

export { NPCS, COURSE };
