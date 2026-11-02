import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIdApp, safeReturn } from './app';
import { jwks, loadKeys, newKey, signJwt, verifyJwt } from './jwt';
import { verifyTelegram } from './providers';
import { IdStore } from './store';

const BOT = '123456:TEST-token';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function tgParams(id: string, name: string, at = Math.floor(Date.now() / 1000)): Record<string, string> {
  const d: Record<string, string> = { id, first_name: name, auth_date: String(at) };
  const check = Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join('\n');
  d.hash = createHmac('sha256', createHash('sha256').update(BOT).digest()).update(check).digest('hex');
  return d;
}

describe('IdStore', () => {
  it('создаёт аккаунт при первом входе и находит его потом', () => {
    const s = new IdStore(':memory:');
    const a = s.signIn('tg:1', 'Коля');
    expect(a.created).toBe(true);
    expect(s.signIn('tg:1', 'Коля').nid).toBe(a.nid);
    expect(s.resolve('tg:1')).toBe(a.nid);
  });
  it('не даёт перехватить чужой способ входа и отвязать последний', () => {
    const s = new IdStore(':memory:');
    const a = s.signIn('tg:1', 'A').nid;
    const b = s.signIn('ya:2', 'B').nid;
    expect(s.link(a, 'ya:2', 'B')).toBe('taken');
    expect(s.link(a, 'ya:3', 'A')).toBe('linked');
    expect(s.link(a, 'ya:3', 'A')).toBe('already');
    expect(s.unlink(b, 'ya:2')).toBe('last');
    expect(s.unlink(a, 'tg:1')).toBe('unlinked');
    expect(s.resolve('tg:1')).toBeNull();
  });
  it('удаление стирает привязки и сессии', () => {
    const s = new IdStore(':memory:');
    const a = s.signIn('tg:1', 'A').nid;
    const sid = s.newSession(a);
    expect(s.session(sid)?.nid).toBe(a);
    s.remove(a);
    expect(s.session(sid)).toBeNull();
    expect(s.resolve('tg:1')).toBeNull();
  });
  it('делает резервную копию базы', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nid-'));
    const s = new IdStore(join(dir, 'id.db'));
    s.signIn('tg:1', 'A');
    s.backup(join(dir, 'b'));
    expect(readdirSync(join(dir, 'b'))).toHaveLength(1);
    expect(new IdStore(join(dir, 'b', readdirSync(join(dir, 'b'))[0])).resolve('tg:1')).toBeTruthy();
  });
});

