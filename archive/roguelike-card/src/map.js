// 分叉路图生成。规则见 docs/GDD.md 第 8 节。
import { NORMAL_POOL, ACT_BOSS } from './data/npcs.js';
import { EVENT_POOL } from './data/events.js';

export const ACTS = [
  { name: '公司', rows: 6, subtitle: '下午 6:00。收拾包，别回头。' },
  { name: '路上', rows: 6, subtitle: '出了大楼，离家还有一整座城。' },
  { name: '到家', rows: 3, subtitle: '进门不等于吃到。' },
];

export const NODE_TYPES = {
  fight: { label: '遭遇', icon: '💬' },
  elite: { label: '精英', icon: '⚡' },
  rest:  { label: '补给', icon: '🍵' },
  event: { label: '事件', icon: '❓' },
  boss:  { label: 'BOSS', icon: '👔' },
};

const TYPE_WEIGHTS = [
  { w: 50, v: 'fight' },
  { w: 30, v: 'event' },
  { w: 15, v: 'rest' },
  { w: 5, v: 'elite' },
];

export function generateMap(rng) {
  const usedEvents = new Set();
  return ACTS.map((actDef, ai) => {
    const act = ai + 1;
    const rows = [];
    for (let r = 0; r < actDef.rows; r++) {
      const last = r === actDef.rows - 1;
      let cols;
      if (last) cols = [1];
      else {
        const k = rng.int(2, 3);
        cols = k === 3 ? [0, 1, 2] : rng.shuffle([0, 1, 2]).slice(0, 2).sort();
      }
      rows.push(cols.map(col => ({ col, type: null, done: false, next: [] })));
    }

    rows.forEach((row, r) => {
      const last = r === rows.length - 1;
      row.forEach(node => {
        if (last) node.type = 'boss';
        else if (r === 0) node.type = 'fight';
        else node.type = rng.weighted(TYPE_WEIGHTS);
      });
    });
    // 倒数第二层保证有补给
    const pen = rows[rows.length - 2];
    if (!pen.some(n => n.type === 'rest')) rng.pick(pen).type = 'rest';

    rows.forEach(row => row.forEach(node => {
      if (node.type === 'fight' || node.type === 'elite') node.npc = rng.pick(NORMAL_POOL[act]);
      if (node.type === 'boss') node.npc = ACT_BOSS[act];
      if (node.type === 'event') {
        const pool = EVENT_POOL[act].filter(e => !usedEvents.has(e));
        const pick = rng.pick(pool.length ? pool : EVENT_POOL[act]);
        usedEvents.add(pick);
        node.event = pick;
      }
    }));

    // 连边：列号相差 ≤ 1；保证每个节点至少一进一出
    for (let r = 0; r < rows.length - 1; r++) {
      const cur = rows[r], nxt = rows[r + 1];
      const nearest = (list, col) => {
        let best = 0;
        list.forEach((n, i) => { if (Math.abs(n.col - col) < Math.abs(list[best].col - col)) best = i; });
        return best;
      };
      cur.forEach(n => {
        n.next = nxt.map((m, i) => ({ m, i })).filter(({ m }) => Math.abs(m.col - n.col) <= 1).map(({ i }) => i);
        if (!n.next.length) n.next = [nearest(nxt, n.col)];
      });
      nxt.forEach((m, i) => {
        if (!cur.some(n => n.next.includes(i))) {
          const j = nearest(cur, m.col);
          cur[j].next.push(i);
          cur[j].next.sort((a, b) => a - b);
        }
      });
    }
    return { name: actDef.name, subtitle: actDef.subtitle, rows };
  });
}
