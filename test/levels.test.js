// 一周通勤：序章 + 周一到周三。路线（间距、窗口、路口、分支）、机器人（完美 / 每题选错不冲刺 / 走楼梯）、星级、
// 定格教学、追逐槽、带薪摸鱼、死因提示、关卡快照
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subRng, SALT } from '../js/core/rng.js';
import { planCourse, checkSpacing, checkCrossings, checkBranch, slotWindow, courseBlocks } from '../js/game/course.js';
import { makeRun, updateRun, input } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { LV, makeLevel, starsOf, stageBanner, TEACH_KEY } from '../js/game/level.js';
import { LEVELS, LEVEL_ORDER } from '../js/data/levels.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { CHASE, ASSIST } from '../js/data/tune.js';
import { DEATH_TIPS, deathTip } from '../js/data/tips.js';
import { say } from '../js/data/address.js';
import { courseHash, botResult } from '../tools/golden-lib.mjs';

const SEEDS = [1, 2, 3, 42, 777, 2026, 31337, 99991];
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const play = (seed, botOpts, runOpts = {}) => {
  const run = makeRun({ seed, ...runOpts });
  const teach = [];
  const bot = makeBot({ rng: botRng(seed), ...botOpts });
  while (!run.done && run.t < 600) { bot(run); updateRun(run, 1 / 60); for (const e of run.fx) if (e.type === 'teach') teach.push(e.kind); run.fx.length = 0; }
  return { run, res: run.done, teach };
};
const fx = JSON.parse(readFileSync(new URL('./fixtures/routes.json', import.meta.url), 'utf8'));
const inside = (c, a, b) => c.obstacles.filter(o => o.x + OBSTACLES[o.type].w > a && o.x < b);
// 预计实玩（秒）：工程方案的关卡表
const PLAY_T = { prologue: 43, mon: 75, tue: 88, wed: 100 };

test('四关数据：顺序、起终点、妈妈槽在终点前 1000、来电槽都是家里来电、每关定格教学 ≤3、关卡写死种子', () => {
  assert.deepEqual(LEVEL_ORDER, ['prologue', 'mon', 'tue', 'wed']);
  for (const id of LEVEL_ORDER) {
    const d = LEVELS[id];
    assert.equal(d.id, id);
    assert.ok(d.seed != null, `${id} 没写死种子`);
    assert.ok(d.teach.length <= 3, `${id} 定格教学 ${d.teach.length} 个`);
    assert.ok(d.teach.every(k => TEACH_KEY[k]), `${id} 不认识的教学`);
    assert.equal(d.slots.find(s => s.kind === 'mom').x, d.end - 1000, `${id} 妈妈槽`);
    for (const s of d.slots.filter(s => s.kind === 'call')) assert.equal(s.caller, 'mom', `${id} ${s.x} 来电`);
    assert.ok(d.story && d.story.key, `${id} 家庭剧本的 story.key`);
    assert.equal(d.stars.length, 3);
    assert.ok(d.par.star >= 0 && d.par.home && d.par.home.late > d.par.home.promise, `${id} par`);   // ★2 线 ≥ 标准（周三 +0：准点就算）
  }
  assert.equal(LEVELS.prologue.rules.chase, false);
  assert.ok(LEVELS.mon.slots.some(s => s.kind === 'chase' && s.npc === 'tony'));
  assert.ok(LEVELS.tue.slots.some(s => s.kind === 'chase' && s.hold === 'door') && LEVELS.tue.branch);
  assert.equal(LEVELS.wed.crossings.length, 4);
});

