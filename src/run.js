// 单局状态机：时段 → 选地点 → 对话（选择 / 反应）→ 结算。纯逻辑，不碰 DOM。
import { makeRng, randomSeed } from './rng.js';
import { NPCS, NPC_ORDER, zoneOf } from './data/npcs.js';
import { SCENES, SCHEDULE, CALL_SCENE, PANIC_WEIGHTS, INTRUDE } from './data/scenes.js';
import { TASKS, TASK_IDS, TASKS_PER_RUN } from './data/tasks.js';
import { ITEMS, ITEM_IDS, MAX_ITEMS } from './data/items.js';
import { MODIFIERS, MODIFIER_IDS, MODS_PER_RUN } from './data/modifiers.js';
import { EVENTS, EVENT_IDS, EVENT_CHANCE } from './data/events.js';
import { STRANGER_SCENES, STRANGER_WEIGHTS, ANIMAL_IDS } from './data/strangers.js';
import { MEALS, MEAL_IDS } from './data/meals.js';
import { MAX_LEVEL, LV_SLOT_HUNGER, LV_INTRUDE_RANDOM, LV_DODGE_CUT, LV_START_HUNGER, LV_VARIANCE } from './data/levels.js';

export const SAVE_VERSION = 6;
export const STRANGER_CHANCE = 0.75;  // 二选一的时段里出现第三个「路人」选项的概率
export const ANIMAL_INTRUDE = 0.3;    // 没人闯入时，动物闯入的概率
export const DIVERT_PER_RUN = 3;
export const DODGE_RATE = { safe: 0.75, cold: 0.6, hot: 0.35 };
export const DIVERT_SELF = -15, DIVERT_TARGET = 15, DODGE_FAIL = 12, BUSY_HUNGER = -3;
export const FRIDAY_TIMER_BONUS = 2000;
export const VARIANCE = 10;
export const SLOT_HUNGER = 6;
export const COMPANION_BONUS = 5;
export const NEGLECT_DECAY = 4;      // 这个时段没见到的人，注意力自然下降
export const BYSTANDER_RATIO = 0.4;  // 旁观者被你对主角的态度带动的比例
export const HEARD_MULT = 1.5;       // 甩锅给在场的人：他听见了

export function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }
export function hasMod(state, id) { return !!(state.runMods && state.runMods.includes(id)); }
export function modOf(id) { return MODIFIERS[id]; }
// 难度等级：Lv N 包含 1..N 的全部规则
export function atLevel(state, n) { return (state.level || 0) >= n; }

export function newRun(seed = randomSeed(), level = 0) {
  level = Math.max(0, Math.min(MAX_LEVEL, level | 0));
  const rng = makeRng(seed);
  const npcs = {};
  for (const id of NPC_ORDER) npcs[id] = { att: NPCS[id].init, grudge: 0, active: !NPCS[id].lateJoin };
  const state = {
    version: SAVE_VERSION, seed, rng, level,
    hunger: 100, npcs, slot: 0,
    screen: null, scene: null, mini: null, notices: [], pendingCall: false, companion: false,
    flags: {}, stats: { perfect: 0, incidents: 0, choices: 0, incidentLog: [], transfers: 0, panics: 0, itemsUsed: 0, strangers: 0, dodges: 0, diverts: 0, busy: 0, streak: 0, bestStreak: 0, events: 0 },
    tasks: rng.shuffle([...TASK_IDS]).slice(0, TASKS_PER_RUN),
    items: [rng.pick(ITEM_IDS)], extraChoice: null, extraSlot: -1,
    moves: { divertLeft: DIVERT_PER_RUN },
    meal: rng.pick(MEAL_IDS),
    runMods: rng.shuffle([...MODIFIER_IDS]).slice(0, MODS_PER_RUN + (level >= 6 ? 1 : 0)),
    result: null,
  };
  // 难度等级初始效果
  if (level >= 3) state.items = [];
  if (level >= 5) state.moves.divertLeft -= 1;
  if (level >= 7) state.hunger = LV_START_HUNGER;
  // 今日词条初始效果
  if (state.runMods.includes('moody')) {
    for (const n of Object.values(state.npcs)) n.att = clamp(n.att - 15);
  }
  if (state.runMods.includes('review')) {
    state.npcs.boss.att = clamp(state.npcs.boss.att + 20);
  }
  if (state.runMods.includes('talkative')) {
    state.moves.divertLeft += 2;
  }
  startSlot(state);
  return state;
}

