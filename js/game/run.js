// 一局：跑酷 + 限时二选一 + 追逐 + 事件 + 资源。纯逻辑、可复现（同种子同输入 → 同结果），测试里可以直接跑机器人。
// 场景层每帧调 updateRun(run, dt)，把 run.fx 里的事件拿去放音效、粒子；输入用 input(run, action, arg)。
import { makeRng } from '../core/rng.js';
import { TUNE, COURSE, CHOICE, CHASE, RES, SCORE, GRADE, speedAt, zoomAt } from '../data/tune.js';
import { OBSTACLES } from '../data/obstacles.js';
import { NPCS } from '../data/npcs.js';
import { CALLERS, UNKNOWN_OUTCOMES, RIDE, STORE, MEALS, TAKEOUT, STARVE, TITLES } from '../data/events.js';
import { makePlayer, hitbox, jump, swipeDown, stumble, stepPlayer } from './player.js';
import { planCourse, stageAt, choiceTime, obstacleX } from './course.js';
import { judge, makeQuestion, isExcuse } from './choice.js';
import { modifierOf } from '../data/modifiers.js';

const HUNGRY_HINT_AT = RES.hungry;

export function makeRun({ seed, daily = false, tutorial = false, seenTips = [], modifier } = {}) {
  const rng = makeRng(seed);
  const mod = modifier !== undefined ? modifier : daily ? modifierOf(seed) : null;   // 每日词条：只有今日挑战才有
  const course = planCourse(makeRng((seed ^ 0x9e3779b9) >>> 0), { tutorial });
  return {
    seed, daily, tutorial, rng, course, mod,
    t: 0, wt: 0, intro: 1.1,
    x: 0, v: 0, vBase: TUNE.speed.base, zoom: 1, ts: 1,
    player: makePlayer(),
    stage: COURSE.stages[0],
    slotIdx: 0, obIdx: 0, pkIdx: 0,
    choice: null, pending: null, chaser: null, ride: null, shop: null, cutscene: null, teach: null,
    mods: [],
    clock: 0, sat: RES.sat0, money: RES.money0 + ((mod && mod.money) || 0), boxes: RES.boxes, restored: false,
    score: 0, combo: 0,
    stats: { choices: 0, good: 0, bad: 0, mid: 0, quick: 0, timeouts: 0, nearMiss: 0, hits: 0, coins: 0, chased: 0, escaped: 0, caught: 0, caughtBy: [], tags: {}, rides: 0, shops: 0, minSat: RES.sat0, reconciled: 0, wet: false, maxCombo: 0, ate: [] },
    best: null,                     // 今日最离谱借口
    said: [],                       // 这局说过的话（借口图鉴）
    used: {}, grudges: [], revisits: 0, npcSeen: {}, qUsed: new Set(), lastNpc: null, flags: {}, callers: [],
    tips: new Set(seenTips), tipQueue: [], hint: null, holeO: null,
    fx: [],
    done: null, ending: null,
  };
}

const fx = (run, type, data = {}) => run.fx.push({ type, ...data });
const mult = run => Math.min(SCORE.comboMax, 1 + run.combo * SCORE.comboStep);
function addScore(run, n) { run.score += Math.round(n * mult(run)); }
function showHint(run, text, t = 2.2) { run.hint = { text, t, total: t }; }
// 一次性规则提示：正在显示别的提示时先排队，轮到它显示时才记为「看过」
function tip(run, key, text) {
  if (run.tips.has(key) || run.tipQueue.some(q => q.key === key)) return;
  run.tipQueue.push({ key, text });
  pumpTips(run);
}
function pumpTips(run) {
  if (run.hint || run.teach || !run.tipQueue.length) return;
  if (run.choice && run.choice.phase === 'result') return;     // 别和「+100」飘字抢位置
  const q = run.tipQueue.shift();
  run.tips.add(q.key);
  showHint(run, q.text, 2.6);
  fx(run, 'tip', { key: q.key });
}

