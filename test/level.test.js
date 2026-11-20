import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng, subRng, SALT } from '../js/core/rng.js';
import { planCourse, carve, checkSpacing, slotWindow, stageAt, choiceTime, courseBlocks, crossWindow, branchSpan } from '../js/game/course.js';
import { makeRun, updateRun, gradeOf, mealTier, clockMin } from '../js/game/run.js';
import { makeBot, simulate } from '../js/game/bot.js';
import { FULL, LV, makeLevel, toLevel } from '../js/game/level.js';
import { parOf } from '../js/game/par.js';
import { story, etaMin } from '../js/game/story.js';
import { shareQuery, friendFromQuery } from '../js/game/share.js';
import { COURSE_VERSION, LEVELS, LEVEL_ORDER, levelOf } from '../js/data/levels.js';
import { COURSE, RES, PAR } from '../js/data/tune.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { SEEDS, courseHash, routeHash, botResult, BOTS } from '../tools/golden-lib.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/routes.json', import.meta.url), 'utf8'));
const botRng = seed => { let r = 0x2545f491 ^ seed; return () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; }; };
const play = (seed, botOpts, runOpts = {}) => {
  const run = makeRun({ seed, ...runOpts });
  return { run, res: simulate(run, makeBot({ rng: botRng(seed), ...botOpts }), { update: updateRun }) };
};

// 测试用的两条短路线（不是正式关卡，正式的序章 / 周一到周三另做）：验证关卡数据结构、x0 起跑、小路段、时钟缩放
const SHORT = {
  id: 't-short', name: '测试短关', x0: 0, end: 18800, seed: 102,
  stages: [{ id: 'office', name: '公司', x0: 0, x1: 3000 }, { id: 'street', name: '街道', x0: 3000, x1: 16000 }, { id: 'home', name: '回家', x0: 16000, x1: 18800 }],
  slots: [
    { x: 420, kind: 'npc', fixed: 'laoliu' }, { x: 2200, kind: 'npc' }, { x: 5000, kind: 'npc' }, { x: 7600, kind: 'call', caller: 'mom' },
    { x: 10200, kind: 'npc' }, { x: 12000, kind: 'chase', npc: 'tony', line: '帅哥别跑！办张卡！' }, { x: 15000, kind: 'npc' }, { x: 17800, kind: 'mom' },
  ],
  gen: [{ x0: 900 }],
  par: { slack: 0.8, grade: [3, 11, 23], meal: [3, 13, 26], target: 11, home: { late: 21 } },
  story: { key: 'parents.mon' },
};
const LATE = {
  id: 't-late', name: '测试中途起跑', x0: 6000, end: 24600,
  stages: [
    { id: 'office', name: '公司', x0: 6000, x1: 8000 },
    { id: 'stairs', name: '楼梯间', x0: 8000, x1: 9200, theme: 'office', slowK: 0.75, gate: false, minor: true },
    { id: 'street', name: '街道', x0: 9200, x1: 22000 }, { id: 'home', name: '回家', x0: 22000, x1: 24600 },
  ],
  slots: [
    { x: 6420, kind: 'npc', fixed: 'laoliu' }, { x: 7800, kind: 'route', branch: 'lift' }, { x: 10700, kind: 'call' },
    { x: 13000, kind: 'npc' }, { x: 16000, kind: 'store' }, { x: 19000, kind: 'npc' }, { x: 23600, kind: 'mom' },
  ],
  fixed: [{ type: 'filebox', x: 7050 }],
  gen: [{ x0: 7250, x1: 12500, densityK: 1.6 }, { x0: 12900 }],
  par: { slack: 1, grade: [3, 11, 23], meal: [3, 13, 26], target: 11, home: { late: 21 } },
};

