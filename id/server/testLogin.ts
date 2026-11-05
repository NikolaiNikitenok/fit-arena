/** Browser-like flow for integration tests: receive a cookie and state before Telegram callback. */
export async function beginTelegram(base: string, params: URLSearchParams, cookie = '') {
  const login = new URLSearchParams({ return: params.get('return') ?? '/account', ...(params.get('link') === '1' ? { link: '1' } : {}) });
  const page = await fetch(`${base}/login?${login}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const html = await page.text();
  const state = /data-state="([^"]+)"/.exec(html)?.[1];
  if (!state) throw new Error('Telegram login flow was not issued');
  const flowCookie = page.headers.get('set-cookie')!.split(';')[0];
  const query = new URLSearchParams(params);
  query.set('state', state);
  return { url: `${base}/auth/telegram?${query}`, cookie: [cookie, flowCookie].filter(Boolean).join('; ') };
}

export async function testTelegramLogin(base: string, params: URLSearchParams, cookie = '') {
  const flow = await beginTelegram(base, params, cookie);
  return fetch(flow.url, { redirect: 'manual', headers: { cookie: flow.cookie } });
}