// ── 输入 ────────────────────────────────────────────────
export function input(run, action, arg) {
  if (run.done || run.intro > 0 || run.ending) return;
  const p = run.player;
  if (run.teach) {
    if ((run.teach.kind === 'jump' && action === 'jump') || (run.teach.kind === 'slide' && action === 'slide')) {
      run.teach = null; run.hint = null;
      action === 'jump' ? jump(p) : swipeDown(p);
    }
    return;
  }
  if (run.shop) {
    if (action === 'card') buy(run, arg);
    else if (action === 'left') buy(run, 0);
    else if (action === 'jump') buy(run, 1);          // 上滑
    else if (action === 'right') buy(run, 2);
    else if (action === 'slide' || action === 'leave') closeShop(run, false);
    return;
  }
  const c = run.choice;
  if (c && c.phase === 'open') {
    if (action === 'left') return pick(run, 0);
    if (action === 'right') return pick(run, 1);
    if (action === 'card') return pick(run, arg);
  }
  if (run.cutscene || run.ride) return;
  if (action === 'jump') jump(p);
  else if (action === 'slide') swipeDown(p);
}

// ── 主循环 ──────────────────────────────────────────────
export function updateRun(run, dt) {
  if (run.done) return;
  run.t += dt;
  if (run.hint) { run.hint.t -= dt; if (run.hint.t <= 0) run.hint = null; }
  if (!run.hint) pumpTips(run);
  if (run.intro > 0) {
    run.intro -= dt;
    if (run.intro <= 0) { fx(run, 'go'); if (run.mod) showHint(run, `${run.mod.name}：${run.mod.desc}`, 3); }
    return;
  }
  if (run.ending) { run.ending.t += dt; if (run.ending.t >= run.ending.total) run.done = run.ending.result; return; }

  // 世界时间流速：读题放慢、进店 / 教学暂停
  let target = 1;
  const c = run.choice;
  if (c && c.phase === 'open') target = c.hold ? 0 : c.slow;      // 新手第一题：世界停住等你选
  if (run.shop || run.teach) target = 0;
  run.ts += (target - run.ts) * Math.min(1, dt / 0.06);
  if (target === 0 && run.ts < 0.02) run.ts = 0;

  if (c) updateChoice(run, dt);
  if (run.shop) updateShop(run, dt);
  if (run.cutscene) {
    run.cutscene.t -= dt;
    if (run.cutscene.t <= 0) endCutscene(run);
  }
  const wdt = dt * run.ts;
  if (wdt > 0) stepWorld(run, wdt);
}