test('路线快照：同种子的路和快照一致；改了路线必须同时改 COURSE_VERSION', () => {
  assert.equal(fx.cv, COURSE_VERSION, '路线变了但版本号没跟着改（或反过来）：node tools/golden.mjs --write');
  for (const seed of SEEDS) {
    assert.equal(routeHash(seed), fx.full[seed], `种子 ${seed}`);
    assert.equal(routeHash(seed, { tutorial: true }), fx.tutorial[seed], `种子 ${seed} 新手局`);
    // 直接排路和开局排的是同一条
    assert.equal(courseHash(planCourse(subRng(seed, SALT.course), { level: FULL, seed })), fx.full[seed]);
    assert.equal(courseHash(planCourse(subRng(seed, SALT.course), { level: 'full', seed, tutorial: true })), fx.tutorial[seed]);
  }
  assert.deepEqual(COURSE.slots.map(s => slotWindow(s).map(v => Number(v.toFixed(4)))), fx.windows, '读题窗口和改造前一样');
});

test('行为快照：几种机器人的到家时刻、得分、评级、晚饭、称号和关卡数据化之前完全一样', () => {
  for (const seed of SEEDS) for (const b of Object.keys(BOTS)) assert.deepEqual(botResult(seed, b), fx.bot[`${b}|${seed}`], `${b} 种子 ${seed}`);
  for (const seed of [1, 2, 3, 4]) assert.deepEqual(botResult(seed, 'perfect', { daily: true }), fx.bot[`daily|${seed}`], `今日挑战 ${seed}`);
  for (const seed of [5, 6]) assert.deepEqual(botResult(seed, 'perfect', { tutorial: true }), fx.bot[`tutorial|${seed}`], `新手局 ${seed}`);
});

test('本路线标准时间：全程关 18:49（纯跑 186.4 秒 × 15 倍速 + 2.5 分钟余量；路口全绿时）', () => {
  for (const seed of SEEDS) {
    assert.equal(makeRun({ seed }).par.min, parOf(makeRun({ seed }).course, FULL).min);
    const run = makeRun({ seed, xlight: 'green' });
    assert.equal(run.par.min, 18 * 60 + 49);
    assert.ok(run.par.raw > 1128.6 && run.par.raw < 1129.4, `raw ${run.par.raw}`);
    assert.equal(run.par.min, parOf(run.course, run.lv).min);
  }
  assert.equal(FULL.clockRate, RES.clockRate);
  assert.equal(FULL.clockK, 1);
  // 全程关是缩放的基准：按标准时长自动算出来的倍率也是 15（楼梯间跑速 ×0.75，纯跑比没有楼梯间时多 1.3 秒，差 0.1 倍以内）
  assert.ok(Math.abs((PAR.refMin * 60) / FULL.pureT - 15) < 0.15);
});

test('评级、晚饭、计分目标：相对标准时间的整数分钟，和旧的绝对线逐分钟一致', () => {
  const run = makeRun({ seed: 1 });
  const g = a => gradeOf(run, Math.floor(a), 0);
  assert.equal(g(1132.9), 'S'); assert.equal(g(1133.0), 'A');
  assert.equal(g(1140.9), 'A'); assert.equal(g(1141), 'B');
  assert.equal(g(1152.99), 'B'); assert.equal(g(1153), 'C');
  assert.equal(gradeOf(run, 1130, 1), 'A');          // 碎了一个：不能 S
  assert.equal(gradeOf(run, 1130, 2), 'B');
  const m = am => mealTier(run, am);
  assert.deepEqual([1132, 1133, 1142, 1143, 1155, 1156].map(m), [3, 2, 2, 1, 1, 0]);   // 18:52 / 19:02 / 19:15
  assert.equal(run.par.min + run.lv.def.par.target, 19 * 60);                         // 早到加分以 19:00 为界
});