test('路线：每关（写死的种子 + 3 个别的种子）间距表成立，读题窗口、路口窗口、分支区里没有障碍，路口和分支的位置检查都过', () => {
  for (const id of LEVEL_ORDER) {
    const lv = LV(id);
    for (const seed of [lv.def.seed, 1, 2, 3]) {
      const c = planCourse(subRng(seed, SALT.course), { level: lv, seed }), tag = `${id} 种子 ${seed}`;
      assert.deepEqual(checkSpacing(c.obstacles), [], tag);
      for (const [a, b] of courseBlocks(lv)) assert.equal(inside(c, a, b).length, 0, `${tag} 区间 ${Math.round(a)}–${Math.round(b)}`);
      assert.deepEqual(checkCrossings(c, lv), [], tag);
      assert.deepEqual(checkBranch(c, lv), [], tag);
      assert.ok(c.obstacles.every(o => o.x >= lv.x0 && o.x + OBSTACLES[o.type].w <= lv.end - 260), `${tag} 障碍出了路线`);
      for (const f of lv.def.fixed) assert.ok(c.obstacles.some(o => o.fixed && o.type === f.type && o.x === f.x), `${tag} 手写的 ${f.type}@${f.x}`);
    }
  }
  // 序章只出静止的障碍：没有移动障碍、井、违停车、水坑
  const c = planCourse(subRng(LEVELS.prologue.seed, SALT.course), { level: 'prologue', seed: LEVELS.prologue.seed });
  assert.ok(c.obstacles.every(o => !OBSTACLES[o.type].vx && !OBSTACLES[o.type].hole && !OBSTACLES[o.type].light && o.type !== 'cardoor'));
});

test('完美机器人：每关 8 个种子 0 碰撞到家，★1 ★2 都亮；冲刺开着时 ★3 也亮（周二楼梯路没有 ★3）；真实用时在预计实玩 ±15% 里；周二两条路都跑', () => {
  for (const id of LEVEL_ORDER) for (const route of id === 'tue' ? ['lift', 'stairs'] : ['lift']) for (const seed of SEEDS) {
    const { run, res } = play(seed, { skill: 1, choose: 'good', route }, { level: id }), tag = `${id}/${route} 种子 ${seed}`;
    assert.ok(res && res.win, `${tag}：${res && res.reason}`);
    assert.equal(res.stats.hits, 0, `${tag} 撞了`);
    assert.equal(res.stats.caught, 0, `${tag} 被抓`);
    // ★3 周二是「电梯门夹住追兵」：楼梯路拿不到（星级那条测试也断言了）
    assert.deepEqual(res.stars, route === 'stairs' ? [true, true, false] : [true, true, true], `${tag} 星级 ${res.stars}`);
    if (id === 'tue') assert.equal(res.route, route);
    assert.ok(Math.abs(run.t - PLAY_T[id]) <= PLAY_T[id] * 0.15, `${tag} 用了 ${run.t.toFixed(1)} 秒`);
    assert.equal(res.level, id);
  }
});

test('带薪摸鱼的完美机器人：每关 8 个种子（周二两条路）0 碰撞、0 被抓、到家，最多两星', () => {
  for (const id of LEVEL_ORDER) for (const route of id === 'tue' ? ['lift', 'stairs'] : ['lift']) for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'good', route }, { level: id, assist: true }), tag = `${id}/${route} 摸鱼 种子 ${seed}`;
    assert.ok(res && res.win, `${tag}：${res && res.reason}`);
    assert.equal(res.assist, true, tag);
    assert.equal(res.stats.hits, 0, `${tag} 撞了`);
    assert.equal(res.stats.caught, 0, `${tag} 被抓`);
    assert.deepEqual(res.stars, [true, true, false], `${tag} 星级 ${res.stars}`);
  }
});

test('铁律：每关「每题选错、从不冲刺」的完美机器人到家、0 碰撞、0 被抓（周二两条路都跑）；序章答错不追、不会失败', () => {
  for (const id of LEVEL_ORDER) for (const route of id === 'tue' ? ['lift', 'stairs'] : ['lift']) for (const seed of SEEDS) {
    const { res } = play(seed, { skill: 1, choose: 'bad', dash: false, route }, { level: id }), tag = `${id}/${route} 种子 ${seed}`;
    assert.ok(res && res.win, `${tag}：${res && res.reason}`);
    assert.equal(res.stats.hits, 0, `${tag} 撞了`);
    assert.equal(res.stats.caught, 0, `${tag} 被抓`);
    if (id === 'prologue') { assert.equal(res.stats.chased, 0); assert.ok(res.stats.bad >= 1); }   // 序章门口「第一天咋样？」两个都是好回答：只有路上的人能答坏
  }
  // 序章：手残机器人也一定到家
  for (const seed of SEEDS) assert.ok(play(seed, { skill: 0.3, choose: 'random', think: 1.6 }, { level: 'prologue' }).res.win);
});