function stepWorld(run, wdt) {
  const p = run.player, obs = run.course.obstacles;
  run.wt += wdt;
  const vb = speedAt(run.x);
  run.vBase = vb;

  // 速度修正
  let k = 1;
  run.mods = run.mods.filter(m => (m.t -= wdt) > 0);
  for (const m of run.mods) k *= m.k;
  if (p.state === 'stumble') k *= TUNE.stumbleSpeed + (1 - TUNE.stumbleSpeed) * (1 - p.stumbleT / TUNE.stumbleTime);
  if (run.chaser && run.chaser.phase === 'slow') k *= CHASE.slowK;
  if (run.ride) k *= RIDE.speedK;
  if (run.cutscene) k = 0;
  k *= Math.min(1, run.wt / 0.5);                       // 起步加速
  run.v = vb * k;
  const zt = zoomAt(vb) * (run.ride ? 0.94 : 1);
  run.zoom += (zt - run.zoom) * Math.min(1, wdt * 3);
  run.x += run.v * wdt;

  // 脚下 / 头顶
  let supportTop = 0, overHole = false, ceiling = false, hole = null;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i], t = OBSTACLES[o.type], ox = obstacleX(o, run.x);
    if (ox > run.x + 60) break;
    if (o.done && !t.platform) continue;
    if (t.hole && run.x > ox + 10 && run.x < ox + t.w - 10) { overHole = true; hole = o; }
    if (t.platform && run.x + 11 > ox && run.x - 11 < ox + t.w && p.y <= -t.ground + 6) supportTop = Math.min(supportTop, -t.ground);
    if (t.overhead && run.x + 22 > ox && run.x - 22 < ox + t.w) ceiling = true;
  }
  if (run.ride || run.cutscene) { overHole = false; }

  if (run.ride || (run.cutscene && run.cutscene.kind !== 'hole')) {
    p.events.length = 0; p.runPhase = (p.runPhase + wdt * run.v / 120) % 1;
    if (run.ride) { p.y = 0; p.vy = 0; p.onGround = true; p.state = 'run'; }
  } else if (!run.cutscene) {
    const yBefore = p.y;          // 落地前的脚高：高速越过井口时这一帧就落回地面了，要用落地前的值判断
    stepPlayer(p, wdt, run.v, { supportTop, overHole, ceiling });
    for (const e of p.events) fx(run, e);
    // 脚掉到地面以下 = 掉进去了（井口窄，速度快时会直接撞上对面井沿，同样算掉进去）
    if (overHole) run.holeO = hole;
    const ho = run.holeO;
    if (ho) {
      const far = obstacleX(ho, run.x) + OBSTACLES[ho.type].w - 10;
      if (p.y > 8 || (Math.max(p.y, yBefore) > 0.5 && run.x >= far)) fallInHole(run, ho);
      else if (!overHole && run.x > far + 10) run.holeO = null;
    }
  } else {
    p.y += 160 * wdt;                                    // 掉井里：往下沉
  }

  // 碰撞、越过
  const hb = hitbox(p), s = TUNE.shrink;
  for (let i = run.obIdx; i < obs.length; i++) {
    const o = obs[i], t = OBSTACLES[o.type], ox = obstacleX(o, run.x);
    if (ox > run.x + 60) break;
    if (o.done) continue;
    if (!t.hole) {
      const box = t.overhead ? { x0: ox, x1: ox + t.w, y0: -t.overhead[1], y1: -t.overhead[0] } : { x0: ox, x1: ox + t.w, y0: -t.ground, y1: 0 };
      const px0 = run.x + hb.x0, px1 = run.x + hb.x1;
      const xo = px1 > box.x0 + s && px0 < box.x1 - s;
      if (xo) {
        const onTop = t.platform && p.y <= box.y0 + 6;
        const clear = t.overhead ? box.y1 - hb.y0 : box.y0 - hb.y1;   // 竖直方向还差多少碰上（负数 = 重叠）
        if (!onTop) o.minClear = Math.min(o.minClear ?? Infinity, t.overhead ? hb.y0 - box.y1 : box.y0 - hb.y1);
        const overlap = !onTop && (t.overhead ? hb.y0 < box.y1 - s : hb.y1 > box.y0 + s);
        if (overlap && !run.ride && !run.cutscene && !o.hit) {
          if (t.light) { o.hit = true; splash(run, o); }
          else if (p.invulnT <= 0) hit(run, o);
          else if (t.platform) { o.hit = true; p.y = -t.ground; p.vy = 0; p.onGround = true; }   // 无敌时撞上台阶：直接踩上去
          else o.hit = true;                              // 无敌时穿过：不算躲过，也不扣
        }
        void clear;
      }
    }
    if (ox + t.w < run.x - 12) { o.done = true; if (!o.hit) passed(run, o); }
  }
  while (run.obIdx < obs.length && obs[run.obIdx].done && obstacleX(obs[run.obIdx], run.x) + OBSTACLES[obs[run.obIdx].type].w < run.x - 40) run.obIdx++;

  // 拾取
  const pks = run.course.pickups;
  while (run.pkIdx < pks.length && pks[run.pkIdx].x < run.x - 40) run.pkIdx++;
  for (let i = run.pkIdx; i < pks.length && pks[i].x < run.x + 30; i++) {
    const pk = pks[i];
    if (pk.taken) continue;
    const near = Math.abs(pk.x - run.x) < (run.ride ? 30 : 20) && pk.y > p.y - (run.ride ? 90 : (hb.y1 - hb.y0)) - 12 && pk.y < p.y + 10;
    if (!near) continue;
    pk.taken = true;
    if (pk.kind === 'coin') { run.money += (run.mod && run.mod.coinK) || 1; run.stats.coins++; addScore(run, SCORE.coin); fx(run, 'coin', { x: pk.x, y: pk.y }); }
    else { run.sat = Math.min(100, run.sat + RES.bun); run.stats.ate.push('包子'); fx(run, 'bun', { x: pk.x, y: pk.y }); }
  }

  // 追逐
  const ch = run.chaser;
  if (ch) {
    ch.t += wdt;
    if (run.ride) ch.gap += CHASE.ride * wdt;
    if (ch.phase === 'slow') { ch.gap -= CHASE.approach * wdt; if (ch.t >= CHASE.slowT) { ch.phase = 'shake'; ch.t = 0; } }
    else {
      ch.gap += CHASE.recover * wdt;
      if (ch.t >= CHASE.shakeT || ch.gap >= CHASE.escape) { run.chaser = null; run.stats.escaped++; fx(run, 'escape', { npc: ch.npc }); }
    }
    if (run.chaser && ch.gap < 0 && !run.cutscene) caught(run, ch.npc);
  }

  // 蹭车
  if (run.ride) {
    run.ride.t -= wdt;
    if (run.ride.t <= 0) endRide(run);
  }

  // 资源
  run.clock += wdt * RES.clockRate;
  run.sat -= RES.satDrain * wdt * (run.ride ? RES.rideDrain : 1) * ((run.mod && run.mod.satK) || 1);
  run.stats.minSat = Math.min(run.stats.minSat, run.sat);
  if (run.sat < HUNGRY_HINT_AT) tip(run, 'hungry', '饿坏了：说真话一律放行');
  if (run.sat <= 0) { run.sat = 0; return finish(run, false, 'starve'); }

  // 路段
  const st = stageAt(run.x);
  if (st !== run.stage) { run.stage = st; fx(run, 'stage', { name: st.name, id: st.id }); }

  // 新手教学：障碍到了最佳操作点就定格，等玩家做对
  if (run.tutorial) {
    for (let i = run.obIdx; i < obs.length && obs[i].x < run.x + 400; i++) {
      const o = obs[i];
      if (!o.teach || o.taught) continue;
      const d = o.x - run.x;
      if (d < 0) { o.taught = true; continue; }
      const at = o.teach === 'jump' ? run.v * 0.26 + 8 : run.v * 0.12 + 20;
      if (d <= at && !run.choice && p.onGround && p.state === 'run') {
        if (o.teach === 'jump' && d < at * 0.5) o.x = run.x + at;   // 刚落地就贴着箱子了：把教学箱子挪到能跳过去的距离
        o.taught = true;
        run.teach = { kind: o.teach };
        showHint(run, o.teach === 'jump' ? '上滑 / 点一下：跳' : '下滑：滑铲', 999);
      }
    }
  }

  // 选择槽：提前约 1.5 秒定好是谁（让 NPC 先出现在画面里），走到跟前再弹题
  const slot = COURSE.slots[run.slotIdx];
  if (slot && !run.pending && slot.x - run.x < Math.max(520, 1.6 * speedAt(slot.x))) run.pending = prepareSlot(run, slot);
  if (slot && !run.choice && !run.shop && run.x >= slot.x) {
    openSlot(run, slot, run.pending);
    run.pending = null;
    run.slotIdx++;
  }

  // 到家
  if (run.x >= COURSE.end - 20 && !run.ending) arrive(run);
}

