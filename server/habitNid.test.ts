// «Свобода» + Nikitenok ID: настоящий сервер ID и настоящий habitApi, вход по коду и привязка к прежнему Family-pid.
import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIdApp } from '../id/server/app';
import { newKey } from '../id/server/jwt';
import { IdStore } from '../id/server/store';
import { testTelegramLogin } from '../id/server/testLogin';
import { HabitLinks, HabitStore, habitApi, habitKey, makeSession } from './habit';

const BOT = '1:T';
const tg = (id: string) => {
  const d: Record<string, string> = { id, first_name: 'Коля', auth_date: String(Math.floor(Date.now() / 1000)) };
  d.hash = createHmac('sha256', createHash('sha256').update(BOT).digest()).update(Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join('\n')).digest('hex');
  return d;
};

describe('вход в «Свободу» через Nikitenok ID', () => {
  let idBase = '';
  let habitBase = '';
  const servers: http.Server[] = [];
  const store = new HabitStore('/nonexistent/dir/habit.json');
  const links = new HabitLinks(null);
  const pushed: string[] = [];
  const FAMILY = 'family-secret';

  const listen = async (handler: http.RequestListener) => {
    const s = http.createServer(handler);
    servers.push(s);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  };

  beforeAll(async () => {
    let handle: ReturnType<typeof createIdApp> = async () => {};
    idBase = await listen((req, res) => void handle(req, res));
    handle = createIdApp({
      issuer: 'https://id.nikitenok.ru',
      store: new IdStore(':memory:'),
      keys: [newKey()],
      secret: 's',
      telegram: { bot: 'B', token: BOT },
      clients: [{ id: 'habit', name: 'Свобода', secretHash: createHash('sha256').update('hs').digest('hex'), redirectUris: ['https://habit.nikitenok.ru/'] }],
    });
    const nid = { cfg: { internal: idBase, issuer: 'https://id.nikitenok.ru', clientId: 'habit', secret: 'hs', redirectUri: 'https://habit.nikitenok.ru/' }, links };
    habitBase = await listen((req, res) => {
      const path = new URL(req.url!, 'http://x').pathname;
      void habitApi(path, req, res, store, FAMILY, (s) => { if (!s.pid.startsWith('nid:')) pushed.push(s.pid); }, Date.now, nid);
    });
  });
  afterAll(() => servers.forEach((s) => s.close()));

  /** Входит в ID через Telegram и проходит /authorize — возвращает код для «Свободы». */
  async function codeFor(tgId: string): Promise<string> {
    const cookie = (await testTelegramLogin(idBase, new URLSearchParams({ ...tg(tgId), return: '/account' }))).headers.get('set-cookie')!.split(';')[0];
    const r = await fetch(`${idBase}/authorize?client_id=habit&redirect_uri=${encodeURIComponent('https://habit.nikitenok.ru/')}&response_type=code&scope=openid&state=s1`, { redirect: 'manual', headers: { cookie } });
    return new URL(r.headers.get('location')!).searchParams.get('code')!;
  }
  const post = (path: string, body: object, session = '') =>
    fetch(habitBase + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session } : {}) }, body: JSON.stringify(body) });

  it('новый человек получает свой pid nid:… и сводка в Family не уходит', async () => {
    const r = await post('/api/habit/nid', { code: await codeFor('100') });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { session: string; family: boolean };
    expect(j.family).toBe(false);
    const save = await post('/api/habit/save', { state: { habits: [{ name: 'Кофе', start: 1 }] }, savedAt: Date.now() }, j.session);
    expect(save.status).toBe(200);
    expect(pushed).toEqual([]);
  });

  it('вошедший через Family остаётся при своём прогрессе и pid', async () => {
    const key = habitKey(FAMILY);
    store.put('f1:p1', 'Коля', { habits: [{ name: 'Курение', start: 1 }] }, 5);
    const family = makeSession(key, { pid: 'f1:p1', name: 'Коля' }, Date.now());
    const r = await post('/api/habit/nid', { code: await codeFor('200') }, family);
    const j = (await r.json()) as { session: string; state: { habits: { name: string }[] }; family: boolean };
    expect(j.family).toBe(true);
    expect(j.state.habits[0].name).toBe('Курение');
    // Второй вход через ID на другом устройстве (уже без Family) — тот же прогресс.
    const again = (await (await post('/api/habit/nid', { code: await codeFor('200') })).json()) as { state: { habits: { name: string }[] } };
    expect(again.state.habits[0].name).toBe('Курение');
    await post('/api/habit/save', { state: { habits: [{ name: 'Курение', start: 1 }] }, savedAt: Date.now() }, j.session);
    expect(pushed).toContain('f1:p1');
  });

  it('чужой или повторный код не принимает', async () => {
    const code = await codeFor('300');
    expect((await post('/api/habit/nid', { code })).status).toBe(200);
    expect((await post('/api/habit/nid', { code })).status).toBe(401);
    expect((await post('/api/habit/nid', { code: 'подделка' })).status).toBe(401);
  });
});
