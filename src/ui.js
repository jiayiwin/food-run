// 渲染层：state → HTML。恋爱游戏的壳，反向的内容。数字不显示，看脸色和条。
import { NPCS, NPC_ORDER, zoneOf, ZONE_LABEL, ZONE_HINT, HOT, COLD } from './data/npcs.js';
import { SCENES, SCHEDULE, ACT_NAMES, TIMER } from './data/scenes.js';
import { CHAR_SHEET, SHEET_COL } from './assets.js';
import { ITEMS, KIND_LABEL, MAX_ITEMS } from './data/items.js';
import { MODIFIERS } from './data/modifiers.js';
import { EVENTS } from './data/events.js';
import { MEAL_STATE } from './data/meals.js';
import { LEVELS, MAX_LEVEL } from './data/levels.js';
import * as Run from './run.js';

export function render(state, ctx) {
  if (!state) return renderTitle(ctx || {});
  switch (state.screen) {
    case 'pick': return hud(state, ctx) + renderPick(state);
    case 'scene': return hud(state, ctx) + (state.scene.phase === 'react' ? renderReact(state) : renderChoose(state));
    case 'mini': return hud(state, ctx) + renderMini(state);
    case 'summary': return hud(state, ctx) + renderSummary(state);
    case 'notice': return hud(state, ctx) + renderNotice(state);
    case 'result': return renderResult(state);
    default: return `<p>未知界面 ${state.screen}</p>`;
  }
}

function fmt(n) { return n > 0 ? `+${n}` : `${n}`; }
function face(id, att) { return NPCS[id].faces[zoneOf(att)]; }

// 立绘：三栏精灵图，缺图退回 emoji
function sprite(id, att, size = 'md') {
  const zone = zoneOf(att);
  if (NPCS[id].transient) return `<div class="sprite ${size} zone-${zone} noimg alive ${NPCS[id].animal ? 'animal' : 'human'}" data-npc="${id}"><span class="emoji">${face(id, att)}</span></div>`;
  return `<div class="sprite ${size} zone-${zone}" data-npc="${id}">
    <img class="sheet" src="${CHAR_SHEET(id)}" alt="" style="--col:${SHEET_COL[zone]}" draggable="false">
    <span class="emoji">${face(id, att)}</span>
  </div>`;
}

function attBar(att, opts = {}) {
  const zone = zoneOf(att);
  const from = opts.from ?? att;
  const marker = opts.from != null
    ? `<span class="att-marker anim" style="--from:${from}%;--to:${att}%"></span>`
    : `<span class="att-marker" style="left:${att}%"></span>`;
  return `<div class="att ${opts.big ? 'big' : ''} zone-${zone}">
    <div class="att-track">
      <i class="att-cold" style="width:${COLD}%"></i><i class="att-safe" style="width:${HOT - COLD}%"></i><i class="att-hot" style="width:${100 - HOT}%"></i>
      ${marker}
    </div>
    ${opts.meta === false ? '' : `<div class="att-meta"><span>👁 注意力 · 目标「刚好」</span><span class="zone-tag">${ZONE_LABEL[zone]}${zone === 'safe' ? ' ✓' : ' ✗ ' + ZONE_HINT[zone]}</span></div>`}
  </div>`;
}

function tasksHtml(state, compact = false) {
  const list = Run.taskStatus(state);
  if (!list.length) return '';
  return `<div class="tasks ${compact ? 'compact' : ''}">
    <div class="tasks-head">📋 今日任务</div>
    ${list.map(t => `<div class="task ${t.status}"><span class="task-mark">${t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : '○'}</span><span>${t.icon} ${t.title}</span></div>`).join('')}
  </div>`;
}

