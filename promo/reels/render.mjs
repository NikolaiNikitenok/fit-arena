// Титры рилса из script.json (Playwright, шрифт Nunito из fonts/):
//   hook.png — крупный хук поверх первого кадра; end.png — призыв на финальном экране;
//   w_LL_WW.png — субтитры по словам: кусок в 1–3 слова, текущее слово подсвечено (как в TikTok/Reels).
// words.json — список файлов по репликам, тайминги считает build.py по озвучке.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const s = JSON.parse(readFileSync('script.json', 'utf8'));
const font = (f) => readFileSync(new URL(`./fonts/${f}`, import.meta.url)).toString('base64');
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const css = `@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-cyrillic-900-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-latin-900-normal.woff2')})}
html,body{margin:0;background:transparent}
.st{paint-order:stroke fill;-webkit-text-stroke:14px #0b0d1c;text-shadow:0 10px 30px rgba(0,0,0,.55)}`;

/** Слова реплики, сгруппированные по 1–3 (до 16 символов): короткие куски читаются с одного взгляда. */
function chunks(text) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out = [];
  let cur = [];
  for (const w of words) {
    const len = [...cur, w].join(' ').length;
    if (cur.length && (cur.length >= 3 || len > 15 || /[.!?…,:]$/.test(cur.at(-1)))) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let p = await b.newPage({ viewport: { width: 1080, height: 420 } });
const list = [];
for (let i = 1; i < s.lines.length; i++) {
  const files = [];
  let k = 0;
  for (const ch of chunks(s.lines[i].text)) {
    for (let a = 0; a < ch.length; a++) {
      const html = ch.map((w, j) => `<span class="${j === a ? 'on' : ''}">${esc(w)}</span>`).join(' ');
      await p.setContent(`<html><head><style>${css}
.t{position:absolute;left:70px;right:70px;top:0;height:420px;display:flex;flex-wrap:wrap;align-content:center;column-gap:.42em;align-items:center;justify-content:center;text-align:center;font:900 112px/1.04 N;color:#fff;text-transform:uppercase}
.t span{display:inline-block;white-space:nowrap}
.on{color:#ffd23f;transform:scale(1.06) rotate(-2deg)}
</style></head><body><div class="t st">${html}</div></body></html>`);
      await p.evaluate(async () => {
        await document.fonts.ready;
        // Уменьшаем шрифт, пока кусок не влезет в две строки по ширине кадра.
        const t = document.querySelector('.t');
        for (let px = 112; px > 60; px -= 4) {
          t.style.fontSize = px + 'px';
          const fit = [...t.children].every((c) => c.offsetWidth <= t.clientWidth) && t.scrollHeight <= 400;
          if (fit) break;
        }
      });
      const f = `w_${String(i).padStart(2, '0')}_${String(k).padStart(2, '0')}.png`;
      await p.screenshot({ path: f, omitBackground: true });
      files.push({ f, w: ch[a] });
      k++;
    }
  }
  list.push(files);
}
writeFileSync('words.json', JSON.stringify(list));

const h = s.hook;
p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.setContent(`<html><head><style>${css}
body{width:1080px;height:1920px}
.sh{position:absolute;left:0;right:0;top:0;height:1100px;background:linear-gradient(rgba(8,10,25,.78),rgba(8,10,25,.45) 55%,rgba(8,10,25,0))}
.w{position:absolute;left:50px;right:50px;top:230px;display:flex;flex-direction:column;align-items:center;text-align:center}
.t{font:900 ${h.top.length > 20 ? 104 : 124}px/1.0 N;color:#fff}
.hl{font:900 ${h.accent.length > 12 ? 132 : 158}px/1.0 N;margin-top:18px;color:#ffd23f;transform:rotate(-2deg)}
</style></head><body><div class="sh"></div><div class="w"><div class="t st">${esc(h.top)}</div><div class="hl st">${esc(h.accent)}</div></div></body></html>`);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'hook.png', omitBackground: true });

// Призыв на финальном экране: плашка над логотипом, чтобы её видно было и на обложке повтора.
p = await b.newPage({ viewport: { width: 1080, height: 360 } });
await p.setContent(`<html><head><style>${css}
.w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.b{max-width:900px;padding:26px 44px;border-radius:44px;background:linear-gradient(90deg,#ffc06b,#ff6a4d);color:#1a1020;font:900 ${String(s.end).length > 24 ? 62 : 72}px/1.08 N;text-align:center;box-shadow:0 18px 60px rgba(255,106,77,.45);transform:rotate(-2deg)}
</style></head><body><div class="w"><div class="b">${esc(s.end)}</div></div></body></html>`);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'end.png', omitBackground: true });
await b.close();
