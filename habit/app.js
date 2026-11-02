import { phraseOfDay, phraseOfHour, randomPhrase } from './phrases.js';
import { PRESETS, EMOJIS, MILESTONES, HEALTH, QUICK_TASKS, WORKOUT, WAVE_TIPS, GROUNDING } from './data.js';

// ---------- Хранилище ----------
const KEY = 'habit-free-v1';
const blank = () => ({ habits: [], reasons: [], wins: 0, notify: false, notifyFrom: 9, notifyTo: 22, lastNotified: '', best: {} });
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch {}
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
}

// ---------- Утилиты ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 10);
const money = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₽';
const num = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.floor(n));
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const DAY = 864e5;
function atLabel(ms) {
  const m = Math.round(ms / 60e3), h = Math.round(ms / 3600e3), d = Math.round(ms / DAY);
  if (ms < 3600e3) return `${m} мин`;
  if (ms < DAY) return `${h} ${plural(h, 'час', 'часа', 'часов')}`;
  if (d === 365) return '1 год';
  return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
}
function parts(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
function shortDur(ms) {
  const p = parts(ms);
  if (p.d > 0) return `${p.d} ${plural(p.d, 'день', 'дня', 'дней')} ${p.h} ч`;
  if (p.h > 0) return `${p.h} ч ${p.m} мин`;
  return `${p.m} мин`;
}
function vibrate(p) { try { navigator.vibrate?.(p); } catch {} }
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}
const elapsed = (h) => Date.now() - h.start;
const findHabit = (id) => S.habits.find((h) => h.id === id);
function nextMilestone(ms) {
  const next = MILESTONES.find((m) => m.at > ms);
  const prev = [...MILESTONES].reverse().find((m) => m.at <= ms);
  if (!next) return { next: null, pct: 1, prev };
  const from = prev ? prev.at : 0;
  return { next, prev, pct: (ms - from) / (next.at - from) };
}

// ---------- Маршруты ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('h/')) return { name: 'habit', id: h.slice(2) };
  if (h === 'distract') return { name: 'distract' };
  if (h === 'motivation') return { name: 'motivation' };
  return { name: 'home' };
}
window.addEventListener('hashchange', render);

function render() {
  const r = route();
  const main = $('#main');
  if (r.name === 'habit') {
    const h = findHabit(r.id);
    main.innerHTML = h ? habitView(h) : homeView();
  } else if (r.name === 'distract') main.innerHTML = distractView();
  else if (r.name === 'motivation') main.innerHTML = motivationView();
  else main.innerHTML = homeView();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === (r.name === 'habit' ? 'home' : r.name)));
  tick();
  window.scrollTo(0, 0);
}

// ---------- Главная ----------
function homeView() {
  const cards = S.habits.map((h) => {
    const ms = elapsed(h);
    const { next, pct } = nextMilestone(ms);
    const saved = (h.costPerDay * ms) / DAY;
    return `
      <a class="habit card" href="#/h/${h.id}">
        <div class="habit-top">
          <span class="emoji">${esc(h.emoji)}</span>
          <div class="habit-name">${esc(h.name)}<small>свободен уже</small></div>
        </div>
        <div class="timer" data-timer="${h.id}">${timerHtml(ms)}</div>
        <div class="bar"><i style="width:${(pct * 100).toFixed(1)}%" data-bar="${h.id}"></i></div>
        <div class="habit-foot">
          <span>${next ? `До этапа «${next.title}»: <b data-left="${h.id}">${shortDur(next.at - ms)}</b>` : 'Все этапы пройдены 🏆'}</span>
          ${h.costPerDay ? `<span class="saved" data-saved="${h.id}">+${money(saved)}</span>` : ''}
        </div>
      </a>`;
  }).join('');
  return `
    <section class="phrase card glow">
      <div class="label">Фраза часа</div>
      <p data-hour-phrase>${esc(phraseOfHour())}</p>
    </section>
    <button class="sos" data-act="sos">
      <span class="sos-icon">🆘</span>
      <span><b>Хочется сорваться?</b><small>Займись чем-нибудь 5 минут — тяга пройдёт</small></span>
    </button>
    ${S.habits.length ? `<div class="list">${cards}</div>` : `
      <section class="empty card">
        <div class="big-emoji">🌱</div>
        <h2>С чего начнём?</h2>
        <p>Добавь привычку, от которой отказываешься. Таймер начнёт считать твоё время свободы.</p>
      </section>`}
    <button class="btn primary wide" data-act="add">＋ Добавить привычку</button>
    ${S.wins ? `<p class="muted center">Побед над тягой: <b>${S.wins}</b> 💪</p>` : ''}
  `;
}
function timerHtml(ms) {
  const p = parts(ms);
  return `<span><b>${p.d}</b><small>${plural(p.d, 'день', 'дня', 'дней')}</small></span>
    <span><b>${pad(p.h)}</b><small>час</small></span>
    <span><b>${pad(p.m)}</b><small>мин</small></span>
    <span><b>${pad(p.s)}</b><small>сек</small></span>`;
}

