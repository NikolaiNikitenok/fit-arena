import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { httpBridge, runClaudeCode } from './claudeCode';

const listen = (s: net.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as net.AddressInfo).port)));

describe('Claude Code для канала', () => {
  afterEach(() => delete process.env.CLAUDE_BIN);

  it('HTTP-мост ведёт CONNECT через SOCKS5', async () => {
    // Цель: эхо-сервер. SOCKS5: принимает «без пароля» и соединяет с целью.
    const echo = net.createServer((c) => c.pipe(c));
    const echoPort = await listen(echo);
    let asked = '';
    const socks = net.createServer((c) => {
      c.once('data', () => {
        c.write(Buffer.from([5, 0]));
        c.once('data', (req: Buffer) => {
          asked = `${req.subarray(5, 5 + req[4]).toString()}:${req.readUInt16BE(5 + req[4])}`;
          const up = net.connect(echoPort, '127.0.0.1', () => {
            c.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            c.pipe(up).pipe(c);
          });
        });
      });
    });
    const socksPort = await listen(socks);
    const port = await httpBridge(`socks5://127.0.0.1:${socksPort}`);
    const got = await new Promise<string>((resolve) => {
      const c = net.connect(port, '127.0.0.1', () => c.write('CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n'));
      let buf = '';
      c.on('data', (d) => {
        buf += d;
        if (buf.includes('\r\n\r\n') && !buf.includes('ping')) c.write('ping');
        if (buf.endsWith('ping')) (c.end(), resolve(buf));
      });
    });
    expect(asked).toBe('api.anthropic.com:443');
    expect(got).toMatch(/^HTTP\/1\.1 200[^]*ping$/);
    echo.close();
    socks.close();
  });

  it.skipIf(process.platform === 'win32')('запускает claude -p без инструментов и отдаёт текст ответа', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-'));
    const bin = join(dir, 'claude');
    // Поддельный claude: печатает аргументы, токен и запрос из stdin в поле result.
    writeFileSync(bin, `#!/bin/sh\nIN=$(cat)\nprintf '{"type":"result","is_error":false,"result":"%s|%s|%s"}' "$*" "$CLAUDE_CODE_OAUTH_TOKEN" "$IN"\n`);
    chmodSync(bin, 0o755);
    process.env.CLAUDE_BIN = bin;
    const out = await runClaudeCode({ token: 'tok', system: 'SYS', prompt: 'тема', dir: join(dir, 'home'), proxy: '' });
    expect(out).toContain('-p --output-format json --model opus --tools  --no-session-persistence');
    expect(out).toContain('--system-prompt SYS|tok|тема');
  });

  it.skipIf(process.platform === 'win32')('ошибка Claude Code приходит текстом, токен вырезан', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-'));
    const bin = join(dir, 'claude');
    writeFileSync(bin, `#!/bin/sh\ncat >/dev/null\nprintf '{"type":"result","is_error":true,"result":"401 bad token secret-tok"}'\nexit 1\n`);
    chmodSync(bin, 0o755);
    process.env.CLAUDE_BIN = bin;
    await expect(runClaudeCode({ token: 'secret-tok', system: 's', prompt: 'p', dir: join(dir, 'h'), proxy: '' })).rejects.toThrow('Claude Code: 401 bad token ***');
  });
});
