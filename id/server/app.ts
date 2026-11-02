// Nikitenok ID: OpenID Connect-провайдер для приложений Nikitenok (Authorization Code + PKCE).
//   GET  /.well-known/openid-configuration, /.well-known/jwks.json
//   GET  /authorize            — вход и возврат в приложение с одноразовым кодом
//   POST /token                — код → id_token + access_token (секрет клиента или PKCE)
//   GET  /userinfo             — по access_token
//   POST /api/resolve          — служебный: какому nid принадлежит 'tg:123' (только для наших серверов, по секрету)
//   GET  /login, /auth/telegram, /auth/yandex/start|callback — способы входа
//   GET|POST /account          — привязки, выход, удаление
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type SigningKey, jwks, signJwt, verifyJwt } from './jwt';
import { accountPage, errorPage, loginPage, privacyPage } from './pages';
import { verifyTelegram, yandexAuthorizeUrl, yandexUser } from './providers';
import { type IdStore, LOGIN_RE, SESSION_DAYS } from './store';

export interface Client {
  id: string;
  name: string;
  /** sha256 секрета в hex; null — публичный клиент (только с PKCE). */
  secretHash: string | null;
  redirectUris: string[];
  /** Ссылка на приложение для страницы аккаунта. */
  url?: string;
  /** Можно спрашивать /api/resolve. */
  resolve?: boolean;
}

export interface IdConfig {
  issuer: string;
  store: IdStore;
  keys: SigningKey[];
  clients: Client[];
  /** Ключ для подписи state и csrf. */
  secret: string;
  telegram?: { bot: string; token: string };
  yandex?: { id: string; secret: string };
  fetch?: typeof fetch;
  now?: () => number;
}

const CODE_TTL = 60_000;
const ID_TOKEN_SEC = 600;
const ACCESS_SEC = 3600;
const STATE_TTL = 10 * 60_000;
const COOKIE = 'nid_s';
const STATE_COOKIE = 'nid_st';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

