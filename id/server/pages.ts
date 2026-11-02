// HTML-страницы Nikitenok ID: вход, аккаунт, ошибки. Без сборки и без внешних стилей.
import type { Identity } from './store';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `
:root{--bg:#0f1830;--card:#17223f;--line:#26345c;--ink:#f3f5fb;--quiet:#9aa6c4;--accent:#ffb38a;--accent2:#ff8a65;--bad:#ff7a7a;--good:#7ddba3}
@media (prefers-color-scheme: light){:root{--bg:#f4f6fb;--card:#fff;--line:#dde3f0;--ink:#16203a;--quiet:#5d6987}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:440px;margin:0 auto;padding:32px 16px 48px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;margin-bottom:24px}
.logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:#1b1b2b;font-weight:900}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
h1{font-size:22px;margin:0 0 8px}h2{font-size:16px;margin:0 0 12px}
p{margin:0 0 12px}.quiet{color:var(--quiet);font-size:14px}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;padding:10px 16px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-weight:700;text-decoration:none;cursor:pointer;margin-top:10px}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;color:#1b1b2b}
.btn.ya{background:#fc3f1d;border:0;color:#fff}
.btn.danger{color:var(--bad);border-color:var(--bad)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}.row b{display:block}.row small{color:var(--quiet)}
.row form{margin:0}.link{background:none;border:0;color:var(--quiet);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer;padding:4px}
.msg{padding:12px 14px;border-radius:12px;margin-bottom:16px;font-size:14px;background:rgba(125,219,163,.14);border:1px solid var(--good)}
.msg.bad{background:rgba(255,122,122,.12);border-color:var(--bad)}
.tg{display:flex;justify-content:center;min-height:48px;margin-top:10px}
input[type=text]{width:100%;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit}
label.check{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--quiet);margin-top:8px}
footer{text-align:center;font-size:13px;color:var(--quiet);margin-top:24px}footer a{color:var(--quiet)}
`;

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="color-scheme" content="dark light"><style>${CSS}</style></head>
<body><main><div class="brand"><span class="logo">N</span>Nikitenok ID</div>${body}
<footer>Один вход для приложений Nikitenok · <a href="/privacy">Конфиденциальность</a></footer></main></body></html>`;
}

export interface LoginOpts {
  issuer: string;
  ret: string;
  link: boolean;
  appName?: string;
  telegramBot?: string;
  yandex: boolean;
  error?: string;
}

export function loginPage(o: LoginOpts): string {
  const q = `return=${encodeURIComponent(o.ret)}${o.link ? '&link=1' : ''}`;
  const tg = o.telegramBot
    ? `<div class="tg"><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${esc(o.telegramBot)}" data-size="large" data-radius="12" data-auth-url="${esc(`${o.issuer}/auth/telegram?${q}`)}" data-request-access="write"></script></div>`
    : '';
  const ya = o.yandex ? `<a class="btn ya" href="/auth/yandex/start?${esc(q)}">Войти с Яндекс ID</a>` : '';
  const head = o.link
    ? `<h1>Привязать способ входа</h1><p class="quiet">Войди тем способом, который хочешь добавить к своему Nikitenok ID.</p>`
    : `<h1>Вход</h1><p class="quiet">${o.appName ? `Чтобы продолжить в приложении «${esc(o.appName)}», войди` : 'Войди'} через Telegram или Яндекс. Один аккаунт для всех приложений Nikitenok.</p>`;
  return layout('Вход — Nikitenok ID', `${o.error ? `<div class="msg bad">${esc(o.error)}</div>` : ''}<div class="card">${head}${tg}${ya}
${!tg && !ya ? '<p class="msg bad">Вход пока не настроен.</p>' : ''}
${o.link ? '<a class="btn" href="/account">Отмена</a>' : ''}</div>`);
}

const PROVIDER: Record<string, string> = { tg: 'Telegram', ya: 'Яндекс ID', max: 'Max' };
export const providerName = (login: string) => PROVIDER[login.slice(0, login.indexOf(':'))] ?? login;

