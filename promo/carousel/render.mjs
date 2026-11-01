// Слайды карусели из carousel.json: slide_01.jpg … 1080×1350 (4:5 — самый большой формат ленты Instagram),
// а для kind=story — три сторис 1080×1920. Нужен playwright.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { renderHeroes } from "./hero3d.mjs";
import { SHOT_FORMATS } from "./story.mjs";

const c = JSON.parse(readFileSync("carousel.json", "utf8"));
const root = new URL("../../", import.meta.url);
const b64 = (u) => readFileSync(new URL(u, root)).toString("base64");
const font = (f) => b64(`promo/carousel/fonts/${f}`);
const img = (rel) =>
  `data:image/${rel.endsWith(".png") ? "png" : "jpeg"};base64,${b64(rel)}`;
// Свежие кадры игры (shots/) важнее старой библиотеки постов канала.
const shotPath = (id) =>
  existsSync(new URL(`promo/carousel/shots/${id}.jpg`, root))
    ? `promo/carousel/shots/${id}.jpg`
    : `server/media/channel/${id}.jpg`;
const shot = (id) => img(shotPath(id));
const esc = (t) =>
  String(t ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
  );
const NPC_NAMES = {
  grom: "Мастер Гром",
  lisa: "Лиса",
  marfa: "Бабушка Марфа",
  boris: "Борис Петрович",
  fedor: "Купец Фёдор",
  knyaz: "Князь Диван",
};
const NPC_COLORS = {
  grom: "#ff7043",
  lisa: "#ffb74d",
  marfa: "#f48fb1",
  boris: "#81c784",
  fedor: "#9575cd",
  knyaz: "#ba68c8",
};

const fonts = [700, 800, 900]
  .map(
    (
      w,
    ) => `@font-face{font-family:N;font-weight:${w};src:url(data:font/woff2;base64,${font(`nunito-cyrillic-${w}-normal.woff2`)});unicode-range:U+0400-04FF}
@font-face{font-family:N;font-weight:${w};src:url(data:font/woff2;base64,${font(`nunito-latin-${w}-normal.woff2`)})}`,
  )
  .join("\n");