test('星级：周二走楼梯 ★3 不亮（门夹追兵只在电梯路）；从不冲刺 ★3 不亮；周三从不冲刺等了灯 ★3 不亮', () => {
  for (const seed of SEEDS.slice(0, 4)) {
    assert.equal(play(seed, { skill: 1, choose: 'good', route: 'stairs' }, { level: 'tue' }).res.stars[2], false);
    const nd = play(seed, { skill: 1, choose: 'good', dash: false }, { level: 'tue' }).res;
    assert.equal(nd.stats.doorShut, 0); assert.equal(nd.stars[2], false);
    const w = play(seed, { skill: 1, choose: 'good', dash: false }, { level: 'wed' }).res;
    assert.ok(w.stats.crossWaits > 0); assert.equal(w.stars[2], false);
  }
  // 判定本身：没到家一颗都不亮；★2 看取整分钟和碎饭盒；带薪摸鱼 ★3 不亮
  const lv = LV('prologue'), base = { win: true, arrival: 1130.9, par: 1128, broken: 0, stats: { hits: 0 } };
  assert.deepEqual(starsOf(lv, base), [true, true, true]);
  assert.deepEqual(starsOf(lv, { ...base, arrival: 1131.0 }), [true, true, true]);
  assert.deepEqual(starsOf(lv, { ...base, arrival: 1132.0 }), [true, false, true]);
  assert.deepEqual(starsOf(lv, { ...base, broken: 2 }), [true, false, true]);
  assert.deepEqual(starsOf(lv, { ...base, stats: { hits: 1 } }), [true, true, false]);
  assert.deepEqual(starsOf(lv, base, { assist: true }), [true, true, false]);
  assert.deepEqual(starsOf(lv, { ...base, win: false }), [false, false, false]);
  assert.equal(starsOf(LV('full'), base), null);
});

test('定格教学：序章第一题等你选、跳、滑；周二第一次被追定格冲刺、电梯里第一拍外卖等你关门；周三第一个闪绿路口定格。学过的不再定格', () => {
  const pro = play(3, { skill: 1, choose: 'good' }, { level: 'prologue' });
  assert.deepEqual(pro.teach, []);                        // 序章的跳 / 滑用障碍上的 teach，第一题是 hold（不发 teach 事件）
  const tue = play(3, { skill: 1, choose: 'good' }, { level: 'tue' });
  assert.deepEqual(tue.teach, ['dash', 'lift']);
  assert.ok(tue.run.taught.has('dash') && tue.run.taught.has('lift'));
  assert.equal(tue.res.stats.liftClose, 1, '教关门那一拍关上了');
  assert.deepEqual(play(3, { skill: 1, choose: 'good' }, { level: 'wed' }).teach, ['crossdash']);
  // 学过了：不再定格（冲刺、关门、过路口、序章的跳滑选）
  assert.deepEqual(play(3, { skill: 1, choose: 'good' }, { level: 'tue', learned: ['dash', 'lift'] }).teach, []);
  assert.deepEqual(play(3, { skill: 1, choose: 'good' }, { level: 'wed', learned: ['cross'] }).teach, []);
  // 序章：一步一步看定格（不用机器人）
  const run = makeRun({ seed: 3, level: 'prologue' });
  const step = (cond, maxT = 60) => { while (!run.done && run.t < maxT && !cond(run)) { updateRun(run, 1 / 60); run.fx.length = 0; } };
  step(r => r.choice && r.choice.phase === 'open');
  assert.equal(run.choice.hold, true, '第一题等你选');
  const t0 = run.t; step(r => r.t > t0 + 3);
  assert.equal(run.choice.phase, 'open', '不选就一直等'); assert.equal(run.stats.stopT, 0, '等你选不算世界停住');
  input(run, 'left');
  step(r => !!r.teach);
  assert.equal(run.teach.kind, 'jump');
  input(run, 'jump');
  step(r => !!r.teach);
  assert.equal(run.teach.kind, 'slide');
  const learned = makeRun({ seed: 3, level: 'prologue', learned: ['jump', 'slide', 'choose'] });
  while (!learned.done && learned.t < 10 && !(learned.choice && learned.choice.phase === 'open')) { updateRun(learned, 1 / 60); learned.fx.length = 0; }
  assert.equal(learned.choice.hold, false, '学过了：第一题不等');
});

