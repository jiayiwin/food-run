// 合成音效：用 WebAudio 现场合成，不占安装包。微信基础库 2.19+ 有 wx.createWebAudioContext，没有就静音。
/* global wx */
let ac = null, master = null, muted = false;

function ctx() {
  if (ac) return ac;
  try {
    ac = wx.createWebAudioContext ? wx.createWebAudioContext() : null;
    if (ac) { master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); }
  } catch (e) { ac = null; }
  return ac;
}

function tone(freq, dur, { type = 'sine', gain = 0.3, when = 0, slide = null, attack = 0.005 } = {}) {
  const c = ctx(); if (!c || muted) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { gain = 0.25, when = 0, hp = 400, lp = 6000 } = {}) {
  const c = ctx(); if (!c || muted) return;
  const t = c.currentTime + when;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = gain;
  let node = src;
  if (c.createBiquadFilter) {
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    src.connect(h); h.connect(l); node = l;
  }
  node.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(m) { muted = !!m; },
  // 被打断 / 切后台后 WebAudio 会挂起：每次触摸、回到前台都试着恢复一下（很便宜）
  unlock() { const c = ctx(); if (c && c.resume && c.state !== 'running') { try { c.resume(); } catch (e) { /* ignore */ } } },
  jump() { tone(420, 0.16, { type: 'square', gain: 0.12, slide: 860 }); },
  land() { noise(0.06, { gain: 0.18, hp: 120, lp: 900 }); },
  slide() { noise(0.28, { gain: 0.16, hp: 900, lp: 5000 }); },
  whoosh() { noise(0.35, { gain: 0.14, hp: 600, lp: 3000 }); },
  pop() { tone(660, 0.07, { type: 'triangle', gain: 0.22 }); tone(990, 0.09, { type: 'triangle', gain: 0.18, when: 0.05 }); },
  tick() { tone(1250, 0.03, { type: 'square', gain: 0.07 }); },
  hurry() { tone(1650, 0.05, { type: 'square', gain: 0.1 }); },
  good() { tone(784, 0.1, { gain: 0.22 }); tone(1047, 0.12, { gain: 0.22, when: 0.07 }); tone(1568, 0.18, { gain: 0.18, when: 0.14 }); },
  bad() { tone(220, 0.22, { type: 'sawtooth', gain: 0.14, slide: 120 }); tone(180, 0.28, { type: 'sawtooth', gain: 0.12, when: 0.1, slide: 90 }); },
  hit() { noise(0.12, { gain: 0.35, hp: 60, lp: 1200 }); tone(140, 0.18, { type: 'triangle', gain: 0.28, slide: 60 }); },
  coin() { tone(988, 0.06, { type: 'square', gain: 0.1 }); tone(1319, 0.12, { type: 'square', gain: 0.1, when: 0.06 }); },
  caught() { for (let i = 0; i < 3; i++) tone(880, 0.09, { type: 'square', gain: 0.12, when: i * 0.13 }); },
  ring() { for (let i = 0; i < 4; i++) { tone(1320, 0.06, { type: 'sine', gain: 0.15, when: i * 0.1 }); tone(1660, 0.06, { type: 'sine', gain: 0.12, when: i * 0.1 + 0.05 }); } },
  speedup() { tone(300, 0.4, { type: 'sawtooth', gain: 0.07, slide: 900 }); noise(0.4, { gain: 0.08, hp: 1500, lp: 7000 }); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, { gain: 0.18, when: i * 0.1 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.2, when: i * 0.16 })); },
  click() { tone(880, 0.04, { type: 'square', gain: 0.06 }); },
};
