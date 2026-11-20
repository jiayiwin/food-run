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

// 子随机流：同一个种子按用途拆成互不干扰的几条流（路线、路口灯态、电梯停层……），调一个机制不会把整条路洗牌
//   lift 电梯停层节拍、stairs 楼梯间的障碍、liftQ 电梯里同事出的题（不动这一局的 run.rng：两条路出了大门以后的题目一样）
//   family / story 家庭剧本抽家、抽故事（自由下班、今日挑战）；door 门口弱情况轮换（同种子同一道题）
export const SALT = { course: 0x9e3779b9, cross: 0xc2b2ae35, lift: 0x165667b1, splash: 0x27d4eb2f, assist: 0x85ebca6b, stairs: 0x510e527f, liftQ: 0x3c6ef372, family: 0x6a09e667, story: 0xbb67ae85, door: 0x51ed270b };
export const subRng = (seed, salt) => makeRng(((seed >>> 0) ^ salt) >>> 0);

export function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }

// 日期种子：同一天所有人跑同一局（每日挑战）
export function daySeed(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  let h = 2166136261;
  for (const c of `${y}-${m}-${d}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
