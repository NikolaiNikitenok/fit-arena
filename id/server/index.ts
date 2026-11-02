// Сервер Nikitenok ID (id.nikitenok.ru). Отдельный процесс: падение Арены не мешает входу, и наоборот.
//   PORT     — порт (по умолчанию 8096), снаружи его открывает Caddy
//   ISSUER   — адрес сервиса (по умолчанию https://id.nikitenok.ru)
//   DATA_DIR — данные (по умолчанию /opt/nikitenok-id/data):
//     id.db            — аккаунты, привязки, сессии (SQLite)
//     keys/key-*.pem   — ключ подписи токенов, создаётся сам при первом запуске; в резервные копии не попадает
//     backups/         — копия базы раз в сутки, 14 последних
//     clients.json     — приложения: [{ id, name, secret_sha256, redirect_uris, url, resolve }]
//     .secret          — ключ для подписи state и csrf, создаётся сам
//     .tg-bot-token, .tg-bot-username — бот для виджета входа Telegram (в BotFather /setdomain id.nikitenok.ru)
//     .yandex-id, .yandex-secret — приложение на oauth.yandex.ru, Redirect URI: <ISSUER>/auth/yandex/callback
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { type Client, createIdApp } from './app';
import { loadKeys } from './jwt';
import { IdStore } from './store';

// node:sqlite ещё помечен как экспериментальный: предупреждение одно и то же при каждом запуске.
process.removeAllListeners('warning');

const PORT = Number(process.env.PORT ?? 8096);
const ISSUER = (process.env.ISSUER ?? 'https://id.nikitenok.ru').replace(/\/$/, '');
const DIR = process.env.DATA_DIR ?? '/opt/nikitenok-id/data';

const read = (name: string, env?: string) => {
  if (env && process.env[env]) return process.env[env]!.trim();
  try {
    return readFileSync(join(DIR, name), 'utf8').trim();
  } catch {
    return '';
  }
};

function loadClients(): Client[] {
  const raw = read('clients.json');
  if (!raw) return [];
  const list = JSON.parse(raw) as { id: string; name: string; secret_sha256?: string; redirect_uris: string[]; url?: string; resolve?: boolean }[];
  return list.map((c) => ({ id: c.id, name: c.name, secretHash: c.secret_sha256 || null, redirectUris: c.redirect_uris, url: c.url, resolve: c.resolve }));
}

const store = new IdStore(join(DIR, 'id.db'));
const keys = loadKeys(join(DIR, 'keys'));
let secret = read('.secret', 'ID_SECRET');
if (!secret) {
  secret = randomBytes(32).toString('hex');
  if (!existsSync(join(DIR, '.secret'))) writeFileSync(join(DIR, '.secret'), secret, { mode: 0o600 });
}
const tgToken = read('.tg-bot-token', 'ID_BOT_TOKEN');
const tgBot = (read('.tg-bot-username', 'ID_BOT_USERNAME') || 'NikitenokID_Bot').replace(/^@/, '');
const yaId = read('.yandex-id', 'YANDEX_CLIENT_ID');
const yaSecret = read('.yandex-secret', 'YANDEX_CLIENT_SECRET');
const clients = loadClients();

const handle = createIdApp({
  issuer: ISSUER,
  store,
  keys,
  clients,
  secret,
  telegram: tgToken && tgBot ? { bot: tgBot, token: tgToken } : undefined,
  yandex: yaId && yaSecret ? { id: yaId, secret: yaSecret } : undefined,
});

function daily(): void {
  try {
    store.cleanup();
    store.backup(join(DIR, 'backups'));
  } catch (e) {
    console.error('backup', e);
  }
}
daily();
setInterval(daily, 24 * 3600_000).unref();

http.createServer((req, res) => void handle(req, res)).listen(PORT, '127.0.0.1', () =>
  console.log(`nikitenok-id on :${PORT}, issuer ${ISSUER}, clients: ${clients.map((c) => c.id).join(', ') || 'нет'}, telegram ${tgBot ? '@' + tgBot : 'нет'}, yandex ${yaId ? 'да' : 'нет'}`),
);
