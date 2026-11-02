// 入口：事件分发、倒计时、自动推进、音效、BGM、背景层、粒子、存档。
import { render } from './ui.js';
import * as Run from './run.js';
import { SCHEDULE, TIMER } from './data/scenes.js';
import { zoneOf } from './data/npcs.js';
import { BG, BG_BY_ACT, BGM } from './assets.js';
import { sfx } from './sfx.js';
import { createPetals, typewriter } from './fx.js';
import { MAX_LEVEL, LV_TIMER_CUT } from './data/levels.js';

const KEY = 'bellyfirst.save.v3';
const PKEY = 'bellyfirst.progress.v1';
const GRADE_RANK = { S: 3, A: 2, B: 1 };

// ── 难度进度：unlocked = 能选的最高等级；best = 每级最佳评级 ──
const progress = {
  data: { unlocked: 0, selected: 0, best: {} },
  load() {
    try { const j = localStorage.getItem(PKEY); if (j) this.data = { ...this.data, ...JSON.parse(j) }; } catch { /* 忽略 */ }
    this.data.selected = Math.min(this.data.selected, this.data.unlocked);
  },
  save() { try { localStorage.setItem(PKEY, JSON.stringify(this.data)); } catch { /* 忽略 */ } },
  select(lv) { this.data.selected = Math.max(0, Math.min(this.data.unlocked, lv)); this.save(); },
  // 一局结束时记一次：返回 { newUnlock, newBest }
  record(result) {
    const lv = result.level || 0;
    const out = { newUnlock: null, newBest: false, prevBest: this.data.best[lv] || null };
    if (result.win) {
      if (lv >= this.data.unlocked && lv < MAX_LEVEL) { this.data.unlocked = lv + 1; out.newUnlock = lv + 1; }
      if ((GRADE_RANK[result.grade] || 0) > (GRADE_RANK[this.data.best[lv]] || 0)) { this.data.best[lv] = result.grade; out.newBest = true; }
    }
    this.save();
    return out;
  },
};
progress.load();
const REACT_AUTO_MS = 0; // 0 = 不自动翻页，看完自己点
const app = document.getElementById('app');
let state = null;
let lastScreen = null;

// 倒计时（不进存档；刷新后从头计）
let timer = null, deadline = 0, total = 1, timerKey = null, lastSec = -1;
let autoAdv = null;
let resultSounded = false;

// ── 存档 ──
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

// ── 背景层（双层交叉淡入）──
const bgLayers = [document.querySelector('#bg .a'), document.querySelector('#bg .b')];
let bgKey = null, bgActive = 0;
function setBg(key) {
  if (key === bgKey) return;
  bgKey = key;
  const next = 1 - bgActive;
  bgLayers[next].style.backgroundImage = `url("${BG[key]}")`;
  bgLayers[next].classList.add('show');
  bgLayers[bgActive].classList.remove('show');
  bgActive = next;
}
function bgFor() {
  if (!state) return 'title';
  if (state.screen === 'scene' || state.screen === 'summary') return Run.sceneDef(state).bg;
  if (state.screen === 'result') return 'home';
  return BG_BY_ACT[Run.currentSlot(state).act];
}

// ── BGM（两轨交叉淡入；首次点击后才允许播放）──
const bgm = {
  tracks: {}, started: false, mood: null, fade: null,
  init() {
    for (const k of Object.keys(BGM)) {
      const a = new Audio(BGM[k]);
      a.loop = true; a.volume = 0; a.preload = 'auto';
      a.addEventListener('error', () => { a.dataset.broken = '1'; });
      this.tracks[k] = a;
    }
  },
  start() {
    if (this.started) return;
    this.started = true;
    for (const a of Object.values(this.tracks)) { if (!a.dataset.broken) a.play().catch(() => {}); }
    this.apply();
  },
  set(mood) { if (mood !== this.mood) { this.mood = mood; this.apply(); } },
  apply() {
    if (!this.started) return;
    const targetFor = k => (sfx.muted ? 0 : (k === this.mood ? 0.55 : 0));
    clearInterval(this.fade);
    this.fade = setInterval(() => {
      let settled = true;
      for (const [k, a] of Object.entries(this.tracks)) {
        const t = targetFor(k);
        const v = a.volume + Math.sign(t - a.volume) * 0.04;
        a.volume = Math.abs(t - a.volume) < 0.04 ? t : Math.max(0, Math.min(1, v));
        if (a.volume !== t) settled = false;
      }
      if (settled) clearInterval(this.fade);
    }, 60);
  },
};
bgm.init();
function moodFor() {
  if (!state || state.screen === 'result') return 'calm';
  const anyHot = Run.activeNpcs(state).some(id => zoneOf(state.npcs[id].att) === 'hot');
  return anyHot || app.classList.contains('hurry') ? 'tense' : 'calm';
}

