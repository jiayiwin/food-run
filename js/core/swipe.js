// 滑动方向按场景重新分类（纯函数，可单测）。手势层只给位移 dx / dy，这里决定它算哪个方向：
//   跑酷时横向要明显（水平位移 > 竖直 1.4 倍）才算左右，否则算上下（跳 / 滑铲）：斜着往上划不会丢掉这一跳
//   答题时仍按原规则（|dx| > |dy| 就算左右）
import { CHOICE } from '../data/tune.js';

export const SWIPE = { runRatio: 1.4, misfire: 0.5 };

// 'answer' 卡片打开：左右 = 选；'pre' NPC 快弹题 / 刚选完：左右什么都不做；'run' 跑酷；'shop' / 'room'：各自处理
export function swipeMode(run) {
  if (run.shop) return 'shop';
  if (run.room) return 'room';
  const c = run.choice;
  if (c && c.phase === 'open') return 'answer';
  if (c && c.phase === 'result' && c.rt < CHOICE.dashGuard) return 'pre';
  const p = run.pending;
  if (p && p.slot.x - run.x < CHOICE.dashPendGuard * Math.max(run.v, 1)) return 'pre';
  return 'run';
}

export function classifySwipe(e, mode) {
  const k = mode === 'run' || mode === 'pre' ? SWIPE.runRatio : 1;
  if (Math.abs(e.dx) > k * Math.abs(e.dy)) return e.dx > 0 ? 'right' : 'left';
  return e.dy > 0 ? 'down' : 'up';
}

// 滑动埋点（纯统计，不影响逻辑）：各模式的次数；跑酷里的横划记下时刻，0.5 秒内撞上障碍算一次「误划」
export function noteSwipe(run, mode, dir) {
  const s = run.stats.swipe;
  if (!s || run.intro > 0 || run.ending || run.done || run.teach) return;   // 开局卡、到家过场、教学定格时的滑动不算
  if (mode === 'run' || mode === 'pre' || mode === 'answer') s[mode]++;
  if (mode === 'run' && (dir === 'left' || dir === 'right')) { s.runH++; run.lastHSwipe = run.t; }
}