export function currentSlot(state) { return SCHEDULE[state.slot]; }

// 今日任务实时状态：done 只在结算后判定，局中只报 failed / open
export function taskStatus(state) {
  return (state.tasks || []).map(id => {
    const t = TASKS[id];
    let status = 'open';
    if (state.screen === 'result') status = t.check(state) ? 'done' : 'failed';
    else if (t.failed(state)) status = 'failed';
    return { id, icon: t.icon, title: t.title, status };
  });
}
export function sceneById(id) { return id === 'call' ? CALL_SCENE : (SCENES[id] || STRANGER_SCENES[id]); }
export function sceneDef(state) {
  if (!state.scene) return null;
  return sceneById(state.scene.id);
}
export function slotChoices(state) {
  const c = [...currentSlot(state).choices];
  if (state.extraChoice) c.push(state.extraChoice);
  return c;
}
export function activeNpcs(state) { return NPC_ORDER.filter(id => state.npcs[id].active); }
export function mealOf(state) { return MEALS[state.meal]; }
export { EVENTS };
export function faceOf(id, zone) { return NPCS[id].faces[zone]; }

function startSlot(state) {
  if (state.notices.length) { state.screen = 'notice'; return; }
  if (state.pendingCall) { state.pendingCall = false; enterScene(state, 'call'); return; }
  const slot = currentSlot(state);
  if (slot.choices.length === 1) enterScene(state, slot.choices[0]);
  else {
    if (state.extraSlot !== state.slot) {
      state.extraSlot = state.slot;
      const _sc_chance = hasMod(state, 'festival') ? 0.92 : STRANGER_CHANCE;
      state.extraChoice = state.rng.next() < _sc_chance ? state.rng.weighted(STRANGER_WEIGHTS) : null;
    }
    state.screen = 'pick';
  }
}

export function dismissNotice(state) {
  if (state.screen !== 'notice') return false;
  state.notices = [];
  startSlot(state);
  return true;
}

export function pickLocation(state, sceneId) {
  if (state.screen !== 'pick' || !slotChoices(state).includes(sceneId)) return false;
  enterScene(state, sceneId);
  return true;
}

function enterScene(state, id) {
  const sc = sceneById(id);
  state.extraChoice = null;
  if (NPCS[sc.npc].transient) state.npcs[sc.npc] = { att: NPCS[sc.npc].init, grudge: 0, active: false, transient: true };
  else state.npcs[sc.npc].active = true;
  const companion = state.companion && sc.npc !== 'lin';
  state.companion = false;
  const present = [sc.npc, ...(sc.others || []).filter(x => state.npcs[x].active && x !== sc.npc)];
  if (companion && !present.includes('lin')) present.push('lin');
  present.forEach(x => { if (!state.npcs[x].transient) state.npcs[x].active = true; });
  if (sc.stranger) {
    state.scene = { id, beat: 0, phase: 'mini', present, companion: false, mods: { posMult: 1, noBystander: false, used: [], timerBonus: 0, busyBeat: -1, dodgeUsed: true, busyUsed: true }, intruder: null, intrusionLine: null, reaction: null, stamp: null, done: false, outcome: null };
    state.mini = { kind: NPCS[sc.npc].animal ? 'pet' : 'pass', npc: sc.npc, done: false, value: null, how: null };
    state.screen = 'mini';
    return;
  }
  state.scene = {
    id, beat: 0, phase: 'choose', present, companion,
    mods: { posMult: 1, noBystander: false, used: [], timerBonus: 0, busyBeat: -1, dodgeUsed: false, busyUsed: false },
    intruder: null, intrusionLine: null,
    reaction: null, stamp: null, done: false, outcome: null,
  };
  // 事件牌
  state.scene.event = (!sc.stranger && state.rng.next() < EVENT_CHANCE)
    ? EVENT_IDS[state.rng.int(0, EVENT_IDS.length - 1)]
    : null;
  state.scene.eventUsed = false;
  state.scene.eventDodged = false;
  state.screen = 'scene';
}

