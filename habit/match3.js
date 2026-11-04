// «Самоцветы» — три в ряд для «Отвлечься». Бесконечные уровни: каждый собирается из номера
// (одинаково на всех устройствах). Движок — общий с подземельем Арены (m3engine.js).
import * as E from './m3engine.js';
import { S, save } from './store.js';
import { vibrate, confetti, plural } from './util.js';

const KINDS = ['heart', 'gold', 'wood', 'stone', 'sword'];
const GEM = {
  heart: { name: 'сердца', c1: '#ff9ab8', c2: '#e83f7a' },
  gold: { name: 'солнца', c1: '#ffe68a', c2: '#ffad1f' },
  wood: { name: 'листья', c1: '#9df0a8', c2: '#22b45e' },
  stone: { name: 'капли', c1: '#9fe3ff', c2: '#2b8fe8' },
  sword: { name: 'кристаллы', c1: '#d9b8ff', c2: '#8a4dff' },
};
const SHAPE = {
  heart: 'M50 86 C18 64 8 46 14 30 C20 14 40 12 50 28 C60 12 80 14 86 30 C92 46 82 64 50 86Z',
  gold: 'M50 8 L61 36 L91 37 L67 56 L76 86 L50 68 L24 86 L33 56 L9 37 L39 36Z',
  wood: 'M50 8 C80 22 90 52 70 78 C60 90 40 90 30 78 C10 52 20 22 50 8Z',
  stone: 'M50 8 C64 30 82 46 82 62 C82 80 68 90 50 90 C32 90 18 80 18 62 C18 46 36 30 50 8Z',
  sword: 'M50 6 L84 36 L50 92 L16 36Z',
};
const gemSvg = (k) => `<svg viewBox="0 0 100 100"><defs><radialGradient id="m3g-${k}" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="${GEM[k].c1}"/><stop offset="1" stop-color="${GEM[k].c2}"/></radialGradient></defs>
  <path d="${SHAPE[k]}" fill="url(#m3g-${k})" stroke="${GEM[k].c2}" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="38" cy="32" rx="13" ry="8" fill="#fff" opacity=".55" transform="rotate(-25 38 32)"/></svg>`;
const goalIco = (k) => `<span class="m3-gico">${gemSvg(k)}</span>`;

// ---------- Уровни ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Уровень по номеру: цель, ходы, лёд и ящики. Сложность растёт плавно, каждый 5-й — передышка. */
export function levelDef(n) {
  const r = rng(n * 7919 + 17);
  const easy = n % 5 === 0;
  const kinds = n <= 8 || easy ? KINDS.slice(0, 4) : KINDS;
  let type;
  if (n === 1) type = 'score';
  else if (n === 2) type = 'collect';
  else if (n === 3) type = 'ice';
  else if (n === 4) type = 'blocks';
  else { const x = r(); type = x < 0.22 ? 'score' : x < 0.55 ? 'collect' : x < 0.8 ? 'ice' : 'blocks'; }
  const hard = Math.min(1, n / 120);
  let moves = Math.round(24 - hard * 6 + (easy ? 4 : 0));
  const def = { n, kinds, type, moves, seed: n * 104729 + 3, ice: [], blocks: [], target: 0, collect: {} };
  const mirror = (cells, make) => {
    for (const [x, y] of cells) { make(x, y); if (x !== 7 - x) make(7 - x, y); }
  };
  const spots = (count, rows) => {
    const out = new Set();
    while (out.size < count) out.add(`${Math.floor(r() * 4)},${rows[0] + Math.floor(r() * (rows[1] - rows[0] + 1))}`);
    return [...out].map((s) => s.split(',').map(Number));
  };
  if (type === 'score') def.target = Math.min(3200, 700 + n * 35) * (easy ? 0.8 : 1);
  if (type === 'collect') {
    const pick = [...kinds].sort(() => r() - 0.5).slice(0, n > 30 && !easy ? 3 : 2);
    const each = Math.min(30, 10 + Math.floor(n * 0.4)) - (easy ? 4 : 0) - (pick.length === 3 ? 6 : 0);
    for (const k of pick) def.collect[k] = each;
  }
  if (type === 'ice') {
    const half = Math.min(14, 3 + Math.floor(n / 4));
    const thick = n > 25 ? 0.35 : 0;
    mirror(spots(half, [2, 7]), (x, y) => def.ice.push({ x, y, layers: r() < thick ? 2 : 1 }));
    def.moves += 2;
  }
  if (type === 'blocks') {
    const half = Math.min(9, 2 + Math.floor(n / 6));
    const boulders = n > 20 ? 0.4 : 0;
    mirror(spots(half, [3, 6]), (x, y) => def.blocks.push({ x, y, kind: r() < boulders ? 'boulder' : 'crate' }));
    def.moves += 2;
  }
  def.target = Math.round(def.target / 50) * 50;
  return def;
}
const goalText = (d) =>
  d.type === 'score' ? `Набери ${d.target} очков` : d.type === 'collect' ? 'Собери самоцветы' : d.type === 'ice' ? 'Разбей весь лёд' : 'Разбей все ящики';