describe('jwt', () => {
  it('подписывает и проверяет ES256, отвергает подделку и просроченное', () => {
    const k = newKey();
    const t = signJwt(k, { sub: 'nid_1', exp: 2000 });
    expect(verifyJwt([k], t, 1000)?.sub).toBe('nid_1');
    expect(verifyJwt([k], t, 3000)).toBeNull();
    expect(verifyJwt([newKey()], t, 1000)).toBeNull();
    const [h, , s] = t.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'nid_2', exp: 2000 })).toString('base64url')}.${s}`;
    expect(verifyJwt([k], forged, 1000)).toBeNull();
    expect((jwks([k]).keys[0] as { kid: string }).kid).toBe(k.kid);
  });
  it('создаёт ключ один раз и потом читает тот же', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nidk-'));
    expect(loadKeys(dir)[0].kid).toBe(loadKeys(dir)[0].kid);
  });
});

describe('telegram', () => {
  it('проверяет подпись виджета', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyTelegram({ ...tgParams('7', 'Аня', now), return: '/account' }, BOT, now)?.id).toBe('7');
    expect(verifyTelegram({ ...tgParams('7', 'Аня', now), first_name: 'Боря' }, BOT, now)).toBeNull();
    expect(verifyTelegram(tgParams('7', 'Аня', now - 2 * 86400), BOT, now)).toBeNull();
  });
});

describe('safeReturn', () => {
  it('пускает только на свои страницы', () => {
    expect(safeReturn('/authorize?client_id=x')).toBe('/authorize?client_id=x');
    expect(safeReturn('//evil.com')).toBe('/account');
    expect(safeReturn('https://evil.com')).toBe('/account');
    expect(safeReturn('/\\evil.com')).toBe('/account');
  });
});

describe('OIDC: полный вход', () => {
  let base = '';
  let server: http.Server;
  const store = new IdStore(':memory:');
  const keys = [newKey()];
  beforeAll(async () => {
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const handle = createIdApp({
      issuer: base,
      store,
      keys,
      secret: 'test-secret',
      telegram: { bot: 'NikitenokIdBot', token: BOT },
      clients: [
        { id: 'habit', name: 'Свобода', secretHash: sha('habit-secret'), redirectUris: ['https://habit.nikitenok.ru/'], url: 'https://habit.nikitenok.ru/', resolve: true },
        { id: 'pub', name: 'Публичное', secretHash: null, redirectUris: ['https://app.example/cb'] },
      ],
    });
    server.on('request', (req, res) => void handle(req, res));
  });
  afterAll(() => server.close());

  const get = (path: string, cookie = '') => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });

  it('вход через Telegram → код → токен → userinfo', async () => {
    const auth = `/authorize?client_id=habit&redirect_uri=${encodeURIComponent('https://habit.nikitenok.ru/')}&response_type=code&scope=openid%20profile&state=xyz&nonce=n1`;
    const r1 = await get(auth);
    expect(r1.status).toBe(302);
    const login = r1.headers.get('location')!;
    expect(login).toMatch(/^\/login\?return=/);
    const lp = await get(login);
    const page = await lp.text();
    const nonce = /script-src 'nonce-([^']+)'/.exec(lp.headers.get('content-security-policy') ?? '')![1];
    expect(page).toContain(`nonce="${nonce}"`);
    expect(page).not.toContain('{{nonce}}');
    expect(page).toContain('id="tg-login" data-bot="123456"');
    expect(r1.headers.get('content-security-policy') ?? '').toBe('');
    expect(page).toContain('Вход для продолжения в');

    const q = new URLSearchParams({ ...tgParams('42', 'Коля'), return: auth });
    const r2 = await get('/auth/telegram?' + q);
    expect(r2.status).toBe(302);
    expect(r2.headers.get('location')).toBe(auth);
    const cookie = r2.headers.get('set-cookie')!.split(';')[0];

    const r3 = await get(auth, cookie);
    const back = new URL(r3.headers.get('location')!);
    expect(back.origin + back.pathname).toBe('https://habit.nikitenok.ru/');
    expect(back.searchParams.get('state')).toBe('xyz');
    const code = back.searchParams.get('code')!;

    const bad = await fetch(base + '/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://habit.nikitenok.ru/', client_id: 'habit', client_secret: 'wrong' }) });
    expect(bad.status).toBe(401);
    const tok = await fetch(base + '/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://habit.nikitenok.ru/', client_id: 'habit', client_secret: 'habit-secret' }) });
    expect(tok.status).toBe(200);
    const t = (await tok.json()) as { id_token: string; access_token: string };
    const claims = verifyJwt(keys, t.id_token, Math.floor(Date.now() / 1000))!;
    expect(claims.aud).toBe('habit');
    expect(claims.nonce).toBe('n1');
    expect(claims.logins).toEqual(['tg:42']);
    expect(claims.sub).toBe(store.resolve('tg:42'));

    // Код одноразовый.
    const again = await fetch(base + '/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://habit.nikitenok.ru/', client_id: 'habit', client_secret: 'habit-secret' }) });
    expect(again.status).toBe(400);

    const ui = await fetch(base + '/userinfo', { headers: { Authorization: 'Bearer ' + t.access_token } });
    expect(((await ui.json()) as { sub: string }).sub).toBe(claims.sub);
    // id_token не годится вместо access_token.
    expect((await fetch(base + '/userinfo', { headers: { Authorization: 'Bearer ' + t.id_token } })).status).toBe(401);
  });

  it('отказывает чужому адресу возврата и публичному клиенту без PKCE', async () => {
    const r = await get(`/authorize?client_id=habit&redirect_uri=${encodeURIComponent('https://evil.com/')}&response_type=code&scope=openid`);
    expect(r.status).toBe(400);
    const p = await get(`/authorize?client_id=pub&redirect_uri=${encodeURIComponent('https://app.example/cb')}&response_type=code&scope=openid`);
    expect(new URL(p.headers.get('location')!).searchParams.get('error')).toBe('invalid_request');
  });

  it('PKCE для публичного клиента', async () => {
    const q = new URLSearchParams({ ...tgParams('43', 'Аня'), return: '/account' });
    const cookie = (await get('/auth/telegram?' + q)).headers.get('set-cookie')!.split(';')[0];
    const verifier = 'v'.repeat(50);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const r = await get(`/authorize?client_id=pub&redirect_uri=${encodeURIComponent('https://app.example/cb')}&response_type=code&scope=openid&code_challenge=${challenge}&code_challenge_method=S256`, cookie);
    const code = new URL(r.headers.get('location')!).searchParams.get('code')!;
    const body = (v: string) => new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.example/cb', client_id: 'pub', code_verifier: v });
    expect((await fetch(base + '/token', { method: 'POST', body: body('wrong') })).status).toBe(400);
  });

  it('служебный resolve только по секрету', async () => {
    const auth = 'Basic ' + Buffer.from('habit:habit-secret').toString('base64');
    const r = await fetch(base + '/api/resolve', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'tg:42' }) });
    expect(((await r.json()) as { nid: string }).nid).toBe(store.resolve('tg:42'));
    const none = await fetch(base + '/api/resolve', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'tg:999' }) });
    expect(((await none.json()) as { nid: null }).nid).toBeNull();
    const no = await fetch(base + '/api/resolve', { method: 'POST', body: JSON.stringify({ login: 'tg:42' }) });
    expect(no.status).toBe(401);
  });

  it('страница аккаунта: привязка, csrf, удаление', async () => {
    const q = new URLSearchParams({ ...tgParams('44', 'Петя'), return: '/account' });
    const cookie = (await get('/auth/telegram?' + q)).headers.get('set-cookie')!.split(';')[0];
    const page = await (await get('/account', cookie)).text();
    expect(page).toContain('Петя');
    const csrf = /name="csrf" value="([^"]+)"/.exec(page)![1];
    // Привязка чужого Telegram (tg:42 уже занят) — отказ.
    const link = new URLSearchParams({ ...tgParams('42', 'Коля'), return: '/account', link: '1' });
    expect((await get('/auth/telegram?' + link, cookie)).headers.get('location')).toBe('/account?msg=taken');
    const post = (body: Record<string, string>) => fetch(base + '/account', { method: 'POST', redirect: 'manual', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    expect((await post({ action: 'delete', sure: '1', csrf: 'bad' })).status).toBe(403);
    expect(store.resolve('tg:44')).toBeTruthy();
    expect((await post({ action: 'delete', sure: '1', csrf })).status).toBe(200);
    expect(store.resolve('tg:44')).toBeNull();
  });
});
