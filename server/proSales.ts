// Покупки за звёзды Telegram (XTR): Pro Pass себе, Pro в подарок другу и разовый набор «Новичок».
// Pro — на сезон пропуска (28 дней), по аккаунту:
// купленный в Telegram Pro действует и в Max, и в браузере. Платить можно только в Telegram.
// Если до конца сезона меньше недели, покупка сразу покрывает и следующий сезон.
// Повторная покупка продлевает Pro на сезон после уже оплаченного; дальше вперёд купить нельзя.
// Подарок даёт Pro только другу: тому, кто платил, ничего не прибавляется.
// Набор «Новичок» (облик и сундук) покупается один раз на аккаунт, выдаёт его сама игра (src/game/starter.ts).
//   PRO_PRICE — цена Pro в звёздах (по умолчанию 199), STARTER_PRICE — цена набора (по умолчанию 49)
//   PRO_SALES_FILE — покупки и возвраты (по умолчанию pro-sales.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { seasonAt, seasonEndsAt } from '../shared/rating';

export const PRO_PRICE = Math.max(1, Math.floor(Number(process.env.PRO_PRICE) || 199));
export const STARTER_PRICE = Math.max(1, Math.floor(Number(process.env.STARTER_PRICE) || 49));
export type SaleKind = 'pro' | 'gift' | 'starter';
const PRICE: Record<SaleKind, number> = { pro: PRO_PRICE, gift: PRO_PRICE, starter: STARTER_PRICE };
const PREFIX: Record<SaleKind, string> = { pro: 'pro1', gift: 'gift1', starter: 'new1' };
const DAY = 86_400_000;
// Меньше недели до конца сезона — покупаем и следующий: иначе Pro сгорит, не успев окупиться.
export const LATE_DAYS = 7;
// Пропуск считает сезон по местной дате игрока: на день-другой после конца сезона Pro не гаснет.
const GRACE = 14 * 3600_000;

export interface ProPurchase {
  n: number;
  // Нет поля — Pro себе (так записаны первые покупки).
  kind?: SaleKind;
  charge: string;
  // Кто платил (tg:123) и кому покупка: свой аккаунт в игре или друг (подарок).
  payer: string;
  account: string;
  name?: string;
  stars: number;
  at: number;
  // До когда Pro (у набора — 0).
  until: number;
  refunded?: number;
}

interface Data {
  purchases: ProPurchase[];
}