// ---------- Игра ----------
export function mount(body, { finish, alive }) {
  S.m3 = S.m3 || { level: 1, stars: {} };
  const P = S.m3;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = (ms) => (calm ? Math.min(ms, 60) : ms);

  showMap();

  function totalStars() { return Object.values(P.stars).reduce((s, v) => s + v, 0); }

  function showMap() {
    const L = P.level;
    const from = Math.max(1, L - 3), to = L + 7;
    const nodes = [];
    for (let n = to; n >= from; n--) {
      const st = P.stars[n] || 0;
      const state = n < L ? 'done' : n === L ? 'cur' : 'lock';
      nodes.push(`<button class="m3-node ${state}" data-lvl="${n}" ${state === 'lock' ? 'disabled' : ''} style="--off:${Math.sin(n * 1.3) * 32}%">
        <span class="m3-num">${n}</span>${state === 'done' ? `<span class="m3-st">${'★'.repeat(st)}<i>${'★'.repeat(3 - st)}</i></span>` : ''}
        ${n % 5 === 0 ? '<span class="m3-tag">передышка</span>' : ''}</button>`);
    }
    body.innerHTML = `<div class="m3-map">
      <div class="m3-title"><span class="m3-logo">${gemSvg('sword')}</span><div><h2>Самоцветы</h2><small>Уровней — бесконечно · ★ ${totalStars()}</small></div></div>
      <div class="m3-path">${nodes.join('')}</div>
      <button class="btn primary wide big-btn" data-play="${L}">▶ Играть: уровень ${L}</button>
      <button class="btn ghost small" data-done>Я отвлёкся ✓</button>
    </div>`;
    body.querySelector('[data-play]').onclick = () => play(L);
    body.querySelector('[data-done]').onclick = () => finish('Отличная игра 💎', L > 1 ? `Пройдено ${L - 1} ${plural(L - 1, 'уровень', 'уровня', 'уровней')}. Тяга тем временем отступила.` : 'Тяга тем временем отступила.');
    body.querySelectorAll('.m3-node:not(.lock)').forEach((b) => (b.onclick = () => play(+b.dataset.lvl)));
    body.querySelector('.m3-node.cur')?.scrollIntoView({ block: 'center' });
  }

  function play(n) {
    const d = levelDef(n);
    let board = E.createBoard({ seed: d.seed, kinds: d.kinds, ice: d.ice, blocks: d.blocks });
    let moves = d.moves, score = 0, busy = false, extra = false, idleAt = Date.now();
    const got = Object.fromEntries(Object.keys(d.collect).map((k) => [k, 0]));
    body.innerHTML = `<div class="m3-play">
      <div class="m3-hud">
        <button class="m3-back" aria-label="К уровням">‹</button>
        <div class="m3-lv"><small>Уровень</small><b>${n}</b></div>
        <div class="m3-goal"><small>${goalText(d)}</small><div class="m3-goals"></div></div>
        <div class="m3-moves"><small>Ходы</small><b></b></div>
      </div>
      <div class="m3-score"><i></i><span></span></div>
      <div class="m3-board"><div class="m3-cells"></div><div class="m3-gems"></div><div class="m3-fx"></div></div>
      <p class="m3-tip muted tiny">Меняй соседние самоцветы местами. 4 в ряд — луч, уголок — бомба, 5 — радуга.</p>
    </div>`;
    const el = (s) => body.querySelector(s);
    const boardEl = el('.m3-board'), gemsEl = el('.m3-gems'), cellsEl = el('.m3-cells'), fxEl = el('.m3-fx');
    el('.m3-back').onclick = () => { if (!busy) showMap(); };
    const els = new Map();

    const remaining = () => {
      if (d.type === 'ice') return board.cells.filter((c) => c.ice).length;
      if (d.type === 'blocks') return board.cells.filter((c) => c.block).length;
      if (d.type === 'collect') return Object.keys(d.collect).reduce((s, k) => s + Math.max(0, d.collect[k] - got[k]), 0);
      return Math.max(0, d.target - score);
    };
    const totalStart = d.type === 'ice' ? d.ice.length : d.type === 'blocks' ? d.blocks.length : d.type === 'score' ? d.target : Object.values(d.collect).reduce((a, b) => a + b, 0);
    function hud() {
      el('.m3-moves b').textContent = moves;
      el('.m3-moves').classList.toggle('low', moves <= 3);
      const g = el('.m3-goals');
      if (d.type === 'collect') g.innerHTML = Object.keys(d.collect).map((k) => { const left = Math.max(0, d.collect[k] - got[k]); return `<span class="m3-chip ${left ? '' : 'ok'}">${goalIco(k)}<b>${left || '✓'}</b></span>`; }).join('');
      else if (d.type === 'score') g.innerHTML = `<span class="m3-chip ${score >= d.target ? 'ok' : ''}"><b>${Math.min(score, d.target)} / ${d.target}</b></span>`;
      else { const left = remaining(); g.innerHTML = `<span class="m3-chip ${left ? '' : 'ok'}">${d.type === 'ice' ? '🧊' : '📦'}<b>${left || '✓'}</b></span>`; }
      const pct = Math.min(1, (totalStart - remaining()) / Math.max(1, totalStart));
      el('.m3-score i').style.width = `${(pct * 100).toFixed(1)}%`;
      el('.m3-score span').textContent = `${score} очков`;
    }
    function drawCells() {
      cellsEl.innerHTML = board.cells.map((c, i) => {
        const x = i % board.w, y = Math.floor(i / board.w);
        const cls = c.block ? `blk ${c.block.kind} hp${c.block.hp}` : c.ice ? `ice ice${c.ice}` : '';
        return `<i class="m3-cell ${(x + y) % 2 ? 'odd' : ''} ${cls}" style="--x:${x};--y:${y}"></i>`;
      }).join('');
    }
    function gemEl(g) {
      const e = document.createElement('div');
      e.className = 'm3-gem';
      paint(e, g);
      gemsEl.appendChild(e);
      els.set(g.id, e);
      return e;
    }
    function paint(e, g) {
      const key = `${g.kind}|${g.special || ''}`;
      if (e.dataset.key === key) return;
      e.dataset.key = key;
      e.className = `m3-gem k-${g.kind} ${g.special ? 's-' + g.special : ''}`;
      e.innerHTML = g.special === 'rainbow' ? '<span class="m3-rb"></span>' : gemSvg(g.kind);
    }
    const put = (e, x, y) => { e.style.setProperty('--x', x); e.style.setProperty('--y', y); };
    /** Привести самоцветы к доске. drops — для новых: насколько клеток они падают сверху. */
    function sync(b, drops = new Map(), dur = 0) {
      const seen = new Set();
      b.cells.forEach((c, i) => {
        if (!c.gem) return;
        const x = i % b.w, y = Math.floor(i / b.w);
        seen.add(c.gem.id);
        let e = els.get(c.gem.id);
        if (!e) {
          e = gemEl(c.gem);
          const drop = drops.get(c.gem.id);
          if (drop) { e.style.transition = 'none'; put(e, x, y - drop); e.style.opacity = '0'; void e.offsetWidth; e.style.transition = ''; e.style.opacity = ''; }
        } else paint(e, c.gem);
        e.style.transitionDuration = dur ? `${dur}ms` : '';
        put(e, x, y);
      });
      for (const [id, e] of els) if (!seen.has(id)) { e.remove(); els.delete(id); }
    }
    function fx(cls, x, y, extraStyle = '') {
      const f = document.createElement('div');
      f.className = `m3-fxi ${cls}`;
      f.style.cssText = `--x:${x};--y:${y};${extraStyle}`;
      fxEl.appendChild(f);
      setTimeout(() => f.remove(), 900);
    }
    function floatText(text, x, y, cls = '') {
      const f = document.createElement('div');
      f.className = `m3-float ${cls}`;
      f.textContent = text;
      f.style.cssText = `--x:${x};--y:${y}`;
      fxEl.appendChild(f);
      setTimeout(() => f.remove(), 1100);
    }
    const PRAISE = ['', '', 'Хорошо!', 'Отлично!', 'Супер!', 'Невероятно!', 'Мастер!'];
    async function animate(res, points = 1) {
      for (const st of res.steps) {
        if (!alive()) return;
        for (const bl of st.blasts) {
          if (bl.kind === 'row') fx('beam row', 0, bl.y);
          else if (bl.kind === 'col') fx('beam col', bl.x, 0);
          else if (bl.kind === 'bomb' || bl.kind === 'bigbomb') fx(`ring ${bl.kind}`, bl.x, bl.y);
          else fx('flash', bl.x, bl.y);
        }
        if (st.blasts.length) vibrate(25);
        for (const c of st.cleared) els.get(c.id)?.classList.add('pop');
        for (const h of st.iceHit) fx('shard', h.x, h.y);
        for (const h of st.blocksHit) fx('shard wood', h.x, h.y);
        const gain = (st.cleared.length * 10 + st.blasts.length * 40) * st.combo * points;
        score += gain;
        for (const k of Object.keys(got)) got[k] += st.counts[k] || 0;
        if (st.cleared.length) {
          const cx = st.cleared.reduce((s, c) => s + c.x, 0) / st.cleared.length, cy = st.cleared.reduce((s, c) => s + c.y, 0) / st.cleared.length;
          floatText(`+${gain}`, cx, cy);
        }
        if (st.combo >= 2) floatText(PRAISE[Math.min(6, st.combo)] || PRAISE[6], 3.5, 3.5, 'praise');
        await sleep(T(230));
        board = st.mid;
        sync(st.mid);
        drawCells();
        const drops = new Map(st.spawned.map((s) => [s.id, s.drop]));
        const maxDrop = Math.max(1, ...st.spawned.map((s) => s.drop), ...st.falls.map((f) => f.to - f.from));
        const dur = 120 + maxDrop * 55;
        board = st.after;
        sync(st.after, drops, T(dur));
        hud();
        await sleep(T(dur + 40));
      }
      board = res.board;
      sync(board);
      drawCells();
      hud();
      if (res.reshuffled) floatText('Перемешали!', 3.5, 3.5, 'praise');
    }

    async function trySwap(a, c) {
      if (busy || moves <= 0) return;
      if (!E.canSwap(board, a, c)) return;
      busy = true;
      clearHint();
      const ga = E.gemAt(board, a.x, a.y), gc = E.gemAt(board, c.x, c.y);
      const ea = els.get(ga.id), ec = els.get(gc.id);
      put(ea, c.x, c.y); put(ec, a.x, a.y);
      await sleep(T(170));
      const res = E.trySwap(board, a, c);
      if (!res) {
        put(ea, a.x, a.y); put(ec, c.x, c.y);
        vibrate(8);
        await sleep(T(170));
        busy = false;
        idleAt = Date.now();
        return;
      }
      moves--;
      hud();
      await animate(res);
      idleAt = Date.now();
      busy = false;
      check();
    }
    async function check() {
      if (!alive()) return;
      if (remaining() === 0) return win();
      if (moves <= 0) return lose();
    }
    async function win() {
      busy = true;
      const left = moves;
      const stars = left >= Math.ceil(d.moves * 0.3) ? 3 : left >= Math.ceil(d.moves * 0.1) ? 2 : 1;
      floatText('Уровень пройден!', 3.5, 3, 'praise big');
      await sleep(T(700));
      const f = left > 0 && E.finale(board, Math.min(8, left));
      if (f && alive()) {
        sync(f.start);
        await sleep(T(450));
        moves = 0;
        await animate(f.result, 0.5);
      }
      score += left * 60;
      P.stars[n] = Math.max(P.stars[n] || 0, stars);
      if (n >= P.level) P.level = n + 1;
      P.best = Math.max(P.best || 0, score);
      save();
      if (!alive()) return;
      confetti();
      vibrate([40, 30, 60]);
      overlay(`<div class="m3-stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</span>`).join('')}</div>
        <h2>Уровень ${n} пройден!</h2>
        <p class="muted">${score} очков${left ? ` · ${plural(left, 'остался', 'осталось', 'осталось')} ${left} ${plural(left, 'ход', 'хода', 'ходов')}` : ''}</p>
        <button class="btn primary wide big-btn" data-next>Дальше: уровень ${n + 1}</button>
        <button class="btn ghost wide" data-map>К уровням</button>
        <button class="btn muted-btn" data-done>Я отвлёкся ✓</button>`);
    }
    function lose() {
      busy = true;
      overlay(`<div class="big-emoji">🫧</div><h2>Ходы закончились</h2>
        <p class="muted">${remaining() ? `Осталось совсем чуть-чуть: ${remaining()}${d.type === 'score' ? ' очков' : ''}.` : ''}</p>
        ${extra ? '' : '<button class="btn primary wide big-btn" data-more>＋5 ходов</button>'}
        <button class="btn ${extra ? 'primary big-btn' : 'ghost'} wide" data-again>Заново</button>
        <button class="btn ghost wide" data-map>К уровням</button>
        <button class="btn muted-btn" data-done>Я отвлёкся ✓</button>`);
    }
    function overlay(html) {
      const o = document.createElement('div');
      o.className = 'm3-over';
      o.innerHTML = `<div class="m3-card">${html}</div>`;
      el('.m3-play').appendChild(o);
      o.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.next !== undefined) play(n + 1);
        else if (b.dataset.map !== undefined) showMap();
        else if (b.dataset.again !== undefined) play(n);
        else if (b.dataset.more !== undefined) { extra = true; moves += 5; busy = false; o.remove(); hud(); }
        else if (b.dataset.done !== undefined) finish('Отличная игра 💎', 'Пока ты собирал самоцветы, тяга отступила. Так и работает отвлечение.');
      });
    }

    // Подсказка, если долго думаешь.
    let hintEls = [];
    const clearHint = () => { hintEls.forEach((e) => e.classList.remove('hint')); hintEls = []; };
    const hintTimer = setInterval(() => {
      if (!alive()) return clearInterval(hintTimer);
      if (busy || hintEls.length || Date.now() - idleAt < 6000) return;
      const m = E.hint(board);
      if (!m) return;
      hintEls = [m.a, m.b].map((p) => els.get(E.gemAt(board, p.x, p.y)?.id)).filter(Boolean);
      hintEls.forEach((e) => e.classList.add('hint'));
    }, 1000);

    // Управление: свайп или два касания.
    let start = null, sel = null;
    const cellAt = (ev) => {
      const r = boardEl.getBoundingClientRect();
      return { x: Math.floor(((ev.clientX - r.left) / r.width) * board.w), y: Math.floor(((ev.clientY - r.top) / r.height) * board.h), px: ev.clientX, py: ev.clientY, size: r.width / board.w };
    };
    const select = (p) => {
      body.querySelectorAll('.m3-gem.sel').forEach((e) => e.classList.remove('sel'));
      sel = p;
      if (p) els.get(E.gemAt(board, p.x, p.y)?.id)?.classList.add('sel');
    };
    boardEl.addEventListener('pointerdown', (ev) => {
      if (busy) return;
      const p = cellAt(ev);
      if (!E.gemAt(board, p.x, p.y)) return;
      start = p;
      idleAt = Date.now();
      boardEl.setPointerCapture?.(ev.pointerId);
    });
    boardEl.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < start.size * 0.35) return;
      const a = { x: start.x, y: start.y };
      const c = Math.abs(dx) > Math.abs(dy) ? { x: a.x + Math.sign(dx), y: a.y } : { x: a.x, y: a.y + Math.sign(dy) };
      start = null;
      select(null);
      trySwap(a, c);
    });
    boardEl.addEventListener('pointerup', () => {
      if (!start) return;
      const p = { x: start.x, y: start.y };
      start = null;
      if (sel && E.adjacent(sel, p)) { const a = sel; select(null); trySwap(a, p); }
      else if (sel && sel.x === p.x && sel.y === p.y) select(null);
      else select(p);
    });

    drawCells();
    sync(board);
    hud();
  }
}
