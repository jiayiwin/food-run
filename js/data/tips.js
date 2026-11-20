// 结算页 / 失败页的一句提示：按顺序取第一条满足的（每条 ≤14 字，test/content.test.js 检查）。
//   r：一局的结算结果（带 stats、stars、assist）；known：这一局玩家知道的机制（存档里学会的 + 本关教的 + 这局看过的提示）
//   关卡里没拿 ★3 时，用关卡自己的 tip3（js/data/levels.js）
export const DEATH_TIPS = [
  { id: 'zhou', text: '老周心软：说辛苦就放你过', test: r => r.reason === 'caught' && r.npc === 'zhou' },
  { id: 'hitChased', text: '被追时别撞东西，一撞就被拉近', test: r => r.reason === 'caught' && r.stats.hitsChased > 0 },
  { id: 'dash', text: '被追时右滑冲刺，能多甩开一截', test: (r, known) => r.reason === 'caught' && known.has('dash') && r.stats.dashChased === 0 },
  { id: 'grudge', text: '记仇的人回来了：换个借口', test: r => r.reason === 'caught' && r.stats.lastBad === 'grudge' },
  { id: 'tired', text: '同一类借口第 3 次就不灵了', test: r => r.reason === 'caught' && r.stats.lastBad === 'tired' },
  { id: 'caught', text: '干净地跑，一定甩得掉', test: r => r.reason === 'caught' },
  { id: 'starve', text: '饿了进便利店，或跳起来吃包子', test: (r, known, lv) => r.reason === 'starve' && hasStore(lv) },
  { id: 'starveBun', text: '饿了就跳起来吃路边的包子', test: r => r.reason === 'starve' },          // 这一关没有便利店（周一、周二）
  // 到家了，没拿 ★2（只有关卡有星）：按真正丢时间的原因给一句。碎饭盒 > 撞 > 闪绿没冲、等了一轮（红灯是躲不开的，不算）> 被追 > 都不是就用本关的 tip3
  { id: 'boxes', text: '饭盒碎了两个：被追时别乱撞', test: r => miss2(r) && r.broken > 1 && r.stats.hitsChased > 0 },
  { id: 'ontime', text: '撞一下耽误两秒，看清再跳', test: r => miss2(r) && r.stats.hits > 0 },
  { id: 'wait', text: '闪绿灯时右滑，冲过斑马线', test: r => miss2(r) && r.stats.crossWaits > 0 && (r.stats.crossLog || []).some(e => e.result === 'miss') },
  { id: 'chased', text: '被追时右滑冲刺，能多甩开一截', test: (r, known) => miss2(r) && (r.stats.caught > 0 || r.stats.chased > 0) && known.has('dash') },
  { id: 'miss2', text: '', test: r => miss2(r) },
  // 拿了 ★2，没拿 ★3（带薪摸鱼本来就没有 ★3，不提示）
  { id: 'star3', text: '', test: r => r.win && r.stars && !r.stars[2] && !r.assist },
];
function miss2(r) { return !!(r.win && r.stars && !r.stars[1]); }
const hasStore = lv => !!(lv && (lv.slots || (lv.def && lv.def.slots) || []).some(s => s.kind === 'store'));

export function deathTip(r, lv, known = new Set()) {
  for (const t of DEATH_TIPS) if (t.test(r, known, lv)) return t.id === 'star3' || t.id === 'miss2' ? (lv.def.tip3 || '') : t.text;
  return '';
}
