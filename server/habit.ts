// «Свобода» (habit.nikitenok.ru): вход через профиль NikitenokFamily и копия прогресса на сервере.
//
// Как устроен вход: Family (nikitenok.ru) знает, кто ты, и выдаёт ссылку
//   https://habit.nikitenok.ru/#sso=<payload>.<sig>
// payload — base64url от JSON { pid, name, exp }, где pid — id человека в Family, exp — секунды Unix (не дольше 10 минут),
// sig — hex HMAC-SHA256(key, payload), key = HMAC-SHA256(FAMILY_WEBHOOK_SECRET, "habit-sso") в hex.
// Сайт обменивает эту ссылку на долгую сессию (тот же формат, с меткой "s" и сроком 180 дней)
// и дальше хранит прогресс на сервере за этим pid. Отдельный секрет не нужен: ключ выводится из общего с Family.
//
// Второй вход — Nikitenok ID (id.nikitenok.ru, папка id/): сайт присылает код из /authorize, сервер меняет его
// на id_token у ID (по секрету клиента habit) и заводит ту же сессию. pid такого человека — 'nid:<nid>',
// а если в момент входа он уже был вошедшим через Family, его nid навсегда привязывается к прежнему Family-pid
// (HabitLinks), и прогресс с сериями в Family остаются на месте.
import { createHmac, createPublicKey, timingSafeEqual, type JsonWebKeyInput, type KeyObject } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { verifyJwt } from '../id/server/jwt';

export const HABIT_ORIGINS = ['https://habit.nikitenok.ru'];
export const SSO_MAX_SEC = 10 * 60;
export const SESSION_SEC = 180 * 86_400;
export const HABIT_MAX_BYTES = 400_000;

export const habitKey = (secret: string) => createHmac('sha256', secret).update('habit-sso').digest('hex');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const sigOf = (key: string, payload: string) => createHmac('sha256', key).update(payload).digest('hex');

export interface Who {
  pid: string;
  name: string;
}

function check(key: string, token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const want = sigOf(key, payload);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}
const cleanPid = (x: unknown) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim().slice(0, 64) : '');
const cleanName = (x: unknown) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) : '');

/** Одноразовая ссылка от Family: подпись, срок не истёк и не длиннее SSO_MAX_SEC. */
export function verifySso(key: string, token: unknown, nowMs: number): Who | null {
  const d = check(key, token);
  if (!d || d.s) return null;
  const pid = cleanPid(d.pid);
  const exp = Number(d.exp);
  const now = nowMs / 1000;
  if (!pid || !Number.isFinite(exp) || exp < now || exp > now + SSO_MAX_SEC + 60) return null;
  return { pid, name: cleanName(d.name) };
}

/** Ссылка для входа (так её делает Family; здесь — для тестов и проверки). */
export function makeSso(key: string, who: Who, nowMs: number): string {
  const payload = b64(JSON.stringify({ pid: who.pid, name: who.name, exp: Math.floor(nowMs / 1000) + SSO_MAX_SEC }));
  return `${payload}.${sigOf(key, payload)}`;
}

export function makeSession(key: string, who: Who, nowMs: number): string {
  const payload = b64(JSON.stringify({ s: 1, pid: who.pid, name: who.name, exp: Math.floor(nowMs / 1000) + SESSION_SEC }));
  return `${payload}.${sigOf(key, payload)}`;
}

export function verifySession(key: string, token: unknown, nowMs: number): Who | null {
  const d = check(key, token);
  if (!d || d.s !== 1) return null;
  const pid = cleanPid(d.pid);
  if (!pid || !(Number(d.exp) > nowMs / 1000)) return null;
  return { pid, name: cleanName(d.name) };
}

export interface HabitSave {
  state: Record<string, unknown>;
  savedAt: number;
  name: string;
  /** Прежние копии, когда набор привычек менялся (последние HISTORY_MAX), — чтобы потерянное можно было вернуть. */
  history?: { state: Record<string, unknown>; savedAt: number; replacedAt: number }[];
}
const HISTORY_MAX = 8;
const habitIds = (st: Record<string, unknown> | undefined): string =>
  (Array.isArray(st?.habits) ? (st.habits as { id?: unknown }[]).map((h) => String(h?.id ?? '')).sort().join(',') : '');

