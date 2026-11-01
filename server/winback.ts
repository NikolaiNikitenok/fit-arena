// Возврат ушедших и «твоя сила растёт» — личные сообщения бота.
//   • Не заходил 3 дня и 7 дней — письмо от персонажа с конкретикой (питомец грустит, клан без тебя)
//     и подарком в игре. Не больше двух писем за одно отсутствие: вернулся — счётчик с нуля.
//   • По понедельникам — сколько повторов за неделю и насколько больше, чем месяц назад.
// Пишем только днём (12–20 по местному времени игрока, без настройки — по Москве) и тем, кто не остановил бота.
// Подарок кладём в копию игрока на сервере (Save.gift): игра забирает его при запуске, один раз (Progress.gifts).
import { type Lang, tl } from '../src/i18n';
import { weekKey, weekSummary } from '../shared/weekly';
import { localTime, type Save } from './saves';

export const WINBACK_DAYS = [3, 7] as const;
const DAY = 86_400_000;
const MSK_TZ = 180;
// Писать можно с 12 до 20 по местному времени.
const FROM_HOUR = 12;
const TO_HOUR = 20;

export interface Gift {
  id: string;
  coins: number;
  vigor?: number;
  text: string;
}

export interface WinbackState {
  // Последний день тренировки, к которому относятся письма; вернулся — новый день, всё сначала.
  last: string;
  sent: number[];
}

export interface Outgoing {
  id: string;
  // wb3, wb7 или weekly: метка в адресе кнопки для статистики.
  kind: string;
  text: string;
  button: string;
  gift?: Gift;
  // Местная дата игрока: в этот день обычное напоминание уже не шлём.
  date: string;
  // Что отметить в копии игрока: письмо о возврате или недельная сводка.
  mark: { winback?: WinbackState; weeklyOn?: string };
}

type P = { days?: Record<string, number>; pets?: { active?: string; names?: Record<string, string> }; gifts?: string[] } | null;

const lastDay = (days: Record<string, number> | undefined): string | null => {
  const keys = Object.keys(days ?? {}).filter((k) => (days![k] ?? 0) > 0);
  return keys.length ? keys.sort()[keys.length - 1] : null;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export interface WinbackDeps {
  lang: (id: string) => Lang;
  // Название клана игрока, если он в клане.
  clanName: (id: string) => string | undefined;
  petName: (id: string, pet: string) => string;
  canWrite: (id: string) => boolean;
}

/** Местное время игрока: пояс из напоминания, иначе пояс телефона, иначе Москва. */
export const tzOf = (s: Save): number => s.remind?.tz ?? s.tz ?? MSK_TZ;

/** Сводка недели положена: понедельник, на этой неделе ещё не писали, а на прошлой тренировался. */
export function weeklyDue(s: Save, date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1 && s.weeklyOn !== weekKey(date) && weekSummary((s.progress as P)?.days, date).week > 0;
}

/** Какое письмо «возвращайся» положено игроку на эту местную дату (3 или 7), если положено. */
export function pendingStage(s: Save, date: string): number | undefined {
  const last = lastDay((s.progress as P)?.days);
  if (!last) return undefined;
  const away = daysBetween(last, date);
  // Через месяц тишины уже не пишем: человек ушёл, письма станут спамом.
  if (away > 30) return undefined;
  const sent = s.winback?.last === last ? s.winback.sent : [];
  if (sent.length >= WINBACK_DAYS.length) return undefined;
  // Только самое позднее из положенных: после «недели без тебя» письмо «три дня тишины» уже не придёт.
  const due = [...WINBACK_DAYS].reverse().find((n) => away >= n);
  return due && !sent.some((n) => n >= due) ? due : undefined;
}

/** Кому и что написать сейчас. */
export function dueMessages(saves: Save[], now: number, d: WinbackDeps): Outgoing[] {
  const out: Outgoing[] = [];
  for (const s of saves) {
    if (s.blocked || s.lettersOff || s.id.startsWith('guest:') || !d.canWrite(s.id)) continue;
    const { date, hour } = localTime(now, tzOf(s));
    if (hour < FROM_HOUR || hour >= TO_HOUR) continue;
    // Не больше одного сообщения бота в день: сегодня уже было напоминание или письмо.
    if (s.remindedOn === date || s.letterOn === date) continue;
    const p = s.progress as P;
    const last = lastDay(p?.days);
    if (!last) continue;
    const l = d.lang(s.id);
    const state: WinbackState = s.winback?.last === last ? s.winback : { last, sent: [] };
    const stage = pendingStage(s, date);
    if (stage) {
      out.push({ id: s.id, kind: `wb${stage}`, date, ...winbackText(s.id, stage, p, l, d, date), mark: { winback: { last, sent: WINBACK_DAYS.filter((n) => n <= stage || state.sent.includes(n)) } } });
      continue;
    }
    // Понедельник: сводка за неделю тем, кто на неделе тренировался.
    if (weeklyDue(s, date)) {
      const w = weekSummary(p?.days, date);
      out.push({ id: s.id, kind: 'weekly', date, text: weeklyText(w.week, w.pct, w.vs, l), button: tl(l, 'Тренироваться'), mark: { weeklyOn: weekKey(date) } });
    }
  }
  return out;
}

function winbackText(id: string, stage: number, p: P, l: Lang, d: WinbackDeps, date: string): { text: string; button: string; gift: Gift } {
  const gift: Gift = stage >= 7 ? { id: `wb7-${date}`, coins: 200, vigor: 2, text: tl(l, '200 монет и 2 зелья бодрости') } : { id: `wb3-${date}`, coins: 100, text: tl(l, '100 монет') };
  const pet = p?.pets?.active;
  const clan = d.clanName(id);
  const hook = pet
    ? tl(l, '{0} скучает и не ест без тебя.', { 0: d.petName(id, pet) })
    : clan
      ? tl(l, 'Клан «{0}» тренируется без тебя — им не хватает твоих повторов.', { 0: clan })
      : tl(l, 'Князь Диван уже потирает руки: ещё немного, и Атлетия снова уснёт.');
  const text =
    stage >= 7
      ? tl(l, 'Мастер Гром: «Неделя без тренировки, ученик. {0} Возвращайся — даже пять минут считаются.»\n\n🎁 В игре ждёт подарок: {1}.', { 0: hook, 1: gift.text })
      : tl(l, 'Мастер Гром: «Три дня тишины. {0} Одна короткая тренировка — и серия снова живая.»\n\n🎁 Подарок за возвращение: {1}.', { 0: hook, 1: gift.text });
  return { text, button: tl(l, 'Вернуться'), gift };
}

export function weeklyText(week: number, pct: number | null, vs: 'month' | 'week' | null, l: Lang): string {
  const head = tl(l, '💪 Твоя неделя: {0} повторов.', { 0: week });
  if (pct == null) return `${head}\n${tl(l, 'Через месяц покажу, насколько ты стал сильнее.')}`;
  const than = vs === 'month' ? tl(l, 'чем месяц назад') : tl(l, 'чем неделей раньше');
  if (pct > 0) return `${head}\n${tl(l, 'Это на {0}% больше, {1}. Сила растёт!', { 0: pct, 1: than })}`;
  if (pct === 0) return `${head}\n${tl(l, 'Ровно столько же, {0}. Держишь форму!', { 0: than })}`;
  return `${head}\n${tl(l, 'Это на {0}% меньше, {1}. Неделя отдыха — не беда, начнём новую.', { 0: -pct, 1: than })}`;
}
