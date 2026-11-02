// Персонажи пишут в ленту, чтобы она жила даже при паре десятков игроков (решение владельца, 2026-11-02):
//   09:00 МСК — Мастер Гром: итоги вчерашнего дня на Арене (сколько бойцов, повторов, кто больше всех);
//   13:00 — совет от Гром / бабушки Марфы / Лисы по очереди: пишет Claude (как посты канала), без него — из запаса;
//   19:00 — Лиса: вечернее задание («30 приседаний до полуночи — ставь 💪, если сделал»).
// Слот, пропущенный больше чем на 2 часа (сервер лежал), не наверстываем. Состояние — npc-feed.json рядом с данными.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NpcId, PostCardData } from '../shared/social';

const HOUR = 3_600_000;
const MSK = 3 * HOUR;
const LATE = 2 * HOUR;
export const NPC_SLOTS = [
  { hour: 9, kind: 'daily' },
  { hour: 13, kind: 'tip' },
  { hour: 19, kind: 'task' },
] as const;
export type NpcSlotKind = (typeof NPC_SLOTS)[number]['kind'];

export const NPC_NAMES: Record<NpcId, string> = { grom: 'Мастер Гром', marfa: 'Бабушка Марфа', lisa: 'Лиса' };
const TIP_ORDER: NpcId[] = ['grom', 'marfa', 'lisa'];

export interface Yesterday {
  players: number;
  reps: number;
  top: { name: string; reps: number }[];
}

export interface NpcPost {
  npc: NpcId;
  text: string;
  card?: PostCardData;
}

interface State {
  done: string[];
  topics: string[];
  tipTurn: number;
}

export interface NpcFeedDeps {
  now: () => number;
  yesterday: (date: string) => Yesterday;
  post: (p: NpcPost) => void;
  // Совет через Claude (как посты канала); бросает ошибку — берём из запаса.
  write?: (system: string, prompt: string) => Promise<{ topic?: string; text?: string }>;
  log?: (msg: string) => void;
}

const mskDate = (t: number) => new Date(t + MSK).toISOString().slice(0, 10);

/** Какой слот пора писать: «2026-11-02 09», или null. */
export function dueNpcSlot(now: number, done: readonly string[]): { key: string; kind: NpcSlotKind } | null {
  const d = new Date(now + MSK);
  for (const s of [...NPC_SLOTS].reverse()) {
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), s.hour) - MSK;
    if (now < at) continue;
    if (now - at > LATE) return null;
    const key = `${mskDate(now)} ${String(s.hour).padStart(2, '0')}`;
    return done.includes(key) ? null : { key, kind: s.kind };
  }
  return null;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10;
  const b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

/** Утренний пост Грома: итоги вчера. seed — чтобы фразы чередовались. */
export function dailyPost(y: Yesterday, seed: number): NpcPost {
  if (y.players === 0 || y.reps === 0) {
    const quiet = [
      'Вчера на Арене было тихо. Значит, сегодня у каждого есть шанс стать первым. Кто начнёт?',
      'Вчера никто не вышел на Арену. Я не сержусь — я жду. Десять приседаний, и день уже твой.',
    ];
    return { npc: 'grom', text: quiet[seed % quiet.length], card: { kind: 'daily', title: 'Вчера на Арене', value: '0 повторов', sub: 'Сегодня можно всё исправить' } };
  }
  const who = `${y.players} ${plural(y.players, 'боец', 'бойца', 'бойцов')}`;
  const reps = `${y.reps.toLocaleString('ru-RU')} ${plural(y.reps, 'повтор', 'повтора', 'повторов')}`;
  const [first, ...rest] = y.top;
  const best = first ? ` Больше всех — ${first.name}: ${first.reps}.${rest.length ? ` Следом ${rest.map((r) => r.name).join(' и ')}.` : ''}` : '';
  const tails = ['Сегодня жду вас снова. Кто обгонит лидера?', 'Горжусь. Сегодня — ещё на один повтор больше.', 'Так держать. Сегодняшний день ещё никем не занят.', 'Лидер, береги корону: за ней уже идут.'];
  return {
    npc: 'grom',
    text: `Вчера на Арене тренировались ${who} и сделали ${reps}.${best} ${tails[seed % tails.length]}`,
    card: { kind: 'daily', title: 'Вчера на Арене', value: reps, sub: first ? `🥇 ${first.name} — ${first.reps}` : who },
  };
}

const TASKS: [string, number][] = [
  ['приседаний', 30],
  ['отжиманий', 15],
  ['скручиваний на пресс', 25],
  ['приседаний', 50],
  ['отжиманий', 25],
  ['секунд планки', 60],
  ['скручиваний на пресс', 40],
];

/** Вечернее задание Лисы. */
export function taskPost(seed: number): NpcPost {
  const [what, n] = TASKS[seed % TASKS.length];
  const lines = [
    `Вечернее задание от Лисы: ${n} ${what} до полуночи. Сделал — ставь 💪 под этим постом, я всё вижу.`,
    `Спорим, ты не сделаешь ${n} ${what} до конца дня? Докажи — и отметься 💪.`,
    `Хитрость дня: ${n} ${what} перед сном, и утром ты сильнее, чем вчера. Отметься 💪, когда сделаешь.`,
  ];
  return { npc: 'lisa', text: lines[seed % lines.length], card: { kind: 'task', title: 'Задание вечера', value: `${n} ${what}`, sub: 'до полуночи' } };
}