// ---------- Привычка ----------
function habitView(h) {
  const ms = elapsed(h);
  const best = Math.max(h.best || 0, ms);
  const avoided = (h.perDay * ms) / DAY;
  const health = HEALTH[h.preset] || [];
  return `
    <a class="back" href="#/">← Все привычки</a>
    <section class="hero card glow">
      <div class="big-emoji">${esc(h.emoji)}</div>
      <h1>${esc(h.name)}</h1>
      <p class="muted">Свободен с ${new Date(h.start).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
      <div class="timer big" data-timer="${h.id}">${timerHtml(ms)}</div>
    </section>
    <div class="stats">
      ${h.costPerDay ? `<div class="stat card"><b data-saved="${h.id}">${money((h.costPerDay * ms) / DAY)}</b><small>сэкономлено</small></div>` : ''}
      ${h.perDay ? `<div class="stat card"><b data-avoided="${h.id}">${num(avoided)}</b><small>${esc(h.unit || 'раз')} не случилось</small></div>` : ''}
      <div class="stat card"><b>${h.cravings || 0}</b><small>${plural(h.cravings || 0, 'победа', 'победы', 'побед')} над тягой</small></div>
      <div class="stat card"><b>${shortDur(best)}</b><small>лучшая серия</small></div>
    </div>
    <div class="row">
      <button class="btn primary" data-act="beat" data-id="${h.id}">💪 Хочется — помоги</button>
      <button class="btn ghost" data-act="relapse" data-id="${h.id}">Я сорвался</button>
    </div>
    <section class="card">
      <h3>Этапы</h3>
      <ul class="milestones">
        ${MILESTONES.map((m) => {
          const done = ms >= m.at;
          return `<li class="${done ? 'done' : ''}"><span class="dot">${done ? '✓' : ''}</span><div><b>${m.title}</b><small>${done ? m.text : 'осталось ' + shortDur(m.at - ms)}</small></div></li>`;
        }).join('')}
      </ul>
    </section>
    ${health.length ? `<section class="card">
      <h3>Что происходит с телом</h3>
      <ul class="milestones">
        ${health.map((x) => `<li class="${ms >= x.at ? 'done' : ''}"><span class="dot">${ms >= x.at ? '✓' : ''}</span><div><b>${atLabel(x.at)}</b><small>${x.text}</small></div></li>`).join('')}
      </ul>
      <p class="muted tiny">Общие сведения, не медицинская консультация.</p>
    </section>` : ''}
    ${h.relapses?.length ? `<p class="muted center">Срывов: ${h.relapses.length}. Каждый новый старт — тоже шаг вперёд.</p>` : ''}
    <div class="row">
      <button class="btn ghost" data-act="edit" data-id="${h.id}">Изменить</button>
      <button class="btn ghost danger" data-act="delete" data-id="${h.id}">Удалить</button>
    </div>
  `;
}

