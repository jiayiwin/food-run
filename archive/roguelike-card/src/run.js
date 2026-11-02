// 单局状态机：地图行走、事件、补给、奖励、结算、存档。
import { makeRng, randomSeed } from './rng.js';
import { CARDS, STARTING_DECK, makeCard, cardsOfType, REWARD_TYPE_WEIGHTS, resetUid } from './data/cards.js';
import { EVENTS } from './data/events.js';
import { generateMap } from './map.js';
import { startBattle, clamp } from './battle.js';

export const SAVE_VERSION = 1;

export function newRun(seed = randomSeed()) {
  const rng = makeRng(seed);
  resetUid(1);
  return {
    version: SAVE_VERSION, seed, rng,
    hunger: 100, face: 60, decay: 3,
    deck: STARTING_DECK.map(id => makeCard(id)),
    excuseUses: {}, flags: {},
    act: 0, row: -1, col: -1,
    map: generateMap(rng),
    stats: { turns: 0, cardsPlayed: 0, excuses: 0, nodes: 0, fights: 0 },
    screen: 'map', battle: null, event: null, rest: null, reward: null, result: null,
    toast: '下班了。目标只有一个：吃到饭。',
  };
}

export function currentAct(state) { return state.map[state.act]; }
export function currentNode(state) {
  if (state.row < 0) return null;
  return currentAct(state).rows[state.row][state.col];
}

export function reachable(state) {
  const act = currentAct(state);
  if (state.row < 0) return act.rows[0].map((_, i) => ({ row: 0, idx: i }));
  if (state.row >= act.rows.length - 1) return [];
  const cur = act.rows[state.row][state.col];
  return cur.next.map(i => ({ row: state.row + 1, idx: i }));
}

export function enterNode(state, row, idx) {
  if (state.screen !== 'map') return false;
  if (!reachable(state).some(r => r.row === row && r.idx === idx)) return false;
  const node = currentAct(state).rows[row][idx];
  state.row = row; state.col = idx; node.done = true;
  state.stats.nodes++;
  state.toast = null;
  state.hunger = clamp(state.hunger - state.decay, 0, 100);
  if (state.hunger <= 0) return finish(state, false, `走到「${currentAct(state).name}」第 ${row + 1} 层，饿晕在路边`);

  switch (node.type) {
    case 'fight': case 'elite': case 'boss':
      state.stats.fights++;
      startBattle(state, node.npc, { elite: node.type === 'elite' });
      state.screen = 'battle';
      break;
    case 'event':
      state.event = { id: node.event, chosen: null, result: null };
      state.screen = 'event';
      break;
    case 'rest':
      state.rest = { chosen: null, result: null, picking: false };
      state.screen = 'rest';
      break;
  }
  return true;
}

// ── 遭遇结束 ──
export function settleBattle(state) {
  const b = state.battle;
  if (!b || !b.over) return false;
  if (b.over === 'lose') return finish(state, false, `被${b.name}拖住，饿昏倒地`);
  if (b.final) return finish(state, true, null);
  const node = currentNode(state);
  let bonus = null;
  if (node.type === 'boss') { state.face = clamp(state.face + 10, 0, 100); bonus = '面子 +10'; }
  else if (node.type === 'elite') { state.face = clamp(state.face + 5, 0, 100); bonus = '面子 +5'; }
  state.reward = { cards: rollRewards(state, node.type !== 'fight'), bonus, from: b.name };
  state.battle = null;
  state.screen = 'reward';
  return true;
}

export function rollRewards(state, forceUltimate) {
  const rng = state.rng;
  const picks = [];
  const pool = type => cardsOfType(type).filter(c => !picks.includes(c.id));
  if (forceUltimate) picks.push(rng.pick(pool('ultimate')).id);
  let guard = 50;
  while (picks.length < 3 && guard-- > 0) {
    const p = pool(rng.weighted(REWARD_TYPE_WEIGHTS));
    if (p.length) picks.push(rng.pick(p).id);
  }
  return picks;
}

