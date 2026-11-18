// 自动玩家：测试公平性（完美操作必须零碰撞）、调数值、录演示都用它。
//   run：一局；opts.skill 0..1 操作准确度；opts.choose 'good' | 'bad' | 'random' | 'smart'（smart 只看卡面信息）
import { OBSTACLES } from '../data/obstacles.js';
import { STORE } from '../data/events.js';
import { speedAt } from '../data/tune.js';
import { obstacleX } from './course.js';
import { input } from './run.js';
import { judge, isExcuse } from './choice.js';

export function makeBot(opts = {}) {
  const o = { skill: 1, choose: 'good', think: 0.6, rng: Math.random, ...opts };
  const acted = new Set();
  let thinkAt = null, plan = new Map();
  return function step(run) {
    if (run.done || run.intro > 0 || run.ending) return;
    const p = run.player;
    // 选择
    const c = run.choice;
    if (c && c.phase === 'open') {
      if (thinkAt === null) thinkAt = c.t + Math.min(c.T * 0.85, o.think * (0.6 + o.rng() * 0.8));
      if (c.hold || c.t >= thinkAt) {
        thinkAt = null;
        input(run, c.hold ? 'left' : 'card', decide(run, c, o));
        if (c.hold) input(run, 'card', 0);
      }
    } else thinkAt = null;
    // 便利店：饿了就买
    if (run.shop && run.shop.closeT <= 0 && run.shop.t > 0.4) {
      const i = run.sat < 45 && run.money >= STORE.items[1].price ? 1 : run.sat < 70 && run.money >= STORE.items[0].price ? 0 : -1;
      input(run, i < 0 ? 'leave' : 'card', i);
    }
    if (run.teach) { input(run, run.teach.kind); return; }
    if (run.ride || run.cutscene || run.shop) return;
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
  if (c.kind === 'call') return c.caller === 'boss' ? 1 : 0;
  if (c.kind === 'ride') return 0;
  if (c.kind === 'store') return run.sat < 60 ? 0 : 1;
  const ctx = { money: run.money, sat: run.sat, used: run.used, grudgeTag: c.grudgeTag, flags: run.flags };
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

// 跑完一整局（测试 / 调参）
export function simulate(run, bot, { dt = 1 / 60, maxT = 600, update }) {
  while (!run.done && run.t < maxT) { bot(run); update(run, dt); run.fx.length = 0; }
  return run.done;
}