interface Code {
  client: string;
  redirectUri: string;
  nid: string;
  nonce?: string;
  challenge?: string;
  scope: string;
  exp: number;
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req: IncomingMessage, max = 20_000): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) { reject(new Error('too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        if (String(req.headers['content-type'] ?? '').includes('application/json')) {
          const j = JSON.parse(text || '{}') as Record<string, unknown>;
          resolve(Object.fromEntries(Object.entries(j).map(([k, v]) => [k, typeof v === 'string' ? v : String(v ?? '')])));
        } else resolve(Object.fromEntries(new URLSearchParams(text)));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Куда можно вернуться после входа: только наши страницы. */
export function safeReturn(r: unknown): string {
  if (typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//') || r.includes('\\')) return '/account';
  return /^\/(authorize\?|account($|\?))/.test(r) ? r : '/account';
}

export function createIdApp(cfg: IdConfig) {
  const now = cfg.now ?? Date.now;
  const f = cfg.fetch ?? fetch;
  const codes = new Map<string, Code>();
  const clients = new Map(cfg.clients.map((c) => [c.id, c]));
  const sign = (t: string) => createHmac('sha256', cfg.secret).update(t).digest('base64url');
  const secure = cfg.issuer.startsWith('https:') ? '; Secure' : '';
  const csrfOf = (sid: string) => sign('csrf:' + sid).slice(0, 32);

  function send(res: ServerResponse, code: number, body: string, type = 'text/html; charset=utf-8', extra: Record<string, string | string[]> = {}): void {
    res.writeHead(code, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(type.startsWith('text/html')
        ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src https://telegram.org; frame-src https://oauth.telegram.org; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" }
        : {}),
      ...extra,
    });
    res.end(body);
  }
  const json = (res: ServerResponse, code: number, body: unknown, extra: Record<string, string> = {}) => send(res, code, JSON.stringify(body), 'application/json', extra);
  const redirect = (res: ServerResponse, to: string, setCookie: string[] = []) => {
    res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', ...(setCookie.length ? { 'Set-Cookie': setCookie } : {}) });
    res.end();
  };
  const sessionCookie = (sid: string) => `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
  const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;

  const current = (req: IncomingMessage) => {
    const s = cfg.store.session(cookies(req)[COOKIE] ?? '');
    return s && cfg.store.account(s.nid) ? s : null;
  };

  function clientAuth(req: IncomingMessage, body: Record<string, string>): { client: Client; authed: boolean } | null {
    let id = body.client_id ?? '';
    let secret = body.client_secret ?? '';
    const basic = /^Basic\s+(.+)$/i.exec(String(req.headers.authorization ?? ''));
    if (basic) {
      const [u, p] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
      id = decodeURIComponent(u ?? '');
      secret = decodeURIComponent(p ?? '');
    }
    const client = clients.get(id);
    if (!client) return null;
    if (client.secretHash) {
      if (!secret || !same(sha(secret), client.secretHash)) return null;
      return { client, authed: true };
    }
    return { client, authed: false };
  }

  function claimsFor(nid: string) {
    const acc = cfg.store.account(nid)!;
    return { name: acc.name, logins: cfg.store.identities(nid).map((i) => i.login) };
  }

  // ——— Вход: после проверки у провайдера ———
  function finishLogin(req: IncomingMessage, res: ServerResponse, login: string, name: string, ret: string, link: boolean): void {
    if (!LOGIN_RE.test(login)) return send(res, 400, errorPage('Не получилось войти', 'Неизвестный способ входа.'));
    if (link) {
      const s = current(req);
      if (!s) return redirect(res, '/login?return=%2Faccount');
      const r = cfg.store.link(s.nid, login, name);
      return redirect(res, `/account?msg=${r}`);
    }
    const { nid } = cfg.store.signIn(login, name);
    const old = cookies(req)[COOKIE];
    if (old) cfg.store.endSession(old);
    const sid = cfg.store.newSession(nid);
    redirect(res, safeReturn(ret), [sessionCookie(sid), `${STATE_COOKIE}=; Path=/; Max-Age=0${secure}`]);
  }

  function makeState(ret: string, link: boolean, bind: string): string {
    const body = Buffer.from(JSON.stringify({ r: ret, l: link ? 1 : 0, e: now() + STATE_TTL, b: bind })).toString('base64url');
    return `${body}.${sign('state:' + body)}`;
  }
  function readState(state: string, bind: string): { r: string; l: boolean } | null {
    const [body, sig] = String(state ?? '').split('.');
    if (!body || !sig || !same(sig, sign('state:' + body))) return null;
    try {
      const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { r: string; l: number; e: number; b: string };
      if (d.e < now() || !bind || d.b !== bind) return null;
      return { r: d.r, l: d.l === 1 };
    } catch {
      return null;
    }
  }

  // ——— OIDC ———
  function authorize(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const p = url.searchParams;
    const client = clients.get(p.get('client_id') ?? '');
    const redirectUri = p.get('redirect_uri') ?? '';
    if (!client) return send(res, 400, errorPage('Неизвестное приложение', 'Ссылка для входа неправильная.'));
    if (!client.redirectUris.includes(redirectUri)) return send(res, 400, errorPage('Неверный адрес возврата', 'Ссылка для входа неправильная.'));
    const back = (params: Record<string, string>) => {
      const u = new URL(redirectUri);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      const st = p.get('state');
      if (st) u.searchParams.set('state', st);
      redirect(res, u.toString());
    };
    if (p.get('response_type') !== 'code') return back({ error: 'unsupported_response_type' });
    const scope = (p.get('scope') ?? '').split(/\s+/).filter(Boolean);
    if (!scope.includes('openid')) return back({ error: 'invalid_scope' });
    const challenge = p.get('code_challenge') ?? undefined;
    if (challenge && p.get('code_challenge_method') !== 'S256') return back({ error: 'invalid_request', error_description: 'S256 only' });
    if (!client.secretHash && !challenge) return back({ error: 'invalid_request', error_description: 'PKCE required' });
    const s = current(req);
    if (!s) {
      if (p.get('prompt') === 'none') return back({ error: 'login_required' });
      return redirect(res, `/login?return=${encodeURIComponent(url.pathname + url.search)}&app=${encodeURIComponent(client.id)}`);
    }
    const code = randomBytes(24).toString('base64url');
    const nonce = p.get('nonce') ?? undefined;
    codes.set(code, { client: client.id, redirectUri, nid: s.nid, nonce: nonce?.slice(0, 200), challenge, scope: scope.join(' '), exp: now() + CODE_TTL });
    for (const [k, c] of codes) if (c.exp < now()) codes.delete(k);
    back({ code });
  }

  async function token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const auth = clientAuth(req, body);
    if (!auth) return json(res, 401, { error: 'invalid_client' });
    if (body.grant_type !== 'authorization_code') return json(res, 400, { error: 'unsupported_grant_type' });
    const c = codes.get(body.code ?? '');
    codes.delete(body.code ?? '');
    if (!c || c.exp < now() || c.client !== auth.client.id || c.redirectUri !== body.redirect_uri) return json(res, 400, { error: 'invalid_grant' });
    if (c.challenge) {
      const v = body.code_verifier ?? '';
      if (!same(createHash('sha256').update(v).digest('base64url'), c.challenge)) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE' });
    } else if (!auth.authed) return json(res, 400, { error: 'invalid_grant' });
    if (!cfg.store.account(c.nid)) return json(res, 400, { error: 'invalid_grant' });
    const iat = Math.floor(now() / 1000);
    const key = cfg.keys[0];
    const extra = claimsFor(c.nid);
    const idToken = signJwt(key, { iss: cfg.issuer, sub: c.nid, aud: c.client, iat, exp: iat + ID_TOKEN_SEC, ...(c.nonce ? { nonce: c.nonce } : {}), ...extra });
    const access = signJwt(key, { iss: cfg.issuer, sub: c.nid, aud: c.client, iat, exp: iat + ACCESS_SEC, scope: c.scope, typ: 'at' });
    json(res, 200, { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SEC, id_token: idToken, scope: c.scope }, { Pragma: 'no-cache' });
  }

  function userinfo(req: IncomingMessage, res: ServerResponse): void {
    const t = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const c = verifyJwt(cfg.keys, t, Math.floor(now() / 1000));
    if (!c || c.typ !== 'at' || c.iss !== cfg.issuer || typeof c.sub !== 'string' || !cfg.store.account(c.sub)) {
      return json(res, 401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
    }
    json(res, 200, { sub: c.sub, ...claimsFor(c.sub) });
  }

  async function resolveApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const auth = clientAuth(req, body);
    if (!auth?.authed || !auth.client.resolve) return json(res, 401, { error: 'invalid_client' });
    const login = body.login ?? '';
    if (!LOGIN_RE.test(login)) return json(res, 400, { error: 'bad login' });
    const nid = cfg.store.resolve(login);
    json(res, 200, nid ? { nid, ...claimsFor(nid) } : { nid: null });
  }

  // ——— Страницы ———
  function loginRoute(req: IncomingMessage, res: ServerResponse, url: URL, error?: string): void {
    const ret = safeReturn(url.searchParams.get('return'));
    const link = url.searchParams.get('link') === '1';
    if (link && !current(req)) return redirect(res, `/login?return=${encodeURIComponent(ret)}`);
    const app = clients.get(url.searchParams.get('app') ?? '');
    send(res, error ? 400 : 200, loginPage({ issuer: cfg.issuer, ret, link, appName: app?.name, telegramBot: cfg.telegram?.bot, yandex: Boolean(cfg.yandex), error }));
  }

  function telegramRoute(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const data = Object.fromEntries(url.searchParams);
    const u = cfg.telegram ? verifyTelegram(data, cfg.telegram.token, Math.floor(now() / 1000)) : null;
    if (!u) return loginRoute(req, res, url, 'Telegram не подтвердил вход. Попробуй ещё раз.');
    finishLogin(req, res, `tg:${u.id}`, u.name, data.return ?? '/account', data.link === '1');
  }

  function yandexStart(_req: IncomingMessage, res: ServerResponse, url: URL): void {
    if (!cfg.yandex) return send(res, 404, errorPage('Вход через Яндекс выключен', 'Попробуй другой способ.'));
    const bind = randomBytes(12).toString('base64url');
    const state = makeState(safeReturn(url.searchParams.get('return')), url.searchParams.get('link') === '1', bind);
    redirect(res, yandexAuthorizeUrl(cfg.yandex.id, `${cfg.issuer}/auth/yandex/callback`, state), [
      `${STATE_COOKIE}=${bind}; Path=/auth/yandex; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    ]);
  }

  async function yandexCallback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const st = readState(url.searchParams.get('state') ?? '', cookies(req)[STATE_COOKIE] ?? '');
    const code = url.searchParams.get('code');
    if (!st || !code || !cfg.yandex) return send(res, 400, errorPage('Не получилось войти', 'Ссылка от Яндекса устарела. Начни вход заново.'));
    try {
      const u = await yandexUser(code, cfg.yandex.id, cfg.yandex.secret, f);
      finishLogin(req, res, `ya:${u.id}`, u.name, st.r, st.l);
    } catch (e) {
      console.error('yandex', e);
      send(res, 502, errorPage('Яндекс не ответил', 'Попробуй ещё раз через минуту.'));
    }
  }

  const MSG: Record<string, { text: string; bad?: boolean }> = {
    linked: { text: 'Готово: способ входа привязан.' },
    already: { text: 'Этот способ входа уже привязан к тебе.' },
    taken: { text: 'Этот способ входа уже привязан к другому Nikitenok ID. Войди им и отвяжи там, потом привяжи здесь.', bad: true },
    unlinked: { text: 'Способ входа отвязан.' },
    last: { text: 'Последний способ входа отвязать нельзя.', bad: true },
    renamed: { text: 'Имя сохранено.' },
    logout_all: { text: 'Вход закрыт на всех других устройствах.' },
  };

  function accountView(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const s = current(req);
    if (!s) return redirect(res, '/login?return=%2Faccount');
    const acc = cfg.store.account(s.nid)!;
    send(res, 200, accountPage({
      name: acc.name,
      nid: acc.nid,
      identities: cfg.store.identities(s.nid),
      sessions: cfg.store.sessionCount(s.nid),
      csrf: csrfOf(s.sid),
      msg: MSG[url.searchParams.get('msg') ?? ''],
      canLink: { tg: Boolean(cfg.telegram), ya: Boolean(cfg.yandex) },
      apps: cfg.clients.filter((c) => c.url).map((c) => ({ name: c.name, url: c.url! })),
    }));
  }

  async function accountPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const s = current(req);
    if (!s) return redirect(res, '/login?return=%2Faccount');
    const origin = req.headers.origin;
    const body = await readBody(req);
    if ((origin && origin !== cfg.issuer) || !same(body.csrf ?? '', csrfOf(s.sid))) return send(res, 403, errorPage('Не получилось', 'Обнови страницу и попробуй снова.'));
    switch (body.action) {
      case 'unlink':
        return redirect(res, `/account?msg=${cfg.store.unlink(s.nid, body.login ?? '')}`);
      case 'rename':
        cfg.store.rename(s.nid, body.name ?? '');
        return redirect(res, '/account?msg=renamed');
      case 'logout':
        cfg.store.endSession(s.sid);
        return redirect(res, '/login', [clearCookie]);
      case 'logout_all': {
        cfg.store.endAllSessions(s.nid);
        const sid = cfg.store.newSession(s.nid);
        return redirect(res, '/account?msg=logout_all', [sessionCookie(sid)]);
      }
      case 'delete':
        if (body.sure !== '1') return redirect(res, '/account');
        cfg.store.remove(s.nid);
        return send(res, 200, errorPage('Аккаунт удалён', 'Nikitenok ID удалён. Войти снова можно в любой момент — будет новый аккаунт.'), undefined, { 'Set-Cookie': clearCookie });
      default:
        return redirect(res, '/account');
    }
  }

  function discovery(res: ServerResponse): void {
    const i = cfg.issuer;
    json(res, 200, {
      issuer: i,
      authorization_endpoint: `${i}/authorize`,
      token_endpoint: `${i}/token`,
      userinfo_endpoint: `${i}/userinfo`,
      jwks_uri: `${i}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
      scopes_supported: ['openid', 'profile'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: ['sub', 'name', 'logins'],
    }, { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', cfg.issuer);
    const path = url.pathname;
    const get = req.method === 'GET' || req.method === 'HEAD';
    try {
      if (get && path === '/') return redirect(res, '/account');
      if (get && path === '/.well-known/openid-configuration') return discovery(res);
      if (get && path === '/.well-known/jwks.json') return json(res, 200, jwks(cfg.keys), { 'Cache-Control': 'public, max-age=600', 'Access-Control-Allow-Origin': '*' });
      if (get && path === '/authorize') return authorize(req, res, url);
      if (req.method === 'POST' && path === '/token') return await token(req, res);
      if (path === '/userinfo' && (get || req.method === 'POST')) return userinfo(req, res);
      if (req.method === 'POST' && path === '/api/resolve') return await resolveApi(req, res);
      if (get && path === '/login') return loginRoute(req, res, url);
      if (get && path === '/auth/telegram') return telegramRoute(req, res, url);
      if (get && path === '/auth/yandex/start') return yandexStart(req, res, url);
      if (get && path === '/auth/yandex/callback') return await yandexCallback(req, res, url);
      if (get && path === '/account') return accountView(req, res, url);
      if (req.method === 'POST' && path === '/account') return await accountPost(req, res);
      if (get && path === '/privacy') return send(res, 200, privacyPage());
      if (get && path === '/health') return json(res, 200, { ok: true, ...cfg.store.stats(), telegram: Boolean(cfg.telegram), yandex: Boolean(cfg.yandex), clients: cfg.clients.map((c) => c.id) });
      send(res, 404, errorPage('Страница не найдена', 'Такой страницы нет.'));
    } catch (e) {
      console.error('id', path, e);
      if (!res.headersSent) send(res, 500, errorPage('Что-то сломалось', 'Попробуй ещё раз через минуту.'));
    }
  };
}
