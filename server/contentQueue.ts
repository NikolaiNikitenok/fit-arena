import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Job {
  id: string; workflow: string; inputs: Record<string, string>; createdAt: number;
  script?: object; error?: string;
}
const WORKFLOWS = new Set(['reel.yml', 'carousel.yml', 'talk.yml']);
const PREFIX = '__ARENA_DRAFT_V1__:';
export class ContentQueue {
  private busy = false;
  provider: 'codex-local' | 'claude';
  constructor(private dir: string, private deps: {
    dispatch: (inputs: Record<string, string>, workflow: string) => Promise<{ ok: boolean; error?: string }>;
    notify: (chat: string, text: string) => Promise<unknown>;
  }, provider: 'codex-local' | 'claude' = 'claude') {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.provider = provider;
    try {
      const saved = JSON.parse(readFileSync(join(dir, 'provider.json'), 'utf8')).provider;
      if (saved === 'codex-local' || saved === 'claude') this.provider = saved;
    } catch { /* Use deployment default. */ }
    // A crash after the GitHub request has an ambiguous outcome: never resend and duplicate it.
    for (const name of this.files('dispatching')) {
      const job = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Job;
      job.error = 'Сервер перезапустился при запуске сборки. Проверь GitHub Actions перед повтором.';
      this.write(job, 'error');
      renameSync(join(dir, name), join(dir, `${job.id}.interrupted.json`));
    }
  }
  setProvider(provider: 'codex-local' | 'claude'): void {
    const tmp = join(this.dir, 'provider.tmp');
    writeFileSync(tmp, JSON.stringify({ provider }), { mode: 0o600 });
    renameSync(tmp, join(this.dir, 'provider.json'));
    this.provider = provider;
  }

  enqueue(workflow: string, inputs: Record<string, string>): { ok: boolean; queued?: string; error?: string } {
    if (!WORKFLOWS.has(workflow) || !/^\d{1,20}$/.test(inputs.chat_id) || !/^\d{1,10}$/.test(inputs.n)) return { ok: false, error: 'Invalid content job' };
    if (this.files('queued').length + this.files('working').length >= 12) return { ok: false, error: 'В очереди уже 12 заданий. Дождись готовых.' };
    const id = randomBytes(12).toString('hex');
    const job: Job = { id, workflow, inputs, createdAt: Date.now() };
    this.write(job, 'queued');
    return { ok: true, queued: id.slice(0, 8) };
  }
  private files(state: string): string[] { return readdirSync(this.dir).filter((name) => /^[0-9a-f]{24}\.[a-z]+\.json$/.test(name) && name.endsWith(`.${state}.json`)); }
  private write(job: Job, state: string): void {
    const tmp = join(this.dir, `${job.id}.tmp`);
    writeFileSync(tmp, JSON.stringify(job), { mode: 0o600 });
    renameSync(tmp, join(this.dir, `${job.id}.${state}.json`));
  }
  status(): string {
    let worker = 0;
    try { worker = JSON.parse(readFileSync(join(this.dir, 'worker.json'), 'utf8')).at ?? 0; } catch { /* No worker yet. */ }
    return `Новые сценарии: ${this.provider === 'codex-local' ? 'Codex на компьютере' : 'Claude в GitHub Actions'}.\nКомпьютер: ${Date.now() - worker < 90_000 ? 'обработчик на связи' : 'обработчик не на связи; задания ждут'}.\nВ очереди Codex: ${this.files('queued').length}, сценарий пишется: ${this.files('working').length}.\nСборка файлов: GitHub Actions. Публикация в соцсети не включена.`;
  }
  async pump(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const name of this.files('ready')) {
        const source = join(this.dir, name);
        const job = JSON.parse(readFileSync(source, 'utf8')) as Job;
        renameSync(source, join(this.dir, `${job.id}.dispatching.json`));
        const payload = Buffer.from(JSON.stringify({ script: job.script, topic: job.inputs.topic ?? '' }));
        let result: { ok: boolean; error?: string };
        try {
          result = !job.script || payload.length > 35_000 ? { ok: false, error: 'Invalid prepared script' }
            : await this.deps.dispatch({ ...job.inputs, topic: PREFIX + payload.toString('base64url') }, job.workflow);
        } catch { result = { ok: false, error: 'Ошибка связи с GitHub. Проверь Actions перед повтором.' }; }
        renameSync(join(this.dir, `${job.id}.dispatching.json`), join(this.dir, `${job.id}.${result.ok ? 'submitted' : 'failed'}.json`));
        await this.deps.notify(job.inputs.chat_id, result.ok
          ? `✅ Codex подготовил сценарий и описание. Собираю ${job.workflow === 'carousel.yml' ? 'картинки' : 'видео'} №${job.inputs.n}; файлы придут сюда из GitHub Actions.`
          : `Не удалось передать сценарий в сборку: ${result.error}. Повтори команду в боте.`).catch(() => null);
      }
      for (const name of this.files('error')) {
        const source = join(this.dir, name); const job = JSON.parse(readFileSync(source, 'utf8')) as Job;
        renameSync(source, join(this.dir, `${job.id}.failed.json`));
        await this.deps.notify(job.inputs.chat_id, `Codex не смог подготовить сценарий №${job.inputs.n}: ${String(job.error || 'ошибка генерации').slice(0, 220)}. Повтори команду; лимиты можно проверить в Codex.`).catch(() => null);
      }
    } finally { this.busy = false; }
  }
}
