// Кадры рилса от персонажа: 3D-модель с прозрачным фоном, рот по громкости голоса, жест по реплике.
// vlog — крупно на весь кадр с лёгкой «тряской фронталки», corner — по пояс для угла поверх игры.
// Плюс титры (band_NN.png), хук сверху (hook.png), плашки с именами (name_<who>.png) и подсветка угла (glow.png).
// Вход: script.json, timing.json. Выход: frames/<реплика>/NNNN.png и картинки выше. Нужен playwright.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { GESTURES } from './generate.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const MODULES = process.env.THREE_MODULES || join(ROOT, 'node_modules');
const s = JSON.parse(readFileSync('script.json', 'utf8'));
const tm = JSON.parse(readFileSync('timing.json', 'utf8'));
export const CORNER = { w: 600, h: 760 };

// Свой маленький сервер: сцене нужны модели из public/ и three из node_modules.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = u.startsWith('/node_modules/') ? join(MODULES, normalize(u.slice(14))) : join(ROOT, normalize(u));
  if (!existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  r.end(readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const b = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function stage(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.log('сцена:', e.message));
  await p.goto(`${base}/promo/talk/scene.html?w=${w}&h=${h}`);
  await p.waitForFunction(() => window.talkReady);
  return p;
}
const pages = { vlog: await stage(1080, 1920), corner: await stage(CORNER.w, CORNER.h) };
const loaded = { vlog: null, corner: null };

const t0 = Date.now(); let total = 0;
for (let i = 0; i < s.lines.length; i++) {
  const l = s.lines[i], c = s.cast[l.who], p = pages[l.layout];
  if (loaded[l.layout] !== l.who) {
    await p.evaluate((c) => window.talk.setup({ model: c.model, tint: c.tint }), c);
    loaded[l.layout] = l.who;
  }
  const dir = `frames/${i}`; mkdirSync(dir, { recursive: true });
  const T = tm.cuts[i + 1] - tm.cuts[i], off = tm.starts[i] - tm.cuts[i], env = tm.env[i];
  const n = Math.ceil(T * tm.fps) + 1;
  for (let f = 0; f < n; f++) {
    const t = f / tm.fps, k = Math.round((t - off) * tm.fps);
    const open = k >= 0 && k < env.length ? env[k] : 0;
    await p.evaluate(([layout, t, g, open]) => {
      const { camera, frame } = window.talk;
      if (layout === 'vlog') {
        // Фронталка в руке: камера чуть плавает, персонаж внизу кадра, сверху место для титров.
        camera.position.set(0.06 * Math.sin(t * 1.3), 1.8 + 0.035 * Math.sin(t * 2.1), 5.6);
        camera.lookAt(0.02 * Math.sin(t * 0.9), 1.85, 0);
      } else {
        camera.position.set(0.3, 1.68, 3.0);
        camera.lookAt(0, 1.5, 0);
      }
      frame(g === 'Idle' ? t : t + 0.2, open, g);
    }, [l.layout, tm.cuts[i] + t, GESTURES[l.gesture] ?? 'Idle', open]);
    await p.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.png`, omitBackground: true });
  }
  total += n;
  console.log(`реплика ${i + 1}: ${l.who} ${l.layout} ${l.gesture}, ${n} кадров`);
}
console.log(`персонаж: ${total} кадров за ${((Date.now() - t0) / 1000).toFixed(0)} с`);

// Титры, хук, имена — HTML со шрифтом Nunito, как у обычных рилсов.
const font = (f) => readFileSync(new URL(`../reels/fonts/${f}`, import.meta.url)).toString('base64');
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const css = `@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-cyrillic-900-normal.woff2')});unicode-range:U+0400-04FF}
@font-face{font-family:N;src:url(data:font/woff2;base64,${font('nunito-latin-900-normal.woff2')})}
html,body{margin:0;background:transparent}
.acc{background:linear-gradient(90deg,#ffc06b,#ff6a4d);-webkit-background-clip:text;color:transparent}`;
const shot = async (w, h, body, path) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><head><style>${css}</style></head><body>${body}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path, omitBackground: true });
  await p.close();
};

const subs = [];
s.lines.forEach((l, i) => i && l.subs.forEach((t, j) => subs.push({ line: i, t, acc: j === l.subs.length - 1 && l.subs.length > 1 })));
writeFileSync('subs.json', JSON.stringify(subs));
const bandBg = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse 70% 120% at 50% 0%,#2c2236 0%,#1a1b38 55%,#13182f 100%);-webkit-mask:linear-gradient(#000 82%,transparent)"></div>`;
for (let i = 0; i < subs.length; i++) {
  await shot(1080, 330, `${bandBg}<div style="position:absolute;left:40px;right:40px;top:0;height:290px;display:flex;align-items:center;justify-content:center;text-align:center;font:900 ${subs[i].t.length > 18 ? 80 : 92}px/1.05 N;color:#fff"><span class="${subs[i].acc ? 'acc' : ''}">${esc(subs[i].t)}</span></div>`, `band_${String(i).padStart(2, '0')}.png`);
}
const h = s.hook;
await shot(1080, 520, `<div style="position:absolute;inset:0;background:linear-gradient(rgba(19,24,47,.92) 55%,rgba(19,24,47,0))"></div>
<div style="position:absolute;left:40px;right:40px;top:40px;text-align:center"><div style="font:900 ${h.top.length > 20 ? 96 : 116}px/1.02 N;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.5)">${esc(h.top)}</div>
<div style="font:900 ${h.accent.length > 14 ? 112 : 136}px/1.02 N;margin-top:8px;color:#ff8f52;text-shadow:0 6px 30px rgba(255,90,60,.45)">${esc(h.accent)}</div></div>`, 'hook.png');
for (const [id, c] of Object.entries(s.cast)) {
  await shot(760, 150, `<div style="position:absolute;left:10px;top:10px;display:inline-flex;flex-direction:column;padding:14px 34px 16px 30px;border-radius:26px;background:rgba(14,17,38,.86);border-left:10px solid #ff8f52;box-shadow:0 8px 30px rgba(0,0,0,.35)">
<div style="font:900 50px/1 N;color:#fff">${esc(c.name)}</div><div style="font:900 30px/1.1 N;color:#ffb37a;margin-top:6px;letter-spacing:1px">${esc(c.role)} · NikitenokArena</div></div>`, `name_${id}.png`);
}
// Тёплая подсветка за персонажем в углу, чтобы он не терялся на пёстрой игре.
await shot(CORNER.w, CORNER.h, `<div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 55% at 50% 62%,rgba(255,170,110,.38),rgba(255,120,80,.14) 55%,rgba(255,120,80,0) 75%)"></div>`, 'glow.png');
await b.close();
server.close();