function hud(state, ctx) {
  const slot = Run.currentSlot(state);
  const low = state.hunger < 25;
  const chips = Run.activeNpcs(state).map(id => {
    const n = state.npcs[id];
    const z = zoneOf(n.att);
    return `<span class="chip zone-${z}" title="${NPCS[id].traitText}">${face(id, n.att)} ${NPCS[id].name}<i class="mini"><b style="left:${n.att}%"></b></i><small>${ZONE_LABEL[z]}</small>${n.grudge ? `<em title="怨气">💢</em>` : ''}</span>`;
  }).join('');
  return `<header class="hud">
    <div class="hud-top">
      <span class="hud-time">${state.level ? `<b class="lv-badge" title="${levelTitle(state.level)}">Lv${state.level}</b>` : ''}${ACT_NAMES[slot.act]} · ${slot.time}</span>
      <div class="hunger ${low ? 'danger' : ''}"><span>🍚</span><div class="hunger-track"><i style="width:${state.hunger}%"></i></div></div>
      ${state.stats.streak >= 3 ? `<span class="streak-badge" title="连续完美：3 连下个时段每句 +3 秒，5 连起每次完美掉一件道具">🔥 ${state.stats.streak} 连</span>` : ''}
      <button class="link" data-action="mute" title="音效与音乐">${ctx?.muted ? '🔇' : '🔊'}</button>
      <button class="link" data-action="title">标题</button>
    </div>
    <div class="chips">${chips}</div>
  </header>`;
}

function renderPick(state) {
  const slot = Run.currentSlot(state);
  const cards = Run.slotChoices(state).map(id => {
    const sc = Run.sceneById(id);
    const def = NPCS[sc.npc];
    const n = state.npcs[sc.npc] || { att: def.init };
    const z = zoneOf(n.att);
    if (sc.stranger) {
      return `<button class="loc stranger zone-safe" data-action="pick" data-id="${id}">
      <span class="loc-place">${sc.place}</span>
      ${sprite(sc.npc, def.init, 'sm')}
      <span class="loc-npc">${def.name}<small class="loc-others">路人 · 不占日程，处理得「刚好」掉道具</small></span>
      <span class="loc-zone">🎒 可能掉：${ITEMS[def.drop].icon} ${ITEMS[def.drop].name}</span>
      <span class="loc-trait">${def.traitText}。去见路人，熟人都会少见一回。</span>
    </button>`;
    }
    const others = (sc.others || []).filter(x => state.npcs[x].active).map(x => face(x, state.npcs[x].att)).join('');
    return `<button class="loc zone-${z}" data-action="pick" data-id="${id}">
      <span class="loc-place">${sc.place}</span>
      ${sprite(sc.npc, n.att, 'sm')}
      <span class="loc-npc">${def.fullName || def.name}${others ? `<small class="loc-others">还有 ${others}</small>` : ''}</span>
      ${attBar(n.att, { meta: false })}
      <span class="loc-zone">${ZONE_LABEL[z]}</span>
      <span class="loc-trait">${def.traitText}</span>
    </button>`;
  }).join('');
  return `<section class="screen pick">
    <div class="eyebrow">${slot.time} · 去哪儿？</div>
    <h2>${state.companion ? '小林跟着你。' : ''}走哪边少被拦一会儿？</h2>
    <p class="muted">热的别凑，会被拉住聊到饭凉；冷的去哄两句，不然回头找你麻烦更耽误吃饭。没见到的人会慢慢忘了你。<span class="meal-tease">${Run.mealOf(state).icon} 今晚妈做了${Run.mealOf(state).name}。</span></p>
    <div class="mod-row">${(state.runMods||[]).map(id => { const m = MODIFIERS[id]; return m ? `<div class="mod-pill" title="${m.detail}"><span>${m.icon} ${m.name}</span><small>${m.desc}</small></div>` : ''; }).join('')}</div>
    <div class="loc-grid">${cards}</div>
    ${tasksHtml(state)}
  </section>`;
}

