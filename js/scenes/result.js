// 「下班战报」：竖版截图卡 + 再跑一次 / 炫耀一下。
// 关卡局：页眉写关名，到家时刻下面「标准 18:46 · 快 1 分」，三颗星依次点亮（没亮的那颗下面写目标）；按钮「下一关」/「再来一次」/「回首页」。
// 失败：卡片里一句死因提示；同一关连败 2 次时卡片下面多一张「带薪摸鱼」卡（读题 +0.3 秒、障碍少 15%、这一局最多两星）
import { screen, share, rawCanvas, exportCanvas, copyText } from '../platform/index.js';
import { isDev } from '../debug.js';
import { drawShareCard } from '../render/shareCard.js';
import { sfx } from '../platform/sfx.js';
import { randomSeed } from '../core/rng.js';
import { layout, NPCNAME } from '../render/world.js';
import { INK, ease, clamp } from '../render/draw.js';
import { avatar, card, starIcon } from '../render/ui.js';
import { gfx } from '../gfx/gfx.js';
import { bake, fromImage } from '../gfx/tex.js';
import { mealArt } from '../render/art.js';
import { BGM } from '../data/tune.js';
import { shareQuery } from '../game/share.js';
import { fmtClock } from '../game/run.js';
import { LEVELS, levelDef } from '../data/levels.js';
import { ASSIST } from '../data/tune.js';
import { save } from '../save.js';
import { say } from '../data/address.js';
import { isOpen, fullOpen, nextLevel, assistOffer } from '../core/savefmt.js';
import { vsText } from './levels.js';

