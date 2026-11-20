// 开发版 / 体验版诊断：报错直接弹在手机屏幕上，角落显示渲染器和帧率。正式版全部关闭。
import { envVersion, onAppError, showAlert, now, screen } from './platform/index.js';
import { gfx } from './gfx/gfx.js';

const on = { hud: false, alerts: false };
let shown = 0;

// 开发版 / 体验版（或 ?debug=1）：结算页显示埋点等调试信息
export const isDev = () => on.hud;

export function installDiagnostics(query = {}) {
  const dev = envVersion() === 'develop' || envVersion() === 'trial';
  on.hud = dev || query.debug === '1';
  on.alerts = dev;
  onAppError(msg => reportError(msg));
}

export function reportError(err) {
  const text = String((err && (err.stack || err.message)) || err);
  console.error(text);
  if (!on.alerts || shown >= 3) return;
  shown++;
  showAlert('游戏出错（请截图）', text.split('\n').slice(0, 5).join('\n').slice(0, 400));
}

// 角落的性能信息：每半秒刷新一次
let last = 0, frames = 0, worst = 0, windowStart = 0, line = '';
export function drawDebugHud() {
  if (!on.hud) return;
  const t = now();
  if (last) worst = Math.max(worst, t - last);
  last = t; frames++;
  if (!windowStart) windowStart = t;
  if (t - windowStart >= 500) {
    const fps = Math.round(frames * 1000 / (t - windowStart));
    const s = gfx.backend.stats ? gfx.backend.stats() : {};
    line = `${gfx.kind}${s.gl ? ' GL' + s.gl : ''} ${fps}fps 最慢${Math.round(worst)}ms 绘制${s.list ?? '-'} 贴图${s.textures ?? '-'} ${screen.width}x${screen.height}@${screen.dpr}`;
    frames = 0; worst = 0; windowStart = t;
  }
  if (line) gfx.text(line, 6, screen.H - 8, { size: 10, color: '#fff', lw: 2, align: 'left', id: 'debug-hud', maxW: 362 });
}
