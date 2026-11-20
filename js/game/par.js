// 本路线标准时间（par）：开局时解析计算，不跑机器人。评级、晚饭、计分目标、门口「怎么这么晚」都相对它。
//   世界时间 T = 起步损失 0.25 秒 + 纯跑到家（每 5px 数值积分，路段跑速系数照算）
//             + 红灯：刹车多用的 0.35 秒 + 等待 + 再起步 0.25 秒（闪绿按冲过去算 0；每局最多等 2 次，第 3 个红灯会变绿，不算）
//             + 分支（电梯 / 楼梯）：按两条路里慢的那条算（楼梯间；电梯按轿厢标称时长）。走哪条都不吃评级的亏，电梯省下的时间算你赚的
//   par = round(18:00 + T × 本关时钟倍率 / 60 + slack)，整分钟
import { PAR, CROSS } from '../data/tune.js';
import { runTime } from './level.js';

export function parOf(course, lv) {
  let main = lv.runT;                                    // 纯跑到家（makeLevel 里积分好的）
  const b = course && course.branch;
  if (b && b.liftT != null) main = Math.max(main, main - runTime(lv, b.door, b.exit) + b.liftT);   // main 已经是走楼梯的（楼梯间跑速 ×0.75 算在 runT 里）
  let T = PAR.startLoss + main;
  let reds = 0;
  for (const c of (course && course.crossings) || []) if (c.light === 'red' && reds++ < CROSS.maxWaits) T += CROSS.brake + c.wait + PAR.startLoss;
  const raw = lv.clockStart + (T * lv.clockRate) / 60 + lv.def.par.slack;
  return { worldT: T, raw, min: Math.round(raw) };
}
