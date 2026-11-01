// Копия прогресса на сервере: при входе берём более свежую (телефон или сервер), дальше отправляем каждое сохранение.
import { useEffect, useState } from 'react';
import { claimGift, freezeProgress, hasHero, heroLevel, heroXp, loadProgress, onProgressSaved, Progress, replaceProgress, saveProgress } from './game/progress';
import { rememberUnlocks } from './game/unlocks';
import { guestId, setMaxBot, tg } from './telegram';
import { reportError, track, trackVillageTh2 } from './telemetry';
import { thLevel } from '../shared/village';
import { getLang, t, tErr } from './i18n';

// Язык — чтобы бот писал игроку на языке игры.
// tz — пояс телефона (минуты к востоку от UTC): бот пишет днём по времени игрока (server/winback.ts).
const auth = () => ({ initData: tg?.initData ?? '', guestId: guestId(), lang: getLang(), tz: -new Date().getTimezoneOffset() });

export const post = (path: string, body: object, keepalive = false) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...auth(), ...body }), keepalive }).then(async (r) => {
    if (!r.ok) throw Object.assign(new Error(String(r.status)), { status: r.status, body: tErr(await r.json().catch(() => null)) });
    return tErr(await r.json());
  });

// Аккаунт, чей прогресс сейчас в телефоне (server/accounts.ts). Сменился — значит, этот вход привязали к другому герою.
const ACCOUNT_KEY = 'fit-arena-account';
const storedAccount = () => {
  try {
    return localStorage.getItem(ACCOUNT_KEY);
  } catch {
    return null;
  }
};
const storeAccount = (id: string) => {
  try {
    localStorage.setItem(ACCOUNT_KEY, id);
  } catch {
    // Нет хранилища.
  }
};

const BACKUP_KEY = 'fit-arena-adventure-backup';
const isEmpty = (p: Partial<Progress> | null | undefined) => !hasHero(p);

/** Копия героя этого телефона до смены аккаунта: если выбор при привязке оказался не тем, её можно вернуть. */
export function localBackup(): { progress: Progress; at: number; level: number; stages: number } | null {
  try {
    const b = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? 'null') as { progress: Progress; at: number } | null;
    if (!b || isEmpty(b.progress)) return null;
    return { ...b, level: heroLevel(heroXp({ ...loadProgress(), ...b.progress })).level, stages: Object.keys(b.progress.stars ?? {}).length };
  } catch {
    return null;
  }
}

/** Вернуть героя из копии этого телефона: он становится героем аккаунта, сервер получает его как самую свежую копию. */
export async function restoreLocalBackup(): Promise<void> {
  const b = localBackup();
  if (!b) return;
  const p = { ...b.progress, savedAt: Date.now() };
  // Нынешний герой этого телефона ложится в копию на его место: ничего не теряется.
  const now = loadProgress();
  await post('/api/progress/save', { progress: p, account: cloud?.account });
  replaceProgress(p);
  freezeProgress();
  try {
    if (isEmpty(now)) localStorage.removeItem(BACKUP_KEY);
    else localStorage.setItem(BACKUP_KEY, JSON.stringify({ progress: now, at: Date.now() }));
  } catch {
    // Нет хранилища.
  }
  location.reload();
}

/** Вход привязан к другому герою: берём его прогресс (или чистый лист) и перезапускаем игру. */
export function switchAccount(id: string, progress: Progress | null): void {
  stopped = true;
  pending = null;
  const before = loadProgress();
  if (!isEmpty(before) && JSON.stringify(before.stars) !== JSON.stringify(progress?.stars ?? {})) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ progress: before, at: Date.now() }));
    } catch {
      // Нет хранилища.
    }
  }
  replaceProgress(progress ?? ({} as Progress));
  freezeProgress();
  storeAccount(id);
  location.reload();
}

export interface Remind {
  hour: number;
  tz: number;
}

