// Значки достижений для emoji-статуса: металлическая медаль редкости + цветной эмодзи Noto. PNG 100×100.
// node scripts/emoji-badges.cjs [out-dir] — список берётся из server/emojiBadges.ts, редкость — из src/game/achievements.ts.
const { chromium } = require('playwright');
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..');
const out = process.argv[2] || `${ROOT}/public/emoji`;
const badges = [...fs.readFileSync(`${ROOT}/server/emojiBadges.ts`, 'utf8').matchAll(/^  \['([\w-]+)', '([^']+)'\],/gm)].map((m) => [m[1], m[2]]);
const ach = fs.readFileSync(`${ROOT}/src/game/achievements.ts`, 'utf8');
const tier = {};
for (const m of ach.matchAll(/a\('([\w-]+)', t\('[^']*'\), t\('[^']*'\), '\w+', '(\w+)'/g)) tier[m[1]] = m[2];
for (const m of ach.matchAll(/\['(\w+)', t\('[^']*'\), '\w+', '(\w+)'\]/g)) tier[`prog-${m[1]}`] = m[2];
const PAL = {
  bronze: { ring: ['#ffd9b3', '#d8894a', '#6e3a17'], base: ['#8a5530', '#2e190c'], glow: '#ff9a4a' },
  silver: { ring: ['#ffffff', '#c3cedd', '#5f6b80'], base: ['#5d6a82', '#1c2230'], glow: '#bfe0ff' },
  gold: { ring: ['#fff6c2', '#ffc93a', '#9a640a'], base: ['#9a6c12', '#2f1f04'], glow: '#ffd84a' },
  legend: { ring: ['#ffe3ff', '#c08cff', '#4a1fa0'], base: ['#6a35c0', '#170a3a'], glow: '#e08cff' },
};
const hex = (r) => [[50, 50 - r], [50 + r * 0.866, 50 - r / 2], [50 + r * 0.866, 50 + r / 2], [50, 50 + r], [50 - r * 0.866, 50 + r / 2], [50 - r * 0.866, 50 - r / 2]].map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');
const spark = (x, y, s, c) => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}z" fill="${c}"/>`;
function svg(emoji, t) {
  const p = PAL[t];
  const sparks = t === 'legend' ? spark(86, 14, 7, '#fff') + spark(13, 84, 5, '#ffd6ff') + spark(90, 80, 3.5, '#fff') : t === 'gold' ? spark(86, 15, 6, '#fffbe0') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.ring[0]}"/><stop offset=".45" stop-color="${p.ring[1]}"/><stop offset="1" stop-color="${p.ring[2]}"/></linearGradient>
    <linearGradient id="edge" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${p.ring[0]}" stop-opacity=".9"/><stop offset=".5" stop-color="${p.ring[1]}" stop-opacity="0"/></linearGradient>
    <radialGradient id="base" cx=".5" cy=".38" r=".65"><stop offset="0" stop-color="${p.base[0]}"/><stop offset="1" stop-color="${p.base[1]}"/></radialGradient>
    <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="in"><polygon points="${hex(33)}"/></clipPath>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-color="#000" flood-opacity=".55"/></filter>
  </defs>
  <polygon points="${hex(44)}" fill="url(#ring)" stroke="url(#ring)" stroke-width="7" stroke-linejoin="round"/>
  <polygon points="${hex(44)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1" stroke-linejoin="round"/>
  <polygon points="${hex(38.5)}" fill="none" stroke="url(#edge)" stroke-width="1.6" stroke-linejoin="round"/>
  <polygon points="${hex(33)}" fill="url(#base)" stroke="#000" stroke-opacity=".45" stroke-width="1.6" stroke-linejoin="round"/>
  <g clip-path="url(#in)">
    <circle cx="50" cy="52" r="30" fill="url(#halo)"/>
    <ellipse cx="50" cy="22" rx="34" ry="16" fill="url(#gloss)"/>
  </g>
  <text x="50" y="52" font-family="Noto Color Emoji" font-size="48" text-anchor="middle" dominant-baseline="central" filter="url(#sh)">${emoji}</text>
  ${sparks}
</svg>`;
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 400, height: 400 } });
  const sheet = [];
  for (const [id, emoji] of badges) {
    const t = tier[id];
    if (!t) throw new Error(`нет редкости у ${id}`);
    const s = svg(emoji, t);
    sheet.push(s);
    await pg.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await pg.evaluate(() => document.fonts.ready);
    const big = await pg.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 400, height: 400 } });
    // Уменьшаем 400 → 100 со сглаживанием: края и мелкие детали чище, чем при отрисовке сразу в 100.
    const small = await pg.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const mid = Object.assign(document.createElement('canvas'), { width: 200, height: 200 });
      const mc = mid.getContext('2d'); mc.imageSmoothingQuality = 'high'; mc.drawImage(img, 0, 0, 200, 200);
      const c = Object.assign(document.createElement('canvas'), { width: 100, height: 100 });
      const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(mid, 0, 0, 100, 100);
      return c.toDataURL('image/png').split(',')[1];
    }, big.toString('base64'));
    fs.writeFileSync(`${out}/${id}.png`, Buffer.from(small, 'base64'));
  }
  // Обзорный лист для проверки глазами.
  const files = badges.map(([id]) => `<div style="text-align:center;color:#aaa;font:11px sans-serif"><img src="data:image/png;base64,${fs.readFileSync(`${out}/${id}.png`).toString('base64')}" width="100"><br>${id}<br><img src="data:image/png;base64,${fs.readFileSync(`${out}/${id}.png`).toString('base64')}" width="22"></div>`).join('');
  await pg.setViewportSize({ width: 1000, height: 800 });
  await pg.setContent(`<body style="margin:0;background:#17212b;display:grid;grid-template-columns:repeat(8,1fr);gap:8px;padding:10px">${files}</body>`);
  await pg.screenshot({ path: process.argv[3] || 'emoji-sheet.png', fullPage: true });
  await b.close();
  console.log(`${badges.length} значков → ${out}`);
})();