// ---------- Отвлечься ----------
const ACTIVITIES = [
  { key: 'wave', emoji: '🌊', title: 'Переждать волну', text: '5 минут — и тяга спадёт' },
  { key: 'breathe', emoji: '🫁', title: 'Дыхание', text: 'Квадратное дыхание, 2 минуты' },
  { key: 'bubbles', emoji: '🫧', title: 'Лопай пузыри', text: 'Игра на 45 секунд' },
  { key: 'memory', emoji: '🃏', title: 'Найди пары', text: 'Тренировка памяти' },
  { key: 'workout', emoji: '🔥', title: 'Мини-зарядка', text: '5 упражнений по 30 секунд' },
  { key: 'task', emoji: '🎲', title: 'Быстрое дело', text: 'Случайное занятие на 5 минут' },
  { key: 'ground', emoji: '🧭', title: '5-4-3-2-1', text: 'Вернуться в «здесь и сейчас»' },
  { key: 'reasons', emoji: '❤️', title: 'Мои причины', text: 'Зачем я это делаю' },
];
function distractView() {
  return `
    <h1 class="page-title">Отвлечься</h1>
    <p class="muted">Тяга обычно длится 3–5 минут. Выбери, чем занять это время.</p>
    <div class="grid">
      ${ACTIVITIES.map((a) => `<button class="tile card" data-act="activity" data-key="${a.key}">
        <span class="tile-emoji">${a.emoji}</span><b>${a.title}</b><small>${a.text}</small></button>`).join('')}
    </div>
  `;
}

// ---------- Мотивация ----------
function motivationView() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `
    <h1 class="page-title">Мотивация</h1>
    <section class="phrase card glow">
      <div class="label">Фраза дня</div>
      <p>${esc(phraseOfDay())}</p>
    </section>
    <section class="phrase card">
      <div class="label">Фраза часа</div>
      <p data-hour-phrase>${esc(phraseOfHour())}</p>
    </section>
    <section class="phrase card">
      <div class="label">Ещё одна</div>
      <p id="rnd">${esc(randomPhrase())}</p>
      <button class="btn ghost small" data-act="rnd">Другая фраза ↻</button>
    </section>

    <section class="card">
      <h3>Мои причины</h3>
      <p class="muted">Напиши, зачем ты отказываешься. Они покажутся, когда станет трудно.</p>
      <ul class="reasons">${S.reasons.map((r, i) => `<li><span>${esc(r)}</span><button class="x" data-act="rm-reason" data-i="${i}" aria-label="Удалить">×</button></li>`).join('')}</ul>
      <form class="inline" data-form="reason">
        <input name="r" maxlength="140" placeholder="Например: хочу видеть, как растёт дочь" autocomplete="off">
        <button class="btn primary small">＋</button>
      </form>
    </section>

    <section class="card">
      <h3>Фразы в уведомлениях</h3>
      <label class="switch"><input type="checkbox" data-act="notify" ${S.notify && perm === 'granted' ? 'checked' : ''}><span></span>Присылать фразу каждый час</label>
      <div class="hours">
        с <select data-act="from">${hoursOpts(S.notifyFrom)}</select>
        до <select data-act="to">${hoursOpts(S.notifyTo)}</select>
      </div>
      <p class="muted tiny">${perm === 'unsupported' ? 'Этот браузер не умеет показывать уведомления.' :
        perm === 'denied' ? 'Уведомления запрещены в настройках браузера — разреши их для этого сайта.' :
        'Уведомления приходят, пока приложение открыто или свёрнуто. Чтобы не закрывалось, добавь его на главный экран телефона.'}</p>
    </section>

    <section class="card">
      <h3>Данные</h3>
      <p class="muted tiny">Всё хранится только на этом устройстве. Сохрани копию, чтобы перенести на другой телефон.</p>
      <div class="row">
        <button class="btn ghost small" data-act="export">Сохранить копию</button>
        <label class="btn ghost small">Загрузить копию<input type="file" accept="application/json" data-act="import" hidden></label>
      </div>
    </section>
  `;
}
const hoursOpts = (sel) => Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${pad(i)}:00</option>`).join('');

// ---------- Тикер ----------
function tick() {
  const r = route();
  for (const el of document.querySelectorAll('[data-timer]')) {
    const h = findHabit(el.dataset.timer);
    if (!h) continue;
    const ms = elapsed(h);
    el.innerHTML = timerHtml(ms);
    const bar = $(`[data-bar="${h.id}"]`);
    const nm = nextMilestone(ms);
    if (bar) bar.style.width = (nm.pct * 100).toFixed(2) + '%';
    const left = $(`[data-left="${h.id}"]`);
    if (left && nm.next) left.textContent = shortDur(nm.next.at - ms);
    const saved = $(`[data-saved="${h.id}"]`);
    if (saved) saved.textContent = (r.name === 'home' ? '+' : '') + money((h.costPerDay * ms) / DAY);
    const av = $(`[data-avoided="${h.id}"]`);
    if (av) av.textContent = num((h.perDay * ms) / DAY);
    // Новый этап — поздравляем один раз.
    const reached = nm.prev?.title || null;
    if (h.lastMilestone === undefined) { h.lastMilestone = reached; save(); }
    else if (reached && h.lastMilestone !== reached) {
      celebrate(`${h.emoji} ${reached} без «${h.name}»! ${nm.prev.text}`);
      h.lastMilestone = reached;
      save();
    }
  }
  const hp = phraseOfHour();
  document.querySelectorAll('[data-hour-phrase]').forEach((el) => { if (el.textContent !== hp) el.textContent = hp; });
}
setInterval(tick, 1000);

function celebrate(text) {
  toast(text);
  vibrate([60, 40, 60]);
  confetti();
}
function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = `hsl(${Math.random() * 360} 80% 60%)`;
    p.style.animationDelay = Math.random() * 0.4 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}

// ---------- Уведомления ----------
async function swReg() {
  try { return await navigator.serviceWorker?.ready; } catch { return null; }
}
async function checkNotify() {
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const d = new Date();
  const h = d.getHours();
  const inRange = S.notifyFrom <= S.notifyTo ? h >= S.notifyFrom && h < S.notifyTo : h >= S.notifyFrom || h < S.notifyTo;
  const key = `${d.toDateString()}-${h}`;
  if (!inRange || S.lastNotified === key) return;
  const firstToday = !S.lastNotified.startsWith(d.toDateString());
  S.lastNotified = key;
  save();
  const title = firstToday ? 'Фраза дня' : 'Фраза часа';
  const body = firstToday ? phraseOfDay(d) : phraseOfHour(d);
  if (document.visibilityState === 'visible') { toast(`${title}: ${body}`); return; }
  const reg = await swReg();
  const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'phrase' };
  if (reg) reg.showNotification(title, opts);
  else new Notification(title, opts);
}
setInterval(checkNotify, 30e3);

// ---------- Окна (листы) ----------
function sheet(html, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog"><button class="close" aria-label="Закрыть">×</button>${html}</div>`;
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); onClose?.(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.close')) close(); });
  document.body.appendChild(wrap);
  return { el: $('.sheet', wrap), close };
}

