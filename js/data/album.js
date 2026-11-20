// 借口图鉴：每个人的每个回答都是一条收藏，说过一次就点亮。目录直接从台词表生成，加台词不用改这里。
// 一人一页，按「公司 / 路上 / 家里人」分组；家里人（家庭剧本的成员）的键也是「成员 id:选项」，老存档里的 mom:我错了 照样认。
// 选项里的 {称呼} 原样留在键里（和主角性别无关，换主角不丢图鉴）
import { NPCS } from './npcs.js';
import { MEMBERS, doorQuestionsBy, familiesOf, homesOf } from './family.js';

export const ALBUM_GROUPS = [{ id: 'office', name: '公司' }, { id: 'road', name: '路上' }, { id: 'home', name: '家里人' }];

function entry(id, who, questions, group, extra = {}) {
  const seen = new Set(), items = [];
  for (const q of questions) {
    for (const o of q.opts) {
      const key = `${id}:${o.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, text: o.text, react: o.react || '', good: o.good, line: q.line });
    }
  }
  return { id, name: who.name, role: who.role, hint: who.hint, group, items, ...extra };
}

export const ALBUM = [
  ...Object.keys(NPCS).map(id => entry(id, NPCS[id], NPCS[id].questions, NPCS[id].stages.includes('office') ? 'office' : 'road')),
  ...Object.keys(MEMBERS).map(id => entry(id, MEMBERS[id], Object.values(doorQuestionsBy(id)), 'home', { homes: familiesOf(id), own: homesOf(id), cat: !!MEMBERS[id].cat })),
];

export const ALBUM_KEYS = new Set(ALBUM.flatMap(e => e.items.map(it => it.key)));

// 图鉴里这个家里人要不要显示剪影 +「还没回过这个家」：一条回答都没点亮，存档里也没回过他住的家（visited：save.homes）
export const unseenMember = (e, have, visited) => e.group === 'home' && !e.items.some(it => have.has(it.key)) && !(e.own || []).some(h => visited.has(h));

export function albumCount(have) {
  let got = 0;
  for (const k of ALBUM_KEYS) if (have.has(k)) got++;
  return { got, total: ALBUM_KEYS.size };
}
// 某一组点亮了几条（图鉴页的分组标签上写）
export function groupCount(have, group) {
  let got = 0, total = 0;
  for (const e of ALBUM) if (e.group === group) for (const it of e.items) { total++; if (have.has(it.key)) got++; }
  return { got, total };
}
