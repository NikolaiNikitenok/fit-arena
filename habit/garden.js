// «Сад свободы»: искры (валюта из «Самоцветов»), достижения и сад, который растёт от игры и от дней без привычки.
// Срыв ничего не отнимает: ростки, уже выросшие за прошлые дни, остаются.
import { S, save, elapsed, isPlanned } from './store.js';
import { $, esc, toast, vibrate, confetti, sheet, plural, DAY } from './util.js';

// ---------- Каталог ----------
// cost — цена посадки; улучшение до ур. 2 и 3 стоит cost×1 и cost×2. Красота = cost × уровень.
export const ITEMS = [
  { k: 'sprout', e: ['🌱', '🌿', '🌳'], n: 'Росток свободы', cost: 0, g: 'plant', note: 'Вырастает за каждый день без привычки' },
  { k: 'grass', e: ['🌾'], n: 'Колосья', cost: 20, g: 'plant' },
  { k: 'tulip', e: ['🌷'], n: 'Тюльпан', cost: 30, g: 'plant' },
  { k: 'sunflower', e: ['🌻'], n: 'Подсолнух', cost: 40, g: 'plant' },
  { k: 'mushroom', e: ['🍄'], n: 'Грибок', cost: 40, g: 'plant' },
  { k: 'rose', e: ['🌹'], n: 'Роза', cost: 50, g: 'plant' },
  { k: 'cactus', e: ['🌵'], n: 'Кактус', cost: 50, g: 'plant' },
  { k: 'hibiscus', e: ['🌺'], n: 'Гибискус', cost: 60, g: 'plant' },
  { k: 'blossom', e: ['🌸'], n: 'Сакура', cost: 90, g: 'plant' },
  { k: 'pine', e: ['🌲'], n: 'Ель', cost: 90, g: 'plant' },
  { k: 'palm', e: ['🌴'], n: 'Пальма', cost: 140, g: 'plant' },
  { k: 'rock', e: ['🪨'], n: 'Камень', cost: 20, g: 'decor' },
  { k: 'log', e: ['🪵'], n: 'Бревно', cost: 30, g: 'decor' },
  { k: 'bench', e: ['🪑'], n: 'Скамейка', cost: 80, g: 'decor' },
  { k: 'lantern', e: ['🏮'], n: 'Фонарик', cost: 100, g: 'decor', glow: true },
  { k: 'pond', e: ['💧'], n: 'Пруд', cost: 150, g: 'decor', water: true },
  { k: 'tent', e: ['⛺'], n: 'Палатка', cost: 160, g: 'decor' },
  { k: 'fountain', e: ['⛲'], n: 'Фонтан', cost: 320, g: 'decor' },
  { k: 'house', e: ['🏡'], n: 'Домик', cost: 550, g: 'decor' },
  { k: 'bee', e: ['🐝'], n: 'Пчёлка', cost: 80, g: 'life', fly: true },
  { k: 'butterfly', e: ['🦋'], n: 'Бабочка', cost: 100, g: 'life', fly: true },
  { k: 'bird', e: ['🐦'], n: 'Птичка', cost: 140, g: 'life' },
  { k: 'hedgehog', e: ['🦔'], n: 'Ёжик', cost: 180, g: 'life' },
  { k: 'rabbit', e: ['🐇'], n: 'Кролик', cost: 200, g: 'life' },
  { k: 'cat', e: ['🐈'], n: 'Кот', cost: 220, g: 'life' },
  { k: 'duck', e: ['🦆'], n: 'Уточка', cost: 160, g: 'life' },
  { k: 'rainbow', e: ['🌈'], n: 'Радуга', cost: 1000, g: 'legend', glow: true },
  { k: 'unicorn', e: ['🦄'], n: 'Единорог', cost: 1600, g: 'legend', glow: true },
  { k: 'castle', e: ['🏰'], n: 'Замок', cost: 2600, g: 'legend' },
];
export const item = (k) => ITEMS.find((i) => i.k === k);
const GROUPS = [['plant', 'Растения'], ['decor', 'Украшения'], ['life', 'Жители'], ['legend', 'Легендарное']];
const LEVELS = [[0, 'Пустырь'], [100, 'Полянка'], [400, 'Садик'], [1000, 'Сад'], [2500, 'Цветущий сад'], [6000, 'Райский сад'], [15000, 'Легендарный сад']];
const SIZES = [[5, 0], [6, 300], [7, 900], [8, 2000]];
const upCost = (it, lv) => Math.max(15, it.cost || 30) * lv;

