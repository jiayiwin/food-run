// 横版视差场景：远景（天空、夕阳、城市剪影）→ 中景（按路段画建筑和道具）→ 地面。
// 全部代码绘制；按世界坐标的格子做确定性生成，同一位置每次画出来一样。
import { roundRect, INK, text } from './draw.js';

const hash = n => { let h = (n | 0) * 374761393 + 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 路段主题
export const THEMES = {
  office: { name: '公司', floor: '#c9b8d9', floorLine: '#b3a1c6', wall: '#f3e6ff', trim: '#d9c6ec' },
  street: { name: '街道', floor: '#cfc6bd', floorLine: '#b8aea3', curb: '#8f8a86', road: '#5b5866' },
  park: { name: '小区', floor: '#d6c8a8', floorLine: '#c2b28f', grass: '#8fcf7a' },
  home: { name: '家门口', floor: '#e3c9a6', floorLine: '#cfb08a' },
};

// 天色：t = 0（傍晚 18:00）→ 1（入夜 19:30）
function sky(t) {
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const top = mix([255, 170, 120], [58, 52, 104], t), mid = mix([255, 210, 150], [120, 90, 150], t), bot = mix([255, 236, 190], [250, 170, 130], t);
  const c = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  return [c(top), c(mid), c(bot)];
}

export function drawSky(g, W, groundY, dusk, camX) {
  const [a, b, c] = sky(dusk);
  const gr = g.createLinearGradient(0, 0, 0, groundY);
  gr.addColorStop(0, a); gr.addColorStop(0.6, b); gr.addColorStop(1, c);
  g.fillStyle = gr; g.fillRect(0, 0, W, groundY + 2);
  // 太阳慢慢落下，入夜后出月亮和星星
  const sunY = groundY * (0.42 + dusk * 0.7);
  g.fillStyle = `rgba(255,${Math.round(220 - dusk * 90)},${Math.round(140 - dusk * 60)},${0.95 - dusk * 0.6})`;
  g.beginPath(); g.arc(W * 0.72, sunY, 34, 0, Math.PI * 2); g.fill();
  if (dusk > 0.45) {
    const k = (dusk - 0.45) / 0.55;
    g.fillStyle = `rgba(255,250,230,${k})`;
    for (let i = 0; i < 18; i++) { const x = (hash(i * 7) * W * 1.5 - camX * 0.02) % W, y = hash(i * 13) * groundY * 0.45; g.fillRect((x + W) % W, y, 1.6, 1.6); }
    g.beginPath(); g.arc(W * 0.2, groundY * 0.18, 13, 0, Math.PI * 2); g.fill();
  }
  // 云
  g.fillStyle = `rgba(255,255,255,${0.55 - dusk * 0.35})`;
  for (let i = 0; i < 4; i++) {
    const span = W + 160, x = ((hash(i * 31) * span - camX * 0.06 * (0.6 + i * 0.2)) % span + span) % span - 80, y = 40 + hash(i * 17) * groundY * 0.3;
    for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x + j * 16, y - (j === 1 ? 7 : 0), 13 - (j === 1 ? 0 : 3), 0, Math.PI * 2); g.fill(); }
  }
}