test('冲刺提示每关只教一样：新存档的周一被追只出「被追」不提冲刺（死因 / ★2 提示也不提）；周二由定格教；全程关软版本、学过冲刺、周三照常提示', () => {
  const tipsOf = (seed, runOpts, botOpts = {}) => {
    const run = makeRun({ seed, seenTips: [], ...runOpts }), bot = makeBot({ rng: botRng(seed), skill: 1, choose: 'good', ...botOpts });
    const keys = [];
    while (!run.done && run.t < 600) { bot(run); updateRun(run, 1 / 60); for (const e of run.fx) if (e.type === 'tip') keys.push(e.key); run.fx.length = 0; }
    return { keys, run, res: run.done };
  };
  for (const seed of SEEDS) {
    for (const learned of [[], ['jump', 'slide', 'choose'], ['jump', 'slide', 'choose', 'chase', 'cardoor']]) {
      const { keys, run } = tipsOf(seed, { level: 'mon', learned });
      assert.ok(run.stats.chased >= 1, `周一种子 ${seed} 没被追`);
      assert.ok(!keys.includes('dash') && !run.tips.has('dash'), `周一种子 ${seed} learned=${learned}：提了冲刺 ${keys}`);
    }
  }
  // 周一每题选错、从不冲刺被逮或没拿 ★2：结算页的一句也不提冲刺
  for (const seed of SEEDS) {
    const { res } = tipsOf(seed, { level: 'mon' }, { choose: 'bad', dash: false });
    assert.ok(!/冲刺/.test(res.tip || ''), `周一种子 ${seed}：${res.tip}`);
  }
  // 周二：定格教冲刺，同一件事的提示条算看过、不再弹
  const tue = tipsOf(3, { level: 'tue' });
  assert.ok(tue.run.taught.has('dash') && tue.run.tips.has('dash') && !tue.keys.includes('dash'));
  // 全程关（软版本）、学过冲刺的周一、周三：第一次被追照常提示
  for (const [opts, tag] of [[{ level: 'full' }, '全程关'], [{ level: 'mon', learned: ['dash'] }, '学过冲刺的周一'], [{ level: 'wed' }, '周三']]) {
    let shown = false;
    for (const seed of SEEDS) {
      const { keys, run } = tipsOf(seed, opts, { choose: 'bad' });
      if (run.stats.chased && keys.includes('dash')) { shown = true; break; }
    }
    assert.ok(shown, `${tag}：被追时没提冲刺`);
  }
});

test('定格教学不算世界停住：周二完美机器人坐电梯，世界停住 = 轿厢里的时间', () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { res } = play(seed, { skill: 1, choose: 'good' }, { level: 'tue' });
    assert.ok(Math.abs(res.stats.stopT - res.stats.stopMax.room) < 1 / 30, `种子 ${seed}：停 ${res.stats.stopT} 轿厢 ${res.stats.stopMax.room}`);
  }
});