// 实时合格线：说完时主角在「刚好」，且在场没人太热
function passStrip(state) {
  const sc = Run.sceneDef(state);
  const items = state.scene.present.map(id => {
    const z = zoneOf(state.npcs[id].att);
    const ok = z === 'safe';
    return `<span class="pass-item ${ok ? 'ok' : 'bad'} zone-${z}">${ok ? '✓' : '✗'} ${NPCS[id].name}${ok ? ' 刚好' : ' ' + ZONE_LABEL[z] + '，' + ZONE_HINT[z]}</span>`;
  });
  const primaryOk = zoneOf(state.npcs[sc.npc].att) === 'safe';
  const othersHot = Run.activeNpcs(state).filter(id => id !== sc.npc && zoneOf(state.npcs[id].att) === 'hot');
  const allOk = primaryOk && !othersHot.length;
  let verdict;
  if (allOk) verdict = '此刻合格 ✓ 保持住，说完就能溜';
  else if (!primaryOk) verdict = `此刻不合格 ✗ ${NPCS[sc.npc].name}${ZONE_LABEL[zoneOf(state.npcs[sc.npc].att)]}`;
  else verdict = `主角刚好，但 ${othersHot.map(id => NPCS[id].name).join('、')} 太热，不算完美`;
  return `<div class="pass ${allOk ? 'ok' : 'bad'}" title="合格线：说完时 TA 在「刚好」，在场没人「太热」">
    <span class="pass-rule">合格线</span>
    <span class="pass-items">${items.join('')}</span>
    <span class="pass-verdict">${verdict}</span>
  </div>`;
}