function G() {
  S.garden = S.garden || { size: 5, tiles: {}, inv: {}, daysSeen: {} };
  S.sparks = S.sparks || 0;
  return S.garden;
}
export const balance = () => S.sparks || 0;
export function beauty() {
  return Object.values(G().tiles).reduce((s, t) => s + Math.max(15, item(t.k)?.cost || 15) * (t.lv || 1), 0);
}
export function gardenLevel() {
  const b = beauty();
  let i = 0;
  while (i + 1 < LEVELS.length && b >= LEVELS[i + 1][0]) i++;
  const next = LEVELS[i + 1];
  return { i, name: LEVELS[i][1], next: next?.[1], pct: next ? (b - LEVELS[i][0]) / (next[0] - LEVELS[i][0]) : 1, b };
}

// ---------- Искры ----------
/** Множитель от текущей серии: каждая неделя без привычки +10 %, до ×2. */
export function streakBonus() {
  const days = Math.max(0, ...S.habits.filter((h) => !isPlanned(h)).map((h) => Math.floor(elapsed(h) / DAY)));
  return { mult: 1 + Math.min(1, Math.floor(days / 7) * 0.1), days };
}
export function earn(n) {
  G();
  S.sparks += Math.round(n);
  save();
}

// ---------- Ростки за дни ----------
/** Новые полные дни без привычки → ростки в запас. Возвращает, сколько выросло. */
export function claimSprouts() {
  const g = G();
  let got = 0;
  for (const h of S.habits) {
    if (isPlanned(h)) continue;
    const d = Math.floor(elapsed(h) / DAY);
    const seen = g.daysSeen[h.id];
    if (seen === undefined) { g.daysSeen[h.id] = d; got += Math.min(d, 7); continue; } // за прошлое — до недели
    if (d > seen) got += d - seen;
    g.daysSeen[h.id] = d; // после срыва счёт просто начинается заново, выросшее не пропадает
  }
  if (got) { g.inv.sprout = (g.inv.sprout || 0) + got; save(); }
  return got;
}

