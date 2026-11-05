import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The worker only writes drafts. Existing channel code owns approval and publication. */
export class PostQueue {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Requests belong to the previous server process: never deliver them after restart.
    for (const name of readdirSync(dir)) {
      if (/^[a-f0-9]{24}\.(queued|working|ready|error)\.json$/.test(name)) {
        renameSync(join(dir, name), join(dir, name.replace(/\.[a-z]+\.json$/, '.cancelled.json')));
      }
    }
  }
  async generate(system: string, prompt: string, timeoutMs = 20 * 60_000): Promise<string> {
    if (readdirSync(this.dir).filter(n => /\.(queued|working)\.json$/.test(n)).length >= 12) throw new Error('Очередь постов Codex заполнена');
    const id = randomBytes(12).toString('hex');
    const expiresAt = Date.now() + timeoutMs;
    const tmp = join(this.dir, id + '.tmp');
    writeFileSync(tmp, JSON.stringify({ id, workflow: 'post.json', inputs: {}, system, prompt, createdAt: Date.now(), expiresAt }), { mode: 0o600 });
    renameSync(tmp, join(this.dir, id + '.queued.json'));
    try {
      while (Date.now() < expiresAt) {
        for (const state of ['ready', 'error']) {
          const path = join(this.dir, `${id}.${state}.json`);
          if (!existsSync(path)) continue;
          const job = JSON.parse(readFileSync(path, 'utf8'));
          renameSync(path, join(this.dir, id + '.consumed.json'));
          if (state === 'error') throw new Error(job.error || 'Ошибка генерации Codex');
          const draft = job.script;
          if (!draft || typeof draft.text !== 'string' || !draft.text.trim() || typeof draft.topic !== 'string' || !draft.topic.trim()
            || typeof draft.mentions_app !== 'boolean' || !Array.isArray(draft.images) || !draft.images.every((v: unknown) => typeof v === 'string')) throw new Error('Некорректный черновик Codex');
          return JSON.stringify(draft);
        }
        await new Promise(done => setTimeout(done, 500));
      }
      throw new Error('Codex не подготовил пост за 20 минут. Проверь компьютер и вход ChatGPT');
    } finally {
      for (const state of ['queued', 'working', 'ready', 'error']) {
        const path = join(this.dir, `${id}.${state}.json`);
        try { renameSync(path, join(this.dir, id + '.cancelled.json')); } catch { /* Worker may be transitioning the file. */ }
      }
    }
  }
}
