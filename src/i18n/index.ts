// Язык интерфейса: русский (исходный) или английский. Русская строка — сама ключ перевода:
// t('В бой') вернёт 'Battle' на английском и 'В бой' на русском. Чего нет в словаре (en.ts),
// показывается по-русски — так переводить можно по частям, ничего не ломая.
// Подстановки — {имя}: t('Уровень {n}', { n: 5 }).
import { EN } from './en';

export type Lang = 'ru' | 'en';

const KEY = 'fit-arena-lang';
// Без сохранённого выбора язык берём из Telegram (или браузера): русский для русского и языков СНГ, иначе английский.
const AUTO_EN = true;
// Языки, на которых говорят и по-русски: им русский интерфейс по умолчанию.
const RU_LIKE = /^(ru|uk|be|kk|ky|uz|tg|tk|az|hy|ka|mo|ro)/;

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // Хранилище недоступно.
  }
  // Сервер (Node.js тоже знает navigator.language) и тесты всегда на русском: бот и журналы — по-русски.
  if (!AUTO_EN || typeof window === 'undefined') return 'ru';
  const w = globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } }; navigator?: { language?: string } };
  return langOfCode(w.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? w.navigator?.language ?? 'ru');
}

let lang: Lang = detect();
export const getLang = (): Lang => lang;
export const isEn = () => lang === 'en';

/** Сменить язык: запоминаем и перезапускаем игру — так новый язык подхватят все экраны сразу. */
export function setLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // Без хранилища язык продержится до перезапуска.
  }
  lang = l;
  if (typeof location !== 'undefined') location.reload();
}

/** Для тестов: язык без перезапуска. */
export const setLangForTest = (l: Lang) => {
  lang = l;
};

/** Перевод строки интерфейса. */
export const t = (ru: string, vars?: Record<string, string | number | null | undefined>): string => tl(lang, ru, vars);

/** Слово при числе: ru — [один, два, пять], en — [one, many]. pl(3, ['день', 'дня', 'дней'], ['day', 'days']) → 'дня' / 'days'. */
export function pl(n: number, ru: [string, string, string], en: [string, string]): string {
  if (lang === 'en') return Math.abs(n) === 1 ? en[0] : en[1];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return ru[2];
  if (b === 1) return ru[0];
  if (b >= 2 && b <= 4) return ru[1];
  return ru[2];
}

/** Язык для toLocaleString и Intl: разделители тысяч, даты. */
export const locale = (): string => (lang === 'en' ? 'en-US' : 'ru');

// Месяцы по-английски: у английского нет падежей, одна форма на все случаи.
export const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Слово при числе по трём русским формам [один, два, пять], уже переведённым через t(): по-английски берём
 * первую форму для одного и третью для остальных (вторая — «два-четыре» — в английском не нужна).
 */
export function forms(n: number, f: [string, string, string], l: Lang = lang): string {
  if (l === 'en') return Math.abs(n) === 1 ? f[0] : f[2];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2];
}

/** Перевод на заданный язык, а не на язык этого экрана: сервер пишет каждому игроку на его языке. */
export function tl(l: Lang, ru: string, vars?: Record<string, string | number | null | undefined>): string {
  const s = l === 'en' ? (EN[ru] ?? ru) : ru;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s;
}

/** Язык по коду Telegram (language_code) или браузера: русский для русского и языков СНГ, иначе английский. */
export const langOfCode = (code: string | null | undefined): Lang => (!code || RU_LIKE.test(code.toLowerCase()) ? 'ru' : 'en');

/** Ошибка от сервера: сервер пишет по-русски, а здесь её переводим (если такая фраза есть в словаре). */
export function tErr<T>(reply: T): T {
  const r = reply as { error?: unknown; message?: unknown } | null;
  if (r && typeof r.error === 'string') r.error = t(r.error);
  if (r && typeof r.message === 'string') r.message = t(r.message);
  return reply;
}

/** Ключ перевода без перевода: фраза уходит дальше как есть (на сервере — в чат клана), а тест проверяет, что у неё есть английский. */
export const tk = (ru: string): string => ru;

/** Системное сообщение (чат клана): фраза и подстановки — на языке этого экрана. Подстановки-слова («час», имя «Боец») тоже переводим. */
export const tMsg = (key: string, vars: Record<string, string | number> = {}): string =>
  t(key, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' ? t(v) : v])));