// ---------- Достижения ----------
export const ACH = [
  { id: 'win1', e: '🎉', t: 'Первая победа', d: 'Пройди уровень в «Самоцветах»', r: 20, ok: (m) => m.level > 1 },
  { id: 'rainbow', e: '🌈', t: 'Первая радуга', d: 'Собери 5 в ряд', r: 30, ok: (m) => m.stat.rainbows >= 1 },
  { id: 'bombs', e: '💣', t: 'Подрывник', d: 'Создай 10 бомб', r: 40, ok: (m) => m.stat.bombs >= 10 },
  { id: 'combo6', e: '⚡', t: 'Каскад ×6', d: 'Цепочка из 6 волн за один ход', r: 50, ok: (m) => m.stat.maxCombo >= 6 },
  { id: 'lv10', e: '🥉', t: '10 уровней', d: 'Пройди 10 уровней', r: 50, ok: (m) => m.level > 10 },
  { id: 'lv25', e: '🥈', t: '25 уровней', d: 'Пройди 25 уровней', r: 100, ok: (m) => m.level > 25 },
  { id: 'lv50', e: '🥇', t: '50 уровней', d: 'Пройди 50 уровней', r: 200, ok: (m) => m.level > 50 },
  { id: 'lv100', e: '🏆', t: '100 уровней', d: 'Пройди 100 уровней', r: 400, ok: (m) => m.level > 100 },
  { id: 'stars30', e: '⭐', t: '30 звёзд', d: 'Собери 30 звёзд', r: 60, ok: (m) => stars(m) >= 30 },
  { id: 'stars100', e: '🌟', t: '100 звёзд', d: 'Собери 100 звёзд', r: 200, ok: (m) => stars(m) >= 100 },
  { id: 'perfect10', e: '💯', t: 'Отличник', d: '10 уровней на три звезды', r: 80, ok: (m) => Object.values(m.stars).filter((v) => v === 3).length >= 10 },
  { id: 'instead10', e: '🛡️', t: 'Вместо срыва', d: 'Сыграй 10 раз, когда тянуло', r: 80, ok: () => (S.played?.match3 || 0) >= 10 },
  { id: 'plant1', e: '🌱', t: 'Первый росток', d: 'Посади что-нибудь в саду', r: 15, ok: () => Object.keys(G().tiles).length >= 1 },
  { id: 'plant15', e: '🌳', t: 'Садовник', d: '15 растений и вещей в саду', r: 60, ok: () => Object.keys(G().tiles).length >= 15 },
  { id: 'bloom', e: '🌸', t: 'Цветущий сад', d: 'Красота сада 2500', r: 150, ok: () => beauty() >= 2500 },
  { id: 'week', e: '📅', t: 'Неделя свободы', d: '7 дней без привычки — множитель ×1.1', r: 70, ok: () => streakBonus().days >= 7 },
  { id: 'month', e: '🗓️', t: 'Месяц свободы', d: '30 дней без привычки', r: 300, ok: () => streakBonus().days >= 30 },
];
const stars = (m) => Object.values(m.stars || {}).reduce((s, v) => s + v, 0);
export function m3() {
  S.m3 = S.m3 || { level: 1, stars: {} };
  S.m3.ach = S.m3.ach || {};
  S.m3.stat = { rainbows: 0, bombs: 0, maxCombo: 0, ...(S.m3.stat || {}) };
  return S.m3;
}
/** Проверить достижения, выдать награды. Возвращает новые. */
export function checkAch({ quiet = false } = {}) {
  const m = m3();
  G();
  const fresh = ACH.filter((a) => !m.ach[a.id] && a.ok(m));
  if (!fresh.length) return [];
  for (const a of fresh) { m.ach[a.id] = Date.now(); S.sparks += a.r; }
  save();
  if (!quiet) fresh.forEach((a, i) => setTimeout(() => toast(`${a.e} Достижение «${a.t}» · +${a.r} ✨`), i * 1800));
  return fresh;
}
export function achSheet() {
  const m = m3();
  const got = ACH.filter((a) => m.ach[a.id]).length;
  sheet(`<h2>Достижения</h2><p class="muted">${got} из ${ACH.length} · за каждое — искры для сада</p>
    <div class="ach-list">${ACH.map((a) => `<div class="ach ${m.ach[a.id] ? 'got' : ''}"><span>${a.e}</span><div><b>${a.t}</b><small>${a.d}</small></div><i>+${a.r} ✨</i></div>`).join('')}</div>`);
}

// ---------- Сад ----------
let placing = null; // ключ предмета, который сажаем
let moving = null; // клетка, которую переставляем
const tod = () => { const h = new Date().getHours(); return h < 6 || h >= 21 ? 'night' : h < 9 ? 'dawn' : h >= 18 ? 'dusk' : 'day'; };

