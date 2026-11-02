// 遭遇（回合制）引擎。规则见 docs/GDD.md 第 5 节。纯逻辑，不碰 DOM。
import { CARDS, makeCard, SUBJECTS } from './data/cards.js';
import { NPCS } from './data/npcs.js';

export const ENERGY_MAX = 3;
export const HAND_SIZE = 5;
export const LOW_HUNGER = 20;
const SUBJECT_IDS = ['math', 'chinese', 'english'];

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function stickMultiplier(state, opts) {
  let m = 1;
  if (opts.elite) m *= 1.5;
  if (state.face > 80) m *= 1.2;
  if (state.face < 30) m *= 1.25;
  return m;
}

export function startBattle(state, npcId, opts = {}) {
  const def = NPCS[npcId];
  const rng = state.rng;
  const b = {
    npcId, name: def.name, icon: def.icon, boss: !!def.boss, final: !!def.final, elite: !!opts.elite,
    phaseIdx: 0, phases: def.phases || null, phaseName: null,
    intents: def.intents || null, intentIdx: 0, intent: null,
    stick: 0, stickMax: 0, suspicion: 0,
    turn: 1, energy: ENERGY_MAX, composure: 0,
    draw: [], hand: [], discard: [], removed: [],
    mods: { skipNpc: false, drawNext: 0 }, answered: false,
    log: [], over: null, speech: def.lines.enter, lastPlayed: null,
  };
  if (b.phases) {
    applyPhase(state, b, 0);
  } else {
    b.stick = b.stickMax = Math.round(def.stick * stickMultiplier(state, opts));
  }
  if (b.elite) b.name = `${def.name}（精英）`;

  b.log.push(`遭遇${b.name}。${def.lines.enter}`);
  if (b.elite) b.log.push('精英：粘性 ×1.5');
  if (state.face > 80) b.log.push('人缘太好：对方更想拉着你聊，粘性 ×1.2');
  if (state.face < 30) b.log.push('没面子：人家更不放你走，粘性 ×1.25，借口牌费用 +1');

  b.draw = rng.shuffle(state.deck.map(c => ({ ...c })));
  if (def.exam) {
    for (let i = 0; i < 3; i++) b.draw.push(makeCard(rng.pick(SUBJECT_IDS), true));
    rng.shuffle(b.draw);
    b.log.push('老师发了试卷：3 张学科牌洗入抽牌堆');
  }
  state.battle = b;
  setIntent(state, b);
  drawCards(state, b, HAND_SIZE);
  return b;
}

function applyPhase(state, b, idx) {
  const ph = b.phases[idx];
  b.phaseIdx = idx;
  let stick = ph.stick;
  if (idx === 1 && state.flags.familyHungUp) stick += 10;
  b.stick = stick;
  b.stickMax = stick;
  b.intents = ph.intents;
  b.intentIdx = 0;
  b.phaseName = ph.name;
  b.icon = ph.icon;
  b.speech = ph.enter;
}

function setIntent(state, b) {
  const base = b.intents[b.intentIdx % b.intents.length];
  b.intent = { ...base };
  if (b.intent.kind === 'question') b.intent.subject = state.rng.pick(SUBJECT_IDS);
  b.answered = false;
}

// 老板疑心 ≥ 5 时，本回合结束的行动被「加班」覆盖
export function effectiveIntent(b) {
  const def = NPCS[b.npcId];
  if (def.overtime && b.suspicion >= 5) return def.overtime;
  return b.intent;
}

export function intentText(intent) {
  switch (intent.kind) {
    case 'talk': return `唠叨：粘性 +${intent.value}`;
    case 'stall': return `拖时间：饥饿 −${intent.value}`;
    case 'press': return `追问：面子 −${intent.value}（镇定可抵挡）`;
    case 'question': return `提问「${SUBJECTS[intent.subject]}」：回合内不答，面子 −8`;
    case 'overtime': return `加班！面子 −${intent.value}，粘性 +${intent.stick}`;
    default: return '';
  }
}

export function drawCards(state, b, n) {
  for (let i = 0; i < n; i++) {
    if (!b.draw.length) {
      if (!b.discard.length) break;
      b.draw = state.rng.shuffle(b.discard);
      b.discard = [];
    }
    b.hand.push(b.draw.pop());
  }
}

export function cardCost(state, card) {
  const def = CARDS[card.id];
  return def.cost + (def.type === 'excuse' && state.face < 30 ? 1 : 0);
}

export function canPlay(state, b, card) {
  const def = CARDS[card.id];
  if (b.over) return { ok: false, reason: '遭遇已结束' };
  if (state.hunger < LOW_HUNGER && (def.cost >= 2 || def.type === 'ultimate')) {
    return { ok: false, reason: '饿得判断力下降，用不出这张' };
  }
  const cost = cardCost(state, card);
  if (cost > b.energy) return { ok: false, reason: `能量不足（需要 ${cost}）` };
  return { ok: true };
}

export function isWorn(state, cardId) {
  const def = CARDS[cardId];
  return def.type === 'excuse' && (state.excuseUses[cardId] || 0) >= 2;
}

