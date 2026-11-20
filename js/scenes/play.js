// 跑一局：把输入翻译成动作，把逻辑事件翻译成音效 / 震动 / 粒子，画面分层绘制。
import { screen, vibrate, audio } from '../platform/index.js';
import { sfx } from '../platform/sfx.js';
import { makeRun, updateRun, input } from '../game/run.js';
import { makeBot } from '../game/bot.js';
import { swipeMode, classifySwipe, noteSwipe } from '../core/swipe.js';
import { fmtClock, clockMin } from '../game/run.js';
import { CHOICE, BGM } from '../data/tune.js';
import { layout, drawWorld, view, NPCNAME, cutCorridor } from '../render/world.js';
import { drawHud, drawChoice, drawShop, drawHint, drawStageBanner, drawCutscene, drawDinner, prepareDinner, DINNER_PREP_STEPS, drawPause, warmQueue, avatar, card } from '../render/ui.js';
import { makeFx, burst, float, shake, flash, stepFx, shakeOffset, drawParts, drawFloats } from '../render/fx.js';
import { ease, clamp, lerp } from '../render/draw.js';
import { gfx } from '../gfx/gfx.js';
import { bake } from '../gfx/tex.js';
import { save, persist, recordResult } from '../save.js';
import { NPCS } from '../data/npcs.js';
import { splashState } from '../game/course.js';
import { rideNear } from '../render/traffic.js';
import { drawCrossBoard, crossBeepGap, crossCar, crossLamp } from '../render/cross.js';
import { drawRoom } from '../render/lift.js';
import { ART, propArt } from '../render/art.js';
import { LIFT } from '../data/events.js';
import { stageBanner } from '../game/level.js';
import { resolveStory } from '../game/story.js';
import { levelDef } from '../data/levels.js';
import { modifierOf } from '../data/modifiers.js';

const STAGE_SUB = { stairs: '走安全通道', street: '出了公司大门', park: '进了小区', home: '上楼！' };

