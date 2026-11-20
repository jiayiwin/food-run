// 平衡性扫描：4 档机器人各跑 40 局，看到家率、到家时间、评级分布、被抓次数。改数值后跑一下：node tools/balance.mjs
//   --level <id>   按关卡扫（缺省 full = 自由下班）；--level all 把 js/data/levels.js 里的关卡挨个扫一遍
//   --n <局数>     每档跑多少局（缺省 40，种子 1…n）
//   --route lift | stairs | alt | both   路线卡机器人选哪条（缺省 lift = 坐电梯；alt 单数种子电梯、双数楼梯）；
//                  both 两条路各跑一遍，最后一行比两条路的中位到家时刻（要求 ≤1.5 分钟）
// 每档第三行：冲刺、被车溅；第四行：路口等灯 / 冲过闪绿 / 甩掉追兵的次数，世界停住（便利店 + 电梯 + 等灯）的秒数；
// 第五行（有电梯的关卡）：走电梯几局、轿厢里平均几秒、门夹住追兵 / 关门不让外卖进 / 电梯里答题的次数；
// 最后一行「到家−标准」：到家时刻减本路线标准时间（分钟），评级、晚饭都按它算；标准时间按种子不同（红灯、停层）时写区间和众数
// 关卡（--level prologue | mon | tue | wed）多一行星级：三颗星各点亮几局、三星几局、真实用时（秒）；--assist 按带薪摸鱼跑
// 注意单位：关卡的时钟按纯跑时长缩放过（1 游戏分钟 = 纯跑时长 / 46.6 秒），评级 / 晚饭 / ★2 线都是这一关时钟上的分钟
// --family       家庭剧本：每个故事（自由下班能抽到的）× 3 档机器人（完美 / 普通 / 新手，模拟真人：30% 挂家里电话、60% 蹭车）跑 n 局，
//                看到家率（和同种子爸妈家平常日比）、门口各题占比、钩子办成率、晚饭档位均值、家庭 + 钩子称号的出现率、世界停住最长；
//                最后按定稿的验收线打勾（普通最常见一道 ≤35%、新手 ≤45%、每家 ≥6 种题、完美办成 100%、普通 ≥85%、各家平常日晚饭均值差 ≤0.3 档）
// --story <key>  只跑一个故事（例如 --story share.takeaway）
import { makeRun, updateRun } from '../js/game/run.js';
import { makeBot } from '../js/game/bot.js';
import { MODIFIERS } from '../js/data/modifiers.js';
import { LEVELS } from '../js/data/levels.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const N = Math.max(1, +arg('n', 40) | 0), LEVEL = arg('level', 'full'), ROUTE = arg('route', 'lift'), ASSIST = process.argv.includes('--assist');
if (!['lift', 'stairs', 'alt', 'both'].includes(ROUTE)) { console.log(`--route 只能是 lift / stairs / alt / both`); process.exit(1); }
if (LEVEL !== 'all' && !Object.prototype.hasOwnProperty.call(LEVELS, LEVEL)) { console.log(`没有关卡 ${LEVEL}：可选 ${Object.keys(LEVELS).join(' / ')} / all`); process.exit(1); }
const FAMILY = process.argv.includes('--family') || process.argv.includes('--story'), STORY = arg('story', null);
if (FAMILY) { await familyScan(); process.exit(0); }
const levels = LEVEL === 'all' ? Object.keys(LEVELS) : [LEVEL];
const header = levels.length > 1 || LEVEL !== 'full';

const cfgs = [['完美', {skill:1, choose:'good', think:0.6}], ['老手', {skill:0.85, choose:'smart', think:0.9}], ['普通', {skill:0.6, choose:'smart', think:1.3}], ['手残', {skill:0.3, choose:'random', think:1.6}]];
const fm = m => `${Math.floor(m/60)}:${String(Math.floor(m%60)).padStart(2,'0')}`;
const sgn = v => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(1);
// 一组局的标准时间：只有一个值写「标准 18:49」，不止一个写「标准 18:49–18:50 众数 18:49」
function parLabel(list) {
  const n = {}; for (const p of list) n[p] = (n[p] || 0) + 1;
  const keys = Object.keys(n).sort(), mode = keys.reduce((a, k) => (n[k] > n[a] ? k : a), keys[0]);
  return keys.length > 1 ? `标准 ${keys[0]}–${keys[keys.length - 1]} 众数 ${mode}` : `标准 ${keys[0]}`;
}
function play(seed, cfg, opts) {
  let r = 0x2545f491 ^ (seed*7919); const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  const run = makeRun({ seed, assist: ASSIST, ...opts }); const bot = makeBot({ rng, ...cfg });
  while (!run.done && run.t < 900) { bot(run); updateRun(run, 1/60); run.fx.length = 0; }
  run.done.realT = run.t;
  return run.done;
}

