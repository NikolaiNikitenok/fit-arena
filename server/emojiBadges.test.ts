import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { badgeSetName, EMOJI_BADGES, EmojiBadges, idsFromSet } from './emojiBadges';

describe('значки достижений для emoji-статуса', () => {
  it('у каждого значка есть достижение и картинка', () => {
    for (const [ach] of EMOJI_BADGES) {
      expect(ACHIEVEMENTS.some((a) => a.id === ach)).toBe(true);
      expect(existsSync(join(__dirname, '../public/emoji', `${ach}.png`))).toBe(true);
    }
  });

  it('создаёт набор и запоминает номера эмодзи по порядку', async () => {
    const calls: string[] = [];
    let made = false;
    const stickers = EMOJI_BADGES.map((_, i) => ({ custom_emoji_id: `e${i}` }));
    const api = async (m: string) => (calls.push(m), m === 'getStickerSet' && made ? { ok: true, result: { stickers } } : { ok: false, description: 'STICKERSET_INVALID' });
    const upload = async (m: string, f: Record<string, unknown>) => (calls.push(m), (made = f.name === badgeSetName('ArenaBot')), { ok: true });
    const store = new EmojiBadges(null);
    expect(await store.setup(api, upload, 1, 'ArenaBot', join(__dirname, '../public/emoji'))).toMatch(/готов: 39/);
    expect(calls).toEqual(['getStickerSet', 'createNewStickerSet', 'getStickerSet', 'deleteStickerSet']);
    expect(store.ids().week).toBe('e8');
    expect(idsFromSet({ stickers: [{ custom_emoji_id: 'x' }] })).toEqual({ first: 'x' });
  });
});