// assist：带薪摸鱼（只在关卡里有，结算页同一关连败 2 次后开）
// story：家庭剧本的故事（调试参数 ?story=cat.catfood）。不传就按规则抽：关卡写死 > 今日挑战按当天 > 好友卡的 h > 自由下班按种子
export function playScene(game, { seed, level = 'full', daily = false, tutorial = false, friend = null, bot = 0, xlight = null, route = null, assist = false, story = null }) {
  const L = layout(screen);
  // 学会的机制从存档来：关卡里学过的不再定格教学；全程关没学过电梯的，外卖那一拍不出关门键（软版本：小哥直接进来，没有惩罚）
  const learned = save.learned || [];
  const home = story || resolveStory({ seed, daily, mod: daily ? modifierOf(seed) : null, level: levelDef(level), friend });
  // quiet：好友卡带来的新玩家第一局，不显示家规提示和开局交代那一行（家里交代的事照样有效）
  const run = makeRun({ seed, level, daily, tutorial, seenTips: save.tips, xlight, route, learned, assist, liftBtn: level !== 'full' || learned.includes('lift'), story: home, quiet: !!(friend && tutorial) });   // xlight / route：调试参数，覆盖路口灯态 / 路线卡超时默认走哪条
  const vis = {
    fx: makeFx(), ghost: null, chaseFrom: null, banner: null, npcSX: 0,
    stop: 0,                        // 顿帧：撞上的瞬间世界停一下
    sq: 0, sqV: 0, fastFall: false, // 主角拉伸 / 压扁（弹簧）
    comboTier: 0, coinN: 0, coinT: -9, foot: 0, heart: 0, danger: 0,
    traffic: null, dashNo: null, rideEnd: null, splashed: new Set(),   // 马路车流、冲刺灰环、下车、已经溅起的水墙（画面状态，不进 run）
    xboard: null, beepT: 0, xbuzz: -1, xcar: -1, bannerLater: null,       // 路口：灯牌淡出、提示音节奏、最后 0.5 秒震一下、横穿车的声音、路口里推迟的路段字卡
    dinnerPrep: 0, doorWho: null, doorFade: null,                         // 饭桌贴图预烘焙到第几张；家门口此刻的答题人、换人时的淡入淡出
  };
  let t = 0, paused = false, failT = 0, buttons = [];
  const taken = new Set(), downs = new Map();   // taken：这次触摸已经用 press 跳过了，抬手不再算一次
  // 调试机器人：1 老手、2 高手、3 高手但每题选错（被追时冲刺）、4 每题选错且从不冲刺（看鞋底提示环）
  //   路线卡：机器人缺省坐电梯，?route=stairs 走楼梯
  const botStep = bot ? makeBot({ skill: bot >= 2 ? 1 : 0.85, choose: bot >= 3 ? 'bad' : 'smart', think: 0.9, dash: bot !== 4, route: route || 'lift' }) : null;

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
        case 'splash':
          sfx.whoosh(); burst(vis.fx, run.x, -4, { n: e.car ? 18 : 12, color: '#7fd4ff', speed: 110, up: e.car ? 200 : 140, life: 0.5, size: 3 });
          float(vis.fx, e.car ? '被车溅了一身！' : '裤腿湿了', run.x, -80, { space: 'world', size: 13, color: '#bfe3ff' });
          break;
        case 'dash': sfx.dash(); vibrate('light'); burst(vis.fx, run.x - 14, -2, { n: 6, color: '#bff3ff', speed: 90, up: 20, life: 0.35, size: 2.6 }); break;
        case 'dashNo': case 'dashCd':
          vis.dashNo = t;
          if (e.held && run.cross && vis.xno !== run.cross.i) { vis.xno = run.cross.i; float(vis.fx, '红灯，冲不了', run.x, -96, { space: 'world', size: 13, color: '#ffb3b3' }); }   // 被追时停在红灯前右滑：每个路口说一次
          break;
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
          if (c && c.kind === 'npc' && !c.room) { const wx = V.camX + vis.npcSX / V.z; vis.ghost = { npc: e.npc, wx, good: true, t }; burst(vis.fx, wx, -40, { n: 14, color: '#fff', kind: 'paper', speed: 140, up: 120, life: 0.9, size: 3 }); }
          float(vis.fx, e.quick ? '秒选！+150' : '+100', L.W / 2, L.groundY - 300, { size: 20, color: '#2ecc71' });
          break;
        }
        case 'mid': sfx.click(); break;
        case 'bad': sfx.bad(); vibrate('heavy'); shake(vis.fx, 4, 0.15); if (!e.door && !e.room) vis.chaseFrom = { sx: vis.npcSX || 200, t }; if (e.room) float(vis.fx, '出了电梯再算账！', L.W / 2, L.groundY - 312, { size: 16, color: '#ff8a7a' }); break;   // 家门口答坏不追
        case 'chase': if (e.line) vis.chaseFrom = { sx: -40, t }; break;      // 追逐槽：追兵从屏幕左边外冲进来
        case 'teach': sfx.pop(); vibrate('light'); break;
        case 'escape': sfx.good(); float(vis.fx, e.cross ? `红灯拦住${NPCNAME(e.npc)}了！` : `甩掉${NPCNAME(e.npc)}了！`, L.W / 2, L.groundY - 160, { size: 20, color: '#2ecc71' }); break;
        case 'crossShow': vibrate('light'); vis.beepT = 0; break;
        case 'crossStop': sfx.crossStop(); break;
        case 'crossGo': sfx.crossGo(); break;
        case 'crossDash': float(vis.fx, '抢到绿灯！+100', L.W / 2 - 20, L.groundY - 270, { size: 20, color: '#3fdc7a' }); break;
        case 'crossDone': if (vis.bannerLater) { vis.banner = { ...vis.bannerLater, t }; vis.bannerLater = null; } break;
        case 'caught': sfx.caught(); vibrate('heavy'); vis.stop = 0.12; shake(vis.fx, 8, 0.25); flash(vis.fx, '#e74c3c', 0.5); break;
        case 'restore': float(vis.fx, '和解！饭盒 +1', L.W / 2, L.groundY - 330, { size: 20, color: '#ffd166', life: 1.4 }); break;
        case 'hole': sfx.hit(); vibrate('heavy'); vis.stop = 0.06; shake(vis.fx, 6, 0.2); break;
        case 'ride': sfx.speedup(); vis.rideEnd = null; break;
        case 'rideEnd': sfx.whoosh(); vis.rideEnd = t; break;
        case 'shop': sfx.pop(); break;
        case 'buy': sfx.coin(); break;
        case 'broke': sfx.bad(); float(vis.fx, '钱不够……', L.W / 2, L.groundY - 260, { size: 18, color: '#e74c3c' }); break;
        case 'leave': sfx.click(); break;
        case 'answer': case 'hangup': sfx.click(); break;
        case 'stage': {
          if (!stageBanner(run.lv, e.id)) break;      // 小路段（楼梯间之类）不出字卡
          const b = { name: e.name, sub: `${fmtClock(clockMin(run))} · ${STAGE_SUB[e.id] || ''}`, t };
          if (run.cross && run.cross.phase !== 'far') vis.bannerLater = b; else vis.banner = b;   // 路口里不出字卡（和灯牌抢位置），过完再出
          sfx.whoosh(); break;
        }
        case 'tip': sfx.pop(); break;
        // 家庭剧本：交代了事（便签弹出来）、快到能办的地方（便签跳一下、叮一声）、办好了（飘字 + 金币音）、跳起来拿到（撒小粒子）
        case 'errandGive': sfx.pop(); vibrate('light'); break;
        case 'errandNear': sfx.ding(); break;
        case 'errandDone': sfx.coin(6); float(vis.fx, `${e.name} ✓`, L.W / 2, L.groundY - 280, { size: 20, color: '#ffd166', life: 1.2 }); break;
        case 'grab': burst(vis.fx, e.x, e.y, { n: 10, color: '#ffd166', kind: 'star', speed: 90, up: 40, life: 0.6, size: 2.6 }); break;
        // 电梯 / 楼梯
        case 'route':                              // 选了电梯：轿厢、门框、门扇插到预上传队列最前面（离门还有约 3 秒，进门那一帧不卡）
          sfx.click();
          if (e.route === 'lift') for (const id of ['liftLeaf', 'liftHall', 'liftCab']) { const a = propArt(id); if (a) ART.uploadQueue.unshift(a.img); }
          break;
        case 'liftIn': if (!e.shut) sfx.doorClose(); audio.duck(0.6); break;   // 电梯里跑酷 BGM 压低 40%，不换曲；门夹追兵那一帧的关门声由 doorShut 放（只响一次）
        case 'doorShut':
          vis.stop = 0.12; sfx.doorClose(); vibrate('heavy'); shake(vis.fx, 6, 0.2);
          float(vis.fx, `门夹住${NPCNAME(e.npc)}了！+200`, L.W / 2, L.groundY - 312, { size: 20, color: '#2ecc71', life: 1.4 });
          break;
        // 外卖小哥的台词飘在门洞里（楼层显示下面、读题气泡下面）
        case 'liftDing': sfx.ding(); if (e.kind === 'takeout') float(vis.fx, LIFT.xiaoge.hi, L.W / 2 + 40, L.groundY - 150, { size: 15, color: '#ffd166', life: 1.0 }); break;
        case 'liftKey': float(vis.fx, LIFT.key, L.W / 2, L.cardsY + 2, { size: 13, color: '#fff', life: 1.0 }); break;
        case 'liftClose': sfx.doorClose(); vibrate('medium'); float(vis.fx, '关门！+50', L.W / 2 - 70, L.groundY - 125, { size: 18, color: '#3fdc7a', life: 0.9 }); break;
        case 'liftShut': if (e.kind === 'takeout' && e.closed) float(vis.fx, LIFT.xiaoge.out, L.W / 2 + 40, L.groundY - 110, { size: 14, color: '#ff8a7a', life: 0.9 }); break;
        case 'takeoutIn': float(vis.fx, LIFT.xiaoge.thanks, L.W / 2 + 40, L.groundY - 150, { size: 15, color: '#ffd166', life: 0.9 }); break;
        case 'liftOut': sfx.whoosh(); audio.duck(1); flash(vis.fx, '#ffffff', 0.35); break;
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
    // 溅水车压到水坑：水声 + 高处的水珠（判定框外的水珠只是粒子，半透明）。蹭车经过时溅水车淡出了：不出声、不出水珠
    const obs = run.course.obstacles;
    for (let i = run.obIdx; i < obs.length && obs[i].x - run.x < 1.2 * run.vBase; i++) {
      const o = obs[i];
      if (o.type !== 'splash' || vis.splashed.has(o.id) || splashState(o, run.x).rise <= 0) continue;
      vis.splashed.add(o.id);
      if (rideNear(run, vis, t)) continue;
      sfx.splash();
      burst(vis.fx, o.x + 28, -20, { n: 14, color: '#e8faff', speed: 120, up: 220, life: 0.6, size: 2.6, gravity: 700 });
    }
    // 路口：过街提示音越到最后越急；离到线 / 变绿还剩 0.5 秒时震一下；横穿车开出来时一声
    const gap = crossBeepGap(run), xc = run.cross;
    if (gap > 0 && !run.done) {
      vis.beepT -= dt;
      if (vis.beepT <= 0) { const lp = crossLamp(run, run.course.crossings[run.crossIdx]); sfx.crossBeep(!!(lp && lp.lit === 'red')); vis.beepT = gap; }
      if (gap < 0.12 + 0.38 * 0.25 && vis.xbuzz !== xc.i) { vis.xbuzz = xc.i; vibrate('light'); }
    }
    const car = crossCar(run);
    if (car && car.k >= 0 && vis.xcar !== xc.i) { vis.xcar = xc.i; sfx.carBy(); }
    const ch = run.chaser;
    vis.danger += ((ch && !run.cutscene && !run.room ? clamp(1 - ch.gap / 60, 0, 1) : 0) - vis.danger) * Math.min(1, dt * 6);   // 轿厢里不泛红、不心跳（追兵在轿厢里站着）
    vis.heart -= dt;
    if (vis.danger > 0.05 && vis.heart <= 0) { sfx.heart(); vis.heart = lerp(0.72, 0.4, vis.danger); }
  }
  const TUNE_PX = () => 120;
  // 文字预热：每帧最多生成 3 个，提前把下一道题的字准备好
  let warmFor = null, warmList = [];
  function warmStep() {
    const lb = run.room && run.room.beats.find(b => b.kind === 'npc' && b.q && !b.opened);   // 电梯里下一道题：进门时就出好了
    const q = (run.pending && run.pending.q) || (lb && lb.q);
    if (q && q !== warmFor) { warmFor = q; warmList = warmQueue(q, L); }
    for (let i = 0; i < 3 && warmList.length; i++) { const [s, o] = warmList.shift(); gfx.warm(s, o); }
  }

  // 结局已定（到家演出 run.ending、失败大字卡 run.done）时这一局的结果；还在跑返回 null
  const settled = () => run.done || (run.ending && run.ending.result) || null;
  // 记一局：只记一次（到家演出 / 失败卡期间暂停后点「回到首页」「重新下班」也算这一局，之后正常结算不再记）
  let recorded = null;
  function record() {
    const res = settled();
    if (!res || recorded) return recorded;
    recorded = { flags: recordResult(res, [...run.tips], run.said) };
    return recorded;
  }
  function finish() {
    const { flags } = record();
    game.go('result', { result: run.done, flags, friend });
  }
  // 这一刻该放的音乐：跑酷 BGM、到家演出（饭桌）放到家音乐、失败卡静音
  const musicNow = () => (run.done ? null : run.ending ? BGM.home : BGM.run);

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
      // 到家演出开门、转白屏时把饭桌的背景、前景提前烘焙好传进显存，三行大字也先做好（一帧做一样），进饭桌那一帧不卡
      if (run.ending && vis.dinnerPrep < DINNER_PREP_STEPS && run.ending.t > 0.45 + vis.dinnerPrep * 0.08) prepareDinner(L, run.ending.result, vis.dinnerPrep++);
      gfx.save(); gfx.translate(sx, sy);
      if (run.ending && run.ending.t > 0.9) {
        drawDinner(L, run.ending.result, t);
        const a = clamp(1 - (run.ending.t - 0.9) / 0.3, 0, 1);
        if (a > 0) gfx.rect(0, 0, L.W, L.H, { fill: '#fff', alpha: a });
        gfx.restore();
        if (paused) drawPause(L, save.settings, buttons);   // 饭桌上没有暂停键，但键盘（PC 微信）能暂停：照样出菜单
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
          cutCorridor(g, L);                         // 主角前方的「来障碍走廊」不压红
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
      drawRoom(run, L, vis, t, buttons);          // 电梯轿厢：盖在跑道上（世界停住），HUD 照常在最上面
      drawHud(run, L, t, buttons);
      drawStageBanner(L, vis.banner, t);
      // 失败大字卡（答题时饿晕、被抓）：下面不留冻住的读题气泡、选项卡、便利店面板、灯牌和提示
      const failed = !!(run.done && !run.done.win);
      if (!failed) {
        drawCrossBoard(run, L, view(run, L), vis, t);   // 路口灯牌：屏幕右侧、HUD 下方（路口窗口里没有读题、不出字卡）
        drawChoice(run, L, vis, t, buttons);
        drawCutscene(run, L, t);
        drawShop(run, L, t, buttons);
        drawHint(run, L, t);
      }
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
        const pb = !paused && hit();
        // 电梯关门键：手指一按住就算（0.7 秒窗口里等抬手会白按），抬手的 tap 不再算一次
        if (pb && pb.id === 'liftClose') { taken.add(e.id); onButton(pb, e); return; }
        if (paused || run.shop || pb) return;
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
        // 跑酷时横向要明显才算左右（斜着往上划算跳）；答题时仍按原规则。没有 dx / dy 的事件（老调用方）照原方向
        const mode = swipeMode(run), dir = e.dx == null ? e.dir : classifySwipe(e, mode);
        noteSwipe(run, mode, dir);
        if (dir === 'up' && taken.has(e.id)) return;   // 按住后又往上划：同一下，不跳两次
        if (mode === 'pre' && !run.teach && (dir === 'left' || dir === 'right')) return;   // 快弹题 / 刚选完：横划归答题，不跳也不做别的（定格教学在等右滑时不拦：否则可能软锁）
        input(run, dir === 'up' ? 'jump' : dir === 'down' ? 'slide' : dir);
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
    music() { return paused ? null : musicNow(); },
    skip(sec, until) { for (let i = 0; i < sec * 60 && !run.done; i++) { this.update(1 / 60); if (until && until(run)) break; } },   // 调试：快进
    get run() { return run; },
  };

  function pause() { if (!paused) { paused = true; audio.stopBgm(); keepTips(); } }
  function resume() { if (paused) { paused = false; const m = musicNow(); if (m) audio.bgm(...m); else audio.stopBgm(); } }   // 按场景此刻该放的接着放（饭桌是到家音乐、失败卡静音）
  function keepTips() { save.tips = [...new Set([...save.tips, ...run.tips])]; persist(); }

  function onButton(b, e) {
    sfx.click();
    switch (b.id) {
      case 'pause': pause(); break;
      case 'resume': resume(); break;
      case 'restart': keepTips(); record(); game.go('play', daily || friend ? { seed, level, daily, friend, tutorial, assist, story: home } : { seed: (Math.random() * 1e9) >>> 0, level, daily, friend, tutorial, assist }); break;   // 重新下班：换个种子，家也跟着换（今日挑战、好友局同一个家）
      case 'home': keepTips(); record(); audio.stopBgm(); game.go('title'); break;   // record：结局已定（到家演出、失败卡）时先把这一局记进存档（只记一次），还在跑就什么都不记
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
      case 'liftClose': input(run, 'close'); break;
      default: break;
    }
  }
}