export function playCard(state, uid) {
  const b = state.battle;
  const idx = b.hand.findIndex(c => c.uid === uid);
  if (idx < 0) return { ok: false, reason: '手里没有这张牌' };
  const card = b.hand[idx];
  const def = CARDS[card.id];
  const chk = canPlay(state, b, card);
  if (!chk.ok) return chk;

  b.energy -= cardCost(state, card);
  b.hand.splice(idx, 1);
  const npc = NPCS[b.npcId];
  const msgs = [];
  let persuade = def.persuade || 0;
  let face = def.face || 0;
  let composure = def.composure || 0;
  let worn = false;

  if (def.special === 'bomb' && b.npcId === 'colleague') { persuade = 15; msgs.push('同事被拉去聊别人了'); }
  if (def.special === 'report' && b.npcId === 'boss') {
    persuade = 7;
    b.suspicion = Math.max(0, b.suspicion - 3);
    msgs.push('疑心 −3');
  }
  if (def.type === 'subject' && b.intent.kind === 'question' && b.intent.subject === def.subject && !b.answered) {
    persuade = 12; face += 3; b.answered = true; msgs.push('答对了！');
  }
  if (def.type === 'excuse') {
    const uses = state.excuseUses[def.id] || 0;
    if (uses >= 2) { persuade = Math.floor(persuade / 2); worn = true; }
    state.excuseUses[def.id] = uses + 1;
    state.stats.excuses++;
    if (b.npcId === 'boss' && def.special !== 'report') { b.suspicion++; msgs.push(`老板疑心 ${b.suspicion}`); }
  }
  if (composure && def.type === 'social' && npc.socialHalf) { composure = Math.floor(composure / 2); msgs.push('推销员根本不听，镇定减半'); }

  if (persuade) b.stick = Math.max(0, b.stick - persuade);
  b.composure += composure;
  if (face) state.face = clamp(state.face + face, 0, 100);
  if (def.hunger) state.hunger = clamp(state.hunger + def.hunger, 0, 100);
  if (def.skipNpc) b.mods.skipNpc = true;
  if (def.drawNext) b.mods.drawNext += def.drawNext;

  if (def.exhaust) {
    b.removed.push(card);
    if (!card.temp) state.deck = state.deck.filter(c => c.uid !== card.uid);
  } else {
    b.discard.push(card);
  }
  if (def.draw) drawCards(state, b, def.draw);
  state.stats.cardsPlayed++;

  const bits = [];
  if (persuade) bits.push(`说服 ${persuade}`);
  if (composure) bits.push(`镇定 ${composure}`);
  if (face) bits.push(`面子 ${face > 0 ? '+' : ''}${face}`);
  b.log.push(`打出「${def.name}」${worn ? '（用烂了，效果减半）' : ''}${bits.length ? '：' + bits.join('，') : ''}${msgs.length ? '，' + msgs.join('，') : ''}`);
  b.lastPlayed = { id: def.id, persuade, composure, worn };

  checkStick(state, b);
  return { ok: true };
}

function checkStick(state, b) {
  if (b.stick > 0) return;
  if (b.phases && b.phaseIdx < b.phases.length - 1) {
    let next = b.phaseIdx + 1;
    if (b.phases[next].skipIfCalled && state.flags.familyCalled) {
      b.log.push('家人：「知道你饿，垃圾我倒，你先吃。」（接过电话，跳过阶段）');
      next++;
    }
    if (next < b.phases.length) {
      b.log.push(`阶段突破 → ${b.phases[next].name}`);
      applyPhase(state, b, next);
      setIntent(state, b);
      b.mods.skipNpc = false;
      return;
    }
  }
  b.over = 'win';
  b.speech = NPCS[b.npcId].lines.win;
  b.log.push('脱身成功！');
}

export function endTurn(state) {
  const b = state.battle;
  if (!b || b.over) return;
  const intent = effectiveIntent(b);

  if (b.mods.skipNpc) {
    b.log.push(`${b.name}的话被你带偏了，「${intentText(intent)}」失效。`);
  } else {
    switch (intent.kind) {
      case 'talk':
        b.stick = Math.min(b.stickMax, b.stick + intent.value);
        b.log.push(`${intent.text} 粘性 +${intent.value}`);
        break;
      case 'stall':
        state.hunger = clamp(state.hunger - intent.value, 0, 100);
        b.log.push(`${intent.text} 饥饿 −${intent.value}`);
        break;
      case 'press': {
        const dmg = Math.max(0, intent.value - b.composure);
        state.face = clamp(state.face - dmg, 0, 100);
        b.log.push(`${intent.text} 面子 −${dmg}${dmg < intent.value ? `（镇定抵挡 ${intent.value - dmg}）` : ''}`);
        break;
      }
      case 'question':
        if (b.answered) b.log.push('你答上来了，老师很满意。');
        else { state.face = clamp(state.face - 8, 0, 100); b.log.push('「……」你答不上来。面子 −8'); }
        break;
      case 'overtime':
        state.face = clamp(state.face - intent.value, 0, 100);
        b.stick += intent.stick;
        b.stickMax = Math.max(b.stickMax, b.stick);
        b.suspicion = 0;
        b.log.push(`${intent.text} 面子 −${intent.value}，粘性 +${intent.stick}`);
        break;
    }
  }
  if (intent.kind !== 'overtime') b.intentIdx++;
  b.speech = intent.text;
  b.composure = 0;
  b.mods.skipNpc = false;
  state.hunger = clamp(state.hunger - 1, 0, 100);
  state.stats.turns++;

  if (state.hunger <= 0) {
    b.over = 'lose';
    b.log.push('眼前一黑……');
    return;
  }
  b.discard.push(...b.hand);
  b.hand = [];
  b.turn++;
  b.energy = ENERGY_MAX;
  setIntent(state, b);
  drawCards(state, b, HAND_SIZE + b.mods.drawNext);
  b.mods.drawNext = 0;
}
