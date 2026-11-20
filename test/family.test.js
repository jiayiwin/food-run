// 家庭剧本（js/data/family.js + js/game/story.js）：文案、结构、门口出题、来电、钩子、晚饭、抽签、称号、图鉴、关卡、铁律
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRun, updateRun, input } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { judge } from '../js/game/choice.js';
import { courseBlocks } from '../js/game/course.js';
import { NPCS, TAGS, EXCUSE_TAGS } from '../js/data/npcs.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { MODIFIERS } from '../js/data/modifiers.js';
import { ART_MANIFEST } from '../js/data/art.js';
import { RES, speedAt } from '../js/data/tune.js';
import { STORE, TITLES } from '../js/data/events.js';
import { LEVELS, LEVEL_ORDER } from '../js/data/levels.js';
import { ALBUM, ALBUM_KEYS } from '../js/data/album.js';
import { say } from '../js/data/address.js';
import { FAMILIES, ERRANDS, MEMBERS, SITUATIONS, STRONG, WEAK, RULES, HOME_CALL, FAMILY_TITLES, DEFAULT_STORY, DOOR_MARKS, doorQuestionsBy } from '../js/data/family.js';
import { storyOf, storyKeys, isFreeStory, familyOf, resolveStory, doorQuestion, doorAsker, dinnerLine, callerFor, callForced, mealAdjust, mealFor, famTitles, famReserve, PICKUP_PAD, story, etaMin } from '../js/game/story.js';
import { LV } from '../js/game/level.js';
import { shareQuery, friendFromQuery } from '../js/game/share.js';
import { daySeed } from '../js/core/rng.js';
import { modifierOf } from '../js/data/modifiers.js';

