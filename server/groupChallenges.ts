// Вызов в групповом чате: «кто больше отжиманий за неделю». Игрок добавляет бота в семейный или рабочий чат
// (кнопка в игре → t.me/<бот>?startgroup=gc-pushup) или пишет там /challenge, бот публикует таблицу и
// обновляет её прямо в чате; через 7 дней — итоги и победитель. Участвует тот, кто нажал «Участвовать»
// (бот → игра, POST /api/group/join). Засчитываются повторы упражнения из любого режима игры за эти дни,
// кроме «посчитал сам», и не больше DAY_REPS_MAX в день.
//   GROUPS_FILE — вызовы (по умолчанию group-challenges.json рядом с DATA_FILE)
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type Lang, tl } from '../src/i18n';
import { EXERCISE_LABELS, type RepExercise, REP_EXERCISES } from '../src/repCounter';
import { DAY_REPS_MAX } from './saves';

export const CHALLENGE_DAYS = 7;
// Вызов в одном чате за раз; участников — не больше, чем помещается в таблицу.
export const MEMBERS_MAX = 100;
export const TABLE_TOP = 10;
const DAY = 86_400_000;
const MSK = 3 * 3_600_000;

export interface GroupChallenge {
  id: string;
  chat: number;
  title: string;
  exercise: RepExercise;
  // Местные даты (МСК) первого и последнего дня, включительно.
  from: string;
  to: string;
  endsAt: number;
  by: string;
  lang: Lang;
  members: Record<string, { name: string; at: number }>;
  // Сообщение с таблицей в чате и его последний текст: правим, только когда изменилось.
  msg?: number;
  shown?: string;
  done?: boolean;
}

const mskDate = (t: number) => new Date(t + MSK).toISOString().slice(0, 10);

/** Команда в чате: /challenge [упражнение], /вызов, /start gc-упражнение (бота только что добавили кнопкой). top — показать таблицу. */
export function parseGroupCommand(text: string): { kind: 'create'; exercise: RepExercise } | { kind: 'top' } | null {
  const m = /^\/(start|challenge|вызов|top|таблица)(?:@\w+)?(?:\s+(\S+))?/i.exec(text.trim());
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  if (cmd === 'top' || cmd === 'таблица') return { kind: 'top' };
  const arg = (m[2] ?? '').toLowerCase();
  if (cmd === 'start' && !arg.startsWith('gc-')) return null;
  const word = arg.replace(/^gc-/, '');
  const ex = (REP_EXERCISES as string[]).includes(word) ? (word as RepExercise) : /^(присед|squat)/.test(word) ? 'squat' : /^(пресс|скруч|situp)/.test(word) ? 'situp' : 'pushup';
  return { kind: 'create', exercise: ex };
}

/** Повторы упражнения из копии прогресса за дни вызова: без «посчитал сам», не больше предела в день. */
export function challengeScore(progress: unknown, ex: RepExercise, from: string, to: string): number {
  const p = (progress ?? {}) as { log?: Record<string, { r?: Record<string, unknown> }>; manual?: Record<string, unknown> };
  let s = 0;
  for (const [d, day] of Object.entries(p.log ?? {})) {
    if (d < from || d > to) continue;
    // «Посчитал сам» хранится за день целиком: вычитаем его из упражнения — счёт никогда не завышен.
    const n = Math.floor((Number(day?.r?.[ex]) || 0) - (Number(p.manual?.[d]) || 0));
    s += Math.max(0, Math.min(DAY_REPS_MAX, n));
  }
  return s;
}

export type Row = { id: string; name: string; reps: number };