test('追逐槽：追兵冲出来直接追、头顶喊一句；已经在被追就换人（不当场被逮）；hold: door 到电梯门前甩不掉，过了门照常甩开', () => {
  // 周一 12000：Tony
  const run = makeRun({ seed: 2, level: 'mon' }), bot = makeBot({ rng: botRng(2), skill: 1, choose: 'good' });
  while (!run.done && !(run.chaser && run.chaser.npc === 'tony')) { bot(run); updateRun(run, 1 / 60); run.fx.length = 0; }
  assert.equal(run.chaser.line, '{帅哥}别跑！办张卡！');           // 称呼画字时才换（男 / 女主角各一套，见 test/address.test.js）
  assert.equal(say(run.chaser.line, 'm'), '帅哥别跑！办张卡！'); assert.equal(say(run.chaser.line, 'f'), '美女别跑！办张卡！');
  assert.ok(run.x >= 12000 && run.x < 12100);
  // 已经在被追：换人追
  const r2 = makeRun({ seed: 2, level: 'mon' }), b2 = makeBot({ rng: botRng(2), skill: 1, choose: 'good', dash: false });
  while (!r2.done && r2.x < 11900) { b2(r2); updateRun(r2, 1 / 60); r2.fx.length = 0; }
  r2.chaser = { npc: 'amy', gap: 30, phase: 'shake', t: 0 };
  while (!r2.done && r2.x < 12010) { b2(r2); updateRun(r2, 1 / 60); r2.fx.length = 0; }
  assert.equal(r2.chaser.npc, 'tony'); assert.equal(r2.stats.caught, 0);
  assert.ok(r2.chaser.gap > CHASE.gap0 - 10);
  // 周二 4700：老刘跑到电梯门前都甩不掉（走楼梯，不冲刺）
  const r3 = makeRun({ seed: 1, level: 'tue', learned: ['dash'] }), b3 = makeBot({ rng: botRng(1), skill: 1, choose: 'good', dash: false, route: 'stairs' });
  let maxGap = 0, esc = null;
  while (!r3.done && r3.x < 8500) {
    b3(r3); updateRun(r3, 1 / 60);
    if (r3.chaser && r3.chaser.npc === 'laoliu' && r3.x < 6450) maxGap = Math.max(maxGap, r3.chaser.gap);
    for (const e of r3.fx) if (e.type === 'escape' && e.npc === 'laoliu' && esc == null) esc = r3.x;
    r3.fx.length = 0;
  }
  assert.ok(maxGap <= CHASE.escape - 1 + 1e-6, `门前甩开了：${maxGap}`);
  assert.ok(esc != null && esc >= 6450 && esc < 6450 + (CHASE.shakeT + 0.2) * 260, `过了门才照常甩开（最多再追一个甩开期）：${esc}`);
  assert.equal(r3.stats.caught, 0);
});

test('带薪摸鱼：障碍是平时的 80%–90%，读题窗口按 +0.3 秒排也没障碍，读题时间 +0.3 秒，最多两星；全程关没有', () => {
  for (const id of LEVEL_ORDER) {
    const a = makeRun({ seed: 1, level: id }), b = makeRun({ seed: 1, level: id, assist: true });
    const k = b.course.obstacles.length / a.course.obstacles.length;
    assert.ok(k >= 0.8 && k <= 0.9, `${id} 障碍 ${b.course.obstacles.length}/${a.course.obstacles.length}`);
    assert.ok(b.assist && b.readPlus === ASSIST.readPlus);
    for (const [x0, x1] of courseBlocks(LV(id), { readPlus: ASSIST.readPlus })) assert.equal(inside(b.course, x0, x1).length, 0, `${id} 区间 ${Math.round(x0)}`);
    assert.deepEqual(checkSpacing(b.course.obstacles), []);
    for (const f of LV(id).def.fixed) assert.ok(b.course.obstacles.some(o => o.fixed && o.x === f.x), '手写障碍不删');
    const { res, run } = play(2, { skill: 1, choose: 'good' }, { level: id, assist: true });
    assert.ok(res.win); assert.equal(res.assist, true);
    assert.ok(res.stars.filter(Boolean).length <= ASSIST.maxStars);
    void run;
  }
  // 读题时间 +0.3 秒
  const seen = assist => { const r = makeRun({ seed: 4, level: 'mon', assist }); const bot = makeBot({ rng: botRng(4), skill: 1, choose: 'good' }); while (!r.done && !(r.choice && r.choice.kind === 'npc' && r.stats.choices >= 1)) { bot(r); updateRun(r, 1 / 60); r.fx.length = 0; } return r.choice.T; };
  assert.ok(Math.abs(seen(true) - seen(false) - ASSIST.readPlus) < 1e-9);
  assert.equal(makeRun({ seed: 1, assist: true }).assist, false, '全程关没有带薪摸鱼');
});