// ── 障碍结果 ────────────────────────────────────────────
function passed(run, o) {
  const t = OBSTACLES[o.type];
  if (run.ride || run.cutscene) return;
  run.combo++; run.stats.maxCombo = Math.max(run.stats.maxCombo, run.combo);
  const near = !t.light && o.minClear != null && o.minClear < TUNE.nearMiss && o.minClear > -TUNE.shrink;
  if (near) { run.stats.nearMiss++; addScore(run, SCORE.near); fx(run, 'near', { x: o.x }); }
  if (run.chaser) run.chaser.gap += CHASE.dodge + (near ? CHASE.near : 0);
  fx(run, 'pass', { combo: run.combo });
}
function hit(run, o) {
  o.hit = true;
  const t = OBSTACLES[o.type], p = run.player;
  if (!stumble(p)) return;
  if (t.platform) { p.y = -t.ground; p.vy = 0; p.onGround = true; }   // 绊上台阶：踉跄着爬上去，而不是穿过去
  run.stats.hits++; run.combo = 0;
  run.sat += RES.hit.sat; run.clock += RES.hit.min * 60;
  if (run.chaser) run.chaser.gap += CHASE.hit;
  fx(run, 'hit', { obstacle: o.type });
}
function splash(run, o) {
  run.mods.push({ k: 0.85, t: 0.6 });
  run.combo = 0; run.stats.wet = true;
  fx(run, 'splash', { x: o.x });
}
function fallInHole(run, o) {
  run.holeO = null;
  run.cutscene = { kind: 'hole', t: RES.hole.time, total: RES.hole.time, o };
  run.clock += RES.hole.min * 60; run.sat += RES.hole.sat;
  run.stats.hits++; run.combo = 0;
  if (run.chaser) run.chaser.gap += CHASE.hit;
  fx(run, 'hole');
}