const medians = {};
for (const level of levels) for (const route of ROUTE === 'both' ? ['lift', 'stairs'] : [ROUTE]) {
  if (header || ROUTE === 'both') {
    const r0 = makeRun({ seed: 1, level }), pars = [];
    for (let seed = 1; seed <= N; seed++) pars.push(fm(makeRun({ seed, level }).par.min));
    console.log(`══ ${level} · ${LEVELS[level].name} · ${parLabel(pars)} · 时钟 ×${r0.lv.clockRate.toFixed(1)}${LEVELS[level].branch ? ` · 路线 ${route}` : ''}${ASSIST ? ' · 带薪摸鱼' : ''} ══`);
  }
  for (const [name, cfg0] of cfgs) {
    const out = [], cfg = { ...cfg0, route };
    for (let seed = 1; seed <= N; seed++) out.push(play(seed, cfg, { level }));
    const wins = out.filter(d => d.win), fails = out.filter(d => !d.win);
    const avg = (arr, f) => arr.length ? (arr.reduce((a, d) => a + f(d), 0) / arr.length) : NaN;
    const grades = {}; for (const d of wins) grades[d.grade] = (grades[d.grade]||0)+1;
    const why = {}; for (const d of fails) why[d.reason+':'+(d.npc||'')] = (why[d.reason+':'+(d.npc||'')]||0)+1;
    const arr = wins.map(d => d.arrival).sort((a,b)=>a-b);
    console.log(`${name}: 到家 ${wins.length}/${N}  到家时间 中位 ${arr.length?fm(arr[arr.length>>1]):'-'} 区间 ${arr.length?fm(arr[0])+'–'+fm(arr[arr.length-1]):'-'}  评级 ${JSON.stringify(grades)}  失败 ${JSON.stringify(why)}`);
    console.log(`   撞 ${avg(out,d=>d.stats.hits).toFixed(1)} 被追 ${avg(out,d=>d.stats.chased).toFixed(1)} 被抓 ${avg(out,d=>d.stats.caught).toFixed(2)} 最低饱腹 ${avg(out,d=>d.stats.minSat).toFixed(0)} 进店 ${avg(out,d=>d.stats.shops).toFixed(1)} 好/总 ${avg(out,d=>d.stats.good).toFixed(1)}/${avg(out,d=>d.stats.choices).toFixed(1)} 分 ${avg(wins,d=>d.score).toFixed(0)} 惊险 ${avg(out,d=>d.stats.nearMiss).toFixed(1)} 零钱 ${avg(out,d=>d.stats.coins).toFixed(0)}`);
    console.log(`   冲刺 平均 ${avg(out,d=>d.stats.dashes).toFixed(1)} 次（被追时 ${avg(out,d=>d.stats.dashChased).toFixed(1)}） 被车溅 ${out.filter(d=>d.stats.splashed).length}/${N}`);
    console.log(`   路口 等灯 平均 ${avg(out,d=>d.stats.crossWaits||0).toFixed(2)} 次 冲过闪绿 ${avg(out,d=>d.stats.crossDash||0).toFixed(2)} 次 闪绿甩掉追兵 ${out.reduce((a,d)=>a+(d.stats.crossEscape||0),0)} 次 · 世界停住 平均 ${avg(out,d=>d.stats.stopT||0).toFixed(1)} 秒 最长 ${Math.max(...out.map(d=>d.stats.stopT||0)).toFixed(1)} 秒`);
    if (LEVELS[level].branch) {
      const lifts = out.filter(d => d.route === 'lift');
      console.log(`   电梯 ${lifts.length}/${N} 局 轿厢平均 ${avg(lifts, d => d.stats.stopMax.room).toFixed(1)} 秒 最长 ${Math.max(0, ...lifts.map(d => d.stats.stopMax.room)).toFixed(1)} 秒 · 门夹追兵 ${out.reduce((a, d) => a + (d.stats.doorShut || 0), 0)} 次 关门 ${out.reduce((a, d) => a + (d.stats.liftClose || 0), 0)} 次 电梯里答题 ${out.reduce((a, d) => a + (d.stats.liftQ || 0), 0)} 道`);
    }
    if (LEVELS[level].stars) {
      const st = i => out.filter(d => d.stars && d.stars[i]).length, rt = out.map(d => d.realT).sort((a, b) => a - b);
      console.log(`   星级 ★1 ${st(0)}/${N} ★2 ${st(1)}/${N} ★3 ${st(2)}/${N} 三星 ${out.filter(d => d.stars && d.stars.every(Boolean)).length}/${N} · 真实用时 中位 ${rt[rt.length >> 1].toFixed(1)} 秒 区间 ${rt[0].toFixed(1)}–${rt[rt.length - 1].toFixed(1)}`);
    }
    const vs = wins.map(d => d.vsPar).sort((a, b) => a - b);
    if (vs.length) console.log(`   到家−标准 中位 ${sgn(vs[vs.length >> 1])} 分 区间 ${sgn(vs[0])}…${sgn(vs[vs.length - 1])}（${parLabel(wins.map(d => d.parText))}）`);
    const ex = wins.map(d => d.stats.exitMin).filter(v => v != null).sort((a, b) => a - b);
    (medians[`${level}|${name}`] = medians[`${level}|${name}`] || {})[route] = { home: arr.length ? arr[arr.length >> 1] : NaN, exit: ex.length ? ex[ex.length >> 1] : NaN };
  }
  if (ROUTE === 'both' && route === 'lift') continue;
  if (ROUTE === 'both') {
    console.log(`── 两条路（楼梯 − 电梯，要求 ≤1.5 分钟）：中位到家 / 中位出大门（汇合点，只看路线本身）──`);
    console.log(cfgs.map(([name]) => { const m = medians[`${level}|${name}`]; return `${name} ${sgn(m.stairs.home - m.lift.home)} / ${sgn(m.stairs.exit - m.lift.exit)} 分`; }).join('  '));
  }
  if (level !== 'full') continue;

  // 每日词条（今日挑战永远是全程关）：各档机器人的到家率和中位到家时间
  console.log('── 每日词条 ──');
  for (const mod of [null, ...MODIFIERS]) {
    const cells = cfgs.map(([name, cfg]) => {
      const wins = [];
      for (let seed = 1; seed <= N; seed++) { const d = play(seed, { ...cfg, route }, { level, modifier: mod }); if (d.win) wins.push(d.arrival); }
      wins.sort((a, b) => a - b);
      const m = wins[wins.length >> 1];
      return `${name} ${wins.length}/${N} ${m ? Math.floor(m / 60) + ':' + String(Math.floor(m % 60)).padStart(2, '0') : '-'}`;
    });
    console.log(`${(mod ? mod.name : '无词条').padEnd(6, '　')} ${cells.join('  ')}`);
  }
}