// ── 全屏粒子（撒花）──
const fx = createPetals(document.getElementById('fx'), 0);
let titlePetals = null;

function stopTimers() {
  stopMini();
  if (timer) { clearInterval(timer); timer = null; }
  if (autoAdv) { clearTimeout(autoAdv); autoAdv = null; }
  app.classList.remove('hurry');
}

function paint() {
  stopTimers();
  if (titlePetals) { titlePetals.stop(); titlePetals = null; }
  let ctx = { muted: sfx.muted, progress: progress.data };
  if (!state) {
    const saved = store.load();
    ctx = { ...ctx, hasSave: !!saved, saveTime: saved ? SCHEDULE[saved.slot].time : '', saveLevel: saved ? (saved.level || 0) : 0, mods: saved ? saved.runMods : null };
  } else if (state.screen === 'result' && !state.result.progress) {
    state.result.progress = progress.record(state.result);
  }
  app.innerHTML = render(state, ctx);
  const screen = state ? state.screen : 'title';
  app.dataset.screen = screen;
  if (screen !== lastScreen || screen === 'scene') window.scrollTo(0, 0);
  lastScreen = screen;
  setBg(bgFor());
  bgm.set(moodFor());
  wireSprites();
  afterPaint();
}

// 缺图回退：img 加载失败时显示 emoji
function wireSprites() {
  app.querySelectorAll('.sprite img.sheet').forEach(img => {
    const mark = () => img.closest('.sprite')?.classList.add('noimg');
    if (img.complete && img.naturalWidth === 0) mark();
    img.addEventListener('error', mark, { once: true });
  });
}

function afterPaint() {
  if (!state) {
    titlePetals = createPetals(app.querySelector('canvas.petals'), 28);
    return;
  }
  if (state.screen === 'scene' && state.scene.phase === 'choose') {
    const key = `${state.seed}:${state.slot}:${state.scene.id}#${state.scene.beat}`;
    if (timerKey !== key) {
      timerKey = key;
      total = (Run.sceneDef(state).isCall ? TIMER.call : TIMER[Run.currentSlot(state).act]) + (state.scene.beat === 0 && !Run.sceneDef(state).isCall ? TIMER.firstBeatBonus : 0) + (Run.hasMod(state, 'friday') ? Run.FRIDAY_TIMER_BONUS : 0) + (state.flags.relaxed ? 3000 : 0) - (Run.atLevel(state, 1) ? LV_TIMER_CUT : 0);
      deadline = Date.now() + total;
      lastSec = -1;
      if (state.scene.intruder && state.scene.beat > 0) sfx.intrude();
    }
    typewriter(app.querySelector('.bubble .line'));
    timer = setInterval(tick, 100);
    tick();
  } else if (state.screen === 'scene' && state.scene.phase === 'react') {
    const st = state.scene.stamp;
    if (state.scene.reaction?.panic) sfx.panic();
    if (st === 'perfect') { sfx.perfect(); fx.burst(36); }
    else if (st === 'danger') sfx.danger();
    else sfx.cold();
    if (REACT_AUTO_MS) autoAdv = setTimeout(() => { Run.advance(state); store.save(state); paint(); }, REACT_AUTO_MS);
  } else if (state.screen === 'mini') {
    startMini();
  } else if (state.screen === 'result') {
    if (!resultSounded) {
      resultSounded = true;
      if (state.result.win) { sfx.win(); fx.burst(90); } else sfx.lose();
    }
  }
  if (state.screen !== 'result') resultSounded = false;
}