/** Прогресс «Свободы» по людям Family. Сервер его не разбирает — хранит более свежую копию. */
export class HabitStore {
  private data: Record<string, HabitSave> = {};
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly file: string) {
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      this.data = {};
    }
  }
  get(pid: string): HabitSave | null {
    return this.data[pid] ?? null;
  }
  /** Сохраняет, если копия свежее. Возвращает то, что теперь на сервере. */
  put(pid: string, name: string, state: Record<string, unknown>, savedAt: number): HabitSave {
    const cur = this.data[pid];
    if (!cur || savedAt >= cur.savedAt) {
      let history = cur?.history ?? [];
      if (cur && habitIds(cur.state) !== habitIds(state)) {
        history = [{ state: cur.state, savedAt: cur.savedAt, replacedAt: Date.now() }, ...history].slice(0, HISTORY_MAX);
      }
      this.data[pid] = { state, savedAt, name: name || cur?.name || '', ...(history.length ? { history } : {}) };
      this.flush();
    }
    return this.data[pid];
  }
  remove(pid: string): void {
    delete this.data[pid];
    this.flush();
  }
  private flush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
        renameSync(this.file + '.tmp', this.file);
      } catch (e) {
        console.error('habit store', e);
      }
    }, 500);
  }
}

/** nid из Nikitenok ID → прежний Family-pid человека (если он перешёл на ID, будучи вошедшим через Family). */
export class HabitLinks {
  private data: Record<string, string> = {};
  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      this.data = {};
    }
  }
  get(nid: string): string | null {
    return this.data[nid] ?? null;
  }
  set(nid: string, pid: string): void {
    this.data[nid] = pid;
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
      renameSync(this.file + '.tmp', this.file);
    } catch (e) {
      console.error('habit links', e);
    }
  }
}

export interface NidConfig {
  /** Адрес ID изнутри сервера, например http://127.0.0.1:8096. */
  internal: string;
  /** Адрес ID снаружи — он же iss в токенах. */
  issuer: string;
  clientId: string;
  secret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}

let jwksCache: { at: number; keys: { kid: string; publicKey: KeyObject }[] } | null = null;
async function nidKeys(cfg: NidConfig, nowMs: number, force = false): Promise<{ kid: string; publicKey: KeyObject }[]> {
  if (!force && jwksCache && nowMs - jwksCache.at < 3600_000) return jwksCache.keys;
  const r = await (cfg.fetch ?? fetch)(`${cfg.internal}/.well-known/jwks.json`);
  const j = (await r.json()) as { keys: (JsonWebKeyInput['key'] & { kid: string })[] };
  const keys = j.keys.map((k) => ({ kid: k.kid, publicKey: createPublicKey({ key: k, format: 'jwk' }) }));
  jwksCache = { at: nowMs, keys };
  return keys;
}

