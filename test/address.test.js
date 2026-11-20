// 男女主角：称呼表（js/data/address.js）、两套文案长度、外观切换、存档里的 gender；分享卡 / 好友卡不带性别
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADDRESS, say, term, keysIn, setAddressGender, addressGender } from '../js/data/address.js';
import { NPCS, MOM, CHAIN_GRUDGES, RULE_LINES } from '../js/data/npcs.js';
import { CALLERS, RIDE, LIFT, STORE, ROUTE, TITLES, UNKNOWN_OUTCOMES, TIPS } from '../js/data/events.js';
import { FAMILIES, ERRANDS, MEMBERS } from '../js/data/family.js';
import { LEVELS, LEVEL_ORDER } from '../js/data/levels.js';
import { DEATH_TIPS } from '../js/data/tips.js';
import { ALBUM_KEYS } from '../js/data/album.js';
import { migrate, DEFAULT } from '../js/core/savefmt.js';
import { shareQuery, friendFromQuery } from '../js/game/share.js';
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { ART_MANIFEST } from '../js/data/art.js';

// 所有会画到屏幕上的文案（[限长, 文字, 出处]）
function allTexts() {
  const out = [], add = (max, s, where) => { if (typeof s === 'string') out.push([max, s, where]); };
  for (const [id, n] of Object.entries(NPCS)) {
    add(14, n.hi, `${id}.hi`); add(14, n.caught, `${id}.caught`); add(20, n.fail.text, `${id}.fail.text`); add(14, n.fail.meal, `${id}.fail.meal`);   // 失败卡那一行单独一行大字，按 20 字算
    for (const q of n.questions) { add(14, q.line, q.id); for (const o of q.opts) { add(8, o.text, q.id); add(14, o.react, q.id); add(14, o.goodReact, q.id); } }
    for (const o of n.comebacks) { add(8, o.text, `${id}.comeback`); add(14, o.react, `${id}.comeback`); }
  }
  // 家庭剧本：门口终题（台词 ≤6、选项 ≤4、反应 ≤14）、来电、开局交代、饭桌一句、家里那边（含「家里：」）、规则台词、菜名、称号、分享短句
  const door = (q, where) => { add(6, q.line, where); for (const o of q.opts) { add(4, o.text, where); add(14, o.react, where); add(14, o.goodReact, where); } };
  for (const f of Object.values(FAMILIES)) {
    for (const [k, q] of Object.entries(f.questions)) door(q, `${f.id}.${k}`);
    add(14, f.caller.line, `${f.id}.caller`); add(14, f.caller.pick, `${f.id}.caller`); add(14, f.caller.hang, `${f.id}.caller`); add(8, f.caller.name, `${f.id}.caller`);
    for (const s of Object.values(f.dinner)) add(14, s, `${f.id}.dinner`);
    for (const s of Object.values(f.away)) add(14, `家里：${s}`, `${f.id}.away`);
    for (const m of [...f.meals, f.takeout]) add(8, m.name, `${f.id}.meal`);
    for (const t of f.titles) add(6, t.name, `${f.id}.title`);
    add(4, f.name, f.id); add(14, f.blurb, f.id); add(14, f.hint, f.id); add(4, f.marks.bad, f.id);
    for (const [sid, st] of Object.entries(f.stories)) {
      add(6, st.name, `${f.id}.${sid}`);
      if (st.intro) add(14, st.intro[1], `${f.id}.${sid}.intro`);
      for (const [, q, d] of st.door || []) { door(q, `${f.id}.${sid}`); add(14, d, `${f.id}.${sid}.dinner`); }
      for (const m of Object.values(st.meals || {})) add(8, m.name, `${f.id}.${sid}.meal`);
    }
  }
  for (const e of Object.values(ERRANDS)) {
    for (const q of Object.values(e.door)) door(q, `errand.${e.id}`);
    if (e.give.line) add(14, e.give.line, `errand.${e.id}.give`);
    for (const s of [...Object.values(e.dinner)]) add(14, s, `errand.${e.id}.dinner`);
    for (const s of Object.values(e.share)) add(8, s, `errand.${e.id}.share`);
    add(6, e.title, `errand.${e.id}.title`); add(3, e.name, `errand.${e.id}`); add(4, e.carrier.item ? e.carrier.item.name : '', `errand.${e.id}.item`); add(7, e.carrier.item ? e.carrier.item.note : '', `errand.${e.id}.item`);
  }
  for (const [id, m] of Object.entries(MEMBERS)) { for (const s of Object.values(m.ruleLines)) add(14, s, `${id}.rule`); add(14, m.hint, `${id}.hint`); }
  for (const k of ['errand', 'errandStore', 'errandJump', 'promise']) add(14, TIPS[k], `tip.${k}`);
  for (const [k, c] of Object.entries(CHAIN_GRUDGES)) { add(14, c.line, k); for (const o of c.opts) { add(8, o.text, k); add(14, o.react, k); } }
  for (const s of Object.values(RULE_LINES)) add(14, s, 'rule');
  for (const [k, c] of Object.entries(CALLERS)) { add(14, c.line, k); add(14, c.pick.react, k); add(14, c.hang.react, k); }
  for (const o of UNKNOWN_OUTCOMES) add(14, o.react, 'unknown');
  add(14, RIDE.line, 'ride'); add(14, RIDE.done, 'ride.done'); add(14, RIDE.detour.react, 'ride.detour');
  for (const s of Object.values(LIFT.xiaoge)) add(14, s, 'lift.xiaoge');
  add(14, LIFT.empty, 'lift'); add(14, LIFT.key, 'lift');
  add(14, STORE.line, 'store'); add(14, ROUTE.lift.line, 'route');

  for (const t of TITLES) add(14, t.name, 'title');
  for (const t of DEATH_TIPS) add(14, t.text, `tip.${t.id}`);
  for (const id of LEVEL_ORDER) for (const s of LEVELS[id].slots) add(14, s.line, `${id}@${s.x}`);
  return out;
}

