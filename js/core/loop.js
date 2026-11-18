// 游戏循环：每帧把真实经过的时间切成不超过 1/60 秒的小步推进逻辑，然后渲染一次。
// 之前用「固定 60Hz 逻辑 + 不插值渲染」，在 120/144Hz 屏幕或帧时间抖动时会出现一帧走两步、一帧不动的顿挫，
// 镜头高速平移时特别明显。现在每帧推进的时间 = 实际经过的时间，画面始终匀速；小步上限保证碰撞精度不变。
export const STEP = 1 / 60;

export function makeLoop({ update, render, now, raf, maxDt = 0.1, onError }) {
  let last = 0, running = false, timeScale = 1, errors = 0;
  const frame = () => {
    if (!running) return;
    const t = now() / 1000;
    let dt = last ? t - last : STEP;
    last = t;
    if (dt > maxDt) dt = maxDt;                       // 切后台回来 / 卡了一下：不要一次补太多
    raf(frame);                                         // 先排下一帧：本帧出错也不会让游戏卡死
    try {
      if (dt > 0) {
        dt *= timeScale;
        const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
        const step = dt / n;
        for (let i = 0; i < n; i++) update(step);
      }
      render(1);
    } catch (e) { if (errors++ < 5) (onError ? onError(e) : console.error(e)); }
  };
  return {
    start() { if (!running) { running = true; last = 0; raf(frame); } },
    stop() { running = false; },
    get running() { return running; },
    set timeScale(v) { timeScale = v; },
    get timeScale() { return timeScale; },
  };
}
