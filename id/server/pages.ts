// HTML-страницы Nikitenok ID: вход, аккаунт, ошибки, конфиденциальность.
// Без сборки и внешних стилей: всё в одном ответе, шрифты системные. Светлая и тёмная тема — по настройке устройства.
// Скрипт на странице один (вход через Telegram своей кнопкой), он идёт с nonce — его подставляет app.ts ({{nonce}}).
import type { Identity } from './store';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ——— Иконки (inline SVG, цвет — currentColor) ———
const I = {
  logo: `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="LGID" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C7DFF"/><stop offset="1" stop-color="#1B2F8F"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#LGID)"/><path d="M12 28V12h3.2l9.6 10.4V12H28v16h-3.2L15.2 17.6V28z" fill="#fff"/><circle cx="31" cy="9" r="3" fill="#E9C46A"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.6 19.9c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.3-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L5.9 13.4 1 11.9c-1.1-.3-1.1-1.1.2-1.6L20.5 2.9c.9-.3 1.7.2 1.4 1.4z"/></svg>`,
  yandex: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#FC3F1D"/><path fill="#fff" d="M13.6 6.2h-1.1c-2 0-3.1 1-3.1 2.6 0 1.8.8 2.6 2.4 3.6l1.3.9-3.7 5.5H7l3.3-4.9c-1.9-1.4-3-2.6-3-4.9 0-2.8 2-4.7 5.2-4.7h3.4v14.5h-2.3z"/></svg>`,
  max: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="currentColor"/><path fill="#fff" d="M6.5 16.5v-9h2l3.5 5 3.5-5h2v9h-2.2v-5.4L12 15.6l-3.3-4.5v5.4z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="m8.8 12 2.2 2.2 4.2-4.4"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  key: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m11 12 8-8m-3 3 2 2m-4 0 1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></g></svg>`,
  devices: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="13" height="10" rx="1.8"/><path d="M1.5 18.5h16"/><rect x="17.5" y="9" width="5" height="10" rx="1.4"/></g></svg>`,
  user: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5" stroke-linecap="round"/></g></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7m-8 0 .8 12.2c.1.9.8 1.6 1.7 1.6h6c.9 0 1.6-.7 1.7-1.6L17.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

// Приложения экосистемы для бренд-панели: монограмма и цвет.
const ECOSYSTEM = [
  { name: 'Арена', hint: 'Тренировки и дуэли', mono: 'А', color: '#FF8A4C' },
  { name: 'Семья', hint: 'Бюджет и планы', mono: 'С', color: '#2BB673' },
  { name: 'Свобода', hint: 'Без вредных привычек', mono: 'С', color: '#22B5C9' },
];
const APP_STYLE: Record<string, { mono: string; color: string }> = {
  Арена: { mono: 'А', color: '#FF8A4C' },
  Семья: { mono: 'С', color: '#2BB673' },
  Свобода: { mono: 'С', color: '#22B5C9' },
};
const appTile = (name: string) => {
  const s = APP_STYLE[name] ?? { mono: name.slice(0, 1).toUpperCase(), color: '#4C7DFF' };
  return `<span class="app-tile" style="--c:${s.color}">${esc(s.mono)}</span>`;
};

const CSS = `
:root{
  --bg:#F3F5FA;--surface:#FFFFFF;--surface-2:#F7F8FC;--line:#E3E7F0;--line-strong:#CCD3E2;
  --ink:#0E1630;--ink-2:#4A5675;--ink-3:#7B87A3;
  --brand:#2F5BEA;--brand-ink:#FFFFFF;--brand-soft:#E8EEFF;--gold:#C9A14A;
  --good:#16A36A;--good-soft:#E3F6EC;--bad:#D64545;--bad-soft:#FDECEC;
  --shadow:0 1px 2px rgba(14,22,48,.04),0 8px 24px rgba(14,22,48,.06);
  --shadow-lg:0 2px 4px rgba(14,22,48,.04),0 24px 64px rgba(14,22,48,.10);
  --hero-1:#0A1440;--hero-2:#15277A;--hero-3:#2F5BEA;
}
@media (prefers-color-scheme: dark){:root{
  --bg:#070B18;--surface:#0F162B;--surface-2:#141C34;--line:#1F2A47;--line-strong:#2B3858;
  --ink:#EEF2FB;--ink-2:#A9B4CE;--ink-3:#7480A0;
  --brand:#5B83FF;--brand-soft:#17224A;--good-soft:#0E2A1F;--bad-soft:#2E1418;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);--shadow-lg:0 24px 64px rgba(0,0,0,.45);
  --hero-1:#050A22;--hero-2:#0E1B5C;--hero-3:#2446C8;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
svg{display:block}
.brand{display:inline-flex;align-items:center;gap:10px;color:inherit;font-weight:700;font-size:17px;letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.brand .mark{width:34px;height:34px}
.brand b{font-weight:800}.brand span{font-weight:500;opacity:.72}

/* ——— Вход: две колонки ——— */
.auth{flex:1;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);min-height:100vh}
.hero{position:relative;overflow:hidden;color:#fff;padding:48px 56px;display:flex;flex-direction:column;
  background:radial-gradient(1200px 600px at 110% -10%,rgba(91,131,255,.55),transparent 60%),radial-gradient(800px 500px at -10% 110%,rgba(201,161,74,.22),transparent 60%),linear-gradient(160deg,var(--hero-1),var(--hero-2) 60%,var(--hero-3))}
.hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse at 70% 30%,#000 10%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse at 70% 30%,#000 10%,transparent 70%)}
.hero>*{position:relative}
.hero .brand{color:#fff}
.hero-body{margin:auto 0;max-width:520px;padding:48px 0}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#E9C46A;margin-bottom:20px}
.eyebrow::before{content:"";width:24px;height:1px;background:currentColor}
.hero h1{font-size:44px;line-height:1.08;letter-spacing:-.025em;margin:0 0 18px;font-weight:800}
.hero p.lead{font-size:17px;line-height:1.55;color:rgba(255,255,255,.78);margin:0 0 36px;max-width:440px}
.features{display:grid;gap:14px;margin:0 0 40px;padding:0;list-style:none}
.features li{display:flex;gap:14px;align-items:flex-start}
.features .ic{flex:none;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)}
.features .ic svg{width:20px;height:20px;color:#fff}
.features b{display:block;font-size:15px}.features small{color:rgba(255,255,255,.66);font-size:13.5px}
.eco{display:flex;gap:10px;flex-wrap:wrap}
.eco-item{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px)}
.eco-item small{display:block;color:rgba(255,255,255,.6);font-size:12px;line-height:1.2}.eco-item b{font-size:13.5px;display:block;line-height:1.3}
.app-tile{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(145deg,color-mix(in srgb,var(--c) 85%,#fff),var(--c));box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.hero-foot{font-size:12.5px;color:rgba(255,255,255,.5)}

.panel{display:flex;flex-direction:column;padding:32px 24px;background:var(--bg)}
.panel-top{display:none}
.panel-mid{margin:auto;width:100%;max-width:420px;padding:24px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow-lg);padding:36px}
.card h2{font-size:26px;letter-spacing:-.02em;margin:0 0 8px;font-weight:800}
.card .sub{color:var(--ink-2);margin:0 0 28px}
.context{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line);margin:0 0 24px}
.context small{display:block;color:var(--ink-3);font-size:12.5px}.context b{font-size:14.5px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;padding:12px 18px;border-radius:14px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-weight:650;font-size:15.5px;cursor:pointer;text-decoration:none;transition:transform .08s ease,box-shadow .15s ease,background .15s ease}
.btn:hover{text-decoration:none;box-shadow:0 4px 14px rgba(14,22,48,.10)}
.btn:active{transform:scale(.99)}
.btn svg{width:22px;height:22px;flex:none}
.btn+.btn{margin-top:12px}
.btn.tg{background:#2AABEE;border-color:#2AABEE;color:#fff}
.btn.tg:hover{background:#229ED9}
.btn.ya{background:#0E0E10;border-color:#0E0E10;color:#fff}
@media (prefers-color-scheme: dark){.btn.ya{background:#fff;border-color:#fff;color:#0E0E10}}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.btn.ghost{background:transparent}
.btn.danger{background:transparent;color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent)}
.btn.danger:hover{background:var(--bad-soft)}
.btn[disabled]{opacity:.55;cursor:default}
.btn.small{min-height:40px;font-size:14px;padding:8px 14px;border-radius:11px;width:auto}
.legal{font-size:12.5px;color:var(--ink-3);margin:22px 0 0;line-height:1.5}
.legal a{color:var(--ink-2);text-decoration:underline}
.trust{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap;margin-top:24px;color:var(--ink-3);font-size:12.5px}
.trust span{display:inline-flex;align-items:center;gap:6px}.trust svg{width:15px;height:15px}
.msg{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;margin:0 0 20px;font-size:14px;background:var(--good-soft);color:var(--ink);border:1px solid color-mix(in srgb,var(--good) 35%,transparent)}
.msg svg{width:18px;height:18px;flex:none;margin-top:1px;color:var(--good)}
.msg.bad{background:var(--bad-soft);border-color:color-mix(in srgb,var(--bad) 35%,transparent)}.msg.bad svg{color:var(--bad)}
.panel-foot{text-align:center;font-size:12.5px;color:var(--ink-3)}
.panel-foot a{color:var(--ink-3)}

/* ——— Кабинет ——— */
.topbar{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--surface) 86%,transparent);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.topbar-in{max-width:1080px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.who{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--ink-2)}
.avatar{flex:none;display:grid;place-items:center;border-radius:50%;color:#fff;font-weight:800;background:linear-gradient(145deg,#4C7DFF,#1B2F8F);box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}
.wrap{max-width:1080px;margin:0 auto;padding:32px 24px 56px;width:100%}
.profile{position:relative;overflow:hidden;border-radius:24px;padding:32px;color:#fff;margin-bottom:24px;
  background:radial-gradient(700px 300px at 100% 0,rgba(91,131,255,.55),transparent 60%),radial-gradient(500px 260px at 0 120%,rgba(201,161,74,.25),transparent 60%),linear-gradient(150deg,var(--hero-1),var(--hero-2) 65%,var(--hero-3));box-shadow:var(--shadow-lg)}
.profile::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:40px 40px;mask-image:linear-gradient(90deg,transparent,#000);-webkit-mask-image:linear-gradient(90deg,transparent,#000)}
.profile>*{position:relative}
.profile-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.profile .avatar{width:76px;height:76px;font-size:30px;background:linear-gradient(145deg,#E9C46A,#B8862E)}
.profile h1{margin:0;font-size:30px;letter-spacing:-.02em;line-height:1.15}
.profile .meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}
.chip svg{width:14px;height:14px}
.chip.gold{color:#F3D58C;border-color:rgba(233,196,106,.4);background:rgba(233,196,106,.12)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:24px}
.box.wide{grid-column:1/-1}
.box-h{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.box-h .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);flex:none}
.box-h .ic svg{width:20px;height:20px}
.box-h h2{font-size:17px;margin:0;letter-spacing:-.01em}.box-h p{margin:0;font-size:13px;color:var(--ink-3)}
.list{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.item{display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--surface)}
.item+.item{border-top:1px solid var(--line)}
.item .pi{width:36px;height:36px;flex:none;display:grid;place-items:center;border-radius:10px;background:var(--surface-2);border:1px solid var(--line)}
.item .pi svg{width:22px;height:22px}.item .pi.tg{color:#2AABEE}.item .pi.max{color:#6C4CF1}
.item .t{flex:1;min-width:0}.item b{display:block;font-size:14.5px}
.item small{display:block;color:var(--ink-3);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:var(--good-soft);color:var(--good);white-space:nowrap}
.link-btn{background:none;border:0;padding:6px 4px;color:var(--ink-3);font:inherit;font-size:13.5px;cursor:pointer;border-radius:8px}
.link-btn:hover{color:var(--bad)}
form{margin:0}
.field{display:flex;gap:10px}
.field input{flex:1;min-width:0;min-height:46px;padding:10px 14px;border-radius:12px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:15px}
.field input:focus{outline:2px solid color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:1px;border-color:var(--brand)}
.level{display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line);margin-bottom:14px}
.meter{flex:1;height:8px;border-radius:99px;background:var(--line);overflow:hidden}
.meter i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#F2A93B,#E9C46A)}
.meter i.hi{background:linear-gradient(90deg,#16A36A,#3BD08C)}
.level b{font-size:14px}.level small{display:block;color:var(--ink-3);font-size:12.5px}
.row-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.row-btns form{flex:1 1 auto}.row-btns .btn{width:100%;white-space:nowrap}
.apps{display:grid;grid-template-columns:1fr;gap:12px}
.app{display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink)}
.app:hover{text-decoration:none;border-color:var(--line-strong);box-shadow:var(--shadow)}
.app .app-tile{width:40px;height:40px;border-radius:12px;font-size:18px}
.app .t{flex:1;min-width:0}.app b{display:block;font-size:14.5px}.app small{color:var(--ink-3);font-size:12.5px}
.app svg{width:18px;height:18px;color:var(--ink-3)}
.danger-zone{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.danger-zone .t{flex:1;min-width:240px}.danger-zone p{margin:4px 0 0;color:var(--ink-2);font-size:13.5px}
.check{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--ink-2);margin:0 0 10px}
.check input{margin-top:3px;accent-color:var(--bad)}
.foot{border-top:1px solid var(--line);color:var(--ink-3);font-size:12.5px}
.foot-in{max-width:1080px;margin:0 auto;padding:20px 24px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.foot a{color:var(--ink-3)}

/* ——— Простые страницы ——— */
.simple{flex:1;display:flex;flex-direction:column;align-items:center;padding:32px 16px}
.simple .card{max-width:520px;width:100%;margin:auto}
.simple .state{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);margin-bottom:18px}
.simple .state svg{width:26px;height:26px}
.prose p{color:var(--ink-2);margin:0 0 14px}.prose h3{font-size:15px;margin:22px 0 6px}

.mob-eco{display:none;justify-content:center;gap:8px;margin-top:20px;flex-wrap:wrap}
.mob-eco .eco-item{background:var(--surface);border-color:var(--line);color:var(--ink)}
.mob-eco .eco-item small{color:var(--ink-3)}
.mob-tag{display:none;text-align:center;color:var(--ink-2);font-size:14px;margin:6px 0 0}
@media (max-width: 900px){
  .mob-tag{display:block}
  .auth{grid-template-columns:1fr;min-height:0}
  .hero{display:none}
  .panel{padding:20px 16px 28px;min-height:100vh}
  .panel-top{display:flex;justify-content:center;padding:8px 0 4px}
  .card{padding:26px 22px;border-radius:18px}
  .card h2{font-size:23px}
  .grid{grid-template-columns:minmax(0,1fr);gap:16px}
  .wrap{padding:20px 16px 40px}
  .topbar-in{padding:10px 16px}.who .nm{display:none}
  .profile{padding:24px;border-radius:20px}.profile h1{font-size:24px}.profile .avatar{width:60px;height:60px;font-size:24px}
  .box{padding:20px;border-radius:18px}
  .foot-in{padding:16px}
  .mob-eco{display:flex}
}`;

const YEAR = new Date().getFullYear();

function doc(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#0A1440">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(I.logo.replaceAll('LGID', 'f').replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"'))}">
<style>${CSS}</style></head><body>${body}${script}</body></html>`;
}

let logoN = 0;
// У каждого логотипа на странице свой id градиента: иначе спрятанная копия «забирает» градиент у видимой.
const logo = () => I.logo.replaceAll('LGID', `lg${++logoN}`);
const brand = (href = '/account') => `<a class="brand" href="${href}"><span class="mark">${logo()}</span><b>Nikitenok</b><span>ID</span></a>`;

const footer = () =>
  `<footer class="foot"><div class="foot-in"><span>© ${YEAR} Nikitenok. Единый аккаунт экосистемы.</span><span><a href="/privacy">Конфиденциальность</a> · <a href="/.well-known/openid-configuration">Для разработчиков</a></span></div></footer>`;

/** Обычная страница с карточкой по центру (ошибки, конфиденциальность). */
export function layout(title: string, inner: string): string {
  return doc(title, `<header class="topbar"><div class="topbar-in">${brand()}</div></header><main class="simple">${inner}</main>${footer()}`);
}

export interface LoginOpts {
  issuer: string;
  ret: string;
  link: boolean;
  appName?: string;
  telegramBot?: string;
  /** Числовой id бота (первая часть токена): нужен для своей кнопки Telegram. */
  telegramBotId?: string;
  yandex: boolean;
  error?: string;
}

function heroPanel(): string {
  const eco = ECOSYSTEM.map((a) => `<div class="eco-item"><span class="app-tile" style="--c:${a.color}">${a.mono}</span><div><b>${a.name}</b><small>${a.hint}</small></div></div>`).join('');
  return `<aside class="hero">${brand('/')}
<div class="hero-body"><div class="eyebrow">Единый аккаунт</div>
<h1>Один вход во все сервисы Nikitenok</h1>
<p class="lead">Войдите один раз — и ваш профиль, прогресс и настройки будут с вами в каждом приложении экосистемы.</p>
<ul class="features">
<li><span class="ic">${I.key}</span><div><b>Без новых паролей</b><small>Вход через Telegram или Яндекс ID за пару секунд</small></div></li>
<li><span class="ic">${I.shield}</span><div><b>Защита по стандарту OpenID Connect</b><small>Приложения не видят ваших паролей и переписки</small></div></li>
<li><span class="ic">${I.devices}</span><div><b>Все устройства под контролем</b><small>Выйти везде одним нажатием, когда нужно</small></div></li>
</ul>
<div class="eco">${eco}</div></div>
<div class="hero-foot">© ${YEAR} Nikitenok</div></aside>`;
}

export function loginPage(o: LoginOpts): string {
  const tgReady = Boolean(o.telegramBot && o.telegramBotId);
  const tg = tgReady
    ? `<button class="btn tg" type="button" id="tg-login" data-bot="${esc(o.telegramBotId)}" data-ret="${esc(o.ret)}" data-link="${o.link ? '1' : ''}" disabled>${I.telegram}<span>Войти через Telegram</span></button>`
    : '';
  const q = `return=${encodeURIComponent(o.ret)}${o.link ? '&link=1' : ''}`;
  const ya = o.yandex ? `<a class="btn ya" href="/auth/yandex/start?${esc(q)}">${I.yandex}<span>Войти с Яндекс ID</span></a>` : '';
  const ctx = o.appName && !o.link
    ? `<div class="context">${appTile(o.appName)}<div><small>Вход для продолжения в</small><b>${esc(o.appName)}</b></div></div>`
    : '';
  const head = o.link
    ? `<h2>Новый способ входа</h2><p class="sub">Подтвердите аккаунт, который хотите добавить к своему Nikitenok ID.</p>`
    : `<h2>Вход в Nikitenok ID</h2><p class="sub">Один аккаунт для всех приложений Nikitenok</p>`;
  const err = o.error ? `<div class="msg bad">${I.alert}<span>${esc(o.error)}</span></div>` : '';
  const none = !tg && !ya ? `<div class="msg bad">${I.alert}<span>Вход временно недоступен. Попробуйте позже.</span></div>` : '';
  const eco = ECOSYSTEM.map((a) => `<div class="eco-item"><span class="app-tile" style="--c:${a.color}">${a.mono}</span><div><b>${a.name}</b></div></div>`).join('');
  const body = `<div class="auth">${heroPanel()}
<section class="panel"><div class="panel-top" style="flex-direction:column;align-items:center">${brand('/')}<p class="mob-tag">Единый аккаунт экосистемы</p></div>
<div class="panel-mid"><div class="card">${err}${ctx}${head}${tg}${ya}${none}
${o.link ? '<a class="btn ghost" href="/account">Отмена</a>' : ''}
<p class="legal">Продолжая, вы соглашаетесь с <a href="/privacy">политикой конфиденциальности</a> Nikitenok ID.</p></div>
<div class="trust"><span>${I.lock}Защищённое соединение</span><span>${I.shield}OpenID Connect</span></div>
<div class="mob-eco">${eco}</div></div>
<div class="panel-foot">© ${YEAR} Nikitenok · <a href="/privacy">Конфиденциальность</a></div></section></div>`;
  // Своя кнопка Telegram: скрипт виджета открывает окно подтверждения и возвращает подписанные данные,
  // мы передаём их на /auth/telegram — там проверяется подпись, как у обычного виджета.
  const script = tgReady
    ? `<script async src="https://telegram.org/js/telegram-widget.js?22" nonce="{{nonce}}"></script>
<script nonce="{{nonce}}">(function(){var b=document.getElementById('tg-login');function ready(){return window.Telegram&&Telegram.Login&&Telegram.Login.auth}
var n=0,t=setInterval(function(){if(ready()||++n>100){clearInterval(t);if(ready())b.disabled=false;else b.querySelector('span').textContent='Telegram недоступен';}},100);
b.addEventListener('click',function(){Telegram.Login.auth({bot_id:b.dataset.bot,request_access:'write',lang:'ru'},function(d){if(!d)return;var q=new URLSearchParams();for(var k in d)q.set(k,d[k]);q.set('return',b.dataset.ret);if(b.dataset.link)q.set('link','1');location.href='/auth/telegram?'+q.toString();});});})();</script>`
    : '';
  return doc(o.link ? 'Новый способ входа — Nikitenok ID' : 'Вход — Nikitenok ID', body, script);
}

const PROVIDER: Record<string, string> = { tg: 'Telegram', ya: 'Яндекс ID', max: 'Max' };
export const providerName = (login: string) => PROVIDER[login.slice(0, login.indexOf(':'))] ?? login;
const providerIcon = (login: string) => {
  const p = login.slice(0, login.indexOf(':'));
  return `<span class="pi ${p}">${p === 'tg' ? I.telegram : p === 'ya' ? I.yandex : I.max}</span>`;
};

export interface AccountView {
  name: string;
  nid: string;
  created: number;
  identities: Identity[];
  sessions: number;
  csrf: string;
  msg?: { text: string; bad?: boolean };
  canLink: { tg: boolean; ya: boolean };
  apps: { name: string; url: string }[];
}

const day = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const initials = (name: string) => (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'N').toUpperCase();
const APP_HINT: Record<string, string> = { Свобода: 'Жизнь без вредных привычек', Арена: 'Тренировки и дуэли', Семья: 'Семейный бюджет' };

export function accountPage(v: AccountView): string {
  const hidden = `<input type="hidden" name="csrf" value="${esc(v.csrf)}">`;
  const one = v.identities.length <= 1;
  const ids = v.identities
    .map(
      (i, n) => `<div class="item">${providerIcon(i.login)}<div class="t"><b>${esc(providerName(i.login))}</b><small>${esc(i.name || i.login)} · привязан ${esc(day(i.linked))}</small></div>
${n === 0 ? '<span class="badge">Основной</span>' : ''}${one ? '' : `<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="unlink"><input type="hidden" name="login" value="${esc(i.login)}"><button class="link-btn" type="submit">Отвязать</button></form>`}</div>`,
    )
    .join('');
  const has = (p: string) => v.identities.some((i) => i.login.startsWith(p + ':'));
  const missing = [v.canLink.tg && !has('tg') ? 'Telegram' : '', v.canLink.ya && !has('ya') ? 'Яндекс ID' : ''].filter(Boolean);
  const add = missing.length ? `<a class="btn ghost" href="/login?link=1&amp;return=%2Faccount" style="margin-top:14px">+ Привязать ${esc(missing.join(' или '))}</a>` : '';
  const strong = v.identities.length >= 2;
  const level = `<div class="level"><div style="min-width:140px"><b>${strong ? 'Высокий уровень защиты' : 'Базовый уровень защиты'}</b><small>${strong ? 'Два способа входа' : 'Добавьте второй способ входа'}</small></div><div class="meter"><i class="${strong ? 'hi' : ''}" style="width:${strong ? 100 : 50}%"></i></div></div>`;
  const apps = v.apps
    .map((a) => `<a class="app" href="${esc(a.url)}">${appTile(a.name)}<div class="t"><b>${esc(a.name)}</b><small>${esc(APP_HINT[a.name] ?? a.url.replace(/^https:\/\//, '').replace(/\/$/, ''))}</small></div>${I.arrow}</a>`)
    .join('');
  const msg = v.msg ? `<div class="msg${v.msg.bad ? ' bad' : ''}">${v.msg.bad ? I.alert : I.check}<span>${esc(v.msg.text)}</span></div>` : '';
  const body = `<header class="topbar"><div class="topbar-in">${brand()}<div class="who"><span class="nm">${esc(v.name)}</span><span class="avatar" style="width:34px;height:34px;font-size:14px">${esc(initials(v.name))}</span></div></div></header>
<main class="wrap">${msg}
<section class="profile"><div class="profile-row"><span class="avatar">${esc(initials(v.name))}</span><div><h1>${esc(v.name)}</h1>
<div class="meta"><span class="chip gold">${I.shield}Nikitenok ID</span><span class="chip">С нами с ${esc(day(v.created))}</span><span class="chip">${I.devices}${v.sessions} ${plural(v.sessions, 'устройство', 'устройства', 'устройств')}</span></div></div></div></section>
<div class="grid">
<section class="box"><div class="box-h"><span class="ic">${I.user}</span><div><h2>Личные данные</h2><p>Так вас видят в приложениях</p></div></div>
<div class="list" style="margin-bottom:14px"><div class="item"><span class="pi">${I.key}</span><div class="t"><b>Номер аккаунта</b><small>${esc(v.nid)}</small></div></div></div>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="rename"><label class="field"><input type="text" name="name" maxlength="60" value="${esc(v.name)}" aria-label="Имя" autocomplete="name"><button class="btn primary small" type="submit">Сохранить</button></label></form></section>
<section class="box"><div class="box-h"><span class="ic">${I.shield}</span><div><h2>Безопасность</h2><p>Защита аккаунта и устройства</p></div></div>${level}
<div class="row-btns"><form method="post" action="/account">${hidden}<input type="hidden" name="action" value="logout_all"><button class="btn ghost small" type="submit">Выйти на других устройствах</button></form>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="logout"><button class="btn ghost small" type="submit">Выйти</button></form></div></section>
<section class="box"><div class="box-h"><span class="ic">${I.key}</span><div><h2>Способы входа</h2><p>Через них вы входите в Nikitenok ID</p></div></div><div class="list">${ids}</div>${add}</section>
<section class="box"><div class="box-h"><span class="ic">${I.grid}</span><div><h2>Приложения экосистемы</h2><p>Входите в них с этим аккаунтом</p></div></div><div class="apps">${apps || '<p class="sub">Скоро здесь появятся приложения.</p>'}</div></section>
<section class="box wide"><form method="post" action="/account" class="danger-zone">${hidden}<input type="hidden" name="action" value="delete"><div class="t"><b>Удаление аккаунта</b><p>Nikitenok ID и все привязки удалятся сразу. Данные внутри приложений останутся — их можно удалить в настройках каждого приложения.</p></div>
<div><label class="check"><input type="checkbox" name="sure" value="1" required> Я понимаю, что это действие необратимо</label><button class="btn danger small" type="submit">${I.trash}Удалить Nikitenok ID</button></div></form></section>
</div></main>${footer()}`;
  return doc('Мой аккаунт — Nikitenok ID', body);
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export const errorPage = (title: string, text: string) =>
  layout(title, `<div class="card"><div class="state">${I.alert}</div><h2>${esc(title)}</h2><p class="sub">${esc(text)}</p><a class="btn primary" href="/account">Перейти в аккаунт</a></div>`);

export const privacyPage = () =>
  layout(
    'Конфиденциальность — Nikitenok ID',
    `<div class="card prose"><div class="state">${I.shield}</div><h2>Конфиденциальность</h2>
<p>Nikitenok ID хранит только то, что нужно для входа: номер аккаунта, имя, номера аккаунтов Telegram, Яндекса или Max, которые вы привязали, и открытые сессии браузера. Пароли и переписку мы не получаем и не храним.</p>
<h3>Что получают приложения</h3><p>Приложениям экосистемы Nikitenok мы передаём номер вашего Nikitenok ID, имя и привязанные способы входа — чтобы они узнали вас и сохранили ваш прогресс. Третьим лицам данные не передаются.</p>
<h3>Удаление</h3><p>Удалить аккаунт можно в разделе «Мой аккаунт»: данные удаляются сразу, резервные копии хранятся не дольше 14 дней.</p>
<a class="btn primary" href="/account">Перейти в аккаунт</a></div>`,
  );
