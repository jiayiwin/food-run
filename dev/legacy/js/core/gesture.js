// 手势识别：把原始触摸点变成游戏动作。纯逻辑，不依赖平台，测试里可以直接喂假触摸。
//   tap            轻点（位移小、时间短）
//   swipe up/down/left/right   快速滑动（超过阈值即触发，不等抬手，响应更快）
//   hold / release 按住 / 松开（滑行这种「按住才持续」的动作用）
export const GESTURE = {
  swipeDist: 26,       // 逻辑像素：滑过这么远就算滑动
  tapMaxDist: 14,
  tapMaxTime: 260,     // 毫秒
  holdTime: 160,
};

export function makeGestures(emit, opts = {}) {
  const cfg = { ...GESTURE, ...opts };
  const active = new Map();   // id → { x0, y0, t0, fired, held }
  return {
    start(points) {
      for (const p of points) {
        active.set(p.id, { x0: p.x, y0: p.y, t0: p.t, fired: false, held: false });
        emit({ type: 'down', x: p.x, y: p.y, t: p.t, id: p.id });
      }
    },
    move(points) {
      for (const p of points) {
        const a = active.get(p.id);
        if (!a) continue;
        const dx = p.x - a.x0, dy = p.y - a.y0;
        if (!a.fired && Math.hypot(dx, dy) >= cfg.swipeDist) {
          a.fired = true;
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          emit({ type: 'swipe', dir, x: a.x0, y: a.y0, t: p.t, id: p.id });
        }
        if (!a.held && !a.fired && p.t - a.t0 >= cfg.holdTime && Math.hypot(dx, dy) < cfg.tapMaxDist) {
          a.held = true;
          emit({ type: 'hold', x: a.x0, y: a.y0, t: p.t, id: p.id });
        }
      }
    },
    end(points) {
      for (const p of points) {
        const a = active.get(p.id);
        if (!a) continue;
        active.delete(p.id);
        const dist = Math.hypot(p.x - a.x0, p.y - a.y0);
        // 没滑够阈值的小幅快划（14–26px）按方向算滑动；按得久一点（>260ms）但没动，仍算轻点
        if (!a.fired && dist >= cfg.tapMaxDist) {
          const dx = p.x - a.x0, dy = p.y - a.y0;
          emit({ type: 'swipe', dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), x: a.x0, y: a.y0, t: p.t, id: p.id });
        } else if (!a.fired && dist < cfg.tapMaxDist) emit({ type: 'tap', x: p.x, y: p.y, t: p.t, id: p.id, long: p.t - a.t0 > cfg.tapMaxTime });
        emit({ type: 'up', x: p.x, y: p.y, t: p.t, id: p.id, held: a.held, swiped: a.fired });
      }
    },
    // 按住超过 holdTime 但手指没动、也没 move 事件时，靠每帧调用 tick 补发 hold
    tick(t) {
      for (const [id, a] of active) {
        if (!a.held && !a.fired && t - a.t0 >= cfg.holdTime) { a.held = true; emit({ type: 'hold', x: a.x0, y: a.y0, t, id }); }
      }
    },
    cancel(points) { for (const p of points) active.delete(p.id); },
    get count() { return active.size; },
  };
}
