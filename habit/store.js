// Состояние приложения в localStorage + производные величины (серии, награды, статистика).
import { BADGES, ACTIVITIES } from './data.js';
import { DAY, dayKey } from './util.js';

const KEY = 'habit-free-v1';
const blank = () => ({
  v: 2,
  onboarded: false,
  habits: [],
  reasons: [],
  letter: '',
  wins: 0,
  cravings: [], // { t, habitId, trigger, before, after, activity, ok }
  checkins: {}, // 'YYYY-MM-DD': { mood, pledge }
  goal: null, // { title, price }
  contact: null, // { name, phone }
  badges: {}, // id → время получения
  best: {}, // рекорды игр
  played: {}, // сколько раз запускалось каждое занятие
  notify: false,
  notifyFrom: 9,
  notifyTo: 22,
  lastNotified: '',
  savedAt: 0,
});

export let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...blank(), ...JSON.parse(raw) });
  } catch {}
  return blank();
}
function migrate(s) {
  // v1: срывы хранились числами, знакомства не было — у кого есть привычки, тот уже «знаком».
  if (!s.v || s.v < 2) {
    s.v = 2;
    if (s.habits.length) s.onboarded = true;
  }
  for (const h of s.habits) {
    h.relapses = (h.relapses || []).map((r) => (typeof r === 'number' ? { t: r } : r));
    h.slips = h.slips || [];
    h.cravings = h.cravings || 0;
  }
  return s;
}
const saveListeners = [];
/** Подписка на сохранения (копия на сервере, cloud.js). */
export const onSave = (fn) => saveListeners.push(fn);
export function save({ silent = false } = {}) {
  if (!silent) S.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
  if (!silent) saveListeners.forEach((fn) => fn());
}
/** Заменить всё состояние (загрузка копии). silent — без отправки обратно на сервер. */
export function replaceState(data, { silent = false } = {}) {
  S = migrate({ ...blank(), ...data });
  if (silent) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  else save();
}
export function resetState() {
  S = blank();
  save();
}

export const findHabit = (id) => S.habits.find((h) => h.id === id);
/** Сколько длится текущая серия (0, если старт ещё впереди). */
export const elapsed = (h) => Math.max(0, Date.now() - h.start);
export const isPlanned = (h) => h.start > Date.now();
export const savedOf = (h) => (h.costPerDay * elapsed(h)) / DAY;
/** Сэкономлено за всё время: текущая серия + все прошлые серии до срывов. */
export function savedTotal() {
  return S.habits.reduce((sum, h) => sum + savedOf(h) + ((h.pastMs || 0) * h.costPerDay) / DAY, 0);
}

/** Сколько дней подряд была отметка (включая сегодня, или до вчера, если сегодня ещё нет). */
export function checkStreak() {
  let n = 0;
  const d = new Date();
  if (!S.checkins[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (S.checkins[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function logCraving(entry) {
  S.cravings.push({ t: Date.now(), ...entry });
  if (S.cravings.length > 800) S.cravings = S.cravings.slice(-800);
  save();
}

/** Проверяет награды. Возвращает новые (только что полученные). */
export function checkBadges() {
  const ctx = {
    habits: S.habits.length,
    maxMs: Math.max(0, ...S.habits.map((h) => Math.max(h.best || 0, elapsed(h)))),
    wins: S.wins,
    checkStreak: checkStreak(),
    saved: savedTotal(),
    kinds: Object.keys(S.played || {}).length,
    // «Снова в строю»: после срыва была хотя бы одна победа над тягой.
    slipsBack: (() => {
      const falls = S.habits.flatMap((h) => [...(h.slips || []), ...(h.relapses || [])].map((r) => r.t));
      const lastWin = Math.max(0, ...S.cravings.filter((c) => c.ok !== false).map((c) => c.t));
      return falls.some((t) => t < lastWin) ? 1 : 0;
    })(),
  };
  const fresh = [];
  for (const b of BADGES) {
    if (!S.badges[b.id] && b.check(ctx)) {
      S.badges[b.id] = Date.now();
      fresh.push(b);
    }
  }
  if (fresh.length) save();
  return fresh;
}

/** Статистика тяги за последние N дней. */
export function cravingStats(days = 14) {
  const from = Date.now() - days * DAY;
  const list = S.cravings.filter((c) => c.t >= from);
  const byDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const k = dayKey(d);
    const items = list.filter((c) => dayKey(new Date(c.t)) === k);
    byDay.push({ k, d, n: items.length, won: items.filter((c) => c.ok !== false).length });
  }
  const triggers = {};
  const hours = Array(24).fill(0);
  const acts = {};
  let drop = 0, dropN = 0;
  for (const c of list) {
    if (c.trigger) triggers[c.trigger] = (triggers[c.trigger] || 0) + 1;
    hours[new Date(c.t).getHours()]++;
    if (c.activity && c.ok !== false) acts[c.activity] = (acts[c.activity] || 0) + 1;
    if (c.before && c.after) { drop += c.before - c.after; dropN++; }
  }
  const won = list.filter((c) => c.ok !== false).length;
  return {
    total: list.length,
    won,
    byDay,
    triggers: Object.entries(triggers).sort((a, b) => b[1] - a[1]),
    hours,
    peakHour: list.length ? hours.indexOf(Math.max(...hours)) : null,
    bestActivity: Object.entries(acts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    avgDrop: dropN ? drop / dropN : null,
  };
}

/** Занятия, которые подходят под триггер, плюс те, что раньше помогали чаще всего. */
export function suggestActivities(trigger, n = 3) {
  const helped = {};
  for (const c of S.cravings) if (c.ok !== false && c.activity && (!trigger || c.trigger === trigger)) helped[c.activity] = (helped[c.activity] || 0) + 1;
  const score = (a) => (a.tags.includes(trigger) ? 2 : 0) + (helped[a.key] || 0) * 0.7 + Math.random() * 0.6;
  return [...ACTIVITIES].sort((a, b) => score(b) - score(a)).slice(0, n);
}
