// 可读性回归：只读美术清单、打包报告（tools/art/report.json）和数值表，不解码 PNG。
// 改了 art-src/spec.json 或重新打包以后，这里守住「会撞的看得清、背景不抢戏」的几条规矩。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_MANIFEST as M } from '../js/data/art.js';
import { OBSTACLES } from '../js/data/obstacles.js';
import { VEIL } from '../js/data/tune.js';
import { veilAt, veilAlpha } from '../js/render/veil.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const P = M.props;
const R = JSON.parse(readFileSync(join(ROOT, 'tools/art/report.json'), 'utf8'));
// 地标、背景类、车流：不加外圈（外圈的有无告诉玩家「这个会不会撞」）
const LANDMARKS = ['store', 'gateBooth', 'gateArm', 'gate_street', 'gate_park', 'gate_home', 'desk', 'homeDoor',
  'liftHall', 'liftLeaf', 'liftCab', 'car_sedan', 'car_taxi', 'car_suv', 'car_van', 'carParked', 'carFront', 'leashLady'];
// 图比判定框宽是设计如此（被单的晾衣杆、脚手架的管子、三轮车把、三只纸箱摞歪了）：允许的左右超出
const OVERHANG = { sheet: 32, scaffold: 12, trike: 9, parcel: 7 };
// 图比判定框高（单车的车把车筐、滑板车小孩的头）：只许往「看着更高」的方向偏，玩家会跳得更早，不会吃亏
const TALLER = { bike: 8, scooter: 13 };
// 晾衣杆落地：被单的悬空底边不按包围盒查，看截图
const POLES = new Set(['sheet']);

test('美术：会撞的和能捡的都有米白外圈，地标、背景、车流没有', () => {
  for (const id of Object.keys(OBSTACLES)) if (P[id]) assert.equal(P[id].rim, 1.5, `${id} 缺外圈`);
  for (const id of ['coin', 'bun', 'rider']) assert.equal(P[id] && P[id].rim, 1.5, `${id} 缺外圈`);
  for (const id of LANDMARKS) if (P[id]) assert.ok(!P[id].rim, `${id} 不该有外圈`);
});

test('美术：判定框和图对齐（看着跳过了却撞上 = 不公平）', () => {
  for (const [id, t] of Object.entries(OBSTACLES)) {
    const a = P[id];
    if (!a || t.hole) continue;
    assert.ok(a.bbox, `${id} 清单里没有 bbox`);
    const [x0, y0, x1, y1] = a.bbox;          // 不含外圈；相对障碍左边缘和地面，向上为负
    const tol = OVERHANG[id] ?? Math.max(4, t.w * 0.12);
    assert.ok(x0 >= -tol && x1 <= t.w + tol, `${id} 左右超出判定框：${x0}..${x1} vs 0..${t.w}`);
    if (t.ground) {
      const top = -y0;
      assert.ok(y1 >= -1 && y1 <= 2.5, `${id} 底边没贴地：${y1}`);                       // 水坑画得略陷进地面（oy 2），允许 2.5
      assert.ok(top >= t.ground - (id === 'leash' ? 4 : 3), `${id} 判定框比看到的高：图 ${top} vs 判定 ${t.ground}`);
      assert.ok(top <= t.ground + (TALLER[id] ?? 4), `${id} 图比判定框高太多：图 ${top} vs 判定 ${t.ground}`);
    }
    if (t.overhead && !POLES.has(id)) assert.ok(Math.abs(-y1 - t.overhead[0]) <= 2, `${id} 悬空底边 ${-y1} vs 判定 ${t.overhead[0]}`);
  }
});

test('美术：遛狗绳拆成两件，大妈在判定框左边、不加外圈', () => {
  if (!P.leash || !P.leashLady) return;
  const [lx0, , lx1] = P.leashLady.bbox;
  assert.ok(lx1 <= 8 && lx0 < 0, `大妈应该站在判定框左端外面：${P.leashLady.bbox}`);
  assert.ok(!P.leashLady.rim);
});

test('美术：新障碍严格对齐（±3px）', () => {
  for (const id of ['cardoor', 'mop']) {
    if (!OBSTACLES[id] || !P[id]) continue;                 // 对应阶段之前没有，图没出之前也没有
    const t = OBSTACLES[id], [x0, y0, x1, y1] = P[id].bbox;
    assert.ok(x0 >= -3 && x1 <= t.w + 3 && Math.abs(y1) <= 1 && Math.abs(-y0 - t.ground) <= 3, `${id} 没对齐：${P[id].bbox}`);
  }
});

test('美术：障碍主色不落在本路段背景已占满的色相扇区（调色 + 保底罩后，占比 ≤12%）', () => {
  for (const [id, t] of Object.entries(OBSTACLES)) {
    const h = R.props[id] && R.props[id].hueSector;     // 饱和度加权的主色扇区（30° 一格），中性色为 null
    if (h == null) continue;
    for (const s of t.stages) if (R.bg[s]) assert.ok(R.bg[s].hueBand[h] <= 0.12, `${id} 主色和 ${s} 背景撞色：${R.bg[s].hueBand[h]}`);
  }
});

