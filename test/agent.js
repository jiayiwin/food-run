// 自动试玩 AI：random（纯随机）/ greedy（把在场所有人往安全区中间推）。不受倒计时影响。
import * as Run from '../src/run.js';
import { zoneOf } from '../src/data/npcs.js';
import { ITEMS } from '../src/data/items.js';
import { makeRng } from '../src/rng.js';

function penalty(att) {
  if (att > 70) return (att - 70) * 2.5 + 10;
  if (att < 30) return (30 - att) * 1.5 + 6;
  return Math.abs(att - 50) * 0.2;
}

function optionScore(state, opt, primaryId) {
  let score = 0;
  const touched = new Set(Object.keys(opt.d || {}));
  let primaryAfter = null;
  for (const [id, base] of Object.entries(opt.d || {})) {
    const cur = state.npcs[id].att;
    const after = Math.max(0, Math.min(100, cur + Run.expectedDelta(state, id, base, primaryId)));
    if (id === primaryId) primaryAfter = after - cur;
    score += penalty(cur) - penalty(after);
  }
  // 旁观者会被带动
  for (const id of state.scene.present) {
    if (id === primaryId || touched.has(id)) continue;
    const cur = state.npcs[id].att;
    const after = Math.max(0, Math.min(100, cur + Math.round((primaryAfter || 0) * Run.BYSTANDER_RATIO)));
    score += penalty(cur) - penalty(after);
  }
  if (opt.hunger) score += opt.hunger * (state.hunger < 40 ? 1.2 : 0.5);
  if (opt.grudge) score -= 8;
  return score;
}

export function simulate(seed, policy = 'random', maxSteps = 800) {
  const state = Run.newRun(seed);
  const ai = makeRng((seed ^ 0x9e3779b9) >>> 0);
  let steps = 0;
  while (state.screen !== 'result' && steps++ < maxSteps) {
    switch (state.screen) {
      case 'pick': {
        const choices = Run.slotChoices(state);
        let id;
        if (policy === 'random') id = ai.pick(choices);
        else {
          const rank = sid => { const sc = Run.sceneById(sid); if (sc.stranger) return state.items.length < 2 ? 1.5 : 3; const z = zoneOf(state.npcs[sc.npc].att); return z === 'cold' ? 0 : z === 'safe' ? 1 : 2; };
          id = choices.slice().sort((a, b) => rank(a) - rank(b))[0];
        }
        Run.pickLocation(state, id);
        break;
      }
      case 'scene': {
        if (state.scene.phase === 'react') { Run.advance(state); break; }
        // 招数
        {
          const primary = Run.sceneDef(state).npc;
          const z = zoneOf(state.npcs[primary].att);
          const m = state.scene.mods;
          if (policy === 'random') {
            if (ai.next() < 0.12 && !m.dodgeUsed) { Run.useMove(state, 'dodge'); break; }
            if (ai.next() < 0.12 && state.moves.divertLeft) { const t = Run.divertTargets(state); if (t.length) { const dr = Run.useMove(state, 'divert', ai.pick(t)); if (dr.ok) break; } }
          } else {
            if (z === 'hot' && state.moves.divertLeft) {
              const t = Run.divertTargets(state).filter(id => !state.scene.present.includes(id)).sort((a, b) => state.npcs[a].att - state.npcs[b].att)[0];
              if (t && state.npcs[t].att < 50) { const dr = Run.useMove(state, 'divert', t); if (dr.ok) break; }
            }
            if (z === 'hot' && !m.busyUsed && state.hunger > 30) { Run.useMove(state, 'busy'); break; }
            if (z === 'safe' && state.scene.beat === 1 && !m.dodgeUsed && state.hunger < 45) { const r = Run.useMove(state, 'dodge'); if (r.ended) break; }
          }
        }
        // 事件牌
        if (state.scene.event && !state.scene.eventUsed) {
          const ev = Run.EVENTS ? Run.EVENTS[state.scene.event] : null;
          if (ev && (policy === 'random' ? ai.next() < 0.5 : ev.kind === 'instant' || ev.kind === 'cost')) {
            Run.useEvent(state); break;
          }
        }
        // 道具
        if (state.items.length) {
          const primary = Run.sceneDef(state).npc;
          const hot = zoneOf(state.npcs[primary].att) === 'hot';
          let use = -1;
          if (policy === 'random') { if (ai.next() < 0.3) use = ai.int(0, state.items.length - 1); }
          else {
            use = state.items.findIndex(id => (ITEMS[id].kind === 'atk' && hot) || (id === 'snack' && state.hunger < 40) || (id === 'powerbank' && hot && !state.flags.shield));
          }
          if (use >= 0) { Run.useItem(state, use); break; }
        }
        const beat = Run.currentBeat(state);
        let idx;
        if (policy === 'random') idx = ai.int(0, beat.options.length - 1);
        else {
          const primary = Run.sceneDef(state).npc;
          idx = beat.options.map((o, i) => ({ i, s: optionScore(state, o, primary) })).sort((a, b) => b.s - a.s)[0].i;
        }
        Run.choose(state, idx);
        break;
      }
      case 'mini': {
        if (policy === 'random') Run.resolveMini(state, ai.int(0, 100), ai.next() < 0.5 ? 'release' : 'go');
        else Run.resolveMini(state, 50, state.mini.kind === 'pet' ? 'release' : 'go');
        break;
      }
      case 'summary': Run.continueFromSummary(state); break;
      case 'notice': Run.dismissNotice(state); break;
      default: throw new Error(`unknown screen ${state.screen}`);
    }
  }
  if (steps >= maxSteps) throw new Error(`simulation did not terminate (seed ${seed})`);
  return state;
}

export function batch(n, policy, seed0 = 1000) {
  const out = { n, wins: 0, rate: 0, grades: { S: 0, A: 0, B: 0 }, avgHunger: 0, avgIncidents: 0, avgPerfect: 0, intrusions: 0 };
  let hunger = 0, inc = 0, perf = 0;
  for (let i = 0; i < n; i++) {
    const s = simulate(seed0 + i, policy);
    if (s.result.win) { out.wins++; out.grades[s.result.grade]++; }
    hunger += s.result.hunger; inc += s.result.stats.incidents; perf += s.result.stats.perfect;
  }
  out.rate = out.wins / n; out.avgHunger = +(hunger / n).toFixed(1); out.avgIncidents = +(inc / n).toFixed(2); out.avgPerfect = +(perf / n).toFixed(2);
  return out;
}
