// Pro Pass за звёзды Telegram (XTR). Покупка — на сезон пропуска (28 дней), по аккаунту:
// купленный в Telegram Pro действует и в Max, и в браузере. Платить можно только в Telegram.
// Если до конца сезона меньше недели, покупка сразу покрывает и следующий сезон.
// Повторная покупка продлевает Pro на сезон после уже оплаченного; дальше вперёд купить нельзя.
//   PRO_PRICE — цена в звёздах (по умолчанию 199)
//   PRO_SALES_FILE — покупки и возвраты (по умолчанию pro-sales.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { seasonAt, seasonEndsAt } from '../shared/rating';

export const PRO_PRICE = Math.max(1, Math.floor(Number(process.env.PRO_PRICE) || 199));
const DAY = 86_400_000;
// Меньше недели до конца сезона — покупаем и следующий: иначе Pro сгорит, не успев окупиться.
export const LATE_DAYS = 7;
// Пропуск считает сезон по местной дате игрока: на день-другой после конца сезона Pro не гаснет.
const GRACE = 14 * 3600_000;

export interface ProPurchase {
  n: number;
  charge: string;
  // Кто платил (tg:123) и чей аккаунт был открыт в игре.
  payer: string;
  account: string;
  name?: string;
  stars: number;
  at: number;
  until: number;
  refunded?: number;
}

interface Data {
  purchases: ProPurchase[];
}

/** Полезная нагрузка счёта: аккаунт, которому выдать Pro. Её создаёт только сервер. */
export const invoicePayload = (account: string) => `pro1:${account}`;
export const payloadAccount = (payload: string): string | null => (/^pro1:[\w:-]{3,60}$/.test(payload) ? payload.slice(5) : null);

/** До какого времени будет Pro после покупки сейчас при уже оплаченном до current. */
export function nextUntil(current: number, now: number): number {
  const from = Math.max(current, now);
  const end = seasonEndsAt(from);
  return end - from < LATE_DAYS * DAY ? seasonEndsAt(end) : end;
}

/** Можно ли купить ещё: оплачено не дальше текущего сезона. */
export const canBuy = (current: number, now: number) => current <= seasonEndsAt(now);

