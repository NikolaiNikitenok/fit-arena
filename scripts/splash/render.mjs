// Рисует героев для заставки: поднимает vite, снимает прозрачный кадр и пишет public/splash/heroes.webp.
// node scripts/splash/render.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import sharp from 'sharp';

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 960 } });
page.on('console', (m) => m.type() === 'error' && console.log(m.text()));
await page.goto('http://localhost:5199/scripts/splash/heroes.html');
await page.waitForFunction(() => window.__shot, null, { timeout: 60000 });
const png = await page.locator('canvas').screenshot({ omitBackground: true });
// Обрезаем пустые края и жмём в webp с прозрачностью: на телефоне картинка шириной ~400 точек, 900 хватает на 2x.
const trimmed = await sharp(png).trim().toBuffer();
await sharp(trimmed).resize({ width: 900 }).webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(process.argv[2] ?? 'public/splash/heroes.webp');
await browser.close();
await server.close();
