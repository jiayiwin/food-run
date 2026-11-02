// 粒子与动效：花瓣飘落、撒花爆发、打字机。全部可被 prefers-reduced-motion 关掉。
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createPetals(canvas, ambient = 28) {
  if (!canvas || reduce) return { burst() {}, stop() {} };
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, raf = 0;
  const petals = [];
  const resize = () => { w = canvas.width = canvas.offsetWidth * devicePixelRatio; h = canvas.height = canvas.offsetHeight * devicePixelRatio; };
  resize();
  const spawn = (burst = false) => ({
    x: Math.random() * w, y: burst ? h * 0.4 : -20, r: (4 + Math.random() * 6) * devicePixelRatio,
    vx: (Math.random() - 0.5) * (burst ? 8 : 1.2), vy: burst ? -6 - Math.random() * 6 : 0.8 + Math.random() * 1.2,
    rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.08, a: 0.6 + Math.random() * 0.4,
    hue: 330 + Math.random() * 25,
  });
  for (let i = 0; i < ambient; i++) { const p = spawn(); p.y = Math.random() * h; petals.push(p); }
  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of petals) {
      p.x += p.vx + Math.sin(p.y / 40) * 0.4; p.y += p.vy; p.vy += p.vy < 0 ? 0.25 : 0; p.rot += p.vr;
      if (p.y > h + 20) { if (petals.indexOf(p) < ambient) Object.assign(p, spawn()); else p.dead = true; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = p.a;
      ctx.fillStyle = `hsl(${p.hue} 90% 80%)`;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (let i = petals.length - 1; i >= ambient; i--) if (petals[i].dead) petals.splice(i, 1);
    raf = requestAnimationFrame(tick);
  };
  tick();
  const onResize = () => resize();
  addEventListener('resize', onResize);
  return {
    burst(n = 40) { for (let i = 0; i < n; i++) petals.push(spawn(true)); },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); },
  };
}

export function typewriter(el, speed = 28) {
  if (!el || reduce) return;
  const text = el.textContent;
  el.textContent = '';
  el.classList.add('typing');
  let i = 0;
  const step = () => {
    if (!el.isConnected) return;
    i++;
    el.textContent = text.slice(0, i);
    if (i < text.length) setTimeout(step, speed);
    else el.classList.remove('typing');
  };
  setTimeout(step, 80);
}