test('死因提示：按顺序取第一条；关卡没拿 ★3 用关卡自己的一句；每条 ≤14 字', () => {
  for (const t of DEATH_TIPS) if (t.text) assert.ok([...t.text].length <= 14, t.text);
  for (const id of LEVEL_ORDER) assert.ok([...LEVELS[id].tip3].length <= 14, LEVELS[id].tip3);
  const lv = LV('mon'), S = o => ({ hitsChased: 0, dashChased: 0, lastBad: null, ...o });
  const caught = (npc, stats) => ({ win: false, reason: 'caught', npc, stats: S(stats) });
  assert.equal(deathTip(caught('zhou', { hitsChased: 3 }), lv), '老周心软：说辛苦就放你过');
  assert.equal(deathTip(caught('tony', { hitsChased: 1 }), lv), '被追时别撞东西，一撞就被拉近');
  assert.equal(deathTip(caught('tony', {}), lv, new Set(['dash'])), '被追时右滑冲刺，能多甩开一截');
  assert.equal(deathTip(caught('tony', { lastBad: 'grudge' }), lv), '记仇的人回来了：换个借口');
  assert.equal(deathTip(caught('tony', { lastBad: 'tired' }), lv), '同一类借口第 3 次就不灵了');
  assert.equal(deathTip(caught('tony', { dashChased: 2 }), lv, new Set(['dash'])), '干净地跑，一定甩得掉');
  assert.equal(deathTip({ win: false, reason: 'starve', stats: S() }, lv), '饿了就跳起来吃路边的包子', '周一没有便利店：不提便利店');
  assert.equal(deathTip({ win: false, reason: 'starve', stats: S() }, LV('tue')), '饿了就跳起来吃路边的包子', '周二也没有');
  assert.equal(deathTip({ win: false, reason: 'starve', stats: S() }, LV('wed')), '饿了进便利店，或跳起来吃包子');
  assert.equal(deathTip({ win: false, reason: 'starve', stats: S() }, LV('full')), '饿了进便利店，或跳起来吃包子');
  assert.equal(deathTip({ win: true, stars: [true, false, true], broken: 0, stats: S({ hits: 1 }) }, lv), '撞一下耽误两秒，看清再跳');
  // 0 碰撞没拿 ★2：不说「看清再跳」，按真正的原因给（闪绿没冲 > 被追（会冲刺才提）> 本关 tip3）
  const miss = (stats, known) => deathTip({ win: true, stars: [true, false, false], broken: 0, stats: S({ hits: 0, crossWaits: 0, crossLog: [], chased: 0, caught: 0, ...stats }) }, lv, known);
  assert.equal(miss({ crossWaits: 2, crossLog: [{ light: 'flash', result: 'miss' }, { light: 'flash', result: 'wait' }] }), '闪绿灯时右滑，冲过斑马线');
  assert.equal(miss({ crossWaits: 1, crossLog: [{ light: 'red', result: 'wait' }] }), LEVELS.mon.tip3, '红灯躲不开，不提示闪绿');
  assert.equal(miss({ chased: 1 }, new Set(['dash'])), '被追时右滑冲刺，能多甩开一截');
  assert.equal(miss({ chased: 2, caught: 1 }, new Set(['dash'])), '被追时右滑冲刺，能多甩开一截');
  assert.equal(miss({ chased: 1 }), LEVELS.mon.tip3, '还没学冲刺：用本关的一句');
  assert.equal(miss({}), LEVELS.mon.tip3);
  assert.equal(deathTip({ win: true, stars: [true, false, false], broken: 2, stats: S({ hits: 0, caught: 2, chased: 2, crossLog: [] }) }, lv), LEVELS.mon.tip3, '碎饭盒但没撞：不说别撞');
  assert.equal(deathTip({ win: true, stars: [true, false, false], broken: 2, stats: S({ hits: 2, hitsChased: 2, caught: 2 }) }, lv), '饭盒碎了两个：被追时别乱撞');
  const tipText = id => DEATH_TIPS.find(t => t.id === id).text;
  assert.notEqual(tipText('boxes'), tipText('hitChased'), '碎饭盒和被追时撞东西是两句话');
  for (const t of DEATH_TIPS.filter(t => t.id === 'ontime' || t.id === 'boxes')) assert.equal(t.test({ win: true, stars: [true, false, true], broken: 3, stats: S({ hits: 0 }) }, new Set()), false, `${t.id}：0 碰撞不提「撞」`);
  assert.equal(deathTip({ win: true, stars: [true, true, false], broken: 0, stats: S() }, lv), LEVELS.mon.tip3);
  assert.equal(deathTip({ win: true, stars: [true, true, false], broken: 0, assist: true, stats: S() }, lv), '');
  assert.equal(deathTip({ win: true, stars: [true, true, true], broken: 0, stats: S() }, lv), '');
  // 一局真的跑出来的结果带着提示
  const { res } = play(1, { skill: 1, choose: 'good', dash: false }, { level: 'tue' });
  assert.equal(res.tip, LEVELS.tue.tip3);
  // 周三不冲刺的机器人：0 碰撞、等了灯、没拿 ★2 的局，提示是闪绿右滑，不是「看清再跳」
  let n = 0;
  for (let seed = 1; seed <= 24 && n < 2; seed++) {
    const w = play(seed, { skill: 1, choose: 'smart', dash: false, errand: 'skip' }, { level: 'wed' }).res;   // 不给奶奶带糖：饿了照常进店买吃的（+3 分钟）
    if (!w.win || w.stars[1] || w.stats.hits) continue;
    n++;
    assert.ok(w.stats.crossWaits > 0);
    assert.equal(w.tip, '闪绿灯时右滑，冲过斑马线', `种子 ${seed}`);
  }
  assert.ok(n > 0, '没跑出 0 碰撞没拿 ★2 的周三局');
});