const story = c.kind === "story";
const H = story ? 1920 : 1350;
const accent = c.kind === "tips" ? (NPC_COLORS[c.npc] ?? "#ff8a5c") : "#ff8a5c";
const css = `${fonts}
*{box-sizing:border-box}
html,body{margin:0;width:1080px;height:${H}px;overflow:hidden;background:#0d0f17;font-family:N;color:#f5f2ec}
.s{position:relative;width:1080px;height:${H}px;padding:84px 80px 0;
  background:radial-gradient(ellipse 80% 55% at 85% 0%,rgba(255,138,92,.22),transparent 70%),radial-gradient(ellipse 70% 50% at 0% 100%,rgba(90,110,255,.16),transparent 70%),#0d0f17}
.brand{position:absolute;left:80px;top:56px;display:flex;align-items:center;gap:16px;font:800 30px N;color:#c9cfdc;letter-spacing:.5px}
.brand img{width:52px;height:52px;border-radius:14px}
.page{position:absolute;right:80px;top:66px;font:800 28px N;color:#98a0b3}
.foot{position:absolute;left:80px;right:80px;bottom:56px;display:flex;align-items:center;justify-content:space-between}
.dots{display:flex;gap:10px}.dots i{width:14px;height:14px;border-radius:7px;background:rgba(255,255,255,.18)}.dots i.on{width:44px;background:linear-gradient(90deg,#ffb46b,#ff7a59)}
.swipe{font:800 30px N;color:#ffb37a}
.acc{background:linear-gradient(135deg,#ffb46b,#ff7a59);-webkit-background-clip:text;background-clip:text;color:transparent}
.st{padding:0 80px}
.st .brand{top:250px}
.st .label{position:absolute;left:80px;top:360px;padding:16px 30px;border-radius:999px;background:linear-gradient(135deg,#ffb46b,#ff7a59);font:900 40px N;color:#2b1206;text-transform:uppercase;letter-spacing:1px}
.st .tx{position:absolute;left:80px;right:80px;top:480px}
.st .t1{font:900 108px/1.04 N;letter-spacing:-1px}
.st .t2{font:900 124px/1.04 N;letter-spacing:-1px;padding-bottom:10px}
.st p{font:700 50px/1.32 N;color:#d3d8e4;margin:30px 0 0}
.st .npc{width:600px;height:600px;right:20px;bottom:330px}
.st .who{bottom:380px}
.st .scene{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(14px) brightness(.5) saturate(1.25);transform:scale(1.08)}
.st .veil{position:absolute;inset:0;background:linear-gradient(#0d0f17 0%,rgba(13,15,23,.88) 30%,rgba(13,15,23,.25) 58%,rgba(13,15,23,.55) 88%,#0d0f17 100%)}
.st .scene~*{z-index:1}
.st .hero{position:absolute;right:-60px;bottom:170px;width:900px;height:1260px;z-index:1}
.st .hero .glow{position:absolute;left:120px;right:120px;top:300px;bottom:80px;border-radius:50%;filter:blur(30px)}
.st .hero img{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 40px 50px rgba(0,0,0,.6))}
.st .hero~.who{bottom:230px;z-index:2;padding:14px 26px;border-radius:999px;background:rgba(13,15,23,.72)}
.st .tx{z-index:2}
.st .shotbox{bottom:330px}
.st.cat .shotbox{bottom:90px}
.st.full .bg{position:absolute;left:0;top:700px;width:1080px;height:auto}
.st.full .shade{position:absolute;left:0;right:0;top:640px;height:160px;background:linear-gradient(#13182f,rgba(19,24,47,0))}
.st.full .tx,.st.full .label,.st.full .brand{z-index:2}
.st.full .t1,.st.full .t2,.st.full p{text-shadow:0 6px 30px rgba(0,0,0,.6)}
.st.vs .pair{position:absolute;left:40px;right:40px;bottom:300px;height:900px}
.st.vs .phone{position:absolute;bottom:0;width:470px;height:836px}
.st.vs .phone img{width:100%;height:100%;object-fit:cover}
.st.vs .phone.l{left:0;transform:rotate(-4deg)}
.st.vs .phone.r{right:0;transform:rotate(4deg)}
.st.vs .or{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);z-index:3;width:170px;height:170px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ffb46b,#ff7a59);font:900 54px N;color:#2b1206;box-shadow:0 14px 40px rgba(0,0,0,.5)}
.cover .t1{font:900 112px/1.02 N;margin-top:150px;letter-spacing:-1px}
.cover .t2{font:900 128px/1.02 N;margin-top:8px;letter-spacing:-1px;padding-bottom:10px}
.cover .sub{display:inline-block;margin-top:44px;padding:18px 32px;border-radius:999px;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.1);font:800 36px N;color:#ffd7b8}
.npc{position:absolute;right:30px;bottom:110px;width:520px;height:520px}
.npc .glow{position:absolute;inset:40px;border-radius:50%;background:radial-gradient(circle,${accent}55,transparent 68%)}
.npc img{position:absolute;inset:0;width:100%;height:100%;image-rendering:auto;filter:drop-shadow(0 30px 40px rgba(0,0,0,.5))}
.who{position:absolute;left:80px;bottom:150px;display:flex;align-items:center;gap:18px;font:800 32px N;color:#c9cfdc}
.who b{color:${accent}}
.num{font:900 40px N;color:#2b1206;display:inline-flex;align-items:center;justify-content:center;min-width:92px;height:92px;padding:0 20px;border-radius:28px;background:linear-gradient(135deg,#ffb46b,#ff7a59);margin-top:96px}
.pt h2{font:900 86px/1.06 N;margin:44px 0 0;letter-spacing:-.5px}
.pt p{font:700 50px/1.34 N;color:#d3d8e4;margin:36px 0 0}
.big{margin-top:54px;display:inline-block;font:900 120px/1 N;padding:26px 46px;border-radius:36px;background:rgba(255,138,92,.1);border:3px solid rgba(255,138,92,.35)}
.npc.side{width:400px;height:400px;right:40px;bottom:100px}
.app h2{font:900 72px/1.08 N;margin:120px 0 0;letter-spacing:-.5px}
.app p{font:700 42px/1.32 N;color:#d3d8e4;margin:24px 0 0}
.shotbox{position:absolute;left:80px;right:80px;bottom:130px;display:flex;align-items:flex-end;justify-content:center}
.shotbox img{max-width:100%;border-radius:34px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 3px rgba(255,255,255,.08);object-fit:contain}
.phone{padding:14px;border-radius:52px;background:#05060b;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 3px rgba(255,255,255,.12)}
.phone img{border-radius:40px;box-shadow:none;display:block}
.fan{position:absolute;left:0;right:0;bottom:120px;height:540px}
.fan .phone{position:absolute;padding:10px;border-radius:44px}
.fan .phone img{height:470px;width:auto;border-radius:34px}
.fan .phone:last-child img{height:510px}
.cover.app .t1{margin-top:70px;font-size:96px}.cover.app .t2{font-size:110px}.cover.app .sub{margin-top:30px}
.cta h2{font:900 92px/1.04 N;margin:150px 0 0;letter-spacing:-1px}
.cta p{font:700 44px/1.32 N;color:#d3d8e4;margin:36px 0 0;max-width:900px}
.btn{display:inline-flex;align-items:center;gap:16px;margin-top:50px;padding:28px 44px;border-radius:999px;background:linear-gradient(135deg,#ffb46b,#ff7a59);font:900 40px N;color:#2b1206;box-shadow:0 20px 50px rgba(255,122,89,.35)}
`;