function habitForm(h) {
  const isNew = !h;
  const preset = h ? PRESETS.find((p) => p.key === h.preset) || PRESETS.at(-1) : PRESETS[0];
  const v = h || { ...preset, start: Date.now() };
  const local = new Date(v.start - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const s = sheet(`
    <h2>${isNew ? 'Новая привычка' : 'Изменить привычку'}</h2>
    ${isNew ? `<div class="chips">${PRESETS.map((p, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-preset="${p.key}">${p.emoji} ${p.name}</button>`).join('')}</div>` : ''}
    <form data-form="habit">
      <label>Название<input name="name" required maxlength="40" value="${esc(v.name)}"></label>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="emo ${e === v.emoji ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>
      <input type="hidden" name="emoji" value="${esc(v.emoji)}">
      <input type="hidden" name="preset" value="${esc(v.preset || preset.key)}">
      <label>Когда отказался<input type="datetime-local" name="start" value="${local}" max="${new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16)}"></label>
      <div class="two">
        <label>Сколько в день<input type="number" name="perDay" min="0" step="any" value="${v.perDay || ''}" placeholder="0"></label>
        <label>Чего<input name="unit" maxlength="20" value="${esc(v.unit || '')}" placeholder="сигарет"></label>
      </div>
      <label>Тратил в день, ₽<input type="number" name="costPerDay" min="0" step="any" value="${v.costPerDay || ''}" placeholder="0"></label>
      <button class="btn primary wide">${isNew ? 'Начать отсчёт' : 'Сохранить'}</button>
    </form>`);
  const f = $('form', s.el);
  s.el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) {
      const pr = PRESETS.find((x) => x.key === p.dataset.preset);
      s.el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === p));
      f.name.value = pr.key === 'other' ? '' : pr.name;
      f.perDay.value = pr.perDay || '';
      f.unit.value = pr.key === 'other' ? '' : pr.unit;
      f.costPerDay.value = pr.costPerDay || '';
      f.preset.value = pr.key;
      setEmoji(pr.emoji);
      if (pr.key === 'other') f.name.focus();
    }
    const em = e.target.closest('[data-emoji]');
    if (em) setEmoji(em.dataset.emoji);
  });
  function setEmoji(x) {
    f.emoji.value = x;
    s.el.querySelectorAll('.emo').forEach((b) => b.classList.toggle('on', b.dataset.emoji === x));
  }
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const start = f.start.value ? Math.min(Date.now(), new Date(f.start.value).getTime()) : Date.now();
    const data = {
      name: f.name.value.trim() || 'Привычка',
      emoji: f.emoji.value,
      preset: f.preset.value,
      start,
      perDay: +f.perDay.value || 0,
      unit: f.unit.value.trim(),
      costPerDay: +f.costPerDay.value || 0,
    };
    if (isNew) {
      const nh = { id: uid(), created: Date.now(), best: 0, relapses: [], cravings: 0, ...data };
      S.habits.push(nh);
      save();
      s.close();
      location.hash = '#/h/' + nh.id;
      toast('Отсчёт пошёл. Ты молодец, что начал! 🌱');
    } else {
      Object.assign(h, data);
      delete h.lastMilestone;
      save();
      s.close();
      render();
    }
  });
}

function relapse(h) {
  const s = sheet(`
    <h2>Бывает. Это не конец</h2>
    <p>Срыв — часть пути у большинства людей, которые в итоге бросили. Важно не сколько раз ты упал, а что ты снова встал.</p>
    <p class="muted">Твоя лучшая серия (${shortDur(Math.max(h.best || 0, elapsed(h)))}) сохранится. Таймер начнётся заново.</p>
    <div class="row">
      <button class="btn primary" data-go>Начать заново</button>
      <button class="btn ghost" data-no>Я передумал, держусь</button>
    </div>`);
  s.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-go]')) {
      h.best = Math.max(h.best || 0, elapsed(h));
      h.relapses = [...(h.relapses || []), Date.now()];
      h.start = Date.now();
      delete h.lastMilestone;
      save();
      s.close();
      render();
      toast('Новый старт. Первый час — уже скоро 💚');
    }
    if (e.target.closest('[data-no]')) { s.close(); openActivity('wave', h.id); }
  });
}

function sosMenu(habitId) {
  const s = sheet(`
    <h2>Держись, сейчас пройдёт</h2>
    <p class="muted">${esc(randomPhrase())}</p>
    ${S.reasons.length ? `<div class="reason-pop">❤️ ${esc(S.reasons[Math.floor(Math.random() * S.reasons.length)])}</div>` : ''}
    <div class="grid">
      ${ACTIVITIES.slice(0, 6).map((a) => `<button class="tile card" data-key="${a.key}"><span class="tile-emoji">${a.emoji}</span><b>${a.title}</b><small>${a.text}</small></button>`).join('')}
    </div>`);
  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-key]');
    if (t) { s.close(); openActivity(t.dataset.key, habitId); }
  });
}

// ---------- Занятия ----------
let stopActivity = null;
function openActivity(key, habitId) {
  stopActivity?.();
  const wrap = document.createElement('div');
  wrap.className = 'activity';
  wrap.innerHTML = `<button class="close" aria-label="Закрыть">×</button><div class="act-body"></div>`;
  document.body.appendChild(wrap);
  const body = $('.act-body', wrap);
  const timers = [];
  const every = (fn, ms) => timers.push(setInterval(fn, ms));
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const cleanup = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); };
  const close = () => { cleanup(); wrap.remove(); stopActivity = null; };
  stopActivity = close;
  $('.close', wrap).onclick = close;
  const finish = (title, text) => {
    cleanup();
    body.innerHTML = `<div class="finish">
      <div class="big-emoji">🌿</div>
      <h2>${title}</h2>
      <p>${text}</p>
      <p class="muted">Тяга прошла?</p>
      <button class="btn primary wide" data-win>Да, я справился 💪</button>
      <button class="btn ghost wide" data-more>Ещё немного отвлечься</button>
    </div>`;
    $('[data-win]', body).onclick = () => {
      S.wins++;
      const h = habitId && findHabit(habitId);
      if (h) h.cravings = (h.cravings || 0) + 1;
      else if (S.habits.length === 1) S.habits[0].cravings = (S.habits[0].cravings || 0) + 1;
      save();
      close();
      celebrate(`Победа над тягой! Всего: ${S.wins} 💪`);
      render();
    };
    $('[data-more]', body).onclick = () => { close(); sosMenu(habitId); };
  };
  const A = { wave, breathe, bubbles, memory, workout, task, ground, reasons };
  A[key]?.();

  function wave() {
    const total = 5 * 60;
    let left = total;
    body.innerHTML = `<h2>Переждать волну</h2>
      <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="ring-bg"/><circle cx="60" cy="60" r="54" class="ring-fg" pathLength="100"/></svg><b class="ring-num"></b></div>
      <p class="tip"></p>`;
    const num = $('.ring-num', body), fg = $('.ring-fg', body), tipEl = $('.tip', body);
    const draw = () => {
      num.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
      fg.style.strokeDashoffset = String(100 - ((total - left) / total) * 100);
      tipEl.textContent = WAVE_TIPS[Math.min(WAVE_TIPS.length - 1, Math.floor(((total - left) / total) * WAVE_TIPS.length))];
    };
    draw();
    every(() => { left--; draw(); if (left <= 0) finish('Волна прошла!', 'Ты пережил тягу, не поддавшись ей. Так и тренируется сила воли.'); }, 1000);
  }

  function breathe() {
    const phases = [['Вдох', 4, 'grow'], ['Задержка', 4, 'hold'], ['Выдох', 4, 'shrink'], ['Задержка', 4, 'rest']];
    const rounds = 8;
    let round = 0, ph = 0, sec = 0;
    body.innerHTML = `<h2>Квадратное дыхание</h2>
      <div class="breath"><div class="orb"></div><b class="breath-text"></b></div>
      <p class="muted breath-round"></p>`;
    const orb = $('.orb', body), txt = $('.breath-text', body), rnd = $('.breath-round', body);
    const step = () => {
      const [name, dur, cls] = phases[ph];
      if (sec === 0) { orb.className = 'orb ' + cls; vibrate(30); }
      txt.textContent = `${name} ${dur - sec}`;
      rnd.textContent = `Круг ${round + 1} из ${rounds}`;
      sec++;
      if (sec >= dur) {
        sec = 0; ph++;
        if (ph >= phases.length) { ph = 0; round++; if (round >= rounds) finish('Отлично подышал', 'Медленное дыхание успокаивает нервную систему и снижает тягу.'); }
      }
    };
    step();
    every(step, 1000);
  }

  function bubbles() {
    let score = 0, left = 45;
    const best = S.best.bubbles || 0;
    body.innerHTML = `<div class="game-head"><span>Очки: <b class="sc">0</b></span><span>⏱ <b class="tl">45</b></span><span class="muted">рекорд ${best}</span></div>
      <div class="field"></div>`;
    const field = $('.field', body), sc = $('.sc', body), tl = $('.tl', body);
    const spawn = () => {
      const b = document.createElement('button');
      b.className = 'bubble';
      const size = 44 + Math.random() * 40;
      const golden = Math.random() < 0.08;
      if (golden) b.classList.add('gold');
      b.style.width = b.style.height = size + 'px';
      b.style.left = Math.random() * (field.clientWidth - size) + 'px';
      b.style.animationDuration = 3 + Math.random() * 3 + 's';
      b.onpointerdown = () => {
        score += golden ? 5 : 1;
        sc.textContent = score;
        vibrate(10);
        b.classList.add('pop');
        setTimeout(() => b.remove(), 180);
      };
      b.addEventListener('animationend', () => b.remove());
      field.appendChild(b);
    };
    every(spawn, 420);
    every(() => {
      left--; tl.textContent = left;
      if (left <= 0) {
        const rec = score > best;
        if (rec) { S.best.bubbles = score; save(); }
        finish(rec ? `Новый рекорд: ${score}!` : `Очков: ${score}`, 'Руки заняты, голова отвлеклась — тяга теряет силу.');
      }
    }, 1000);
  }

  function memory() {
    const set = ['🍎', '🌻', '🐳', '🚀', '🎸', '🦊', '⚽', '🍉'];
    const cards = [...set, ...set].sort(() => Math.random() - 0.5);
    let open = [], found = 0, moves = 0, lock = false;
    body.innerHTML = `<div class="game-head"><span>Ходы: <b class="mv">0</b></span><span>Пары: <b class="fd">0</b>/8</span></div>
      <div class="mem">${cards.map((c, i) => `<button class="mcard" data-i="${i}"><span>${c}</span></button>`).join('')}</div>`;
    const mv = $('.mv', body), fd = $('.fd', body);
    body.addEventListener('click', (e) => {
      const c = e.target.closest('.mcard');
      if (!c || lock || c.classList.contains('open')) return;
      c.classList.add('open');
      open.push(c);
      if (open.length < 2) return;
      moves++; mv.textContent = moves;
      const [a, b] = open;
      if (cards[a.dataset.i] === cards[b.dataset.i]) {
        a.classList.add('ok'); b.classList.add('ok'); open = []; found++; fd.textContent = found; vibrate(20);
        if (found === 8) later(() => finish(`Все пары за ${moves} ходов!`, 'Мозг был занят задачей — и тяга отступила.'), 600);
      } else {
        lock = true;
        later(() => { a.classList.remove('open'); b.classList.remove('open'); open = []; lock = false; }, 800);
      }
    });
  }

  function workout() {
    const list = [...WORKOUT].sort(() => Math.random() - 0.5).slice(0, 5);
    let i = 0, left = 30;
    body.innerHTML = `<h2>Мини-зарядка</h2>
      <div class="ex"><div class="ex-emoji"></div><b class="ex-name"></b><div class="ex-time"></div><p class="muted ex-n"></p></div>`;
    const em = $('.ex-emoji', body), nm = $('.ex-name', body), tm = $('.ex-time', body), n = $('.ex-n', body);
    const draw = () => { em.textContent = list[i].emoji; nm.textContent = list[i].name; tm.textContent = left; n.textContent = `Упражнение ${i + 1} из ${list.length}` + (list[i + 1] ? ` · дальше: ${list[i + 1].name}` : ''); };
    draw();
    every(() => {
      left--;
      if (left <= 3 && left > 0) vibrate(30);
      if (left <= 0) {
        i++; left = 30; vibrate([80, 50, 80]);
        if (i >= list.length) return finish('Зарядка сделана!', 'Движение даёт телу дофамин — честный, без привычки.');
      }
      draw();
    }, 1000);
  }

  function task() {
    let last = -1;
    const show = () => {
      let i;
      do i = Math.floor(Math.random() * QUICK_TASKS.length); while (i === last);
      last = i;
      $('.task-text', body).textContent = QUICK_TASKS[i];
    };
    body.innerHTML = `<h2>Быстрое дело</h2>
      <div class="task card glow"><p class="task-text"></p></div>
      <button class="btn primary wide" data-done>Сделал ✓</button>
      <button class="btn ghost wide" data-other>Другое ↻</button>`;
    show();
    $('[data-other]', body).onclick = show;
    $('[data-done]', body).onclick = () => finish('Готово!', 'Маленькое дело — и мысли уже о другом.');
  }

  function ground() {
    let i = 0;
    const draw = () => {
      const g = GROUNDING[i];
      body.innerHTML = `<h2>5-4-3-2-1</h2>
        <div class="ground"><b>${g.n}</b><p>${g.text}</p></div>
        <p class="muted">Не торопись. Назови вслух или про себя.</p>
        <button class="btn primary wide" data-next>${i < GROUNDING.length - 1 ? 'Дальше' : 'Готово'}</button>`;
      $('[data-next]', body).onclick = () => { i++; if (i >= GROUNDING.length) finish('Ты здесь и сейчас', 'Техника возвращает внимание из мыслей о тяге в реальный мир.'); else draw(); };
    };
    draw();
  }

  function reasons() {
    if (!S.reasons.length) {
      body.innerHTML = `<h2>Мои причины</h2>
        <p>Пока пусто. Напиши хотя бы одну причину, зачем ты отказываешься — в трудный момент она поможет.</p>
        <form class="inline" data-r><input name="r" maxlength="140" placeholder="Зачем я это делаю?" autocomplete="off"><button class="btn primary small">＋</button></form>`;
      $('[data-r]', body).onsubmit = (e) => {
        e.preventDefault();
        const v = e.target.r.value.trim();
        if (v) { S.reasons.push(v); save(); reasons(); }
      };
      return;
    }
    body.innerHTML = `<h2>Вот зачем ты это делаешь</h2>
      <ul class="reason-list">${S.reasons.map((r) => `<li>❤️ ${esc(r)}</li>`).join('')}</ul>
      <p class="muted">Перечитай медленно. Это важнее пяти минут удовольствия.</p>
      <button class="btn primary wide" data-ok>Я помню ✓</button>`;
    $('[data-ok]', body).onclick = () => finish('Ты помнишь, зачем', 'Причины сильнее привычки, когда они перед глазами.');
  }
}

// ---------- События ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const h = t.dataset.id && findHabit(t.dataset.id);
  if (act === 'add') habitForm();
  else if (act === 'edit' && h) habitForm(h);
  else if (act === 'delete' && h) {
    if (confirm(`Удалить «${h.name}» и весь прогресс по ней?`)) {
      S.habits = S.habits.filter((x) => x !== h);
      save();
      location.hash = '#/';
    }
  } else if (act === 'relapse' && h) relapse(h);
  else if (act === 'beat') sosMenu(h?.id);
  else if (act === 'sos') sosMenu();
  else if (act === 'activity') openActivity(t.dataset.key);
  else if (act === 'rnd') $('#rnd').textContent = randomPhrase();
  else if (act === 'rm-reason') { S.reasons.splice(+t.dataset.i, 1); save(); render(); }
  else if (act === 'export') {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `svoboda-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'notify') {
    if (t.checked) {
      if (!('Notification' in window)) { t.checked = false; return toast('Этот браузер не умеет показывать уведомления'); }
      const p = await Notification.requestPermission();
      if (p !== 'granted') { t.checked = false; S.notify = false; save(); return render(); }
      S.notify = true;
      S.lastNotified = '';
      save();
      toast('Готово! Первая фраза — прямо сейчас');
      const reg = await swReg();
      const opts = { body: phraseOfDay(), icon: 'icon-192.png', tag: 'phrase' };
      if (reg) reg.showNotification('Фраза дня', opts); else new Notification('Фраза дня', opts);
      const d = new Date();
      S.lastNotified = `${d.toDateString()}-${d.getHours()}`;
      save();
    } else { S.notify = false; save(); }
  } else if (act === 'from') { S.notifyFrom = +t.value; save(); }
  else if (act === 'to') { S.notifyTo = +t.value; save(); }
  else if (act === 'import') {
    const file = t.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.habits)) throw new Error();
      if (!confirm('Заменить текущие данные загруженной копией?')) return;
      S = { ...blank(), ...data };
      save();
      render();
      toast('Копия загружена');
    } catch { toast('Не получилось прочитать файл'); }
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="reason"]');
  if (!f) return;
  e.preventDefault();
  const v = f.r.value.trim();
  if (!v) return;
  S.reasons.push(v);
  save();
  render();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); checkNotify(); } });

// ---------- Старт ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
checkNotify();
