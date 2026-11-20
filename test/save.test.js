// 存档 v2：迁移（只加字段、不删旧字段、幂等）、解锁链、标题页「下班！」去哪、关卡结算记录（星级并集、最好成绩、连败）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, DEFAULT, SAVE_VER, isOpen, fullOpen, cleared, mainTarget, recordLevel, nextLevel, assistOffer, starCount, recordHome, homesFromAlbum } from '../js/core/savefmt.js';
import { ALBUM, ALBUM_KEYS, unseenMember } from '../js/data/album.js';
import { LEVEL_ORDER, LEVELS } from '../js/data/levels.js';

const win = (level, o = {}) => ({ level, win: true, stars: [true, true, false], vsPar: -1, arrivalText: '18:47', ...o });
const lose = level => ({ level, win: false, stars: [false, false, false], vsPar: 9, arrivalText: '19:00' });

test('迁移：空存档 = 默认；v1 新玩家从序章开始，周一和自由下班都锁着', () => {
  assert.deepEqual(migrate(null), DEFAULT);
  assert.deepEqual(migrate(undefined), DEFAULT);
  assert.deepEqual(migrate('坏数据'), DEFAULT);
  const s = migrate({ runs: 0 });
  assert.equal(s.ver, SAVE_VER);
  assert.equal(s.legacy, false);
  assert.equal(isOpen(s, 'prologue'), true);
  assert.equal(isOpen(s, 'mon'), false);
  assert.equal(fullOpen(s), false);
  assert.equal(mainTarget(s), 'prologue');
  assert.equal(s.gender, null, '主角性别：预留字段，还没选');
});

test('迁移：v1 老玩家（runs > 0）全部解锁，「下班！」保持自由下班，旧字段原样保留', () => {
  const v1 = { runs: 5, wins: 3, best: { arrival: 1130.5, text: '18:50', grade: 'S', score: 12000 }, daily: { date: '2026-11-18', arrival: 1131, text: '18:51', grade: 'S' }, album: ['laoliu:赶地铁'], settings: { mute: true }, tutorialDone: true, tips: ['chase'] };
  const s = migrate(v1);
  assert.equal(s.legacy, true);
  for (const id of LEVEL_ORDER) assert.equal(isOpen(s, id), true, id);
  assert.equal(fullOpen(s), true);
  assert.equal(mainTarget(s), 'full');
  for (const k of ['runs', 'wins', 'best', 'daily', 'album', 'tutorialDone', 'tips']) assert.deepEqual(s[k], v1[k], k);
  assert.deepEqual(s.settings, { mute: true, vibrate: true });
  for (const k of ['jump', 'slide', 'choose', 'chase']) assert.ok(s.learned.includes(k), k);
  // 老玩家打了几关以后，「下班！」照样是自由下班
  recordLevel(s, win('prologue'), LEVELS.prologue.learn);
  assert.equal(mainTarget(s), 'full');
});

test('迁移：v1 runs 0 但教学做完了 → 学会跳、滑、选；幂等；未知字段保留；v2 存档原样读回', () => {
  const s = migrate({ runs: 0, tutorialDone: true });
  for (const k of ['jump', 'slide', 'choose']) assert.ok(s.learned.includes(k));
  assert.ok(!s.learned.includes('chase'));
  for (const x of [null, { runs: 0 }, { runs: 7, best: null, foo: 1 }, { runs: 0, tutorialDone: true, bar: { a: 1 } }]) assert.deepEqual(migrate(migrate(x)), migrate(x));
  assert.equal(migrate({ runs: 3, foo: 'x' }).foo, 'x');
  const v2 = migrate({ runs: 2 });
  v2.levels.mon = { stars: [true, false, false], best: 1, clears: 1, fails: 0, streak: 0 };
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(v2))), v2);
});

test('解锁链：序章 → 周一 → 周二 → 周三；打完周一解锁自由下班；「下班！」依次 prologue → mon → tue → wed → full', () => {
  const s = migrate(null), seq = [];
  for (const id of LEVEL_ORDER) {
    seq.push(mainTarget(s));
    assert.equal(isOpen(s, id), true, `${id} 该开了`);
    const next = nextLevel(id);
    if (next) assert.equal(isOpen(s, next), false, `${next} 还没开`);
    const f = recordLevel(s, win(id), LEVELS[id].learn);
    assert.ok(cleared(s, id));
    if (next) assert.equal(f.unlockNext, next);
    assert.equal(!!f.unlockFull, id === 'mon', `${id} 解锁自由下班`);
    assert.equal(fullOpen(s), LEVEL_ORDER.indexOf(id) >= 1);
  }
  seq.push(mainTarget(s));
  assert.deepEqual(seq, ['prologue', 'mon', 'tue', 'wed', 'full']);
  for (const k of ['jump', 'slide', 'choose', 'chase', 'cardoor', 'dash', 'lift', 'cross']) assert.ok(s.learned.includes(k), k);
  assert.equal(s.tutorialDone, true, '序章通关 = 教学做完');
  assert.equal(isOpen(s, '没有这关'), false);
});

