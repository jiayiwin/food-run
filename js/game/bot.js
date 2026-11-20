// 自动玩家：测试公平性（完美操作必须零碰撞）、调数值、录演示都用它。
//   run：一局；opts.skill 0..1 操作准确度；opts.choose 'good' | 'bad' | 'random' | 'smart'（smart 只看卡面信息）
//   opts.dash true（缺省：被追时、在 ▶▶ 区里冲刺）| 'chase'（只在被追时）| false（从不冲刺）；技能不满时有 (1 − skill) × 0.5 的概率漏冲
//     路口不用额外逻辑：闪绿的 ▶▶ 区里照上面冲（dash: false 就一定停下等一轮），红灯自动停，等灯时什么都不做
//   opts.store 'always'：每家便利店都进（缺省饱腹 < 60 才进）；opts.shop 'idle'：进店什么都不买，等到超时（测世界停住的最坏情况）
//   opts.route 路线卡：'lift'（缺省）| 'stairs' | 'alt'（种子单数电梯、双数楼梯）| 'none'（不选，等超时 = 楼梯）
//   opts.close 电梯里外卖那一拍点不点关门键：缺省 skill ≥ 0.85 才点（关门键出现 0.25 秒后点）；false 从不点
//   电梯门前的 ▶▶ 区照上面的冲刺规则冲（被追时冲进去 = 门夹住追兵）；轿厢里题照常答，不跳不滑
//   opts.errand 家里交代的事：'do' 顺手办（货架上有家里要的就进店、钱够且饱腹 ≥30 买第 3 格；拾取物跳起来够）| 'skip' 不办。
//     缺省 choose: 'bad' 时 'skip'，其余 'do'。opts.store 'always' 照样每家店都进，opts.shop 'idle' 照样什么都不买（测最坏停住）
//   opts.hangHome 0..1 家里来电挂掉的概率、opts.rideP 0..1 蹭车的概率（缺省 0 / 1：一律接、一律蹭；平衡扫描模拟真人用，只有设了才掷 o.rng）
import { OBSTACLES } from '../data/obstacles.js';
import { STORE } from '../data/events.js';
import { speedAt } from '../data/tune.js';
import { obstacleX } from './course.js';
import { input, canDash, dashReady, judgeCtx } from './run.js';
import { judge, isExcuse } from './choice.js';
import { errandOpen } from './story.js';

export function makeBot(opts = {}) {
  const o = { skill: 1, choose: 'good', think: 0.6, dash: true, route: 'lift', rng: Math.random, ...opts };
  if (o.close == null) o.close = o.skill >= 0.85;
  if (o.errand == null) o.errand = o.choose === 'bad' ? 'skip' : 'do';
  const acted = new Set();
  let thinkAt = null, plan = new Map(), dashPlan = null;
  return function step(run) {
    if (run.done || run.intro > 0 || run.ending) return;
    const p = run.player;
    // 选择
    const c = run.choice;
    if (c && c.phase === 'open') {
      if (thinkAt === null) thinkAt = c.t + Math.min(c.T * 0.85, o.think * (0.6 + o.rng() * 0.8));
      if (c.kind === 'route' && o.route === 'none') thinkAt = Infinity;   // 不选：等它超时
      if (c.hold || c.t >= thinkAt) {
        thinkAt = null;
        input(run, c.hold ? 'left' : 'card', decide(run, c, o));
        if (c.hold) input(run, 'card', 0);
      }
    } else thinkAt = null;
    // 便利店：饿了就买（shop: 'idle' 什么都不买，等它自己关门）
    if (run.shop && run.shop.closeT <= 0 && run.shop.t > 0.4 && o.shop !== 'idle') {
      const items = run.shop.items || STORE.items;
      const fam = o.errand === 'do' && items[2] && items[2].fam && run.money >= items[2].price && run.sat >= 30;   // 家里要的：先办家里的事（饿坏了就先买吃的）
      const i = fam ? 2 : run.sat < 45 && run.money >= items[1].price ? 1 : run.sat < 70 && run.money >= items[0].price ? 0 : -1;
      input(run, i < 0 ? 'leave' : 'card', i);
    }
    if (run.teach) { input(run, run.teach.kind); return; }
    // 电梯：外卖那一拍关门键出现 0.25 秒后点一下（手残的不点，小哥就进来了，没有惩罚）
    if (run.room) { if (run.room.btn && o.close && run.room.bt >= 0.25) input(run, 'close'); return; }
    if (run.ride || run.cutscene || run.shop) return;
    // 冲刺：用 'dash' 动作（不用 'right'，免得卡片打开那一帧误选）。每个冲刺机会只掷一次漏冲
    if (o.dash && canDash(run)) {
      // 和鞋底的环同一个判断（dashReady）；'chase' 只在被追、冷却好了时冲
      if (o.dash === true ? dashReady(run) : run.chaser && p.dashCd <= 0) {
        const miss = (1 - o.skill) * 0.5;
        if (!dashPlan || run.t >= dashPlan.until) dashPlan = { go: miss <= 0 || o.rng() >= miss, until: run.t + 0.8 };
        if (dashPlan.go) { input(run, 'dash'); dashPlan = null; }
      }
    }
    // 家里要的东西（拾取物）：人在地上、没有打开的卡片时，离它 v × 0.12 + 8 起跳（上升段正好够到）
    if (o.errand === 'do' && errandOpen(run) && run.fam.pickX != null && p.onGround && p.state === 'run' && !(c && c.phase === 'open')) {
      const d = run.fam.pickX - run.x;
      if (d > 0 && d <= run.v * 0.12 + 8 && !acted.has('errand')) { acted.add('errand'); input(run, 'jump'); }
    }
    // 障碍：找前面最近的没过的
    const obs = run.course.obstacles;
    for (let i = run.obIdx; i < obs.length; i++) {
      const ob = obs[i], t = OBSTACLES[ob.type];
      if (ob.done) continue;
      const ox = obstacleX(ob, run.x), dist = ox - run.x;
      if (dist > 500) break;
      if (dist + t.w < -10) continue;
      if (acted.has(ob.id)) break;
      const vb = speedAt(run.x), rel = Math.max(1, run.v * (1 + (ob.vx || 0) / vb));
      // 每个障碍一次随机误差（按技能），失手就干脆不操作
      if (!plan.has(ob.id)) { const busy = run.choice && run.choice.phase === 'open' ? 2.5 : 1; plan.set(ob.id, { err: (o.rng() - 0.5) * 0.24 * (1 - o.skill) * busy, miss: o.rng() > 1 - 0.06 * (1 - o.skill) * busy }); }
      const pl = plan.get(ob.id);
      const slide = t.avoid === 'slide';
      let when;
      if (slide) when = (dist - 24) / rel - 0.1;
      else if (t.platform) when = (dist - 6) / rel - 0.12;
      else when = (dist + t.w / 2) / rel - 0.28;
      when -= pl.err;
      if (when <= 0) {
        acted.add(ob.id);
        if (pl.miss) break;
        if (slide) { if (p.onGround && p.state !== 'stumble') input(run, 'slide'); else if (!p.onGround) input(run, 'slide'); }
        else input(run, 'jump');
      }
      break;
    }
  };
}