export function currentBeat(state) {
  const sc = sceneDef(state);
  return sc.beats[Math.min(state.scene.beat, sc.beats.length - 1)];
}

export function beatLine(state) {
  const beat = currentBeat(state);
  if (beat.line) return beat.line;
  return beat.lines[zoneOf(state.npcs[sceneDef(state).npc].att)];
}

// 性格修正后的预期变化（不含随机波动）。
export function expectedDelta(state, npcId, base, primaryId) {
  const def = NPCS[npcId];
  const n = state.npcs[npcId];
  let v = base;
  if (def.trait === 'riseFast' && v > 0) v *= 1.5;
  if (hasMod(state, 'acoff') && v > 0) v = Math.round(v * 1.3);
  if (hasMod(state, 'rainy') && v > 0) v += 8;  if (def.trait === 'slow') {
    v *= 0.6;
    if (v < 0 && zoneOf(n.att) === 'hot') v *= 0.5;
  }
  if (state.scene?.mods && npcId === primaryId && v > 0) v *= state.scene.mods.posMult;
  if (state.scene?.mods && npcId === primaryId && v > 0 && state.scene.mods.busyBeat === state.scene.beat) v = 0;
  if (state.scene?.companion && npcId !== 'lin' && npcId === primaryId) v += COMPANION_BONUS;
  if (state.scene && npcId !== primaryId && state.scene.present.includes(npcId)) v *= HEARD_MULT;
  return Math.round(v);
}

function applyDelta(state, npcId, base, primaryId, kind) {
  const expected = expectedDelta(state, npcId, base, primaryId);
  const vr = atLevel(state, 8) ? LV_VARIANCE : VARIANCE;
  const noise = state.rng.int(-vr, vr);
  const n = state.npcs[npcId];
  if (!n.transient) n.active = true;
  const before = n.att;
  n.att = clamp(before + expected + noise);
  return { npc: npcId, before, after: n.att, expected, actual: n.att - before, kind };
}

export function choose(state, optIdx, panic = false) {
  if (state.screen !== 'scene' || state.scene.done || state.scene.phase !== 'choose') return false;
  const sc = sceneDef(state);
  const beat = sc.beats[state.scene.beat];
  const opt = beat.options[optIdx];
  if (!opt) return false;
  const primary = sc.npc;

  const applied = [];
  const touched = new Set();
  for (const [id, base] of Object.entries(opt.d || {})) {
    touched.add(id);
    applied.push(applyDelta(state, id, base, primary, id === primary ? 'primary' : (state.scene.present.includes(id) ? 'heard' : 'transfer')));
  }
  // 旁观者被你对主角的态度带动
  const primaryDelta = applied.find(a => a.npc === primary)?.actual || 0;
  for (const id of state.scene.present) {
    if (id === primary || touched.has(id)) continue;
    const ripple = state.scene.mods.noBystander ? 0 : Math.round(primaryDelta * BYSTANDER_RATIO);
    if (!ripple) { applied.push({ npc: id, before: state.npcs[id].att, after: state.npcs[id].att, expected: 0, actual: 0, kind: 'bystander' }); continue; }
    const n = state.npcs[id];
    const before = n.att;
    n.att = clamp(before + ripple);
    applied.push({ npc: id, before, after: n.att, expected: ripple, actual: n.att - before, kind: 'bystander' });
  }
  if (opt.hunger) state.hunger = clamp(state.hunger + opt.hunger);
  if (opt.grudge) state.npcs[primary].grudge += opt.grudge;
  if (Object.keys(opt.d || {}).length > 1) state.stats.transfers++;
  if (panic) state.stats.panics++;
  state.stats.choices++;

  // 反应台词
  const lines = applied.map(a => {
    const r = NPCS[a.npc].react;
    if (a.kind === 'primary') return { npc: a.npc, text: a.actual > 2 ? r.up : a.actual < -2 ? r.down : '「……」' };
    if (a.kind === 'heard') return { npc: a.npc, text: r.transfer };
    if (a.kind === 'bystander') return { npc: a.npc, text: r.heard };
    return null;
  }).filter(Boolean);

  const zones = state.scene.present.map(id => zoneOf(state.npcs[id].att));
  state.scene.stamp = zones.includes('hot') ? 'danger' : zones.includes('cold') ? 'cold' : 'perfect';
  state.scene.reaction = { option: opt.text, panic, deltas: applied, lines };
  if (state.scene.stamp === 'perfect' && !panic) {
    state.stats.streak++;
    if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
    if (state.stats.streak >= 5 && state.items.length < MAX_ITEMS) {
      const pool = ITEM_IDS.filter(i => !state.items.includes(i));
      if (pool.length) { const drop = state.rng.pick(pool); state.items.push(drop); }
    }
  } else { state.stats.streak = 0; }
  state.scene.phase = 'react';

  if (state.hunger <= 0) return finish(state, false, `在「${sc.place}」饿晕了`);
  return true;
}

