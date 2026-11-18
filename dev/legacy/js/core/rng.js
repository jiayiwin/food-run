// 可复现的随机数（mulberry32）。状态可存档，测试和每日挑战用同一个种子会跑出同一局。
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = {
    get state() { return s; },
    set state(v) { s = v >>> 0; },
    next() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + rng.next() * (b - a); },
    int(a, b) { return a + Math.floor(rng.next() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    chance(p) { return rng.next() < p; },
    weighted(items) {           // [{ w, v }]
      let r = rng.next() * items.reduce((a, b) => a + b.w, 0);
      for (const it of items) { r -= it.w; if (r <= 0) return it.v; }
      return items[items.length - 1].v;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },
  };
  return rng;
}

export function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }

// 日期种子：同一天所有人跑同一局（每日挑战）
export function daySeed(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  let h = 2166136261;
  for (const c of `${y}-${m}-${d}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
