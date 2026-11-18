// Canvas 2D 后端：WebGL 起不来时的兜底，也用来对照 WebGL 后端的画面。
import { text as drawText, roundRect, font } from '../render/draw.js';

export function makeCanvasBackend(canvas) {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  const set = t => g.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
  const gradCache = new Map();
  return {
    kind: 'canvas2d',
    begin(clear) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = clear; g.fillRect(0, 0, canvas.width, canvas.height); },
    end() {},
    image(tex, t, al) {
      set(t); g.globalAlpha = al;
      g.drawImage(tex.src, tex.sx, tex.sy, tex.sw, tex.sh, 0, 0, tex.w, tex.h);
    },
    rect(t, w, h, s, al) {
      set(t); g.globalAlpha = al;
      if (s.r > 0) roundRect(g, 0, 0, w, h, s.r); else { g.beginPath(); g.rect(0, 0, w, h); }
      if (s.fill) { g.fillStyle = s.fill; g.fill(); }
      if (s.stroke && s.lw) { g.lineWidth = s.lw; g.strokeStyle = s.stroke; g.stroke(); }
    },
    text(str, t, o, al) {
      set(t); g.globalAlpha = al;
      drawText(g, str, 0, 0, o);
    },
    vgrad(t, w, h, stops, al) {
      set(t); g.globalAlpha = al;
      const key = JSON.stringify(stops) + h;
      let gr = gradCache.get(key);
      if (!gr) { gr = g.createLinearGradient(0, 0, 0, h); for (const [p, c] of stops) gr.addColorStop(p, c); if (gradCache.size > 200) gradCache.clear(); gradCache.set(key, gr); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
    dot(t, r, fill, al) { set(t); g.globalAlpha = al; g.fillStyle = fill; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); },
    release() {},
    warm() {},
    preload() {},
    warmFont() {},
    measure(str, o) { g.font = font(o.size || 16, o.weight || 700); return g.measureText(str).width; },
  };
}
