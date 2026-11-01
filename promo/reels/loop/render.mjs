// Титры рилса-петли (Playwright, шрифт Nunito): text.png — хук сверху и плашка «пиши в комменты» снизу,
// оба на весь ролик (без появления и исчезания, чтобы шов петли не было видно); st_*.png — наклейки ударов.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const s = JSON.parse(readFileSync('script.json', 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const font = (f) => readFileSync(new URL(`../fonts/${f}`, import.meta.url)).toString('base64');
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const css = `@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-cyrillic-900-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-latin-900-normal.woff2')})}
html,body{margin:0;background:transparent}
.st{paint-order:stroke fill;-webkit-text-stroke:14px #0b0d1c;text-shadow:0 10px 30px rgba(0,0,0,.55)}`;

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const h = s.hook;
await p.setContent(`<html><head><style>${css}
body{width:1080px;height:1920px}
.sh{position:absolute;left:0;right:0;top:0;height:720px;background:linear-gradient(rgba(8,10,25,.82),rgba(8,10,25,.55) 55%,rgba(8,10,25,0))}
.w{position:absolute;left:50px;right:50px;top:170px;display:flex;flex-direction:column;align-items:center;text-align:center}
.t{font:900 ${h.top.length > 18 ? 92 : 108}px/1.0 N;color:#fff}
.hl{font:900 ${h.accent.length > 12 ? 112 : 136}px/1.0 N;margin-top:14px;color:#ffd23f;transform:rotate(-2deg)}
.ask{position:absolute;left:0;right:0;bottom:250px;display:flex;justify-content:center}
.b{max-width:900px;padding:22px 40px;border-radius:40px;background:linear-gradient(90deg,#ffc06b,#ff6a4d);color:#1a1020;font:900 ${String(s.ask).length > 24 ? 56 : 64}px/1.08 N;text-align:center;box-shadow:0 18px 60px rgba(255,106,77,.45);transform:rotate(-2deg)}
</style></head><body><div class="sh"></div><div class="w"><div class="t st">${esc(h.top)}</div><div class="hl st">${esc(h.accent)}</div></div>
<div class="ask"><div class="b">${esc(s.ask)}</div></div></body></html>`);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'text.png', omitBackground: true });

const used = [s.anchor, ...s.middle];
const texts = [...new Set(used.flatMap((id) => (catalog[id]?.fx ?? []).map((e) => e[2]).filter(Boolean)))];
const stickers = {};
p = await b.newPage({ viewport: { width: 1080, height: 500 } });
for (const [k, txt] of texts.entries()) {
  const grad = /^[−-]/.test(txt) ? '#ffe3e3,#ff5d5d 55%,#c81e3a' : /ПОБЕД|КУБК|НОКАУТ/.test(txt) ? '#fff6c8,#ffd23f 50%,#ff9a1f' : '#fff3c4,#ffb03b 55%,#ff5a36';
  await p.setContent(`<html><head><style>${css}
.w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.s{font:900 ${txt.length > 8 ? 130 : txt.length > 5 ? 150 : 190}px/1 N;letter-spacing:-2px;transform:rotate(-7deg);background:linear-gradient(180deg,${grad});-webkit-background-clip:text;color:transparent;filter:drop-shadow(6px 6px 0 #0b0d1c) drop-shadow(-6px -6px 0 #0b0d1c) drop-shadow(6px -6px 0 #0b0d1c) drop-shadow(-6px 6px 0 #0b0d1c) drop-shadow(0 18px 30px rgba(0,0,0,.6))}
</style></head><body><div class="w"><div class="s">${esc(txt)}</div></div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const f = `st_${String(k).padStart(2, '0')}.png`;
  await p.screenshot({ path: f, omitBackground: true });
  stickers[txt] = f;
}
writeFileSync('stickers.json', JSON.stringify(stickers));
await b.close();
