// 选择判定与出题。纯逻辑。
// 判定顺序固定：① 资源（钱不够 / 饿到放行）② 记仇（对同一个人重复上次的借口）③ 疲劳（同类借口第 3 次）④ 基础
import { NPCS, MOM, CHAIN_GRUDGES, DOUBLE_DOWN, EXCUSE_TAGS, RULE_LINES } from '../data/npcs.js';
import { RULES } from '../data/family.js';
import { RES } from '../data/tune.js';

// ctx：{ money, sat, used, grudgeTag, flags, shops, mom, ruleLines }。门口终题（mom）被规则改判时，用答题人自己的那句（ctx.ruleLines，缺省妈妈的）
export function judge(opt, ctx) {
  const r = judgeRaw(opt, ctx);
  if (ctx.mom && r.reason !== 'base' && r.reason !== 'rule') r.react = (ctx.ruleLines || MOM.ruleLines)[r.reason] || opt.react;
  return r;
}
function judgeRaw(opt, ctx) {
  const used = ctx.used || {}, flags = ctx.flags || {};
  if (opt.cost && ctx.money < opt.cost) return { good: false, reason: 'broke', react: RULE_LINES.broke };
  if (opt.tag === '真话' && ctx.sat < RES.hungry) return { good: true, reason: 'hungry', react: RULE_LINES.hungry };
  if (ctx.grudgeTag && opt.tag === ctx.grudgeTag) return { good: false, reason: 'grudge', react: RULE_LINES.grudge };
  if (EXCUSE_TAGS.includes(opt.tag) && (used[opt.tag] || 0) >= 2) return { good: false, reason: 'tired', react: RULE_LINES.tired };
  // 规则表（family.js 的 RULES）：powerbank 借过充电宝「没电了」才是真话；bought 路上真进店买过东西「去买东西」才是真话
  if (opt.rule && RULES[opt.rule]) return RULES[opt.rule]({ ...ctx, flags }) ? { good: true, reason: 'rule', react: opt.goodReact } : { good: opt.good, reason: 'base', react: opt.react };
  return { good: opt.good, reason: 'base', react: opt.react };
}

// 是否「借口」：用到第几次了（卡片上显示「已用×N」）
export const isExcuse = tag => EXCUSE_TAGS.includes(tag);

// 这道题的气泡和卡片还画不画：选了「进店」以后便利店面板就是反馈，「进店」卡不再压在面板下面、出店后也不再冒出来
export const choiceShown = c => !!c && !(c.phase !== 'open' && c.kind === 'store' && c.picked === 0);

// 出题。state：{ rng, stage, npcSeen, qUsed, grudges, revisits, flags, t, lastNpc, clockMin, exclude? }
//   lastNpc 尽量不连着出同一个人（没别人可出时还是会出）；exclude 一定不出（电梯里：被门夹住 / 跟进轿厢的追兵）
// 返回 { npc, line, opts, revisit, grudgeTag, grudge } 或 null（没人可出）
export function makeQuestion(state, slot) {
  const { rng } = state;
  if (slot.kind === 'mom') return momQuestion(state);

  // 记仇回访：普通槽优先，到点的、每人只回访一次、每局最多 2 次
  if (slot.kind === 'npc' && state.revisits < 2) {
    const revisited = new Set(state.grudges.filter(h => h.done && !h.chain).map(h => h.npc));
    const g = state.grudges.find(g => !g.done && g.readyAt <= state.t && (g.chain || !revisited.has(g.npc)));
    if (g) {
      g.done = true;
      return revisitQuestion(state, g);
    }
  }

  let npcId = slot.fixed;
  if (!npcId) {
    const cands = Object.keys(NPCS).filter(id => NPCS[id].stages.includes(state.stage) && !NPCS[id].gate && (state.npcSeen[id] || 0) < (state.stage === 'park' ? 4 : 3) && !(state.exclude && state.exclude.includes(id)));   // 小区只有王阿姨一个可出，多给一次
    let pool = cands.filter(id => id !== state.lastNpc);
    if (!pool.length) pool = cands;
    if (!pool.length) return null;
    const least = Math.min(...pool.map(id => state.npcSeen[id] || 0));
    npcId = rng.pick(pool.filter(id => (state.npcSeen[id] || 0) === least));
  }
  const npc = NPCS[npcId];
  const fresh = npc.questions.filter(q => !state.qUsed.has(q.id));
  const q = rng.pick(fresh.length ? fresh : npc.questions);
  state.qUsed.add(q.id);
  return { npc: npcId, line: q.line, opts: sides(rng, q.opts), revisit: false };
}

function revisitQuestion(state, g) {
  const { rng } = state;
  if (g.chain) {
    const c = CHAIN_GRUDGES[g.chain];
    return { npc: c.npc, line: c.line, opts: sides(rng, c.opts), revisit: true, grudge: g };
  }
  const npc = NPCS[g.npc];
  const same = { text: DOUBLE_DOWN[g.tag], tag: g.tag, good: false, react: RULE_LINES.grudge, lol: 1 };
  // 反击选项：类型不能和上次一样，也尽量不选已经用疲了的
  const ok = npc.comebacks.filter(c => c.tag !== g.tag);
  const fresh = ok.filter(c => !(isExcuse(c.tag) && (state.used[c.tag] || 0) >= 2) && !(c.cost && state.money < c.cost));
  const back = fresh[0] || { text: '是我不对', tag: g.tag === '真话' ? '顺从' : '真话', good: true, react: '……算了，去吧', lol: 1 };
  const line = g.said ? `你不是说「${g.said}」吗？` : '上次话还没说完呢';
  return { npc: g.npc, line, pre: npc.hi, opts: sides(rng, [same, back]), revisit: true, grudgeTag: g.tag, grudge: g };
}

// 门口终题：出哪道题由剧本接入点（js/game/story.js 的 story.door，按本路线标准时间判晚到）在 prepareSlot 里挑好，
// 这里只抽左右（同一次 rng）。没传 door 时出平常那道
function momQuestion(state) {
  const d = state.door || { key: 'normal', who: 'mom', q: MOM.questions.mom1, dinner: null };
  return { npc: d.who, line: d.q.line, opts: sides(state.rng, d.q.opts), revisit: false, mom: d.key, dinner: d.dinner || null };
}

// 左右随机：别让玩家背出「右边总是好的」
function sides(rng, opts) { return rng.chance(0.5) ? [opts[0], opts[1]] : [opts[1], opts[0]]; }