/** Полезная нагрузка счёта: что куплено и кому. Её создаёт только сервер. */
export const invoicePayload = (account: string, kind: SaleKind = 'pro') => `${PREFIX[kind]}:${account}`;
export function parsePayload(payload: string): { kind: SaleKind; account: string } | null {
  const m = /^(pro1|gift1|new1):([\w:-]{3,60})$/.exec(payload);
  if (!m) return null;
  const kind = (Object.keys(PREFIX) as SaleKind[]).find((k) => PREFIX[k] === m[1])!;
  return { kind, account: m[2] };
}
export const payloadAccount = (payload: string): string | null => parsePayload(payload)?.account ?? null;
const kindOf = (p: ProPurchase): SaleKind => p.kind ?? 'pro';

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
    for (const p of this.purchases) {
      if (p.refunded || kindOf(p) === 'starter') continue;
      if (ids.includes(p.account) || (kindOf(p) === 'pro' && ids.includes(p.payer))) until = Math.max(until, p.until);
    }
    return until;
  }

  /** Куплен ли уже набор «Новичок» (на аккаунт или тем, кто платил). */
  starterBought(ids: string[]): boolean {
    return this.purchases.some((p) => !p.refunded && kindOf(p) === 'starter' && (ids.includes(p.account) || ids.includes(p.payer)));
  }

  /** Набор «Новичок» в игре: цена и куплен ли. */
  starter(ids: string[]): { price: number; bought: boolean } {
    return { price: STARTER_PRICE, bought: this.starterBought(ids) };
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
    const sale = parsePayload(payload);
    if (!sale) return 'Счёт устарел. Открой игру и нажми «Купить» ещё раз.';
    if (currency !== 'XTR' || amount !== PRICE[sale.kind]) return 'Цена изменилась. Открой игру и нажми «Купить» ещё раз.';
    return this.why(sale.kind, ids(sale.account));
  }

  /** Почему эту покупку сейчас сделать нельзя (null — можно). */
  why(kind: SaleKind, ids: string[]): string | null {
    if (kind === 'starter') return this.starterBought(ids) ? 'Набор «Новичок» уже куплен: он продаётся один раз.' : null;
    if (!canBuy(this.paidUntil(ids), this.now())) return kind === 'gift' ? 'У друга Pro уже оплачен и на этот сезон, и на следующий.' : 'Pro Pass уже оплачен и на этот сезон, и на следующий.';
    return null;
  }

  /** Оплата прошла (successful_payment). Повтор того же платежа ничего не меняет. */
  paid(payload: string, charge: string, payer: string, amount: number, ids: (account: string) => string[], name?: string): ProPurchase | null {
    const known = this.purchases.find((p) => p.charge === charge);
    if (known) return known;
    const sale = parsePayload(payload);
    if (!sale) return null;
    const { kind, account } = sale;
    const now = this.now();
    const until = kind === 'starter' ? 0 : nextUntil(this.paidUntil(ids(account)), now);
    const p: ProPurchase = { n: (this.purchases.at(-1)?.n ?? 0) + 1, ...(kind !== 'pro' ? { kind } : {}), charge, payer, account, name, stars: amount, at: now, until };
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

/** Сообщение тому, кто платил. */
export const paidText = (p: ProPurchase, friendName?: string) =>
  kindOf(p) === 'starter'
    ? `🎁 Набор «Новичок» твой!\n\nОблик «Искатель приключений» уже в гардеробе, а сундук новичка открыт: 1000 монет, 3 зелья бодрости и 2 свитка замены. Если игра была открыта, перезапусти её.\n\nСпасибо, что поддерживаешь NikitenokArena!`
    : kindOf(p) === 'gift'
      ? `🎁 Ты подарил Pro Pass${friendName ? ` другу ${friendName}` : ' другу'}! Он действует до ${fmtDate(p.until)}. Мы уже написали другу, от кого подарок.`
      : selfPaidText(p);

/** Другу пришёл подарок. */
export const giftText = (p: ProPurchase, fromName?: string) =>
  `🎁 ${fromName ?? 'Друг'} подарил тебе Pro Pass до ${fmtDate(p.until)}!\n\nЗолотая дорожка пропуска открыта, имя светится золотом в клане, чате и рейтинге. Загляни в пропуск и забери награды.`;

const selfPaidText = (p: ProPurchase) =>
  `⭐ Pro Pass активен до ${fmtDate(p.until)}!\n\nЗолотая дорожка пропуска открыта: забирай награды всех пройденных ступеней. Имя светится золотом в клане, чате и рейтинге, за героем золотой щит.\n\nPro действует везде, где ты входишь в NikitenokArena: в Telegram, Max и браузере. Спасибо, что поддерживаешь игру!`;

/** Ответ на /paysupport: Telegram требует его у ботов с оплатой. */
export const PAY_SUPPORT_TEXT = `Оплата в NikitenokArena — только звёздами Telegram: Pro Pass на сезон (себе или в подарок другу) и набор «Новичок».

Если что-то пошло не так (звёзды списались, а покупка не появилась, или купил по ошибке) — напиши сюда одним сообщением, что случилось. Разработчик ответит и, если нужно, вернёт звёзды.

Pro не даёт преимущества над соперниками: дуэли и рейтинг решают только твои повторы.`;

/** Сообщение админам о покупке. */
const WHAT: Record<SaleKind, string> = { pro: 'Pro Pass куплен', gift: 'Pro Pass подарен', starter: 'Набор «Новичок» куплен' };
export const saleAdminText = (p: ProPurchase) => `💰 ${WHAT[kindOf(p)]}: ${p.name ?? 'игрок'} (${p.payer}${p.account !== p.payer ? `, ${kindOf(p) === 'gift' ? 'другу' : 'аккаунт'} ${p.account}` : ''}) за ${p.stars} ⭐${p.until ? `, до ${fmtDate(p.until)}` : ''}.\nВернуть звёзды: /refund_${p.n}`;

/** /sales — последние покупки и итог. */
export function salesText(s: ProSales): string {
  const st = s.stats();
  const lines = s.recent().map((p) => `#${p.n} ${new Date(p.at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} ${p.name ?? p.payer}${kindOf(p) === 'starter' ? ' · набор' : kindOf(p) === 'gift' ? ' · подарок' : ''} · ${p.stars} ⭐${p.refunded ? ' · возвращено' : ` · /refund_${p.n}`}`);
  return [`Покупки за звёзды: ${st.count}, ${st.stars} ⭐ всего; в сезоне ${st.season}: ${st.seasonCount}, ${st.seasonStars} ⭐.`, ...(lines.length ? ['', ...lines] : [])].join('\n');
}