// 远景城市剪影：两层，越远越慢、越淡
export function drawSkyline(g, W, groundY, dusk, camX) {
  for (const [par, base, colA] of [[0.08, 0.62, [150, 120, 170]], [0.18, 0.74, [120, 95, 145]]]) {
    const cell = 46, off = camX * par, first = Math.floor(off / cell) - 1;
    const c = colA.map(v => Math.round(v * (1 - dusk * 0.35)));
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    for (let i = first; i < first + W / cell + 3; i++) {
      const h = groundY * (1 - base) + hash(i * 3 + par * 1000) * groundY * 0.28;
      const x = i * cell - off, w = cell - 4 + hash(i * 5) * 8;
      g.fillRect(x, groundY - h, w, h);
      // 入夜后亮几扇窗
      if (dusk > 0.3) {
        g.fillStyle = `rgba(255,220,140,${(dusk - 0.3) * 0.9})`;
        for (let k = 0; k < 5; k++) if (hash(i * 11 + k) > 0.55) g.fillRect(x + 5 + (k % 2) * 14, groundY - h + 10 + Math.floor(k / 2) * 16, 6, 7);
        g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    }
  }
}

// 中景：按路段画，parallax 0.5
export function drawMid(g, W, groundY, themeAt, camX, dusk) {
  const par = 0.5, cell = 90, off = camX * par, first = Math.floor(off / cell) - 1;
  for (let i = first; i < first + W / cell + 3; i++) {
    const x = i * cell - off;
    const worldX = i * cell / par;               // 这一格对应的世界坐标（决定主题）
    const theme = themeAt(worldX);
    const r = hash(i * 7 + 3);
    if (theme === 'office') officeProp(g, x, groundY, cell, r, i, dusk);
    else if (theme === 'street') streetProp(g, x, groundY, cell, r, i, dusk);
    else if (theme === 'park') parkProp(g, x, groundY, cell, r, i, dusk);
    else homeProp(g, x, groundY, cell, r, i, dusk);
  }
}

function officeProp(g, x, gy, w, r, i, dusk) {
  // 墙 + 落地窗（窗外是夕阳）
  g.fillStyle = '#f3e6ff'; g.fillRect(x, gy - 210, w + 1, 210);
  g.fillStyle = '#d9c6ec'; g.fillRect(x, gy - 22, w + 1, 22);
  if (i % 2 === 0) {
    g.fillStyle = `rgba(255,${190 - dusk * 60},${140 - dusk * 40},0.85)`; roundRect(g, x + 10, gy - 190, w - 20, 120, 6); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#bfa8d6'; g.stroke();
    g.beginPath(); g.moveTo(x + w / 2, gy - 190); g.lineTo(x + w / 2, gy - 70); g.stroke();
  } else if (r < 0.35) {          // 盆栽
    g.fillStyle = '#e07a5f'; roundRect(g, x + 30, gy - 46, 26, 24, 4); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#5fb36b'; for (const [dx, dy, rr] of [[43, -58, 13], [33, -66, 10], [53, -68, 10], [43, -80, 9]]) { g.beginPath(); g.arc(x + dx, gy + dy, rr, 0, Math.PI * 2); g.fill(); }
  } else if (r < 0.65) {          // 饮水机
    g.fillStyle = '#ffffff'; roundRect(g, x + 28, gy - 92, 30, 70, 5); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#9ad0f5'; roundRect(g, x + 31, gy - 124, 24, 34, 8); g.fill(); g.stroke();
  } else {                         // 标语
    g.fillStyle = '#ff6b5a'; roundRect(g, x + 14, gy - 160, w - 28, 34, 5); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    text(g, ['今日事今日毕', '奋斗者', '对齐颗粒度', '拥抱变化'][i & 3], x + w / 2, gy - 143, { size: 11, color: '#fff' });
  }
}

const SHOPS = [['便利店', '#4bb3a8'], ['奶茶', '#f78fb3'], ['麻辣烫', '#ff6b5a'], ['烧烤', '#f7b731'], ['药店', '#46a35e'], ['快递站', '#4b7bec']];
function streetProp(g, x, gy, w, r, i, dusk) {
  const h = 150 + Math.floor(hash(i * 13) * 60);
  g.fillStyle = ['#f6d7b0', '#e8c1a0', '#d9e3f0', '#f3d1dc'][i & 3]; g.fillRect(x, gy - h, w + 1, h);
  // 楼上窗户
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    const lit = dusk > 0.35 && hash(i * 31 + row * 3 + col) > 0.45;
    g.fillStyle = lit ? '#ffe08a' : '#a9b8d6';
    g.fillRect(x + 14 + col * 38, gy - h + 16 + row * 30, 24, 18);
  }
  // 底商：遮阳棚 + 招牌
  const [name, col] = SHOPS[Math.floor(hash(i * 5) * SHOPS.length)];
  g.fillStyle = col; g.fillRect(x + 2, gy - 62, w - 4, 16);
  g.fillStyle = '#fff'; for (let k = 0; k < 5; k++) g.fillRect(x + 4 + k * 17, gy - 46, 9, 6);
  g.fillStyle = '#fffaf2'; roundRect(g, x + 10, gy - 82, w - 20, 18, 4); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  text(g, name, x + w / 2, gy - 73, { size: 11, color: INK });
  g.fillStyle = dusk > 0.4 ? '#ffe9a8' : '#7f8fb0'; g.fillRect(x + 12, gy - 40, w - 24, 34);
  // 路灯
  if (i % 3 === 0) {
    g.fillStyle = '#5b5866'; g.fillRect(x + w - 6, gy - 128, 4, 128);
    g.fillRect(x + w - 22, gy - 128, 20, 4);
    if (dusk > 0.3) { g.fillStyle = `rgba(255,230,150,${dusk})`; g.beginPath(); g.arc(x + w - 20, gy - 122, 6, 0, Math.PI * 2); g.fill(); }
  }
}