test('路段字卡：小路段（楼梯间）不弹，别的照常', () => {
  assert.equal(stageBanner(LV('tue'), 'stairs'), false);
  assert.equal(stageBanner(LV('full'), 'stairs'), false);
  for (const id of ['office', 'street', 'park', 'home']) assert.equal(stageBanner(LV('full'), id), true);
});

test('关卡快照：每关的路、带薪摸鱼的路、完美机器人的结果和 test/fixtures/routes.json 一致（改了关卡要升 COURSE_VERSION 再 --write）', () => {
  assert.ok(fx.levels && Object.keys(fx.levels).length === LEVEL_ORDER.length * 3, '快照里没有关卡：node tools/golden.mjs --write');
  for (const id of LEVEL_ORDER) {
    assert.equal(courseHash(makeRun({ seed: 1, level: id }).course), fx.levels[id], id);
    assert.equal(courseHash(makeRun({ seed: 99, level: id }).course), fx.levels[id], `${id}：关卡写死了种子，换一局的种子路不变`);
    assert.equal(courseHash(makeRun({ seed: 1, level: id, assist: true }).course), fx.levels[`${id}|assist`], `${id} 带薪摸鱼`);
    assert.deepEqual(botResult(1, 'perfect', { level: id }), fx.levels[`${id}|perfect`], `${id} 完美机器人`);
  }
});

test('B 阶段遗留：手写障碍落在随机段里面时，随机段前后都避让（间距表成立、手写的位置不变）', () => {
  const def = {
    id: 't-fixed', name: '测试手写障碍', x0: 0, end: 16000,
    stages: [{ id: 'office', name: '公司', x0: 0, x1: 3000 }, { id: 'street', name: '街道', x0: 3000, x1: 13000 }, { id: 'home', name: '回家', x0: 13000, x1: 16000 }],
    slots: [{ x: 420, kind: 'npc', fixed: 'laoliu' }, { x: 15000, kind: 'mom' }],
    fixed: [{ type: 'filebox', x: 1700 }, { type: 'banner', x: 2350 }, { type: 'cardoor', x: 4300 }, { type: 'step', x: 6000 }, { type: 'cone', x: 6400 }, { type: 'scaffold', x: 9100 }, { type: 'parcel', x: 14200 }],
    gen: [{ x0: 900 }],
  };
  const lv = makeLevel(def);
  for (let seed = 1; seed <= 30; seed++) {
    const c = planCourse(subRng(seed, SALT.course), { level: lv, seed });
    assert.deepEqual(checkSpacing(c.obstacles), [], `种子 ${seed}`);
    for (const f of def.fixed) assert.equal(c.obstacles.filter(o => o.fixed && o.x === f.x && o.type === f.type).length, 1, `种子 ${seed} ${f.type}`);
    assert.ok(c.obstacles.filter(o => !o.fixed).length > 20);
  }
  void slotWindow;
});
