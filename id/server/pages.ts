// HTML-страницы Nikitenok ID: главная с сервисами экосистемы, вход, кабинет, ошибки, конфиденциальность.
// Без сборки и внешних файлов: всё в одном ответе, шрифты системные, тёмная «премиальная» тема.
// Скрипты на странице идут с nonce — его подставляет app.ts ({{nonce}}).
import { SERVICES, type Service } from './services';
import type { Identity } from './store';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ——— Иконки (inline SVG, цвет — currentColor) ———
const st = (d: string, w = 1.8) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;
const I = {
  logo: `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="LGID" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6E93FF"/><stop offset=".55" stop-color="#2F4FD8"/><stop offset="1" stop-color="#121C66"/></linearGradient><linearGradient id="LGIDg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBEBB5"/><stop offset="1" stop-color="#C9973C"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#LGID)"/><rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".22"/><path d="M12 28V12h3.2l9.6 10.4V12H28v16h-3.2L15.2 17.6V28z" fill="#fff"/><circle cx="31" cy="9" r="3" fill="url(#LGIDg)"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.6 19.9c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.3-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L5.9 13.4 1 11.9c-1.1-.3-1.1-1.1.2-1.6L20.5 2.9c.9-.3 1.7.2 1.4 1.4z"/></svg>`,
  yandex: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#FC3F1D"/><path fill="#fff" d="M13.6 6.2h-1.1c-2 0-3.1 1-3.1 2.6 0 1.8.8 2.6 2.4 3.6l1.3.9-3.7 5.5H7l3.3-4.9c-1.9-1.4-3-2.6-3-4.9 0-2.8 2-4.7 5.2-4.7h3.4v14.5h-2.3z"/></svg>`,
  max: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="currentColor"/><path fill="#fff" d="M6.5 16.5v-9h2l3.5 5 3.5-5h2v9h-2.2v-5.4L12 15.6l-3.3-4.5v5.4z"/></svg>`,
  shield: st('<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>'),
  lock: st('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  key: st('<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 2 2m-4 0 1.5 1.5"/>'),
  grid: st('<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'),
  devices: st('<rect x="3" y="5" width="13" height="10" rx="1.8"/><path d="M1.5 18.5h16"/><rect x="17.5" y="9" width="5" height="10" rx="1.4"/>'),
  user: st('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>'),
  trash: st('<path d="M4.5 7h15M9.5 7V4.8h5V7m-8 0 .8 12.2c.1.9.8 1.6 1.7 1.6h6c.9 0 1.6-.7 1.7-1.6L17.5 7"/>'),
  check: st('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.2),
  arrow: st('<path d="M5 12h14M13 6l6 6-6 6"/>', 2),
  chev: st('<path d="M9 5l7 7-7 7"/>', 2),
  alert: st('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.3"/>'),
  bolt: st('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>'),
  eye: st('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  code: st('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
  sparkle: st('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>'),
  logout: st('<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h10"/>'),
  nfc: st('<path d="M8 8.5a5 5 0 0 1 0 7M11.5 6a8.5 8.5 0 0 1 0 12M15 3.5a12 12 0 0 1 0 17"/>', 1.6),
};

const CSS = `
:root{color-scheme:dark;
  --bg:#04060D;--bg-2:#070B17;--ink:#F3F5FB;--ink-2:#AAB3CC;--ink-3:#707A98;
  --line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);--glass:rgba(255,255,255,.035);--glass-2:rgba(255,255,255,.06);
  --brand:#6E93FF;--brand-2:#2F4FD8;--gold-1:#FBEBB5;--gold-2:#D9AE55;--gold-3:#9C7428;
  --good:#3BD08C;--bad:#FF6B6B;--r:28px;
  --font:"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.55 var(--font);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden}
a{color:inherit;text-decoration:none}
svg{display:block}
::selection{background:rgba(110,147,255,.35)}

/* ——— Небо: сияние, сетка, звёзды ——— */
.sky{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:radial-gradient(1200px 700px at 50% -20%,#0E1A4D 0,transparent 70%),var(--bg)}
.sky i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;animation:drift 26s ease-in-out infinite alternate}
.sky i:nth-child(1){width:620px;height:620px;left:-160px;top:-180px;background:#2B48E8}
.sky i:nth-child(2){width:520px;height:520px;right:-140px;top:120px;background:#6A3DF0;opacity:.38;animation-duration:32s}
.sky i:nth-child(3){width:460px;height:460px;left:30%;top:60%;background:#C9973C;opacity:.16;animation-duration:38s}
.sky::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse 80% 60% at 50% 0,#000 20%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 0,#000 20%,transparent 75%)}
.sky::after{content:"";position:absolute;inset:0;background-image:radial-gradient(1px 1px at 12% 22%,rgba(255,255,255,.7),transparent),radial-gradient(1px 1px at 78% 12%,rgba(255,255,255,.55),transparent),radial-gradient(1.5px 1.5px at 64% 38%,rgba(251,235,181,.7),transparent),radial-gradient(1px 1px at 32% 70%,rgba(255,255,255,.4),transparent),radial-gradient(1px 1px at 88% 64%,rgba(255,255,255,.5),transparent),radial-gradient(1px 1px at 45% 12%,rgba(255,255,255,.45),transparent),radial-gradient(1.5px 1.5px at 22% 48%,rgba(110,147,255,.8),transparent)}
@keyframes drift{to{transform:translate(80px,60px) scale(1.12)}}

/* ——— Общие элементы ——— */
.container{width:100%;max-width:1200px;margin:0 auto;padding:0 28px}
.brand{display:inline-flex;align-items:center;gap:11px;font-size:18px;letter-spacing:-.01em;white-space:nowrap}
.brand .mark{width:36px;height:36px;filter:drop-shadow(0 6px 18px rgba(47,79,216,.55))}
.brand b{font-weight:800}.brand span{font-weight:500;color:var(--ink-2)}
.gold{background:linear-gradient(100deg,var(--gold-1) 0,var(--gold-2) 40%,var(--gold-1) 62%,var(--gold-2) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shine 8s linear infinite}
@keyframes shine{to{background-position:-200% 0}}
.eyebrow{display:inline-flex;align-items:center;gap:10px;padding:7px 14px 7px 8px;border-radius:999px;background:var(--glass-2);border:1px solid var(--line-2);font-size:13px;font-weight:600;color:var(--ink-2);backdrop-filter:blur(10px)}
.eyebrow em{font-style:normal;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1A1405;background:linear-gradient(135deg,var(--gold-1),var(--gold-2))}
.kicker{font-size:12.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-2)}
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:12px 22px;border-radius:15px;border:1px solid var(--line-2);background:var(--glass-2);color:var(--ink);font:inherit;font-weight:650;font-size:15.5px;cursor:pointer;white-space:nowrap;transition:transform .15s ease,box-shadow .25s ease,background .2s ease,border-color .2s ease;backdrop-filter:blur(10px)}
.btn:hover{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.09)}
.btn:active{transform:scale(.985)}
.btn svg{width:20px;height:20px;flex:none}
.btn.gold-btn{border:0;color:#1A1405;background:linear-gradient(135deg,#FCEFC2,#E2B860 45%,#B98A33);box-shadow:0 10px 30px -8px rgba(217,174,85,.65),inset 0 1px 0 rgba(255,255,255,.6)}
.btn.gold-btn:hover{box-shadow:0 16px 40px -8px rgba(217,174,85,.8),inset 0 1px 0 rgba(255,255,255,.6);transform:translateY(-1px)}
.btn.blue{border:0;color:#fff;background:linear-gradient(135deg,#7A9BFF,#3557E6 55%,#2440C4);box-shadow:0 10px 30px -8px rgba(53,87,230,.7),inset 0 1px 0 rgba(255,255,255,.3)}
.btn.tg{border:0;color:#fff;background:linear-gradient(135deg,#3DBBF5,#1E96D6);box-shadow:0 10px 28px -10px rgba(42,171,238,.8),inset 0 1px 0 rgba(255,255,255,.3)}
.btn.tg:hover{transform:translateY(-1px)}
.btn.ya{border:0;color:#0E0E10;background:#fff;box-shadow:0 10px 28px -12px rgba(255,255,255,.5)}
.btn.ya:hover{transform:translateY(-1px)}
.btn.danger{color:var(--bad);border-color:rgba(255,107,107,.35);background:rgba(255,107,107,.06)}
.btn.danger:hover{background:rgba(255,107,107,.12)}
.btn.small{min-height:42px;font-size:14px;padding:8px 16px;border-radius:12px}
.btn.wide{width:100%}
.btn[disabled]{opacity:.55;cursor:default;transform:none}
.glass{position:relative;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));border:1px solid var(--line);border-radius:var(--r);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 30px 80px -40px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06)}
.msg{display:flex;gap:10px;align-items:flex-start;padding:13px 16px;border-radius:14px;margin:0 0 20px;font-size:14px;background:rgba(59,208,140,.08);border:1px solid rgba(59,208,140,.3)}
.msg svg{width:18px;height:18px;flex:none;margin-top:1px;color:var(--good)}
.msg.bad{background:rgba(255,107,107,.08);border-color:rgba(255,107,107,.32)}.msg.bad svg{color:var(--bad)}

/* ——— Шапка ——— */
.nav{position:sticky;top:0;z-index:20;border-bottom:1px solid transparent;transition:background .3s,border-color .3s}
.nav{background:rgba(4,6,13,.6);backdrop-filter:saturate(1.6) blur(18px);-webkit-backdrop-filter:saturate(1.6) blur(18px);border-bottom-color:var(--line)}
.nav-in{display:flex;align-items:center;gap:28px;height:72px}
.nav-links{display:flex;gap:4px;margin-left:12px}
.nav-links a{padding:8px 14px;border-radius:10px;color:var(--ink-2);font-size:14.5px;font-weight:550}
.nav-links a:hover{color:var(--ink);background:var(--glass-2)}
.nav-cta{margin-left:auto;display:flex;align-items:center;gap:12px}
.me{display:inline-flex;align-items:center;gap:10px;padding:5px 14px 5px 5px;border-radius:999px;border:1px solid var(--line-2);background:var(--glass-2);font-size:14px;font-weight:600}
.me:hover{border-color:rgba(255,255,255,.28)}
.avatar{flex:none;display:grid;place-items:center;border-radius:50%;color:#1A1405;font-weight:800;background:linear-gradient(145deg,#FCEFC2,#D9AE55 55%,#9C7428);box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.me .avatar{width:32px;height:32px;font-size:13px}

/* ——— Главная: первый экран ——— */
.hero{padding:72px 0 40px;overflow-x:clip}
.hero-in{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:48px;align-items:center}
.hero h1{font-size:clamp(42px,5.6vw,76px);line-height:1.02;letter-spacing:-.04em;font-weight:800;margin:26px 0 22px}
.hero .lead{font-size:clamp(17px,1.5vw,19.5px);line-height:1.6;color:var(--ink-2);max-width:540px;margin:0 0 36px}
.hero-ctas{display:flex;gap:14px;flex-wrap:wrap}
.hero-ctas .btn{min-height:58px;padding:14px 26px;font-size:16px;border-radius:17px}
.proof{display:flex;align-items:center;gap:14px;margin-top:36px;color:var(--ink-3);font-size:13.5px}
.proof .stack{display:flex}
.proof .stack span{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;border:2px solid var(--bg);margin-left:-8px;background:linear-gradient(145deg,var(--c1),var(--c2))}
.proof .stack span:first-child{margin-left:0}
.proof .stack svg{width:17px;height:17px}

/* Карта Nikitenok ID */
.scene{position:relative;height:480px;perspective:1400px;display:grid;place-items:center}
.idcard{position:relative;width:min(430px,92%);aspect-ratio:1.586;border-radius:24px;padding:26px 28px;display:flex;flex-direction:column;color:#fff;overflow:hidden;transform:rotateY(var(--ry,-16deg)) rotateX(var(--rx,9deg));transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.8,.2,1);animation:float 7s ease-in-out infinite;
  background:radial-gradient(120% 90% at 100% 0,rgba(110,147,255,.55),transparent 55%),radial-gradient(90% 80% at 0 100%,rgba(217,174,85,.28),transparent 60%),linear-gradient(140deg,#18236A,#0B1240 55%,#060A24);
  border:1px solid rgba(255,255,255,.16);box-shadow:0 60px 120px -40px rgba(30,60,220,.65),0 30px 60px -30px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.25)}
.idcard::before{content:"";position:absolute;inset:0;background-image:repeating-radial-gradient(circle at 115% -20%,rgba(255,255,255,.07) 0 1px,transparent 1px 14px);opacity:.7}
.idcard::after{content:"";position:absolute;top:-60%;left:-60%;width:60%;height:220%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);transform:rotate(18deg);animation:sheen 6.5s ease-in-out infinite}
.idcard>*{position:relative;z-index:1}
@keyframes float{50%{translate:0 -12px}}
@keyframes sheen{0%,55%{left:-60%}100%{left:140%}}
.idc-top{display:flex;align-items:center;justify-content:space-between}
.idc-top .brand{font-size:16px}.idc-top .brand .mark{width:30px;height:30px}
.idc-top>svg{width:26px;height:26px;opacity:.8}
.chip-ic{width:52px;height:40px;border-radius:9px;margin:auto 0 16px;background:linear-gradient(135deg,#FCEFC2,#D9AE55 50%,#9C7428);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 4px 12px rgba(0,0,0,.35);position:relative}
.chip-ic::before{content:"";position:absolute;inset:8px 6px;border:1.5px solid rgba(80,55,10,.45);border-radius:5px;background:linear-gradient(90deg,transparent 46%,rgba(80,55,10,.45) 46% 54%,transparent 54%),linear-gradient(0deg,transparent 46%,rgba(80,55,10,.45) 46% 54%,transparent 54%)}
.idc-num{font-family:var(--mono);font-size:clamp(14px,1.6vw,18px);letter-spacing:.18em;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.4);margin-bottom:14px;white-space:nowrap}
.idc-bot{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.idc-bot small{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55)}
.idc-bot b{font-size:16px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:240px}
.idc-seal{font-size:11px;font-weight:800;letter-spacing:.14em;padding:5px 10px;border-radius:999px;color:#1A1405;background:linear-gradient(135deg,var(--gold-1),var(--gold-2))}
.orb{position:absolute;width:62px;height:62px;border-radius:19px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,var(--c1),var(--c2));box-shadow:0 18px 40px -12px var(--c2),inset 0 1px 0 rgba(255,255,255,.45);animation:float 6s ease-in-out infinite;z-index:2}
.orb svg{width:28px;height:28px}
.orb::after{content:"";position:absolute;inset:-1px;border-radius:inherit;border:1px solid rgba(255,255,255,.25)}
.orb.o1{left:2%;top:8%;animation-delay:-1s}.orb.o2{right:4%;top:2%;animation-delay:-2.5s;width:54px;height:54px}
.orb.o3{right:-1%;top:58%;animation-delay:-4s}.orb.o4{left:6%;bottom:4%;animation-delay:-3s;width:56px;height:56px}
.orb.o5{left:46%;bottom:-2%;animation-delay:-5s;width:50px;height:50px;border-radius:16px}
.orb.o5 svg,.orb.o2 svg{width:24px;height:24px}
.ring{position:absolute;width:118%;aspect-ratio:1;border-radius:50%;border:1px dashed rgba(255,255,255,.08);animation:spin 80s linear infinite}
.ring.r2{width:86%;border-style:solid;border-color:rgba(217,174,85,.12);animation-duration:120s;animation-direction:reverse}
@keyframes spin{to{transform:rotate(360deg)}}

/* Цифры */
.stats{margin:32px 0 0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-radius:24px;overflow:hidden}
.stat{padding:26px 28px}
.stat+.stat{border-left:1px solid var(--line)}
.stat b{display:block;font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.stat small{color:var(--ink-3);font-size:13.5px}

/* ——— Разделы ——— */
.section{padding:110px 0 0}
.sec-head{max-width:720px;margin:0 0 48px}
.sec-head.center{margin:0 auto 52px;text-align:center}
.sec-head h2{font-size:clamp(32px,4vw,54px);line-height:1.05;letter-spacing:-.035em;margin:14px 0 16px;font-weight:800}
.sec-head p{font-size:17.5px;color:var(--ink-2);margin:0}

/* Карточки сервисов */
.bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:20px}
.svc{grid-column:span 2;position:relative;display:flex;flex-direction:column;padding:30px;border-radius:var(--r);overflow:hidden;isolation:isolate;min-height:400px;
  background:radial-gradient(90% 70% at 100% 0,color-mix(in srgb,var(--c1) 22%,transparent),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015));
  border:1px solid var(--line);box-shadow:0 40px 80px -50px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.07);transition:transform .35s cubic-bezier(.2,.8,.2,1),border-color .3s,box-shadow .35s}
.svc.big{grid-column:span 3;min-height:440px}
.svc::before{content:"";position:absolute;inset:0;z-index:-1;opacity:0;transition:opacity .35s;background:radial-gradient(420px circle at var(--mx,50%) var(--my,0),color-mix(in srgb,var(--c1) 28%,transparent),transparent 60%)}
.svc::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;z-index:-1;background:linear-gradient(140deg,color-mix(in srgb,var(--c1) 70%,transparent),transparent 35%,transparent 70%,color-mix(in srgb,var(--c2) 50%,transparent));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.55;transition:opacity .35s}
.svc:hover{transform:translateY(-6px);box-shadow:0 50px 100px -40px color-mix(in srgb,var(--c2) 60%,transparent),inset 0 1px 0 rgba(255,255,255,.1)}
.svc:hover::before{opacity:1}.svc:hover::after{opacity:1}
.svc .art{position:absolute;right:-50px;bottom:-60px;width:280px;height:280px;color:var(--c1);opacity:.07;z-index:-1;transition:transform .6s cubic-bezier(.2,.8,.2,1),opacity .4s}
.svc.big .art{width:340px;height:340px}
.svc .art svg{width:100%;height:100%}
.svc:hover .art{transform:rotate(-8deg) scale(1.06);opacity:.12}
.svc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:26px}
.svc-ic{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,var(--c1),var(--c2));box-shadow:0 16px 36px -12px var(--c2),inset 0 1px 0 rgba(255,255,255,.45);position:relative}
.svc-ic::after{content:"";position:absolute;inset:0;border-radius:inherit;border:1px solid rgba(255,255,255,.25)}
.svc-ic svg{width:30px;height:30px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;border:1px solid var(--line-2);color:var(--ink-2);background:rgba(0,0,0,.25)}
.pill svg{width:13px;height:13px}
.pill.on{color:#1A1405;border-color:transparent;background:linear-gradient(135deg,var(--gold-1),var(--gold-2))}
.svc h3{margin:0 0 6px;font-size:25px;letter-spacing:-.025em;font-weight:800;line-height:1.15}
.svc.big h3{font-size:30px}
.svc .tag{margin:0 0 14px;color:color-mix(in srgb,var(--c1) 70%,#fff);font-weight:650;font-size:15px}
.svc p.txt{margin:0 0 20px;color:var(--ink-2);font-size:14.5px;line-height:1.6}
.svc ul{list-style:none;margin:0 0 26px;padding:0;display:grid;gap:9px}
.svc li{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--ink)}
.svc li i{flex:none;width:20px;height:20px;border-radius:7px;display:grid;place-items:center;color:var(--c1);background:color-mix(in srgb,var(--c1) 16%,transparent)}
.svc li i svg{width:12px;height:12px}
.svc-foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:18px;border-top:1px solid var(--line)}
.svc-foot small{display:block;font-size:12px;color:var(--ink-3)}
.svc-foot code{font-family:var(--mono);font-size:13px;color:var(--ink-2)}
.go{width:44px;height:44px;flex:none;border-radius:14px;display:grid;place-items:center;background:var(--glass-2);border:1px solid var(--line-2);transition:background .3s,transform .3s,color .3s}
.go svg{width:18px;height:18px}
.svc:hover .go{background:linear-gradient(145deg,var(--c1),var(--c2));border-color:transparent;transform:translateX(3px)}

/* Как это работает */
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;counter-reset:s}
.step{padding:32px}
.step .n{font-size:15px;font-weight:800;font-family:var(--mono);color:var(--gold-2);display:flex;align-items:center;gap:12px;margin-bottom:22px}
.step .n::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(217,174,85,.5),transparent)}
.step h3{margin:0 0 10px;font-size:21px;letter-spacing:-.02em}
.step p{margin:0;color:var(--ink-2);font-size:14.5px}