// ── 追逐 ────────────────────────────────────────────────
function startChase(run, npc) {
  if (run.chaser) { caught(run, npc); return; }          // 已经在被追又选错：当场被逮
  run.chaser = { npc, gap: CHASE.gap0 + (run.flags.energy ? CHASE.energy : 0), phase: 'slow', t: 0 };
  run.flags.energy = false;
  run.stats.chased++;
  tip(run, 'chase', '被追了！跳过障碍甩掉追兵');
  fx(run, 'chase', { npc });
}
function caught(run, npc) {
  run.chaser = null;
  run.boxes--; run.stats.caught++; run.stats.caughtBy.push(npc);
  run.clock += RES.caught.min * 60; run.sat += RES.caught.sat; run.combo = 0;
  const line = npc === 'mom' ? '' : NPCS[npc].caught;
  run.cutscene = { kind: 'caught', npc, t: CHASE.caughtTime, total: CHASE.caughtTime, line };
  fx(run, 'caught', { npc });
}
function endCutscene(run) {
  const cs = run.cutscene; run.cutscene = null;
  const p = run.player;
  if (cs.kind === 'hole') {
    const t = OBSTACLES[cs.o.type];
    run.x = Math.max(run.x, obstacleX(cs.o, run.x) + t.w + 6);
    cs.o.done = true; cs.o.hit = true;
    p.y = 0; p.vy = 0; p.onGround = true; p.state = 'run'; p.invulnT = 0.8;
    fx(run, 'climb');
  }
  if (cs.kind === 'caught') {
    p.invulnT = 1.0;
    if (run.boxes <= 0) finish(run, false, 'caught', cs.npc);
  }
}

// ── 选择 ────────────────────────────────────────────────
const NPC_SLOT = { npc: 1, gate: 1, mom: 1 };
function prepareSlot(run, slot) {
  const pend = { slot, q: null, wx: slot.x + (375 - 75 - TUNE.playerX) / zoomAt(speedAt(slot.x)) };
  if (NPC_SLOT[slot.kind]) {
    const st = stageAt(slot.x).id;
    pend.q = makeQuestion({ rng: run.rng, stage: st, npcSeen: run.npcSeen, qUsed: run.qUsed, grudges: run.grudges, revisits: run.revisits, flags: run.flags, t: run.t, lastNpc: run.lastNpc, clockMin: clockMin(run), used: run.used, money: run.money }, slot);
    if (pend.q) run.lastNpc = pend.q.npc;
  }
  return pend;
}

