// 渲染层：state → HTML 字符串。所有交互通过 data-action 冒泡到 main.js。
import { CARDS, CARD_TYPES, describe } from './data/cards.js';
import { EVENTS } from './data/events.js';
import { NPCS } from './data/npcs.js';
import { NODE_TYPES } from './map.js';
import * as Run from './run.js';
import { canPlay, cardCost, effectiveIntent, intentText, isWorn, LOW_HUNGER } from './battle.js';

export function render(state, ctx) {
  if (!state) return renderTitle(ctx || {});
  switch (state.screen) {
    case 'map': return hud(state) + renderMap(state);
    case 'battle': return hud(state) + renderBattle(state);
    case 'event': return hud(state) + renderEvent(state);
    case 'rest': return hud(state) + renderRest(state);
    case 'reward': return hud(state) + renderReward(state);
    case 'result': return renderResult(state);
    default: return `<p>未知界面 ${state.screen}</p>`;
  }
}

function hud(state) {
  const act = Run.currentAct(state);
  const low = state.hunger < LOW_HUNGER;
  let warn = '';
  if (low) warn = '<div class="warn">判断力下降：≥2 费的牌和绝招用不出来</div>';
  else if (state.face < 30) warn = '<div class="warn soft">没面子：借口费用 +1，NPC 更难缠</div>';
  else if (state.face > 80) warn = '<div class="warn soft">人缘太好：大家都想拉着你聊</div>';
  return `<header class="hud">
    <div class="hud-bars">
      <div class="stat ${low ? 'danger' : ''}">
        <span class="stat-label">🍚 饥饿</span>
        <div class="bar hunger"><i style="width:${state.hunger}%"></i></div>
        <b>${state.hunger}</b>
      </div>
      <div class="stat">
        <span class="stat-label">😎 面子</span>
        <div class="bar face"><i style="width:${state.face}%"></i></div>
        <b>${state.face}</b>
      </div>
    </div>
    <div class="hud-meta">
      <span>第 ${state.act + 1} 幕 · ${act.name}</span>
      <span>牌组 ${state.deck.length}</span>
      <button class="link" data-action="title">标题</button>
    </div>
    ${warn}
  </header>`;
}

function renderMap(state) {
  const act = Run.currentAct(state);
  const reach = Run.reachable(state);
  const rows = act.rows.map((row, r) => {
    const cells = [0, 1, 2].map(col => {
      const idx = row.findIndex(n => n.col === col);
      if (idx < 0) return '<div class="node-slot"></div>';
      const n = row[idx];
      const isReach = reach.some(x => x.row === r && x.idx === idx);
      const isCur = state.row === r && state.col === idx;
      const t = NODE_TYPES[n.type];
      const icon = n.type === 'boss' ? NPCS[n.npc].icon : t.icon;
      const label = n.type === 'boss' ? NPCS[n.npc].name : t.label;
      const cls = ['node', `node-${n.type}`, n.done ? 'done' : '', isReach ? 'reach' : '', isCur ? 'current' : ''].join(' ');
      const attrs = isReach ? `data-action="node" data-row="${r}" data-idx="${idx}"` : 'disabled';
      return `<button class="${cls}" ${attrs}><span class="node-icon">${icon}</span><span class="node-label">${label}</span></button>`;
    }).join('');
    return `<div class="map-row ${r === state.row ? 'row-current' : ''}"><span class="row-num">${r + 1}</span>${cells}</div>`;
  });
  const legend = Object.entries(NODE_TYPES).filter(([k]) => k !== 'boss').map(([, t]) => `<span>${t.icon} ${t.label}</span>`).join('');
  return `<section class="screen map">
    <div class="act-head"><div class="eyebrow">第 ${state.act + 1} 幕</div><h2>${act.name}</h2><p>${act.subtitle}</p></div>
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ''}
    <div class="map-grid">${rows.join('')}</div>
    <p class="hint">点亮的节点可以走。每走一步饥饿 −${state.decay}。</p>
    <div class="legend">${legend}</div>
  </section>`;
}