test('美术：背景跳跃带压下去了（调色 + 保底罩），打包时用的罩子和运行时一致', () => {
  for (const s of ['office', 'street', 'park', 'home']) {
    const b = R.bg[s];
    assert.ok(b, `报告里没有 ${s} 的中景`);
    assert.ok(b.sMean <= 0.36, `${s} 跳跃带太艳：S=${b.sMean}`);
    assert.ok(b.hiSatBright <= 0.15, `${s} 高饱和亮色 ${b.hiSatBright}`);
    assert.ok(b.ink <= 0.12, `${s} 背景墨线 ${b.ink}`);
    assert.deepEqual(b.veil, VEIL[s], `${s} 打包用的罩子和 tune.js 不一致`);
  }
  assert.equal(VEIL.office.alpha, 0, '公司不压暗');
  assert.ok(VEIL.office.fog.alpha > 0 && VEIL.office.fog.alpha < 0.3, '公司浅雾是一层薄雾，不是实色');
});

test('美术：假障碍已移除，楼道整块铺墙', () => {
  const mods = st => M.bg[st].mid.modules.map(m => m.src);
  assert.ok(!mods('home').includes('bg/home_mid_1_2.png'), '楼道楼梯模块还在');
  assert.ok(!mods('home').some((m, i) => M.bg.home.mid.modules[i].w === 88 && M.bg.home.mid.modules[i].h === 101.5), '楼道楼梯模块还在（按尺寸）');
  assert.ok(!mods('office').includes('bg/office_mid_0_3.png'), '公司背景电梯还在');
  assert.ok(M.bg.home.mid.backdropFull, '楼道没有 backdropFull');
  assert.ok(!M.bg.office.mid.backdropFull, '公司不能整块铺墙（窗户要透出窗外）');
});

test('美术：中景后退一条后人行道，远景去重', () => {
  for (const s of ['street', 'park', 'home']) assert.equal(M.bg[s].mid.dy, -14, `${s} 中景没后退`);
  assert.equal(M.bg.office.mid.dy, -10);
  assert.equal(M.bg.office.far.src, M.bg.street.far.src, '公司、街道远景是同一张图，应只存一份');
  assert.equal(M.bg.park.far.src, M.bg.home.far.src, '小区、楼道远景是同一张图，应只存一份');
});

test('美术：清单引用的图都在，art/ 里没有清单之外的旧图（不白占包体）', () => {
  const used = new Set();
  for (const layers of Object.values(M.bg)) for (const d of Object.values(layers)) for (const m of d.modules || d.variants || [d]) used.add(m.src);
  for (const d of [...Object.values(M.props), ...Object.values(M.chars)]) used.add(d.src);
  for (const s of used) assert.ok(existsSync(join(ROOT, M.base, s)), `缺图 ${s}`);
  const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const stale = walk(join(ROOT, 'art')).map(p => p.slice(join(ROOT, 'art').length + 1).replace(/\\/g, '/')).filter(p => p.endsWith('.png') && !used.has(p));
  assert.deepEqual(stale, [], '清单没引用的旧图：重新打包会清掉');
});

test('主包（art、audio、js、game.js、game.json）< 4MB', () => {
  const size = p => { const s = statSync(p); return s.isDirectory() ? readdirSync(p).reduce((a, f) => a + size(join(p, f)), 0) : s.size; };
  const total = ['art', 'audio', 'js', 'game.js', 'game.json'].reduce((a, p) => a + size(join(ROOT, p)), 0);
  assert.ok(total < 4 * 1024 * 1024, `主包 ${(total / 1048576).toFixed(2)}MB`);
});

test('美术：电梯门扇和门洞对得上，门洞中心在原点', () => {
  const hall = P.liftHall, leaf = P.liftLeaf, cab = P.liftCab;
  if (!hall || !leaf || !cab) return;                       // 三件都到了才查
  const hole = hall.hole;
  assert.ok(hole, '电梯厅没找到门洞');
  assert.ok(Math.abs(leaf.w * 2 - hole[2]) <= 2 && Math.abs(leaf.h - hole[3]) <= 2, `门扇 ${leaf.w}×${leaf.h} vs 门洞 ${hole[2]}×${hole[3]}`);
  assert.ok(Math.abs(hole[0] + hole[2] / 2) <= 0.5, `门洞中心不在 x=0：${hole}`);
  assert.ok(cab.hole, '轿厢没找到门洞');
});

test('背景罩：按路段取、交界处连续过渡；户外入夜继续变暗，楼道固定压暗，公司只有浅雾', () => {
  const office = veilAt(4000), street = veilAt(20000), park = veilAt(45000), home = veilAt(59000);
  assert.equal(office.alpha, 0); assert.equal(office.fog, VEIL.office.fog.alpha);
  assert.equal(street.alpha, VEIL.street.alpha); assert.equal(street.fog, 0);
  assert.equal(park.alpha, VEIL.park.alpha);                  // 和街道同色不同深浅：不能串
  assert.equal(home.alpha, VEIL.home.alpha); assert.equal(home.color, 'rgb(58,42,64)');
  for (const b of [7700, 32000, 56000]) {
    let prev = veilAt(b - 200);
    for (let x = b - 199; x <= b + 200; x++) {
      const v = veilAt(x);
      assert.ok(Math.abs(v.alpha - prev.alpha) < 0.01 && Math.abs(v.fog - prev.fog) < 0.01, `${b} 附近 ${x} 罩子跳变`);
      prev = v;
    }
  }
  assert.equal(veilAt(100, () => 'office'), veilAt(30000, () => 'office'), '标题页（固定路段）不做过渡');
  assert.equal(veilAlpha(street, 1, 1), 0.3);
  assert.equal(veilAlpha(street, 0, 1), VEIL.street.alpha);
  assert.equal(veilAlpha(home, 1, 0), VEIL.home.alpha);
});
