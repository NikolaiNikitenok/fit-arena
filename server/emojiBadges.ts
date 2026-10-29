// Emoji-статус в Telegram: значки достижений игры — набор эмодзи бота (custom emoji). Игрок с полученным
// достижением ставит его значок рядом со своим именем (WebApp.setEmojiStatus, нужен Telegram Premium).
// Набор создаёт админ командой /emoji_setup: бот загружает PNG из server/media/emoji и запоминает номера эмодзи.
//   EMOJI_FILE — где хранить номера (по умолчанию emoji.json рядом с DATA_FILE)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Достижение → обычный эмодзи, к которому Telegram привяжет значок. Порядок = порядок в наборе.
export const EMOJI_BADGES: readonly (readonly [ach: string, emoji: string])[] = [
  ['reps10k', '💪'],
  ['reps50k', '🏆'],
  ['week', '🔥'],
  ['month', '🔥'],
  ['season', '🔥'],
  ['boss30', '💀'],
  ['knyaz', '👑'],
  ['world0', '🗺'],
  ['world1', '🚀'],
  ['world2', '🧟'],
  ['stars200', '⭐'],
  ['legendary', '💎'],
  ['plank180', '🪨'],
  ['raid10', '🚩'],
  ['daily50', '📜'],
];

/** Имя набора: Telegram требует окончание _by_<имя бота>. */
export const badgeSetName = (bot: string) => `arena_badges_by_${bot}`;

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
          title: 'NikitenokArena',
          sticker_type: 'custom_emoji',
          stickers: EMOJI_BADGES.map(([, emoji], i) => ({ sticker: `attach://b${i}`, format: 'static', emoji_list: [emoji] })),
        },
        files,
      );
      if (!made.ok) return `Не вышло создать набор: ${made.description ?? 'ошибка'}`;
      set = await api('getStickerSet', { name });
      if (!set.ok) return `Набор создан, но Telegram его не отдал: ${set.description ?? 'ошибка'}`;
    }
    this.map = idsFromSet(set.result as { stickers?: { custom_emoji_id?: string }[] });
    this.save();
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
