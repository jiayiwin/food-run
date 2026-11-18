// 主角：跑 / 跳 / 急降 / 滑铲 / 踉跄。纯逻辑，输入是「按下 / 松开 / 下滑」三种事件。
import { TUNE } from '../data/tune.js';

export function makePlayer() {
  return {
    y: 0, vy: 0,                 // y：脚底高度（地面 0，向上为负）
    ground: 0,                   // 脚下支撑面的高度（站在台阶上时 < 0）
    onGround: true,
    state: 'run',                // run | jump | slide | stumble
    slideT: 0, slideTotal: 0,
    coyoteT: 0, bufferJump: 0, bufferSlide: 0,
    stumbleT: 0, invulnT: 0,
    fastFalling: false,
    runPhase: 0,
    events: [],                  // 本帧发生的事（jump / land / slide / stumble…），给音效和特效用
  };
}

export function hitbox(p) {
  let [w, h] = p.onGround || p.state === 'slide' ? TUNE.box.run : TUNE.box.air;
  if (p.state === 'slide') {
    // 进入 0.06s、起身 0.08s 时在站立和趴下之间插值
    const [sw, sh] = TUNE.box.slide;
    const el = p.slideTotal - p.slideT, k = Math.min(1, el / TUNE.slideIn, p.slideT / TUNE.slideOut);
    w = w + (sw - w) * k; h = h + (sh - h) * k;
  }
  return { x0: -w / 2, x1: w / 2, y0: p.y - h, y1: p.y };
}

function startJump(p) {
  p.vy = TUNE.jumpV; p.onGround = false; p.state = 'jump';
  p.coyoteT = 0; p.fastFalling = false; p.slideT = 0;
  p.events.push('jump');
}
function startSlide(p, t = TUNE.slideTime) {
  p.state = 'slide'; p.slideT = t; p.slideTotal = t; p.events.push('slide');
}

// 输入：跳（上滑或轻点）、下滑（地面滑铲 / 空中急降）
export function jump(p) {
  if (p.state === 'stumble') { p.bufferJump = TUNE.buffer; return; }
  if (p.onGround || p.coyoteT > 0) startJump(p);      // 滑铲中跳：立刻取消滑铲起跳
  else p.bufferJump = TUNE.buffer;
}
export function swipeDown(p) {
  if (p.state === 'stumble') { p.bufferSlide = TUNE.buffer; return; }
  if (!p.onGround) { p.vy = Math.max(p.vy, TUNE.fastFallV); p.fastFalling = true; p.events.push('fastfall'); return; }
  startSlide(p);                                          // 滑铲中再下滑：刷新时长
}
export function stumble(p) {
  if (p.invulnT > 0) return false;
  p.state = 'stumble'; p.stumbleT = TUNE.stumbleTime; p.invulnT = TUNE.invulnAfterHit; p.slideT = 0;
  p.events.push('stumble');
  return true;
}

// 每帧推进。supportAt(y) 返回脚下最高的支撑面（台阶顶）或 0；holeUnder 为 true 时脚下是空的（井盖）
// ceiling：头顶有横杆时，滑铲到点也不站起来（经典跑酷的「钻杆」手感）
export function stepPlayer(p, dt, speed, { supportTop = 0, overHole = false, ceiling = false } = {}) {
  p.events.length = 0;
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.bufferJump = Math.max(0, p.bufferJump - dt);
  p.bufferSlide = Math.max(0, p.bufferSlide - dt);
  p.runPhase = (p.runPhase + dt * speed / 120) % 1;

  if (p.state === 'stumble') {
    p.stumbleT -= dt;
    if (p.stumbleT <= 0) p.state = 'run';
  }
  if (p.state === 'slide') {
    p.slideT -= dt;
    if (ceiling && p.onGround && p.slideT < TUNE.slideOut + 0.01) p.slideT = TUNE.slideOut + 0.01;
    if (p.slideT <= 0) p.state = 'run';
  }

  // 竖直运动
  const ground = overHole ? Infinity : supportTop;
  if (!p.onGround) {
    const a = p.vy < 0 ? TUNE.gravityUp : TUNE.gravityDown;
    p.y += p.vy * dt + 0.5 * a * dt * dt;     // 按匀加速积分，跳高不随帧率漂移
    p.vy += a * dt;
    if (p.vy > 0 && p.y >= ground) {          // 落地
      p.y = ground; p.vy = 0; p.onGround = true;
      const wasFast = p.fastFalling; p.fastFalling = false;
      p.state = p.state === 'stumble' ? 'stumble' : 'run';
      p.events.push('land');
      if (p.bufferJump > 0) { p.bufferJump = 0; startJump(p); }
      else if (wasFast || p.bufferSlide > 0) { p.bufferSlide = 0; startSlide(p, wasFast ? TUNE.autoSlideAfterFastFall : TUNE.slideTime); }
    }
  } else {
    // 在地上：支撑面没了（走出台阶 / 走到洞上）就开始下落，并给一小段土狼时间
    if (ground > p.y + 0.5) { p.onGround = false; p.coyoteT = TUNE.coyote; p.vy = 0; if (p.state === 'slide') p.state = 'run'; }
    else if (ground < p.y - 0.5) {
      // 前面是更高的台阶顶：由碰撞逻辑处理（撞上），这里不自动爬上去
    } else p.y = ground;
    if (p.state === 'run' && p.bufferJump > 0) { p.bufferJump = 0; startJump(p); }
    if (p.state === 'run' && p.bufferSlide > 0) { p.bufferSlide = 0; startSlide(p); }
  }
  if (p.coyoteT > 0) p.coyoteT -= dt;
  if (!p.onGround && p.state !== 'stumble' && p.state !== 'jump') p.state = 'jump';
}