const pages = story ? c.stories : c.slides;
// Сторис с персонажем: заранее рисуем его в 3D и подбираем кадр игры для размытого фона.
const SCENES = ["world-map-forest", "village", "duel-fight", "boss-hit", "tower-climb", "dungeon", "clan-raid", "holiday", "village-raid", "level-win"];
if (story) {
  const npcStories = pages.filter((s) => !SHOT_FORMATS.has(s.format));
  const heroes = await renderHeroes(npcStories.map((s) => ({ npc: s.npc, format: s.format })));
  npcStories.forEach((s, k) => {
    s.hero = heroes[k];
    const ok = (id) => id && existsSync(new URL(shotPath(id), root));
    if (!ok(s.bg)) s.bg = SCENES[((c.n ?? 0) * 3 + pages.indexOf(s)) % SCENES.length];
  });
}
const total = pages.length;
const head = (i) =>
  `<div class="brand"><img src="${img("public/icons/icon-192.png")}">NikitenokArena</div><div class="page">${i + 1}/${total}</div>`;
const foot = (i) =>
  `<div class="foot"><div class="dots">${c.slides.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>${i < total - 1 ? '<div class="swipe">Листай →</div>' : ""}</div>`;
const npcImg =
  c.kind === "tips"
    ? img(`public/portraits/${c.npc}.png`)
    : img("public/portraits/hero.png");
const npcName = NPC_NAMES[c.npc] ?? "";

/** Размер JPEG по заголовку SOF, чтобы выбрать вертикальные скриншоты без браузера. */
function jpegSize(id) {
  const d = readFileSync(new URL(shotPath(id), root));
  for (let i = 2; i < d.length; ) {
    const m = d[i + 1];
    if (m >= 0xc0 && m <= 0xc3)
      return { h: d.readUInt16BE(i + 5), w: d.readUInt16BE(i + 7) };
    i += 2 + d.readUInt16BE(i + 2);
  }
  return { w: 1, h: 1 };
}
const tall = (id) => {
  const { w, h } = jpegSize(id);
  return h > w * 1.6;
};
/** Обложка про приложение: веер из трёх телефонов со скриншотами из самой карусели. */
function fan() {
  const ids = [
    ...new Set([
      ...c.slides.map((x) => x.shot).filter(Boolean),
      "boss-combo",
      "village",
      "duel-fight",
      "home",
    ]),
  ]
    .filter(tall)
    .slice(0, 3);
  const pos = [
    [-9, 120, 60],
    [9, 660, 60],
    [0, 395, 0],
  ];
  return `<div class="fan">${[ids[1], ids[2], ids[0]]
    .map(
      (id, k) =>
        `<div class="phone" style="left:${pos[k][1]}px;bottom:${pos[k][2]}px;transform:rotate(${pos[k][0]}deg)"><img src="${shot(id)}"></div>`,
    )
    .join("")}</div>`;
}
/** Скриншот под текстом; размер и рамку (вертикальный — телефон, горизонтальный — карточка) подбираем в браузере. */
function shotHtml(id) {
  if (!id) return "";
  return `<div class="shotbox"><div class="frame"><img src="${shot(id)}"></div></div>`;
}

/** Сторис: плашка формата, крупный текст, свободное место под стикер, персонаж или скриншот внизу. */
function storyHtml(s) {
  const head = `<div class="brand"><img src="${img("public/icons/icon-192.png")}">NikitenokArena</div>
    <div class="label">${esc(s.label)}</div>
    <div class="tx"><div class="t1">${esc(s.top)}</div><div class="t2 acc">${esc(s.accent)}</div>${s.text ? `<p>${esc(s.text)}</p>` : ""}</div>`;
  // Кадр игры на весь экран: текст сверху на затемнении, середина и низ открыты под стикер.
  if ((s.format === "screen" || s.format === "boss") && tall(s.shot))
    return `<div class="s st full"><img class="bg" src="${shot(s.shot)}"><div class="shade"></div>${head}</div>`;
  if (s.format === "versus")
    return `<div class="s st vs">${head}<div class="pair"><div class="phone l"><img src="${shot(s.shot)}"></div><div class="or">или</div><div class="phone r"><img src="${shot(s.shot2)}"></div></div></div>`;
  if (["app", "screen", "boss"].includes(s.format))
    return `<div class="s st${c.catalog ? " cat" : ""}">${head}${shotHtml(s.shot)}</div>`;
  const color = NPC_COLORS[s.npc] ?? "#ff8a5c";
  // Крупный 3D-персонаж в полный рост на размытом кадре игры; без 3D — прежний портрет.
  if (s.hero)
    return `<div class="s st"><div class="scene" style="background-image:url('${shot(s.bg)}')"></div><div class="veil"></div>${head}<div class="hero"><div class="glow" style="background:radial-gradient(circle,${color}66,transparent 70%)"></div><img src="${s.hero}"></div><div class="who"><b style="color:${color}">${esc(NPC_NAMES[s.npc] ?? "")}</b></div></div>`;
  const face = img(`public/portraits/${s.npc}.png`);
  return `<div class="s st${c.catalog ? " cat" : ""}">${head}<div class="npc"><div class="glow" style="background:radial-gradient(circle,${color}55,transparent 68%)"></div><img src="${face}"></div><div class="who"><b style="color:${color}">${esc(NPC_NAMES[s.npc] ?? "")}</b></div></div>`;
}

