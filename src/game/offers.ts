// Когда предлагать покупку за звёзды (этап 5 плана): не в первую минуту, а в момент, когда игроку хорошо
// и ценность понятна.
//   • Набор «Новичок» — после первой победы над боссом (хранитель 10-го уровня) или на 3-й день серии.
//   • Pro Pass — когда игрок впервые дошёл до ступени пропуска, где золотая награда закрыта.
// Каждое окно — один раз за всё время и не больше одного окна в день. В лавке и в пропуске
// карточки покупки остаются всегда — это просто витрина, без всплывающих окон.
import { LEVELS } from './levels';
import { passOf, type Progress, streakOf } from './progress';
import { passTier } from './pass';
import { isUnlocked } from './unlocks';

export type OfferKind = 'starter' | 'pro';
const DAY = 86_400_000;

export interface OfferInput {
  // Набор ещё можно купить (сервер прислал предложение и он не куплен).
  starterOpen: boolean;
  pro: boolean;
  // Купить можно только в Telegram (звёзды); в Max и браузере окно не показываем.
  canPay: boolean;
}

/** Побеждён ли хоть один босс карты. */
export const bossWon = (p: Pick<Progress, 'stars'>): boolean => LEVELS.some((l) => l.type === 'boss' && (p.stars[l.id] ?? 0) > 0);

/** Какое окно предложения показать сейчас; null — никакое. */
export function dueOffer(p: Progress, x: OfferInput, now: number): OfferKind | null {
  if (!x.canPay) return null;
  const o = p.offers ?? {};
  // Не больше одного предложения в сутки, даже если оба повода совпали.
  if (Math.max(o.starter ?? 0, o.pro ?? 0) > now - DAY) return null;
  if (x.starterOpen && !p.starterPack && !o.starter && (bossWon(p) || streakOf(p, now).days >= 3)) return 'starter';
  if (!x.pro && !o.pro && isUnlocked(p, 'pass') && passTier(passOf(p, now).xp).tier >= 1) return 'pro';
  return null;
}

export const markOffer = (p: Progress, kind: OfferKind, now: number): Progress => ({ ...p, offers: { ...p.offers, [kind]: now } });