// 用道具：只能在选择阶段。返回 { ok, item, timeBonus }
export function useItem(state, idx) {
  if (state.screen !== 'scene' || state.scene.phase !== 'choose') return { ok: false };
  const id = state.items[idx];
  const it = ITEMS[id];
  if (!it) return { ok: false };
  const sc = sceneDef(state);
  const primary = state.npcs[sc.npc];
  const mods = state.scene.mods;
  let note = '';
  let timeBonus = 0;
  switch (id) {
    case 'mask': mods.posMult = 0.5; note = '本场对方热情减半'; break;
    case 'earbuds': primary.att = clamp(primary.att - 10); note = `${NPCS[sc.npc].name} −10`; break;
    case 'sms':
      primary.att = clamp(primary.att - 20);
      state.scene.present.filter(x => x !== sc.npc).forEach(x => { state.npcs[x].att = clamp(state.npcs[x].att + 5); });
      note = `${NPCS[sc.npc].name} −20，在场其他人 +5`; break;
    case 'powerbank': state.flags.shield = true; note = '下一次被缠住免罚'; break;
    case 'sunglasses': mods.noBystander = true; note = '本场旁观者不受影响'; break;
    case 'snack': state.hunger = clamp(state.hunger + 10); note = '饥饿 +10'; break;
    case 'coffee': timeBonus = it.timeBonus; mods.timerBonus += timeBonus; note = '倒计时 +5 秒'; break;
    default: return { ok: false };
  }
  state.items.splice(idx, 1);
  state.stats.itemsUsed++;
  mods.used.push({ id, text: `${it.icon} ${it.name}：${note}` });
  return { ok: true, item: it, timeBonus };
}

// 事件牌
export function useEvent(state) {
  if (!state.scene || !state.scene.event || state.scene.eventUsed || state.scene.phase !== 'choose') return { ok: false, reason: '没有事件牌或已用过' };
  const ev = EVENTS[state.scene.event];
  if (!ev) return { ok: false };
  const ctx = { ITEMS, ITEM_IDS, MAX_ITEMS, NPCS, activeNpcs, clamp };
  const result = ev.apply(state, state.rng, ctx);
  state.scene.eventUsed = true;
  state.scene.eventResult = { ok: result.ok, text: result.ok ? ev.okText : (ev.failText || ev.okText) };
  state.stats.events = (state.stats.events || 0) + 1;
  if (result.ended) endScene(state);
  return { ok: true, success: result.ok, ended: result.ended, ev };
}