function openSlot(run, slot, pend) {
  const st = stageAt(slot.x).id;
  let c = null;
  if (NPC_SLOT[slot.kind]) {
    const q = pend && pend.q;
    if (!q) return;
    if (q.revisit) { run.revisits++; tip(run, 'grudge', '记仇的人回来了：别再用上次的借口'); }
    run.npcSeen[q.npc] = (run.npcSeen[q.npc] || 0) + 1;
    const T = Math.max(CHOICE.minTime, (slot.kind === 'mom' ? CHOICE.time.home[0] : choiceTime(slot.x, q.revisit)) - ((run.mod && run.mod.readMinus) || 0));
    c = { kind: slot.kind === 'gate' ? 'npc' : slot.kind, ...q, T, slow: CHOICE.slow[st] };
  } else if (slot.kind === 'call') {
    const left = ['mom', 'boss', 'unknown'].filter(k => !run.callers.includes(k));
    const who = run.callers.length === 0 && run.rng.chance(0.5) ? 'mom' : run.rng.pick(left);
    run.callers.push(who);
    const cl = CALLERS[who];
    c = { kind: 'call', caller: who, npc: who === 'boss' ? 'laoliu' : who === 'mom' ? 'mom' : null, line: cl.line, name: cl.name, opts: [{ text: cl.pick.text }, { text: cl.hang.text }], T: CHOICE.eventTime.call, slow: CHOICE.eventSlow };
  } else if (slot.kind === 'ride') {
    c = { kind: 'ride', name: RIDE.name, line: RIDE.line, opts: RIDE.opts, T: CHOICE.eventTime.ride, slow: CHOICE.eventSlow };
  } else if (slot.kind === 'store') {
    c = { kind: 'store', name: STORE.name, line: STORE.line, opts: STORE.opts, T: CHOICE.eventTime.store, slow: CHOICE.eventSlow };
  }
  c.t = 0; c.age = 0; c.phase = 'open'; c.rt = 0; c.x = slot.x; c.wx = pend ? pend.wx : slot.x + 200;
  c.hold = run.tutorial && run.stats.choices === 0 && c.kind === 'npc';
  if (c.hold) showHint(run, '左滑选左边 · 右滑选右边', 999);
  run.choice = c;
  fx(run, 'choice', { kind: c.kind });
}

function updateChoice(run, dt) {
  const c = run.choice;
  c.age += dt;
  if (c.phase === 'open') {
    if (!c.hold) c.t += dt;
    const left = c.T - c.t;
    if (left < 0.8 && Math.floor(left * 6) !== Math.floor((left + dt) * 6)) fx(run, 'hurry');
    if (c.t >= c.T) timeout(run);
  } else {
    c.rt += dt;
    if (c.rt >= 0.75) run.choice = null;
  }
}

function pick(run, i) {
  const c = run.choice;
  if (!c || c.phase !== 'open' || i < 0 || i > 1) return;
  if (c.t < CHOICE.guard && !c.hold) return;
  if (c.hold) { c.hold = false; run.hint = null; }
  resolve(run, i, false);
}

function timeout(run) {
  const c = run.choice;
  run.stats.timeouts++;
  if (c.kind === 'call') return resolve(run, 1, true);         // 没接 = 挂了
  if (c.kind === 'ride' || c.kind === 'store') return resolve(run, 1, true);
  resolve(run, -1, true);
}

