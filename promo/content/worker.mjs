/** Runs locally with saved ChatGPT/Codex auth. Never copies that auth to VPS or GitHub. */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { acquireWorkerLock } from './worker-lock.mjs';

const args = process.argv.slice(2);
const settings = JSON.parse(readFileSync(args[0], 'utf8'));
const root = resolve(settings.repository);
const state = dirname(resolve(args[0]));
const releaseLock = acquireWorkerLock(join(state, 'worker.lock'));
if (!releaseLock) process.exit(0);
process.on('exit', releaseLock);
const context = join(root, 'promo/content/context.mjs');
let stopping = false;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (text) => {
  const line = `${new Date().toISOString()} ${text}`;
  const file = join(state, 'worker.log');
  try { if (statSync(file).size > 5_000_000) renameSync(file, file + '.old'); } catch { /* First log. */ }
  appendFileSync(file, line + '\n');
  console.log(line);
};

function run(command, argv, { input = '', cwd = root, timeout = 300_000 } = {}) {
  return new Promise((ok, fail) => {
    const env = { ...process.env };
    if (command === (settings.codex || 'codex')) {
      delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    }
    const child = spawn(command, argv, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (value) => { out = (out + value.toString()).slice(-500_000); });
    child.stderr.on('data', (value) => { err = (err + value.toString()).slice(-20_000); });
    child.on('error', (error) => { clearTimeout(timer); fail(error); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? ok(out) : fail(new Error((err || out || `process exit ${code}`).slice(-1000))); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}

async function bridge(command, value = {}) {
  const raw = await run(settings.ssh || 'ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=yes', settings.host, 'python3', '/usr/local/sbin/arena-content-queue.py', command], {
    input: JSON.stringify({ worker: settings.worker || 'windows-codex', ...value }), timeout: 25_000,
  });
  return JSON.parse(raw);
}

async function processJob(job) {
  const dir = join(state, 'jobs', job.id); mkdirSync(dir, { recursive: true });
  const kind = job.inputs.kind || '';
  // The loop validator needs to know whether the real render job will fetch an uploaded clip.
  if (kind === 'loop' && job.inputs.clip) writeFileSync(join(dir, 'user.mp4'), '');
  const promptFile = join(dir, 'prompt.txt');
  const schema = join(dir, 'schema.json');
  writeFileSync(schema, JSON.stringify({ type: 'object', properties: { draft: { type: 'string' } }, required: ['draft'], additionalProperties: false }));
  const common = [job.workflow, job.inputs.n, kind, job.inputs.topic || ''];
  await run(process.execPath, [context, 'prompt', ...common, promptFile], { cwd: dir });
  const prompt = readFileSync(promptFile, 'utf8');
  let error = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const answer = join(dir, 'answer.json');
      const instruction = `Ты редактор и сценарист NikitenokArena. Не вызывай инструменты и не выполняй команды: всё нужное ниже.\n${prompt}\n\nФинальный ответ строго по заданной JSON-схеме: поле draft — строка, содержащая сериализованный JSON-сценарий целиком.\n${error ? `Исправь ошибку предыдущего варианта: ${error}` : ''}`;
      await run(settings.codex || 'codex', ['exec', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only',
        '--skip-git-repo-check', '--color', 'never', '--output-schema', schema, '-o', answer, '-'], { input: instruction, cwd: dir, timeout: 240_000 });
      const data = JSON.parse(readFileSync(answer, 'utf8'));
      const candidate = join(dir, 'candidate.json'); writeFileSync(candidate, data.draft);
      const finished = join(dir, 'script.json');
      await run(process.execPath, [context, 'validate', ...common, candidate, finished], { cwd: dir });
      const script = JSON.parse(readFileSync(finished, 'utf8'));
      await bridge('complete', { id: job.id, lease: job.lease, script });
      log(`completed ${job.id.slice(0, 8)} (${job.workflow})`);
      return;
    } catch (e) { error = String(e.message).slice(-800); log(`attempt ${attempt} failed for ${job.id.slice(0, 8)}`); }
  }
  // Provider stderr can contain local paths or account details; never send it to Telegram.
  await bridge('fail', { id: job.id, lease: job.lease, error: 'Три попытки генерации не прошли. Проверь вход ChatGPT и доступные лимиты Codex на компьютере' });
}

const heartbeat = setInterval(() => bridge('heartbeat').catch(() => {}), 30_000);
heartbeat.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; });
log('content worker started; ChatGPT auth stays local');
while (!stopping) {
  try {
    const { job } = await bridge('claim');
    if (job) {
      log(`claimed ${job.id.slice(0, 8)} (${job.workflow})`);
      try { await processJob(job); }
      catch {
        log(`job setup or delivery failed for ${job.id.slice(0, 8)}`);
        await bridge('fail', { id: job.id, lease: job.lease, error: 'Не удалось подготовить задание на компьютере. Проверь настройки обработчика' });
      }
      if (args.includes('--once')) break;
      continue;
    }
  } catch (error) { log(`worker unavailable: ${String(error.message).slice(-200)}`); }
  if (args.includes('--once')) break;
  await sleep(Number(settings.pollSeconds || 15) * 1000);
}
clearInterval(heartbeat);