test('门口终题（家庭剧本 · 爸妈家平常日）：生气 > 失约 > 外卖 > 晚到 > 饿 > 早到 > 弱情况，按预计到家时刻，不碰随机数', () => {
  const run = makeRun({ seed: 3, xlight: 'green' });             // 路口全绿：标准时间 18:49
  const s0 = run.rng.state, H = run.lv.def.par.home, P = run.par.min;
  const at = eta => story.door(run, eta - etaMin(run, 0));       // 传给 story.door 的是此刻的时钟：换算成「预计到家时刻 = eta」
  assert.deepEqual([H.early, H.promise, H.late], [0, 7, 11]);
  assert.equal(at(P + 3).key, 'normal');                         // 不早不晚、没进店没蹭车：弱情况只剩「洗手了没？」
  assert.equal(at(P + H.late + 0.01).key, 'late');
  assert.equal(at(P + H.late).key, 'normal');
  assert.equal(at(P + H.early).key, 'early');
  run.sat = 10; assert.equal(at(P + 3).key, 'hungry'); assert.equal(at(P + 3).who, 'dad'); run.sat = 60;
  run.flags.momHappy = true; assert.equal(at(P + H.promise + 0.01).key, 'promise'); assert.equal(at(P + H.promise).key, 'normal');
  run.flags.takeout = true; assert.equal(at(P + 3).key, 'takeout'); assert.equal(at(P + 30).key, 'promise');
  run.flags.momAngry = true; assert.equal(at(P + 30).key, 'angry');
  assert.equal(run.rng.state, s0);
  assert.equal(at(P + 30).who, 'mom');
});

test('晚饭的剧本加减：一局只调一次（在 finish 里）', () => {
  const orig = story.mealAdjust;
  let n = 0;
  story.mealAdjust = (r, t) => { n++; return t; };
  try { const { res } = play(2, { skill: 1, choose: 'good' }); assert.ok(res.win); } finally { story.mealAdjust = orig; }
  assert.equal(n, 1);
});

test('兼容：旧签名不传关卡 = 全程关', () => {
  assert.equal(stageAt(30000).id, 'street');
  assert.equal(stageAt(30000, FULL), FULL.stageAt(30000));
  assert.equal(choiceTime(20000), FULL.choiceTime(20000));
  assert.deepEqual(courseBlocks(), [...COURSE.slots.map(s => slotWindow(s)), ...LEVELS.full.crossings.map(crossWindow), branchSpan(LEVELS.full.branch)]);
  assert.equal(levelOf('没有这关'), LEVELS.full);
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(levelOf(k), LEVELS.full, `levelOf('${k}')`);   // 原型上的键不能当成关卡
  assert.equal(levelOf(null), LEVELS.full); assert.equal(levelOf(undefined), LEVELS.full);
  assert.equal(LV('full'), FULL);
  assert.equal(toLevel(null), FULL);
  assert.equal(toLevel(3), FULL);                     // [].map(slotWindow) 会把下标当第二个参数传进来
  const r = makeRun({ seed: 9 });
  assert.equal(r.level, 'full'); assert.equal(r.x, 0); assert.equal(r.stage, COURSE.stages[0]);
  assert.equal(r.intro, 1.1); assert.equal(r.introTotal, 1.1);
  // 天色按位置插值
  assert.equal(FULL.duskAt(0), 0.02); assert.ok(Math.abs(FULL.duskAt(FULL.end) - 0.72) < 1e-9);
});

test('分享卡：带关卡和路线版本；老卡按全程关、版本 1；版本比本地旧时标出「仅供参考」；带薪摸鱼局带 a=1', () => {
  const q = shareQuery({ seed: 5, win: true, arrivalText: '18:50', daily: false, level: 'full' });
  assert.ok(q.includes('lv=full') && q.includes(`cv=${COURSE_VERSION}`), q);
  const f = friendFromQuery({ seed: '5' });
  assert.equal(f.seed, 5); assert.equal(f.level, 'full'); assert.equal(f.cv, 1); assert.equal(f.stale, COURSE_VERSION > 1);
  const old = friendFromQuery({ seed: '5', cv: String(COURSE_VERSION - 1) });
  assert.equal(old.stale, true);
  assert.equal(friendFromQuery({ seed: '5', cv: String(COURSE_VERSION), lv: 'full' }).stale, false);
  assert.equal(friendFromQuery({ seed: '7', d: '1' }, 7).daily, true);
  assert.equal(friendFromQuery({ seed: '7', d: '1' }, 8).daily, false);
  assert.equal(friendFromQuery({}), null);
  // 带薪摸鱼：卡上带 a=1，好友卡读出来（好友那边照常跑，标题页写「成绩仅供参考」）；普通局不带
  const aq = shareQuery({ seed: 102, win: true, arrivalText: '18:47', daily: false, level: 'mon', assist: true });
  assert.ok(aq.endsWith('&a=1'), aq);
  assert.ok(!q.includes('a=1'), q);
  const fq = Object.fromEntries(aq.split('&').map(kv => kv.split('=')));
  const af = friendFromQuery(fq);
  assert.equal(af.assist, true); assert.equal(af.level, 'mon'); assert.equal(af.time, '18:47'); assert.equal(af.stale, false);
  assert.equal(friendFromQuery({ seed: '5', cv: String(COURSE_VERSION) }).assist, false);
  // 同种子、同一关：开没开摸鱼是两条路（所以要在卡上标出来）
  for (const id of LEVEL_ORDER) assert.notEqual(courseHash(makeRun({ seed: 1, level: id, assist: true }).course), courseHash(makeRun({ seed: 1, level: id }).course), id);
});