test('称呼表：每个词两套都有、不是空的；{键} 按主角换，不认识的键原样留着；单个词 term()', () => {
  for (const [k, v] of Object.entries(ADDRESS)) {
    assert.equal(v.length, 2, k); assert.ok(v[0] && v[1], k);
    assert.ok(!/[{}]/.test(v[0] + v[1]), `${k} 的词里不能再有花括号`);
  }
  // 拍板写明的几组
  for (const [k, m, f] of [['儿子', '儿子', '女儿'], ['爸爸', '爸爸', '妈妈'], ['老婆', '老婆', '老公'], ['兄弟', '兄弟', '姐妹'], ['帅哥', '帅哥', '美女'], ['小伙子', '小伙子', '姑娘']]) {
    assert.equal(term(k, 'm'), m); assert.equal(term(k, 'f'), f);
  }
  assert.equal(say('{帅哥}别跑！', 'm'), '帅哥别跑！'); assert.equal(say('{帅哥}别跑！', 'f'), '美女别跑！');
  assert.equal(say('我{老婆}剪的', 'f'), '我老公剪的');
  assert.equal(say('{没有这个词}', 'f'), '{没有这个词}');
  assert.equal(say('{constructor}', 'f'), '{constructor}', '原型上的键不算');
  assert.equal(say(undefined, 'f'), undefined); assert.equal(say('没有称呼', 'f'), '没有称呼');
  assert.equal(term('不认识', 'f'), '不认识');
  // 当前主角：缺省男主角，随 setAddressGender 换
  const was = addressGender();
  setAddressGender('f'); assert.equal(say('{兄弟}'), '姐妹'); setAddressGender('x'); assert.equal(addressGender(), 'm');
  setAddressGender(was);
});

test('文案：每个 {键} 都在称呼表里；男 / 女主角两套都满足长度（路上台词 ≤14、选项 ≤8；家门口台词 ≤6、选项 ≤4、反应 ≤14）', () => {
  const texts = allTexts();
  assert.ok(texts.length > 150, `文案太少：${texts.length}`);
  for (const [max, s, where] of texts) {
    for (const k of keysIn(s)) assert.ok(Object.prototype.hasOwnProperty.call(ADDRESS, k), `${where}：称呼表里没有 {${k}}`);
    for (const g of ['m', 'f']) assert.ok([...say(s, g)].length <= max, `${where}（${g}）超过 ${max} 字：${say(s, g)}`);
  }
  // 写死男性的词都改走称呼表：文案里不再直接出现（花括号里的键不算）
  const bare = /帅哥|小伙子|兄弟|老婆|侄女|儿子/;
  for (const [, s, where] of texts) assert.ok(!bare.test(s.replace(/\{[^{}]*\}/g, '')), `${where} 还写死了男主角的称呼：${s}`);
  // 用到的称呼确实换了：女主角那一版和男主角不一样
  const used = texts.filter(([, s]) => keysIn(s).length);
  assert.ok(used.length >= 8, `用到称呼的文案 ${used.length} 条`);
  for (const [, s, where] of used) assert.notEqual(say(s, 'm'), say(s, 'f'), where);
  for (const s of ['{帅哥}别跑！办张卡！', '{外卖:兄弟}，顺路捎你？', '谢了{外卖:兄弟}！', '我{老婆}剪的', '我{侄女}跟你差不多大', '{好兄弟}！',
    '{爸爸}你几点回来？', '{兄弟}，几点到家？', '{老婆}在视频里笑了', '{好小子}！', '{乖孙}，带包润喉糖', '超人{爸爸}', '……你是我{亲哥}'])
    assert.ok(texts.some(([, t]) => t === s), `少了 ${s}`);
});

