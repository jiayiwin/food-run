// 家庭剧本的画面：家门口（谁走出来答题、谁站在门框里、门上贴的东西）、饭桌（底色、灯、家具、谁坐在哪）、
// 路上的拾取物、HUD 便签和货架上的小图标。人物都是 AI 立绘（骨骼角色用 person()，橘子用三张姿势图）；家具、小道具全部代码画（0KB）。
import { person, idlePose, cheerPose, runPose, POSE_BASE, handPoint } from './rig.js';
import { lookOf, hero, heroGender } from './looks.js';
import { propArt } from './art.js';
import { INK, roundRect, text as drawText, clamp } from './draw.js';
import { gfx } from '../gfx/gfx.js';
import { bake, bakeSticker, bakeTemp, makeLru, fromImage, BAKE_RES } from '../gfx/tex.js';
import { MEMBERS } from '../data/family.js';
import { errandOpen, doorAsker } from '../game/story.js';

// ── 场景表 ─────────────────────────────────────────────────────────
//   cast.at：'walk' 答题人从门里走到屏幕 x=330（门口三个人时 288，见 doorSlots）；'frame' 站在门框里。答题人永远是走出来的那个：
//   答题人能提前知道时一开始就站对（doorAsker），不知道时先站 cast[0]，预出题那一刻淡入淡出换过来
//   故事的 guests（周三奶奶来住）也算门口的人
export const DOOR_SCENES = {
  parents: { open: true, cast: [{ who: 'mom', at: 'walk' }, { who: 'dad', at: 'frame' }], decor: ['tvGlow'] },
  share: { open: true, cast: [{ who: 'dapeng', at: 'walk', lean: -6 }], decor: ['billNote'] },
  cat: { open: false, cast: [{ who: 'juzi', at: 'walk' }], decor: ['shardsIfAngry'] },
  kid: { open: true, cast: [{ who: 'duoduo', at: 'walk' }, { who: 'laolao', at: 'frame' }], decor: ['kidDrawing'] },
  nainai: { open: true, cast: [{ who: 'nainai', at: 'walk' }], decor: ['fu'] },
};
//   seats：[成员, 位置, 最低档位]。'stand' 右边站着（W−62，有娃家 W−64）；'back' 桌子后面坐着（桌子挡住下半身）；'chair' 对面椅子（猫）；'kid' 儿童高脚椅（W−112）
//   故事的 guests（周三来住的奶奶）站在主角身后（左边，一桌人往右让 14），站位表见 DINNER_POS
export const DINNER_SCENES = {
  parents: { bg: ['#ffe2b8', '#ffb88c'], floor: '#c08552', lamp: 'pendant', seats: [['mom', 'stand', 2], ['dad', 'back', 1]], decor: ['tv'] },
  share: { bg: ['#e8eef5', '#c9d3e0'], floor: '#9aa6b5', lamp: 'tube', table: 'fold', stool: 'box', seats: [['dapeng', 'stand', 1]], decor: ['fridge'] },
  cat: { bg: ['#ffe9b0', '#d9a066'], floor: '#a8744a', lamp: 'desk', table: 'small', seats: [['juzi', 'chair', 0]], decor: ['laptop', 'vignette'] },
  kid: { bg: ['#fff1b8', '#ffc96b'], floor: '#c9925a', lamp: 'pendant', seats: [['duoduo', 'kid', 0], ['laolao', 'stand', 1]], decor: ['blocks', 'phone3'] },
  nainai: { bg: ['#ffd2b8', '#e88a6a'], floor: '#a85a3e', lamp: 'pendant', table: 'round', seats: [['nainai', 'stand', 0]], decor: ['fuWall'] },
};

// ── 表情：答好换 happy 头、答坏换 angry 头（按 id 缓存一份带表情的外观）────────
const moodLooks = new Map();
export function moodLook(id, mood) {
  const base = lookOf(id), key = `${id}|${mood || ''}`;
  let l = moodLooks.get(key);
  if (!l) {
    l = { ...base, id: `${base.id || id}:${mood || 'n'}` };
    if (mood === 'happy') { l.eyes = 'happy'; l.mouth = 'smile'; }
    if (mood === 'angry') { l.mood = 'angry'; l.eyes = 'squint'; l.mouth = 'open'; }
    moodLooks.set(key, l);
  }
  if (l.art !== base.art) l.art = base.art;          // 美术图异步加载完后跟上
  return l;
}