// pro — Pro Pass: решает только сервер по id в Telegram.
// raidNotify — бот пишет о рейде клана (по умолчанию да).
// admin — видит статистику (список админов на сервере).
// account — id аккаунта на сервере; linkable — вошёл через мессенджер, можно привязывать другие входы.
// proOffer — Pro за звёзды: до когда оплачен, можно ли купить ещё и цена (null — гость, купить нельзя).
export interface ProOffer {
  until: number | null;
  canBuy: boolean;
  price: number;
  // Пробный Pro (server/proTrials.ts): можно ли подарить другу, кому подарен в сезоне, до когда свой пробник.
  trial?: { canGive: boolean; givenTo: string | null; until: number | null };
}
// starter — набор «Новичок» за звёзды: цена и куплен ли (null — гость).
export interface StarterOffer {
  price: number;
  bought: boolean;
}
type CloudState = { inClan?: boolean; remind: Remind | null; bot: boolean; telegram: boolean; pro: boolean; proOffer: ProOffer | null; starter: StarterOffer | null; raidNotify: boolean; letters: boolean; admin: boolean; account?: string; linkable: boolean; emoji: Record<string, string> };
let cloud: CloudState | null = null;
const listeners = new Set<(c: CloudState) => void>();

/** Подписка на ответ сервера: настройки могут открыть раньше, чем он придёт. */
export function onCloud(fn: (c: CloudState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let pending: Progress | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// После «Удалить мои данные» больше ничего не отправляем, пока приложение не перезапустят.
let stopped = false;

const push = (keepalive = false) => {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const p = pending;
  pending = null;
  if (p) post('/api/progress/save', { progress: p, account: cloud?.account }, keepalive).catch((e) => (onSaveError(e) ? null : (pending ??= p)));
};

// Сервер не принял копию (слишком большая): сообщаем разработчику один раз за запуск.
let tooLargeReported = false;
const onTooLarge = (e: { status?: number }) => {
  if (e.status !== 413 || tooLargeReported) return;
  tooLargeReported = true;
  reportError('error', new Error('progress save rejected: too large'), String(JSON.stringify(loadProgress()).length));
};

/** Отправить копию прогресса сейчас и дождаться ответа (перед набегом сервер должен знать войско). */
export async function syncNow(p?: Progress): Promise<void> {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const next = p ?? pending;
  pending = null;
  if (!next) return;
  await post('/api/progress/save', { progress: next, account: cloud?.account }).catch((e) => {
    if (!onSaveError(e)) pending ??= next;
    throw e;
  });
}

/** Сервер не принял копию: вход теперь ведёт в другой аккаунт. Тогда перезагружаемся на его прогресс. */
function onSaveError(e: { status?: number; body?: { account?: string } }): boolean {
  onTooLarge(e);
  if (e.status !== 409 || !e.body?.account) return false;
  const id = e.body.account;
  stopped = true;
  void post('/api/progress/load', {})
    .then((r: { progress: Progress | null }) => switchAccount(id, r.progress))
    .catch(() => switchAccount(id, null));
  return true;
}

/** Запуск синхронизации. onRemote — пришла более свежая копия с сервера. */
export async function startCloud(onRemote: (p: Progress) => void): Promise<void> {
  onProgressSaved((p) => {
    // Первое улучшение ратуши: проверка экономики деревни для новичков (shared/balance.ts earlyLoot).
    if (p.village?.b) trackVillageTh2(thLevel({ b: p.village.b }), p.days);
    pending = p;
    if (cloud && !timer) timer = setTimeout(push, 1500);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && push(true));
  try {
    const r = (await post('/api/progress/load', {})) as {
      progress: Progress | null;
      remind: Remind | null;
      bot: boolean;
      telegram: boolean;
      pro?: boolean;
      proOffer?: ProOffer | null;
      starter?: StarterOffer | null;
      raidNotify?: boolean;
      letters?: boolean;
      emoji?: Record<string, string>;
      admin?: boolean;
      account?: string;
      linkable?: boolean;
      maxBot?: string | null;
      // Ступени разделов: играл до них (всё открыто), был в дуэлях, состоит в клане.
      veteran?: boolean;
      duels?: boolean;
      clan?: boolean;
      // Подарок бота за возвращение (server/winback.ts).
      gift?: { id: string; coins: number; vigor?: number; text: string } | null;
    };
    setMaxBot(r.maxBot);
    cloud = { inClan: !!r.clan, remind: r.remind, bot: r.bot, telegram: r.telegram, pro: !!r.pro, proOffer: r.proOffer ?? null, starter: r.starter ?? null, raidNotify: r.raidNotify !== false, letters: r.letters !== false, admin: !!r.admin, account: r.account, linkable: !!r.linkable, emoji: r.emoji ?? {} };
    listeners.forEach((fn) => fn(cloud!));
    // В телефоне прогресс другого аккаунта (вход привязали к другому герою на другой платформе): он здесь больше не нужен.
    const before = storedAccount();
    if (r.account && before && before !== r.account && !before.startsWith('guest:')) return switchAccount(r.account, r.progress);
    if (r.account) storeAccount(r.account);
    const local = loadProgress();
    // Новый телефон: своего прогресса нет, берём серверный, даже если игра уже успела что-то сохранить.
    const empty = !Object.keys(local.stars).length && !Object.keys(local.days).length;
    // На сервере пустая копия, а здесь герой (её затёрли с другого устройства): возвращаем героя этого телефона.
    // Не трогаем только настоящий «Начать заново», сделанный позже.
    if (r.progress && !hasHero(r.progress) && hasHero(local) && !((r.progress.resetAt ?? 0) > (local.savedAt ?? 0))) {
      pending = { ...local, savedAt: Date.now() };
      push();
    } else if (r.progress && (empty || (r.progress.savedAt ?? 0) > (local.savedAt ?? 0))) {
      replaceProgress(r.progress);
      onRemote(loadProgress());
    } else if (!r.progress || (local.savedAt ?? 0) > (r.progress.savedAt ?? 0)) {
      // Сохранения до облака без отметки времени: отправляем как есть, с отметкой «сейчас».
      pending ??= { ...local, savedAt: local.savedAt || Date.now() };
      push();
    }
    // Сервер знает игрока по прежней версии, дуэлям или клану: эти разделы не закрываем (src/game/unlocks.ts).
    const cur = loadProgress();
    const opened = r.veteran && cur.gates !== 'all' ? { ...cur, gates: 'all' as const } : rememberUnlocks(cur, [...(r.duels ? ['duel' as const] : []), ...(r.clan ? ['clan' as const] : [])]);
    if (opened !== cur) onRemote(saveProgress(opened));
    // Подарок за возвращение: забираем один раз и показываем, что пришло.
    const gifted = r.gift ? claimGift(loadProgress(), r.gift) : null;
    if (gifted && r.gift) {
      track('gift_claim', r.gift.id.split('-')[0]);
      onRemote(gifted);
      giftListeners.forEach((fn) => fn(r.gift!.text));
    }
  } catch {
    // Сервер недоступен: играем на копии в телефоне, отправим в следующий раз.
  }
}

export const cloudState = () => cloud;

const giftListeners = new Set<(text: string) => void>();
/** Пришёл подарок за возвращение: текст для тоста. */
export function onGift(fn: (text: string) => void): () => void {
  giftListeners.add(fn);
  return () => giftListeners.delete(fn);
}

/** Состоит ли игрок в клане (по ответу сервера): «Тренировка дня» зовёт в рейд. */
export function useInClan(): boolean {
  const [v, setV] = useState(() => !!cloud?.inClan);
  useEffect(() => onCloud((c) => setV(!!c.inClan)), []);
  return v;
}

/** Есть ли Pro Pass: до ответа сервера — нет. */
export function usePro(): boolean {
  const [pro, setPro] = useState(() => !!cloud?.pro);
  useEffect(() => onCloud((c) => setPro(c.pro)), []);
  return pro;
}

/** Предложение Pro за звёзды (null — до ответа сервера или гость). */
export function useProOffer(): ProOffer | null {
  const [offer, setOffer] = useState(() => cloud?.proOffer ?? null);
  useEffect(() => onCloud((c) => setOffer(c.proOffer)), []);
  return offer;
}

/** Спросить сервер о Pro заново (после оплаты). */
export async function refreshPro(): Promise<{ pro: boolean; proOffer: ProOffer; starter: StarterOffer }> {
  const r = (await post('/api/pro/status', {})) as { pro: boolean; proOffer: ProOffer; starter: StarterOffer };
  if (cloud) {
    cloud = { ...cloud, pro: r.pro, proOffer: r.proOffer, starter: r.starter };
    listeners.forEach((fn) => fn(cloud!));
  }
  return r;
}

/** Подарить другу 3 дня Pro бесплатно (раз в сезон, только с Pro). Ошибка — текстом от сервера. */
export async function giftTrial(forId: string): Promise<void> {
  try {
    const r = (await post('/api/pro/trial', { for: forId })) as { proOffer: ProOffer };
    if (cloud) {
      cloud = { ...cloud, proOffer: r.proOffer };
      listeners.forEach((fn) => fn(cloud!));
    }
  } catch (e) {
    throw new Error((e as { body?: { error?: string } }).body?.error ?? t('Нет связи с сервером'));
  }
}

/** Сервер ответил на загрузку прогресса: знаем Pro, набор и прочее. До этого предложения покупки не показываем. */
export function useCloudReady(): boolean {
  const [v, setV] = useState(() => !!cloud);
  useEffect(() => onCloud(() => setV(true)), []);
  return v;
}

/** Набор «Новичок» (null — до ответа сервера или гость). */
export function useStarter(): StarterOffer | null {
  const [s, setS] = useState(() => cloud?.starter ?? null);
  useEffect(() => onCloud((c) => setS(c.starter)), []);
  return s;
}

/** Ссылка на оплату звёздами (только в Telegram): Pro себе, Pro в подарок другу (for — его id) или набор «Новичок». */
export async function proInvoice(kind: 'pro' | 'gift' | 'starter' = 'pro', forId?: string): Promise<string> {
  const r = (await post('/api/pro/invoice', { kind, for: forId })) as { url: string };
  return r.url;
}

/** Админ ли игрок (по ответу сервера): до ответа — нет. */
export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(() => !!cloud?.admin);
  useEffect(() => onCloud((c) => setAdmin(c.admin)), []);
  return admin;
}

/** Напоминание в боте в заданный час (null — выключить). */
export async function setRemind(hour: number | null): Promise<Remind | null> {
  const r = (await post('/api/remind', { remind: hour == null ? null : { hour, tz: -new Date().getTimezoneOffset() } })) as { remind: Remind | null };
  if (cloud) cloud.remind = r.remind;
  return r.remind;
}

/** Уведомления бота о рейде клана: начало, напоминание, итог. */
/** Письма Мастера Грома: «возвращайся» после нескольких дней без тренировки и сводка недели по понедельникам. */
export async function setLetters(on: boolean): Promise<boolean> {
  const r = (await post('/api/letters', { on })) as { letters: boolean };
  if (cloud) cloud.letters = r.letters;
  return r.letters;
}

export async function setRaidNotify(on: boolean): Promise<boolean> {
  const r = (await post('/api/raid-notify', { on })) as { raidNotify: boolean };
  if (cloud) cloud.raidNotify = r.raidNotify;
  return r.raidNotify;
}

/** Стереть всё о себе на сервере: прогресс, профиль, клан, друзей, следы в статистике. */
export async function deleteMyData(): Promise<void> {
  stopped = true;
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
  await post('/api/delete-me', {}).catch((e) => {
    stopped = false;
    throw e;
  });
}

/** Ссылка на страницу статистики для админа (подписана сервером, живёт неделю). */
export const adminStatsUrl = (): Promise<string> => post('/api/admin/link', {}).then((r: { url: string }) => r.url);
