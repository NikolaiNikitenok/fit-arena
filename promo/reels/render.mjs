// Титры рилса из script.json: band_NN.png (полоса сверху) и hook.png (крупный хук на весь экран). Нужен playwright.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const s = JSON.parse(readFileSync('script.json', 'utf8'));
const font = (f) => readFileSync(new URL(`./fonts/${f}`, import.meta.url)).toString('base64');
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const css = `@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-cyrillic-900-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-latin-900-normal.woff2')})}
html,body{margin:0;background:transparent}
.acc{background:linear-gradient(90deg,#ffc06b,#ff6a4d);-webkit-background-clip:text;color:transparent}`;

// Куски титров по порядку; последний кусок реплики выделяем цветом.
const subs = [];
s.lines.slice(1).forEach((l) => l.subs.forEach((t, j) => subs.push({ t, acc: j === l.subs.length - 1 && l.subs.length > 1 })));
writeFileSync('subs.json', JSON.stringify(subs));

const b = await chromium.launch();
let p = await b.newPage({ viewport: { width: 1080, height: 330 } });
for (let i = 0; i < subs.length; i++) {
  await p.setContent(`<html><head><style>${css}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse 70% 120% at 50% 0%,#2c2236 0%,#1a1b38 55%,#13182f 100%);-webkit-mask:linear-gradient(#000 82%,transparent)}
.t{position:absolute;left:40px;right:40px;top:0;height:290px;display:flex;align-items:center;justify-content:center;text-align:center;font:900 ${subs[i].t.length > 18 ? 80 : 92}px/1.05 N;color:#fff}
</style></head><body><div class="bg"></div><div class="t"><span class="${subs[i].acc ? 'acc' : ''}">${esc(subs[i].t)}</span></div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `band_${String(i).padStart(2, '0')}.png`, omitBackground: true });
}
const h = s.hook;
p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.setContent(`<html><head><style>${css}
body{width:1080px;height:1920px}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(10,12,30,.55),rgba(8,10,25,.88))}
.top{position:absolute;left:0;right:0;top:0;height:330px;background:linear-gradient(#13182f 80%,rgba(19,24,47,0))}
.w{position:absolute;left:50px;right:50px;top:0;height:1920px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.t{font:900 ${h.top.length > 22 ? 120 : 150}px/1.0 N;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,.6)}
.hl{font:900 ${h.accent.length > 14 ? 140 : 170}px/1.0 N;margin-top:14px;color:#ff8f52;text-shadow:0 8px 40px rgba(255,90,60,.5)}
.s{margin-top:60px;font:900 64px N;color:#ffb37a;letter-spacing:2px}
</style></head><body><div class="bg"></div><div class="top"></div><div class="w"><div class="t">${esc(h.top)}</div><div class="hl">${esc(h.accent)}</div>${h.sub ? `<div class="s">${esc(h.sub)}</div>` : ''}</div></body></html>`);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'hook.png', omitBackground: true });
await b.close();
