// Комбо в бою: повторы без паузы дольше COMBO_GAP_MS собираются в серию. Только для ощущений —
// урон и награды от комбо не зависят. Чем длиннее серия, тем ярче вспышка удара и огонь на кулаках.
import { t } from '../i18n';

export const COMBO_GAP_MS = 4000;

export interface Combo {
  n: number;
  at: number;
  best: number;
}

export const NO_COMBO: Combo = { n: 0, at: -Infinity, best: 0 };

// Выкрики на рубежах серии.
export const COMBO_SHOUTS: { at: number; text: string }[] = [
  { at: 3, text: t('Комбо!') },
  { at: 5, text: t('Огонь!') },
  { at: 10, text: t('Неудержим!') },
  { at: 20, text: t('Легенда!') },
  { at: 30, text: t('Титан!') },
  { at: 50, text: t('Бог арены!') },
];

/** Повтор засчитан: серия растёт, а после паузы начинается заново. */
export function nextCombo(c: Combo, now: number): Combo {
  const n = now - c.at <= COMBO_GAP_MS ? c.n + 1 : 1;
  return { n, at: now, best: Math.max(c.best, n) };
}

/** Серия ещё жива (пауза не затянулась). */
export const comboLive = (c: Combo, now: number) => c.n > 0 && now - c.at <= COMBO_GAP_MS;

/** Сила эффектов: 0 — меньше трёх подряд, 1 — комбо, 2 — с десяти, 3 — с двадцати. */
export const comboTier = (n: number): 0 | 1 | 2 | 3 => (n >= 20 ? 3 : n >= 10 ? 2 : n >= 3 ? 1 : 0);

/** Выкрик, если серия только что дошла до рубежа. */
export const comboShout = (n: number): string | null => COMBO_SHOUTS.find((s) => s.at === n)?.text ?? null;
