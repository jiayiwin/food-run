// 分享卡参数：好友点开时用同一个种子、同一关跑同一条路。纯函数（标题页、战报页、测试共用）。
//   seed 种子 · t 到家时刻（没到家为空）· d 是否今日挑战 · lv 关卡 · cv 路线版本 · a=1 开了带薪摸鱼（障碍少、读题长，不是同一条路）
//   h 家庭剧本的故事（'家庭.故事'，只有自由下班 / 今日挑战带：关卡的故事是写死的）。同种子 + 同故事 = 同一条路、同一个家
import { COURSE_VERSION, isLevelId } from '../data/levels.js';

const homeOf = r => (r.story && (!r.level || r.level === 'full') && /^[a-z]+\.[a-z]+$/.test(r.story) ? `&h=${r.story}` : '');
export const shareQuery = r => `seed=${r.seed}&t=${r.win ? r.arrivalText : ''}&d=${r.daily ? 1 : 0}&lv=${r.level || 'full'}&cv=${COURSE_VERSION}${r.assist ? '&a=1' : ''}${homeOf(r)}`;

// 从启动参数里读好友卡。老版本的卡没有 lv / cv：按全程关、路线版本 1 算。
// stale：好友跑的是旧版路线（同种子在新版本上是另一条路），成绩只能参考；assist：好友开了带薪摸鱼（成绩也只能参考）。
// 好友这边照常跑（不开摸鱼）：卡片上写明白就行
export function friendFromQuery(q, today = null) {
  if (!q || !q.seed) return null;
  const seed = +q.seed >>> 0, cv = q.cv != null && q.cv !== '' && Number.isFinite(+q.cv) ? +q.cv : 1;
  return {
    seed, time: q.t || '', daily: q.d === '1' && today != null && seed === today,
    level: isLevelId(q.lv) ? q.lv : 'full', cv, stale: cv < COURSE_VERSION, assist: q.a === '1', h: typeof q.h === 'string' ? q.h.slice(0, 24) : '',   // 不认识的关卡键（lv=constructor 之类）按全程关算；h 认不认识由 story.js 判断
  };
}
