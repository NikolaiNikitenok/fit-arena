// Титан: раз в месяц вся страна бьёт одного огромного босса. С 12-го по 18-е число (по Москве)
// каждый повтор любого игрока — удар по Титану; урон считается по городам. Здоровье подбирает сервер
// (server/titan.ts) по прошлому Титану, чтобы победа была трудной, но достижимой.
import { t } from '../src/i18n';

export const TITAN_FROM = 12;
export const TITAN_TO = 18;
// Чтобы получить награду за победу, нужно внести хотя бы столько повторов.
export const TITAN_MIN_REPS = 30;
const MSK = 3 * 3_600_000;
const DAY = 86_400_000;

export interface TitanDef {
  name: string;
  // Подпись: чем он грозит.
  threat: string;
  color: string;
  glow: string;
}

// У каждого месяца свой Титан.
export const TITANS: TitanDef[] = [
  { name: t('Ледяной Колосс'), threat: t('заморозит всех на диванах до весны'), color: '#81d4fa', glow: '#40c4ff' },
  { name: t('Титан Зимней Спячки'), threat: t('усыпит страну до самого марта'), color: '#b39ddb', glow: '#7c4dff' },
  { name: t('Великан Отговорок'), threat: t('придумает тебе сто причин не тренироваться'), color: '#ffcc80', glow: '#ffab40' },
  { name: t('Колосс Слякоти'), threat: t('утопит пробежки в лужах'), color: '#a1887f', glow: '#8d6e63' },
  { name: t('Титан Шашлыка'), threat: t('накормит всех до неподвижности'), color: '#ff8a65', glow: '#ff5722' },
  { name: t('Песочный Гигант'), threat: t('засыплет пляжи ленью'), color: '#ffe082', glow: '#ffd54f' },
  { name: t('Титан Жары'), threat: t('растопит любую мотивацию'), color: '#ff7043', glow: '#ff3d00' },
  { name: t('Колосс Отпуска'), threat: t('продлит каникулы навсегда'), color: '#4dd0e1', glow: '#00e5ff' },
  { name: t('Титан Понедельника'), threat: t('перенесёт все тренировки на «потом»'), color: '#90a4ae', glow: '#b0bec5' },
  { name: t('Тыквенный Колосс'), threat: t('превратит мышцы в кашу'), color: '#ffa726', glow: '#ff9100' },
  { name: t('Туманный Великан'), threat: t('спрячет утро в одеяле'), color: '#9fa8da', glow: '#536dfe' },
  { name: t('Титан Оливье'), threat: t('накормит страну до февраля'), color: '#aed581', glow: '#76ff03' },
];

export interface TitanWindow {
  // Месяц Титана (YYYY-MM).
  key: string;
  start: number;
  end: number;
  live: boolean;
  // Дни Титана по календарю игрока: повторы этих дней — удары.
  dates: string[];
  def: TitanDef;
}

const pad = (n: number) => String(n).padStart(2, '0');

function windowOf(year: number, month: number, now: number): TitanWindow {
  const start = Date.UTC(year, month, TITAN_FROM) - MSK;
  const end = Date.UTC(year, month, TITAN_TO + 1) - MSK;
  const key = `${year}-${pad(month + 1)}`;
  return {
    key,
    start,
    end,
    live: now >= start && now < end,
    dates: Array.from({ length: TITAN_TO - TITAN_FROM + 1 }, (_, i) => `${key}-${pad(TITAN_FROM + i)}`),
    def: TITANS[month],
  };
}

/** Титан этого месяца, а если он уже закончился — следующего. */
export function titanWindow(now: number): TitanWindow {
  const msk = new Date(now + MSK);
  const w = windowOf(msk.getUTCFullYear(), msk.getUTCMonth(), now);
  if (now < w.end) return w;
  const next = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth() + 1, 1));
  return windowOf(next.getUTCFullYear(), next.getUTCMonth(), now);
}

/** Титан по месяцу (YYYY-MM): для итогов прошедшего. */
export function titanOf(key: string, now: number): TitanWindow {
  const [y, m] = key.split('-').map(Number);
  return windowOf(y, m - 1, now);
}

/** Прошлый Титан (уже закончился) — для награды после конца недели. */
export function lastTitan(now: number): TitanWindow {
  const msk = new Date(now + MSK);
  const w = windowOf(msk.getUTCFullYear(), msk.getUTCMonth(), now);
  if (now >= w.end) return w;
  const prev = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth() - 1, 1));
  return windowOf(prev.getUTCFullYear(), prev.getUTCMonth(), now);
}

export const titanDaysLeft = (w: TitanWindow, now: number) => Math.max(0, Math.ceil((w.start - now) / DAY));