/** Код из Nikitenok ID → кто вошёл. Подпись id_token проверяем, хотя он и пришёл напрямую от ID. */
export async function exchangeNidCode(cfg: NidConfig, code: string, verifier: string, nowMs: number): Promise<{ nid: string; name: string; logins: string[] } | null> {
  const r = await (cfg.fetch ?? fetch)(`${cfg.internal}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.secret, ...(verifier ? { code_verifier: verifier } : {}) }).toString(),
  });
  if (!r.ok) return null;
  const t = (await r.json()) as { id_token?: string };
  if (typeof t.id_token !== 'string') return null;
  let c = verifyJwt(await nidKeys(cfg, nowMs), t.id_token, nowMs / 1000);
  if (!c) c = verifyJwt(await nidKeys(cfg, nowMs, true), t.id_token, nowMs / 1000);
  if (!c || c.iss !== cfg.issuer || c.aud !== cfg.clientId || typeof c.sub !== 'string' || !/^nid_[0-9a-f]{8,40}$/.test(c.sub)) return null;
  // Привязанные к ID входы (tg:/ya:/max:): по ним приложение узнаёт уже знакомого человека.
  const logins = Array.isArray(c.logins) ? c.logins.filter((l): l is string => typeof l === 'string' && l.length < 40).slice(0, 20) : [];
  return { nid: c.sub, name: cleanName(c.name), logins };
}

function readBody(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { reject(new Error('too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/** Короткая сводка для профиля в Family: по каждой привычке дни без неё, лучшая серия и победы над тягой. */
export interface HabitSummary {
  pid: string;
  wins: number;
  habits: { name: string; emoji: string; start: number; best: number; cravings: number; planned: boolean }[];
  updated: number;
}
export function summarize(pid: string, state: Record<string, unknown>, nowMs: number): HabitSummary {
  const list = Array.isArray(state.habits) ? state.habits : [];
  const habits = list.slice(0, 12).flatMap((h) => {
    if (!h || typeof h !== 'object') return [];
    const x = h as Record<string, unknown>;
    const start = Number(x.start);
    if (!Number.isFinite(start)) return [];
    return [{
      name: cleanName(x.name) || 'Привычка',
      emoji: typeof x.emoji === 'string' ? x.emoji.slice(0, 8) : '✨',
      start: Math.floor(start),
      best: Math.max(0, Math.floor(Number(x.best) || 0)),
      cravings: Math.max(0, Math.floor(Number(x.cravings) || 0)),
      planned: start > nowMs,
    }];
  });
  return { pid, wins: Math.max(0, Math.floor(Number(state.wins) || 0)), habits, updated: nowMs };
}

/** /api/habit/login | load | save | logout-delete. Вызывать для путей /api/habit/*. */
export interface HabitNid {
  cfg: NidConfig;
  links: HabitLinks;
}

export async function habitApi(path: string, req: IncomingMessage, res: ServerResponse, store: HabitStore, secret: string, onSaved: (s: HabitSummary) => void = () => {}, now = Date.now, nid: HabitNid | null = null): Promise<void> {
  const origin = String(req.headers.origin ?? '');
  const cors: Record<string, string> = HABIT_ORIGINS.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : {};
  const send = (code: number, body?: unknown): void => void res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
  if (req.method !== 'POST') return send(405);
  // Ключ сессий выводится из секрета Family, а без Family — из секрета клиента Nikitenok ID.
  const root = secret || (nid ? 'nid:' + nid.cfg.secret : '');
  if (!root) return send(503, { error: 'off' });
  const key = habitKey(root);
  let body: Record<string, unknown>;
  try {
    body = await readBody(req, HABIT_MAX_BYTES + 10_000);
  } catch {
    return send(413);
  }
  if (path === '/api/habit/nid') {
    if (!nid) return send(503, { error: 'off' });
    if (typeof body.code !== 'string' || body.code.length > 200) return send(400);
    let got: { nid: string; name: string } | null = null;
    try {
      got = await exchangeNidCode(nid.cfg, body.code, typeof body.verifier === 'string' ? body.verifier.slice(0, 200) : '', now());
    } catch (e) {
      console.error('habit nid', e);
      return send(502, { error: 'id unavailable' });
    }
    if (!got) return send(401, { error: 'bad code' });
    // Уже вошёл через Family на этом устройстве — привязываем nid к его Family-pid (один раз).
    const before = verifySession(key, String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''), now());
    let pid = nid.links.get(got.nid);
    if (!pid && before && !before.pid.startsWith('nid:')) {
      pid = before.pid;
      nid.links.set(got.nid, pid);
    }
    const who: Who = { pid: pid ?? `nid:${got.nid}`, name: got.name || before?.name || '' };
    const saved = store.get(who.pid);
    return send(200, { session: makeSession(key, who, now()), name: who.name || saved?.name || '', state: saved?.state ?? null, savedAt: saved?.savedAt ?? 0, via: 'nid', family: !who.pid.startsWith('nid:') });
  }
  if (path === '/api/habit/login') {
    if (!secret) return send(503, { error: 'off' });
    const who = verifySso(key, body.token, now());
    if (!who) return send(401, { error: 'bad token' });
    const saved = store.get(who.pid);
    return send(200, { session: makeSession(key, who, now()), name: who.name || saved?.name || '', state: saved?.state ?? null, savedAt: saved?.savedAt ?? 0 });
  }
  const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const who = verifySession(key, auth, now());
  if (!who) return send(401, { error: 'no session' });
  if (path === '/api/habit/load') {
    const saved = store.get(who.pid);
    return send(200, { name: who.name, state: saved?.state ?? null, savedAt: saved?.savedAt ?? 0 });
  }
  if (path === '/api/habit/save') {
    const state = body.state;
    const savedAt = Number(body.savedAt);
    if (!state || typeof state !== 'object' || Array.isArray(state) || !Number.isFinite(savedAt)) return send(400);
    if (JSON.stringify(state).length > HABIT_MAX_BYTES) return send(413);
    // Время из будущего не даём: иначе одна копия навсегда «свежее» всех остальных.
    const at = Math.min(savedAt, now() + 60_000);
    const cur = store.put(who.pid, who.name, state as Record<string, unknown>, at);
    if (cur.savedAt === at) onSaved(summarize(who.pid, cur.state, now()));
    return send(200, { savedAt: cur.savedAt, newer: cur.savedAt > at ? cur.state : null });
  }
  if (path === '/api/habit/history') {
    const saved = store.get(who.pid);
    return send(200, { history: (saved?.history ?? []).map((x) => ({ savedAt: x.savedAt, replacedAt: x.replacedAt, state: x.state })) });
  }
  if (path === '/api/habit/delete') {
    store.remove(who.pid);
    onSaved({ pid: who.pid, wins: 0, habits: [], updated: now() });
    return send(200, { ok: true });
  }
  return send(404);
}