export function gardenView() {
  const g = G();
  const grown = claimSprouts();
  checkAch({ quiet: true });
  const lv = gardenLevel();
  const { mult, days } = streakBonus();
  const n = g.size;
  // Изометрия: клетка (c, r) → экран. Ширина сцены — n клеток по диагонали.
  const tiles = [], things = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const key = `${c},${r}`;
    const t = g.tiles[key];
    const it = t && item(t.k);
    const x = ((c - r + n - 1) / (2 * n)) * 100, y = ((c + r) / (2 * n)) * 100;
    tiles.push(`<button class="gt ${it?.water ? 'water' : ''} ${(c + r) % 2 ? 'alt' : ''} ${moving === key ? 'moving' : ''}" data-tile="${key}" style="left:${x}%;top:${y}%" aria-label="Клетка"></button>`);
    if (it && !it.water) {
      const lvl = t.lv || 1;
      const e = it.e[Math.min(it.e.length - 1, lvl - 1)];
      things.push(`<span class="gi lv${lvl} ${it.fly ? 'fly' : ''} ${it.glow ? 'glow' : ''}" style="left:${x + 100 / (2 * n)}%;top:${y + 100 / (2 * n)}%;z-index:${10 + c + r};--d:${((c * 7 + r * 3) % 10) / 10}s">${e}</span>`);
    } else if (it?.water) things.push(`<span class="gi pondfx" style="left:${x + 100 / (2 * n)}%;top:${y + 100 / (2 * n)}%;z-index:${9 + c + r}">✨</span>`);
  }
  const inv = Object.entries(g.inv).filter(([, v]) => v > 0);
  const t = tod();
  return `
    <a class="back" href="#/">← Назад</a>
    <section class="garden-head">
      <div><h1>Сад свободы</h1><p class="muted">${lv.name}${lv.next ? ` · до «${lv.next}» ${Math.floor(lv.pct * 100)}%` : ''}</p></div>
      <div class="sparks-pill">✨ <b>${balance()}</b></div>
    </section>
    <div class="bar gold"><i style="width:${(lv.pct * 100).toFixed(1)}%"></i></div>
    ${grown ? `<div class="card grown">🌱 За дни без привычки выросло ${grown} ${plural(grown, 'росток', 'ростка', 'ростков')} — они в запасе, посади их!</div>` : ''}
    <section class="garden-scene ${t}">
      <div class="g-sky">${t === 'night' ? '<span class="g-moon">🌙</span>' + '<i class="g-star"></i>'.repeat(14) : '<span class="g-sun"></span>'}<span class="g-cloud c1">☁️</span><span class="g-cloud c2">☁️</span></div>
      <div class="g-plot" style="--n:${n}">${tiles.join('')}${things.join('')}${t === 'night' ? '<i class="g-fly"></i>'.repeat(8) : ''}</div>
      ${placing || moving ? `<div class="g-hint">${placing ? `Нажми на свободную клетку, чтобы поставить ${item(placing).e[0]}` : 'Нажми, куда переставить'} <button class="btn small ghost" data-g="cancel">Отмена</button></div>` : ''}
    </section>
    ${inv.length ? `<section class="card"><h3>Запас</h3><div class="inv">${inv.map(([k, v]) => `<button class="inv-i ${placing === k ? 'on' : ''}" data-g="place" data-k="${k}"><span>${item(k).e[0]}</span><b>×${v}</b></button>`).join('')}</div></section>` : ''}
    <div class="row">
      <button class="btn primary" data-g="shop">🛒 Магазин</button>
      <button class="btn ghost" data-act="activity" data-key="match3">💎 Заработать</button>
    </div>
    <section class="card earn-info">
      <h3>Как получить искры ✨</h3>
      <p class="muted tiny">Проходи уровни в «Самоцветах»: 10 ✨ + 5 за каждую звезду, бонусы за радуги и каскады, награды за достижения.</p>
      <p class="muted tiny">Множитель серии: <b>×${mult.toFixed(1)}</b>${days ? ` — ${days} ${plural(days, 'день', 'дня', 'дней')} без привычки` : ''}. Каждая неделя без срыва добавляет +10 %, до ×2.</p>
      <p class="muted tiny">Каждый новый день без привычки — бесплатный 🌱, который можно вырастить в 🌳.</p>
    </section>
    <button class="btn ghost wide" data-g="ach">🏅 Достижения · ${Object.keys(m3().ach).length} из ${ACH.length}</button>
    ${g.size < 8 ? `<button class="btn ghost wide" data-g="expand">↔️ Расширить участок до ${g.size + 1}×${g.size + 1} · ${SIZES.find((s) => s[0] === g.size + 1)[1]} ✨</button>` : ''}
  `;
}