function resolve(run, i, isTimeout) {
  const c = run.choice;
  c.phase = 'result'; c.picked = i; c.timeout = isTimeout;
  const quick = !isTimeout && c.t < CHOICE.quick;
  if (c.kind === 'call') return resolveCall(run, c, i);
  if (c.kind === 'ride') {
    c.res = { good: true, react: i === 0 ? '「坐稳了！」' : '「那你慢慢跑」' };
    if (i === 0) startRide(run);
    return;
  }
  if (c.kind === 'store') {
    c.res = { good: true, react: i === 0 ? '叮咚～欢迎光临' : '（咽了下口水）' };
    if (i === 0) openShop(run);
    return;
  }

  // NPC / 妈妈
  run.stats.choices++;
  let r, opt = null;
  if (i < 0) {
    const lucky = c.kind !== 'mom' && !run.rng.chance(CHOICE.timeoutBad);
    r = lucky ? { good: 'mid', reason: 'lucky', react: '（对方接了个电话走了）' } : { good: false, reason: 'timeout', react: '……你倒是说话啊' };
  } else {
    opt = c.opts[i];
    run.said.push(`${c.npc}:${opt.text}`);
    r = judge(opt, { money: run.money, sat: run.sat, used: run.used, grudgeTag: c.grudgeTag, flags: run.flags, mom: c.kind === 'mom' });
    run.stats.tags[opt.tag] = (run.stats.tags[opt.tag] || 0) + 1;
    if (isExcuse(opt.tag)) {
      run.used[opt.tag] = (run.used[opt.tag] || 0) + 1;
      if (run.used[opt.tag] === 2) tip(run, 'tired', '同一类借口用到第 3 次就不灵了');
    }
    if (opt.lol && (!run.best || opt.lol >= run.best.lol)) run.best = { text: opt.text, npc: c.npc, lol: opt.lol, line: c.line };
  }
  c.res = { good: r.good, react: r.react, reason: r.reason, quick };

  if (c.kind === 'mom') {
    run.flags[r.good === true ? 'momGood' : 'momBad'] = true;
    if (r.good === true) { run.stats.good++; addScore(run, SCORE.good + (quick ? SCORE.quick : 0)); fx(run, 'good', { npc: 'mom' }); }
    else { run.stats.bad++; fx(run, 'bad', { npc: 'mom' }); }
    return;
  }

  if (r.good === true) {
    run.stats.good++; if (quick) run.stats.quick++;
    run.combo++; run.stats.maxCombo = Math.max(run.stats.maxCombo, run.combo);
    if (opt && opt.cost) run.money -= opt.cost;
    addScore(run, SCORE.good + (quick ? SCORE.quick : 0));
    if (c.revisit) {
      run.stats.reconciled++; addScore(run, SCORE.reconcile);
      if (!run.restored && run.boxes < RES.boxes) { run.restored = true; run.boxes++; fx(run, 'restore'); }
      c.res.reconcile = true;
    }
    if (opt) applyEff(run, opt.eff, c);
    fx(run, 'good', { npc: c.npc, quick });
  } else if (r.good === 'mid') {
    run.stats.mid++;
    if (opt) applyEff(run, opt.eff, c);
    fx(run, 'mid', { npc: c.npc });
  } else {
    run.stats.bad++; run.combo = 0;
    if (!c.revisit) run.grudges.push({ npc: c.npc, tag: opt ? opt.tag : '装傻', said: opt ? opt.text : '', readyAt: run.t + run.rng.range(25, 45) });
    fx(run, 'bad', { npc: c.npc, reason: r.reason });
    startChase(run, c.npc);
  }
}

function applyEff(run, eff, c) {
  if (!eff) return;
  if (eff.sat) { run.sat = Math.max(1, Math.min(100, run.sat + eff.sat)); if (eff.sat > 0) run.stats.ate.push(eff.sat >= 30 ? '阿姨的包子' : '蛋糕'); }
  if (eff.money) run.money = Math.max(0, run.money + eff.money);
  if (eff.slow) run.mods.push({ k: eff.slowK || 0.6, t: eff.slow });
  if (eff.flag) run.flags[eff.flag] = true;
  if (eff.grudge) run.grudges.push({ npc: null, chain: eff.grudge, readyAt: run.t + run.rng.range(20, 35) });
  void c;
}

function resolveCall(run, c, i) {
  const cl = CALLERS[c.caller];
  const side = i === 0 ? cl.pick : cl.hang;
  let react = side.react, eff = side.eff;
  if (eff.gamble) { const out = run.rng.pick(UNKNOWN_OUTCOMES); react = out.react; eff = out.eff; }
  if (c.caller === 'boss' && i !== 0 && run.flags.powerbank) { react = '（手机是真没电了）'; eff = {}; }
  c.res = { good: true, react };
  applyEff(run, eff, c);
  fx(run, i === 0 ? 'answer' : 'hangup', { caller: c.caller });
}

// ── 蹭车 ────────────────────────────────────────────────
function startRide(run) {
  run.ride = { t: RIDE.time, total: RIDE.time, detour: run.rng.chance(RIDE.detour.p) };
  run.stats.rides++;
  const p = run.player; p.state = 'run'; p.y = 0; p.vy = 0; p.onGround = true; p.slideT = 0;
  fx(run, 'ride');
}
function endRide(run) {
  const r = run.ride; run.ride = null;
  run.player.invulnT = 0.9;
  if (r.detour) { run.clock += RIDE.detour.min * 60; run.money += RIDE.detour.money; showHint(run, `帮小哥送了一单 +¥${RIDE.detour.money}`, 2.2); }
  else showHint(run, RIDE.done, 1.8);
  fx(run, 'rideEnd');
}