test('关卡记录：星级取历史并集、最好成绩、连败计数（成功清零）；连败 2 次才给带薪摸鱼', () => {
  const s = migrate(null);
  let f = recordLevel(s, lose('mon'));
  assert.equal(f.streak, 1); assert.equal(assistOffer(s, 'mon'), false);
  f = recordLevel(s, lose('mon'));
  assert.equal(f.streak, 2); assert.equal(assistOffer(s, 'mon'), true);
  assert.equal(s.levels.mon.fails, 2); assert.equal(cleared(s, 'mon'), false);
  f = recordLevel(s, win('mon', { stars: [true, false, true], vsPar: 2.5, arrivalText: '18:50' }));
  assert.equal(f.newStars, 2); assert.equal(s.levels.mon.streak, 0); assert.equal(assistOffer(s, 'mon'), false);
  assert.deepEqual(s.levels.mon.stars, [true, false, true]);
  f = recordLevel(s, win('mon', { stars: [true, true, false], vsPar: -0.5, arrivalText: '18:47' }));
  assert.equal(f.newStars, 1); assert.equal(f.bestLevel, true);
  assert.deepEqual(s.levels.mon.stars, [true, true, true]);
  assert.equal(starCount(s, 'mon'), 3);
  assert.equal(s.levels.mon.best, -0.5); assert.equal(s.levels.mon.bestText, '18:47');
  recordLevel(s, win('mon', { vsPar: 3 }));
  assert.equal(s.levels.mon.best, -0.5, '慢了不刷新最好成绩');
  assert.equal(s.levels.mon.clears, 3);
  assert.deepEqual(recordLevel(s, { level: 'full', win: true }), {}, '全程关不进关卡记录');
});

test('回过哪些家（save.homes）：到家才记、不重复；老存档按图鉴补；改过字的图鉴键换成新键；图鉴剪影按「回过他家」判断', () => {
  const s = migrate(null);
  assert.deepEqual(s.homes, []);
  recordHome(s, { win: false, family: { id: 'cat' } });
  assert.deepEqual(s.homes, [], '没到家不算回过');
  recordHome(s, { win: true, family: { id: 'parents' } }); recordHome(s, { win: true, family: { id: 'parents' } }); recordHome(s, { win: true });
  assert.deepEqual(s.homes, ['parents']);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))).homes, ['parents'], '原样读回');
  // 没有 homes 的老存档：图鉴里点亮过谁 = 回过他家；路上的人不算
  const old = migrate({ ver: 2, runs: 5, album: ['mom:我错了', 'laoliu:赶地铁', 'juzi:摸摸头', 'juzi:先喂猫粮'] });
  assert.deepEqual(old.homes.sort(), ['cat', 'parents']);
  assert.deepEqual(homesFromAlbum(['laolao:妈您辛苦', 'zhou:辛苦了']), ['kid']);
  assert.ok(old.album.includes('juzi:先喂它') && !old.album.includes('juzi:先喂猫粮'), '「先喂猫粮」改成了「先喂它」：老键换新键');
  assert.ok(old.album.every(k => ALBUM_KEYS.has(k)));
  assert.deepEqual(migrate(migrate({ runs: 3, album: ['dad:还没'] })), migrate({ runs: 3, album: ['dad:还没'] }), '幂等');
  // 图鉴：爸妈家回过了，爸爸一条都没说过也不是剪影（他只在饿了 / 蹭车时才问）；奶奶家没回过、奶奶一条都没点亮 → 剪影
  const dad = ALBUM.find(e => e.id === 'dad'), nn = ALBUM.find(e => e.id === 'nainai'), laoliu = ALBUM.find(e => e.id === 'laoliu');
  assert.equal(unseenMember(dad, new Set(), new Set()), true);
  assert.equal(unseenMember(dad, new Set(), new Set(['parents'])), false);
  assert.equal(unseenMember(nn, new Set(), new Set(['parents'])), true, '奶奶住奶奶家（周三来住只是客人）');
  assert.equal(unseenMember(nn, new Set([nn.items[0].key]), new Set()), false, '点亮过就不是剪影');
  assert.equal(unseenMember(laoliu, new Set(), new Set()), false, '路上的人不用剪影');
});
