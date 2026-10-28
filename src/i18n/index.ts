// Язык интерфейса: русский (исходный) или английский. Русская строка — сама ключ перевода:
// t('В бой') вернёт 'Battle' на английском и 'В бой' на русском. Чего нет в словаре (en.ts),
// показывается по-русски — так переводить можно по частям, ничего не ломая.
// Подстановки — {имя}: t('Уровень {n}', { n: 5 }).
import { EN } from './en';

export type Lang = 'ru' | 'en';

const KEY = 'fit-arena-lang';
// Сам выбирать английский по языку Telegram — когда переведена вся игра. Пока язык меняют в настройках.
const AUTO_EN = false;
// Языки, на которых говорят и по-русски: им русский интерфейс по умолчанию.
const RU_LIKE = /^(ru|uk|be|kk|ky|uz|tg|tk|az|hy|ka|mo|ro)/;

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // Хранилище недоступно.
  }
  if (!AUTO_EN) return 'ru';
  const w = globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } }; navigator?: { language?: string } };
  const code = w.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? w.navigator?.language ?? 'ru';
  return RU_LIKE.test(code.toLowerCase()) ? 'ru' : 'en';
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
export function t(ru: string, vars?: Record<string, string | number | null | undefined>): string {
  const s = lang === 'en' ? (EN[ru] ?? ru) : ru;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s;
}

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