// 路人小游戏结算：value 为最终注意力；how 为 'release' | 'go' | 'timeout'
export function resolveMini(state, value, how = 'release') {
  if (state.screen !== 'mini' || !state.mini || state.mini.done) return false;
  const sc = sceneDef(state);
  const n = state.npcs[sc.npc];
  n.att = clamp(Math.round(value));
  state.mini.done = true;
  state.mini.value = n.att;
  state.mini.how = how;
  if (how === 'timeout') state.hunger = clamp(state.hunger - 4);
  state.stats.choices++;
  state.screen = 'scene';
  state.scene.phase = 'react';
  endScene(state);
  if (state.hunger <= 0 && state.screen !== 'result') finish(state, false, `在「${sc.place}」饿晕了`);
  return true;
}

// 招数：装透明（躲）/ 支走（借他人）/ 装忙（防）。不消耗对话拍。
export function dodgeRate(state) {
  const sc = sceneDef(state);
  let rate = DODGE_RATE[zoneOf(state.npcs[sc.npc].att)];
  if (hasMod(state, 'friday')) rate = Math.min(0.95, rate + 0.10);
  if (atLevel(state, 5)) rate = Math.max(0.05, rate - LV_DODGE_CUT);
  return rate;
}
export function divertTargets(state) {
  const sc = sceneDef(state);
  const ids = new Set([...activeNpcs(state), ...state.scene.present]);
  ids.delete(sc.npc);
  return [...ids];
}
export function useMove(state, move, target) {
  if (state.screen !== 'scene' || state.scene.phase !== 'choose') return { ok: false, reason: '现在不能用' };
  const sc = sceneDef(state);
  const primary = sc.npc;
  const n = state.npcs[primary];
  const mods = state.scene.mods;
  if (move === 'dodge') {
    if (mods.dodgeUsed) return { ok: false, reason: '这场已经试过了' };
    mods.dodgeUsed = true;
    const rate = dodgeRate(state);
    const ok = state.rng.next() < rate;
    if (ok) {
      state.stats.dodges++;
      mods.used.push({ id: 'dodge', text: `👻 装透明：成功溜走（${Math.round(rate * 100)}%）` });
      state.scene.dodged = true;
      endScene(state);
      return { ok: true, success: true, ended: true };
    }
    n.att = clamp(n.att + DODGE_FAIL);
    mods.used.push({ id: 'dodge', text: `👻 装透明：被抓包，${NPCS[primary].name} +${DODGE_FAIL}` });
    return { ok: true, success: false, ended: false };
  }
  if (move === 'divert') {
    if (target === 'zhang' && hasMod(state, 'zhangbday')) return { ok: false, reason: '小张今天过生日，大家都迁就他，不能拿他当借口' };
    if (state.moves.divertLeft <= 0) return { ok: false, reason: '今天的借口用完了' };
    if (!target || !divertTargets(state).includes(target)) return { ok: false, reason: '要先选一个人' };
    state.moves.divertLeft--;
    state.stats.diverts++;
    n.att = clamp(n.att + DIVERT_SELF);
    const t = state.npcs[target];
    const heard = state.scene.present.includes(target);
    const delta = Math.round(DIVERT_TARGET * (heard ? HEARD_MULT : 1));
    t.att = clamp(t.att + delta);
    if (!t.transient) t.active = true;
    mods.used.push({ id: 'divert', text: `👉 支走：「${NPCS[target].name}找你！」${NPCS[primary].name} ${DIVERT_SELF}，${NPCS[target].name} +${delta}${heard ? '（在场，听见了）' : ''}` });
    return { ok: true, ended: false, line: heard ? NPCS[target].react.transfer : null };
  }
  if (move === 'busy') {
    if (mods.busyUsed) return { ok: false, reason: '这场已经装过了' };
    mods.busyUsed = true;
    mods.busyBeat = state.scene.beat;
    state.stats.busy++;
    state.hunger = clamp(state.hunger + BUSY_HUNGER);
    mods.used.push({ id: 'busy', text: `🧱 装忙：这一句无论怎么说 ${NPCS[primary].name} 都不会升温，饥饿 ${BUSY_HUNGER}` });
    if (state.hunger <= 0) finish(state, false, `在「${sc.place}」装忙装到饿晕`);
    return { ok: true, ended: false };
  }
  return { ok: false, reason: '没有这招' };
}