// ── 路人小游戏 ──
let mini = null; // { kind, t0, holding, fill, raf }
function stopMini() { if (mini) { cancelAnimationFrame(mini.raf); mini = null; } }
function startMini() {
  stopMini();
  const m = state.mini;
  mini = { kind: m.kind, t0: performance.now(), holding: false, fill: 0, lastSec: -1, raf: 0 };
  if (m.kind === 'pet') {
    const area = app.querySelector('#pet-area');
    const down = e => { e.preventDefault(); if (!mini || mini.holding) return; mini.holding = true; area.classList.add('holding'); sfx.tap(); };
    const up = e => { e.preventDefault(); if (!mini || !mini.holding) return; finishMini(mini.fill, 'release'); };
    area.addEventListener('pointerdown', down);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
    area.addEventListener('pointerleave', up);
  }
  const loop = () => {
    if (!mini || !state || state.screen !== 'mini') return;
    const now = performance.now();
    const elapsed = now - mini.t0;
    const rem = Math.max(0, TIMER.mini - elapsed);
    const fill = app.querySelector('.timer-fill'); const num = app.querySelector('.timer-num');
    if (fill) fill.style.width = `${(rem / TIMER.mini) * 100}%`;
    if (num) num.textContent = (rem / 1000).toFixed(1);
    const sec = Math.ceil(rem / 1000);
    if (sec !== mini.lastSec) { mini.lastSec = sec; if (rem > 0 && sec <= 2) sfx.hurry(); }
    if (mini.kind === 'pet') {
      if (mini.holding) mini.fill = Math.min(100, mini.fill + 0.75);  // 约 2.2 秒涨满
      const mf = app.querySelector('#meter-fill'); if (mf) mf.style.height = `${mini.fill}%`;
      const an = app.querySelector('#pet-animal');
      if (an) { const z = mini.fill > 70 ? 'hot' : mini.fill >= 30 ? 'safe' : 'cold'; an.dataset.zone = z; an.style.transform = `scale(${1 + mini.fill / 160}) rotate(${Math.sin(now / (mini.fill > 70 ? 60 : 180)) * (2 + mini.fill / 12)}deg)`; an.textContent = (mini.holding || mini.fill > 0) ? NPCS_FACE(state.mini.npc, mini.fill) : Run.faceOf(state.mini.npc, 'safe'); }
      const bb = app.querySelector('#pet-bubble'); if (bb && mini.holding) bb.textContent = mini.fill > 70 ? '（它要失控了）' : mini.fill >= 30 ? '（现在松手刚好）' : '（它刚有点兴趣）';
      if (mini.fill >= 100) { finishMini(100, 'release'); return; }
      if (rem <= 0) { finishMini(mini.holding ? mini.fill : 15, 'timeout'); return; }
    } else {
      const pos = 50 + 45 * Math.sin(elapsed / 650);           // 目光来回扫，约 4 秒一个来回
      const mk = app.querySelector('#gaze-marker'); if (mk) mk.style.left = `${pos}%`;
      const npc = app.querySelector('#pass-npc'); if (npc) npc.style.transform = `translateX(${(pos - 50) / 4}px) rotate(${(pos - 50) / 6}deg)`;
      mini.pos = pos;
      if (rem <= 0) { finishMini(20, 'timeout'); return; }
    }
    mini.raf = requestAnimationFrame(loop);
  };
  mini.raf = requestAnimationFrame(loop);
}
function NPCS_FACE(id, fill) { const z = fill > 70 ? 'hot' : fill >= 30 ? 'safe' : 'cold'; return Run.faceOf(id, z); }
function finishMini(value, how) {
  if (!mini) return;
  stopMini();
  Run.resolveMini(state, value, how);
  store.save(state);
  paint();
}
function miniGo() {
  if (!mini || mini.kind !== 'pass') return;
  const looking = mini.pos >= 33 && mini.pos <= 67;       // 中段红区：在看你
  finishMini(looking ? 82 : 50, 'go');
}

function tick() {
  if (!state || state.screen !== 'scene' || state.scene.phase !== 'choose') { stopTimers(); return; }
  const rem = Math.max(0, deadline - Date.now());
  const fill = app.querySelector('.timer-fill');
  const num = app.querySelector('.timer-num');
  if (fill) fill.style.width = `${(rem / total) * 100}%`;
  if (num) num.textContent = (rem / 1000).toFixed(1);
  const hurry = rem > 0 && rem <= 2000;
  if (hurry !== app.classList.contains('hurry')) { app.classList.toggle('hurry', hurry); bgm.set(moodFor()); }
  const sec = Math.ceil(rem / 1000);
  if (sec !== lastSec) { lastSec = sec; if (rem > 0) (sec <= 2 ? sfx.hurry() : sfx.tick()); }
  if (rem <= 0) {
    stopTimers();
    Run.panic(state);
    store.save(state);
    paint();
  }
}