// ── 橘子：三张姿势图（sit 坐、meow 张嘴叫、rub 蹭腿），原点在脚底中点；图没加载时代码画一只橘猫 ──
const catVec = pose => bake(`cat|${pose}`, [-20, -42, 42, 44], g => {
  g.lineWidth = 2.2; g.strokeStyle = INK; g.fillStyle = '#f39c3c';
  g.beginPath(); g.ellipse(-2, -12, 13, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();            // 身子
  g.beginPath(); g.arc(6, pose === 'meow' ? -30 : -27, 10, 0, Math.PI * 2); g.fill(); g.stroke();   // 头
  g.beginPath(); g.moveTo(0, -35); g.lineTo(2, -43); g.lineTo(7, -36); g.moveTo(9, -36); g.lineTo(14, -42); g.lineTo(15, -33); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(4, -10, 6, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.beginPath(); g.arc(11, -28, 1.6, 0, Math.PI * 2); g.fill();
  if (pose === 'meow') { g.fillStyle = '#7a2b3a'; g.beginPath(); g.ellipse(13, -24, 2.4, 3, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#f39c3c'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-13, -6); g.quadraticCurveTo(-22, pose === 'rub' ? -30 : -4, -16, pose === 'rub' ? -38 : 0); g.stroke();
});
export function catTex(pose) {
  const a = propArt(`juzi_${pose}`);
  return a ? fromImage(`prop|juzi_${pose}|${a.src}`, a.img, a.w, a.h, { ox: a.w / 2, oy: a.h }) : catVec(pose);
}
// ── 手里的小道具：奶奶端的一碗饺子（端平，画在前手的位置）────────────
const bowlTex = () => bake('hold|bowl', [-12, -12, 24, 16], g => {
  g.lineWidth = 1.8; g.strokeStyle = INK;
  g.fillStyle = '#fff8ec'; for (const [dx, dy] of [[-5, -5], [1, -7], [6, -4], [-1, -3]]) { g.beginPath(); g.ellipse(dx, dy, 4.2, 3, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-10, -2); g.lineTo(10, -2); g.quadraticCurveTo(9, 3, 0, 3.5); g.quadraticCurveTo(-9, 3, -10, -2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#4aa3a2'; g.fillRect(-8.5, 0, 17, 1.4);
});

// ── 门口 ─────────────────────────────────────────────────────────
// 门上的东西（landmarks 画完门以后调）：x 门左缘、open 0..1 门开了多少（开了就是暖光 + 爸妈家的电视蓝光）
export function drawDoorDecor(run, x, open, t) {
  const fam = run.story.fam, sc = DOOR_SCENES[fam.id] || DOOR_SCENES.parents;
  const lit = Math.max(open, sc.open && doorShown(run) ? 1 : 0);
  if (lit > 0) {
    gfx.rect(x + 4, -134, 56, 132, { fill: '#ffe9b0', alpha: lit * 0.9 });
    if (sc.decor.includes('tvGlow')) gfx.rect(x + 8, -120, 48, 70, { fill: '#7fb8ff', alpha: lit * (0.25 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.3)) });
  }
  if (sc.decor.includes('billNote')) {
    gfx.save(); gfx.translate(x + 40, -96); gfx.rotate(0.12);
    gfx.rect(-10, -9, 20, 18, { fill: '#fff27a', stroke: INK, lw: 1.2 });
    gfx.text('电费', 0, -3, { size: 6, color: INK }); gfx.text('AA', 0, 4, { size: 6, color: '#c0392b' });
    gfx.restore();
  }
  if (sc.decor.includes('kidDrawing')) gfx.draw(kidDrawingTex(), x + 20, -92);
  if (sc.decor.includes('fu')) gfx.draw(fuTex(), x + 31, -104, { sx: 0.8, sy: 0.8 });
  if (sc.decor.includes('shardsIfAngry') && run.flags.momAngry) gfx.draw(shardsTex(), x - 26, 0);   // 挂了猫咪摄像头：门口满地碎杯子
}
const kidDrawingTex = () => bake('door|kid', [-14, -12, 28, 24], g => {
  g.fillStyle = '#fff'; g.fillRect(-12, -10, 24, 20); g.lineWidth = 1.2; g.strokeStyle = INK; g.strokeRect(-12, -10, 24, 20);
  g.fillStyle = '#ffd166'; g.beginPath(); g.arc(6, -4, 3.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff6b5a'; g.lineWidth = 1.4; g.beginPath(); g.arc(-4, -2, 2.4, 0, Math.PI * 2); g.moveTo(-4, 0.5); g.lineTo(-4, 5); g.moveTo(-7, 2.5); g.lineTo(-1, 2.5); g.moveTo(-4, 5); g.lineTo(-6, 8); g.moveTo(-4, 5); g.lineTo(-2, 8); g.stroke();
  g.strokeStyle = '#4caf7a'; g.beginPath(); g.moveTo(-11, 8); g.lineTo(11, 8); g.stroke();
});
const fuTex = () => bake('door|fu', [-14, -14, 28, 28], g => {
  g.save(); g.rotate(Math.PI / 4); g.fillStyle = '#d9342b'; g.fillRect(-9, -9, 18, 18); g.lineWidth = 1.4; g.strokeStyle = INK; g.strokeRect(-9, -9, 18, 18); g.restore();
  drawText(g, '福', 0, 1, { size: 13, color: '#ffd166' });
});
const shardsTex = () => bake('door|shards', [-22, -8, 44, 10], g => {
  g.fillStyle = '#dff3ff'; g.strokeStyle = INK; g.lineWidth = 1.2;
  for (const [x, w, h] of [[-18, 6, 5], [-8, 4, 7], [2, 7, 4], [12, 5, 6]]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w / 2, -h); g.lineTo(x + w, 0); g.closePath(); g.fill(); g.stroke(); }
});

// 家门口的人什么时候出现：进入回家路段、门口槽开始预出题以后（和以前的妈妈一样），吃饭演出开始前
function doorShown(run) {
  const i = run.lv.slots.findIndex(s => s.kind === 'mom');
  const pend = run.pending;
  return i >= 0 && (run.slotIdx >= i || !!(pend && pend.slot.kind === 'mom')) && (!run.ending || run.ending.t < 0.8);
}
// 这一局门口的人：答题人（走出来）+ 其他人（门框里）。
//   答题人能提前知道（钩子故事是交代事情的那位、关卡 / 故事写死的题、只有一个人的家，见 story.js 的 doorAsker）时，从一出来就是他；
//   不能提前知道（爸妈家平常日可能是爸爸问、有娃家可能是姥姥问）时先按 cast[0] 站，预出题那一刻再换人（drawDoorScene 里淡入淡出）
const askerMemo = new Map();
const knownAsker = st => { if (!askerMemo.has(st.key)) askerMemo.set(st.key, doorAsker(st)); return askerMemo.get(st.key); };
export function doorCast(run) {
  const st = run.story, sc = DOOR_SCENES[st.fam.id] || DOOR_SCENES.parents;
  const c = run.choice, pend = run.pending;
  const asking = c && c.kind === 'mom' ? c : null, pq = pend && pend.slot.kind === 'mom' ? pend.q : null;
  const who = asking ? asking.npc : pq ? pq.npc : run.fam.door ? run.fam.door.who : knownAsker(st) || sc.cast[0].who;
  const all = [...new Set([...sc.cast.map(x => x.who), ...(st.st.guests || [])])];
  return { who, frame: all.filter(m => m !== who), asking, lean: (sc.cast.find(x => x.who === who) || {}).lean || 0 };
}
// 门口站位（屏幕 x）：门还在画面外时一起迎出来，答题人站在最左（最远到 capW），其他人依次站在他身后；门进了画面就回到门口。
//   只有一个人在身后：330 / 352（和以前一样，挨着站）；两个人在身后（周三奶奶来住）：288 / 318 / 348（间距 30），三个人都完整在屏幕里、不互相压
export function doorSlots(n, dsx, fsx0) {
  const S = n > 1 ? 30 : 22, R = n > 1 ? 348 : 352;
  return {
    walk: Math.min(dsx, R - Math.max(1, n) * S),
    frame: Array.from({ length: n }, (_, i) => Math.min(n > 1 ? dsx + (i + 1) * S : fsx0, R - (n - 1 - i) * S)),
  };
}
export const DOOR_FADE = 0.4;                // 预出题时换了答题人：两个人的位置淡入淡出换过来（不瞬移）
function doorLayout(run, V, who, frame) {
  const pos = doorSlots(frame.length, V.sx(run.lv.end + 30), V.sx(run.lv.end + 40));
  const out = new Map([[who, { x: pos.walk, walk: true }]]);
  frame.forEach((m, i) => out.set(m, { x: pos.frame[i], i }));
  return out;
}
// 世界层里画门口的人（drawNpcs 调）：答好欢呼 + happy 头，答坏 angry 头、门框里的人缩回去半个身子
export function drawDoorScene(run, V, vis, t) {
  if (!doorShown(run)) return;
  const toW = sx => V.camX + sx / V.z;
  const { who, frame, asking } = doorCast(run);
  if (vis.doorWho !== who) {                 // 换人了（猜的 cast[0] 不是真正问话的人）：记下从谁换过来
    if (vis.doorWho != null) vis.doorFade = { from: vis.doorWho, t };
    vis.doorWho = who;
  }
  const lay = doorLayout(run, V, who, frame), dsx = V.sx(run.lv.end + 30);
  const good = asking && asking.res ? asking.res.good : run.fam.door ? run.fam.door.good : null;
  const answered = good != null;
  const fade = vis.doorFade && t - vis.doorFade.t < DOOR_FADE ? vis.doorFade : null;
  const old = fade ? doorLayout(run, V, fade.from, [who, ...frame].filter(m => m !== fade.from)) : null;
  const k = fade ? clamp((t - fade.t) / DOOR_FADE, 0, 1) : 1;
  // 一个人在某个位置上的样子：答题位（走出来 / 欢呼 / 读题）或身后的位置（站着；答坏了缩回去半个身子）
  const drawAt = (m, p, alpha) => {
    if (alpha <= 0.01) return;
    if (p.walk) {
      const walking = p.x < dsx - 1;
      const pose = good === true ? cheerPose(t) : walking ? runPose((t * 1.1) % 1, 0.05) : idlePose(t);
      const mood = good === true ? 'happy' : good === false ? 'angry' : null;
      drawMember(m, toW(p.x), pose, mood, -1, t, { walking, asking: !!(asking && asking.phase === 'open'), good, alpha });
    } else {
      const back = answered && good === false ? 12 : 0;
      drawMember(m, toW(p.x) + back, idlePose(t + p.i), null, -1, t, { alpha: alpha * (back ? 0.75 : 1) });
    }
  };
  // 先画身后的人，答题人最后画（在最前面）；淡入淡出时同一个人在新旧两个位置各画一次（位置没变的只画一次）
  for (const m of [...frame, who]) {
    const p = lay.get(m), q = old && old.get(m);
    if (!q || (Math.abs(q.x - p.x) < 2 && !!q.walk === !!p.walk)) { drawAt(m, p, 1); continue; }
    drawAt(m, q, 1 - k);
    drawAt(m, p, k);
  }
  if (asking) vis.npcSX = lay.get(who).x;
}
// 一个家里人：骨骼角色 or 猫。face -1 朝左（看着主角）
export function drawMember(id, x, pose, mood, face, t, { y = 0, alpha = 1, scale = 1, walking = false, asking = false, good = null, bowl = true } = {}) {
  if (MEMBERS[id] && MEMBERS[id].cat) {
    const p = good === true ? 'rub' : walking ? 'rub' : asking ? 'meow' : 'sit';
    const f = good === false ? 1 : face;                   // 答坏：背对着你坐下
    gfx.save(); gfx.alpha(alpha);
    gfx.draw(catTex(p), x, y + (walking ? -Math.abs(Math.sin(t * 9)) * 2 : 0), { sx: (f < 0 ? -1 : 1) * scale * 1.1, sy: scale * 1.1 * (1 + 0.02 * Math.sin(t * 3)) });
    gfx.restore();
    return;
  }
  const look = moodLook(id, mood);
  person(gfx, x, y, look, pose, { flip: face, alpha, scale });
  if (id === 'nainai' && bowl) { const [hx, hy] = handPoint(look, pose, { flip: face, scale }); gfx.draw(bowlTex(), x + hx, y + hy - 3 * scale, { sx: scale, sy: scale, alpha }); }   // 端平的一碗饺子
}

// ── 路上的拾取物：家里要的东西（只在交代过、还没办时画）────────────────
const errandBagVec = g => {
  g.lineWidth = 2; g.strokeStyle = INK;
  g.fillStyle = '#ffb347'; roundRect(g, -11, -9, 22, 18, 4); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-5, -9); g.quadraticCurveTo(0, -17, 5, -9); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(-6, -3, 12, 5);
};
const errandBoxVec = g => {
  g.lineWidth = 2; g.strokeStyle = INK; g.fillStyle = '#c98a4b'; roundRect(g, -14, -10, 28, 20, 2); g.fill(); g.stroke();
  g.fillStyle = '#e8c08a'; g.fillRect(-3, -10, 6, 20); g.strokeRect(-3, -10, 6, 20);
};
const ringTex = () => bake('errand|ring', [-26, -26, 52, 52], g => { g.strokeStyle = '#ffd166'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke(); });
const tagTex = () => bake('errand|tag', [-11, -11, 22, 20], g => {
  g.fillStyle = '#e74c3c'; roundRect(g, -9, -9, 18, 16, 4); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  drawText(g, '家', 0, -1, { size: 11, color: '#fff' });
});
// 快递柜（外卖袋挂在旁边）：背景，不加外圈，画在后人行道上
const lockerTex = () => bake('errand|locker', [-22, -60, 44, 62], g => {
  g.fillStyle = '#8fa3b8'; g.fillRect(-20, -56, 40, 56); g.lineWidth = 1.6; g.strokeStyle = INK; g.strokeRect(-20, -56, 40, 56);
  g.strokeStyle = 'rgba(43,34,51,.6)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(-20, -56 + i * 14); g.lineTo(20, -56 + i * 14); g.stroke(); }
  g.beginPath(); g.moveTo(0, -56); g.lineTo(0, 0); g.stroke();
  g.fillStyle = '#3d7a5a'; g.fillRect(-16, -52, 10, 6);
});
export function drawErrandPickup(run, pk, t) {
  if (!errandOpen(run)) return;
  const bob = Math.sin(t * 4) * 2;
  if (pk.shape === 'bag') gfx.draw(lockerTex(), pk.x + 26, -8, { alpha: 0.9 });
  gfx.draw(ringTex(), pk.x, pk.y + bob, { alpha: 0.5 + 0.2 * Math.sin(t * 5) });
  const art = pk.shape === 'parcel' && propArt('errandBox');
  if (art) gfx.draw(fromImage(`prop|errandBox|${art.src}`, art.img, art.w, art.h, { ox: art.w / 2, oy: art.h / 2 }), pk.x, pk.y + bob);
  else gfx.draw(bakeSticker(`errand|${pk.shape}`, [-16, -18, 32, 30], pk.shape === 'bag' ? errandBagVec : errandBoxVec), pk.x, pk.y + bob);
  gfx.draw(tagTex(), pk.x, pk.y - 26 + bob);
}

// ── 小图标：HUD 便签、货架第 3 格（瓶子、纸箱、卷纸、外卖袋、罐头、贴纸、糖、时钟）───────
export const iconTex = (shape, s = 1) => bake(`ico|fam|${shape}|${s}`, [-12 * s, -12 * s, 24 * s, 24 * s], g => {
  g.scale(s, s); g.lineWidth = 1.6; g.strokeStyle = INK;
  if (shape === 'bottle') { g.fillStyle = '#5a2e1a'; roundRect(g, -5, -6, 10, 15, 3); g.fill(); g.stroke(); g.fillRect(-2, -10, 4, 5); g.strokeRect(-2, -10, 4, 5); g.fillStyle = '#ffd166'; g.fillRect(-4, -1, 8, 4); }
  else if (shape === 'box') { g.fillStyle = '#c98a4b'; g.fillRect(-8, -6, 16, 13); g.strokeRect(-8, -6, 16, 13); g.fillStyle = '#e8c08a'; g.fillRect(-2, -6, 4, 13); }
  else if (shape === 'roll') { g.fillStyle = '#fff'; roundRect(g, -7, -7, 14, 14, 3); g.fill(); g.stroke(); g.fillStyle = '#d8cfc4'; g.beginPath(); g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fill(); g.stroke(); }
  else if (shape === 'bag') { g.fillStyle = '#ffb347'; roundRect(g, -7, -4, 14, 12, 3); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-3, -4); g.quadraticCurveTo(0, -10, 3, -4); g.stroke(); }
  else if (shape === 'can') { g.fillStyle = '#f39c12'; roundRect(g, -7, -6, 14, 13, 2); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0.5, 3, 0, Math.PI * 2); g.fill(); }
  else if (shape === 'sticker') { g.fillStyle = '#ff6b9d'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.5 : 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); }
  else if (shape === 'candy') { g.fillStyle = '#e67e22'; g.beginPath(); g.ellipse(0, 0, 6, 4.5, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6, 0); g.lineTo(-10, -4); g.lineTo(-10, 4); g.closePath(); g.moveTo(6, 0); g.lineTo(10, -4); g.lineTo(10, 4); g.closePath(); g.fill(); g.stroke(); }
  else if (shape === 'clock') { g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -4.5); g.moveTo(0, 0); g.lineTo(3.5, 1.5); g.stroke(); }
});
export const ITEM_SHAPE = { soy: 'bottle', tissue: 'roll', catfood: 'can', sticker: 'sticker', candy: 'candy' };

