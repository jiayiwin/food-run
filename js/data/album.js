// 借口图鉴：每个人的每个回答都是一条收藏，说过一次就点亮。目录直接从台词表生成，加台词不用改这里。
import { NPCS, MOM } from './npcs.js';

function entry(id, who, questions) {
  const seen = new Set(), items = [];
  for (const q of questions) {
    for (const o of q.opts) {
      const key = `${id}:${o.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, text: o.text, react: o.react || '', good: o.good, line: q.line });
    }
  }
  return { id, name: who.name, role: who.role, hint: who.hint, items };
}

export const ALBUM = [
  ...Object.keys(NPCS).map(id => entry(id, NPCS[id], NPCS[id].questions)),
  entry('mom', MOM, Object.values(MOM.questions)),
];

export const ALBUM_KEYS = new Set(ALBUM.flatMap(e => e.items.map(it => it.key)));

export function albumCount(have) {
  let got = 0;
  for (const k of ALBUM_KEYS) if (have.has(k)) got++;
  return { got, total: ALBUM_KEYS.size };
}