const actions = {
  start() {
    const raw = (document.getElementById('seed-input')?.value || '').trim();
    const seed = /^\d+$/.test(raw) ? (Number(raw) >>> 0) : undefined;
    state = Run.newRun(seed, progress.data.selected);
  },
  'continue-run'() { state = store.load() || Run.newRun(undefined, progress.data.selected); },
  'level-down'() { progress.select(progress.data.selected - 1); },
  'level-up'() { progress.select(progress.data.selected + 1); },
  'next-level'() { progress.select((state.level || 0) + 1); state = Run.newRun(undefined, progress.data.selected); },
  title() { store.save(state); state = null; },
  pick(d) { Run.pickLocation(state, d.id); },
  choose(d) { Run.choose(state, Number(d.idx)); },
  advance() { Run.advance(state); },
  continue() { Run.continueFromSummary(state); },
  dismiss() { Run.dismissNotice(state); },
  'new-run'() { state = Run.newRun(undefined, state.level || 0); },
  'replay-seed'() { state = Run.newRun(state.seed, state.level || 0); },
  mute() { sfx.toggle(); bgm.apply(); },
  move(d) {
    if (d.move === 'divert') { state.scene.picking = state.scene.picking === 'divert' ? null : 'divert'; return; }
    const r = Run.useMove(state, d.move);
    if (r.ok) sfx.intrude();
  },
  divert(d) {
    const r = Run.useMove(state, 'divert', d.target);
    state.scene.picking = null;
    if (r.ok) sfx.perfect();
  },
  'move-cancel'() { state.scene.picking = null; },
  event() { const r = Run.useEvent(state); if (r.ok) (r.success ? sfx.perfect() : sfx.danger()); },
  'mini-go'() { miniGo(); },
  item(d) {
    const r = Run.useItem(state, Number(d.idx));
    if (r.ok && r.timeBonus) { deadline += r.timeBonus; total += r.timeBonus; }
    if (r.ok) sfx.intrude();
  },
};

app.addEventListener('click', e => {
  bgm.start();
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (!state && !['start', 'continue-run', 'mute', 'level-down', 'level-up'].includes(el.dataset.action)) return;
  sfx.tap();
  fn(el.dataset);
  if (state) store.save(state);
  paint();
});

// 键盘：A/B/C 或 1/2/3 选项，空格/回车继续
document.addEventListener('keydown', e => {
  if (!state) return;
  bgm.start();
  const k = e.key.toLowerCase();
  const idx = { a: 0, b: 1, c: 2, 1: 0, 2: 1, 3: 2 }[k];
  if (state.screen === 'scene' && state.scene.phase === 'choose' && idx != null) { sfx.tap(); Run.choose(state, idx); store.save(state); paint(); }
  else if (k === ' ' || k === 'enter') {
    const btn = app.querySelector('[data-action="advance"],[data-action="continue"],[data-action="dismiss"]');
    if (btn) { e.preventDefault(); btn.click(); }
  }
});

// 调试入口：#demo-scene / #demo-react / #demo-pick 直接进入对应界面（固定种子）
(function demo() {
  const h = (location.hash || '').replace('#', '');
  if (!h.startsWith('demo-')) return;
  // 难度选择 / 解锁：只改内存，不写进度存档
  if (h === 'demo-levels') { progress.save = () => {}; progress.data = { unlocked: 5, selected: 4, best: { 0: 'S', 1: 'A', 4: 'B' } }; return; }
  state = Run.newRun(7, h === 'demo-unlock' ? 2 : 0);
  if (h === 'demo-unlock') { progress.save = () => {}; progress.data = { unlocked: 2, selected: 2, best: { 2: 'B' } }; Run.finish(state, true, null); return; }
  if (h === 'demo-hud-lv') { state = Run.newRun(7, 6); return; }
  if (h === 'demo-busy') { state.npcs.lin.nextSwing = 12; Run.useMove(state, 'busy'); }
  if (h === 'demo-react') Run.choose(state, 1);
  if (h === 'demo-pick') { Run.choose(state, 1); Run.advance(state); Run.choose(state, 1); Run.advance(state); Run.continueFromSummary(state); }
  if (h === 'demo-summary') { Run.choose(state, 1); Run.advance(state); Run.choose(state, 1); Run.advance(state); }
  if (h === 'demo-event') { state.scene.event = 'distraction'; state.stats.streak = 4; }
  if (h === 'demo-event-used') { state.scene.event = 'recallevent'; Run.useEvent(state); }
  if (h === 'demo-win') { Run.finish(state, true, null); }
  if (h === 'demo-lose') { state.hunger = 1; Run.choose(state, 0); }
  if (h === 'demo-pet' || h === 'demo-pass') { Run.choose(state, 1); Run.advance(state); Run.choose(state, 1); Run.advance(state); Run.continueFromSummary(state); if (state.screen === 'notice') Run.dismissNotice(state); state.extraChoice = h === 'demo-pet' ? 'x_cat' : 'x_flyer'; Run.pickLocation(state, state.extraChoice); }
})();

paint();
