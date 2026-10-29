// Emoji-статус в Telegram: значки достижений игры — набор эмодзи бота (custom emoji). Игрок с полученным
// достижением ставит его значок рядом со своим именем (WebApp.setEmojiStatus, нужен Telegram Premium).
// Набор создаёт админ командой /emoji_setup: бот загружает PNG из public/emoji и запоминает номера эмодзи.
//   EMOJI_FILE — где хранить номера (по умолчанию emoji.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Достижение → обычный эмодзи: он нарисован в центре значка, и к нему Telegram привяжет значок. Порядок = порядок в наборе.
// Картинки — public/emoji/<достижение>.png (их же игра показывает в подсказке); перерисовать — scripts/emoji-badges.cjs.
export const EMOJI_BADGES: readonly (readonly [ach: string, emoji: string])[] = [
  ['first', '👣'],
  ['reps500', '💪'],
  ['reps2k', '🏋️'],
  ['reps10k', '🦾'],
  ['reps50k', '🏆'],
  ['day100', '⚡'],
  ['day300', '🏃'],
  ['day600', '🌪️'],
  ['week', '🔥'],
  ['month', '🌋'],
  ['season', '🛡️'],
  ['boss1', '👹'],
  ['boss10', '🏹'],
  ['boss30', '💀'],
  ['stars50', '⭐'],
  ['stars200', '🌟'],
  ['world0', '🏰'],
  ['world1', '🚀'],
  ['world2', '🧟'],
  ['knyaz', '👑'],
  ['arms', '🥊'],
  ['legs', '🦵'],
  ['core', '🍫'],
  ['daily10', '🤝'],
  ['daily50', '📜'],
  ['raid', '🚩'],
  ['raid10', '🐉'],
  ['legendary', '💎'],
  ['plank60', '🧱'],
  ['plank180', '🪨'],
  ['dungeon10', '🕯️'],
  ['dungeonBoss', '🗝️'],
  ['combo6', '💥'],
  ['prog-newbie14', '🌱'],
  ['prog-pushup100', '💯'],
  ['prog-abs21', '🔩'],
  ['prog-legs28', '🐻'],
  ['prog-plank5', '🗿'],
  ['prog-full4w', '⛈️'],
];

/** Название набора: его видит каждый, кто нажал на значок у чужого имени, — сразу с ботом игры. */
export const badgeSetTitle = (bot: string) => `NikitenokArena — @${bot}`.slice(0, 64);

/** Версия рисунков: поменялись значки — новая версия, /emoji_setup создаст новый набор и удалит прежний. */
const VERSION = 2;

/** Имя набора: Telegram требует окончание _by_<имя бота>. */
export const badgeSetName = (bot: string, v = VERSION) => `arena_badges${v > 1 ? v : ''}_by_${bot}`;

type Api = (method: string, params: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; description?: string }>;
type Upload = (method: string, fields: Record<string, unknown>, files: { field: string; name: string; type: string; data: Buffer }[]) => Promise<{ ok: boolean; result?: unknown; description?: string }>;

/** Номера эмодзи из набора: стикеры идут в порядке EMOJI_BADGES. */
export function idsFromSet(set: { stickers?: { custom_emoji_id?: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  (set.stickers ?? []).forEach((s, i) => {
    const ach = EMOJI_BADGES[i]?.[0];
    if (ach && s.custom_emoji_id) out[ach] = s.custom_emoji_id;
  });
  return out;
}

export class EmojiBadges {
  private map: Record<string, string> = {};

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.map = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    } catch {
      // Набора ещё нет.
    }
  }

  /** Достижение → номер эмодзи (пусто, пока админ не создал набор). */
  ids(): Record<string, string> {
    return this.map;
  }

  /**
   * Создать набор (если его ещё нет) и запомнить номера. owner — Telegram ID админа: набор принадлежит ему.
   * Возвращает текст для админа.
   */
  async setup(api: Api, upload: Upload, owner: number, bot: string, dir: string): Promise<string> {
    const name = badgeSetName(bot);
    let set = await api('getStickerSet', { name });
    if (!set.ok) {
      const files = EMOJI_BADGES.map(([ach], i) => ({ field: `b${i}`, name: `${ach}.png`, type: 'image/png', data: readFileSync(join(dir, `${ach}.png`)) }));
      const made = await upload(
        'createNewStickerSet',
        {
          user_id: owner,
          name,
          title: badgeSetTitle(bot),
          sticker_type: 'custom_emoji',
          stickers: EMOJI_BADGES.map(([, emoji], i) => ({ sticker: `attach://b${i}`, format: 'static', emoji_list: [emoji] })),
        },
        files,
      );
      if (!made.ok) return `Не вышло создать набор: ${made.description ?? 'ошибка'}`;
      set = await api('getStickerSet', { name });
      if (!set.ok) return `Набор создан, но Telegram его не отдал: ${set.description ?? 'ошибка'}`;
    }
    const got = set.result as { title?: string; stickers?: { custom_emoji_id?: string }[] };
    // Набор создан раньше с другим названием — переименовываем.
    if (got.title !== badgeSetTitle(bot)) await api('setStickerSetTitle', { name, title: badgeSetTitle(bot) });
    this.map = idsFromSet(got);
    this.save();
    // Прежние наборы больше не нужны: игроки получают номера из нового.
    for (let v = 1; v < VERSION; v++) await api('deleteStickerSet', { name: badgeSetName(bot, v) }).catch(() => undefined);
    return `Набор эмодзи готов: ${Object.keys(this.map).length} значков. https://t.me/addemoji/${name}`;
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.map));
    renameSync(tmp, this.file);
  }
}
