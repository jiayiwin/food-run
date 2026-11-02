// 入口：事件分发 + 存档。
import { render } from './ui.js';
import * as Run from './run.js';
import { playCard, endTurn } from './battle.js';

const KEY = 'bellyfirst.save.v1';
const app = document.getElementById('app');
let state = null;
let lastScreen = null;

const store = {
  load() {
    try { const j = localStorage.getItem(KEY); return j ? Run.deserialize(j) : null; } catch { return null; }
  },
  save(s) {
    try {
      if (s && s.screen !== 'result') localStorage.setItem(KEY, Run.serialize(s));
      else localStorage.removeItem(KEY);
    } catch { /* 隐私模式等情况下忽略 */ }
  },
};

function paint() {
  let ctx = null;
  if (!state) {
    const saved = store.load();
    ctx = { hasSave: !!saved, saveAct: saved ? saved.act + 1 : 0 };
  }
  app.innerHTML = render(state, ctx);
  const screen = state ? state.screen : 'title';
  app.dataset.screen = screen;
  if (screen !== lastScreen) window.scrollTo(0, 0);
  lastScreen = screen;
}

const actions = {
  start() {
    const raw = (document.getElementById('seed-input')?.value || '').trim();
    const seed = /^\d+$/.test(raw) ? (Number(raw) >>> 0) : undefined;
    state = Run.newRun(seed);
  },
  'continue-run'() { state = store.load() || Run.newRun(); },
  title() { store.save(state); state = null; },
  node(d) { Run.enterNode(state, Number(d.row), Number(d.idx)); },
  play(d) { playCard(state, d.uid); },
  'end-turn'() { endTurn(state); },
  'battle-continue'() { Run.settleBattle(state); },
  'event-opt'(d) { Run.chooseEvent(state, d.label); },
  continue() { Run.afterNode(state); },
  rest(d) { Run.chooseRest(state, d.kind); },
  'rest-remove'(d) { Run.chooseRest(state, 'remove', d.uid); },
  reward(d) { Run.chooseReward(state, d.id); },
  'reward-skip'() { Run.chooseReward(state, null); },
  'new-run'() { state = Run.newRun(); },
  'replay-seed'() { state = Run.newRun(state.seed); },
};

app.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (!state && !['start', 'continue-run'].includes(el.dataset.action)) return;
  fn(el.dataset);
  if (state) store.save(state);
  paint();
});

paint();