export interface AccountView {
  name: string;
  nid: string;
  identities: Identity[];
  sessions: number;
  csrf: string;
  msg?: { text: string; bad?: boolean };
  canLink: { tg: boolean; ya: boolean };
  apps: { name: string; url: string }[];
}

const day = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

export function accountPage(v: AccountView): string {
  const hidden = `<input type="hidden" name="csrf" value="${esc(v.csrf)}">`;
  const one = v.identities.length <= 1;
  const ids = v.identities
    .map(
      (i) => `<div class="row"><div><b>${esc(providerName(i.login))}</b><small>${esc(i.name || i.login)} · с ${esc(day(i.linked))}</small></div>
${one ? '' : `<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="unlink"><input type="hidden" name="login" value="${esc(i.login)}"><button class="link" type="submit">Отвязать</button></form>`}</div>`,
    )
    .join('');
  const has = (p: string) => v.identities.some((i) => i.login.startsWith(p + ':'));
  const missing = [v.canLink.tg && !has('tg') ? 'Telegram' : '', v.canLink.ya && !has('ya') ? 'Яндекс ID' : ''].filter(Boolean);
  const add = missing.length ? `<a class="btn" href="/login?link=1&amp;return=%2Faccount">+ Привязать ${esc(missing.join(' или '))}</a>` : '';
  const apps = v.apps.length
    ? `<div class="card"><h2>Приложения</h2>${v.apps.map((a) => `<div class="row"><div><b>${esc(a.name)}</b><small>${esc(a.url.replace(/^https:\/\//, '').replace(/\/$/, ''))}</small></div><a class="link" href="${esc(a.url)}">Открыть</a></div>`).join('')}</div>`
    : '';
  return layout(
    'Аккаунт — Nikitenok ID',
    `${v.msg ? `<div class="msg${v.msg.bad ? ' bad' : ''}">${esc(v.msg.text)}</div>` : ''}
<div class="card"><h1>${esc(v.name)}</h1><p class="quiet">Твой Nikitenok ID. Через него ты входишь во все приложения Nikitenok.</p>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="rename"><input type="text" name="name" maxlength="60" value="${esc(v.name)}" aria-label="Имя"><button class="btn" type="submit">Сохранить имя</button></form></div>
<div class="card"><h2>Способы входа</h2>${ids}${add}${one ? '<p class="quiet" style="margin-top:12px">Добавь второй способ — тогда сможешь войти, даже если потеряешь доступ к первому.</p>' : ''}</div>
${apps}
<div class="card"><h2>Устройства</h2><p class="quiet">Вход открыт на ${v.sessions} ${plural(v.sessions, 'устройстве', 'устройствах', 'устройствах')}.</p>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="logout"><button class="btn" type="submit">Выйти на этом устройстве</button></form>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="logout_all"><button class="btn" type="submit">Выйти на всех устройствах</button></form></div>
<div class="card"><h2>Удалить аккаунт</h2><p class="quiet">Удалим Nikitenok ID и все привязки. Прогресс в самих приложениях останется в них: удалить его можно в настройках каждого приложения.</p>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="delete"><label class="check"><input type="checkbox" name="sure" value="1" required> Понимаю, что войти в этот аккаунт будет нельзя</label><button class="btn danger" type="submit">Удалить Nikitenok ID</button></form></div>`,
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export const errorPage = (title: string, text: string) => layout(title, `<div class="card"><h1>${esc(title)}</h1><p class="quiet">${esc(text)}</p><a class="btn" href="/account">В аккаунт</a></div>`);

export const privacyPage = () =>
  layout(
    'Конфиденциальность — Nikitenok ID',
    `<div class="card"><h1>Что мы храним</h1>
<p>Nikitenok ID хранит только то, что нужно для входа: номер аккаунта, имя, номера аккаунтов Telegram, Яндекса или Max, которые ты привязал, и открытые сессии браузера.</p>
<p>Приложениям Nikitenok мы сообщаем твой номер Nikitenok ID, имя и привязанные способы входа, чтобы они узнали тебя и твой прежний прогресс. Третьим лицам данные не передаём.</p>
<p>Удалить аккаунт можно на странице аккаунта, данные удаляются сразу; резервные копии хранятся до 14 дней.</p></div>`,
  );
