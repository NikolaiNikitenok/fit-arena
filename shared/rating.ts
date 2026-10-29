// Кубки и лиги дуэлей. Победа над сильным даёт больше, поражение от слабого стоит дороже.
import { t } from '../src/i18n';

export interface League {
  name: string;
  from: number;
  color: string;
}

export const LEAGUES: League[] = [
  { name: t('Деревянная'), from: 0, color: '#a1887f' },
  { name: t('Бронзовая'), from: 300, color: '#cd7f32' },
  { name: t('Серебряная'), from: 700, color: '#c0c0c0' },
  { name: t('Золотая'), from: 1200, color: '#ffc107' },
  { name: t('Алмазная'), from: 1800, color: '#4fc3f7' },
  { name: t('Легенда'), from: 2600, color: '#e040fb' },
];

export const leagueOf = (cups: number): League => [...LEAGUES].reverse().find((l) => cups >= l.from) ?? LEAGUES[0];

export const WIN_CUPS = 30;
export const LOSS_CUPS = 20;

/** Изменение кубков победителя и проигравшего с поправкой на разницу сил. */
export function cupsChange(winner: number, loser: number): { win: number; loss: number } {
  const edge = Math.max(-1, Math.min(1, (loser - winner) / 500));
  const win = Math.round(WIN_CUPS * (1 + edge * 0.5));
  const loss = Math.min(loser, Math.round(LOSS_CUPS * (1 + edge * 0.5)));
  return { win, loss };
}

// Сезон длится 4 недели; в новом сезоне кубки сжимаются вдвое.
const SEASON_MS = 28 * 24 * 3600 * 1000;
const SEASON_START = Date.UTC(2026, 9, 19);
export const seasonAt = (tm: number): number => Math.max(1, Math.floor((tm - SEASON_START) / SEASON_MS) + 1);
export const seasonEndsAt = (tm: number): number => SEASON_START + seasonAt(tm) * SEASON_MS;
