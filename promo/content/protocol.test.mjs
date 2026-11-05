import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeDraft, preparedDraft, DRAFT_PREFIX } from './protocol.mjs';
import { pick } from '../talk/generate.mjs';
import { SHOTS } from '../carousel/generate.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const reel = { hook: { top: 'Бей босса', accent: 'отжиманиями' },
  lines: ['boss', 'climb', 'duel', 'win', null].map((clip, i) => ({
    say: i === 4 ? 'Никитёнок Арена в Телеграме ссылка в профиле' : 'Каждый твой повтор это удар по врагу',
    text: 'Каждый повтор — удар', clips: clip ? [clip] : [],
  })), end: 'Перешли другу', caption: 'Отжимания в игре', hashtags: ['#фитнес', '#игра'], music: 'hype' };
const { host, guest } = pick(0);
const talk = { ...reel, lines: ['boss', 'climb', 'duel', 'win', 'raid', 'cta'].map((clip, i) => ({
  who: i % 2 ? guest : host, say: i === 5 ? 'Никитёнок Арена в Телеграме ссылка в профиле' : 'Каждый твой повтор это удар по врагу',
  subs: ['Каждый повтор — удар'], clip, layout: i === 5 ? 'corner' : 'vlog', gesture: 'explain',
})) };
const shotIds = Object.keys(SHOTS);
const carousel = { caption: 'Игра в Telegram', hashtags: ['#игра'], slides: [
  { type: 'cover', top: 'Тренировка', accent: 'как игра' },
  ...shotIds.slice(0, 4).map((shot) => ({ type: 'point', title: 'Твой повтор', text: 'Удар по врагу', shot })),
  { type: 'cta', title: 'NikitenokArena', text: 'Ссылка в профиле' },
] };
const npc = 'grom';
const story = { title: 'Проверь себя', stories: ['challenge', 'poll', 'quiz'].map((format) => ({
  format, label: 'Твой ход', top: 'Проверь себя', accent: 'в игре', text: 'Сделай комфортный подход', npc,
  sticker: { type: 'quiz', text: 'Что выберешь?', options: ['Дуэль', 'Босс'], answer: 0 },
})) };
const loop = { hook: reel.hook, ask: 'Кто победит?', anchor: 'boss', middle: ['duel', 'win'],
  caption: reel.caption, hashtags: reel.hashtags, music: 'hype' };

describe('prepared Codex drafts', () => {
  it('roundtrips Unicode as data and rejects invalid envelopes', () => {
    expect(preparedDraft(encodeDraft(reel, 'Хук'))).toEqual({ script: reel, topic: 'Хук' });
    expect(preparedDraft('обычная тема')).toBeNull();
    expect(() => preparedDraft(DRAFT_PREFIX + 'bad')).toThrow();
    expect(() => encodeDraft({ value: 'x'.repeat(36_000) }, '')).toThrow();
  });
  for (const [name, relative, args, script, output] of [
    ['reel', '../reels/generate.mjs', ['0'], reel, 'script.json'],
    ['loop', '../reels/loop/generate.mjs', ['0'], loop, 'script.json'],
    ['talk', '../talk/generate.mjs', ['0'], talk, 'script.json'],
    ['carousel', '../carousel/generate.mjs', ['0', 'app'], carousel, 'carousel.json'],
    ['story', '../carousel/generate.mjs', ['0', 'story'], story, 'carousel.json'],
  ]) it(`renders the ${name} generator input without any model credentials`, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'arena-draft-'));
    try {
      const env = { ...process.env, ANTHROPIC_API_KEY: '', CLAUDE_CODE_OAUTH_TOKEN: '' };
      const run = spawnSync(process.execPath, [join(dir, relative), ...args, encodeDraft(script, 'Проверка')], { cwd, env, encoding: 'utf8', timeout: 10_000 });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      const result = JSON.parse(readFileSync(join(cwd, output), 'utf8'));
      expect(result.provider).toBe('codex-local'); expect(result.topic).toBe('Проверка');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