// 开局卡：读秒按开局时长的比例走（全程局 1.1 秒、关卡局 1.6 秒，和以前一样从 :50 数到 :59），下面一行是本路线标准时间；
// 关卡局第一行写关名；家庭剧本有开局交代（story.introLine → [谁, 一句话]）时最下面画一个小气泡
function introCard(L, run) {
  const k = clamp((run.introTotal - run.intro) / run.introTotal, 0, 1);
  gfx.save(); gfx.alpha(clamp(run.intro / 0.3, 0, 1));
  if (run.lv.id !== 'full') gfx.text(run.lv.def.name, L.W / 2, L.groundY - 298, { size: 18, color: '#ffd166', lw: 4 });
  gfx.text('17:59:5' + Math.min(9, Math.floor(k * 9.9)), L.W / 2, L.groundY - 260, { size: 30, color: '#fff', lw: 6, id: 'intro-clock' });
  gfx.text('下班倒计时……', L.W / 2, L.groundY - 226, { size: 15, color: '#fff', lw: 4 });
  gfx.text(`本路线标准 ${fmtClock(run.par.min)} 到家${run.assist ? ' · 带薪摸鱼' : ''}`, L.W / 2, L.groundY - 202, { size: 13, color: '#ffd166', lw: 3, id: 'intro-par' });
  let y = L.groundY - 186;
  if (run.famLine) {                                   // 全程局：今晚回哪个家（家里第一个人的头像）
    const fam = run.story.fam, s = `今晚回：${fam.name}`, w = gfx.measure(s, { size: 14 }) + 54, x = L.W / 2 - w / 2;
    card(x, y, w, 28, 14, '#ffd166', { lw: 2, shadow: 2 });
    avatar(fam.door[0], x + 16, y + 14, 11);
    gfx.text(s, x + 32, y + 14, { size: 14, color: '#2b2233', align: 'left' });
    y += 36;
  }
  const il = run.introLine;
  if (il && il[1]) {
    const w = gfx.measure(il[1], { size: 14 }) + 62, x = L.W / 2 - w / 2;
    card(x, y, w, 34, 17, '#fff', { lw: 2.2, shadow: 2 });
    avatar(il[0], x + 20, y + 17, 13);
    gfx.text(il[1], x + 38, y + 17, { size: 14, color: '#2b2233', align: 'left' });
  }
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
  const away = res.family && res.family.away;          // 家里那边（家庭剧本）：大鹏把你那份吃了……
  if (away) gfx.text(`家里：${away}`, L.W / 2, L.H * 0.42 + 142, { size: 15, color: '#fff', lw: 3, maxW: L.W - 40 });
  if (res.tip) gfx.text(`提示：${res.tip}`, L.W / 2, L.H * 0.42 + (away ? 172 : 146), { size: 15, color: '#bff3ff', lw: 3, maxW: L.W - 40 });   // 死因提示
  gfx.restore();
}

export { NPCS };