function cardHtml(state, c, b, opts = {}) {
  const def = CARDS[c.id];
  const chk = b ? canPlay(state, b, c) : { ok: true };
  const cost = b ? cardCost(state, c) : def.cost;
  const worn = isWorn(state, c.id);
  const action = opts.action || 'play';
  const cls = ['card', `type-${def.type}`, chk.ok ? '' : 'locked', worn ? 'worn' : '', opts.small ? 'small' : ''].join(' ');
  return `<button class="${cls}" data-action="${action}" data-uid="${c.uid}" data-id="${c.id}" ${chk.ok ? '' : 'disabled'}>
    <span class="card-cost">${cost}</span>
    <span class="card-type">${CARD_TYPES[def.type]}</span>
    <span class="card-icon">${def.icon}</span>
    <span class="card-name">${def.name}</span>
    <span class="card-desc">${describe(def)}</span>
    ${opts.flavor ? `<span class="card-flavor">${def.flavor}</span>` : ''}
    ${worn ? '<span class="card-tag">用烂了</span>' : ''}
    ${chk.ok ? '' : `<span class="card-lock">${chk.reason}</span>`}
  </button>`;
}

function renderBattle(state) {
  const b = state.battle;
  const npc = NPCS[b.npcId];
  const intent = effectiveIntent(b);
  const pct = b.stickMax ? Math.round(b.stick / b.stickMax * 100) : 0;
  const susp = npc.overtime
    ? `<div class="susp ${b.suspicion >= 4 ? 'hot' : ''}" title="每打一张借口牌 +1，满 5 加班">疑心 ${'●'.repeat(Math.min(5, b.suspicion))}${'○'.repeat(Math.max(0, 5 - b.suspicion))}</div>`
    : '';
  const phase = b.phases ? `<div class="phase">第 ${b.phaseIdx + 1} / ${b.phases.length} 关 · ${b.phaseName}</div>` : '';
  const hand = b.hand.map(c => cardHtml(state, c, b)).join('');
  const over = b.over ? `<div class="overlay"><div class="overlay-box ${b.over}">
      <div class="overlay-title">${b.over === 'win' ? '脱身！' : '眼前一黑……'}</div>
      <p>${b.speech}</p>
      <button class="btn primary wide" data-action="battle-continue">继续</button>
    </div></div>` : '';
  return `<section class="screen battle">
    <div class="npc ${b.boss ? 'is-boss' : ''}">
      <div class="npc-top">
        <span class="npc-icon">${b.icon}</span>
        <div class="npc-id"><div class="npc-name">${b.name}</div>${phase}</div>
        ${susp}
      </div>
      <div class="bar stick"><i style="width:${pct}%"></i></div>
      <div class="bar-num">粘性 ${b.stick} / ${b.stickMax}</div>
      <div class="speech">${b.speech}</div>
      <div class="intent kind-${intent.kind}"><span class="intent-label">回合结束时</span>${intentText(intent)}</div>
    </div>
    <div class="player-row">
      <span class="pill energy">⚡ ${b.energy} / 3</span>
      <span class="pill composure ${b.composure ? 'on' : ''}">🛡 镇定 ${b.composure}</span>
      <span class="pill muted">抽牌 ${b.draw.length} · 弃牌 ${b.discard.length}</span>
      <span class="pill muted">回合 ${b.turn}</span>
    </div>
    <div class="hand">${hand || '<div class="empty">手牌打完了，结束回合吧。</div>'}</div>
    <div class="actions"><button class="btn primary wide" data-action="end-turn" ${b.over ? 'disabled' : ''}>结束回合</button></div>
    <ul class="log">${b.log.slice(-6).reverse().map(l => `<li>${l}</li>`).join('')}</ul>
    ${over}
  </section>`;
}

function renderEvent(state) {
  const ev = EVENTS[state.event.id];
  const body = state.event.chosen
    ? `<div class="result-box"><div class="chosen">你选了「${state.event.chosen}」</div><p>${state.event.result}</p><button class="btn primary wide" data-action="continue">继续赶路</button></div>`
    : `<div class="options">${Run.eventOptions(state).map(o => `<button class="option" data-action="event-opt" data-label="${o.label}"><b>${o.label}</b><span>${o.hint}</span></button>`).join('')}</div>`;
  return `<section class="screen event">
    <div class="scene-icon">${ev.icon}</div>
    <h2>${ev.title}</h2>
    <p class="scene-text">${ev.text}</p>
    ${body}
  </section>`;
}

