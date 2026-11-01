// Собирает глобус для «Битвы городов» из Natural Earth (общественное достояние):
//   shared/worldCities.ts  — справочник городов мира: русское и английское название, страна, широта, долгота, население;
//   shared/countries.ts    — страны: код ISO, русское и английское название, точка для подписи;
//   src/city/worldShapes.json — контуры стран (долгота и широта ×10, упрощённые) для текстуры глобуса.
// Границы — вариант Natural Earth «с точки зрения России» (admin_0_countries_rus), как и прежняя карта России.
// Запуск: node scripts/build-globe.mjs <папка с geojson>, в папке:
//   ne_10m_admin_0_countries_rus.geojson и ne_10m_populated_places.geojson
//   (github.com/nvkelso/natural-earth-vector, папка geojson).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoContains } from 'd3-geo';

const SRC = process.argv[2];
if (!SRC) throw new Error('Укажи папку с geojson: node scripts/build-globe.mjs <папка>');
const read = (f) => JSON.parse(readFileSync(join(SRC, f), 'utf8'));

// Россия: от 50 тысяч жителей или центр региона (как было на карте России). Соседи по СНГ — от 50 тысяч,
// остальной мир — от 150 тысяч. Столицы — всегда.
const MIN_RU = 50_000;
const MIN_NEAR = 50_000;
const MIN_WORLD = 150_000;
const NEAR = new Set(['BY', 'KZ', 'UA', 'UZ', 'KG', 'TJ', 'TM', 'AM', 'AZ', 'GE', 'MD', 'LV', 'LT', 'EE', 'MN', 'RS']);

const features = read('ne_10m_admin_0_countries_rus.geojson').features.filter((f) => f.properties.ADM0_A3 !== 'ATA');
const iso = (p) => {
  const c = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  return c && c !== '-99' ? c : null;
};
const countries = features.filter((f) => iso(f.properties));
const russia = countries.find((f) => f.properties.ADM0_A3 === 'RUS');

/** Дуглас — Пекер для кольца в градусах. */
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1;
    let far = tol;
    for (let i = a + 1; i < b; i++) {
      const d = len < 1e-6 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > far) [best, far] = [i, d];
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0)) / 2;

// Короткие привычные названия вместо официальных.
const COUNTRY_FIX = {
  CN: ['Китай', 'China'],
  US: ['США', 'USA'],
  CD: ['ДР Конго', 'DR Congo'],
  KR: ['Южная Корея', 'South Korea'],
  KP: ['Северная Корея', 'North Korea'],
  AE: ['ОАЭ', 'UAE'],
  BY: ['Беларусь', 'Belarus'],
  CZ: ['Чехия', 'Czechia'],
};

// Контуры: только внешние кольца (озёра на глобусе не нужны), мелкие острова отбрасываем.
const TOL = 0.12;
const MIN_AREA = 0.04;
const shapes = [];
const meta = new Map();
for (const f of countries) {
  const p = f.properties;
  const code = iso(p);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) {
    const outer = poly[0];
    if (area(outer) < MIN_AREA) continue;
    const s = simplify(outer, TOL).map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]);
    const flat = [];
    for (const [x, y] of s) if (flat.length < 2 || x !== flat[flat.length - 2] || y !== flat[flat.length - 1]) flat.push(x, y);
    if (flat.length >= 6) rings.push(flat);
  }
  // Крошечные страны (Монако, Сингапур) — хотя бы одним самым большим кольцом.
  if (!rings.length) {
    const big = polys.map((poly) => poly[0]).sort((a, b) => area(b) - area(a))[0];
    rings.push(big.flatMap(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]));
  }
  const prev = shapes.find((s) => s[0] === code);
  if (prev) prev[1].push(...rings);
  else shapes.push([code, rings]);
  if (!meta.has(code) || p.POP_EST > meta.get(code).pop)
    meta.set(code, { code, ru: COUNTRY_FIX[code]?.[0] ?? (p.NAME_RU || p.NAME), en: COUNTRY_FIX[code]?.[1] ?? (p.NAME_EN || p.NAME), lat: Math.round(p.LABEL_Y * 10) / 10, lon: Math.round(p.LABEL_X * 10) / 10, pop: p.POP_EST });
}