/* Защита */
.sec-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.feat{padding:28px}
.feat .fi{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;margin-bottom:20px;color:var(--gold-1);background:linear-gradient(145deg,rgba(217,174,85,.22),rgba(217,174,85,.05));border:1px solid rgba(217,174,85,.3)}
.feat .fi svg{width:23px;height:23px}
.feat h3{margin:0 0 8px;font-size:17px;letter-spacing:-.01em}
.feat p{margin:0;color:var(--ink-2);font-size:14px}

/* Призыв */
.cta{margin:110px 0 0;position:relative;overflow:hidden;border-radius:36px;padding:72px 56px;text-align:center;
  background:radial-gradient(60% 120% at 50% 0,rgba(110,147,255,.45),transparent 70%),radial-gradient(50% 100% at 50% 120%,rgba(217,174,85,.25),transparent 70%),linear-gradient(160deg,#101A55,#070C2A);border:1px solid var(--line-2)}
.cta::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse at center,#000,transparent 70%);-webkit-mask-image:radial-gradient(ellipse at center,#000,transparent 70%)}
.cta>*{position:relative}
.cta h2{font-size:clamp(30px,4vw,50px);letter-spacing:-.035em;line-height:1.08;margin:0 0 16px}
.cta p{color:var(--ink-2);font-size:17.5px;margin:0 auto 32px;max-width:560px}

/* Подвал */
.foot{margin-top:110px;border-top:1px solid var(--line);color:var(--ink-3);font-size:13.5px}
.foot-in{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:30px 28px}
.foot-links{display:flex;gap:22px;flex-wrap:wrap}
.foot a:hover{color:var(--ink)}

/* ——— Вход ——— */
.auth{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:100vh}
.auth-side{padding:40px 56px;display:flex;flex-direction:column;border-right:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}
.auth-side .body{margin:auto 0;max-width:520px;padding:40px 0}
.auth-side h1{font-size:clamp(36px,3.8vw,54px);line-height:1.05;letter-spacing:-.035em;margin:22px 0 18px;font-weight:800}
.auth-side .lead{color:var(--ink-2);font-size:17px;margin:0 0 34px;max-width:460px}
.mini{display:grid;gap:10px}
.mini a{display:flex;align-items:center;gap:14px;padding:12px 16px 12px 12px;border-radius:18px;border:1px solid var(--line);background:var(--glass);transition:border-color .2s,background .2s,transform .2s}
.mini a:hover{border-color:var(--line-2);background:var(--glass-2);transform:translateX(4px)}
.mini .t{flex:1;min-width:0}.mini b{display:block;font-size:15px}.mini small{display:block;color:var(--ink-3);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini .chev{width:16px;height:16px;color:var(--ink-3)}
.tile{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,var(--c1),var(--c2));box-shadow:0 10px 24px -10px var(--c2),inset 0 1px 0 rgba(255,255,255,.4)}
.tile svg{width:22px;height:22px}
.auth-side .copy{font-size:12.5px;color:var(--ink-3)}
.auth-main{display:flex;flex-direction:column;padding:28px 24px}
.auth-main .mob{display:none}
.auth-mid{margin:auto;width:100%;max-width:440px;padding:24px 0}
.login{padding:40px 36px;border-radius:30px}
.login::before{content:"";position:absolute;left:36px;right:36px;top:-1px;height:1px;background:linear-gradient(90deg,transparent,var(--gold-2),transparent)}
.login .seal{width:64px;height:64px;margin:0 auto 22px;filter:drop-shadow(0 14px 30px rgba(47,79,216,.6))}
.login h2{text-align:center;font-size:28px;letter-spacing:-.025em;margin:0 0 8px;font-weight:800}
.login .sub{text-align:center;color:var(--ink-2);margin:0 0 30px}
.login .btn{width:100%}.login .btn+.btn{margin-top:12px}
.context{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:18px;background:var(--glass);border:1px solid var(--line-2);margin:0 0 26px}
.context small{display:block;color:var(--ink-3);font-size:12.5px}.context b{font-size:15px}
.or{display:flex;align-items:center;gap:14px;color:var(--ink-3);font-size:12.5px;margin:18px 0}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.legal{font-size:12.5px;color:var(--ink-3);margin:24px 0 0;text-align:center;line-height:1.55}
.legal a{color:var(--ink-2);text-decoration:underline;text-decoration-color:var(--line-2)}
.trust{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;margin-top:26px;color:var(--ink-3);font-size:12.5px}
.trust span{display:inline-flex;align-items:center;gap:7px}.trust svg{width:15px;height:15px;color:var(--gold-2)}
.mob-eco{display:none;justify-content:center;gap:10px;margin-top:28px}
.mob-eco .tile{width:40px;height:40px;border-radius:13px}.mob-eco .tile svg{width:20px;height:20px}
.auth-foot{text-align:center;font-size:12.5px;color:var(--ink-3)}
.auth-foot a:hover{color:var(--ink)}

/* ——— Кабинет ——— */
.wrap{padding:40px 0 0}
.profile{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:32px;align-items:center;padding:40px;border-radius:32px;overflow:hidden;margin-bottom:24px;
  background:radial-gradient(70% 120% at 100% 0,rgba(110,147,255,.35),transparent 60%),radial-gradient(50% 100% at 0 120%,rgba(217,174,85,.18),transparent 60%),linear-gradient(160deg,rgba(20,32,100,.6),rgba(8,12,40,.6))}
.profile .avatar{width:88px;height:88px;font-size:34px;box-shadow:0 0 0 4px rgba(217,174,85,.18),0 20px 40px -14px rgba(217,174,85,.6),inset 0 1px 0 rgba(255,255,255,.6)}
.p-row{display:flex;align-items:center;gap:24px;min-width:0}
.p-row>div{min-width:0}
.profile h1{margin:8px 0 12px;font-size:clamp(28px,3.2vw,40px);letter-spacing:-.03em;line-height:1.1;overflow-wrap:anywhere}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--ink-2);background:rgba(255,255,255,.06);border:1px solid var(--line-2)}
.chip svg{width:14px;height:14px}
.chip.gold{color:var(--gold-1);border-color:rgba(217,174,85,.4);background:rgba(217,174,85,.1)}
.profile .idcard{width:340px;padding:20px 22px;border-radius:20px;--ry:-10deg;--rx:6deg}
.profile .idcard .idc-num{font-size:14px;margin-bottom:10px}
.profile .chip-ic{width:42px;height:32px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.box{padding:28px;border-radius:26px}
.box.wide{grid-column:1/-1}
.box-h{display:flex;align-items:center;gap:14px;margin-bottom:22px}
.box-h .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none;color:var(--gold-1);background:linear-gradient(145deg,rgba(217,174,85,.2),rgba(217,174,85,.04));border:1px solid rgba(217,174,85,.28)}
.box-h .ic svg{width:21px;height:21px}
.box-h h2{font-size:18.5px;margin:0;letter-spacing:-.015em}.box-h p{margin:2px 0 0;font-size:13.5px;color:var(--ink-3)}
.list{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:rgba(0,0,0,.18)}
.item{display:flex;align-items:center;gap:14px;padding:15px 18px}
.item+.item{border-top:1px solid var(--line)}
.item .pi{width:40px;height:40px;flex:none;display:grid;place-items:center;border-radius:12px;background:var(--glass-2);border:1px solid var(--line)}
.item .pi svg{width:22px;height:22px}.item .pi.tg{color:#3DBBF5}.item .pi.max{color:#8B6CFF}
.item .t{flex:1;min-width:0}.item b{display:block;font-size:15px}
.item small{display:block;color:var(--ink-3);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item code{font-family:var(--mono);font-size:13px;color:var(--ink-2)}
.badge{font-size:11.5px;font-weight:800;padding:4px 9px;border-radius:999px;color:#1A1405;background:linear-gradient(135deg,var(--gold-1),var(--gold-2));white-space:nowrap}
.link-btn{background:none;border:0;padding:6px 8px;color:var(--ink-3);font:inherit;font-size:13.5px;cursor:pointer;border-radius:9px}
.link-btn:hover{color:var(--bad);background:rgba(255,107,107,.08)}
form{margin:0}
.field{display:flex;gap:10px;margin-top:16px}
.field input{flex:1;min-width:0;min-height:46px;padding:10px 16px;border-radius:13px;border:1px solid var(--line-2);background:rgba(0,0,0,.25);color:var(--ink);font:inherit;font-size:15px}
.field input:focus{outline:0;border-color:var(--brand);box-shadow:0 0 0 4px rgba(110,147,255,.18)}
.level{display:flex;align-items:center;gap:20px;padding:20px;border-radius:18px;background:rgba(0,0,0,.18);border:1px solid var(--line);margin-bottom:16px}
.ring-meter{--p:50;flex:none;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--col,#E2B860) calc(var(--p)*1%),rgba(255,255,255,.08) 0)}
.ring-meter::before{content:attr(data-v);width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:#0A0F22;font-weight:800;font-size:16px}
.level b{font-size:16px;display:block}.level small{display:block;color:var(--ink-3);font-size:13px;margin-top:3px}
.row-btns{display:flex;gap:10px;flex-wrap:wrap}
.row-btns form{flex:1 1 180px}.row-btns .btn{width:100%}
.svc-mini{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
.sm{position:relative;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:22px;border:1px solid var(--line);overflow:hidden;isolation:isolate;
  background:radial-gradient(100% 80% at 100% 0,color-mix(in srgb,var(--c1) 18%,transparent),transparent 60%),rgba(0,0,0,.18);transition:transform .3s,border-color .3s}
.sm:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--c1) 45%,transparent)}
.sm-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.sm .t{min-width:0;flex:1}.sm b{display:block;font-size:15.5px;line-height:1.3}.sm small{display:block;color:var(--ink-3);font-size:12.5px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm .pill{margin-top:auto;align-self:flex-start}
.sm .go{width:38px;height:38px;border-radius:12px}
.sm:hover .go{background:linear-gradient(145deg,var(--c1),var(--c2));border-color:transparent}
.danger-zone{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.danger-zone .t{flex:1;min-width:240px}.danger-zone b{font-size:17px}.danger-zone p{margin:6px 0 0;color:var(--ink-2);font-size:14px}
.check{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;color:var(--ink-2);margin:0 0 12px;cursor:pointer}
.check input{margin-top:3px;accent-color:var(--bad)}

/* ——— Простые страницы ——— */
.simple{flex:1;display:flex;align-items:center;justify-content:center;padding:48px 16px}
.simple .glass{max-width:560px;width:100%;padding:44px 40px}
.simple .state{width:60px;height:60px;border-radius:18px;display:grid;place-items:center;margin-bottom:22px;color:var(--gold-1);background:linear-gradient(145deg,rgba(217,174,85,.22),rgba(217,174,85,.05));border:1px solid rgba(217,174,85,.3)}
.simple .state svg{width:28px;height:28px}
.simple h2{font-size:28px;letter-spacing:-.025em;margin:0 0 10px}
.simple .sub{color:var(--ink-2);margin:0 0 28px}
.prose p{color:var(--ink-2);margin:0 0 14px}.prose h3{font-size:16px;margin:26px 0 8px}

@media (max-width:1080px){
  .hero-in{grid-template-columns:minmax(0,1fr);gap:16px}
  .hero{padding-top:48px}
  .scene{height:420px}
  .svc,.svc.big{grid-column:span 3}
  .sec-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .profile{grid-template-columns:minmax(0,1fr)}
  .profile .idcard{display:none}
  .svc-mini{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:900px){
  .auth{grid-template-columns:minmax(0,1fr)}
  .auth-side{display:none}
  .auth-main .mob{display:flex;justify-content:center;padding:10px 0 0}
  .mob-eco{display:flex}
}
@media (max-width:760px){
  .container{padding:0 16px}
  .nav-in{height:64px;gap:12px}
  .nav-links{display:none}
  .me .nm{display:none}.me{padding:4px}
  .nav-cta .btn{min-height:42px;padding:8px 16px;font-size:14px}
  .hero{padding:36px 0 8px}
  .hero h1{margin:20px 0 16px}
  .hero-ctas .btn{flex:1 1 100%}
  .scene{height:330px}
  .orb{width:50px;height:50px;border-radius:16px}.orb svg{width:22px;height:22px}
  .orb.o2,.orb.o4,.orb.o5{width:44px;height:44px;border-radius:14px}
  .idcard{padding:20px;border-radius:20px}
  .idc-bot b{font-size:14px;max-width:170px}
  .chip-ic{width:42px;height:32px}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .stat{padding:20px}
  .stat:nth-child(3){border-left:0}
  .stat:nth-child(n+3){border-top:1px solid var(--line)}
  .stat b{font-size:28px}
  .section{padding-top:80px}
  .sec-head{margin-bottom:32px}
  .bento,.steps,.sec-grid{grid-template-columns:minmax(0,1fr);gap:14px}
  .svc,.svc.big{grid-column:auto;min-height:0;padding:24px}
  .svc h3,.svc.big h3{font-size:24px}
  .step,.feat{padding:24px}
  .cta{margin-top:80px;padding:48px 22px;border-radius:28px}
  .foot{margin-top:80px}
  .foot-in{padding:24px 16px;flex-direction:column;align-items:flex-start}
  .login{padding:30px 22px;border-radius:26px}
  .login::before{left:22px;right:22px}
  .wrap{padding-top:20px}
  .profile{padding:26px 22px;border-radius:26px}
  .profile .avatar{width:64px;height:64px;font-size:25px}
  .p-row{gap:16px}
  .grid{grid-template-columns:minmax(0,1fr);gap:14px}
  .box{padding:22px;border-radius:22px}
  .svc-mini{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .sm{padding:16px}
  .sm:last-child:nth-child(odd){grid-column:1/-1}
  .simple .glass{padding:32px 22px}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

const YEAR = new Date().getFullYear();

const SKY = '<div class="sky" aria-hidden="true"><i></i><i></i><i></i></div>';

// Свет на карточках за курсором и лёгкий наклон карты ID — только на устройствах с мышью.
const FX = `<script nonce="{{nonce}}">(function(){if(!matchMedia('(hover:hover)').matches)return;
document.querySelectorAll('.svc').forEach(function(e){e.addEventListener('pointermove',function(v){var r=e.getBoundingClientRect();e.style.setProperty('--mx',(v.clientX-r.left)+'px');e.style.setProperty('--my',(v.clientY-r.top)+'px');});});
var s=document.querySelector('.scene'),c=s&&s.querySelector('.idcard');if(!c)return;
s.addEventListener('pointermove',function(v){var r=s.getBoundingClientRect(),x=(v.clientX-r.left)/r.width-.5,y=(v.clientY-r.top)/r.height-.5;c.style.setProperty('--ry',(x*22)+'deg');c.style.setProperty('--rx',(-y*16)+'deg');});
s.addEventListener('pointerleave',function(){c.style.removeProperty('--ry');c.style.removeProperty('--rx');});})();</script>`;

function doc(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="color-scheme" content="dark"><meta name="theme-color" content="#04060D">
<meta name="description" content="Nikitenok ID — один аккаунт для всех сервисов Nikitenok: Арена, Print Control, Семейная касса, Свобода и Сервер.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(I.logo.replaceAll('LGID', 'f').replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"'))}">
<style>${CSS}</style></head><body>${SKY}${body}${script}</body></html>`;
}

let logoN = 0;
// У каждого логотипа на странице свой id градиента: иначе спрятанная копия «забирает» градиент у видимой.
const logo = () => I.logo.replaceAll('LGID', `lg${++logoN}`);
const brand = (href = '/') => `<a class="brand" href="${href}"><span class="mark">${logo()}</span><b>Nikitenok</b><span>ID</span></a>`;
const vars = (s: Service) => `--c1:${s.c1};--c2:${s.c2}`;
const tile = (s: Service, cls = 'tile') => `<span class="${cls}" style="${vars(s)}">${s.icon}</span>`;
const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const initials = (name: string) => (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'N').toUpperCase();

interface Viewer {
  name: string;
}

function nav(me?: Viewer, links = true): string {
  const right = me
    ? `<a class="me" href="/account"><span class="avatar">${esc(initials(me.name))}</span><span class="nm">${esc(me.name)}</span></a>`
    : `<a class="btn gold-btn small" href="/login?return=%2Faccount">Войти</a>`;
  const l = links
    ? `<nav class="nav-links"><a href="/#services">Сервисы</a><a href="/#how">Как это работает</a><a href="/#security">Безопасность</a>${me ? '<a href="/account">Мой аккаунт</a>' : ''}</nav>`
    : '';
  return `<header class="nav"><div class="container nav-in">${brand()}${l}<div class="nav-cta">${right}</div></div></header>`;
}

const footer = () =>
  `<footer class="foot"><div class="container foot-in" style="padding-left:28px;padding-right:28px"><span>© ${YEAR} Nikitenok · Единый аккаунт экосистемы</span><span class="foot-links"><a href="/#services">Сервисы</a><a href="/privacy">Конфиденциальность</a><a href="/.well-known/openid-configuration">Для разработчиков</a></span></div></footer>`;

/** Карта Nikitenok ID: на главной — с сервисами вокруг, в кабинете — с именем и номером. */
function idCard(name: string, num: string): string {
  return `<div class="idcard"><div class="idc-top"><span class="brand"><span class="mark">${logo()}</span><b>Nikitenok</b><span>ID</span></span>${I.nfc}</div>
<div class="chip-ic"></div><div class="idc-num">${esc(num)}</div>
<div class="idc-bot"><div><small>Владелец</small><b>${esc(name)}</b></div><span class="idc-seal">PREMIUM</span></div></div>`;
}

/** Номер аккаунта для карты: nid_… → четыре группы, середина скрыта. */
const cardNumber = (nid: string) => {
  const h = nid.replace(/^nid_/, '').replace(/[^a-z0-9]/gi, '').toUpperCase().padEnd(8, '0');
  return `${h.slice(0, 4)} •••• •••• ${h.slice(-4)}`;
};

/** Обычная страница с карточкой по центру (ошибки, конфиденциальность). */
export function layout(title: string, inner: string): string {
  return doc(title, `${nav(undefined, false)}<main class="simple">${inner}</main>${footer()}`);
}

// ——— Главная ———

export interface HomeView {
  me?: Viewer;
  /** id приложений из clients.json — у их карточек отметка «Вход через Nikitenok ID». */
  connected: string[];
}

function serviceCard(s: Service, on: boolean, big: boolean): string {
  const points = s.points.map((p) => `<li><i>${I.check}</i>${esc(p)}</li>`).join('');
  const pill = on ? `<span class="pill on">${I.check}Вход через ID</span>` : `<span class="pill">${I.sparkle}Скоро вход через ID</span>`;
  return `<a class="svc${big ? ' big' : ''}" href="${esc(s.url)}" style="${vars(s)}"><span class="art">${s.icon}</span>
<div class="svc-top">${tile(s, 'svc-ic')}${pill}</div>
<h3>${esc(s.name)}</h3><p class="tag">${esc(s.tagline)}</p><p class="txt">${esc(s.text)}</p><ul>${points}</ul>
<div class="svc-foot"><div><small>${esc(s.audience)}</small><code>${esc(host(s.url))}</code></div><span class="go">${I.arrow}</span></div></a>`;
}

export function homePage(v: HomeView): string {
  const on = (s: Service) => Boolean(s.client && v.connected.includes(s.client));
  const cards = SERVICES.map((s, i) => serviceCard(s, on(s), i < 2)).join('');
  const orbs = SERVICES.map((s, i) => `<span class="orb o${i + 1}" style="${vars(s)}">${s.icon}</span>`).join('');
  const stack = SERVICES.map((s) => `<span style="${vars(s)}">${s.icon}</span>`).join('');
  const cta = v.me
    ? `<a class="btn gold-btn" href="/account">${I.user}Мой аккаунт</a><a class="btn" href="#services">Все сервисы ${I.arrow}</a>`
    : `<a class="btn gold-btn" href="/login?return=%2Faccount">Создать Nikitenok ID ${I.arrow}</a><a class="btn" href="#services">Смотреть сервисы</a>`;
  const body = `${nav(v.me)}<main>
<section class="hero"><div class="container"><div class="hero-in"><div>
<span class="eyebrow"><em>ID</em>Единый аккаунт экосистемы Nikitenok</span>
<h1>Один аккаунт.<br><span class="gold">Все ваши сервисы.</span></h1>
<p class="lead">Nikitenok ID открывает тренировки, семейный бюджет, учёт техники и управление сервером одним входом через Telegram или Яндекс ID. Без новых паролей.</p>
<div class="hero-ctas">${cta}</div>
<div class="proof"><span class="stack">${stack}</span><span>${SERVICES.length} сервисов уже в экосистеме</span></div></div>
<div class="scene" aria-hidden="true"><span class="ring"></span><span class="ring r2"></span>${orbs}${idCard(v.me?.name ?? 'Ваше имя', v.me ? 'NIKI •••• •••• ID' : '2026 •••• •••• NKTN')}</div>
</div>
<div class="stats glass"><div class="stat"><b class="gold">${SERVICES.length}</b><small>сервисов экосистемы</small></div><div class="stat"><b>1</b><small>аккаунт на всё</small></div><div class="stat"><b>0</b><small>новых паролей</small></div><div class="stat"><b>2 сек</b><small>на вход через Telegram</small></div></div>
</div></section>

<section class="section" id="services"><div class="container">
<div class="sec-head"><span class="kicker">Экосистема</span><h2>Пять сервисов.<br><span class="gold">Один Nikitenok ID.</span></h2><p>Каждый сервис решает свою задачу, а вход у всех общий. Подключаем их по очереди: где стоит золотая отметка, вход через ID уже работает.</p></div>
<div class="bento">${cards}</div></div></section>

<section class="section" id="how"><div class="container">
<div class="sec-head center"><span class="kicker">Как это работает</span><h2>Вход за три шага</h2><p>Ничего не нужно запоминать: ваш Telegram или Яндекс и есть ключ.</p></div>
<div class="steps">
<div class="step glass"><div class="n">01</div><h3>Нажмите «Войти»</h3><p>В любом сервисе Nikitenok или здесь, на id.nikitenok.ru.</p></div>
<div class="step glass"><div class="n">02</div><h3>Подтвердите в Telegram</h3><p>Или через Яндекс ID. Пароль от аккаунта мы не видим и не храним.</p></div>
<div class="step glass"><div class="n">03</div><h3>Вы внутри</h3><p>Профиль и прогресс с вами в каждом сервисе, на телефоне и компьютере.</p></div>
</div></div></section>

<section class="section" id="security"><div class="container">
<div class="sec-head"><span class="kicker">Безопасность</span><h2>Защита уровня <span class="gold">крупных платформ</span></h2><p>Тот же стандарт, на котором работают входы больших интернет-компаний.</p></div>
<div class="sec-grid">
<div class="feat glass"><div class="fi">${I.shield}</div><h3>OpenID Connect</h3><p>Открытый стандарт входа. Сервисы получают подписанное подтверждение, а не ваши данные для входа.</p></div>
<div class="feat glass"><div class="fi">${I.key}</div><h3>Без паролей</h3><p>Нечего подобрать и нечему утечь: вход подтверждает Telegram или Яндекс.</p></div>
<div class="feat glass"><div class="fi">${I.devices}</div><h3>Контроль устройств</h3><p>Видно, где вы вошли. Выйти на всех устройствах можно одной кнопкой.</p></div>
<div class="feat glass"><div class="fi">${I.eye}</div><h3>Минимум данных</h3><p>Храним только имя и привязки входа. Аккаунт удаляется сразу и целиком.</p></div>
</div></div></section>

<section class="container"><div class="cta"><span class="kicker">Nikitenok ID</span><h2 style="margin-top:14px">Ваш ключ ко всей экосистеме</h2>
<p>Создайте аккаунт за пару секунд и входите во все сервисы Nikitenok одним касанием.</p>
<div class="hero-ctas" style="justify-content:center">${v.me ? `<a class="btn gold-btn" href="/account">Открыть мой аккаунт ${I.arrow}</a>` : `<a class="btn gold-btn" href="/login?return=%2Faccount">Войти или создать ID ${I.arrow}</a>`}</div></div></section>
</main>${footer()}`;
  return doc('Nikitenok ID — один аккаунт для всех сервисов', body, FX);
}

// ——— Вход ———

export interface LoginOpts {
  issuer: string;
  ret: string;
  link: boolean;
  appName?: string;
  telegramBot?: string;
  /** Числовой id бота (первая часть токена): нужен для своей кнопки Telegram. */
  telegramBotId?: string;
  telegramState?: string;
  yandex: boolean;
  error?: string;
}

const serviceFor = (name: string) => SERVICES.find((s) => s.short === name || s.name === name || s.client === name);

export function loginPage(o: LoginOpts): string {
  const tgReady = Boolean(o.telegramBot && o.telegramBotId);
  const tg = tgReady
    ? `<button class="btn tg" type="button" id="tg-login" data-bot="${esc(o.telegramBotId)}" data-ret="${esc(o.ret)}" data-link="${o.link ? '1' : ''}" data-state="${esc(o.telegramState || '')}" disabled>${I.telegram}<span>Войти через Telegram</span></button>`
    : '';
  const q = `return=${encodeURIComponent(o.ret)}${o.link ? '&link=1' : ''}`;
  const ya = o.yandex ? `<a class="btn ya" href="/auth/yandex/start?${esc(q)}">${I.yandex}<span>Войти с Яндекс ID</span></a>` : '';
  const app = o.appName && !o.link ? serviceFor(o.appName) : undefined;
  const ctx = o.appName && !o.link
    ? `<div class="context">${app ? tile(app) : `<span class="tile" style="--c1:#6E93FF;--c2:#2F4FD8">${I.grid}</span>`}<div><small>Вход для продолжения в</small><b>${esc(app?.name ?? o.appName)}</b></div></div>`
    : '';
  const head = o.link
    ? `<h2>Новый способ входа</h2><p class="sub">Подтвердите аккаунт, который хотите добавить к своему Nikitenok ID.</p>`
    : `<h2>Вход в Nikitenok ID</h2><p class="sub">Один аккаунт для всех сервисов Nikitenok</p>`;
  const err = o.error ? `<div class="msg bad">${I.alert}<span>${esc(o.error)}</span></div>` : '';
  const none = !tg && !ya ? `<div class="msg bad">${I.alert}<span>Вход временно недоступен. Попробуйте позже.</span></div>` : '';
  const or = tg && ya ? '<div class="or">или</div>' : '';
  const mini = SERVICES.map((s) => `<a href="${esc(s.url)}">${tile(s)}<div class="t"><b>${esc(s.name)}</b><small>${esc(s.tagline)}</small></div><span class="chev">${I.chev}</span></a>`).join('');
  const mob = SERVICES.map((s) => tile(s)).join('');
  const body = `<div class="auth"><aside class="auth-side">${brand()}
<div class="body"><span class="eyebrow"><em>ID</em>Единый аккаунт</span>
<h1>Один вход во все сервисы <span class="gold">Nikitenok</span></h1>
<p class="lead">Войдите один раз, и профиль, прогресс и настройки будут с вами в каждом сервисе экосистемы.</p>
<div class="mini">${mini}</div></div>
<div class="copy">© ${YEAR} Nikitenok</div></aside>
<section class="auth-main"><div class="mob">${brand()}</div>
<div class="auth-mid"><div class="login glass">${err}${ctx}<div class="seal">${logo()}</div>${head}${tg}${or}${ya}${none}
${o.link ? '<a class="btn" href="/account" style="margin-top:12px">Отмена</a>' : ''}
<p class="legal">Продолжая, вы соглашаетесь с <a href="/privacy">политикой конфиденциальности</a> Nikitenok ID.</p></div>
<div class="trust"><span>${I.lock}Защищённое соединение</span><span>${I.shield}OpenID Connect</span><span>${I.key}Без паролей</span></div>
<div class="mob-eco">${mob}</div></div>
<div class="auth-foot"><a href="/">id.nikitenok.ru</a> · <a href="/privacy">Конфиденциальность</a></div></section></div>`;
  // Своя кнопка Telegram: скрипт виджета открывает окно подтверждения и возвращает подписанные данные,
  // мы передаём их на /auth/telegram — там проверяется подпись, как у обычного виджета.
  const script = tgReady
    ? `<script async src="https://telegram.org/js/telegram-widget.js?22" nonce="{{nonce}}"></script>
<script nonce="{{nonce}}">(function(){var b=document.getElementById('tg-login');function ready(){return window.Telegram&&Telegram.Login&&Telegram.Login.auth}
var n=0,t=setInterval(function(){if(ready()||++n>100){clearInterval(t);if(ready())b.disabled=false;else b.querySelector('span').textContent='Telegram недоступен';}},100);
b.addEventListener('click',function(){Telegram.Login.auth({bot_id:b.dataset.bot,request_access:'write',lang:'ru'},function(d){if(!d)return;var q=new URLSearchParams();for(var k in d)q.set(k,d[k]);q.set('state',b.dataset.state);q.set('return',b.dataset.ret);if(b.dataset.link)q.set('link','1');location.href='/auth/telegram?'+q.toString();});});})();</script>`
    : '';
  return doc(o.link ? 'Новый способ входа — Nikitenok ID' : 'Вход — Nikitenok ID', body, script);
}

// ——— Кабинет ———

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
  /** id приложений из clients.json, где уже работает вход через ID. */
  connected: string[];
}

const day = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

export function accountPage(v: AccountView): string {
  const hidden = `<input type="hidden" name="csrf" value="${esc(v.csrf)}">`;
  const one = v.identities.length <= 1;
  const ids = v.identities
    .map(
      (i, n) => `<div class="item">${providerIcon(i.login)}<div class="t"><b>${esc(providerName(i.login))}</b><small>${esc(i.name || i.login)} · с ${esc(day(i.linked))}</small></div>
${n === 0 ? '<span class="badge">Основной</span>' : ''}${one ? '' : `<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="unlink"><input type="hidden" name="login" value="${esc(i.login)}"><button class="link-btn" type="submit">Отвязать</button></form>`}</div>`,
    )
    .join('');
  const has = (p: string) => v.identities.some((i) => i.login.startsWith(p + ':'));
  const missing = [v.canLink.tg && !has('tg') ? 'Telegram' : '', v.canLink.ya && !has('ya') ? 'Яндекс ID' : ''].filter(Boolean);
  const add = missing.length ? `<a class="btn wide" href="/login?link=1&amp;return=%2Faccount" style="margin-top:16px">+ Привязать ${esc(missing.join(' или '))}</a>` : '';
  const strong = v.identities.length >= 2;
  const level = `<div class="level"><span class="ring-meter" data-v="${strong ? '100%' : '50%'}" style="--p:${strong ? 100 : 50};--col:${strong ? '#3BD08C' : '#E2B860'}"></span><div><b>${strong ? 'Высокий уровень защиты' : 'Базовый уровень защиты'}</b><small>${strong ? 'Два способа входа: если один недоступен, войдёте другим' : 'Добавьте второй способ входа, чтобы не потерять доступ'}</small></div></div>`;
  const svcs = SERVICES.map((s) => {
    const on = Boolean(s.client && v.connected.includes(s.client));
    return `<a class="sm" href="${esc(s.url)}" style="${vars(s)}"><div class="sm-top">${tile(s)}<span class="go">${I.arrow}</span></div><div class="t"><b>${esc(s.name)}</b><small>${esc(host(s.url))}</small></div>
${on ? `<span class="pill on">${I.check}Вход через ID</span>` : `<span class="pill">${I.sparkle}Скоро</span>`}</a>`;
  }).join('');
  const msg = v.msg ? `<div class="msg${v.msg.bad ? ' bad' : ''}">${v.msg.bad ? I.alert : I.check}<span>${esc(v.msg.text)}</span></div>` : '';
  const body = `${nav({ name: v.name })}<main class="wrap"><div class="container">${msg}
<section class="profile glass"><div class="p-row"><span class="avatar">${esc(initials(v.name))}</span><div><span class="kicker">Мой аккаунт</span><h1>${esc(v.name)}</h1>
<div class="chips"><span class="chip gold">${I.shield}Nikitenok ID</span><span class="chip">С нами с ${esc(day(v.created))}</span><span class="chip">${I.devices}${v.sessions} ${plural(v.sessions, 'устройство', 'устройства', 'устройств')}</span></div></div></div>
${idCard(v.name, cardNumber(v.nid))}</section>
<div class="grid">
<section class="box glass wide"><div class="box-h"><span class="ic">${I.grid}</span><div><h2>Сервисы экосистемы</h2><p>Все сервисы Nikitenok с одним аккаунтом</p></div></div><div class="svc-mini">${svcs}</div></section>
<section class="box glass"><div class="box-h"><span class="ic">${I.user}</span><div><h2>Личные данные</h2><p>Так вас видят в сервисах</p></div></div>
<div class="list"><div class="item"><span class="pi">${I.key}</span><div class="t"><b>Номер аккаунта</b><small><code>${esc(v.nid)}</code></small></div></div></div>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="rename"><label class="field"><input type="text" name="name" maxlength="60" value="${esc(v.name)}" aria-label="Имя" autocomplete="name"><button class="btn blue small" type="submit">Сохранить</button></label></form></section>
<section class="box glass"><div class="box-h"><span class="ic">${I.shield}</span><div><h2>Безопасность</h2><p>Защита аккаунта и устройств</p></div></div>${level}
<div class="row-btns"><form method="post" action="/account">${hidden}<input type="hidden" name="action" value="logout_all"><button class="btn small" type="submit">${I.devices}Выйти на других устройствах</button></form>
<form method="post" action="/account">${hidden}<input type="hidden" name="action" value="logout"><button class="btn small" type="submit">${I.logout}Выйти</button></form></div></section>
<section class="box glass wide"><div class="box-h"><span class="ic">${I.key}</span><div><h2>Способы входа</h2><p>Через них вы входите в Nikitenok ID</p></div></div><div class="list">${ids}</div>${add}</section>
<section class="box glass wide"><form method="post" action="/account" class="danger-zone">${hidden}<input type="hidden" name="action" value="delete"><div class="t"><b>Удаление аккаунта</b><p>Nikitenok ID и все привязки удалятся сразу. Данные внутри сервисов останутся — их можно удалить в настройках каждого сервиса.</p></div>
<div><label class="check"><input type="checkbox" name="sure" value="1" required> Я понимаю, что это действие необратимо</label><button class="btn danger small" type="submit">${I.trash}Удалить Nikitenok ID</button></div></form></section>
</div></div></main>${footer()}`;
  return doc('Мой аккаунт — Nikitenok ID', body, FX);
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export const errorPage = (title: string, text: string) =>
  layout(title, `<div class="glass"><div class="state">${I.alert}</div><h2>${esc(title)}</h2><p class="sub">${esc(text)}</p><a class="btn gold-btn wide" href="/account">Перейти в аккаунт</a></div>`);

export const privacyPage = () =>
  layout(
    'Конфиденциальность — Nikitenok ID',
    `<div class="glass prose"><div class="state">${I.shield}</div><h2>Конфиденциальность</h2>
<p>Nikitenok ID хранит только то, что нужно для входа: номер аккаунта, имя, номера аккаунтов Telegram, Яндекса или Max, которые вы привязали, и открытые сессии браузера. Пароли и переписку мы не получаем и не храним.</p>
<h3>Что получают сервисы</h3><p>Сервисам экосистемы Nikitenok мы передаём номер вашего Nikitenok ID, имя и привязанные способы входа — чтобы они узнали вас и сохранили ваш прогресс. Третьим лицам данные не передаются.</p>
<h3>Удаление</h3><p>Удалить аккаунт можно в разделе «Мой аккаунт»: данные удаляются сразу, резервные копии хранятся не дольше 14 дней.</p>
<a class="btn gold-btn wide" href="/account">Перейти в аккаунт</a></div>`,
  );