function renderRest(state) {
  const r = state.rest;
  let body;
  if (r.chosen) {
    body = `<div class="result-box"><p>${r.result}</p><button class="btn primary wide" data-action="continue">继续赶路</button></div>`;
  } else if (r.picking) {
    body = `<p class="scene-text">选一张牌，从牌组里永久移除：</p>
      <div class="deck-grid">${state.deck.map(c => cardHtml(state, c, null, { action: 'rest-remove', small: true })).join('')}</div>
      <button class="btn wide" data-action="rest" data-kind="cancel-remove">算了，不删</button>`;
  } else {
    body = `<div class="options">
      <button class="option" data-action="rest" data-kind="snack"><b>🍫 吃零食</b><span>饥饿 +20，之后每节点衰减 +1</span></button>
      <button class="option" data-action="rest" data-kind="remove"><b>🗑️ 删一张牌</b><span>从牌组永久移除一张</span></button>
      <button class="option" data-action="rest" data-kind="calm"><b>🪞 整理心情</b><span>面子 +10</span></button>
    </div>`;
  }
  return `<section class="screen rest">
    <div class="scene-icon">🍵</div>
    <h2>补给点</h2>
    <p class="scene-text">一个没人的拐角。喘口气，想想接下来怎么走。</p>
    ${body}
  </section>`;
}

function renderReward(state) {
  const rw = state.reward;
  return `<section class="screen reward">
    <div class="eyebrow">甩掉了${rw.from}</div>
    <h2>学到新招</h2>
    ${rw.bonus ? `<p class="bonus">${rw.bonus}</p>` : ''}
    <p class="scene-text">三选一加入牌组。牌组越厚，好牌越难抽到，不拿也行。</p>
    <div class="reward-grid">${rw.cards.map(id => cardHtml(state, { id, uid: id }, null, { action: 'reward', flavor: true })).join('')}</div>
    <button class="btn wide" data-action="reward-skip">不拿，走了</button>
  </section>`;
}

function renderResult(state) {
  const r = state.result;
  const title = r.win ? '吃到了' : '饿昏倒地';
  const sub = r.win
    ? '第一口饭入嘴。夸张的满足光效。眼含热泪。'
    : `${r.cause}。梦里，你吃到了。`;
  const rows = [
    ['走过节点', r.stats.nodes], ['遭遇', r.stats.fights], ['回合', r.stats.turns],
    ['说过的借口', r.stats.excuses], ['剩余饥饿', r.hunger], ['剩余面子', r.face], ['牌组', r.deckSize],
  ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  return `<section class="screen result ${r.win ? 'win' : 'lose'}">
    <div class="result-icon">${r.win ? '🍚' : '💫'}</div>
    <h1>${title}</h1>
    <p class="scene-text">${sub}</p>
    ${r.grade ? `<div class="grade grade-${r.grade}">评级 ${r.grade}</div>` : ''}
    <table class="stats">${rows}</table>
    <div class="actions col">
      <button class="btn primary wide" data-action="new-run">再来一局</button>
      <button class="btn wide" data-action="replay-seed">同种子重开 · ${state.seed}</button>
      <button class="btn link" data-action="title">回标题</button>
    </div>
  </section>`;
}

function renderTitle(ctx) {
  return `<section class="screen title">
    <div class="title-eyebrow">Project: Belly First</div>
    <h1 class="logo">今天必须<br>吃到饭</h1>
    <p class="tagline">每天下班都是一局。<br>饥饿值是时钟，面子值是弹药。</p>
    <div class="actions col">
      ${ctx.hasSave ? `<button class="btn primary wide" data-action="continue-run">继续上局 · 第 ${ctx.saveAct} 幕</button>` : ''}
      <button class="btn ${ctx.hasSave ? '' : 'primary'} wide" data-action="start">开始新的一局</button>
      <label class="seed"><span>种子（可选）</span><input id="seed-input" inputmode="numeric" placeholder="留空随机"></label>
    </div>
    <div class="rules">
      <h3>怎么玩</h3>
      <ul>
        <li>选路线节点，从公司一路走回家。每走一步饥饿 −3，归零即败。</li>
        <li>遭遇 NPC 时出牌「说服」，把对方的粘性打到 0 就能脱身。</li>
        <li>借口消耗面子；同一借口说过 2 次后效果减半。</li>
        <li>饥饿低于 20 时判断力下降，用不出 2 费的牌和绝招。</li>
        <li>到家还有三道关：饭没好、先干活、外卖迟到。最后一口才算赢。</li>
      </ul>
    </div>
    <p class="credit">v0.1 可玩原型 · 方向 ①「Roguelike 卡牌 + 叙事」</p>
  </section>`;
}
