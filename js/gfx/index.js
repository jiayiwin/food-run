// 渲染器初始化：WebGL（PixiJS）优先，起不来就退回 Canvas 2D，保证任何机型都能玩。
// 浏览器调试可以加 ?gfx=canvas 强制 2D 后端对比画面。（小游戏不支持动态 import，这里静态引入）
import { canvas } from '../platform/index.js';
import { gfx } from './gfx.js';
import { makeCanvasBackend } from './canvas2d.js';
import { makeWebglBackend } from './webgl.js';

export function initGfx(prefer = 'webgl') {
  if (prefer !== 'canvas') {
    try { gfx.use(makeWebglBackend(canvas)); return gfx; }
    catch (e) { console.warn('WebGL 初始化失败，改用 Canvas 2D：', e && e.message, e && e.stack); }
  }
  try { gfx.use(makeCanvasBackend(canvas)); }
  catch (e) {
    // 主画布已经被 WebGL 占住又初始化失败：只能提示重启
    try { wx.showModal({ title: '启动失败', content: '画面初始化失败，请关闭小游戏后重新打开', showCancel: false }); } catch (e2) { /* ignore */ }
    throw e;
  }
  return gfx;
}
export { gfx };