function decide(run, c, o) {
  if (c.kind === 'call') return c.caller === 'boss' ? 1 : c.caller === 'mom' && o.hangHome > 0 && o.rng() < o.hangHome ? 1 : 0;
  if (c.kind === 'ride') return o.rideP != null && o.rideP < 1 && o.rng() >= o.rideP ? 1 : 0;
  // 便利店：饿了就进。进不进的线按「种子 × 第几家店」定在 53–63 之间（平均进店次数和原来固定 60 时差不多；真人不会都卡在同一条线上：都按 60 算的话，
  // 差 1 点饱腹就多花 3 分钟买饭团，会把电梯 / 楼梯两条路的平衡测歪）。不用 o.rng：两条路上同一家店是同一条线
  if (c.kind === 'store') return o.store === 'always' || run.sat < storeLine(run.seed, c.x) || (o.errand === 'do' && errandOpen(run) && run.story.errand.carrier.kind === 'store') ? 0 : 1;
  if (c.kind === 'route') {                                 // 左楼梯、右电梯（固定）
    const want = o.route === 'alt' ? (run.seed % 2 ? 'lift' : 'stairs') : o.route === 'stairs' ? 'stairs' : 'lift';
    return Math.max(0, c.opts.findIndex(x => x.route === want));
  }
  const ctx = judgeCtx(run, c);              // 和 run.js 的 resolve 同一个判定上下文（门口的规则表要看进没进过店）
  const score = opt => { const r = judge(opt, ctx); return r.good === true ? 2 : r.good === 'mid' ? 1 : 0; };
  if (o.choose === 'random') return o.rng() < 0.5 ? 0 : 1;
  if (o.choose === 'bad') return score(c.opts[0]) <= score(c.opts[1]) ? 0 : 1;
  if (o.choose === 'smart') {
    // 只用卡面能看到的信息：避开「已用×2」和买不起的，其余按真实好坏有 75% 选对
    const vis = opt => (isExcuse(opt.tag) && (run.used[opt.tag] || 0) >= 2) || (opt.cost && run.money < opt.cost) || (c.grudgeTag && opt.tag === c.grudgeTag) ? -1 : 0;
    const a = vis(c.opts[0]), b = vis(c.opts[1]);
    if (a !== b) return a > b ? 0 : 1;
    const best = score(c.opts[0]) >= score(c.opts[1]) ? 0 : 1;
    return o.rng() < 0.75 ? best : 1 - best;
  }
  return score(c.opts[0]) >= score(c.opts[1]) ? 0 : 1;
}

const storeLine = (seed, x) => 53 + ((Math.imul(((seed >>> 0) ^ Math.round(x)) >>> 0, 2654435761) >>> 0) % 1000) / 100;

// 跑完一整局（测试 / 调参）
export function simulate(run, bot, { dt = 1 / 60, maxT = 600, update }) {
  while (!run.done && run.t < maxT) { bot(run); update(run, dt); run.fx.length = 0; }
  return run.done;
}