// ── 饭桌 ─────────────────────────────────────────────────────────
// 背景（墙、灯、光、地板、家具）按家庭烘焙一张全屏图（2 倍分辨率，812 屏约 4.9MB 显存）：只留当前这个家的一张，
// 换家时释放上一张（五种家都回过也只常驻一张）。fy 地板、ty 桌面、stool 凳面、hx 主角（和凳子）往右挪多少（有客人站在身后时）
const bgSlot = makeLru(1, t => gfx.release(t));
export const dinnerBgSize = () => bgSlot.size;
export function dinnerBg(L, fam, fy, ty, stool, hx = 0) {
  const sc = DINNER_SCENES[fam] || DINNER_SCENES.parents, W = L.W;
  const wy = Math.max(L.H * 0.3 + 92, ty - 140);          // 墙上的东西（电视、冰箱顶、福字、书架）：在「今晚吃」那几行字下面、人头上面，矮屏也不压字
  const key = `dinner|${fam}|${L.H}|${hx}`;
  return bgSlot.get(key, () => bakeTemp(key, [0, 0, W, L.H], g => {
    const gr = g.createLinearGradient(0, 0, 0, L.H); gr.addColorStop(0, sc.bg[0]); gr.addColorStop(1, sc.bg[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, L.H);
    g.strokeStyle = INK; g.lineWidth = 2;
    if (sc.lamp === 'pendant') {
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, L.H * 0.2); g.stroke();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.moveTo(W / 2 - 40, L.H * 0.24); g.lineTo(W / 2 - 18, L.H * 0.2); g.lineTo(W / 2 + 18, L.H * 0.2); g.lineTo(W / 2 + 40, L.H * 0.24); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,240,180,.35)'; g.beginPath(); g.moveTo(W / 2 - 40, L.H * 0.24); g.lineTo(W / 2 - 150, L.H * 0.7); g.lineTo(W / 2 + 150, L.H * 0.7); g.lineTo(W / 2 + 40, L.H * 0.24); g.fill();
    } else if (sc.lamp === 'tube') {                                   // 合租屋：顶上一根灯管，冷白光
      g.fillStyle = '#ffffff'; roundRect(g, W / 2 - 70, L.H * 0.08, 140, 10, 5); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(W / 2 - 70, L.H * 0.09); g.lineTo(W / 2 - 170, L.H * 0.7); g.lineTo(W / 2 + 170, L.H * 0.7); g.lineTo(W / 2 + 70, L.H * 0.09); g.fill();
    } else if (sc.lamp === 'desk') {                                   // 一人一猫：台灯的暖黄
      g.fillStyle = 'rgba(255,230,150,.45)'; g.beginPath(); g.arc(W / 2 + 20, ty - 30, 160, 0, Math.PI * 2); g.fill();
    }
    if (sc.decor.includes('tv')) {                                     // 爸妈家：墙上一台电视（爸爸身后）
      g.fillStyle = '#3a3346'; roundRect(g, W - 132, wy, 92, 58, 6); g.fill(); g.stroke();
      g.fillStyle = '#7fb8ff'; g.fillRect(W - 125, wy + 7, 78, 44);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(W - 117, wy + 14, 30, 6);
    }
    if (sc.decor.includes('fridge')) {                                 // 合租屋：冰箱上贴便签
      g.fillStyle = '#f4f6f8'; roundRect(g, W - 96, wy, 70, fy - wy, 8); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(W - 96, wy + 70); g.lineTo(W - 26, wy + 70); g.stroke();
      g.fillStyle = '#fff27a'; g.fillRect(W - 80, wy + 18, 22, 20); g.strokeRect(W - 80, wy + 18, 22, 20);
      drawText(g, '电费AA', W - 69, wy + 28, { size: 6, color: INK });
    }
    if (sc.decor.includes('fuWall')) {                                 // 奶奶家：墙上一个福字
      g.save(); g.translate(W - 70, wy + 30); g.rotate(Math.PI / 4); g.fillStyle = '#d9342b'; g.fillRect(-24, -24, 48, 48); g.strokeRect(-24, -24, 48, 48); g.restore();
      drawText(g, '福', W - 70, wy + 32, { size: 34, color: '#ffd166' });
    }
    if (sc.decor.includes('laptop')) {                                 // 一人一猫：墙边的小书架
      g.fillStyle = '#c9925a'; g.fillRect(W - 120, (wy + 30), 90, 8); g.strokeRect(W - 120, (wy + 30), 90, 8);
      for (const [dx, h, c] of [[0, 30, '#5b8fd6'], [12, 24, '#ff8a7a'], [22, 34, '#7fbf5a']]) { g.fillStyle = c; g.fillRect(W - 112 + dx, (wy + 30) - h, 10, h); g.strokeRect(W - 112 + dx, (wy + 30) - h, 10, h); }
    }
    g.fillStyle = sc.floor; g.fillRect(0, fy, W, L.H - fy);
    if (sc.decor.includes('blocks')) for (const [x, c] of [[30, '#ff6b5a'], [48, '#ffd166'], [40, '#5b8fd6'], [W - 30, '#7fbf5a']]) { g.fillStyle = c; g.fillRect(x, fy + 14 + (x % 7), 12, 12); g.lineWidth = 1.6; g.strokeRect(x, fy + 14 + (x % 7), 12, 12); }
    // 主角的凳子：合租屋是快递箱
    if (sc.stool === 'box') { g.fillStyle = '#c98a4b'; g.fillRect(hx + 50, stool - 4, 78, fy - stool + 4); g.lineWidth = 2; g.strokeRect(hx + 50, stool - 4, 78, fy - stool + 4); g.fillStyle = '#e8c08a'; g.fillRect(hx + 83, stool - 4, 12, fy - stool + 4); }
    else { g.fillStyle = '#8b5a2b'; g.fillRect(hx + 54, stool, 70, 10); g.fillRect(hx + 62, stool + 10, 8, fy - stool - 10); g.fillRect(hx + 108, stool + 10, 8, fy - stool - 10); }
    if (sc.decor.includes('vignette')) {                               // 四个角压暗
      const vg = g.createRadialGradient(W / 2, L.H * 0.5, L.H * 0.25, W / 2, L.H * 0.5, L.H * 0.75);
      vg.addColorStop(0, 'rgba(60,30,10,0)'); vg.addColorStop(1, 'rgba(60,30,10,.45)'); g.fillStyle = vg; g.fillRect(0, 0, W, L.H);
    }
  }, { res: Math.min(2, BAKE_RES) }));
}
// 饭桌上一桌人整体往右挪多少：有客人（周三来住的奶奶）站在主角身后时，主角、凳子、碗、桌子后面的爸爸、右边站着的妈妈一起往右让 14，
// 客人的发髻不贴左边缘、脸不被主角的马尾 / 书包压住；主角的脸还在碗的左边（只挪主角会被碗挡住脸），妈妈的头发不出右边缘
export const dinnerHeroDx = result => ((result.family && result.family.guests) || []).length ? 14 : 0;
// 桌子前景（挡住桌子后面那人的下半身）：按家庭换桌型
export function dinnerTable(g, L, fam, ty, fy) {
  const sc = DINNER_SCENES[fam] || DINNER_SCENES.parents, W = L.W;
  g.lineWidth = 2.6; g.strokeStyle = INK;
  if (sc.table === 'round') {
    g.fillStyle = '#b5482f'; g.beginPath(); g.ellipse((120 + W - 90) / 2, ty + 6, (W - 210) / 2 + 14, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#8b3a26'; g.fillRect((120 + W - 90) / 2 - 8, ty + 16, 16, fy - ty - 16);
  } else if (sc.table === 'fold') {
    g.fillStyle = '#d8dde4'; roundRect(g, 120, ty, W - 210, 12, 3); g.fill(); g.stroke();
    g.strokeStyle = '#6b7380'; g.lineWidth = 3; g.beginPath(); g.moveTo(140, ty + 12); g.lineTo(W - 110, fy); g.moveTo(W - 110, ty + 12); g.lineTo(140, fy); g.stroke();
  } else if (sc.table === 'small') {
    g.fillStyle = '#c9925a'; roundRect(g, 130, ty, W - 240, 14, 4); g.fill(); g.stroke();
    g.fillStyle = '#8b5a2b'; g.fillRect(142, ty + 14, 9, fy - ty - 14); g.fillRect(W - 122, ty + 14, 9, fy - ty - 14);
  } else {
    g.fillStyle = '#a0522d'; roundRect(g, 120, ty, W - 210, 16, 5); g.fill(); g.stroke();
    g.fillStyle = '#8b4513'; g.fillRect(132, ty + 16, 10, fy - ty - 16); g.fillRect(W - 112, ty + 16, 10, fy - ty - 16);
  }
}
const laptopTex = () => bake('dinner|laptop', [-24, -30, 48, 32], g => {
  g.lineWidth = 2; g.strokeStyle = INK; g.fillStyle = '#9aa3b5'; roundRect(g, -16, -28, 30, 22, 3); g.fill(); g.stroke();
  g.fillStyle = '#7fd1ff'; g.fillRect(-13, -25, 24, 16); g.fillStyle = '#9aa3b5'; roundRect(g, -22, -6, 42, 5, 2); g.fill(); g.stroke();
});
const highChairTex = () => bake('dinner|chair', [-26, -62, 52, 64], g => {
  g.lineWidth = 2.2; g.strokeStyle = INK; g.fillStyle = '#ff9f43';
  g.fillRect(-18, -60, 6, 60); g.fillRect(12, -60, 6, 60); g.strokeRect(-18, -60, 6, 60); g.strokeRect(12, -60, 6, 60);
  g.fillStyle = '#ffd166'; roundRect(g, -20, -34, 40, 8, 3); g.fill(); g.stroke();
  roundRect(g, -20, -62, 8, 30, 3); g.fill(); g.stroke();
});
const chairTex = () => bake('dinner|catchair', [-24, -70, 48, 72], g => {
  g.lineWidth = 2.2; g.strokeStyle = INK; g.fillStyle = '#8b5a2b';
  g.fillRect(-20, -34, 40, 8); g.strokeRect(-20, -34, 40, 8); g.fillRect(14, -68, 7, 68); g.strokeRect(14, -68, 7, 68); g.fillRect(-18, -26, 6, 26); g.strokeRect(-18, -26, 6, 26);
});
const phoneTex = () => bake('dinner|phone', [-16, -46, 32, 48], g => {
  g.lineWidth = 2; g.strokeStyle = INK; g.fillStyle = '#2b2233'; roundRect(g, -14, -44, 28, 44, 5); g.fill(); g.stroke();
  g.fillStyle = '#bfe3ff'; g.fillRect(-11, -40, 22, 34);
});
// 饭桌上的人（背景之后、桌子前景之前或之后）：seats 按档位出现；guests 站在主角身后（左边）
//   站位（屏幕 x）：右边站着的 W−62；有娃家姥姥 W−64、高脚椅 W−112、视频手机 W−154（姥姥的头发不出右边缘，手机不挡朵朵的脸）；
//   客人站在 x=38、0.82 倍（一桌人往右让 dinnerHeroDx；奶奶本来就矮，站在主角身后显得远一点）
export const DINNER_POS = { stand: 62, kidStand: 64, kidChair: 112, phone: 154, guest: 38, guestGap: 26, guestK: 0.82 };
export function drawDinnerPeople(L, result, t, fy, ty, stool, S, layer) {
  const fam = (result.family && result.family.id) || 'parents', sc = DINNER_SCENES[fam] || DINNER_SCENES.parents, W = L.W, P = DINNER_POS;
  const tier = result.meal.tier, bad = !!(result.family && result.family.door && result.family.door.good === false);
  const sit = { ...POSE_BASE, hipR: 88, knR: 88, hipL: 82, knL: 92, shR: 70, elR: 60, shL: 60, elL: 70, lean: 8 };
  const guests = (result.family && result.family.guests) || [], dx = dinnerHeroDx(result);
  if (layer === 'back') {
    for (const [who, at, min] of sc.seats) {
      if (tier < min || at !== 'back') continue;
      person(gfx, W - 125 + dx, stool + 25 * S, moodLook(who, bad ? null : 'happy'), sit, { flip: -1, scale: S * 0.92 });
    }
    // 来住的客人（周三的奶奶）：站在主角身后（左边）看你吃（主角和凳子往右让了 dinnerHeroDx；饺子已经端上桌，手里不再端碗）
    guests.forEach((who, i) => drawMember(who, P.guest + i * P.guestGap, idlePose(t), 'happy', 1, t, { y: fy, scale: S * P.guestK, bowl: false }));
    return;
  }
  const kid = sc.seats.some(s => s[1] === 'kid');
  for (const [who, at, min] of sc.seats) {
    if (tier < min) continue;
    if (at === 'stand') { const p = { ...idlePose(t), shR: 40, elR: 60 }; drawMember(who, W - (kid ? P.kidStand : P.stand) + dx, p, bad ? null : 'happy', -1, t, { y: fy, scale: S }); }
    else if (at === 'kid') { const x = W - P.kidChair; gfx.draw(highChairTex(), x, fy, { sx: 1.2, sy: 1.2 }); person(gfx, x - 2, fy - 32, moodLook(who, bad ? 'angry' : 'happy'), { ...sit, shR: 100 + Math.sin(t * 6) * 15, elR: 20 }, { flip: -1, scale: S * 0.95 }); }
    else if (at === 'chair') { gfx.draw(chairTex(), W - 70, fy, { sx: 1.1, sy: 1.1 }); drawMember(who, W - 74, null, null, bad ? 1 : -1, t, { y: fy - 36, scale: 1.9, good: bad ? false : null }); }
  }
}
// 有娃家立着的手机（配偶的视频）：晚饭 ≥2 档才有，和饭桌一句「{老婆}在视频里笑了」（家庭 dinner.top，≥2 档）同一条线
export const PHONE_TIER = 2;
// 桌上的东西（在碗旁边）：一人一猫的笔记本、有娃家 ≥2 档立着的手机（屏幕里是配偶的视频头像：男主角是老婆、女主角是老公）
export function drawDinnerTableTop(L, result, t, ty) {
  const fam = (result.family && result.family.id) || 'parents', sc = DINNER_SCENES[fam] || DINNER_SCENES.parents, W = L.W;
  if (sc.decor.includes('laptop')) gfx.draw(laptopTex(), W - 128, ty + 2);
  if (sc.decor.includes('phone3') && result.meal.tier >= PHONE_TIER) {
    const x = W - DINNER_POS.phone, y = ty + 1;
    gfx.draw(phoneTex(), x, y);
    const a = propArt(heroGender() === 'f' ? 'spouse_husband' : 'spouse_wife');
    if (a) gfx.draw(fromImage(`prop|spouse|${a.src}`, a.img, a.w, a.h, { ox: a.w / 2, oy: a.h }), x, y - 7, { sx: 20 / a.w, sy: 20 / a.w });
    else gfx.circle(x, y - 26, 9, { fill: '#ffd2b0', stroke: INK, lw: 1.6 });
  }
}
export { hero };
