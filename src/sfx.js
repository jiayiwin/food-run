// 极简音效：WebAudio 合成，不依赖素材。首次用户交互后才会出声。
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('bellyfirst.muted') === '1'; } catch { /* ignore */ }

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = 'sine', gain = 0.08, when = 0, slideTo = null) {
  const c = ac(); if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + when + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + when);
  o.stop(c.currentTime + when + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('bellyfirst.muted', muted ? '1' : '0'); } catch { /* ignore */ } return muted; },
  tap() { tone(660, 0.05, 'square', 0.03); },
  tick() { tone(1200, 0.03, 'square', 0.04); },
  hurry() { tone(1600, 0.04, 'square', 0.06); },
  perfect() { tone(784, 0.12, 'sine', 0.07); tone(1047, 0.14, 'sine', 0.07, 0.1); tone(1319, 0.2, 'sine', 0.07, 0.2); },
  danger() { tone(220, 0.25, 'sawtooth', 0.07, 0, 110); tone(180, 0.3, 'sawtooth', 0.06, 0.12, 90); },
  cold() { tone(392, 0.2, 'triangle', 0.05, 0, 300); },
  panic() { tone(900, 0.08, 'square', 0.06); tone(700, 0.08, 'square', 0.06, 0.08); tone(500, 0.12, 'square', 0.06, 0.16); },
  intrude() { tone(500, 0.08, 'triangle', 0.07); tone(750, 0.12, 'triangle', 0.07, 0.07); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.07, i * 0.12)); },
  lose() { tone(300, 0.5, 'sawtooth', 0.06, 0, 80); },
};