// ── 家庭剧本 ──────────────────────────────────────────────────────────
async function familyScan() {
  const { storyKeys, storyOf, isFreeStory } = await import('../js/game/story.js');
  const { FAMILIES } = await import('../js/data/family.js');
  const keys = STORY ? [STORY] : storyKeys().filter(isFreeStory);
  if (STORY && !storyOf(STORY)) { console.log(`没有故事 ${STORY}：可选 ${storyKeys().join(' / ')}`); process.exit(1); }
  const human = { hangHome: 0.3, rideP: 0.6 };
  const tiers = [['完美', { skill: 1, choose: 'good', think: 0.6, ...human }], ['普通', { skill: 0.75, choose: 'smart', think: 1.1, ...human }], ['新手', { skill: 0.6, choose: 'random', think: 1.5, ...human }]];
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';
  const runOne = (seed, cfg, story) => {
    let r = 0x2545f491 ^ (seed * 7919); const rng = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    const run = makeRun({ seed, story }), bot = makeBot({ rng, ...cfg, route: 'lift' });
    while (!run.done && run.t < 900) { bot(run); updateRun(run, 1 / 60); run.fx.length = 0; }
    return { d: run.done, run };
  };
  const base = {}, bad = [];
  for (const [tn, cfg] of tiers) { base[tn] = []; for (let seed = 1; seed <= N; seed++) base[tn].push(runOne(seed, cfg, 'parents.normal').d.win); }
  const famDoor = {}, famMeal = {}, famTitle = {};
  for (const key of keys) {
    const S = storyOf(key);
    console.log(`══ ${key} · ${S.fam.name} · ${S.st.name}${S.errand ? ` · 钩子 ${S.errand.name}（${S.errand.carrier.kind === 'store' ? '便利店' : '跳起来够'}）` : ''} ══`);
    for (const [tn, cfg] of tiers) {
      const out = [];
      for (let seed = 1; seed <= N; seed++) out.push(runOne(seed, cfg, key));
      const wins = out.filter(x => x.d.win), q = {};
      for (const { run } of wins) { const d = run.fam.door; if (d) { const k = `${d.key}·${S.fam.questions[d.key] ? S.fam.questions[d.key].line : ''}`.replace(/·$/, ''); q[k] = (q[k] || 0) + 1; } }
      const qs = Object.entries(q).sort((a, b) => b[1] - a[1]);
      const done = out.filter(x => x.run.fam.errand && x.run.fam.errand.state === 'done').length;
      const tierMean = wins.length ? wins.reduce((a, x) => a + x.d.meal.tier, 0) / wins.length : NaN;
      const famT = {}; let famN = 0;
      const ft = new Set([...(S.fam.titles || []).map(t => t.name), ...(S.errand ? [S.errand.title, '忘性大王'] : [])]);
      for (const { d } of wins) if (ft.has(d.title)) { famN++; famT[d.title] = (famT[d.title] || 0) + 1; }
      const stop = Math.max(...out.map(x => x.d.stats.stopT || 0));
      const baseWins = base[tn].filter(Boolean).length;
      console.log(`${tn}: 到家 ${wins.length}/${N}（平常日 ${baseWins}）  门口 ${qs.length} 种 最常见 ${qs[0] ? qs[0][0] + ' ' + pct(qs[0][1], wins.length) : '-'}  晚饭均值 ${tierMean.toFixed(2)} 档  家庭/钩子称号 ${pct(famN, wins.length)} ${JSON.stringify(famT)}  停住最长 ${stop.toFixed(1)} 秒${S.errand ? `  钩子办成 ${done}/${N}` : ''}`);
      console.log(`   门口分布 ${qs.map(([k, n]) => `${k} ${pct(n, wins.length)}`).join(' · ')}`);
      if (Math.abs(wins.length - baseWins) > Math.max(1, Math.round(N / 40))) bad.push(`${key} ${tn} 到家 ${wins.length} vs 平常日 ${baseWins}`);   // 定稿：每档 40 局差 ≤1 局（局数多时按比例）
      if (stop > 15) bad.push(`${key} ${tn} 停住 ${stop.toFixed(1)} 秒`);
      if (S.errand && tn === '完美' && done < N) bad.push(`${key} 完美机器人办成 ${done}/${N}`);
      if (S.errand && tn === '普通' && done < N * 0.85) bad.push(`${key} 普通机器人办成 ${done}/${N}`);
      ((famTitle[S.fam.id] = famTitle[S.fam.id] || {})[tn] = famTitle[S.fam.id][tn] || []).push([S.st.weight, wins.length ? famN / wins.length : 0]);
      if (key.endsWith('.normal')) { (famDoor[S.fam.id] = famDoor[S.fam.id] || {})[tn] = { kinds: qs.length, top: qs[0] ? qs[0][1] / wins.length : 0 }; (famMeal[tn] = famMeal[tn] || {})[S.fam.id] = tierMean; }
    }
  }
  if (!STORY) {
    console.log('── 验收（平常日）──');
    for (const [fid, t] of Object.entries(famDoor)) {
      console.log(`${FAMILIES[fid].name}: 普通 ${t['普通'].kinds} 种 最常见 ${pct(t['普通'].top, 1)}  新手 ${t['新手'].kinds} 种 最常见 ${pct(t['新手'].top, 1)}`);
      if (t['普通'].top > 0.35) bad.push(`${fid} 普通最常见一道 ${pct(t['普通'].top, 1)}`);
      if (t['新手'].top > 0.45) bad.push(`${fid} 新手最常见一道 ${pct(t['新手'].top, 1)}`);
      if (N >= 100 && Math.max(t['普通'].kinds, t['新手'].kinds) < 6) bad.push(`${fid} 只有 ${Math.max(t['普通'].kinds, t['新手'].kinds)} 种题`);
    }
    // 家庭称号 + 钩子称号：按故事的抽签权重合计到每个家（看普通档：典型玩家），要在 10%–45%（不压掉「诚实的打工人」等性格称号）
    for (const [fid, t] of Object.entries(famTitle)) {
      const w = l => l.reduce((a, [k, v]) => a + k * v, 0) / l.reduce((a, [k]) => a + k, 0);
      console.log(`${FAMILIES[fid].name} 家庭 + 钩子称号（按故事权重）：${Object.entries(t).map(([tn, l]) => `${tn} ${pct(w(l), 1)}`).join(' ')}`);
      const v = w(t['普通']);
      if (keys.length > 4 && (v < 0.1 || v > 0.45)) bad.push(`${fid} 普通档家庭 + 钩子称号 ${pct(v, 1)}`);
    }
    for (const [tn, m] of Object.entries(famMeal)) { const v = Object.values(m); const sp = Math.max(...v) - Math.min(...v); console.log(`${tn} 各家平常日晚饭均值 ${Object.entries(m).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' ')}（差 ${sp.toFixed(2)}）`); if (sp > 0.3) bad.push(`${tn} 各家晚饭均值差 ${sp.toFixed(2)} 档`); }
  }
  console.log(bad.length ? `未达标 ${bad.length} 项：` + '\n  ' + bad.join('\n  ') : '验收线全部达标');
}
