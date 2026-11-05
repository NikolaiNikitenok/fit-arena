import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import { PostQueue } from './postQueue';
import { Channel, type ChannelDeps, writePost } from './channel';
import { PersonalChannel } from './personalChannel';

const dirs: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), 'arena-post-')); dirs.push(dir); return { dir, queue: new PostQueue(dir) }; }
const draft = { topic: 'Тема', text: '<b>Текст</b>', mentions_app: false, images: [] };
function finish(dir: string, state: string, data: object) {
  const name = readdirSync(dir).find(n => n.endsWith('.queued.json'))!;
  const job = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  writeFileSync(join(dir, name), JSON.stringify({ ...job, ...data }));
  renameSync(join(dir, name), join(dir, name.replace('.queued.', `.${state}.`)));
}
describe('Codex channel posts', () => {
  it('returns a worker draft once and keeps prompts intact', async () => {
    vi.useFakeTimers(); const { dir, queue } = setup();
    const result = queue.generate('личный стиль', 'фраза автора');
    const job = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8'));
    expect(job).toMatchObject({ workflow: 'post.json', system: 'личный стиль', prompt: 'фраза автора' });
    finish(dir, 'ready', { script: draft });
    await vi.advanceTimersByTimeAsync(500);
    expect(JSON.parse(await result)).toEqual(draft);
    expect(readdirSync(dir).some(n => n.endsWith('.consumed.json'))).toBe(true);
  });
  it('cancels offline requests on timeout and cancels orphaned jobs on restart', async () => {
    vi.useFakeTimers(); const { dir, queue } = setup();
    const result = expect(queue.generate('s', 'p', 100)).rejects.toThrow('Codex');
    await vi.advanceTimersByTimeAsync(500); await result;
    expect(readdirSync(dir).some(n => n.endsWith('.cancelled.json'))).toBe(true);
    writeFileSync(join(dir, 'a'.repeat(24) + '.working.json'), '{}');
    new PostQueue(dir);
    expect(readdirSync(dir).some(n => n.endsWith('.working.json'))).toBe(false);
  });
  it('rejects worker errors and malformed drafts', async () => {
    vi.useFakeTimers(); const { dir, queue } = setup();
    for (const [state, data, message] of [['error', { error: 'limit' }, 'limit'], ['ready', { script: {} }, 'Некорректный']] as const) {
      const result = expect(queue.generate('s', 'p')).rejects.toThrow(message);
      finish(dir, state, data); await vi.advanceTimersByTimeAsync(500); await result;
    }
  });
  it('uses Codex for both channels without credentials or fallback, retaining personal approval', async () => {
    const claudeCode = vi.fn(); const bot = vi.fn(async (_method: string, _body: unknown) => ({ ok: true, result: { message_id: 1 } }));
    const generateText = vi.fn(async () => JSON.stringify(draft));
    const deps: ChannelDeps = { apiKey: () => '', claudeCode, generateText, channel: '@test', bot,
      agent: () => new https.Agent(), changelog: () => '', appLink: () => '' };
    expect((await new Channel(null, deps).draft()).topic).toBe(draft.topic);
    const personal = new PersonalChannel(null, { ...deps, approvers: () => [42], stats: () => '' });
    personal.tick(Date.parse('2026-11-05T20:01:00+03:00'));
    await new Promise(done => setTimeout(done, 20));
    expect(bot.mock.calls.length).toBeGreaterThan(0);
    expect(personal.state.posts).toHaveLength(0);
    await personal.propose('2026-11-05 20', Date.parse('2026-11-05T20:01:00+03:00'), 'Моя тема');
    expect(personal.state.pending?.draft.topic).toBe(draft.topic);
    expect(bot.mock.calls.every(([, body]) => (body as { chat_id?: unknown }).chat_id !== '@test')).toBe(true);
    expect(personal.state.posts).toHaveLength(0);
    generateText.mockRejectedValueOnce(new Error('offline'));
    await expect(writePost({ ...deps, apiKey: () => 'test', claudeToken: () => 'test' }, 's', 'p')).rejects.toThrow('offline');
    expect(claudeCode).not.toHaveBeenCalled();
  });
});
