// 调试：场景巡游（/dev/?scenery=1）——镜头一路往右，看四种路段和天色变化
import { ctx, screen, beginFrame, now, raf } from './legacy/js/platform/index.js';
import { drawSky, drawSkyline, drawMid, drawGround } from './legacy/js/render/scenery.js';
import { drawPerson, LOOKS, runPose } from './legacy/js/render/rig.js';
const t0 = now();
const q = new URLSearchParams(location.search);
const startX = +(q.get('x') || 0);
const themeAt = x => (x < 3000 ? 'office' : x < 9000 ? 'street' : x < 14000 ? 'park' : 'home');
function frame() {
  const t = (now() - t0) / 1000, camX = startX + t * 420, gy = Math.round(screen.H * 0.58);
  const dusk = Math.min(1, camX / 15000);
  beginFrame();
  drawSky(ctx, screen.W, gy, dusk, camX);
  drawSkyline(ctx, screen.W, gy, dusk, camX);
  drawMid(ctx, screen.W, gy, themeAt, camX, dusk);
  drawGround(ctx, screen.W, screen.H, gy, themeAt, camX);
  drawPerson(ctx, 110, gy, LOOKS.player, runPose((t * 3) % 1, 1.2), { scale: 1.15 });
  raf(frame);
}
frame();