const L = (s, g = 'm') => [...say(s, g)].length;
const KEYS = storyKeys(), SEEDS = [1, 42, 2026];
const FREE = KEYS.filter(isFreeStory), ERR_FREE = FREE.filter(k => storyOf(k).errand);
const botRng = seed => { let r = 0x2545f491 ^ (seed * 7919); return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
function play(seed, story, cfg = {}, opts = {}) {
  const run = makeRun({ seed, story, ...opts }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', think: 0.6, ...cfg });
  while (!run.done && run.t < 900) { bot(run); updateRun(run, 1 / 60); run.fx.length = 0; }
  return run;
}
// 门口快照：只满足给定的情况
const S = (o = {}) => ({ flags: {}, clockMin: 1130, par: 1129, home: { early: 0, promise: 7, late: 11 }, sat: 60, boxes: 3, shops: 0, rides: 0, wet: false, errand: null, seed: 1, ...o });
const allDoorQs = () => [
  ...Object.values(FAMILIES).flatMap(f => [...Object.values(f.questions).map(q => [f, q, q.who || f.door[0]]), ...Object.values(f.stories).flatMap(st => (st.door || []).map(d => [f, d[1], d[1].who || f.door[0]]))]),
  ...Object.values(ERRANDS).flatMap(e => Object.values(e.door).map(q => [null, q, q.who || e.from])),
];

test('#1 文案长度：门口 ≤6 / ≤4 / ≤14，来电、开局一句、饭桌一句、家里那边、规则台词 ≤14 等（男 / 女主角两套称呼都算）', () => {
  for (const g of ['m', 'f']) {
    const chk = (s, n, where) => { if (s != null && s !== '') assert.ok(L(s, g) <= n, `${g} ${where}：${say(s, g)}（${L(s, g)} > ${n}）`); };
    for (const [, q] of allDoorQs()) { chk(q.line, 6, q.id); for (const o of q.opts) { chk(o.text, 4, q.id); chk(o.react, 14, q.id); chk(o.goodReact, 14, q.id); } }
    for (const f of Object.values(FAMILIES)) {
      chk(f.name, 4, f.id); chk(f.blurb, 14, f.id); chk(f.hint, 14, f.id); chk(f.marks.bad, 4, f.id);
      chk(f.caller.line, 14, `${f.id}.caller`); chk(f.caller.pick, 14, `${f.id}.caller`); chk(f.caller.hang, 14, `${f.id}.caller`); chk(f.caller.name, 8, `${f.id}.caller`);
      for (const s of Object.values(f.dinner)) chk(s, 14, `${f.id}.dinner`);
      for (const s of Object.values(f.away)) chk(`家里：${s}`, 14, `${f.id}.away`);
      for (const m of [...f.meals, f.takeout]) chk(m.name, 8, `${f.id}.meal`);
      for (const t of f.titles) chk(t.name, 6, `${f.id}.title`);
      for (const [sid, st] of Object.entries(f.stories)) {
        chk(st.name, 6, `${f.id}.${sid}`);
        if (st.intro) chk(st.intro[1], 14, `${f.id}.${sid}.intro`);
        for (const [, , d] of st.door || []) chk(d, 14, `${f.id}.${sid}.dinner`);
        for (const m of Object.values(st.meals || {})) chk(m.name, 8, `${f.id}.${sid}.meal`);
      }
      chk(`家规：${f.hint}`, 14, `${f.id} 家规提示`);
    }
    for (const e of Object.values(ERRANDS)) {
      chk(e.name, 3, e.id); chk(e.give.line, 14, e.id); chk(e.title, 6, e.id);
      for (const s of Object.values(e.dinner)) chk(s, 14, e.id);
      for (const s of Object.values(e.share)) chk(s, 8, e.id);
      if (e.carrier.item) { chk(e.carrier.item.name, 4, e.id); chk(e.carrier.item.note, 7, e.id); chk(`${e.carrier.item.note}：${e.carrier.item.name}`, 14, `${e.id} 进店卡`); }
    }
    for (const [id, m] of Object.entries(MEMBERS)) { for (const s of Object.values(m.ruleLines)) chk(s, 14, `${id}.rule`); chk(m.hint, 14, id); chk(m.name, 4, id); }
    for (const t of FAMILY_TITLES) chk(t.name, 6, t.name);
    for (const s of Object.values(DOOR_MARKS)) chk(s, 4, s);
  }
});

test('#2 结构：order 都是强情况、都有题；有 normal；4 档晚饭加外卖、图都在清单里；成员都在 MEMBERS、不和 NPCS 重名；题 id 全局唯一', () => {
  for (const f of Object.values(FAMILIES)) {
    for (const k of f.order) { assert.ok(STRONG.includes(k) && SITUATIONS[k], `${f.id} ${k}`); assert.ok(f.questions[k], `${f.id} 缺 ${k} 题`); }
    assert.ok(f.questions.normal, `${f.id} 没有兜底题`);
    for (const k of Object.keys(f.questions)) assert.ok(f.order.includes(k) || WEAK.includes(k), `${f.id} ${k} 不在 order / WEAK 里`);
    assert.equal(f.meals.length, 4);
    for (const m of [...f.meals, f.takeout, ...Object.values(f.stories).flatMap(st => Object.values(st.meals || {}))]) assert.ok(ART_MANIFEST.props[m.art], `${f.id} ${m.name} 的图 ${m.art} 不在清单里`);
    for (const who of f.door) assert.ok(MEMBERS[who], who);
    for (const [, st] of Object.entries(f.stories)) {
      if (st.errand) assert.ok(ERRANDS[st.errand], st.errand);
      if (st.errand && ERRANDS[st.errand].give.by === 'start') assert.ok(st.intro, `${f.id} 开局交代的故事要有 intro`);
      for (const g of st.guests || []) assert.ok(MEMBERS[g], g);
    }
  }
  for (const [, q, who] of allDoorQs()) assert.ok(MEMBERS[who], `${q.id} 的答题人 ${who}`);
  for (const id of Object.keys(MEMBERS)) assert.ok(!NPCS[id], `${id} 和 NPCS 重名`);
  const ids = new Map();
  for (const [, q] of allDoorQs()) { if (ids.has(q.id)) assert.equal(ids.get(q.id), q, `题 id 重复：${q.id}`); ids.set(q.id, q); }   // 同一个题对象（周一的饭盒题）可以出现两次
});

test('#3 每道门口题都能过、不带效果；借口全疲劳时也有能过的；同一个人的回答不重名', () => {
  const seen = new Map();
  for (const [, q, who] of allDoorQs()) {
    assert.ok(q.opts.length === 2 && q.opts.some(o => o.good !== false), `${q.id} ${q.line}`);
    for (const o of q.opts) {
      assert.ok(TAGS.includes(o.tag) && !o.eff && !o.cost && !o.slow, `${q.id} ${o.text}`);
      const k = `${who}:${o.text}`;
      assert.ok(!seen.has(k) || seen.get(k) === q.id, `同一个人的回答重名：${k}（${seen.get(k)} / ${q.id}）`);
      seen.set(k, q.id);
    }
  }
  const used = Object.fromEntries(EXCUSE_TAGS.map(t => [t, 2]));
  const ctx = { money: 20, sat: 60, used, flags: {}, shops: 0, mom: true };
  for (const [, q] of allDoorQs()) assert.ok(q.opts.some(o => judge(o, ctx).good !== false), `借口全疲劳：${q.id} ${q.line} 没有能过的`);
});

test('#4 挑题优先级：平常日只满足一个强情况就出它；钩子故事永远出钩子题；序章 / 周一 / 周三的关卡题', () => {
  const only = {
    angry: { flags: { momAngry: true } }, promise: { flags: { momHappy: true }, clockMin: 1129 + 7.5 }, broken: { boxes: 2 }, wet: { wet: true },
    takeout: { flags: { takeout: true } }, late: { clockMin: 1129 + 12 }, hungry: { sat: 10 }, early: { clockMin: 1129 },
  };
  for (const f of Object.values(FAMILIES)) {
    const st = storyOf(`${f.id}.normal`);
    for (const k of f.order) assert.equal(doorQuestion(st, S(only[k])).key, k, `${f.id} ${k}`);
    assert.ok(WEAK.includes(doorQuestion(st, S()).key), `${f.id} 什么都不满足：弱情况`);
  }
  const soy = storyOf('parents.soy');
  assert.equal(doorQuestion(soy, S({ flags: { momAngry: true }, errand: 'done' })).q.id, 'mom_soy1');
  assert.equal(doorQuestion(soy, S({ boxes: 1, errand: 'todo' })).q.id, 'mom_soy2');
  assert.equal(doorQuestion(storyOf('parents.parcel'), S({ errand: 'done' })).who, 'dad');
  for (const s of [S(), S({ flags: { momAngry: true }, boxes: 1, clockMin: 1200 })]) assert.equal(doorQuestion(storyOf('parents.prologue'), s).q.id, 'mom10');
  const mon = storyOf('parents.mon');
  assert.equal(doorQuestion(mon, S()).q.id, 'mom11');
  assert.equal(doorQuestion(mon, S({ boxes: 2, flags: { momAngry: true } })).q.id, 'mom7');
  assert.equal(doorQuestion(mon, S({ boxes: 2, flags: { momHappy: true }, clockMin: 1150 })).q.id, 'mom7');
  assert.equal(doorQuestion(storyOf('parents.wed'), S()).who, 'nainai');
  // 有娃家：晚到、外卖、湿身由姥姥问，其余朵朵
  const kid = storyOf('kid.normal');
  assert.equal(doorQuestion(kid, S(only.late)).who, 'laolao'); assert.equal(doorQuestion(kid, S(only.promise)).who, 'duoduo');
});

test('#5 弱情况按种子轮换，不碰 run.rng；同一快照两次结果相同', () => {
  for (const f of Object.values(FAMILIES)) {
    const st = storyOf(`${f.id}.normal`), keys = new Set();
    for (let seed = 1; seed <= 300; seed++) {
      const s = S({ shops: 1, rides: 1, seed });
      const a = doorQuestion(st, s), b = doorQuestion(st, s);
      assert.equal(a.key, b.key);
      keys.add(a.key);
    }
    assert.deepEqual([...keys].sort(), WEAK.filter(k => f.questions[k]).sort(), f.id);
  }
  const run = makeRun({ seed: 9, story: 'share.normal' }), s0 = run.rng.state;
  story.door(run, 1130);
  assert.equal(run.rng.state, s0);
});

test('#6 来电：效果所有家庭都一样；交代事情的来电只在第一个来电槽；人名和台词', () => {
  for (const k of KEYS) for (const n of [0, 1, 2]) {
    const c = callerFor(storyOf(k), n);
    assert.equal(c.pick.eff, HOME_CALL.pick); assert.equal(c.hang.eff, HOME_CALL.hang);
    assert.equal(callForced(storyOf(k), n), !!(storyOf(k).errand && storyOf(k).errand.give.by === 'call' && n === 0), `${k} ${n}`);
  }
  const p = callerFor(storyOf('parents.parcel'), 0);
  assert.equal(p.who, 'dad'); assert.equal(p.line, '快递到了，帮我拿下'); assert.equal(p.errand, 'parcel');
  assert.equal(callerFor(storyOf('parents.parcel'), 1).who, 'mom');
  assert.equal(callerFor(storyOf('cat.normal'), 0).name, '猫咪摄像头');
  assert.equal(callerFor(storyOf('kid.normal'), 0).line, '{爸爸}你几点回来？');
  // 自由下班的交代故事：第一个来电一定是家里（不走抽签）
  for (const k of FREE.filter(k => storyOf(k).errand && storyOf(k).errand.give.by === 'call')) for (const seed of SEEDS) {
    const run = play(seed, k);
    assert.equal(run.callers[0], 'mom', `${k} ${seed}`);
  }
});

test('#7 晚饭：钩子办了 +1、忘了最高 2；序章保底 2；周三 3 档是奶奶包的饺子；奶奶家没有泡面；外卖换成本家的', () => {
  const soy = storyOf('parents.soy');
  for (let t = 0; t <= 3; t++) {
    assert.equal(mealAdjust(soy, t, 'done'), Math.min(3, t + 1));
    assert.equal(mealAdjust(soy, t, 'todo'), Math.min(2, t));
    assert.equal(mealAdjust(storyOf('share.normal'), t, null), t);
  }
  assert.equal(mealAdjust(storyOf('parents.prologue'), 0, null), 2);
  assert.equal(mealFor(storyOf('parents.wed'), 3, false).name, '奶奶包的饺子');
  for (let t = 0; t <= 3; t++) assert.ok(!/泡面/.test(mealFor(storyOf('nainai.normal'), t, false).name));
  assert.ok(!/泡面/.test(FAMILIES.nainai.takeout.name));
  for (const f of Object.values(FAMILIES)) { assert.equal(mealFor(storyOf(`${f.id}.normal`), 1, true).name, f.takeout.name); assert.equal(mealFor(storyOf(`${f.id}.normal`), 2, true).name, f.meals[2].name); }
});

test('#8 抽签：纯函数；自由下班权重；今日挑战周五心情全国奶奶家、其他天没有；resolveStory 的优先级', () => {
  assert.equal(familyOf(12345), familyOf(12345));
  const N = 20000, cnt = {}, fam = {};
  for (let seed = 1; seed <= N; seed++) { const k = familyOf(seed); cnt[k] = (cnt[k] || 0) + 1; const f = k.split('.')[0]; fam[f] = (fam[f] || 0) + 1; }
  for (const k of FREE) assert.ok(cnt[k] > 0, `${k} 抽不到`);
  for (const k of KEYS.filter(k => !isFreeStory(k))) assert.ok(!cnt[k], `${k} 是关卡专用`);
  const W = Object.values(FAMILIES).reduce((a, f) => a + f.weight, 0);
  for (const f of Object.values(FAMILIES)) assert.ok(Math.abs(fam[f.id] / N - f.weight / W) <= 0.03, `${f.id} ${(fam[f.id] / N).toFixed(3)}`);
  const friday = MODIFIERS.find(m => m.id === 'friday');
  for (let seed = 1; seed <= 500; seed++) {
    assert.equal(familyOf(seed, { daily: true, mod: friday }).split('.')[0], 'nainai');
    for (const m of MODIFIERS.filter(m => m.id !== 'friday')) assert.notEqual(familyOf(seed, { daily: true, mod: m }).split('.')[0], 'nainai');
  }
  // 优先级：关卡 > 今日挑战（不看好友卡的 h）> 好友卡 h > 种子
  assert.equal(resolveStory({ seed: 5, daily: true, level: LEVELS.mon, friend: { h: 'cat.normal' } }), 'parents.mon');
  const ds = daySeed(new Date(2026, 10, 23));
  assert.equal(resolveStory({ seed: ds, daily: true, mod: modifierOf(ds), friend: { h: 'cat.normal' } }), familyOf(ds, { daily: true, mod: modifierOf(ds) }));
  assert.equal(resolveStory({ seed: 5, friend: { h: 'share.tissue' } }), 'share.tissue');
  for (const h of ['', 'xx.yy', 'parents.tue', 'constructor.normal', 'parents', 'parents.normal.x']) assert.equal(resolveStory({ seed: 5, friend: { h } }), DEFAULT_STORY, h);
  assert.equal(resolveStory({ seed: 5 }), familyOf(5));
  assert.equal(makeRun({ seed: 1 }).story.key, 'parents.normal');
  assert.equal(makeRun({ seed: 1, story: 'nope' }).story.key, 'parents.normal');
  assert.equal(makeRun({ seed: 1, level: 'tue', story: 'cat.normal' }).story.key, 'parents.tue', '关卡写死');
  // 定稿 4.4：11/23 周五心情 · 奶奶家 · 润喉糖
  assert.equal(modifierOf(ds).id, 'friday'); assert.equal(familyOf(ds, { daily: true, mod: modifierOf(ds) }), 'nainai.candy');
});

test('#8b 好友同路：分享卡带 h，好友点开同一个家、同一条路；关卡分享不带 h', () => {
  for (const k of ['share.takeaway', 'parents.parcel', 'cat.catfood']) {
    const q = shareQuery({ seed: 7, win: true, arrivalText: '18:50', daily: false, level: 'full', story: k });
    assert.ok(q.endsWith(`&h=${k}`), q);
    const f = friendFromQuery(Object.fromEntries(q.split('&').map(kv => kv.split('='))));
    assert.equal(f.h, k);
    const key = resolveStory({ seed: f.seed, friend: f });
    assert.equal(key, k);
    const a = makeRun({ seed: f.seed, story: key }), b = makeRun({ seed: 7, story: k });
    assert.equal(JSON.stringify(a.course.obstacles.map(o => [o.type, o.x])), JSON.stringify(b.course.obstacles.map(o => [o.type, o.x])));
  }
  assert.ok(!shareQuery({ seed: 7, win: true, arrivalText: '18:50', level: 'mon', story: 'parents.mon' }).includes('h='));
});

test('#9 钩子只影响家里：办 / 不办都 0 碰撞 0 被抓到家，饭盒和被追一样；想办一定办得成', () => {
  for (const key of ERR_FREE) for (const seed of SEEDS) {
    const a = play(seed, key, { errand: 'do' }), b = play(seed, key, { errand: 'skip' });
    for (const r of [a, b]) assert.ok(r.done && r.done.win && r.stats.hits === 0 && r.stats.caught === 0, `${key} ${seed}`);
    assert.equal(a.boxes, b.boxes); assert.equal(a.stats.chased, b.stats.chased);
    assert.equal(a.fam.errand.state, 'done', `${key} ${seed} 想办却没办成`);
    assert.notEqual(b.fam.errand.state, 'done');
    assert.ok(a.done.meal.tier >= Math.min(b.done.meal.tier, 2), `${key} 办了晚饭反而更差`);
    const c = play(seed, key, { choose: 'bad' });
    assert.ok(c.done.win && c.stats.caught === 0, `${key} ${seed} 每题选错：${c.done.reason}`);
  }
});

test('#10 不耽误时间：买家里要的不加时钟、不加饱腹、不计 shops；跳起来拿和不拿到家时刻一样', () => {
  const run = makeRun({ seed: 3, story: 'parents.soy' });
  run.intro = 0; run.fam.errand.state = 'todo';
  run.shop = { t: 0.5, T: STORE.time, picked: -1, closeT: 0, items: story.shopItems(run, STORE.items) };
  assert.equal(run.shop.items[2].fam, 'soy');
  const c0 = run.clock, s0 = run.sat, m0 = run.money, sh0 = run.stats.shops;
  input(run, 'card', 2);                                          // 点货架第 3 格（家里要的）
  assert.equal(run.clock, c0); assert.equal(run.sat, s0); assert.equal(run.stats.shops, sh0);
  assert.equal(run.money, m0 - ERRANDS.soy.carrier.item.price);
  assert.equal(run.fam.errand.state, 'done'); assert.equal(run.stats.famBuys, 1);
  assert.equal(story.shopItems(run, STORE.items)[2].id, 'energy', '办完了：第 3 格换回能量饮料');
  for (const key of ['parents.parcel', 'share.takeaway']) for (const seed of SEEDS) {
    const a = play(seed, key, { errand: 'do' }), b = play(seed, key, { errand: 'skip' });
    assert.ok(Math.abs(a.done.arrival - b.done.arrival) <= 0.05, `${key} ${seed}：${a.done.arrival} vs ${b.done.arrival}`);
  }
});

test('#11 判定规则：奶奶家「去买东西」进过店才是真话；橘子超时说自己的话；powerbank 不变', () => {
  const late = FAMILIES.nainai.questions.late, buy = late.opts.find(o => o.rule === 'bought');
  const base = { money: 20, sat: 60, used: {}, flags: {}, mom: true, ruleLines: MEMBERS.nainai.ruleLines };
  assert.equal(judge(buy, { ...base, shops: 0 }).good, false);
  const r = judge(buy, { ...base, shops: 1 }); assert.equal(r.good, true); assert.equal(r.react, buy.goodReact);
  assert.ok(RULES.powerbank({ flags: { powerbank: true } }) && !RULES.powerbank({ flags: {} }));
  const pb = FAMILIES.parents.questions.angry.opts.find(o => o.rule === 'powerbank');
  assert.equal(judge(pb, { ...base, flags: {} }).good, false); assert.equal(judge(pb, { ...base, flags: { powerbank: true } }).good, true);
  // 规则改判（饿了说真话）用答题人自己的台词
  const truth = FAMILIES.cat.questions.hungry.opts.find(o => o.tag === '真话');
  assert.equal(judge(truth, { ...base, sat: 5, ruleLines: MEMBERS.juzi.ruleLines }).react, MEMBERS.juzi.ruleLines.hungry);
  // 门口超时：橘子转身走了
  const run = makeRun({ seed: 2, story: 'cat.normal' });
  while (!run.done && run.t < 900) { if (!(run.choice && run.choice.kind === 'mom')) makeBotOnce(run); updateRun(run, 1 / 60); run.fx.length = 0; if (run.choice && run.choice.kind === 'mom' && run.choice.res) break; }
  assert.ok(run.choice && run.choice.kind === 'mom' && run.choice.timeout, '门口没超时');
  assert.equal(run.choice.res.react, '（它转身走了）');
});
let botOnce = null, botRun = null;
function makeBotOnce(run) { if (botRun !== run) { botOnce = makeBot({ rng: botRng(2), skill: 1, choose: 'good' }); botRun = run; } botOnce(run); }

test('#12 位置和停住：交代在能办的地方之前；拾取物的空地和窗口不重叠、空地里 0 障碍、60px 内没零钱包子；没交代不收；世界停住 ≤15 秒', () => {
  for (const key of ERR_FREE) {
    const st = storyOf(key), lv = LV('full'), callX = lv.slots.find(s => s.kind === 'call').x;
    if (st.errand.give.by === 'call') {
      const at = st.errand.carrier.kind === 'store' ? lv.slots.find(s => s.kind === 'store').x : famReserve(st, lv, courseBlocks(lv)).x;
      assert.ok(callX < at, `${key}：交代 ${callX} 在能办的地方 ${at} 之后`);
    }
    if (st.errand.carrier.kind !== 'pickup') continue;
    const blocks = courseBlocks(lv), { reserve, x } = famReserve(st, lv, blocks);
    assert.ok(x != null);
    for (const [p, q] of reserve) for (const [a, b] of blocks) assert.ok(q < a || p > b, `${key} 空地 ${p}–${q} 和窗口 ${a}–${b} 重叠`);
    for (const seed of SEEDS) {
      const run = makeRun({ seed, story: key });
      const v = speedAt(x) * 1.04, lo = x - PICKUP_PAD[0] * v, hi = x + PICKUP_PAD[1] * v;
      assert.equal(run.course.obstacles.filter(o => o.x + OBSTACLES[o.type].w > lo && o.x < hi).length, 0, `${key} ${seed} 空地里有障碍`);
      assert.equal(run.course.pickups.filter(k => k.kind !== 'errand' && Math.abs(k.x - x) <= 60).length, 0);
      assert.equal(run.course.pickups.filter(k => k.kind === 'errand').length, 1);
    }
  }
  // 还没交代：跳到拾取物那里也不收
  const run = makeRun({ seed: 1, story: 'parents.parcel' }), pk = run.course.pickups.find(k => k.kind === 'errand');
  assert.equal(run.fam.errand.state, 'none');
  assert.equal(story.onPickup(run, pk), false);
  // 世界停住：钩子故事只跑最坏的一种组合（电梯 / 进店不买 / 两个红灯 / 不冲刺）× 3 个种子
  for (const key of ERR_FREE) for (const seed of SEEDS) {
    const r = makeRun({ seed, story: key, xlight: 'worst' });
    const res = simulate(r, makeBot({ rng: botRng(seed), skill: 1, choose: 'good', route: 'lift', shop: 'idle', store: 'always', dash: false, close: false }), { update: updateRun });
    assert.ok(res.win, `${key} ${seed}`);
    assert.ok(res.stats.stopT <= 15, `${key} ${seed} 停了 ${res.stats.stopT.toFixed(2)} 秒`);
  }
});

test('#13 图鉴：一人一页（路上 7 人 + 家里 7 人）；老键还在；每个故事说过的话都在目录里', () => {
  assert.equal(ALBUM.length, Object.keys(NPCS).length + Object.keys(MEMBERS).length);
  const total = Object.values(NPCS).reduce((n, v) => n + new Set(v.questions.flatMap(q => q.opts.map(o => o.text))).size, 0)
    + Object.keys(MEMBERS).reduce((n, id) => n + new Set(Object.values(doorQuestionsBy(id)).flatMap(q => q.opts.map(o => o.text))).size, 0);
  assert.equal(ALBUM_KEYS.size, total);
  for (const k of ['mom:我错了', 'mom:马上洗', 'mom:我饿嘛', 'mom:跑回来的', 'mom:车溅的']) assert.ok(ALBUM_KEYS.has(k), k);
  assert.ok(ALBUM.filter(e => e.group === 'home').length === Object.keys(MEMBERS).length);
  for (const k of KEYS) {
    const run = play(7, k, {}, LEVELS[k.split('.')[1]] && !isFreeStory(k) ? { level: k.split('.')[1] } : {});
    for (const s of run.said.filter(s => MEMBERS[s.split(':')[0]])) assert.ok(ALBUM_KEYS.has(s), `${k}：${s} 不在图鉴里`);   // 家里人说过的话（路上的连锁记仇另算）
    assert.ok(run.said.some(s => MEMBERS[s.split(':')[0]]), `${k} 门口没答题`);
  }
});

test('#14 门口一定结算：每个故事不答题（超时）到家，门口记了好 / 中 / 坏之一；饭桌一句、称号不空', () => {
  for (const k of KEYS) {
    const lvId = !isFreeStory(k) ? k.split('.')[1] : null;
    const run = play(7, k, { think: 99 }, lvId ? { level: lvId } : {});
    assert.ok(run.done && run.done.win, k);
    assert.ok(run.flags.momGood || run.flags.momMid || run.flags.momBad, k);
    assert.ok(run.fam.door, k);
    assert.ok(run.done.family.dinner, `${k} 饭桌一句`);
    assert.ok(run.done.title, k);
  }
});

test('#15 平常日晚饭公式和迁移前一样（旧公式写在这里）', () => {
  const OLD = ['泡面', '剩菜热一热', '番茄炒蛋', '红烧肉'];
  const st = storyOf('parents.normal'), run = makeRun({ seed: 1 });
  const p = run.par.min, m = run.lv.def.par.meal;
  for (let am = p - 3; am <= p + 30; am++) for (const happy of [0, 1]) for (const angry of [0, 1]) for (const good of [0, 1]) for (const bonus of [0, 1]) {
    let tier = am <= p + m[0] ? 3 : am <= p + m[1] ? 2 : am <= p + m[2] ? 1 : 0;
    tier += happy + bonus + (good ? 1 : -1) - (angry && !good ? 1 : 0);
    tier = Math.max(0, Math.min(3, tier));
    assert.equal(mealAdjust(st, tier, null), tier);
    assert.equal(mealFor(st, tier, false).name, OLD[tier]);
    if (tier <= 1) assert.equal(mealFor(st, tier, true).name, '放门卫的外卖');
  }
});

test('#16 关卡：四关的故事合法、只在关卡里用；来电槽 caller mom；钩子关有能办的地方；完美机器人到家、钩子办成、晚饭 ≥2 档', () => {
  for (const id of LEVEL_ORDER) {
    const d = LEVELS[id], st = storyOf(d.story.key);
    assert.ok(st && st.st.weight === 0, id);
    for (const s of d.slots.filter(s => s.kind === 'call')) assert.equal(s.caller, 'mom');
    if (st.errand && st.errand.give.by === 'call') assert.ok(d.slots.some(s => s.kind === 'call'), id);
    if (st.errand && st.errand.carrier.kind === 'store') assert.ok(d.slots.some(s => s.kind === 'store'), `${id} 没有便利店`);
    if (st.errand && st.errand.carrier.kind === 'pickup') {
      const lv = LV(id), blocks = courseBlocks(lv), { reserve, x } = famReserve(st, lv, blocks);
      assert.ok(x != null && lv.stages.some(s => s.id === st.errand.carrier.at.split(':')[1]), id);
      for (const [p, q] of reserve) for (const [a, b] of blocks) assert.ok(q < a || p > b, `${id} 空地重叠`);
      assert.ok(Math.abs(x - 20650) < 1, `周二拾取点 ${x}`);
    }
    for (const seed of [1, 2, 3]) {
      const r = makeRun({ seed, level: id }), res = simulate(r, makeBot({ rng: botRng(seed), skill: 1, choose: 'good' }), { update: updateRun });
      assert.ok(res.win && res.stats.hits === 0, `${id} ${seed}`);
      if (st.errand) assert.equal(r.fam.errand.state, 'done', `${id} ${seed} 钩子没办成`);
      assert.ok(res.meal.tier >= 2, `${id} ${seed} 晚饭 ${res.meal.tier}`);
    }
  }
  const pro = FAMILIES.parents.stories.prologue.door[0][1];
  assert.ok(pro.opts.every(o => o.good === true), '序章门口两个都是好回答');
});

test('#17 称号拿得到、不泛滥：每个家庭 / 钩子称号都有能命中的状态；中性状态只有「忘性大王」；平常日没有钩子称号', () => {
  const states = [];
  for (const good of [true, 'mid', false]) for (const key of ['normal', 'broken', 'takeout', 'promise', 'angry', 'errand:done']) for (const tier of [0, 1, 2, 3]) for (const grade of ['S', 'A', 'B']) for (const happy of [true, false]) for (const errand of [null, 'done', 'miss'])
    states.push({ good, key, tier, grade, happy, errand, broken: key === 'broken' ? 2 : 0 });
  for (const k of KEYS) {
    const ft = famTitles(storyOf(k));
    for (const t of [...ft.errand, ...ft.family]) assert.ok(states.some(s => t.test(s)), `${k} ${t.name} 拿不到`);
    const neutral = { good: 'mid', key: 'normal', tier: 1, grade: 'B', happy: false, errand: storyOf(k).errand ? 'miss' : null, broken: 0 };
    for (const t of [...ft.errand, ...ft.family]) if (t.name !== '忘性大王') assert.ok(!t.test(neutral), `${k} ${t.name} 中性状态也命中`);
    if (!storyOf(k).errand) assert.equal(ft.errand.length, 0);
  }
  // 称号表里家庭称号排在性格称号之后、人形外卖之前
  const run = makeRun({ seed: 1, story: 'share.normal' }), list = story.titles(run, TITLES).map(t => t.name);
  assert.ok(list.indexOf('合租好搭子') > list.indexOf('老好人') && list.indexOf('合租好搭子') < list.indexOf('人形外卖'));
});

test('开局：全程局「今晚回」+0.3 秒、开局交代再 +0.3；好友卡带来的新玩家第一局不显示开局交代；预计到家时刻只看位置', () => {
  assert.equal(makeRun({ seed: 1 }).introTotal, 1.1);
  assert.ok(Math.abs(makeRun({ seed: 1, story: 'share.normal' }).introTotal - 1.4) < 1e-9);
  assert.ok(Math.abs(makeRun({ seed: 1, story: 'cat.catfood' }).introTotal - 1.7) < 1e-9);
  const q = makeRun({ seed: 1, story: 'cat.catfood', quiet: true });
  assert.equal(q.introLine, null); assert.equal(q.fam.errand.state, 'todo', '家务照样有效');
  const a = makeRun({ seed: 1 }), b = makeRun({ seed: 1 });
  a.x = b.x = 30000; a.t = 5; b.t = 50;
  assert.equal(etaMin(a, 1100), etaMin(b, 1100));
  assert.ok(etaMin(a, 1100) > 1100);
});

test('机器人：每个家、每个故事（自由下班能抽到的 12 个）× 8 个种子，完美机器人（顺手办家里的事）0 碰撞 0 被抓到家，钩子都办成', () => {
  const SEEDS8 = [1, 2, 3, 42, 777, 2026, 31337, 99991];
  for (const k of FREE) for (const seed of SEEDS8) {
    const run = play(seed, k, { errand: 'do', route: seed % 2 ? 'lift' : 'stairs' });
    assert.ok(run.done && run.done.win, `${k} ${seed}：${run.done && run.done.reason}`);
    assert.equal(run.stats.hits, 0, `${k} ${seed} 撞了`); assert.equal(run.stats.caught, 0, `${k} ${seed} 被抓`);
    if (run.fam.errand) assert.equal(run.fam.errand.state, 'done', `${k} ${seed} 钩子没办成`);
    assert.ok(run.fam.door, `${k} ${seed} 门口没结算`);
  }
});

test('门口答题人提前知道：钩子故事、关卡写死的题、一个人的家，doorAsker 和真正出题的人在各种快照下都一样；爸妈家 / 有娃家平常日不知道（null）', () => {
  // 各种情况的组合快照（含钩子办没办）：每个故事真正问话的人只要 doorAsker 不是 null，就必须是它
  const snaps = [];
  for (const flags of [{}, { momAngry: true }, { momHappy: true }, { takeout: true }, { momHappy: true, takeout: true }])
    for (const clockMin of [1120, 1129, 1137, 1145]) for (const boxes of [3, 1]) for (const sat of [60, 10]) for (const errand of ['done', 'todo', null])
      for (const seed of [1, 2, 3]) snaps.push(S({ flags, clockMin, boxes, sat, errand, seed, shops: seed % 2, rides: seed > 1 ? 1 : 0, wet: seed === 3 }));
  const known = {};
  for (const k of KEYS) {
    const st = storyOf(k), who = doorAsker(st), seen = new Set(snaps.map(s => doorQuestion(st, s).who));
    known[k] = who;
    if (who) assert.deepEqual([...seen], [who], `${k}：提前说是 ${who}，实际 ${[...seen]}`);
    else assert.ok(seen.size > 1, `${k}：只有 ${[...seen]} 一个人会问，应该能提前知道`);
  }
  assert.equal(known['parents.normal'], null); assert.equal(known['kid.normal'], null);
  for (const [k, w] of [['parents.soy', 'mom'], ['parents.parcel', 'dad'], ['parents.prologue', 'mom'], ['parents.mon', 'mom'], ['parents.tue', 'dad'], ['parents.wed', 'nainai'],
    ['share.normal', 'dapeng'], ['cat.normal', 'juzi'], ['cat.catfood', 'juzi'], ['kid.gift', 'duoduo'], ['nainai.normal', 'nainai'], ['nainai.candy', 'nainai']]) assert.equal(known[k], w, k);
});

test('文案一致：忘买酱油的反应不说吃哪道菜（忘了最高 2 档，实际可能是剩菜、泡面）；一人一猫统一叫「罐头」；有娃家 ≥2 档的饭桌一句是视频那句', () => {
  // 忘了带东西：门口反应不提这个家 0–2 档的菜名、外卖（到底吃哪道看档位）
  for (const k of KEYS) {
    const st = storyOf(k);
    if (!st.errand) continue;
    const dishes = [...st.fam.meals.slice(0, 3), st.fam.takeout, ...Object.values(st.st.meals || {})].map(m => m.name);
    for (const o of st.errand.door.miss.opts) for (const d of dishes) assert.ok(!o.react.includes(d) && !(o.goodReact || '').includes(d), `${k} ${o.text}：「${o.react}」提到了 ${d}`);
  }
  assert.ok(ERRANDS.soy.door.miss.opts[0].react.includes('红烧肉'), '说的是做不成的那道（3 档）');
  // 一人一猫：家庭、故事、钩子（交代、货架、门口、饭桌、分享、称号）里只有「罐头」，没有「猫粮」
  const strs = [];
  const walk = v => { if (typeof v === 'string') strs.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) if (typeof x !== 'function') walk(x); };
  walk(FAMILIES.cat); walk(ERRANDS.catfood);
  assert.ok(strs.some(x => x.includes('罐头')));
  assert.deepEqual(strs.filter(x => x.includes('猫粮')), []);
  assert.equal(ERRANDS.catfood.carrier.item.name, '猫罐头');
  // 有娃家：≥2 档饭桌一句是「{老婆}在视频里笑了」（视频手机也是 ≥2 档才立在桌上，见 test/scene.test.js）
  const kid = storyOf('kid.normal');
  assert.equal(dinnerLine(kid, { door: null, errand: null, tier: 2 }), FAMILIES.kid.dinner.top);
  assert.equal(dinnerLine(kid, { door: null, errand: null, tier: 1 }), FAMILIES.kid.dinner.any);
});