test('拾取物空地：剔除前后，区间外的障碍和零钱逐个相同；区间内一个都没有', () => {
  for (const seed of SEEDS) {
    const a = planCourse(subRng(seed, SALT.course), { level: FULL, seed });
    const span = [57111, 57932];
    const b = carve(structuredClone(a), [span]);
    const out = c => JSON.stringify(c.obstacles.filter(o => o.x + OBSTACLES[o.type].w < span[0] - 20 || o.x > span[1] + 20).map(o => [o.type, Math.round(o.x)]));
    assert.equal(out(a), out(b));
    assert.equal(b.obstacles.filter(o => o.x + OBSTACLES[o.type].w > span[0] && o.x < span[1]).length, 0);
    assert.equal(b.pickups.filter(k => k.x > span[0] && k.x < span[1]).length, 0);
    assert.deepEqual(checkSpacing(b.obstacles), []);
    assert.ok(b.obstacles.every((o, i) => o.id === i));
  }
  const c = planCourse(makeRng(1));
  assert.equal(carve(c, []), c);
});

test('关卡数据结构：短关、中途起跑、小路段（主题 / 跑速系数）、多段随机、手写障碍', () => {
  for (const def of [SHORT, LATE]) {
    const lv = makeLevel(def);
    assert.equal(toLevel(lv), lv);
    for (const seed of [1, 2, 3]) {
      const c = planCourse(subRng(seed, SALT.course), { level: lv, seed });
      assert.deepEqual(checkSpacing(c.obstacles), [], `${def.id} 种子 ${seed}`);
      for (const slot of def.slots) {
        const [a, b] = slotWindow(slot, lv);
        assert.equal(c.obstacles.filter(o => o.x + OBSTACLES[o.type].w > a && o.x < b).length, 0, `${def.id} 种子 ${seed} 槽 ${slot.x}`);
      }
      assert.ok(c.obstacles.every(o => o.x >= lv.x0 && o.x + OBSTACLES[o.type].w <= lv.end - 260), `${def.id} 障碍出了路线`);
      assert.ok(c.obstacles.length > 15, `${def.id} 障碍太少：${c.obstacles.length}`);
    }
  }
  const lv = makeLevel(LATE);
  assert.equal(lv.stageAt(8500).id, 'stairs'); assert.equal(lv.themeAt(8500), 'office');
  assert.equal(lv.choiceTime(8500), lv.choiceTime(7000));          // 楼梯间按公司的读题时间
  assert.equal(lv.duskAt(6000), 0.02);
  // 随机段：第一段（7000–12500）更稀，段外（12500–12900）没有随机障碍；手写的文件箱在，且不摆零钱
  const c = planCourse(subRng(4, SALT.course), { level: lv, seed: 4 });
  assert.ok(c.obstacles.some(o => o.fixed && o.type === 'filebox' && o.x === 7050));
  assert.equal(c.obstacles.filter(o => !o.fixed && o.x < 7250).length, 0);
  assert.ok(!c.pickups.some(k => k.x > 7050 && k.x < 7050 + OBSTACLES.filebox.w), '手写障碍上方不摆零钱');
  assert.equal(c.obstacles.filter(o => o.x > 12500 - 1 && o.x < 12900).length, 0);
  // 关卡写死了种子：不管这一局的种子是几，路都一样
  assert.equal(courseHash(makeRun({ seed: 1, level: SHORT }).course), courseHash(makeRun({ seed: 99, level: SHORT }).course));
  assert.notEqual(courseHash(makeRun({ seed: 1, level: LATE }).course), courseHash(makeRun({ seed: 99, level: LATE }).course));
});