/** Таблица для чата: топ, остальные одной строкой, срок и как участвовать. */
export function tableText(c: GroupChallenge, rows: Row[], now: number): string {
  const l = c.lang;
  const ex = tl(l, EXERCISE_LABELS[c.exercise]).toLowerCase();
  const sorted = [...rows].sort((a, b) => b.reps - a.reps || a.name.localeCompare(b.name));
  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
  const lines = sorted.slice(0, TABLE_TOP).map((r, i) => `${medal(i)} ${r.name} — ${r.reps}`);
  if (sorted.length > TABLE_TOP) lines.push(tl(l, '…и ещё {0}', { 0: sorted.length - TABLE_TOP }));
  if (c.done) {
    const win = sorted[0];
    const head = win && win.reps > 0 ? tl(l, '🏁 Вызов окончен! Больше всех ({0}) — {1}: {2}. Поздравляем!', { 0: ex, 1: win.name, 2: win.reps }) : tl(l, '🏁 Вызов окончен — в этот раз без победителя.');
    const total = sorted.reduce((s, r) => s + r.reps, 0);
    return `${head}\n\n${lines.join('\n')}\n\n${tl(l, 'Всего чат сделал {0}. Ещё неделю? Напишите /challenge', { 0: total })}`;
  }
  const left = Math.max(0, c.endsAt - now);
  const leftText = left >= DAY ? tl(l, 'осталось {0} дн.', { 0: Math.ceil(left / DAY) }) : tl(l, 'осталось {0} ч', { 0: Math.max(1, Math.ceil(left / 3_600_000)) });
  const head = tl(l, '🏆 Вызов чата: кто больше — {0} — за неделю? ({1})', { 0: ex, 1: leftText });
  const body = lines.length ? lines.join('\n') : tl(l, 'Пока никого. Будь первым!');
  return `${head}\n\n${body}\n\n${tl(l, 'Камера телефона считает повторы в NikitenokArena — засчитывается любой режим игры. Нажми «Участвовать».')}`;
}

export class GroupChallenges {
  private list: GroupChallenge[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.list = JSON.parse(readFileSync(file, 'utf8')) as GroupChallenge[];
    } catch {
      // Файла ещё нет.
    }
  }

  /** Новый вызов в чате. Если в чате уже идёт вызов — возвращаем его (created: false). */
  create(chat: number, title: string, exercise: RepExercise, by: string, byName: string, lang: Lang, now: number): { c: GroupChallenge; created: boolean } {
    const live = this.ofChat(chat);
    if (live) return { c: live, created: false };
    const c: GroupChallenge = {
      id: randomBytes(5).toString('hex'),
      chat,
      title: title.slice(0, 80),
      exercise,
      from: mskDate(now),
      to: mskDate(now + (CHALLENGE_DAYS - 1) * DAY),
      // До конца последнего дня по Москве.
      endsAt: Date.parse(`${mskDate(now + (CHALLENGE_DAYS - 1) * DAY)}T23:59:59Z`) - MSK,
      by,
      lang,
      members: by ? { [by]: { name: byName.slice(0, 40), at: now } } : {},
    };
    this.list.push(c);
    // Старые законченные не храним вечно.
    this.list = this.list.filter((x) => !x.done || now - x.endsAt < 30 * DAY);
    this.save();
    return { c, created: true };
  }

  get(id: string): GroupChallenge | undefined {
    return this.list.find((c) => c.id === id);
  }

  ofChat(chat: number): GroupChallenge | undefined {
    return this.list.find((c) => c.chat === chat && !c.done);
  }

  active(): GroupChallenge[] {
    return this.list.filter((c) => !c.done);
  }

  /** Вступить: null — вызов закончился или мест нет. */
  join(id: string, player: string, name: string, now: number): GroupChallenge | null {
    const c = this.get(id);
    if (!c || c.done || now > c.endsAt) return null;
    if (!c.members[player]) {
      if (Object.keys(c.members).length >= MEMBERS_MAX) return null;
      c.members[player] = { name: name.slice(0, 40) || '?', at: now };
      this.save();
    }
    return c;
  }

  ofPlayer(player: string): GroupChallenge[] {
    return this.list.filter((c) => !c.done && c.members[player]);
  }

  update(c: GroupChallenge, patch: Partial<Pick<GroupChallenge, 'msg' | 'shown' | 'done'>>): void {
    Object.assign(c, patch);
    this.save();
  }

  forget(player: string): void {
    let changed = false;
    for (const c of this.list)
      if (c.members[player]) {
        delete c.members[player];
        changed = true;
      }
    if (changed) this.save();
  }

  flush(): void {
    if (!this.file || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.list));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }
}
