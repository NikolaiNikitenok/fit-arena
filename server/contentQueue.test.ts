import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentQueue } from './contentQueue';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'arena-content-')); dirs.push(dir);
  const dispatch = vi.fn(async (_inputs: Record<string, string>, _workflow: string) => ({ ok: true }));
  const notify = vi.fn(async () => {});
  return { dir, dispatch, notify, queue: new ContentQueue(dir, { dispatch, notify }, 'codex-local') };
}
const inputs = { chat_id: '42', n: '7', topic: 'Отжимания против босса' };
function ready(dir: string, script: object) {
  const name = readdirSync(dir).find((n) => n.endsWith('.queued.json'))!;
  const job = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  writeFileSync(join(dir, name), JSON.stringify({ ...job, script }));
  renameSync(join(dir, name), join(dir, name.replace('.queued.', '.ready.')));
}
describe('local content queue', () => {
  it('keeps offline work durable and submits a prepared draft once', async () => {
    const { dir, queue, dispatch, notify } = setup();
    expect(queue.enqueue('reel.yml', inputs).ok).toBe(true);
    expect(queue.status()).toContain('задания ждут');
    ready(dir, { caption: 'Геймплей', lines: [] });
    await Promise.all([queue.pump(), queue.pump()]); await queue.pump();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [sent, workflow] = dispatch.mock.calls[0];
    expect(workflow).toBe('reel.yml');
    expect(sent.chat_id).toBe('42');
    const payload = JSON.parse(Buffer.from(sent.topic.split(':')[1], 'base64url').toString());
    expect(payload).toEqual({ script: { caption: 'Геймплей', lines: [] }, topic: inputs.topic });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir).some((n) => n.endsWith('.submitted.json'))).toBe(true);
  });
  it('bounds requests and saves the selected provider across restarts', () => {
    const { queue, dir, dispatch, notify } = setup();
    expect(queue.enqueue('other.yml', inputs).ok).toBe(false);
    expect(queue.enqueue('reel.yml', { ...inputs, chat_id: '../outside' }).ok).toBe(false);
    for (let i = 0; i < 12; i++) expect(queue.enqueue('reel.yml', inputs).ok).toBe(true);
    expect(queue.enqueue('reel.yml', inputs).ok).toBe(false);
    queue.setProvider('claude');
    expect(new ContentQueue(dir, { dispatch, notify }).provider).toBe('claude');
  });
  it('does not retry an ambiguous GitHub request after a crash', async () => {
    const { queue, dir, dispatch, notify } = setup(); queue.enqueue('reel.yml', inputs);
    const name = readdirSync(dir).find((n) => n.endsWith('.queued.json'))!;
    renameSync(join(dir, name), join(dir, name.replace('.queued.', '.dispatching.')));
    const restarted = new ContentQueue(dir, { dispatch, notify }); await restarted.pump();
    expect(dispatch).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir).some((n) => n.endsWith('.failed.json'))).toBe(true);
  });
  it('rejects oversized drafts without dispatching', async () => {
    const { queue, dir, dispatch, notify } = setup(); queue.enqueue('reel.yml', inputs);
    ready(dir, { text: 'x'.repeat(36_000) }); await queue.pump();
    expect(dispatch).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledTimes(1);
  });
});
