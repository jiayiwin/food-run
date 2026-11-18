// 程序化人物骨架：关节角度 → 扁平卡通人。主角、NPC 共用，靠「外观」配置区分。
// 坐标：原点在脚底中点，y 向下为正（人物向上长，所以身体部件 y 是负数）。默认身高约 64 逻辑像素。
import { limb, blob, roundRect, INK, lerp } from './draw.js';
import { bake, fromImage } from '../gfx/tex.js';

const D = Math.PI / 180;

// 外观：颜色和配件
export const LOOKS = {
  player: { skin: '#ffd2b0', hair: '#2b2233', hairStyle: 'messy', shirt: '#ffffff', jacket: '#4b7bec', pants: '#2f3b52', shoes: '#ff6b5a', tie: '#ff6b5a', bag: '#f7b731', scale: 1 },
};

// 姿势：所有角度单位度；sh/el 肩肘，hip/kn 髋膝；l / r 是后侧 / 前侧（画在后面的先画）
export const POSE_BASE = { lean: 0, bob: 0, head: 0, shL: 10, elL: 30, shR: -10, elR: 30, hipL: 0, knL: 0, hipR: 0, knR: 0, squash: 1 };

// 跑步循环：phase 0..1
export function runPose(phase, speedK = 1) {
  const a = phase * Math.PI * 2;
  const s = Math.sin(a), c = Math.cos(a);
  const stride = 40 + 10 * speedK;
  // 腿往后摆、离地的那段膝盖折得最多（收腿），往前伸时膝盖较直
  const knee = v => 14 + Math.max(0, v) * 85;
  return {
    ...POSE_BASE,
    lean: 10 + 5 * speedK,
    bob: -Math.abs(s) * 3.5,
    head: -4,
    hipR: s * stride, knR: knee(-c),
    hipL: -s * stride, knL: knee(c),
    shR: -s * 55, elR: 75,
    shL: s * 55, elL: 75,
  };
}
export function jumpPose(vy) {          // vy < 0 上升，> 0 下落
  const up = vy < 0;
  return { ...POSE_BASE, lean: 8, head: up ? -10 : 4, hipR: up ? 70 : 35, knR: up ? 95 : 40, hipL: up ? -25 : 10, knL: up ? 70 : 60, shR: up ? 130 : 120, elR: up ? -20 : 15, shL: up ? -150 : -110, elL: 20 };
}
export function slidePose(t) {          // 滑铲：屁股贴地，上身后仰，前腿伸直、后腿屈膝
  return { ...POSE_BASE, lean: -62, bob: 17, head: 22, hipR: 92, knR: 4, hipL: 100, knL: 130, shR: -40, elR: 30, shL: -20, elL: 50 };
}
export function stumblePose(t) {        // 踉跄：前扑、手乱挥
  const w = Math.sin(t * 30) * 30;
  return { ...POSE_BASE, lean: 36, bob: 2, head: 16, hipR: 35, knR: 50, hipL: -35, knL: 25, shR: 120 + w, elR: 40, shL: -130 - w, elL: 40 };
}
export function idlePose(t) {
  const b = Math.sin(t * 2.4);
  return { ...POSE_BASE, bob: b * 0.8, head: b * 2, hipR: 4, hipL: -4, shR: 8, elR: 20, shL: -8, elL: 20 };
}
export function cheerPose(t) {
  const b = Math.sin(t * 10);
  return { ...POSE_BASE, bob: -Math.abs(b) * 6, head: -6, shR: 125 + b * 10, elR: -25, shL: -165 - b * 10, elL: 10, hipR: 8, hipL: -8 };
}
export function bikePose(phase) {      // 骑车：坐着，腿踩踏板，手扶车把
  const a = phase * Math.PI * 2;
  return { ...POSE_BASE, lean: 20, bob: -12, head: -6, hipR: 80 + Math.sin(a) * 25, knR: 95 - Math.sin(a) * 35, hipL: 80 - Math.sin(a) * 25, knL: 95 + Math.sin(a) * 35, shR: 75, elR: 20, shL: 70, elL: 25 };
}
export function mixPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(POSE_BASE)) o[k] = lerp(a[k] ?? POSE_BASE[k], b[k] ?? POSE_BASE[k], t);
  return o;
}

