// Посты канала через подписку Claude: сервер запускает Claude Code (`claude -p`) с токеном из `claude setup-token`.
// Claude Code не умеет SOCKS, поэтому для него поднимаем на 127.0.0.1 маленький HTTP-прокси (CONNECT),
// который ведёт соединения через тот же SOCKS5, что и бот (TG_PROXY).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';

/** Соединение до host:port через SOCKS5 без пароля. */
export function socksConnect(proxy: URL, host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(proxy.port || 1080), proxy.hostname);
    let buf = Buffer.alloc(0);
    let step = 0;
    const fail = (e: Error) => (sock.destroy(), reject(e));
    sock.once('error', fail);
    sock.once('connect', () => sock.write(Buffer.from([5, 1, 0])));
    sock.on('data', function onData(d: Buffer) {
      buf = Buffer.concat([buf, d]);
      if (step === 0 && buf.length >= 2) {
        if (buf[1] !== 0) return fail(new Error('SOCKS: нужен вход без пароля'));
        buf = buf.subarray(2);
        step = 1;
        const name = Buffer.from(host);
        sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])]));
      }
      if (step === 1 && buf.length >= 10) {
        sock.removeListener('data', onData);
        sock.removeListener('error', fail);
        if (buf[1] !== 0) return fail(new Error(`SOCKS: отказ ${buf[1]}`));
        // Хвост после ответа (если сервер уже что-то прислал) возвращаем в поток.
        const len = buf[3] === 1 ? 10 : buf[3] === 4 ? 22 : 7 + buf[4];
        if (buf.length > len) sock.unshift(buf.subarray(len));
        resolve(sock);
      }
    });
  });
}

let bridge: Promise<number> | null = null;
/** HTTP-прокси на 127.0.0.1 поверх SOCKS5: только CONNECT, только для своих процессов. Возвращает порт. */
export function httpBridge(socks: string): Promise<number> {
  if (bridge) return bridge;
  const proxy = new URL(socks);
  bridge = new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      let head = Buffer.alloc(0);
      client.on('error', () => client.destroy());
      client.on('data', function onData(d: Buffer) {
        head = Buffer.concat([head, d]);
        const end = head.indexOf('\r\n\r\n');
        if (end < 0) return void (head.length > 8192 && client.destroy());
        client.removeListener('data', onData);
        const m = /^CONNECT ([^\s:]+):(\d+) HTTP\/1\.[01]/.exec(head.toString('latin1'));
        if (!m) return void client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
        socksConnect(proxy, m[1], Number(m[2]))
          .then((up) => {
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const rest = head.subarray(end + 4);
            if (rest.length) up.write(rest);
            up.on('error', () => client.destroy());
            client.on('close', () => up.destroy());
            up.pipe(client).pipe(up);
          })
          .catch(() => client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
      });
    });
    server.once('error', (e) => ((bridge = null), reject(e)));
    server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
    server.unref();
  });
  return bridge;
}

/** Где искать claude: CLAUDE_BIN, потом обычные места установки (npm -g и установщик). */
export function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  for (const p of ['/usr/local/bin/claude', '/usr/bin/claude', '/root/.local/bin/claude', `${process.env.HOME ?? ''}/.local/bin/claude`]) if (existsSync(p)) return p;
  return 'claude';
}

/** Адрес прокси для Claude Code: HTTP-прокси как есть, SOCKS — через мост. */
export async function proxyFor(url: string): Promise<string | null> {
  if (!url) return null;
  return url.startsWith('socks') ? `http://127.0.0.1:${await httpBridge(url)}` : url;
}

export interface ClaudeCodeRun {
  token: string;
  system: string;
  prompt: string;
  // Пустая папка: там Claude Code хранит настройки, и в ней нет чужих CLAUDE.md.
  dir: string;
  proxy: string;
  model?: string;
  timeoutMs?: number;
}

/** Один запрос без инструментов. Возвращает текст ответа. */
export async function runClaudeCode(o: ClaudeCodeRun): Promise<string> {
  mkdirSync(o.dir, { recursive: true });
  const proxy = await proxyFor(o.proxy);
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: o.dir,
    CLAUDE_CONFIG_DIR: o.dir,
    CLAUDE_CODE_OAUTH_TOKEN: o.token,
    DISABLE_TELEMETRY: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...(proxy ? { HTTPS_PROXY: proxy } : {}),
  };
  const args = ['-p', '--output-format', 'json', '--model', o.model ?? 'opus', '--tools', '', '--no-session-persistence', '--max-turns', '3', '--system-prompt', o.system];
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin(), args, { cwd: o.dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), o.timeoutMs ?? 5 * 60_000);
    child.stdout.on('data', (d: Buffer) => (out += d));
    child.stderr.on('data', (d: Buffer) => (err += d));
    child.on('error', (e: NodeJS.ErrnoException) => (clearTimeout(timer), reject(new Error(e.code === 'ENOENT' ? 'Claude Code не установлен на сервере' : e.message))));
    child.on('close', (code) => {
      clearTimeout(timer);
      let res: { is_error?: boolean; result?: string; subtype?: string } = {};
      try {
        res = JSON.parse(out);
      } catch {
        /* ниже — ошибка */
      }
      if (code === 0 && !res.is_error && res.result) return resolve(res.result);
      // В ответе может оказаться токен — режем его из текста ошибки.
      const why = (res.result || err || out || `код ${code}`).replace(o.token, '***').trim().slice(0, 300);
      reject(new Error(`Claude Code: ${why}`));
    });
    child.stdin.end(o.prompt);
  });
}
