import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AccountStore, platformOf } from './accounts';
import { attachNid, nidAuthorizeUrl, nidLogin, pkcePair } from './nidLogin';
import { checkSession, sessionToken } from './webAuth';

const sign = (t: string) => createHmac('sha256', 'k').update(t).digest('hex').slice(0, 32);
const NID = 'nid:0123456789abcdef';

describe('вход через Nikitenok ID', () => {
  it('nid из ID становится входом Арены, сессия его принимает', () => {
    expect(nidLogin('nid_0123456789abcdef')).toBe(NID);
    expect(nidLogin('nid_XYZ')).toBeNull();
    expect(nidLogin('tg:1')).toBeNull();
    expect(platformOf(NID)).toBe('nid');
    const t = sessionToken(sign, NID, 'Коля', 1e12);
    expect(checkSession(sign, t, 1e12)).toEqual({ login: NID, name: 'Коля' });
  });

  it('PKCE и адрес входа', () => {
    const { verifier, challenge } = pkcePair();
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    const u = new URL(nidAuthorizeUrl('https://id.nikitenok.ru/', 'arena', 'https://arena.nikitenok.ru/api/auth/nid/callback', 's1', challenge));
    expect(u.origin + u.pathname).toBe('https://id.nikitenok.ru/authorize');
    expect(u.searchParams.get('client_id')).toBe('arena');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('scope')).toBe('openid profile');
  });

  it('первый вход находит героя по привязанному Telegram', () => {
    const a = new AccountStore(null);
    const heroes = new Set(['tg:5']);
    expect(attachNid(a, NID, ['ya:9', 'tg:5'], (id) => heroes.has(id))).toBe('tg:5');
    expect(a.resolve(NID)).toBe('tg:5');
    expect(a.logins('tg:5')).toEqual(['tg:5', NID]);
    // Дальше вход уже знаком — тот же аккаунт, даже если привязки в ID поменялись.
    expect(attachNid(a, NID, [], () => false)).toBe('tg:5');
  });

  it('герой есть только у Яндекса — идём к нему; героев нет — к Telegram', () => {
    const a = new AccountStore(null);
    expect(attachNid(a, NID, ['tg:5', 'ya:9'], (id) => id === 'ya:9')).toBe('ya:9');
    const b = new AccountStore(null);
    expect(attachNid(b, NID, ['ya:9', 'tg:5'], () => false)).toBe('tg:5');
  });

  it('вход через привязку ведёт в аккаунт, куда переехал Telegram', () => {
    const a = new AccountStore(null);
    a.merge('tg:5', 'max:7');
    expect(attachNid(a, NID, ['tg:5'], (id) => id === 'max:7')).toBe('max:7');
  });

  it('без привязок или со своим героем — ID сам себе аккаунт', () => {
    const a = new AccountStore(null);
    expect(attachNid(a, NID, [], () => false)).toBe(NID);
    expect(attachNid(a, NID, ['tg:5', 'мусор', 'nid:aaaaaaaa11'], (id) => id === NID)).toBe(NID);
    expect(a.resolve(NID)).toBe(NID);
  });
});

describe('Арена ↔ настоящий сервер Nikitenok ID', () => {
  it('код с PKCE меняется на nid и привязанные входы, без verifier — нет', async () => {
    const http = await import('node:http');
    const { createIdApp } = await import('../id/server/app');
    const { newKey } = await import('../id/server/jwt');
    const { IdStore } = await import('../id/server/store');
    const { exchangeNidCode } = await import('./habit');
    const BOT = '1:T';
    const d: Record<string, string> = { id: '42', first_name: 'Коля', auth_date: String(Math.floor(Date.now() / 1000)) };
    d.hash = createHmac('sha256', createHash('sha256').update(BOT).digest()).update(Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join('\n')).digest('hex');
    const REDIRECT = 'https://arena.nikitenok.ru/api/auth/nid/callback';
    const handle = createIdApp({
      issuer: 'https://id.nikitenok.ru',
      store: new IdStore(':memory:'),
      keys: [newKey()],
      secret: 's',
      telegram: { bot: 'B', token: BOT },
      clients: [{ id: 'arena', name: 'NikitenokArena', secretHash: createHash('sha256').update('as').digest('hex'), redirectUris: [REDIRECT] }],
    });
    const srv = http.createServer((q, r) => void handle(q, r));
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(srv.address() as import('node:net').AddressInfo).port}`;
    try {
      const cookie = (await fetch(`${base}/auth/telegram?${new URLSearchParams({ ...d, return: '/account' })}`, { redirect: 'manual' })).headers.get('set-cookie')!.split(';')[0];
      const codeOf = async (challenge: string) => {
        const r = await fetch(nidAuthorizeUrl(base, 'arena', REDIRECT, 'st', challenge), { redirect: 'manual', headers: { cookie } });
        const u = new URL(r.headers.get('location')!);
        expect(u.origin + u.pathname).toBe(REDIRECT);
        return u.searchParams.get('code')!;
      };
      const cfg = { internal: base, issuer: 'https://id.nikitenok.ru', clientId: 'arena', secret: 'as', redirectUri: REDIRECT };
      const p = pkcePair();
      expect(await exchangeNidCode(cfg, await codeOf(p.challenge), 'чужой', Date.now())).toBeNull();
      const got = await exchangeNidCode(cfg, await codeOf(p.challenge), p.verifier, Date.now());
      expect(got?.logins).toEqual(['tg:42']);
      expect(got?.name).toBe('Коля');
      const login = nidLogin(got!.nid)!;
      const a = new AccountStore(null);
      expect(attachNid(a, login, got!.logins, (id) => id === 'tg:42')).toBe('tg:42');
    } finally {
      srv.close();
    }
  });
});
