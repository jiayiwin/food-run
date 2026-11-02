// 自动试玩 AI：random（纯随机）/ greedy（简单贪心）。用于回归与数值校验。
import * as Run from '../src/run.js';
import { playCard, endTurn, canPlay, effectiveIntent, isWorn } from '../src/battle.js';
import { CARDS } from '../src/data/cards.js';
import { makeRng } from '../src/rng.js';

function cardScore(state, b, c) {
  const def = CARDS[c.id];
  const intent = effectiveIntent(b);
  let persuade = def.persuade || 0;
  if (def.special === 'bomb' && b.npcId === 'colleague') persuade = 15;
  if (def.special === 'report' && b.npcId === 'boss') persuade = 7;
  if (def.type === 'subject' && intent.kind === 'question' && intent.subject === def.subject && !b.answered) persuade = 12;
  if (isWorn(state, c.id)) persuade = Math.floor(persuade / 2);
  let score = persuade;
  if (intent.kind === 'press' && def.composure) score += Math.min(def.composure, Math.max(0, intent.value - b.composure));
  if (def.skipNpc) score += intent.kind === 'stall' ? intent.value : 2;
  if (def.hunger) score += state.hunger < 50 ? def.hunger : 0;
  if (def.face) score += def.face * (state.face < 40 ? 0.6 : 0.15);
  if (b.npcId === 'boss' && def.type === 'excuse' && def.special !== 'report' && b.suspicion >= 4) score -= 10;
  return score;
}

function rewardScore(id) {
  const def = CARDS[id];
  return (def.persuade || 0) + (def.composure || 0) * 0.4 + (def.draw || 0) * 3 + (def.skipNpc ? 4 : 0) + (def.face || 0) * 0.3 - def.cost;
}

export function simulate(seed, policy = 'random', maxSteps = 5000) {
  const state = Run.newRun(seed);
  const ai = makeRng((seed ^ 0x9e3779b9) >>> 0);
  let steps = 0;
  while (state.screen !== 'result' && steps++ < maxSteps) {
    switch (state.screen) {
      case 'map': {
        const opts = Run.reachable(state);
        let pick;
        if (policy === 'random') pick = ai.pick(opts);
        else {
          const rank = o => {
            const n = Run.currentAct(state).rows[o.row][o.idx];
            if (n.type === 'rest') return state.hunger < 55 || state.face < 40 ? 0 : 3;
            if (n.type === 'event') return 1;
            if (n.type === 'fight') return 2;
            if (n.type === 'elite') return 4;
            return 5;
          };
          pick = opts.slice().sort((a, b) => rank(a) - rank(b))[0];
        }
        Run.enterNode(state, pick.row, pick.idx);
        break;
      }
      case 'battle': {
        const b = state.battle;
        if (b.over) { Run.settleBattle(state); break; }
        const playable = b.hand.filter(c => canPlay(state, b, c).ok);
        if (!playable.length) { endTurn(state); break; }
        let card;
        if (policy === 'random') {
          if (ai.next() < 0.15) { endTurn(state); break; }
          card = ai.pick(playable);
        } else {
          card = playable.slice().sort((x, y) => cardScore(state, b, y) - cardScore(state, b, x))[0];
        }
        const r = playCard(state, card.uid);
        if (!r.ok) throw new Error(`playCard rejected a playable card: ${r.reason}`);
        break;
      }
      case 'event': {
        if (state.event.chosen) { Run.afterNode(state); break; }
        const opts = Run.eventOptions(state);
        let o;
        if (policy === 'random') o = ai.pick(opts);
        else {
          const val = x => (x.effects.hunger || 0) * (state.hunger < 50 ? 1.5 : 1) + (x.effects.face || 0) * 0.4 - (x.effects.decay || 0) * 6 + (x.requiresTag ? 6 : 0) + (x.effects.flag === 'familyCalled' ? 8 : 0);
          o = opts.slice().sort((a, b) => val(b) - val(a))[0];
        }
        Run.chooseEvent(state, o.label);
        break;
      }
      case 'rest': {
        if (state.rest.chosen) { Run.afterNode(state); break; }
        if (policy === 'random') {
          const k = ai.pick(['snack', 'calm', 'remove']);
          if (k === 'remove') Run.chooseRest(state, 'remove', ai.pick(state.deck).uid);
          else Run.chooseRest(state, k);
        } else if (state.hunger < 60) Run.chooseRest(state, 'snack');
        else if (state.face < 50) Run.chooseRest(state, 'calm');
        else {
          const weak = state.deck.find(c => c.id === 'enen') || state.deck.find(c => c.id === 'shouji') || state.deck[0];
          Run.chooseRest(state, 'remove', weak.uid);
        }
        break;
      }
      case 'reward': {
        const cards = state.reward.cards;
        if (policy === 'random') Run.chooseReward(state, ai.next() < 0.8 ? ai.pick(cards) : null);
        else Run.chooseReward(state, cards.slice().sort((a, b) => rewardScore(b) - rewardScore(a))[0]);
        break;
      }
      default:
        throw new Error(`unknown screen ${state.screen}`);
    }
  }
  if (steps >= maxSteps) throw new Error(`simulation did not terminate (seed ${seed})`);
  return state;
}

export function batch(n, policy, seed0 = 1000) {
  let wins = 0, acts = [0, 0, 0], turns = 0;
  for (let i = 0; i < n; i++) {
    const s = simulate(seed0 + i, policy);
    if (s.result.win) wins++; else acts[s.result.act]++;
    turns += s.stats.turns;
  }
  return { n, wins, rate: wins / n, lostInAct: acts, avgTurns: turns / n };
}
