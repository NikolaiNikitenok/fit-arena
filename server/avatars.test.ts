import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_FRESH_MS, AVATAR_MISS_MS, AvatarStore } from './avatars';

describe('аватарки', () => {
  it('скачивает один раз, хранит копию, обновляет устаревшую, забывает по просьбе', async () => {
    let now = 1_000_000;
    let calls = 0;
    const dir = mkdtempSync(join(tmpdir(), 'av-'));
    const s = new AvatarStore(dir, async () => (calls++, Buffer.from(`img${calls}`)), () => now);
    expect(String(await s.get('tg:1', 1))).toBe('img1');
    expect(String(await s.get('tg:1', 1))).toBe('img1');
    expect(calls).toBe(1);
    expect(readdirSync(dir)[0]).not.toContain('tg');
    s.forget('tg:1');
    expect(readdirSync(dir)).toHaveLength(0);
    now += AVATAR_FRESH_MS;
    expect(String(await s.get('tg:1', 1))).toBe('img2');
  });

  it('нет фото — не спрашиваем Telegram снова полсуток; без входа Telegram — ничего', async () => {
    let now = 0;
    let calls = 0;
    const s = new AvatarStore(mkdtempSync(join(tmpdir(), 'av-')), async () => (calls++, null), () => now);
    expect(await s.get('tg:2', 2)).toBeNull();
    expect(await s.get('tg:2', 2)).toBeNull();
    expect(calls).toBe(1);
    now += AVATAR_MISS_MS;
    await s.get('tg:2', 2);
    expect(calls).toBe(2);
    expect(await s.get('max:3', null)).toBeNull();
  });
});