export function chooseReward(state, cardId) {
  if (state.screen !== 'reward') return false;
  if (cardId && state.reward.cards.includes(cardId)) state.deck.push(makeCard(cardId));
  afterNode(state);
  return true;
}

// ── 事件 ──
export function eventOptions(state) {
  const ev = EVENTS[state.event.id];
  return ev.options.filter(o => !o.requiresTag || state.deck.some(c => CARDS[c.id].eventTag === o.requiresTag));
}

export function chooseEvent(state, label) {
  if (state.screen !== 'event' || state.event.chosen) return false;
  const opt = eventOptions(state).find(o => o.label === label);
  if (!opt) return false;
  const e = opt.effects;
  if (opt.requiresTag) {
    const i = state.deck.findIndex(c => CARDS[c.id].eventTag === opt.requiresTag);
    if (i >= 0) state.deck.splice(i, 1);
  }
  if (e.hunger) state.hunger = clamp(state.hunger + e.hunger, 0, 100);
  if (e.face) state.face = clamp(state.face + e.face, 0, 100);
  if (e.decay) state.decay += e.decay;
  if (e.flag) state.flags[e.flag] = true;
  if (e.addCard) state.deck.push(makeCard(e.addCard));
  state.event.chosen = opt.label;
  state.event.result = opt.result;
  if (state.hunger <= 0) finish(state, false, `在「${EVENTS[state.event.id].title}」耗尽了最后一点力气`);
  return true;
}

// ── 补给 ──
export function chooseRest(state, kind, uid) {
  if (state.screen !== 'rest' || state.rest.chosen) return false;
  const r = state.rest;
  switch (kind) {
    case 'snack':
      state.hunger = clamp(state.hunger + 20, 0, 100);
      state.decay += 1;
      r.chosen = kind; r.result = '一袋辣条下肚。饥饿 +20，但胃口开了，每节点衰减 +1。';
      break;
    case 'calm':
      state.face = clamp(state.face + 10, 0, 100);
      r.chosen = kind; r.result = '洗了把脸，照照镜子。面子 +10。';
      break;
    case 'remove':
      if (!uid) { r.picking = true; return true; }
      {
        const i = state.deck.findIndex(c => c.uid === uid);
        if (i < 0) return false;
        const [card] = state.deck.splice(i, 1);
        r.chosen = kind; r.picking = false;
        r.result = `你决定以后再也不说「${CARDS[card.id].name}」了。`;
      }
      break;
    case 'cancel-remove':
      r.picking = false;
      return true;
    default:
      return false;
  }
  return true;
}

// ── 节点收尾 ──
export function afterNode(state) {
  const act = currentAct(state);
  if (state.row >= act.rows.length - 1 && state.act < state.map.length - 1) {
    state.act++; state.row = -1; state.col = -1;
    state.toast = `第 ${state.act + 1} 幕 · ${state.map[state.act].name}：${state.map[state.act].subtitle}`;
  }
  state.screen = 'map';
  state.reward = null; state.event = null; state.rest = null; state.battle = null;
}

export function finish(state, win, cause) {
  let grade = null;
  if (win) grade = (state.hunger >= 40 && state.face >= 50) ? 'S' : state.hunger >= 20 ? 'A' : 'B';
  state.result = {
    win, cause, grade,
    act: state.act, row: state.row,
    hunger: state.hunger, face: state.face,
    stats: { ...state.stats }, deckSize: state.deck.length,
  };
  state.screen = 'result';
  state.battle = null;
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
  let maxUid = 0;
  const scan = list => (list || []).forEach(c => { const n = Number(c.uid.split('#')[1]); if (n > maxUid) maxUid = n; });
  scan(o.deck);
  if (o.battle) { scan(o.battle.draw); scan(o.battle.hand); scan(o.battle.discard); scan(o.battle.removed); }
  resetUid(maxUid + 1);
  return { ...o, rng };
}
