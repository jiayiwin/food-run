// 平衡性扫描：4 档机器人各跑 40 局，看到家率、到家时间、评级分布、被抓次数。改数值后跑一下：node tools/balance.mjs
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot } from '../js/game/bot.js';
import { MODIFIERS } from '../js/data/modifiers.js';
const cfgs = [['完美', {skill:1, choose:'good', think:0.6}], ['老手', {skill:0.85, choose:'smart', think:0.9}], ['普通', {skill:0.6, choose:'smart', think:1.3}], ['手残', {skill:0.3, choose:'random', think:1.6}]];
for (const [name, cfg] of cfgs) {
  const out = []; 
  for (let seed = 1; seed <= 40; seed++) {
    let r = 0x2545f491 ^ (seed*7919); const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const run = makeRun({ seed }); const bot = makeBot({ rng, ...cfg });
    while (!run.done && run.t < 900) { bot(run); updateRun(run, 1/60); run.fx.length = 0; }
    out.push(run.done);
  }
  const wins = out.filter(d => d.win), fails = out.filter(d => !d.win);
  const avg = (arr, f) => arr.length ? (arr.reduce((a, d) => a + f(d), 0) / arr.length) : NaN;
  const grades = {}; for (const d of wins) grades[d.grade] = (grades[d.grade]||0)+1;
  const why = {}; for (const d of fails) why[d.reason+':'+(d.npc||'')] = (why[d.reason+':'+(d.npc||'')]||0)+1;
  const arr = wins.map(d => d.arrival).sort((a,b)=>a-b);
  const fm = m => `${Math.floor(m/60)}:${String(Math.floor(m%60)).padStart(2,'0')}`;
  console.log(`${name}: 到家 ${wins.length}/40  到家时间 中位 ${arr.length?fm(arr[arr.length>>1]):'-'} 区间 ${arr.length?fm(arr[0])+'–'+fm(arr[arr.length-1]):'-'}  评级 ${JSON.stringify(grades)}  失败 ${JSON.stringify(why)}`);
  console.log(`   撞 ${avg(out,d=>d.stats.hits).toFixed(1)} 被追 ${avg(out,d=>d.stats.chased).toFixed(1)} 被抓 ${avg(out,d=>d.stats.caught).toFixed(2)} 最低饱腹 ${avg(out,d=>d.stats.minSat).toFixed(0)} 进店 ${avg(out,d=>d.stats.shops).toFixed(1)} 好/总 ${avg(out,d=>d.stats.good).toFixed(1)}/${avg(out,d=>d.stats.choices).toFixed(1)} 分 ${avg(wins,d=>d.score).toFixed(0)} 惊险 ${avg(out,d=>d.stats.nearMiss).toFixed(1)} 零钱 ${avg(out,d=>d.stats.coins).toFixed(0)}`);
}

// 每日词条：各档机器人的到家率和中位到家时间
console.log('── 每日词条 ──');
for (const mod of [null, ...MODIFIERS]) {
  const cells = cfgs.map(([name, cfg]) => {
    const wins = [];
    for (let seed = 1; seed <= 40; seed++) {
      let r = 0x2545f491 ^ (seed*7919); const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
      const run = makeRun({ seed, modifier: mod }); const bot = makeBot({ rng, ...cfg });
      while (!run.done && run.t < 900) { bot(run); updateRun(run, 1/60); run.fx.length = 0; }
      if (run.done.win) wins.push(run.done.arrival);
    }
    wins.sort((a, b) => a - b);
    const m = wins[wins.length >> 1];
    return `${name} ${wins.length}/40 ${m ? Math.floor(m / 60) + ':' + String(Math.floor(m % 60)).padStart(2, '0') : '-'}`;
  });
  console.log(`${(mod ? mod.name : '无词条').padEnd(6, '　')} ${cells.join('  ')}`);
}