test('关卡时钟：按标准时长缩放倍率，纯跑一遍都在 18:46 前后到家；罚时分钟数跟着缩放', () => {
  for (const def of [SHORT, LATE]) {
    const lv = makeLevel(def);
    const pure = lv.clockStart + (lv.pureT * lv.clockRate) / 60;
    assert.ok(Math.abs(pure - (18 * 60 + PAR.refMin)) < 1e-6, `${def.id} 纯跑到家 ${pure}`);
    assert.ok(lv.clockRate > RES.clockRate * 1.5, `${def.id} 倍率 ${lv.clockRate}`);
    assert.equal(lv.clockK, lv.clockRate / RES.clockRate);
    const run = makeRun({ seed: 1, level: lv });
    assert.equal(run.x, lv.x0); assert.equal(run.stage, lv.stages[0]); assert.equal(run.introTotal, 1.6 + (run.introLine ? 0.3 : 0));   // 有开局交代（周一的故事）再 +0.3
    assert.equal(run.par.min, Math.round(pure + def.par.slack));       // 没有路口、分支：标准时间 = 纯跑 + 余量
  }
  // 撞一下：时钟除了正常走，多走 0.5 分钟 × 缩放系数（只留门口一个槽，不跳：一定会撞，也不会被追）
  const lv = makeLevel({ ...SHORT, id: 't-hit', slots: SHORT.slots.filter(s => s.kind === 'mom') }), run = makeRun({ seed: 2, level: lv });
  let seen = null;
  while (!run.done && run.t < 200 && seen == null) {
    const c0 = run.clock, w0 = run.wt;
    updateRun(run, 1 / 60);
    if (run.fx.some(e => e.type === 'hit') && !run.fx.some(e => e.type === 'caught' || e.type === 'hole')) seen = run.clock - c0 - (run.wt - w0) * lv.clockRate;
    run.fx.length = 0;
  }
  assert.ok(seen != null, '没撞上');
  assert.ok(Math.abs(seen - RES.hit.min * 60 * lv.clockK) < 1e-6, `撞一下多走 ${seen} 秒`);
});

test('短关跑得通：完美操作 0 碰撞到家、贴着标准时间；每题选错也甩得掉；来电槽指定了人就是那个人', () => {
  for (const def of [SHORT, LATE]) {
    const lv = makeLevel(def);
    for (const seed of [1, 2, 3]) {
      const { run, res } = play(seed, { skill: 1, choose: 'good' }, { level: lv });
      assert.ok(res && res.win, `${def.id} 种子 ${seed}：${res && res.reason} x=${Math.round(run.x)}`);
      assert.equal(res.stats.hits, 0, `${def.id} 种子 ${seed} 撞了`);
      assert.equal(res.level, def.id);
      assert.ok(res.vsPar > -4 && res.vsPar < 4, `${def.id} 种子 ${seed} 比标准 ${res.vsPar.toFixed(2)} 分`);
      assert.ok(res.score > 0);
      if (def === SHORT) assert.equal(run.callers[0], 'mom');
      const bad = play(seed, { skill: 1, choose: 'bad' }, { level: lv }).res;
      assert.ok(bad && bad.win, `${def.id} 种子 ${seed} 选错：${bad && bad.reason}`);
      assert.equal(bad.stats.caught, 0);
    }
  }
  assert.ok(clockMin(makeRun({ seed: 1, level: SHORT })) === 18 * 60);
});