// 超时：慌了，随机选（偏向热情型陷阱）
export function panic(state) {
  if (state.screen !== 'scene' || state.scene.phase !== 'choose') return false;
  const beat = currentBeat(state);
  const items = beat.options.map((_, i) => ({ w: PANIC_WEIGHTS[i] ?? 10, v: i }));
  return choose(state, state.rng.weighted(items), true);
}

// 看完反应 → 下一拍（可能有人闯入）或场景结束
export function advance(state) {
  if (state.screen !== 'scene' || state.scene.phase !== 'react') return false;
  const sc = sceneDef(state);
  state.scene.beat++;
  state.scene.reaction = null;
  if (state.scene.beat >= sc.beats.length) { endScene(state); return true; }
  state.scene.phase = 'choose';
  if (!sc.isCall) rollIntrusion(state);
  return true;
}

function rollIntrusion(state) {
  if (state.flags.noIntrude) return; // 测试用
  const sc = sceneDef(state);
  const candidates = activeNpcs(state).filter(id => !state.scene.present.includes(id));
  const hot = candidates.filter(id => zoneOf(state.npcs[id].att) === 'hot');
  let who = null;
  if (hot.length && state.rng.next() < INTRUDE.hot) who = state.rng.pick(hot);
  else if (state.rng.next() < (atLevel(state, 4) ? LV_INTRUDE_RANDOM : INTRUDE.random)) who = state.rng.pick(candidates);
  else if (!sc.stranger && state.rng.next() < ANIMAL_INTRUDE) {
    who = state.rng.pick(ANIMAL_IDS);
    state.npcs[who] = { att: NPCS[who].init, grudge: 0, active: false, transient: true };
  }
  if (!who) return;
  state.scene.present.push(who);
  state.scene.intruder = who;
  state.scene.intrusionLine = NPCS[who].react.intrude;
  void sc;
}

