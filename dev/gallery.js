// 调试：人物姿势陈列（/dev/?gallery=1）
import { ctx, screen, beginFrame, now, raf } from './legacy/js/platform/index.js';
import { drawPerson, LOOKS, runPose, jumpPose, slidePose, stumblePose, idlePose, cheerPose, bikePose } from './legacy/js/render/rig.js';
import { text } from './legacy/js/render/draw.js';
const t0 = now();
const poses = [['跑 0', () => runPose(0)], ['跑 .25', () => runPose(0.25)], ['跑 .5', () => runPose(0.5)], ['跳 起', () => jumpPose(-1)], ['跳 落', () => jumpPose(1)], ['滑铲', () => slidePose(0)], ['踉跄', t => stumblePose(t)], ['待机', t => idlePose(t)], ['欢呼', t => cheerPose(t)], ['骑车', t => bikePose(t % 1)], ['跑动画', t => runPose((t * 2.2) % 1)], ['跑动画快', t => runPose((t * 3.2) % 1, 1.6)]];
function frame() {
  const t = (now() - t0) / 1000;
  beginFrame();
  ctx.fillStyle = '#ffe7c7'; ctx.fillRect(0, 0, screen.W, screen.H);
  poses.forEach(([name, f], i) => {
    const x = 62 + (i % 3) * 125, y = 130 + Math.floor(i / 3) * 150;
    ctx.fillStyle = '#e8c9a0'; ctx.fillRect(x - 50, y, 100, 3);
    drawPerson(ctx, x, y, LOOKS.player, f(t), { scale: 1.3 });
    text(ctx, name, x, y + 22, { size: 13, color: '#2b2233' });
  });
  raf(frame);
}
frame();
