// Собирает карту для экрана «Мой город» из Natural Earth (общественное достояние):
//   src/city/mapShapes.ts — контуры России, соседних стран и сетка широт и долгот, уже в проекции;
//   shared/russiaCities.ts — города России с координатами на карте и населением.
// Границы — вариант Natural Earth «с точки зрения России» (admin_0_countries_rus).
// Запуск: node scripts/build-map.mjs <папка с geojson>, в папке:
//   ne_10m_admin_0_countries_rus.geojson и ne_10m_populated_places.geojson
//   (github.com/nvkelso/natural-earth-vector, папка geojson).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoConicEqualArea, geoContains, geoGraticule, geoPath } from 'd3-geo';

const SRC = process.argv[2];
if (!SRC) throw new Error('Укажи папку с geojson: node scripts/build-map.mjs <папка>');
const read = (f) => JSON.parse(readFileSync(join(SRC, f), 'utf8'));

const W = 1000;
const PAD = 24;
// Города меньше этого — только если это центр региона.
const MIN_POP = 50_000;

const countries = read('ne_10m_admin_0_countries_rus.geojson').features;
const russia = countries.find((f) => f.properties.ADM0_A3 === 'RUS');
const others = countries.filter((f) => f !== russia && f.properties.ADM0_A3 !== 'ATA');

// Коническая равновеликая проекция с центром на 100° в. д. — так Россию рисуют на картах страны.
const projection = geoConicEqualArea().rotate([-100, 0]).parallels([52, 68]).fitWidth(W - 2 * PAD, russia);
const [[, y0], [, y1]] = geoPath(projection).bounds(russia);
const H = Math.ceil(y1 - y0 + 2 * PAD);
projection.translate([projection.translate()[0] + PAD, projection.translate()[1] - y0 + PAD]);
// Соседей и сетку обрезаем чуть дальше краёв: карту можно немного сдвинуть.
const M = 160;
const clipped = geoConicEqualArea().rotate([-100, 0]).parallels([52, 68]).scale(projection.scale()).translate(projection.translate()).clipExtent([[-M, -M], [W + M, H + M]]);

/** Кольца контура в координатах карты. */
function rings(geo, proj) {
  const out = [];
  let ring = null;
  geoPath(proj, {
    moveTo: (x, y) => out.push((ring = [[x, y]])),
    lineTo: (x, y) => ring.push([x, y]),
    closePath: () => {},
    arc: () => {},
  })(geo);
  return out;
}

/** Дуглас — Пекер: убираем точки, которые отклоняются от прямой меньше tol. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let far = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
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

/** SVG-путь: относительные шаги с точностью 0.1, замкнутые кольца. */
function path(list, { tol, minArea, closed = true }) {
  let d = '';
  for (const raw of list) {
    if (closed && area(raw) < minArea) continue;
    const pts = simplify(raw, tol).map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]);
    if (pts.length < (closed ? 3 : 2)) continue;
    let [px, py] = pts[0];
    d += `M${px / 10} ${py / 10}`;
    let seg = '';
    for (const [x, y] of pts.slice(1)) {
      if (x === px && y === py) continue;
      seg += ` ${(x - px) / 10} ${(y - py) / 10}`;
      [px, py] = [x, y];
    }
    d += `l${seg.trim()}${closed ? 'z' : ''}`;
  }
  return d.replace(/ -/g, '-');
}

const RUSSIA = path(rings(russia, projection), { tol: 0.45, minArea: 1.5 });
const WORLD = path(others.flatMap((f) => rings(f, clipped)), { tol: 0.8, minArea: 6 });
const GRID = path(rings(geoGraticule().step([20, 10])(), clipped), { tol: 0.6, minArea: 0, closed: false });

// Города: внутри границ России (так в список попадают и города Крыма), от MIN_POP жителей или центры регионов.
const seen = new Set();
const cities = read('ne_10m_populated_places.geojson')
  .features.map((f) => f.properties)
  .filter((p) => p.NAME_RU && (p.POP_MAX >= MIN_POP || /Admin-[01] capital/.test(p.FEATURECLA)) && geoContains(russia, [p.LONGITUDE, p.LATITUDE]))
  .sort((a, b) => b.POP_MAX - a.POP_MAX)
  .filter((p) => !seen.has(p.NAME_RU) && seen.add(p.NAME_RU))
  .map((p) => {
    const [x, y] = projection([p.LONGITUDE, p.LATITUDE]);
    return [p.NAME_RU, Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p.POP_MAX / 1000)];
  });

const head = '// Создано scripts/build-map.mjs из Natural Earth (общественное достояние). Руками не править.\n';
writeFileSync(
  'src/city/mapShapes.ts',
  `${head}export const MAP_W = ${W};\nexport const MAP_H = ${H};\n\n/** Россия. */\nexport const RUSSIA = '${RUSSIA}';\n\n/** Соседние страны. */\nexport const WORLD = '${WORLD}';\n\n/** Параллели через 10°, меридианы через 20°. */\nexport const GRID = '${GRID}';\n`,
);
writeFileSync(
  'shared/russiaCities.ts',
  `${head}// Город, x и y на карте (${W}×${H}), население в тысячах. По убыванию населения.\nexport const RU_CITIES: readonly (readonly [name: string, x: number, y: number, popK: number])[] = ${JSON.stringify(cities)};\n`,
);
console.log(`Карта ${W}×${H}: Россия ${(RUSSIA.length / 1024).toFixed(0)} КБ, соседи ${(WORLD.length / 1024).toFixed(0)} КБ, сетка ${(GRID.length / 1024).toFixed(0)} КБ, городов ${cities.length}`);