function endScene(state) {
  const sc = sceneDef(state);
  const id = sc.npc;
  const n = state.npcs[id];
  const def = NPCS[id];
  const zone = zoneOf(n.att);
  const lines = [];
  let incident = null;

  if (state.scene.dodged) lines.push('你把存在感调到最低，趁 TA 低头的一秒钟，溜了。');
  if (state.scene.eventDodged) lines.push(EVENTS[state.scene.event].okText);
  if (state.mini && state.mini.npc === id && def.mini) {
    const m = state.mini;
    if (m.kind === 'pet') lines.push(zone === 'safe' ? '摸得刚刚好。它满意了，你也走了。' : zone === 'hot' ? def.mini.late : def.mini.early);
    else lines.push(m.how === 'timeout' ? def.mini.stall : zone === 'hot' ? def.mini.caught : '你贴着人群边缘滑了过去，TA 没回头。');
  }
  if (sc.isCall) {
    lines.push(zone === 'cold' ? '她没再打过来。' : zone === 'hot' ? '「那你路上小心，到了说一声。」' : '「行，等你回来。」');
  } else if (zone === 'safe') {
    const anyoneHot = activeNpcs(state).some(k => zoneOf(state.npcs[k].att) === 'hot');
    if (anyoneHot) lines.push(def.perfectLine + ' 但还有人在惦记你，算不上完美。');
    else { state.stats.perfect++; lines.push(def.perfectLine); }
  } else if (zone === 'hot' && state.flags.shield) {
    state.flags.shield = false;
    lines.push(`充电宝生效：「手机没电了，我先走！」${def.name}愣在原地。没扣饥饿，不算事故。`);
  } else if (zone === 'hot') {
    if (def.overload && n.att >= (hasMod(state, 'overtime') && def.id === 'boss' ? 75 : def.overload.at)) {
      incident = def.overload.title;
      lines.push(def.overload.text);
      state.hunger = clamp(state.hunger + def.overload.hunger);
      n.att = def.overload.reset;
    } else {
      incident = def.hot.title;
      lines.push(def.hot.text);
      if (def.hot.hunger) state.hunger = clamp(state.hunger + def.hot.hunger);
      if (def.hot.att) n.att = clamp(n.att + def.hot.att);
      if (def.hot.companion) state.companion = true;
      if (def.hot.mom) { state.npcs.mom.att = clamp(state.npcs.mom.att + def.hot.mom); lines.push('你妈的注意力上来了。'); }
    }
  } else {
    lines.push(def.coldLine);
  }
  if (def.transient) {
    state.stats.strangers++;
    if (zone === 'safe' && def.drop && state.items.length < MAX_ITEMS) {
      state.items.push(def.drop);
      lines.push(`${def.name}${def.dropLine} 获得道具「${ITEMS[def.drop].name}」。`);
    } else if (zone === 'safe' && def.drop) {
      lines.push('道具栏满了，没拿。');
    }
  }
  // 在场的其他人过热也会缠一下（代价减半）
  for (const other of state.scene.present) {
    if (other === id) continue;
    const od = NPCS[other];
    if (zoneOf(state.npcs[other].att) === 'hot' && od.hot.hunger) {
      lines.push(`${od.name}也凑了上来：${od.hot.text}`);
      state.hunger = clamp(state.hunger + Math.round(od.hot.hunger / 2));
      if (!incident) incident = od.hot.title;
      if (od.hot.companion) state.companion = true;
    }
  }
  if (incident) { state.stats.incidents++; state.stats.incidentLog.push(incident); }

  state.scene.done = true;
  state.scene.outcome = { zone, lines, incident };
  state.mini = null;
  state.screen = 'summary';
  if (state.hunger <= 0) finish(state, false, `被${def.name}拖住，饿晕了`);
}

export function continueFromSummary(state) {
  if (state.screen !== 'summary') return false;
  const sc = sceneDef(state);
  if (sc.isCall) {
    state.scene = null;
    const slot = currentSlot(state);
    if (slot.choices.length === 1) enterScene(state, slot.choices[0]);
    else state.screen = 'pick';
    return true;
  }
  if (sc.final) return finish(state, true, null);
  endSlot(state);
  return true;
}

function endSlot(state) {
  if (state.stats.streak >= 3) state.flags.relaxed = true;
  else delete state.flags.relaxed;
  const ids = activeNpcs(state);
  const seen = state.scene ? state.scene.present : [];
  for (const id of ids) {
    const def = NPCS[id];
    const n = state.npcs[id];
    if (!seen.includes(id)) n.att = clamp(n.att - (hasMod(state, 'rainy') ? Math.ceil(NEGLECT_DECAY / 2) : NEGLECT_DECAY));
    if (def.trait === 'unstable') n.att = clamp(n.att + state.rng.int(-15, 15));
    if (def.trait === 'contagious' && ids.some(k => k !== id && zoneOf(state.npcs[k].att) === 'hot')) n.att = clamp(n.att + 6);
  }
  for (const id of ids) {
    const def = NPCS[id];
    const n = state.npcs[id];
    if (zoneOf(n.att) === 'cold') {
      n.grudge += def.trait === 'unstable' ? 2 : 1;
      if (id === 'mom') state.pendingCall = true;
    } else {
      n.grudge = 0;
    }
    if (n.grudge >= 2) {
      triggerTrouble(state, id);
      n.grudge = 0;
      if (id === 'mom') state.pendingCall = false;
    }
  }
  state.hunger = clamp(state.hunger - SLOT_HUNGER - (atLevel(state, 2) ? LV_SLOT_HUNGER : 0) + (hasMod(state, 'waimai') ? 3 : 0));
  if (state.hunger <= 0) return finish(state, false, '走着走着，饿晕在路边');
  state.slot++;
  state.scene = null;
  startSlot(state);
}