function slide(s, i) {
  if (story) return storyHtml(s);
  if (s.type === "cover")
    return `<div class="s cover ${c.kind}">${head(i)}<div class="t1">${esc(s.top)}</div><div class="t2 acc">${esc(s.accent)}</div>${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ""}
      ${c.kind === "tips" ? `<div class="npc"><div class="glow"></div><img src="${npcImg}"></div><div class="who">Советы: <b>${esc(npcName)}</b></div>` : fan()}${foot(i)}</div>`;
  if (s.type === "cta")
    return `<div class="s cta">${head(i)}<h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="btn">Играть бесплатно в Telegram</div>
      ${c.kind === "app" ? shotHtml(s.shot || "home") : `<div class="npc" style="width:430px;height:430px;bottom:110px"><div class="glow"></div><img src="${npcImg}"></div>`}${foot(i)}</div>`;
  const n = String(i).padStart(2, "0");
  if (c.kind === "app")
    return `<div class="s app">${head(i)}<h2>${esc(s.title)}</h2><p>${esc(s.text)}</p>${shotHtml(s.shot)}${foot(i)}</div>`;
  return `<div class="s pt">${head(i)}<div class="num">${n}</div><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p>${s.big ? `<div class="big"><span class="acc">${esc(s.big)}</span></div>` : ""}
    <div class="npc side"><div class="glow"></div><img src="${npcImg}"></div><div class="who">Совет: <b>${esc(npcName)}</b></div>${foot(i)}</div>`;
}

const b = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {},
);
const p = await b.newPage({ viewport: { width: 1080, height: H } });
for (let i = 0; i < total; i++) {
  await p.setContent(
    `<html><head><style>${css}</style></head><body>${slide(pages[i], i)}</body></html>`,
  );
  await p.evaluate(async (H) => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((im) => im.decode().catch(() => null)),
    );
    // Кадр игры во всю ширину начинается сразу под текстом (сверху у кадра шапка игры — она и видна).
    for (const bg of document.querySelectorAll(".full .bg")) {
      const y = Math.min(
        document.querySelector(".tx").getBoundingClientRect().bottom + 40,
        1080,
      );
      bg.style.top = `${y}px`;
      bg.nextElementSibling.style.top = `${y - 60}px`;
    }
    // 3D-персонаж сторис встаёт сразу под текст и занимает всё место до низа.
    for (const h of document.querySelectorAll(".st .hero")) {
      const top = document.querySelector(".tx").getBoundingClientRect().bottom + 10;
      const height = Math.max(700, H - 150 - top);
      Object.assign(h.style, { top: `${H - 150 - height}px`, bottom: "auto", height: `${height}px`, width: `${height * 0.72}px`, right: "10px" });
    }
    // Скриншот вписываем в место под текстом: вертикальный — в рамку телефона.
    for (const box of document.querySelectorAll(".shotbox")) {
      const im = box.querySelector("img");
      const text = [...box.parentElement.children]
        .filter((e) => e.matches("h2,p,.btn,.t1,.t2,.sub,.tx"))
        .at(-1);
      const top = text ? text.getBoundingClientRect().bottom + 50 : 300;
      const bottom = parseFloat(getComputedStyle(box).bottom);
      const room = Math.min(
        H - bottom - top,
        H > 1500 && !document.querySelector(".cat") ? 860 : 9999,
      ); // в сторис над скриншотом остаётся место под стикер
      const w = 920;
      const tall = im.naturalHeight > im.naturalWidth * 1.1;
      if (tall) {
        box.querySelector(".frame").className = "frame phone";
        im.style.height = `${room - 28}px`;
        im.style.width = "auto";
      } else {
        const k = Math.min(w / im.naturalWidth, room / im.naturalHeight);
        im.style.width = `${im.naturalWidth * k}px`;
        im.style.height = `${im.naturalHeight * k}px`;
      }
    }
  }, H);
  await p.screenshot({
    path: `${story ? "story" : "slide"}_${String(i + 1).padStart(2, "0")}.jpg`,
    type: "jpeg",
    quality: 95,
  });
}
await b.close();
console.log(`слайдов: ${total}`);