function parkProp(g, x, gy, w, r, i, dusk) {
  // 住宅楼：阳台 + 晾衣服
  g.fillStyle = ['#f1e0c5', '#e6d3ef', '#d8ead2'][i % 3]; g.fillRect(x, gy - 190, w + 1, 160);
  for (let row = 0; row < 4; row++) {
    const y = gy - 180 + row * 38;
    const lit = dusk > 0.3 && hash(i * 17 + row) > 0.4;
    g.fillStyle = lit ? '#ffe08a' : '#9fb3cf'; g.fillRect(x + 16, y, 22, 20); g.fillRect(x + 52, y, 22, 20);
    g.fillStyle = '#ffffffaa'; g.fillRect(x + 8, y + 22, w - 16, 4);
    if (hash(i * 23 + row) > 0.7) { g.fillStyle = ['#ff6b5a', '#4b7bec', '#f7b731'][row % 3]; g.fillRect(x + 20 + row * 9, y + 26, 8, 10); }
  }
  // 树 + 草
  g.fillStyle = '#8fcf7a'; g.fillRect(x, gy - 30, w + 1, 30);
  if (r < 0.6) {
    g.fillStyle = '#8b5e3c'; g.fillRect(x + 40, gy - 70, 8, 44);
    g.fillStyle = '#5fb36b'; for (const [dx, dy, rr] of [[44, -82, 22], [30, -72, 15], [58, -70, 15]]) { g.beginPath(); g.arc(x + dx, gy + dy, rr, 0, Math.PI * 2); g.fill(); }
  }
}

function homeProp(g, x, gy, w, r, i, dusk) {
  g.fillStyle = '#f7e1c6'; g.fillRect(x, gy - 200, w + 1, 200);
  g.fillStyle = '#e9c9a3'; g.fillRect(x, gy - 24, w + 1, 24);
  if (i % 3 === 1) {             // 别人家的门
    g.fillStyle = '#b5835a'; roundRect(g, x + 22, gy - 120, 46, 96, 4); g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#f7b731'; g.beginPath(); g.arc(x + 60, gy - 70, 3, 0, Math.PI * 2); g.fill();
  } else if (r < 0.4) {          // 鞋柜
    g.fillStyle = '#ffffff'; roundRect(g, x + 20, gy - 54, 50, 30, 4); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  g.fillStyle = dusk > 0.3 ? '#ffd27a' : '#fff1d8'; g.beginPath(); g.arc(x + w / 2, gy - 186, 6, 0, Math.PI * 2); g.fill();
}

// 地面：近景，parallax 1
export function drawGround(g, W, H, groundY, themeAt, camX) {
  const cell = 40, first = Math.floor(camX / cell) - 1;
  for (let i = first; i < first + W / cell + 3; i++) {
    const x = i * cell - camX, t = THEMES[themeAt(i * cell)];
    g.fillStyle = t.floor; g.fillRect(x, groundY, cell + 1, H - groundY);
    g.fillStyle = t.floorLine; g.fillRect(x, groundY, 2, 18); g.fillRect(x + cell / 2, groundY + 18, 2, 18);
    g.fillRect(x, groundY + 17, cell + 1, 2);
    if (t.curb) { g.fillStyle = t.curb; g.fillRect(x, groundY + 36, cell + 1, 6); g.fillStyle = t.road; g.fillRect(x, groundY + 42, cell + 1, H - groundY - 42); g.fillStyle = '#f2f2f2'; if (i % 3 === 0) g.fillRect(x, groundY + 70, cell * 0.8, 4); }
    if (t.grass) { g.fillStyle = t.grass; g.fillRect(x, groundY + 36, cell + 1, H - groundY - 36); }
  }
  g.fillStyle = INK; g.fillRect(0, groundY - 1, W, 2.5);
}