// 正向运动学：从根（髋）出发算各关节位置
function chain(x, y, len1, ang1, len2, ang2) {
  const a1 = ang1 * D, a2 = (ang1 + ang2) * D;
  const x1 = x + Math.sin(a1) * len1, y1 = y + Math.cos(a1) * len1;
  return [[x, y], [x1, y1], [x1 + Math.sin(a2) * len2, y1 + Math.cos(a2) * len2]];
}

// 画一个人。look 外观、pose 姿势；flip = -1 面朝左
// look.art 存在时（美术图集已加载），各部件改用图片，由同一套骨骼驱动；缺哪个部件就回退到代码绘制。
//   art = { img, parts: { head, torso, armU, armL, legU, legL, shoe }, heads: { normal, panic, happy } }
//   部件坐标都是图集像素：sx/sy/sw/sh 裁切框，px/py 关节枢轴；四肢「竖着挂」：枢轴在上端，len = 到下一个关节的像素长度
//   head 的 r = 头半径像素（对应骨骼里的 13），整个角色按它统一缩放；躯干竖直，枢轴在髋，len = 髋到肩
export function drawPerson(g, x, y, look, pose, { flip = 1, scale = 1, alpha = 1 } = {}) {
  const k = (look.scale || 1) * scale;
  g.save();
  g.translate(x, y);
  g.scale(flip * k, k * (pose.squash || 1));
  g.globalAlpha *= alpha;
  const legU = 12, legL = 12, armU = 9.5, armL = 9;
  const hipY = -25 + (pose.bob || 0);
  const lean = (pose.lean || 0) * D;
  // 躯干：从髋到肩，按 lean 前倾
  const torsoLen = 17;
  const shX = Math.sin(lean) * torsoLen, shY = hipY - Math.cos(lean) * torsoLen;
  const legW = 8.4, armW = 6.4;

  const A = look.art && look.art.img ? look.art : null;
  const P = A ? (A.parts || {}) : {};
  const kA = A && (P.head || (A.heads && A.heads.normal)) ? 13 / (P.head || A.heads.normal).r : 1;
  // 一段肢体的图片：从 p0（枢轴）挂向 p1，长度方向拉伸到骨骼长度
  const seg = (def, p0, p1, rigLen) => {
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) - Math.PI / 2;
    g.save(); g.translate(p0[0], p0[1]); g.rotate(ang); g.scale(kA, rigLen / def.len);
    g.drawImage(A.img, def.sx, def.sy, def.sw, def.sh, -def.px, -def.py, def.sw, def.sh);
    g.restore();
  };
  const drawLimb = (pts, defU, defL, lenU, lenL, w, color, hand) => {
    if (defU && defL) { seg(defU, pts[0], pts[1], lenU); seg(defL, pts[1], pts[2], lenL); return; }
    limb(g, pts, w, color);
    if (hand) blob(g, pts[2][0], pts[2][1], 3.2, look.skin, INK, 2);
  };
  const drawShoe = (pt, ang) => {
    if (!P.shoe) return shoe(g, pt, look.shoes, ang);
    g.save(); g.translate(pt[0], pt[1]); g.rotate(-ang * D * 0.5); g.scale(kA, kA);
    g.drawImage(A.img, P.shoe.sx, P.shoe.sy, P.shoe.sw, P.shoe.sh, -P.shoe.px, -P.shoe.py, P.shoe.sw, P.shoe.sh);
    g.restore();
  };
  const handArt = !!(P.armU && P.armL);

  const leg = (hip, kn) => chain(0, hipY, legU, hip, legL, -kn);   // 髋正 = 腿往前摆，膝盖往后折
  const arm = (sh, el) => chain(shX, shY + 3, armU, sh, armL, el);

  // 后腿、后臂
  const lb = leg(pose.hipL, pose.knL);
  drawLimb(lb, P.legU, P.legL, legU, legL, legW, look.pants, false);
  drawShoe(lb[2], pose.hipL - pose.knL);
  const ab = arm(pose.shL, pose.elL);
  drawLimb(ab, P.armU, P.armL, armU, armL, armW, look.jacket || look.shirt, !handArt);

  // 躯干
  g.save();
  g.translate(0, hipY); g.rotate(lean);
  if (P.torso) {
    g.scale(kA, torsoLen / P.torso.len);
    g.drawImage(A.img, P.torso.sx, P.torso.sy, P.torso.sw, P.torso.sh, -P.torso.px, -P.torso.py, P.torso.sw, P.torso.sh);
  } else torsoVector(g, look, torsoLen);
  g.restore();

  // 前臂举过肩（跳、欢呼）时先画手臂再画头，免得手臂挡住脸
  const af = arm(pose.shR, pose.elR);
  const raised = af[2][1] < shY - 2;
  const frontArm = () => { drawLimb(af, P.armU, P.armL, armU, armL, armW, look.jacket || look.shirt, !handArt); if (look.holding) look.holding(g, af[2][0], af[2][1]); };
  if (raised) frontArm();

  // 头
  g.save();
  g.translate(shX + Math.sin(lean) * 11, shY - 11);
  g.rotate((pose.head || 0) * D);
  const hd = A && pickHead(A, look);
  if (hd) { g.scale(kA, kA); g.drawImage(A.img, hd.sx, hd.sy, hd.sw, hd.sh, -hd.px, -hd.py, hd.sw, hd.sh); }
  else head(g, look);
  g.restore();

  // 前腿、前臂
  const lf = leg(pose.hipR, pose.knR);
  drawLimb(lf, P.legU, P.legL, legU, legL, legW, look.pants, false);
  drawShoe(lf[2], pose.hipR - pose.knR);
  if (!raised) frontArm();

  g.restore();
}