export function bindGarden(main, rerender) {
  main.onclick = async (e) => {
    const g = G();
    const tile = e.target.closest('[data-tile]');
    const b = e.target.closest('[data-g]');
    if (tile) {
      const key = tile.dataset.tile;
      const t = g.tiles[key];
      if (placing) {
        if (t) { toast('Клетка занята — выбери свободную'); return; }
        g.tiles[key] = { k: placing, lv: 1 };
        g.inv[placing]--;
        if (g.inv[placing] <= 0) { delete g.inv[placing]; placing = null; }
        vibrate(15);
        save();
        checkAch();
        rerender();
        pop(main, key);
        return;
      }
      if (moving) {
        if (!t) { g.tiles[key] = g.tiles[moving]; delete g.tiles[moving]; save(); }
        moving = null;
        rerender();
        return;
      }
      if (t) itemSheet(key, rerender);
      return;
    }
    if (!b) return;
    const a = b.dataset.g;
    if (a === 'cancel') { placing = null; moving = null; rerender(); }
    else if (a === 'place') { placing = placing === b.dataset.k ? null : b.dataset.k; rerender(); }
    else if (a === 'shop') shopSheet(rerender);
    else if (a === 'ach') achSheet();
    else if (a === 'expand') {
      const next = SIZES.find((s) => s[0] === g.size + 1);
      if (!next) return;
      if (balance() < next[1]) return toast(`Нужно ${next[1]} ✨ — заработай в «Самоцветах»`);
      S.sparks -= next[1];
      g.size = next[0];
      save();
      confetti();
      rerender();
    }
  };
}
function pop(main, key) {
  const el = main.querySelector(`[data-tile="${key}"]`);
  el?.classList.add('planted');
}
function shopSheet(rerender) {
  const g = G();
  const body = () => `<h2>Магазин сада</h2><p class="muted">У тебя ✨ ${balance()}</p>
    ${GROUPS.map(([gk, title]) => `<h3 class="group-title">${title}</h3><div class="shop-grid">${ITEMS.filter((i) => i.g === gk && i.cost > 0).map((i) => `
      <button class="shop-i ${balance() < i.cost ? 'poor' : ''}" data-buy="${i.k}"><span>${i.e[0]}</span><b>${i.n}</b><small>✨ ${i.cost}</small></button>`).join('')}</div>`).join('')}`;
  const sh = sheet(`<div class="shop">${body()}</div>`);
  sh.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    const it = item(b.dataset.buy);
    if (balance() < it.cost) { toast(`Не хватает ${it.cost - balance()} ✨ — сыграй в «Самоцветы»`); return; }
    S.sparks -= it.cost;
    g.inv[it.k] = (g.inv[it.k] || 0) + 1;
    placing = it.k;
    save();
    vibrate(15);
    sh.close();
    rerender();
    toast(`${it.e[0]} куплено — выбери клетку`);
  });
}
function itemSheet(key, rerender) {
  const g = G();
  const t = g.tiles[key];
  const it = item(t.k);
  const lv = t.lv || 1;
  const max = 3;
  const cost = upCost(it, lv);
  const icon = it.e[Math.min(it.e.length - 1, lv - 1)];
  const sh = sheet(`<div class="item-sheet"><div class="big-emoji">${icon}</div><h2>${it.n}</h2>
    <p class="muted">Уровень ${'★'.repeat(lv)}${'☆'.repeat(max - lv)}${it.note ? ` · ${it.note}` : ''}</p>
    ${lv < max ? `<button class="btn primary wide" data-i="up">⬆️ Улучшить за ${cost} ✨${it.e[lv] ? ` → ${it.e[lv]}` : ''}</button>` : '<p class="muted">Максимальный уровень — сияет ✨</p>'}
    <div class="row"><button class="btn ghost" data-i="move">↔️ Переставить</button><button class="btn ghost" data-i="store">📦 В запас</button></div></div>`);
  sh.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    if (b.dataset.i === 'up') {
      if (balance() < cost) { toast(`Не хватает ${cost - balance()} ✨`); return; }
      S.sparks -= cost;
      t.lv = lv + 1;
      save();
      confetti();
      vibrate([20, 20, 40]);
      checkAch();
    } else if (b.dataset.i === 'move') moving = key;
    else if (b.dataset.i === 'store') {
      // В запас уходит сам предмет; вложенное в улучшения возвращается искрами наполовину.
      let back = 0;
      for (let l = 1; l < lv; l++) back += upCost(it, l);
      S.sparks += Math.floor(back / 2);
      g.inv[t.k] = (g.inv[t.k] || 0) + 1;
      delete g.tiles[key];
      save();
    }
    sh.close();
    rerender();
  });
}