test('借口图鉴和性别无关：键里保留 {称呼}，换主角不丢图鉴；跑一局说过的话照样对得上', () => {
  assert.ok(ALBUM_KEYS.has('wang:多大？'));
  for (const k of ALBUM_KEYS) assert.ok(!/美女|姑娘|老公|侄子/.test(k), k);
  const run = makeRun({ seed: 11 });
  simulate(run, makeBot({ rng: () => 0.3, skill: 1, choose: 'good' }), { update: updateRun });
  assert.ok(run.said.filter(k => ALBUM_KEYS.has(k)).length >= 8);
});

test('存档：gender 缺省 null（还没选），迁移保留选过的；老存档没有 gender 一样是 null（开局先选主角）', () => {
  assert.equal(DEFAULT.gender, null);
  assert.equal(migrate(null).gender, null);
  assert.equal(migrate({ runs: 12, wins: 9, tutorialDone: true }).gender, null, 'v1 老存档');
  assert.equal(migrate({ ver: 2, runs: 3, gender: 'f' }).gender, 'f');
  assert.equal(migrate(migrate({ ver: 2, gender: 'm' })).gender, 'm', '幂等');
});

test('分享卡、好友卡不带性别：好友点开用自己选的主角', () => {
  const q = shareQuery({ seed: 5, win: true, arrivalText: '18:50', daily: false, level: 'mon' });
  assert.ok(!/gender|g=|sex/.test(q), q);
  const f = friendFromQuery({ seed: '5', lv: 'mon', g: 'f', gender: 'f' });
  assert.ok(!('gender' in f) && !('g' in f));
});

test('女主角立绘：和男主角同一套部件（7 块 + 3 个表情头）、同样的头半径，进了打包清单；矢量兜底同一身行头', async () => {
  const M = ART_MANIFEST.chars.player, F = ART_MANIFEST.chars.playerF;
  assert.ok(M && F, '清单里要有 player 和 playerF');
  assert.deepEqual(Object.keys(F.parts).sort(), Object.keys(M.parts).sort());
  assert.deepEqual(Object.keys(F.heads).sort(), ['happy', 'normal', 'panic']);
  assert.deepEqual(Object.keys(M.heads).sort(), Object.keys(F.heads).sort());
  // 画面上的头一样大：表情头的显示高度 = 图集高 × 13 / 部件头半径（马尾占掉左边一块，所以按脸归一，图集里比男主角宽）
  const shown = (c, k) => c.heads[k].sh * 13 / c.parts.head.r;
  for (const k of ['normal', 'panic', 'happy']) assert.ok(Math.abs(shown(F, k) / shown(M, k) - 1) < 0.15, `${k} 头高 男 ${shown(M, k).toFixed(1)} 女 ${shown(F, k).toFixed(1)}`);
  // 骨骼比例：同一身行头，四肢宽度 / 头半径和男主角差不到 25%
  for (const k of ['armU', 'armL', 'legU', 'legL']) {
    const rm = M.parts[k].sw / M.parts.head.r, rf = F.parts[k].sw / F.parts.head.r;
    assert.ok(Math.abs(rf / rm - 1) < 0.25, `${k} 粗细比 男 ${rm.toFixed(2)} 女 ${rf.toFixed(2)}`);
  }
  const spec = JSON.parse(readFileSync(new URL('../art-src/spec.json', import.meta.url), 'utf8'));
  assert.ok(spec.chars.playerF, 'spec.json 里有女主角');
  const { HERO_LOOKS: H } = await import('../js/data/heroes.js');
  for (const k of ['jacket', 'shirt', 'pants', 'shoes', 'bag', 'skin']) assert.equal(H.playerF[k], H.player[k], k);
  assert.equal(H.playerF.hairStyle, 'ponytail');
});

test('换主角不改玩法：同种子同操作，男 / 女主角的结果逐项一样（8 个种子完美机器人 0 碰撞 0 被抓到家）', () => {
  const was = addressGender();
  const runOnce = (seed, g) => {
    setAddressGender(g);
    let r = 0x2545f491 ^ seed; const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const d = simulate(makeRun({ seed, level: seed % 2 ? 'full' : 'mon' }), makeBot({ rng, skill: 1, choose: 'good' }), { update: updateRun });
    return JSON.stringify([d.win, d.arrival, d.score, d.grade, d.meal.name, d.title, d.stats.hits, d.stats.caught]);
  };
  for (const seed of [1, 2, 3, 42, 777, 2026, 31337, 99991]) {
    const m = runOnce(seed, 'm'), f = runOnce(seed, 'f');
    assert.equal(f, m, `种子 ${seed}`);
    const [win, , , , , , hits, caught] = JSON.parse(m);
    assert.ok(win && hits === 0 && caught === 0, `种子 ${seed}：${m}`);
  }
  setAddressGender(was);
});