// 表情：wide 眼 → 慌张，happy 眼 → 开心，其余 → 平常
function pickHead(A, look) {
  const h = A.heads || {};
  if (look.mood === 'angry' && h.angry) return h.angry;
  if (look.eyes === 'wide' && h.panic) return h.panic;
  if (look.eyes === 'happy' && h.happy) return h.happy;
  return h.normal || (A.parts && A.parts.head) || null;
}

// 躯干（在髋点坐标系里画，向上为负）：背包、裤腰、上衣、领口、领带、围裙、马甲
function torsoVector(g, look, torsoLen = 17) {
  if (look.bag) { g.fillStyle = look.bag; roundRect(g, -15, -18, 9, 15, 3); g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke(); }
  g.fillStyle = look.pants; roundRect(g, -8, -4, 16, 9, 4); g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
  g.fillStyle = look.jacket || look.shirt; roundRect(g, -9, -torsoLen - 3, 18, torsoLen + 5, 7); g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
  if (look.jacket && look.shirt) { g.fillStyle = look.shirt; g.beginPath(); g.moveTo(-2.5, -torsoLen - 2); g.lineTo(3.5, -torsoLen - 2); g.lineTo(0.5, -torsoLen + 8); g.closePath(); g.fill(); }
  if (look.tie) { g.fillStyle = look.tie; g.beginPath(); g.moveTo(0.5, -torsoLen + 1); g.lineTo(2.6, -torsoLen + 4); g.lineTo(0.5, -torsoLen + 13); g.lineTo(-1.6, -torsoLen + 4); g.closePath(); g.fill(); }
  if (look.apron) { g.fillStyle = look.apron; roundRect(g, -6, -torsoLen + 4, 12, torsoLen + 2, 3); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); }
  if (look.vest) { g.fillStyle = look.vest; roundRect(g, -8, -torsoLen - 3, 16, torsoLen + 6, 6); g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke(); g.fillStyle = '#fff8'; g.fillRect(-8, -9, 16, 3); }
}