// ── 便利店 ──────────────────────────────────────────────
function openShop(run) { run.shop = { t: 0, T: STORE.time, picked: -1, closeT: 0 }; fx(run, 'shop'); }
function updateShop(run, dt) {
  const s = run.shop;
  if (s.closeT > 0) { s.closeT -= dt; if (s.closeT <= 0) run.shop = null; return; }
  s.t += dt;
  if (s.t >= s.T) closeShop(run, false);
}
function buy(run, i) {
  const s = run.shop, it = STORE.items[i];
  if (!s || s.closeT > 0 || !it || s.t < 0.25) return;
  if (run.money < it.price) { fx(run, 'broke'); return; }
  run.money -= it.price; run.sat = Math.min(100, run.sat + it.sat);
  if (it.flag) run.flags[it.flag] = true;
  run.stats.shops++; run.stats.ate.push(it.name);
  run.clock += STORE.min * 60;
  s.picked = i; s.closeT = 0.55;
  fx(run, 'buy', { item: it.id });
}
function closeShop(run) {
  const s = run.shop;
  if (!s || s.closeT > 0 || s.t < 0.25) return;
  run.clock += 60; s.picked = -1; s.closeT = 0.25;
  fx(run, 'leave');
}

// ── 结束 ────────────────────────────────────────────────
export const clockMin = run => 18 * 60 + run.clock / 60;
export function fmtClock(min) {
  const m = Math.floor(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function arrive(run) {
  if (run.choice && run.choice.phase === 'open') timeout(run);   // 没答完的终极一问按超时算
  run.chaser = null;
  const result = finish(run, true, 'home');
  run.ending = { t: 0, total: 3.4, result };
  run.done = null;
  fx(run, 'arrive');
}

function finish(run, win, reason, npc = null) {
  const s = run.stats;
  const arrival = clockMin(run), am = Math.floor(arrival);
  const broken = RES.boxes - run.boxes;
  let grade = 'C';
  if (win) for (const g of GRADE) if (am <= g.by && broken <= g.broken) { grade = g.g; break; }
  // 晚饭
  let meal;
  if (win) {
    let tier = am <= 18 * 60 + 52 ? 3 : am <= 19 * 60 + 2 ? 2 : am <= 19 * 60 + 15 ? 1 : 0;
    if (run.flags.momHappy) tier++;
    if (run.mod && run.mod.mealBonus) tier += run.mod.mealBonus;
    if (run.flags.momGood) tier++;
    if (run.flags.momBad) tier--;
    if (run.flags.momAngry && !run.flags.momGood) tier--;
    tier = Math.max(0, Math.min(3, tier));
    meal = run.flags.takeout && tier <= 1 ? { ...TAKEOUT, tier } : { ...MEALS[tier], tier };
  } else if (reason === 'starve') meal = { name: STARVE.meal, text: STARVE.text, tier: -1 };
  else { const f = NPCS[npc].fail; meal = { name: f.meal, text: f.text, tier: -1 }; }

  const excuseKinds = Object.keys(run.used).length;
  const tsum = { ...s, excuseKinds };
  const title = win ? TITLES.find(t => t.test(tsum)).name : reason === 'starve' ? '饿晕路边' : (NPCS[npc] && NPCS[npc].fail.title) || '加班人';
  let score = run.score + Math.floor(run.x / 10) * SCORE.per10px;
  if (win) {
    score += run.money * SCORE.moneyLeft + Math.round(run.sat) * SCORE.satLeft;
    const early = SCORE.target - arrival;
    score += Math.round(early > 0 ? early * SCORE.perMinEarly : early * -SCORE.perMinLate);   // 晚到每分钟 -50
  }
  score = Math.max(0, Math.round(score * ((run.mod && run.mod.scoreK) || 1)));
  const result = { win, reason, npc, arrival, arrivalText: fmtClock(arrival), grade: win ? grade : '—', broken, meal, title, score, stats: tsum, best: run.best, seed: run.seed, daily: run.daily, mod: run.mod ? run.mod.name : '', x: run.x };
  if (!win) { run.done = result; fx(run, 'fail', { reason }); }
  return result;
}