function stage(state, deltasByNpc = null) {
  const sc = Run.sceneDef(state);
  const primary = sc.npc;
  const n = state.npcs[primary];
  const d = deltasByNpc?.[primary];
  const others = state.scene.present.filter(id => id !== primary).map(id => {
    const o = state.npcs[id];
    const od = deltasByNpc?.[id];
    return `<div class="bystander zone-${zoneOf(o.att)} ${id === state.scene.intruder ? 'intruder' : ''}">
      ${sprite(id, o.att, 'xs')}
      <span class="by-name">${NPCS[id].name}</span>
      ${attBar(o.att, { meta: false, from: od ? od.before : undefined })}
      ${od && od.actual ? `<span class="float ${od.actual > 0 ? 'up' : 'down'}">${fmt(od.actual)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="stage ${others ? 'has-others' : ''}">
    <div class="portrait zone-${zoneOf(n.att)}">
      ${sprite(primary, n.att, 'lg')}
      <div class="portrait-side">
        <div class="portrait-name">${NPCS[primary].fullName || NPCS[primary].name}</div>
        ${attBar(n.att, { big: true, from: d ? d.before : undefined })}
        ${d && d.actual ? `<span class="float big ${d.actual > 0 ? 'up' : 'down'}">${fmt(d.actual)}</span>` : ''}
      </div>
    </div>
    ${others ? `<div class="bystanders">${others}</div>` : ''}
  </div>`;
}

function eventCard(state) {
  if (!state.scene || !state.scene.event) return '';
  const ev = EVENTS[state.scene.event];
  if (!ev) return '';
  if (state.scene.eventUsed) {
    const r = state.scene.eventResult;
    if (!r) return '';
    return `<div class="event-card used ${r.ok ? 'ok' : 'fail'}">
    <span class="event-icon">${ev.icon}</span>
    <div class="event-body">
      <div class="event-name">${ev.name}<span class="event-kind">${r.ok ? '成功' : '失败'}</span></div>
      <div class="event-desc">${r.text}</div>
    </div>
  </div>`;
  }
  return `<div class="event-card">
    <span class="event-icon">${ev.icon}</span>
    <div class="event-body">
      <div class="event-name">${ev.name}<span class="event-kind ${ev.kind}">${ev.kind === 'risky' ? '⚠️有风险' : ev.kind === 'cost' ? '💧有代价' : '✨即时'}</span></div>
      <div class="event-desc">${ev.desc}</div>
    </div>
    <button class="btn event-btn" data-action="event">用</button>
  </div>`;
}

function movesBar(state) {
  const sc = Run.sceneDef(state);
  const m = state.scene.mods;
  const rate = Math.round(Run.dodgeRate(state) * 100);
  const picking = state.scene.picking === 'divert';
  const targets = picking ? Run.divertTargets(state).map(id => `<button class="target" data-action="divert" data-target="${id}">${face(id, state.npcs[id].att)} ${NPCS[id].name}${state.scene.present.includes(id) ? '<small>在场</small>' : ''}</button>`).join('') : '';
  return `<div class="moves">
    <button class="move ${m.dodgeUsed ? 'off' : ''}" data-action="move" data-move="dodge" ${m.dodgeUsed ? 'disabled' : ''} title="尝试直接溜走。成功这场就结束；失败被抓包 +12。每场一次。"><b>👻 装透明</b><small>${m.dodgeUsed ? '试过了' : '溜走 ' + rate + '%'}</small></button>
    <button class="move ${state.moves.divertLeft ? '' : 'off'} ${picking ? 'active' : ''}" data-action="move" data-move="divert" ${state.moves.divertLeft ? '' : 'disabled'} title="点一个人当借口，把 TA 的注意力引过去：TA −15，被点名的 +15（在场 ×1.5）。每天 3 次。"><b>👉 支走</b><small>剩 ${state.moves.divertLeft} 次</small></button>
    <button class="move ${m.busyUsed ? 'off' : ''}" data-action="move" data-move="busy" ${m.busyUsed ? 'disabled' : ''} title="这一句无论怎么说 TA 都不会升温，饥饿 −3。每场一次。"><b>🧱 装忙</b><small>${m.busyUsed ? '装过了' : '本拍不升温'}</small></button>
  </div>
  ${picking ? `<div class="targets"><span class="targets-head">「……找你！」支去谁那儿？</span>${targets}<button class="target cancel" data-action="move-cancel">算了</button></div>` : ''}`;
}

function itemsBar(state) {
  const used = state.scene.mods.used.map(u => `<span class="used">${u.text}</span>`).join('');
  const items = state.items.map((id, i) => {
    const it = ITEMS[id];
    return `<button class="item kind-${it.kind}" data-action="item" data-idx="${i}" title="${it.desc}"><span class="item-kind">${KIND_LABEL[it.kind]}</span><b>${it.icon} ${it.name}</b><small>${it.desc}</small></button>`;
  }).join('');
  return `<div class="items">
    <div class="items-row"><span class="items-head">🎒 ${state.items.length}/${MAX_ITEMS}</span>${items || '<span class="muted">空的，路人那儿能捡</span>'}</div>
    ${used ? `<div class="items-used">${used}</div>` : ''}
  </div>`;
}

function renderChoose(state) {
  const sc = Run.sceneDef(state);
  const beat = Run.currentBeat(state);
  const line = Run.beatLine(state);
  const ms = sc.isCall ? TIMER.call : TIMER[Run.currentSlot(state).act];
  const options = beat.options.map((o, i) => {
    const hunger = o.hunger ? `<span class="tag hunger">${o.hunger > 0 ? '🍢 +' + o.hunger : '⏱ ' + o.hunger}</span>` : '';
    const grudge = o.grudge ? '<span class="tag down">💢</span>' : '';
    return `<button class="opt" data-action="choose" data-idx="${i}" style="--i:${i}"><span class="opt-key">${'ABC'[i]}</span><span class="opt-text">${o.text}</span>${hunger || grudge ? `<span class="tags">${hunger}${grudge}</span>` : ''}</button>`;
  }).join('');
  const intrusion = state.scene.beat > 0 && state.scene.intruder && state.scene.intrusionLine
    ? `<div class="intrusion">⚠ ${state.scene.intrusionLine}</div>` : '';
  return `<section class="screen scene bg-${sc.bg}">
    <div class="scene-head"><span class="eyebrow">${sc.place} · 第 ${state.scene.beat + 1} 句</span>${sc.final ? `<span class="companion meal-tease">${Run.mealOf(state).icon} 今晚：${Run.mealOf(state).name}</span>` : ''}${state.scene.companion ? '<span class="companion">🌸 小林跟着你</span>' : ''}</div>
    ${state.scene.beat > 0 ? intrusion : ''}
    ${stage(state)}
    ${passStrip(state)}
    <div class="bubble">${state.scene.beat === 0 ? `<span class="intro-inline">${sc.intro}</span>` : ''}<span class="speaker">${NPCS[sc.npc].name}</span><span class="line">${line}</span></div>
    <div class="timer"><i class="timer-fill" style="width:100%"></i><span class="timer-num">${(ms / 1000).toFixed(1)}</span></div>
    <div class="options">${options}</div>
    ${eventCard(state)}
    ${movesBar(state)}
    ${itemsBar(state)}
  </section>`;
}

function renderReact(state) {
  const sc = Run.sceneDef(state);
  const r = state.scene.reaction;
  const byNpc = Object.fromEntries(r.deltas.map(d => [d.npc, d]));
  const map = {
    perfect: { text: '完美回避！偷感拉满', sub: '没人拦你，离饭桌又近一步' },
    danger: { text: '芭比Q了！被盯上了', sub: '有人想拉着你聊，饭要凉了' },
    cold: { text: '冷场了……淡淡的死感', sub: '冷落久了，回头找你麻烦更耽误吃饭' },
  }[state.scene.stamp];
  const lines = r.lines.map(l => `<div class="react-line"><span>${face(l.npc, state.npcs[l.npc].att)}</span><span>${l.text}</span></div>`).join('');
  return `<section class="screen scene react stamp-${state.scene.stamp} bg-${sc.bg}">
    <div class="you">${r.panic ? '<span class="panic">慌了！随口一说：</span>' : '你：'}${r.option}</div>
    ${stage(state, byNpc)}
    ${passStrip(state)}
    <div class="stamp ${state.scene.stamp}"><div class="stamp-text">${map.text}</div><div class="stamp-sub">${map.sub}</div></div>
    <div class="react-lines">${lines}</div>
    <button class="btn primary wide bottom" data-action="advance">${state.scene.beat + 1 >= sc.beats.length ? '看看结果' : '继续'}</button>
  </section>`;
}

function renderMini(state) {
  const sc = Run.sceneDef(state);
  const def = NPCS[sc.npc];
  const m = state.mini;
  const ms = TIMER.mini;
  if (m.kind === 'pet') {
    return `<section class="screen mini mini-pet bg-${sc.bg}">
      <div class="scene-head"><span class="eyebrow">${sc.place} · ${def.mini.title}</span></div>
      <p class="intro">${sc.intro}</p>
      <div class="pet-row">
        <div class="meter">
          <div class="meter-labels"><span>太热<br>被硬控</span><span class="ok">刚好<br>松手</span><span>太冷<br>哈气</span></div>
          <div class="meter-track"><i class="m-cold" style="height:${COLD}%"></i><i class="m-safe" style="height:${HOT - COLD}%"></i><i class="m-hot" style="height:${100 - HOT}%"></i><b class="meter-fill" id="meter-fill" style="height:0%"></b></div>
        </div>
        <div class="pet-area" id="pet-area">
          <div class="pet-animal" id="pet-animal">${def.faces.safe}</div>
          <div class="pet-bubble" id="pet-bubble">${def.react.intrude.replace(/^[^，。]*[，。]/, '')}</div>
          <div class="pet-hint">按住摸</div>
        </div>
      </div>
      <div class="timer"><i class="timer-fill" style="width:100%"></i><span class="timer-num">${(ms / 1000).toFixed(1)}</span></div>
      <p class="hint">${def.mini.hint}</p>
    </section>`;
  }
  return `<section class="screen mini mini-pass bg-${sc.bg}">
    <div class="scene-head"><span class="eyebrow">${sc.place} · ${def.mini.title}</span></div>
    <p class="intro">${sc.intro}</p>
    <div class="pass-area">
      <div class="pass-you">🚶</div>
      <div class="gaze"><div class="gaze-track"><i class="g-away"></i><i class="g-look"></i><i class="g-away"></i><b class="gaze-marker" id="gaze-marker">👀</b></div><div class="gaze-labels"><span>看别处</span><span class="bad">在看你</span><span>看别处</span></div></div>
      <div class="pass-npc" id="pass-npc">${def.faces.safe}</div>
    </div>
    <button class="btn primary wide go" data-action="mini-go">走！</button>
    <div class="timer"><i class="timer-fill" style="width:100%"></i><span class="timer-num">${(ms / 1000).toFixed(1)}</span></div>
    <p class="hint">${def.mini.hint}</p>
  </section>`;
}

function renderSummary(state) {
  const sc = Run.sceneDef(state);
  const o = state.scene.outcome;
  const title = sc.isCall ? '通话结束' : o.zone === 'safe' ? (o.lines[0].includes('算不上') ? '溜过去了，但还有人惦记你' : '溜过去了，饭还热着，偷感很重') : o.zone === 'hot' ? '被硬控了，饭在凉' : '冷场了，这笔账 TA 记着';
  return `<section class="screen summary">
    ${stage(state)}
    <div class="result-card zone-${o.zone}">
      <div class="result-title">${title}</div>
      ${o.lines.map(l => `<p>${l}</p>`).join('')}
      ${o.incident ? `<div class="incident">事故 · ${o.incident}</div>` : ''}
    </div>
    ${tasksHtml(state, true)}
    <button class="btn primary wide bottom" data-action="continue">${sc.final ? '开饭！' : '继续往家走'}</button>
  </section>`;
}

function renderNotice(state) {
  const items = state.notices.map(nt => `<div class="notice">${sprite(nt.npc, 100, 'sm')}<div><div class="notice-title">${nt.title}</div><p>${nt.text}</p></div></div>`).join('');
  return `<section class="screen notice-screen">
    <div class="eyebrow">💢 被冷落的人回头找你了</div>
    <h2>麻烦来了，饭又得晚，破防了</h2>
    ${items}
    <button class="btn primary wide bottom" data-action="dismiss">知道了……</button>
  </section>`;
}

function levelTitle(lv) {
  return LEVELS.filter(l => l.lv <= lv).map(l => `${l.icon} ${l.name}：${l.desc}`).join('\n');
}

function levelRules(lv) {
  if (!lv) return '<p class="lv-plain">普通的一天。赢一次解锁「饭点危机 Lv1」。</p>';
  return `<ul class="lv-rules">${LEVELS.filter(l => l.lv <= lv).map(l => `<li class="${l.lv === lv ? 'new' : ''}"><span>${l.icon}</span><b>${l.name}</b><small>${l.desc}</small></li>`).join('')}</ul>`;
}

function levelPicker(p) {
  const sel = p.selected || 0;
  const best = p.best?.[sel];
  const locked = sel >= p.unlocked && sel < MAX_LEVEL;
  return `<div class="level-pick">
    <div class="lv-head">
      <button class="lv-step" data-action="level-down" ${sel <= 0 ? 'disabled' : ''} aria-label="降低难度">‹</button>
      <div class="lv-label"><small>饭点危机</small><b>${sel ? 'Lv ' + sel : '普通'}</b>${best ? `<i class="lv-best grade-${best}">最佳 ${best}</i>` : ''}</div>
      <button class="lv-step" data-action="level-up" ${sel >= p.unlocked ? 'disabled' : ''} aria-label="提高难度">›</button>
    </div>
    ${levelRules(sel)}
    ${locked && sel > 0 ? `<p class="lv-next">🔒 在这一级赢一次，解锁 Lv ${sel + 1}</p>` : ''}
    ${sel === MAX_LEVEL && best ? '<p class="lv-next">已经是最高难度。去拿个 S 吧。</p>' : ''}
  </div>`;
}

function resultLevel(state) {
  const r = state.result;
  const lv = r.level || 0;
  const pg = r.progress || {};
  const next = pg.newUnlock ? LEVELS.find(l => l.lv === pg.newUnlock) : null;
  return `<div class="lv-result">
    <div class="lv-result-row"><span>${lv ? `饭点危机 <b>Lv ${lv}</b>` : '普通难度'}</span>${pg.newBest ? `<span class="lv-newbest">本级新纪录 ${r.grade}</span>` : pg.prevBest ? `<span class="muted">本级最佳 ${pg.prevBest}</span>` : ''}</div>
    ${next ? `<div class="lv-unlock"><span>🔓 解锁 <b>Lv ${next.lv}</b> · ${next.icon} ${next.name}</span><small>${next.desc}</small></div>` : ''}
  </div>`;
}

function renderResult(state) {
  const r = state.result;
  const next = r.progress?.newUnlock;
  const title = r.win ? '吃上饭了' : '没吃上';
  const npcs = r.npcs.map(x => `<div class="final-npc zone-${x.zone}">${sprite(x.id, x.att, 'xs')}<div><span>${NPCS[x.id].name}</span>${attBar(x.att)}</div></div>`).join('');
  const incidents = r.stats.incidentLog.length ? `<ul class="inc-list">${r.stats.incidentLog.map(i => `<li>${i}</li>`).join('')}</ul>` : '<p class="muted">零事故。没有人真正记住你今天的样子。</p>';
  const tasks = (r.tasks || []).map(t => `<div class="task ${t.status}"><span class="task-mark">${t.status === 'done' ? '✓' : '✗'}</span><span>${t.icon} ${t.title}</span></div>`).join('');
  return `<section class="screen result ${r.win ? 'win' : 'lose'}">
    <div class="eyebrow">今日关注度管理 · 为了早点吃饭</div>
    ${r.grade ? `<div class="grade grade-${r.grade}">${r.grade}<small>级</small></div>` : '<div class="grade grade-F">饿</div>'}
    <h1>${title}</h1>
    ${r.win ? '' : `<p class="muted">${r.cause}。梦里，你吃到了。</p>`}
    <div class="meal meal-${r.meal.state}">
      <div class="meal-dish"><span class="meal-icon">${r.meal.icon}</span><span class="meal-steam">♨</span></div>
      <div class="meal-info">
        <div class="meal-name">${r.meal.name}<span class="meal-state">${MEAL_STATE[r.meal.state].icon} ${MEAL_STATE[r.meal.state].label}</span></div>
        <p>${r.meal.text}</p>
      </div>
    </div>
    <div class="ending">${r.lines.map(l => `<p>${l}</p>`).join('')}</div>
    ${resultLevel(state)}
    ${(state.runMods || []).length ? `<div class="mod-row result-mods">${state.runMods.map(id => { const m = MODIFIERS[id]; return m ? `<div class="mod-pill" title="${m.detail}"><span>${m.icon} ${m.name}</span></div>` : ''; }).join('')}</div>` : ''}
    <div class="stat-row"><span>完美 <b>${r.stats.perfect}</b></span><span>最佳连击 <b>${r.stats.bestStreak || 0}</b></span><span>事件牌 <b>${r.stats.events || 0}</b></span><span>事故 <b>${r.stats.incidents}</b></span><span>甩锅 <b>${r.stats.transfers}</b></span><span>慌了 <b>${r.stats.panics}</b></span><span>用道具 <b>${r.stats.itemsUsed}</b></span><span>溜走 <b>${r.stats.dodges}</b></span><span>支走 <b>${r.stats.diverts}</b></span><span>路人 <b>${r.stats.strangers}</b></span><span>剩余饥饿 <b>${r.hunger}</b></span></div>
    <div class="tasks result-tasks"><div class="tasks-head">📋 今日任务 ${r.tasksDone ?? 0} / ${(r.tasks || []).length} ${'★'.repeat(r.tasksDone || 0)}</div>${tasks}</div>
    <h3>最后他们有多在意你</h3>
    <div class="final-grid">${npcs}</div>
    <h3>事故记录</h3>
    ${incidents}
    <div class="actions col">
      ${next ? `<button class="btn primary wide" data-action="next-level">挑战 Lv ${next}</button>` : ''}
      <button class="btn ${next ? '' : 'primary'} wide" data-action="new-run">${r.level ? `再来一局 Lv ${r.level}` : '明天继续吃'}</button>
      <button class="btn wide" data-action="replay-seed">同种子重开 · ${state.seed}</button>
      <button class="btn link" data-action="title">回标题</button>
    </div>
  </section>`;
}

function renderTitle(ctx) {
  return `<section class="screen title">
    <canvas class="petals" aria-hidden="true"></canvas>
    <div class="title-eyebrow">Project: Belly First · 反向恋爱养成</div>
    <h1 class="logo">别看我<br>我要吃饭</h1>
    <div class="subtitle">别理我，饭要凉了</div>
    <div class="goal">【今日目标：谁都别拦我，回家吃饭】</div>
    <p class="tagline">恋爱游戏是让所有人都喜欢你。这里反过来：谁多看你一眼，你就晚吃一口。把每个人的注意力都维持在「刚好」，偷感拉满，溜回家吃饭。<small>牛马下班实录 · 松弛感模拟器</small></p>
    <div class="actions col">
      ${ctx.hasSave ? `<button class="btn primary wide" data-action="continue-run">继续今天 · ${ctx.saveLevel ? `Lv${ctx.saveLevel} · ` : ''}${ctx.saveTime}</button>` : ''}
      ${ctx.hasSave && ctx.mods && ctx.mods.length ? `<div class="mod-row title-mods">${ctx.mods.map(id => { const m = MODIFIERS[id]; return m ? `<div class="mod-pill" title="${m.detail}"><span>${m.icon} ${m.name}</span><small>${m.desc}</small></div>` : ''; }).join('')}</div>` : ''}
      ${ctx.progress && ctx.progress.unlocked > 0 ? levelPicker(ctx.progress) : ''}
      <button class="btn ${ctx.hasSave ? '' : 'primary'} wide" data-action="start">下班了，回家吃饭${ctx.progress?.selected ? ` · Lv${ctx.progress.selected}` : ''}</button>
      <label class="seed"><span>种子（可选）</span><input id="seed-input" inputmode="numeric" placeholder="留空随机"></label>
    </div>
    <div class="howto">几秒内选一句话。三招：<b>装透明</b>溜走、<b>支走</b>转移威胁、<b>装忙</b>本句不升温；道具攻防补时；场景里偶尔有<b>事件牌</b>，一次性特殊手牌；每局 2 条<b>今日词条</b>改变规则。赢一局解锁更难的<b>饭点危机</b>等级，共 ${MAX_LEVEL} 级。</div>
    <div class="cast">
      ${NPC_ORDER.map(id => `<div class="cast-item" title="${NPCS[id].traitText}">${sprite(id, 50, 'sm')}<b>${NPCS[id].name}</b></div>`).join('')}
    </div>
    <p class="credit">《别看我，我要吃饭》v0.4 可玩原型 · 方向 ③「反向恋爱养成」· ${SCHEDULE.length} 个时段 · 音效与音乐 ${ctx.muted ? '关' : '开'}（点 🔊 切换）</p>
  </section>`;
}
