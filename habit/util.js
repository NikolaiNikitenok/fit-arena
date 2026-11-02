// Общие помощники: форматирование, тосты, листы, конфетти.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pad = (n) => String(n).padStart(2, '0');
export const uid = () => Math.random().toString(36).slice(2, 10);
export const DAY = 864e5;
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export const money = (n) => nf.format(Math.round(n)) + ' ₽';
export const num = (n) => nf.format(Math.floor(n));
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export function parts(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
export function shortDur(ms) {
  const p = parts(ms);
  if (p.d > 0) return `${p.d} ${plural(p.d, 'день', 'дня', 'дней')}${p.d < 30 && p.h ? ` ${p.h} ч` : ''}`;
  if (p.h > 0) return `${p.h} ч ${p.m} мин`;
  return `${Math.max(1, p.m)} мин`;
}
export function atLabel(ms) {
  const m = Math.round(ms / 60e3), h = Math.round(ms / 3600e3), d = Math.round(ms / DAY);
  if (ms < 3600e3) return `${m} мин`;
  if (ms < DAY) return `${h} ${plural(h, 'час', 'часа', 'часов')}`;
  if (d === 365) return '1 год';
  return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
}
export const fmtDate = (t, opts = { day: 'numeric', month: 'long' }) => new Date(t).toLocaleString('ru-RU', opts);
export const fmtTime = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
/** Значение для <input type="datetime-local"> в местном времени. */
export const localInput = (t) => new Date(t - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

export function vibrate(p) { try { navigator.vibrate?.(p); } catch {} }

export function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3400);
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#5fe0a8', '#3cc4d6', '#ffd166', '#ff8fab', '#b69cff'];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.5 + 's';
    p.style.animationDuration = 1.8 + Math.random() * 1.2 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3400);
}

/** Нижний лист. Возвращает { el, close }. */
export function sheet(html, { onClose, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grip"></div><button class="close" aria-label="Закрыть">×</button>${html}</div>`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 200);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.sheet > .close')) close(); });
  // Свайп вниз за «ручку» закрывает лист.
  const sh = $('.sheet', wrap);
  let y0 = null;
  sh.addEventListener('touchstart', (e) => { if (sh.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sh.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    sh.style.transform = '';
    if (dy > 110) close();
  });
  document.body.appendChild(wrap);
  return { el: sh, close };
}

/** Простой диалог подтверждения в стиле приложения. */
export function ask(title, text, yes = 'Да', no = 'Отмена', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet(`<h2>${esc(title)}</h2>${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="row"><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-y>${esc(yes)}</button><button class="btn ghost" data-n>${esc(no)}</button></div>`,
      { onClose: () => { if (!answered) resolve(false); } });
    s.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-y]')) { answered = true; s.close(); resolve(true); }
      if (e.target.closest('[data-n]')) { answered = true; s.close(); resolve(false); }
    });
  });
}