const text = (s, x, y, o) => gfx.text(s, x, y, o);

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function resultScene(game, { result: r, flags = {}, friend = null }) {
  const L = layout(screen);
  let t = 0, buttons = [], copied = 0;
  const cardBox = { x: 14, y: L.top + 40, w: L.W - 28, h: 0 };
  const lvDef = levelDef(r.level);
  // 下一关：关卡赢了、下一关已经开了（周三之后是自由下班）
  const nxt = lvDef && r.win ? (nextLevel(r.level) || (fullOpen(save) ? 'full' : null)) : null;
  const next = nxt && (nxt === 'full' || isOpen(save, nxt)) ? nxt : null;
  // 带薪摸鱼卡：关卡失败、同一关连败 ASSIST.streak 次、这一局还没开摸鱼；好友局不出（好友要比的是同一条路）
  const offer = !!(lvDef && !friend && !r.win && !r.assist && assistOffer(save, r.level, ASSIST.streak));
  // 摸鱼局：卡片下面一行「下一局继续摸鱼 [关掉]」，「再来一次」按它走
  let keepAssist = !!r.assist;
  // 卡片下面那一行（好友对比 / 已解锁）：给它留出高度，底部按钮不挤到屏幕边
  const noteLine = !!((friend && friend.time) || flags.unlockFull || flags.unlockNext) || !!r.assist;

  return {
    get result() { return r; },
    music: () => BGM.home,
    update(dt) { t += dt; copied -= dt; },
    render() {
      buttons = [];
      gfx.rect(0, 0, L.W, L.H, { fill: r.win ? '#ffcf8a' : '#5b4a6b' });
      for (let i = 0; i < 14; i++) gfx.rect(((i * 53 + t * 20) % (L.W + 60)) - 30, 0, 18, L.H, { fill: 'rgba(255,255,255,.08)' });
      const k = ease.outBack(clamp(t / 0.4, 0, 1));
      const { x, y, w } = cardBox;
      const h = Math.min(L.H - L.bottom - y - 130 - (offer ? 74 : 0) - (noteLine ? 22 : 0), 560);
      cardBox.h = h;
      gfx.save(); gfx.translate(L.W / 2, y + h / 2); gfx.scale(0.9 + 0.1 * k); gfx.translate(-L.W / 2, -(y + h / 2));
      card(x, y, w, h, 18, '#fffaf0', { lw: 3 });
      const d = new Date();
      // 页眉
      gfx.rect(x, y, w, 48, { fill: r.win ? '#ff8a5c' : '#7f6a8f', r: 18 }); gfx.rect(x, y + 30, w, 18, { fill: r.win ? '#ff8a5c' : '#7f6a8f' });
      text('下班战报', x + 18, y + 25, { size: 20, color: '#fff', align: 'left' });
      const right = lvDef ? `${lvDef.name}${r.assist ? ' · 摸鱼' : ''}` : `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}${r.daily ? ` · ${r.mod || '今日挑战'}` : ''}`;
      text(right, x + w - 16, y + 25, { size: 13, color: '#fff', align: 'right', weight: lvDef ? 700 : 400, maxW: w - 130 });

      let cy = y + 96;
      const fits = need => cy + need <= y + h - 6;        // 矮屏：放不下的段落不画（从后往前省）
      if (r.win) {
        text(r.arrivalText, x + 26, cy, { size: 56, color: INK, align: 'left' });
        text('到家', x + 26 + 150, cy + 12, { size: 18, color: '#8a7f95', align: 'left' });
        if (!lvDef) stamp(x + w - 62, cy - 2, r.grade, t);
        else if (flags.newStars > 0) { gfx.save(); gfx.translate(x + w - 52, cy - 4); gfx.rotate(0.15); card(-38, -12, 76, 24, 12, '#ffd166', { lw: 1.6, shadow: 0 }); text(`新星 +${flags.newStars}`, 0, 0, { size: 13, color: INK }); gfx.restore(); }
      } else {
        text('没能下班', x + 26, cy, { size: 44, color: '#c0392b', align: 'left' });
        stamp(x + w - 62, cy - 2, '✗', t);
      }
      // 标准时间行（到家时）/ 死因提示（没到家时，让开右边的 ✗ 印章）
      if (r.win && r.parText) {
        cy += 40;
        const d0 = Math.floor(r.arrival) - r.par;
        text(`标准 ${r.parText} · ${vsText(d0)}`, x + 26, cy, { size: 14, color: d0 <= 0 ? '#1e8449' : '#8a7f95', align: 'left' });
        cy += 24;
      } else if (!r.win && r.tip) {
        cy += 50;
        card(x + 20, cy - 13, w - 40, 26, 13, '#eef8ff', { lw: 1.6, shadow: 0 });
        text(`提示：${r.tip}`, L.W / 2, cy, { size: 14, color: '#2e6bb0', maxW: w - 56 });
        cy += 36;
      } else cy += 46;
      // 三颗星（到家了才有）：依次点亮（每颗 0.15 秒），没亮的下面写目标；星没拿全时下面一句提示
      if (lvDef && r.stars && r.win) {
        const sx = [x + w * 0.2, x + w * 0.5, x + w * 0.8];
        const goals = ['到家', r.starLine != null ? `${fmtClock(r.starLine)} 内到家` : '准点到家', lvDef.stars[2].text];   // 和判定一致：取整分钟 ≤ 准点线
        for (let i = 0; i < 3; i++) {
          const on = r.stars[i], pop = ease.outBack(clamp((t - 0.35 - i * 0.15) / 0.2, 0, 1));
          starIcon(sx[i], cy + 12, 15, on && pop > 0, on ? Math.max(0.01, pop) : 1);
          const g = i === 2 && r.assist ? '摸鱼局没有' : goals[i];
          text(g, sx[i], cy + 38, { size: 11, color: on ? INK : '#a99db3', weight: on ? 700 : 400, maxW: w / 3 - 6 });
        }
        cy += 62;
        if (r.tip && fits(40)) { text(`提示：${r.tip}`, L.W / 2, cy - 8, { size: 12, color: '#2e6bb0', weight: 400, maxW: w - 40 }); cy += 18; }
      }
      // 称号
      card(x + 20, cy - 14, w - 40, 30, 15, '#2b2233', { lw: 0, shadow: 0 });
      text(`称号：「${r.title}」`, L.W / 2, cy + 1, { size: 15, color: '#ffd166' });
      cy += 40;
      // 晚饭
      if (fits(40)) {
        bowl(x + 46, cy + 14, r.meal);
        text('今晚的饭', x + 84, cy, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
        text(r.meal.name, x + 84, cy + 22, { size: 20, color: INK, align: 'left', maxW: w - 110 });
        cy += 52;
        // 家庭剧本：饭桌一句、家里交代的事办没办（到家）/ 家里那边（没到家）
        const fl = r.family;
        const lines = !fl ? [] : r.win ? [fl.dinner, fl.errand ? `家里：${fl.errand.share} ${fl.errand.state === 'done' ? '✓' : '✗'}` : ''] : [fl.away ? `家里：${fl.away}` : ''];
        for (const s of lines.filter(Boolean)) if (fits(30)) { text(s, x + 84, cy - 12, { size: 12, color: '#8a7f95', align: 'left', weight: 400, maxW: w - 110 }); cy += 18; }
      }
      // 最离谱借口、拦住你的人（没到家时先画拦住你的人：矮屏放不下两段时留它）
      const excuse = () => {
        if (!fits(66)) return;
        line(x + 20, cy - 8, w - 40);
        text('今日最离谱借口', x + 22, cy + 8, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
        if (flags.newExcuses) text(`图鉴新增 ${flags.newExcuses} 条`, x + w - 22, cy + 8, { size: 12, color: '#e74c3c', align: 'right' });
        if (r.best) {
          text(`「${r.best.text}」`, x + 22, cy + 34, { size: 22, color: '#e74c3c', align: 'left', maxW: w - 44 });
          text(`—— 回 ${NPCNAME(r.best.npc)} 的「${r.best.line}」`, x + 22, cy + 58, { size: 11, color: '#8a7f95', align: 'left', weight: 400, maxW: w - 44 });
        } else text('一句废话没说，跑就完了', x + 22, cy + 34, { size: 17, color: INK, align: 'left' });
        cy += 80;
      };
      const blockers = () => {
        if (!fits(70)) return;
        line(x + 20, cy - 8, w - 40);
        text('拦住你的人', x + 22, cy + 8, { size: 12, color: '#8a7f95', align: 'left', weight: 400 });
        const by = r.stats.caughtBy;
        if (by.length) by.slice(0, 4).forEach((n, i) => { avatar(n, x + 40 + i * 48, cy + 38, 18); text(NPCNAME(n), x + 40 + i * 48, cy + 64, { size: 10, color: INK, weight: 400 }); });
        else text('没人拦得住你', x + 22, cy + 38, { size: 17, color: INK, align: 'left' });
        cy += 80;
      };
      if (r.win) { excuse(); blockers(); } else { blockers(); excuse(); }
      // 数据
      if (cy + 60 < y + h) {
        const s = r.stats;
        const cells = [[`${s.good}/${s.choices}`, '好回答'], [String(s.nearMiss), '惊险'], [`${s.chased} 次`, '被追'], [String(r.score), '得分']];
        const cw = (w - 40) / 4;
        cells.forEach(([v, lb], i) => { text(v, x + 20 + cw * (i + 0.5), cy + 14, { size: 17, color: INK, maxW: cw - 4 }); text(lb, x + 20 + cw * (i + 0.5), cy + 36, { size: 11, color: '#8a7f95', weight: 400 }); });
      }
      if (flags.bestTime || flags.bestDaily) { gfx.save(); gfx.translate(x + w - 40, y + 62); gfx.rotate(0.2); card(-40, -12, 80, 24, 12, '#e74c3c', { lw: 1.6, shadow: 0 }); text('新纪录！', 0, 0, { size: 13, color: '#fff' }); gfx.restore(); }
      if (y + h - 22 > cy + 54) text('狂奔吧，打工人', L.W / 2, y + h - 16, { size: 11, color: '#c4b8cf', weight: 400 });   // 矮屏放不下就不画落款
      gfx.restore();

      // 好友对比 / 解锁提示
      let fy = y + h + 18;
      if (friend && friend.time) {
        const win = r.win && r.arrivalText <= friend.time.padStart(5, '0');
        text(`好友${friend.assist ? '摸鱼' : ''} ${friend.time} 到家 · 你${r.win ? ' ' + r.arrivalText : '没到家'}${win ? '，赢了！' : '，再来一次？'}`, L.W / 2, fy, { size: 14, color: '#fff', lw: 3 });
        fy += 22;
      } else if (flags.unlockFull || flags.unlockNext) {
        const s = flags.unlockFull ? '自由下班已解锁！' : `${LEVELS[flags.unlockNext].short}已解锁`;
        text(s, L.W / 2, fy, { size: 15, color: '#fff', lw: 3, stroke: '#e67e22' });
        fy += 22;
      } else if (r.assist) {
        // 摸鱼局：下一局还摸不摸（点这一行切换）
        text(keepAssist ? '下一局继续带薪摸鱼 · 点这里关掉' : '下一局不摸鱼了 · 点这里再开', L.W / 2, fy, { size: 13, color: '#fff', lw: 3, stroke: keepAssist ? '#1e8449' : INK });
        buttons.push({ id: 'assistToggle', x: 30, y: fy - 14, w: L.W - 60, h: 28 });
        fy += 22;
      }
      // 带薪摸鱼卡
      if (offer) {
        const ay = fy - 4, aw = L.W - 32;
        card(16, ay, aw, 62, 16, '#eafff1', { lw: 2.4 });
        text('带薪摸鱼', 30, ay + 20, { size: 16, color: '#1e8449', align: 'left' });
        text('读题多 0.3 秒 · 障碍少 15% · 这一局最多两星', 30, ay + 44, { size: 11, color: '#4b6b57', align: 'left', weight: 400, maxW: aw - 110 });
        card(16 + aw - 86, ay + 14, 74, 34, 17, '#2ecc71', { lw: 2, shadow: 2 });
        text('开启', 16 + aw - 49, ay + 31, { size: 15, color: '#fff' });
        buttons.push({ id: 'assist', x: 16 + aw - 92, y: ay + 6, w: 86, h: 50 });
        fy += 70;
      }
      // 按钮：关卡赢了且下一关开了 → 「下一关」顶替「再跑一次」，下面一行「再来一次 · 回首页」
      const bw = (L.W - 44) / 2, bh = 52, b0 = Math.min(L.H - L.bottom - 76, fy + 6);
      const mainLabel = next ? (next === 'full' ? '自由下班' : '下一关') : lvDef ? '再来一次' : '再跑一次';
      card(16, b0, bw, bh, 26, '#ffd166', { lw: 2.6 }); text(mainLabel, 16 + bw / 2, b0 + bh / 2, { size: 19, color: INK });
      card(28 + bw, b0, bw, bh, 26, '#ffffff', { lw: 2.6 }); text('炫耀一下', 28 + bw + bw / 2, b0 + bh / 2, { size: 19, color: INK });
      buttons.push({ id: next ? 'next' : 'again', x: 16, y: b0, w: bw, h: bh }, { id: 'share', x: 28 + bw, y: b0, w: bw, h: bh });
      if (next) {
        text('再来一次', L.W / 2 - 54, b0 + bh + 22, { size: 14, color: '#fff', lw: 3 });
        buttons.push({ id: 'again', x: L.W / 2 - 104, y: b0 + bh + 6, w: 100, h: 32 });
        text('回首页', L.W / 2 + 54, b0 + bh + 22, { size: 14, color: '#fff', lw: 3 });
        buttons.push({ id: 'home', x: L.W / 2 + 4, y: b0 + bh + 6, w: 100, h: 32 });
      } else {
        text('回首页', L.W / 2, b0 + bh + 22, { size: 14, color: '#fff', lw: 3 });
        buttons.push({ id: 'home', x: L.W / 2 - 50, y: b0 + bh + 6, w: 100, h: 32 });
      }
      // 开发版：滑动埋点（正式版不显示）。点一下复制成一行 JSON，贴进首测记录
      const sw = isDev() && r.stats.swipe;
      if (sw) {
        const ty = L.top + 18;
        text(`滑动 跑酷${sw.run}(横${sw.runH}) 快弹题${sw.pre} 答题${sw.answer} 误划${sw.misfire} 冲刺${r.stats.dashes || 0}(撞${r.stats.dashHit || 0}) 路口等${r.stats.crossWaits || 0}冲${r.stats.crossDash || 0}${copied > 0 ? ' · 已复制' : ' · 点此复制'}`, L.W / 2, ty, { size: 11, color: '#fff', lw: 3, weight: 400, maxW: L.W - 24 });
        buttons.push({ id: 'copyStats', x: 12, y: ty - 12, w: L.W - 24, h: 24 });
      }
    },
    input(e) {
      if (t < 0.6) return;                       // 卡片还在弹出：吃掉上一场景残留的点击，免得跳过战报
      if (e.type === 'key' && e.key === 'Enter') return press('again');
      if (e.type !== 'tap') return;
      const b = buttons.find(b => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (b) press(b.id);
    },
  };

  function press(id) {
    sfx.click();
    // 再来一次：今日挑战、好友卡用同一个种子；关卡换个种子（路是关卡写死的，题目和左右换一换），摸鱼局接着摸鱼
    if (id === 'again') return game.go('play', r.daily || friend ? { seed: r.seed, level: r.level || 'full', daily: r.daily, friend, assist: keepAssist, story: r.story } : { seed: randomSeed(), level: r.level || 'full', daily: r.daily, friend, assist: keepAssist });   // 今日挑战、好友局：同一条路、同一个家
    if (id === 'assistToggle') { keepAssist = !keepAssist; return; }
    if (id === 'next') return game.go('play', next === 'full' ? { seed: randomSeed() } : { seed: randomSeed(), level: next });
    if (id === 'assist') return game.go('play', { seed: randomSeed(), level: r.level, assist: true });
    if (id === 'home') return game.go('title');
    if (id === 'copyStats') {
      const s = r.stats;
      if (copyText(JSON.stringify({ seed: r.seed, level: r.level, x: Math.round(r.x), reason: r.reason, assist: r.assist, stars: r.stars, win: r.win, arrival: r.arrivalText, hits: s.hits, caught: s.caught, swipe: s.swipe, dashes: s.dashes, dashChased: s.dashChased, dashHit: s.dashHit, splashed: s.splashed, cross: s.crossLog, crossWaits: s.crossWaits, crossDash: s.crossDash, stopT: s.stopT != null ? +s.stopT.toFixed(2) : null }))) copied = 2;   // cross：每个路口的灯和结果（闪绿没冲的比例 > 60% 就加定格教学）
      return;
    }
    if (id === 'share') {
      share(sharePayload(r, shareImage(r)));
    }
  }
}

// 分享：微信卡片图按 5:4 显示，单独画一张 500×400 的图，不截屏幕。参数见 game/share.js（带关卡和路线版本）
export { shareQuery };
export function sharePayload(r, imageUrl) { return { title: shareTitle(r), query: shareQuery(r), ...(imageUrl ? { imageUrl } : {}) }; }
let lastShare = null;
export function shareImage(r) {
  if (lastShare && lastShare.r === r) return lastShare.url;
  const { canvas, ctx } = rawCanvas(500, 400);
  drawShareCard(ctx, r);
  lastShare = { r, url: exportCanvas(canvas, 500, 400) };
  return lastShare.url;
}

// 分享标题是给微信的纯文本：{称呼} 在这里按分享人的主角换好（分享卡、好友卡的参数里不带性别）
export function shareTitle(r) { return say(shareTitleRaw(r)); }
function shareTitleRaw(r) {
  const lv = levelDef(r.level);
  if (r.win && lv) return r.assist ? `${lv.short}这关我开着带薪摸鱼 ${r.arrivalText} 到家了，你来试试？` : `${lv.short}这关我 ${r.arrivalText} 就到家了，你来试试？`;
  const fl = r.family;
  if (r.win && fl && fl.share) return `${fl.share.replace('{t}', ` ${r.arrivalText} `).replace('{meal}', r.meal.name)}${fl.errand ? `，${fl.errand.share}` : ''}，你几点？`;   // 家庭剧本的分享标题：我 18:49 到家，和室友吃出租屋小火锅，你几点？
  if (r.win) return `我 ${r.arrivalText} 就到家吃上${r.meal.name}了，你几点？`;
  return r.reason === 'starve' ? '我饿晕在下班路上了……' : `我被${NPCNAME(r.npc)}拦下了，今晚吃${r.meal.name}……`;
}

function stamp(x, y, s, t) {
  const k = ease.outBack(clamp((t - 0.25) / 0.3, 0, 1));
  if (k <= 0) return;
  const col = s === 'S' ? '#e74c3c' : s === 'A' ? '#ff8a5c' : s === 'B' ? '#3d7ad6' : '#7f8c8d';
  gfx.save(); gfx.translate(x, y); gfx.rotate(-0.2); gfx.scale(2 - k); gfx.alpha(Math.min(1, k));
  gfx.circle(0, 0, 32, { stroke: col, lw: 4, fill: 'rgba(255,255,255,0)' });
  gfx.circle(0, 0, 26, { stroke: col, lw: 1.5, fill: 'rgba(255,255,255,0)' });
  text(s, 0, 2, { size: 38, color: col });
  gfx.restore();
}
function bowl(x, y, meal) {
  const a = mealArt(meal);
  if (a) { const k = 44 / a.w; gfx.draw(fromImage(`meal|${a.src}`, a.img, a.w, a.h, { ox: a.w / 2, oy: a.h }), x, y + 12, { sx: k, sy: k }); return; }
  gfx.draw(bake(`bowl|${meal.name}`, [-24, -16, 48, 30], g => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -6, 22, 0, Math.PI); g.closePath(); g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
    g.fillStyle = meal.color || (meal.tier < 0 ? '#bbb' : '#f2c14e'); g.beginPath(); g.ellipse(0, -6, 20, 7, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = meal.side || '#eee'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-9 + i * 9, -9, 3.5, 0, Math.PI * 2); g.fill(); }
  }), x, y);
}
function line(x, y, w) { for (let d = 0; d < w; d += 8) gfx.rect(x + d, y - 0.75, Math.min(4, w - d), 1.5, { fill: '#eadfce' }); }