// Города. Поправки названий: ошибки и переименования, которых ещё нет в Natural Earth.
const RU_FIX = { Колумбия: 'Буйнакск', 'Нур-Султан': 'Астана' };
const EN_FIX = { 'New York City': 'New York', 'Nur-Sultan': 'Astana' };
const seen = new Set();
const all = read('ne_10m_populated_places.geojson')
  .features.map((f) => f.properties)
  .map((p) => ({ ...p, NAME_RU: RU_FIX[p.NAME_RU] ?? p.NAME_RU, NAME_EN: EN_FIX[p.NAME_EN] ?? p.NAME_EN }))
  .filter((p) => p.NAME_RU && p.ISO_A2 && p.ISO_A2 !== '-99')
  .sort((a, b) => b.POP_MAX - a.POP_MAX);
const inRussia = (p) => geoContains(russia, [p.LONGITUDE, p.LATITUDE]);
const cities = [];
// Сначала Россия: её названия в справочнике главнее одноимённых городов за границей.
for (const p of all) {
  if (!((p.POP_MAX >= MIN_RU || /Admin-[01] capital/.test(p.FEATURECLA)) && inRussia(p))) continue;
  if (seen.has(p.NAME_RU)) continue;
  seen.add(p.NAME_RU);
  cities.push([p.NAME_RU, p.NAME_EN || p.NAME, 'RU', Math.round(p.LATITUDE * 100) / 100, Math.round(p.LONGITUDE * 100) / 100, Math.round(p.POP_MAX / 1000)]);
}
for (const p of all) {
  const code = p.ISO_A2 === 'RU' || inRussia(p) ? null : p.ISO_A2;
  if (!code || !meta.has(code)) continue;
  const min = NEAR.has(code) ? MIN_NEAR : MIN_WORLD;
  if (!(p.POP_MAX >= min || p.ADM0CAP === 1)) continue;
  if (seen.has(p.NAME_RU)) continue;
  seen.add(p.NAME_RU);
  cities.push([p.NAME_RU, p.NAME_EN || p.NAME, code, Math.round(p.LATITUDE * 100) / 100, Math.round(p.LONGITUDE * 100) / 100, Math.round(p.POP_MAX / 1000)]);
}
cities.sort((a, b) => b[5] - a[5]);

const list = [...meta.values()].sort((a, b) => b.pop - a.pop).map((m) => [m.code, m.ru, m.en, m.lat, m.lon]);

const head = '// Создано scripts/build-globe.mjs из Natural Earth (общественное достояние). Руками не править.\n';
writeFileSync(
  'shared/worldCities.ts',
  `${head}// Город по-русски, по-английски, страна (ISO), широта, долгота, население в тысячах. По убыванию населения.\nexport type WorldCity = readonly [ru: string, en: string, country: string, lat: number, lon: number, popK: number];\nexport const WORLD_CITIES: readonly WorldCity[] = ${JSON.stringify(cities)};\n`,
);
writeFileSync(
  'shared/countries.ts',
  `${head}// Страна (ISO), название по-русски и по-английски, широта и долгота подписи. По убыванию населения.\nexport type Country = readonly [code: string, ru: string, en: string, lat: number, lon: number];\nexport const COUNTRIES: readonly Country[] = ${JSON.stringify(list)};\n`,
);
writeFileSync('src/city/worldShapes.json', JSON.stringify(shapes));
const size = (f) => (readFileSync(f).length / 1024).toFixed(0);
console.log(`Стран ${list.length} (${size('src/city/worldShapes.json')} КБ контуров), городов ${cities.length} (${size('shared/worldCities.ts')} КБ), из них в России ${cities.filter((c) => c[2] === 'RU').length}`);