export class ProSales {
  private purchases: ProPurchase[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      this.purchases = (JSON.parse(readFileSync(file, 'utf8')) as Data).purchases ?? [];
    } catch {
      // Покупок ещё не было.
    }
  }

  /** До какого времени оплачен Pro у любого из этих id (аккаунт и его входы); 0 — не оплачен. */
  paidUntil(ids: string[]): number {
    let until = 0;
    for (const p of this.purchases) if (!p.refunded && (ids.includes(p.account) || ids.includes(p.payer))) until = Math.max(until, p.until);
    return until;
  }

  /** Действует ли купленный Pro сейчас. */
  active(ids: string[]): boolean {
    return this.paidUntil(ids) + GRACE > this.now();
  }

  /** Что показать в игре: до когда Pro, можно ли купить и цена. */
  offer(ids: string[]): { until: number | null; canBuy: boolean; price: number } {
    const now = this.now();
    const until = this.paidUntil(ids);
    return { until: until > now ? until : null, canBuy: canBuy(until, now), price: PRO_PRICE };
  }

  /** Проверка перед оплатой (pre_checkout_query): текст ошибки для игрока или null. */
  checkout(payload: string, currency: string, amount: number, ids: (account: string) => string[]): string | null {
    const account = payloadAccount(payload);
    if (!account) return 'Счёт устарел. Открой пропуск в игре и нажми «Купить» ещё раз.';
    if (currency !== 'XTR' || amount !== PRO_PRICE) return 'Цена изменилась. Открой пропуск в игре и нажми «Купить» ещё раз.';
    if (!canBuy(this.paidUntil(ids(account)), this.now())) return 'Pro Pass уже оплачен и на этот сезон, и на следующий.';
    return null;
  }

  /** Оплата прошла (successful_payment). Повтор того же платежа ничего не меняет. */
  paid(payload: string, charge: string, payer: string, amount: number, ids: (account: string) => string[], name?: string): ProPurchase | null {
    const known = this.purchases.find((p) => p.charge === charge);
    if (known) return known;
    const account = payloadAccount(payload);
    if (!account) return null;
    const now = this.now();
    const p: ProPurchase = { n: (this.purchases.at(-1)?.n ?? 0) + 1, charge, payer, account, name, stars: amount, at: now, until: nextUntil(this.paidUntil(ids(account)), now) };
    this.purchases.push(p);
    this.save();
    return p;
  }

  /** Покупка по номеру (для возврата админом). */
  get(n: number): ProPurchase | undefined {
    return this.purchases.find((p) => p.n === n);
  }

  /** Звёзды вернули: Pro по этой покупке больше не действует. */
  refunded(n: number): ProPurchase | undefined {
    const p = this.get(n);
    if (p && !p.refunded) {
      p.refunded = this.now();
      this.save();
    }
    return p;
  }

  /** Последние покупки, новые сверху. */
  recent(limit = 10): ProPurchase[] {
    return this.purchases.slice(-limit).reverse();
  }

  /** Сводка для админа: покупок и звёзд за всё время и в этом сезоне. */
  stats(): { count: number; stars: number; season: number; seasonCount: number; seasonStars: number } {
    const season = seasonAt(this.now());
    const live = this.purchases.filter((p) => !p.refunded);
    const cur = live.filter((p) => seasonAt(p.at) === season);
    const sum = (l: ProPurchase[]) => l.reduce((s, p) => s + p.stars, 0);
    return { count: live.length, stars: sum(live), season, seasonCount: cur.length, seasonStars: sum(cur) };
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ purchases: this.purchases } satisfies Data));
    renameSync(tmp, this.file);
  }
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

/** Сообщение игроку после оплаты. */
export const paidText = (p: ProPurchase) =>
  `⭐ Pro Pass активен до ${fmtDate(p.until)}!\n\nЗолотая дорожка пропуска открыта: забирай награды всех пройденных ступеней. Имя светится золотом в клане, чате и рейтинге, за героем золотой щит.\n\nPro действует везде, где ты входишь в NikitenokArena: в Telegram, Max и браузере. Спасибо, что поддерживаешь игру!`;

/** Ответ на /paysupport: Telegram требует его у ботов с оплатой. */
export const PAY_SUPPORT_TEXT = `Оплата в NikitenokArena — только звёздами Telegram, за Pro Pass на сезон.

Если что-то пошло не так (звёзды списались, а Pro не появился, или купил по ошибке) — напиши сюда одним сообщением, что случилось. Разработчик ответит и, если нужно, вернёт звёзды.

Pro не даёт преимущества над соперниками: дуэли и рейтинг решают только твои повторы.`;

/** Сообщение админам о покупке. */
export const saleAdminText = (p: ProPurchase) => `💰 Pro Pass куплен: ${p.name ?? 'игрок'} (${p.payer}${p.account !== p.payer ? `, аккаунт ${p.account}` : ''}) за ${p.stars} ⭐, до ${fmtDate(p.until)}.\nВернуть звёзды: /refund_${p.n}`;

/** /sales — последние покупки и итог. */
export function salesText(s: ProSales): string {
  const st = s.stats();
  const lines = s.recent().map((p) => `#${p.n} ${new Date(p.at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} ${p.name ?? p.payer} · ${p.stars} ⭐${p.refunded ? ' · возвращено' : ` · /refund_${p.n}`}`);
  return [`Pro Pass: ${st.count} покупок, ${st.stars} ⭐ всего; в сезоне ${st.season}: ${st.seasonCount}, ${st.seasonStars} ⭐.`, ...(lines.length ? ['', ...lines] : [])].join('\n');
}