function triggerTrouble(state, id) {
  const t = NPCS[id].trouble;
  const n = state.npcs[id];
  n.att = t.self;
  if (t.others) {
    for (const [k, v] of Object.entries(t.others)) {
      if (k === 'all') activeNpcs(state).filter(x => x !== id).forEach(x => { state.npcs[x].att = clamp(state.npcs[x].att + v); });
      else { state.npcs[k].active = true; state.npcs[k].att = clamp(state.npcs[k].att + v); }
    }
  }
  if (t.hunger) state.hunger = clamp(state.hunger + t.hunger);
  if (t.flag) state.flags[t.flag] = true;
  state.stats.incidents++;
  state.stats.incidentLog.push(t.title);
  state.notices.push({ npc: id, title: t.title, text: t.text });
}

export function finish(state, win, cause) {
  const lines = [];
  let extraIncidents = 0;
  if (win) {
    const mom = state.npcs.mom;
    if (zoneOf(mom.att) === 'hot') {
      lines.push('妈：「坐下，先跟妈说说今天。」二十分钟后你才端起碗。');
      state.hunger = clamp(state.hunger - 15);
      extraIncidents++;
      state.stats.incidentLog.push('被妈留下聊天');
    }
    if (state.flags.momAngry) {
      lines.push('饭已经凉了。妈没说话，默默端去热。');
      state.hunger = clamp(state.hunger - 8);
    }
    if (state.hunger <= 0) { win = false; cause = '在饭桌前饿晕了'; }
    else {
      if (zoneOf(state.npcs.boss.att) === 'hot') lines.push('刚坐下，手机亮了。老板：「明天早点来。」');
      if (zoneOf(state.npcs.lin.att) === 'hot') lines.push('手机又亮了。小林：「到家了吗？」');
      if (zoneOf(state.npcs.zhang.att) === 'hot') lines.push('小张发来 47 条语音。你一条没点。');
      if (state.npcs.teacher.active && zoneOf(state.npcs.teacher.att) === 'hot') lines.push('老师把你拉进了「优秀毕业生返校分享」群。');
      lines.push('你夹起第一口。世界安静了。为了这一口，今天谁都没能拦住你。');
    }
  }
  state.stats.incidents += extraIncidents;
  let grade = null;
  if (win) grade = (state.stats.incidents === 0 && state.stats.perfect >= 8) ? 'S' : state.stats.incidents <= 2 ? 'A' : 'B';
  let mealState = 'dream';
  if (win) {
    if (state.flags.momAngry) mealState = 'cold';
    else if (grade === 'B' || zoneOf(state.npcs.mom.att) === 'hot') mealState = 'warm';
    else mealState = 'hot';
  }
  state.result = {
    win, cause, grade, lines,
    meal: { id: state.meal, state: mealState, name: MEALS[state.meal].name, icon: MEALS[state.meal].icon, text: MEALS[state.meal][mealState] },
    hunger: state.hunger, stats: { ...state.stats, incidentLog: [...state.stats.incidentLog] },
    npcs: NPC_ORDER.filter(id => state.npcs[id].active).map(id => ({ id, att: state.npcs[id].att, zone: zoneOf(state.npcs[id].att) })),
    slot: state.slot,
    level: state.level || 0,
  };
  state.screen = 'result';
  state.result.tasks = taskStatus(state);
  state.result.tasksDone = state.result.tasks.filter(t => t.status === 'done').length;
  return true;
}

// ── 存档 ──
export function serialize(state) {
  const { rng, ...rest } = state;
  return JSON.stringify({ ...rest, rngState: rng.state });
}

export function deserialize(json) {
  const o = JSON.parse(json);
  if (o.version !== SAVE_VERSION) throw new Error('存档版本不符');
  const rng = makeRng(o.seed);
  rng.state = o.rngState;
  delete o.rngState;
  return { ...o, rng };
}