// Запас советов на случай, если Claude недоступен.
export const TIP_POOL: Record<NpcId, string[]> = {
  grom: [
    'Медленный повтор честнее быстрого. Опускайся на три счёта — и мышцы скажут спасибо.',
    'Сила растёт не на тренировке, а между ними. Спи восемь часов — это тоже часть плана.',
    'Не жди настроения. Начни с пяти приседаний — настроение догонит.',
    'Отжимания с колен — не слабость, а ступенька. Каждый чемпион с неё начинал.',
    'Дыши правильно: вдох — вниз, выдох — с усилием вверх. Так и тяжёлый подход проходит легче.',
    'Лучшая тренировка — та, которую ты сделал, а не идеальная, которую отложил.',
  ],
  marfa: [
    'Внучек, водички попей перед тренировкой. Стакан воды — и силы сразу больше.',
    'После подхода не садись сразу — походи минутку, пусть сердечко успокоится.',
    'Каша утром — лучший друг богатыря. И белка не забудь: творожок, яичко.',
    'Колени береги: при приседе они смотрят туда же, куда носки. Так до ста лет приседать будешь.',
    'Устал — отдохни денёк, бабушка разрешает. Но завтра — обратно на Арену!',
    'Разомнись перед делом: покрути плечами, шеей, коленями. Тело любит, когда его будят ласково.',
  ],
  lisa: [
    'Секрет: делай подход во время рекламы или пока греется чайник. Никто и не заметит, а ты сильнее.',
    'Хочешь обогнать друга? Добавляй по одному повтору в день. Через месяц он тебя не узнает.',
    'Планка кажется вечной? Считай не секунды, а вдохи. Двадцать вдохов — и готово.',
    'Позови соперника в дуэль. Злость на проигрыш — отличное топливо.',
    'Хитрый приём: ставь телефон чуть дальше, чтобы камера видела тебя целиком, — повторы засчитаются точнее.',
    'Скучно? Поменяй упражнение. Мышцам нравятся сюрпризы не меньше, чем мне.',
  ],
};

const PERSONA: Record<NpcId, string> = {
  grom: 'Мастер Гром — строгий, но тёплый наставник героев, бывший чемпион Арены. Говорит коротко и по делу, верит в каждого ученика.',
  marfa: 'Бабушка Марфа — заботливая бабушка из деревни. Советует про воду, сон, еду, отдых и бережную технику, обращается «внучек», «внученька», немного ворчит, но с любовью.',
  lisa: 'Лиса — хитрая и озорная, подначивает и бросает вызовы, знает лайфхаки как втиснуть тренировку в обычный день.',
};

export const TIP_SYSTEM =
  'Ты пишешь короткие посты в ленту фитнес-игры NikitenokArena (Telegram Mini App: приседания, отжимания, пресс и планка перед камерой телефона) от лица персонажа игры. ' +
  'Пиши по-русски, живым разговорным языком, от первого лица персонажа. Один полезный совет или мысль о тренировках, сне, воде, привычках или технике. ' +
  'Без медицинских обещаний и диет, без ссылок, хэштегов и эмодзи-гирлянд (не больше одного эмодзи). До 280 знаков.';

export function tipPrompt(npc: NpcId, recent: string[]): string {
  return [
    `Персонаж: ${PERSONA[npc]}`,
    recent.length ? `Недавние темы (не повторяй): ${recent.slice(-12).join('; ')}.` : '',
    'Ответь JSON: {"topic": "тема в 2–4 слова", "text": "текст поста", "mentions_app": false, "images": []}.',
  ]
    .filter(Boolean)
    .join('\n');
}

export class NpcFeed {
  private state: State = { done: [], topics: [], tipTurn: 0 };
  private busy = false;

  constructor(
    private readonly file: string | null,
    private readonly d: NpcFeedDeps,
  ) {
    if (!file) return;
    try {
      this.state = { ...this.state, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<State>) };
    } catch {
      // Файла ещё нет.
    }
  }

  /** Раз в несколько минут: написать пост, если пришло время. */
  async tick(): Promise<void> {
    if (this.busy) return;
    const now = this.d.now();
    const slot = dueNpcSlot(now, this.state.done);
    if (!slot) return;
    this.busy = true;
    try {
      // Отмечаем сразу: если запись упадёт, второй раз в тот же слот не пишем.
      this.state.done = [...this.state.done.slice(-20), slot.key];
      this.save();
      await this.write(slot.kind, now);
    } finally {
      this.busy = false;
    }
  }

  /** Написать пост вида kind сейчас (и по команде админа). */
  async write(kind: NpcSlotKind, now = this.d.now()): Promise<NpcPost> {
    const seed = Math.floor(now / 86_400_000);
    let p: NpcPost;
    if (kind === 'daily') p = dailyPost(this.d.yesterday(mskDate(now - 86_400_000)), seed);
    else if (kind === 'task') p = taskPost(seed);
    else p = await this.tip(seed);
    this.d.post(p);
    return p;
  }

  private async tip(seed: number): Promise<NpcPost> {
    const npc = TIP_ORDER[this.state.tipTurn % TIP_ORDER.length];
    this.state.tipTurn++;
    this.save();
    if (this.d.write) {
      try {
        const out = await this.d.write(TIP_SYSTEM, tipPrompt(npc, this.state.topics));
        const text = String(out.text ?? '').trim();
        if (text.length >= 20 && text.length <= 500 && !/https?:|t\.me\//i.test(text)) {
          this.state.topics = [...this.state.topics.slice(-30), String(out.topic ?? '').slice(0, 40)];
          this.save();
          return { npc, text };
        }
      } catch (e) {
        this.d.log?.(`npc feed: Claude не написал совет (${(e as Error).message}), берём из запаса`);
      }
    }
    const pool = TIP_POOL[npc];
    return { npc, text: pool[(seed + this.state.tipTurn) % pool.length] };
  }

  private save(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      // Нет места или прав — не страшно, в худшем случае слот повторится.
    }
  }
}