function shoe(g, [x, y], color, ang) {
  g.save(); g.translate(x, y); g.rotate(-ang * D * 0.5);
  g.fillStyle = color; roundRect(g, -3.5, -3.5, 12, 7, 3.5); g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
  g.restore();
}

function head(g, look) {
  const r = 13;
  // 脸
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = look.skin; g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
  // 头发
  g.fillStyle = look.hair;
  switch (look.hairStyle) {
    case 'messy': g.beginPath(); g.moveTo(-r - 1, 1); g.quadraticCurveTo(-r, -r - 5, 2, -r - 2); g.lineTo(5, -r - 6); g.lineTo(7, -r - 1); g.quadraticCurveTo(r + 2, -r + 1, r - 2, -3); g.quadraticCurveTo(1, -6, -r - 1, 1); g.fill(); break;
    case 'bald': g.beginPath(); g.arc(-3, 1, r - 1, Math.PI * 0.75, Math.PI * 1.15); g.lineWidth = 4; g.strokeStyle = look.hair; g.stroke(); break;
    case 'bob': g.beginPath(); g.moveTo(-r - 2, 8); g.quadraticCurveTo(-r - 3, -r - 4, 2, -r - 2); g.quadraticCurveTo(r + 3, -r, r + 1, 0); g.quadraticCurveTo(4, -6, -2, -4); g.lineTo(-6, 8); g.closePath(); g.fill(); break;
    case 'bun': g.beginPath(); g.arc(-4, -r - 1, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(-r - 1, 2); g.quadraticCurveTo(-r, -r - 3, 3, -r - 1); g.quadraticCurveTo(r + 1, -r + 2, r - 1, -2); g.quadraticCurveTo(0, -5, -r - 1, 2); g.fill(); break;
    case 'slick': g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(-r, -r - 3, 4, -r - 1); g.quadraticCurveTo(r + 2, -r + 3, r, -1); g.lineTo(-r, 0); g.fill(); break;
    case 'helmet': g.beginPath(); g.arc(0, -1, r + 2, Math.PI, 0); g.lineTo(r + 5, 0); g.lineTo(-r - 2, 0); g.closePath(); g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke(); break;
    case 'pompadour': g.beginPath(); g.moveTo(-r - 1, 2); g.quadraticCurveTo(-r - 4, -r - 2, -2, -r - 10); g.quadraticCurveTo(r + 10, -r - 16, r + 8, -r + 2); g.quadraticCurveTo(r, -r + 1, r - 2, -4); g.quadraticCurveTo(0, -6, -r - 1, 2); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(2, -r - 7, 6, 2, -0.3, 0, Math.PI * 2); g.fill(); break;
    case 'perm': for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(i * 3.6, -r + 1 + Math.abs(i) * 1.2, 5, 0, Math.PI * 2); g.fill(); } break;
    default: break;
  }
  // 眼睛（朝右看）、腮红、嘴
  g.fillStyle = INK;
  const eye = look.eyes || 'dot';
  if (eye === 'dot') { g.beginPath(); g.ellipse(5, -1, 1.7, 2.2, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(10.5, -1, 1.5, 2.1, 0, 0, Math.PI * 2); g.fill(); }
  else if (eye === 'glasses') { g.lineWidth = 1.6; g.strokeStyle = INK; g.beginPath(); g.arc(4.6, -1, 2.8, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(10, -1, 2.4, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(4.6, -1, 1, 0, Math.PI * 2); g.fill(); }
  else if (eye === 'happy') { g.lineWidth = 1.8; g.strokeStyle = INK; g.beginPath(); g.arc(5, 0, 2.2, Math.PI * 1.1, Math.PI * 1.9); g.moveTo(12.6, 0); g.arc(10.5, 0, 2.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  else if (eye === 'wide') { g.fillStyle = '#fff'; g.beginPath(); g.arc(5, -1, 3, 0, Math.PI * 2); g.moveTo(13.5, -1); g.arc(10.8, -1, 2.7, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(5.6, -1, 1, 0, Math.PI * 2); g.moveTo(12.1, -1); g.arc(11.2, -1, 0.9, 0, Math.PI * 2); g.fill(); }
  else if (eye === 'squint') { g.lineWidth = 1.8; g.strokeStyle = INK; g.beginPath(); g.moveTo(3, -1); g.lineTo(6.5, -1); g.moveTo(8, -1); g.lineTo(11, -1); g.stroke(); }
  if (look.blush !== false) { g.fillStyle = 'rgba(255,107,90,.4)'; g.beginPath(); g.ellipse(3.5, 4.5, 3, 1.8, 0, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = 1.6; g.strokeStyle = INK; g.beginPath();
  const mouth = look.mouth || 'flat';
  if (mouth === 'open') { g.fillStyle = '#7a2b3a'; g.ellipse(8, 5.5, 2.2, 2.4, 0, 0, Math.PI * 2); g.fill(); }
  else if (mouth === 'smile') { g.arc(7.5, 3.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else { g.moveTo(6, 5.5); g.lineTo(10, 5.2); g.stroke(); }
  if (look.hat) look.hat(g, r);
}

// ── 运行时版本：骨骼驱动的贴图部件（WebGL / Canvas 两个后端通用）──────────────────
// 每个部件是一张贴图，每帧只算关节位置和角度去摆，不再逐帧画矢量路径。
// 有 AI 美术（look.art）就用图集里的部件；没有就把上面的矢量画法各烘焙一次当部件。
const LEG_W = 8.4, ARM_W = 6.4, TORSO = 17;
const lookKey = look => look.id || 'anon';

function capsule(color, w, len) {
  return bake(`cap|${color}|${w}|${len}`, [-w / 2 - 2, -w / 2 - 2, w + 4, len + w + 4], g => limb(g, [[0, 0], [0, len]], w, color));
}
function vecParts(look) {
  const id = lookKey(look);
  return {
    torso: bake(`torso|${id}`, [-18, -24, 34, 32], g => torsoVector(g, look, TORSO)),
    legU: capsule(look.pants, LEG_W, 12), legL: capsule(look.pants, LEG_W, 12),
    armU: capsule(look.jacket || look.shirt, ARM_W, 9.5), armL: capsule(look.jacket || look.shirt, ARM_W, 9),
    hand: bake(`hand|${look.skin}`, [-5, -5, 10, 10], g => blob(g, 0, 0, 3.2, look.skin, INK, 2)),
    shoe: bake(`shoe|${look.shoes}`, [-6, -6, 18, 12], g => shoe(g, [0, 0], look.shoes, 0)),
    hold: look.holding ? bake(`hold|${id}`, [-16, -26, 60, 44], g => look.holding(g, 0, 0)) : null,
  };
}
function vecHead(look) {
  const id = lookKey(look), eyes = look.eyes || 'dot', mouth = look.mouth || 'flat';
  return bake(`head|${id}|${eyes}|${mouth}`, [-24, -36, 48, 56], g => head(g, look));
}
// AI 图集部件 → 贴图（单位：图集像素，枢轴 = 关节）
function artTex(A, name, def) {
  return fromImage(`art|${A.src || ''}|${name}`, A.img, def.sw, def.sh, { sx: def.sx, sy: def.sy, sw: def.sw, sh: def.sh, ox: def.px, oy: def.py });
}

// stretch：起跳拉长（> 0）/ 落地压扁（< 0），以脚底为支点，宽度反向变化保持体积感
export function person(gfx, x, y, look, pose, { flip = 1, scale = 1, alpha = 1, stretch = 0 } = {}) {
  const k = (look.scale || 1) * scale;
  gfx.save();
  gfx.translate(x, y);
  gfx.scale(flip * k * (1 - stretch * 0.6), k * (pose.squash || 1) * (1 + stretch));
  gfx.alpha(alpha);
  const hipY = -25 + (pose.bob || 0), lean = (pose.lean || 0) * D;
  const shX = Math.sin(lean) * TORSO, shY = hipY - Math.cos(lean) * TORSO;
  const A = look.art && look.art.img ? look.art : null;
  const P = A ? (A.parts || {}) : {};
  const headDef = A ? (P.head || (A.heads && A.heads.normal)) : null;
  const kA = headDef ? 13 / headDef.r : 1;
  const V = vecParts(look);

  // 一段肢体：贴图从关节 p0「挂」向 p1；图集部件沿长度方向拉伸到骨骼长度
  const seg = (vecTex, artName, p0, p1, rigLen) => {
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) - Math.PI / 2;
    const def = P[artName];
    if (def) gfx.draw(artTex(A, artName, def), p0[0], p0[1], { rot: ang, sx: kA, sy: rigLen / def.len });
    else gfx.draw(vecTex, p0[0], p0[1], { rot: ang });     // 矢量胶囊按骨骼原长烘焙，不用拉伸
  };
  const limb2 = (pts, upName, loName, vU, vL, lenU, lenL) => { seg(vU, upName, pts[0], pts[1], lenU); seg(vL, loName, pts[1], pts[2], lenL); };
  const handArt = !!(P.armU && P.armL);
  const hand = pt => { if (!handArt) gfx.draw(V.hand, pt[0], pt[1]); };
  const foot = (pt, ang) => {
    if (P.shoe) gfx.draw(artTex(A, 'shoe', P.shoe), pt[0], pt[1], { rot: -ang * D * 0.5, sx: kA, sy: kA });
    else gfx.draw(V.shoe, pt[0], pt[1], { rot: -ang * D * 0.5 });
  };
  const leg = (hip, kn) => chain(0, hipY, 12, hip, 12, -kn);
  const arm = (sh, el) => chain(shX, shY + 3, 9.5, sh, 9, el);

  const lb = leg(pose.hipL, pose.knL);
  limb2(lb, 'legU', 'legL', V.legU, V.legL, 12, 12);
  foot(lb[2], pose.hipL - pose.knL);
  const ab = arm(pose.shL, pose.elL);
  limb2(ab, 'armU', look.holding && P.armU ? 'armU' : 'armL', V.armU, V.armL, 9.5, 9);
  hand(ab[2]);

  if (P.torso) gfx.draw(artTex(A, 'torso', P.torso), 0, hipY, { rot: lean, sx: kA, sy: TORSO / P.torso.len });
  else gfx.draw(V.torso, 0, hipY, { rot: lean });

  const af = arm(pose.shR, pose.elR);
  const raised = af[2][1] < shY - 2;
  // 手里的道具：AI 小臂图里已经画了，矢量版才另外画
  const front = () => { limb2(af, 'armU', 'armL', V.armU, V.armL, 9.5, 9); hand(af[2]); if (V.hold && !handArt) gfx.draw(V.hold, af[2][0], af[2][1]); };
  if (raised) front();

  const hx = shX + Math.sin(lean) * 11, hy = shY - 11, hr = (pose.head || 0) * D;
  const hd = A && pickHead(A, look);
  if (hd) gfx.draw(fromImage(`art|${A.src || ''}|head|${hd.sx},${hd.sy}`, A.img, hd.sw, hd.sh, { sx: hd.sx, sy: hd.sy, sw: hd.sw, sh: hd.sh, ox: hd.px, oy: hd.py }), hx, hy, { rot: hr, sx: kA, sy: kA });
  else gfx.draw(vecHead(look), hx, hy, { rot: hr });

  const lf = leg(pose.hipR, pose.knR);
  limb2(lf, 'legU', 'legL', V.legU, V.legL, 12, 12);
  foot(lf[2], pose.hipR - pose.knR);
  if (!raised) front();
  gfx.restore();
}
