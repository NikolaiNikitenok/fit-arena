// Текст карусели для Instagram: Claude пишет слайды (обложка, пункты, финал) и подпись; проверяем и сохраняем в carousel.json.
// Запуск: node generate.mjs <номер> <tips|app|story> [тема]. Виды: полезные советы (приложение только в финале), про приложение
// и story — три сторис 1080×1920 на выбор (story.mjs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { askApi, askClaude, FACTS } from "../reels/generate.mjs";
import { storyProblems, storyPrompt, storyLines } from "./story.mjs";

const n = Number(process.argv[2] ?? 0) || 0;
const kind = ["app", "story"].includes(process.argv[3])
  ? process.argv[3]
  : "tips";
const topic = (process.argv[4] ?? "").trim().slice(0, 300);

// Скриншоты: свежие кадры текущей игры 1080×1920 (shots/, вырезаны из видео рилсов) и из библиотеки постов
// канала (server/channelMedia.ts) — только те, которых нет среди свежих и которые не устарели после редизайна.
const FRESH = JSON.parse(
  readFileSync(new URL("./shots/shots.json", import.meta.url), "utf8"),
);
const KEEP_OLD = new Set([
  "cover",
  "clan-wars",
  "friends",
  "stats",
  "gym-diary",
  "gym-workout",
  "share-card",
  "hero-skills",
  "laboratory",
  "village-day-night",
  "village-summer",
  "village-winter",
  "village-night",
  "village-halloween",
  "village-decor",
  "village-defense-win",
]);
export const SHOTS = {
  ...FRESH,
  ...Object.fromEntries(
    [
      ...readFileSync(
        new URL("../../server/channelMedia.ts", import.meta.url),
        "utf8",
      ).matchAll(/^ {2}'?([\w-]+)'?: '([^']+)',$/gm),
    ]
      .filter((m) => KEEP_OLD.has(m[1]) && !FRESH[m[1]])
      .map((m) => [m[1], m[2]]),
  ),
};

// Темы по кругу, чтобы карусели подряд не повторялись.
export const TIP_THEMES = [
  "Отжимания: 5 ошибок в технике и как их исправить",
  "Приседания без боли в коленях и спине",
  "Пресс без боли в шее: как правильно скручиваться",
  "Планка: как стоять правильно и сколько нужно",
  "Тренировка дома за 10 минут без инвентаря — готовый план",
  "Как не бросить тренировки через неделю: привычка вместо силы воли",
  "Как прибавлять нагрузку, чтобы был прогресс",
  "Восстановление: сон, отдых между тренировками, когда можно снова",
  "Разминка за 3 минуты перед тренировкой",
  "Отжимания с нуля: от стены и с колен до полных",
  "Мифы про пресс и кубики",
  "Тренировка для тех, кто весь день сидит за компьютером",
  "Мотивация: как превратить тренировку в игру и соревнование",
  "Тренировки с другом: почему так проще не бросить",
  "Осанка: простые упражнения на каждый день",
  "Проверь свою форму: простые тесты силы дома",
];
export const APP_ANGLES = [
  "Фишки приложения, о которых ты не знал",
  "Как камера телефона считает повторы и почему не обмануть",
  "Первая неделя новичка: что тебя ждёт в игре",
  "Дуэли с друзьями: кто больше за минуту",
  "Кланы, рейд-босс по выходным и войны кланов",
  "Тренировка превращается в ресурсы: подземелье и своя деревня",
  "Приключение: миры, боссы и сюжет",
  "Для тех, кто ходит в зал: дневник и программы",
  "Если ты геймер, но хочешь быть в форме",
  "Почему ты не бросишь: серии, питомец, достижения, сезоны",
  "Лента и профили: соцсеть для тех, кто тренируется",
  "Утро с NikitenokArena: зарядка и разминка с 3D-героем",
  "Битва городов на 3D-глобусе и Титан — босс всей страны",
];
export const NPCS = {
  grom: "Мастер Гром — суровый наставник-воин, советы по технике и силе",
  lisa: "Лиса — быстрая и весёлая, советы про скорость, кардио, игровой азарт",
  marfa:
    "Бабушка Марфа — мудрая, советы про здоровье, восстановление, сон, осанку",
  boris:
    "Борис Петрович — обычный офисный дядька, который начал тренироваться: советы новичкам и тем, кто сидит весь день",
};

// В сторис больше персонажей: злодей для «лени», купец для наград.
const STORY_NPCS = {
  ...NPCS,
  knyaz:
    "Князь Диван — главный злодей, ленивый и вальяжный, уговаривает не тренироваться; смешно злится, когда ты всё равно качаешься",
  fedor:
    "Купец Фёдор — хитрый торговец, всё сводит к наградам: за каждый повтор — монетки, сундуки и обновки",
};

// Факты о приложении — общие для рилсов, каруселей и сторис (promo/reels/generate.mjs).

// Память о прошлых выпусках: workflow хранит history.json в кэше GitHub Actions между запусками. Последние тексты
// этого вида уходят в промпт с просьбой не повторять ни темы, ни задания, ни формулировки.
const HISTORY = process.env.HISTORY || "history.json";
const history = (() => {
  try {
    return existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, "utf8")) : [];
  } catch {
    return [];
  }
})();
const recent = history.filter((h) => h.kind === kind).slice(-40);
const lines = (c) =>
  kind === "story"
    ? storyLines(c)
    : [c.title, ...(c.slides ?? []).map((s) => [s.top, s.accent, s.title].filter(Boolean).join(" "))].filter(Boolean);
const avoid = () =>
  recent.length
    ? `\n\nУЖЕ БЫЛО (${recent.length} прошлых выпусков) — не повторяй ни темы, ни задания, ни вопросы, ни формулировки, ни числа повторов; придумай свежий угол:\n${recent
        .map((h) => `- ${h.lines.join(" | ")}`)
        .join("\n")
        .slice(-6000)}`
    : "";

function prompt() {
  if (kind === "story")
    return storyPrompt({ n, topic, facts: FACTS, npcs: STORY_NPCS, shots: SHOTS }) + avoid();
  const theme =
    topic ||
    (kind === "app"
      ? APP_ANGLES[n % APP_ANGLES.length]
      : TIP_THEMES[n % TIP_THEMES.length]);
  const common = `Каждый слайд читается за 3–5 секунд: короткий заголовок (до 40 символов) и текст до 160 символов, разговорный русский, на «ты», без воды и канцелярита. Без эмодзи в слайдах. Без выдуманной статистики и процентов. Ничего не обещай про похудение на N кг и не давай медицинских назначений.
Обложка (cover) решает всё: top — 2–5 слов белым, accent — 1–3 самых цепляющих слова цветом, sub — подводка до 40 символов (например «Сохрани, чтобы не забыть» или «Листай →»).`;
  const body =
    kind === "tips"
      ? `Сделай карусель для Instagram с ПОЛЕЗНЫМИ советами по домашним тренировкам. Тема: ${theme}.
Это не реклама: 80% ценности — сами советы, конкретные и применимые сразу (как именно делать, сколько, на что смотреть). Приложение только в последнем слайде, мягко: «чтобы делать это каждый день — …».
Советы даёт персонаж игры — выбери одного под тему (поле npc):
${Object.entries(NPCS)
  .map(([id, a]) => `- ${id}: ${a}`)
  .join("\n")}
${common}
Пункты (point): у каждого title и text; поле big — необязательная короткая «цифра» для акцента до 8 символов (например «3×12», «90 с», «2 мин»), только если она реально есть в совете.
Финал (cta): title — вывод или призыв сохранить; text — одна фраза про NikitenokArena (бесплатная фитнес-игра в Telegram, камера считает повторы) и «ссылка в профиле».`
      : `Сделай карусель для Instagram ПРО ПРИЛОЖЕНИЕ NikitenokArena. Ракурс: ${theme}.
Карусель как реклама, которую хочется долистать: каждый слайд — одна выгода для человека (проблема → как игра её решает), а не сухой список функций.
${common}
Пункты (point): title, text и shot — скриншот из списка, который показывает именно это (каждый скриншот не больше одного раза):
${Object.entries(SHOTS)
  .map(([id, a]) => `- ${id}: ${a}`)
  .join("\n")}
Финал (cta): title — призыв, text — бесплатно в Telegram, ничего скачивать, «ссылка в профиле»; shot — подходящий скриншот (например home, cta или cover).`;
  return `${body}

${FACTS}

Название в слайдах и подписи пиши NikitenokArena, Telegram латиницей.
Всего 6–9 слайдов: первый cover, последний cta, между ними 4–7 point.

Ответь только JSON без пояснений и без markdown:
{"title":"тема в 3–6 словах",${kind === "tips" ? '"npc":"id",' : ""}"slides":[{"type":"cover","top":"...","accent":"...","sub":"..."},{"type":"point","title":"...","text":"..."${kind === "tips" ? ',"big":""' : ',"shot":"id"'}},{"type":"cta","title":"...","text":"..."${kind === "app" ? ',"shot":"id"' : ""}}],"caption":"подпись для Instagram: 3–6 коротких строк с эмодзи, ${kind === "tips" ? "польза и призыв сохранить, вопрос для комментариев, в конце NikitenokArena — ссылка в профиле" : "выгода, вопрос для комментариев, «ссылка в профиле»"}","hashtags":["#..."]}
Хэштегов 8–12, по-русски и пара английских.${avoid()}`;
}

/** Проверка: возвращает список проблем (пустой — всё хорошо). */
export function problems(c, k = kind) {
  if (k === "story")
    return storyProblems(c, { npcs: STORY_NPCS, shots: SHOTS, n });
  const out = [];
  const S = c?.slides;
  if (!Array.isArray(S) || S.length < 6 || S.length > 10)
    return ["слайдов должно быть 6–9"];
  if (S[0].type !== "cover" || !S[0].top || !S[0].accent)
    out.push("первый слайд — cover с top и accent");
  if (S.at(-1).type !== "cta" || !S.at(-1).title)
    out.push("последний слайд — cta с title");
  const used = new Set();
  S.slice(1, -1).forEach((s, i) => {
    if (s.type !== "point" || !s.title || !s.text)
      out.push(`слайд ${i + 2}: нужен point с title и text`);
    if (String(s.title ?? "").length > 48)
      out.push(`слайд ${i + 2}: заголовок длиннее 40 символов`);
    if (String(s.text ?? "").length > 190)
      out.push(`слайд ${i + 2}: текст длиннее 160 символов`);
    if (s.big && String(s.big).length > 9)
      out.push(`слайд ${i + 2}: big длиннее 8 символов`);
    if (k === "app") {
      if (!SHOTS[s.shot]) out.push(`слайд ${i + 2}: нет скриншота ${s.shot}`);
      else if (used.has(s.shot))
        out.push(`слайд ${i + 2}: скриншот ${s.shot} повторяется`);
      used.add(s.shot);
    }
  });
  if (k === "app" && S.at(-1).shot && !SHOTS[S.at(-1).shot])
    out.push(`финал: нет скриншота ${S.at(-1).shot}`);
  if (k === "tips" && !NPCS[c.npc]) out.push(`нет персонажа ${c.npc}`);
  if (!/NikitenokArena/i.test(`${S.at(-1).title} ${S.at(-1).text}`))
    out.push("в финале нет NikitenokArena");
  if (!c.caption || !Array.isArray(c.hashtags))
    out.push("нет caption/hashtags");
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text =
        prompt() +
        (last
          ? `\n\nПрошлый вариант не прошёл проверку: ${last}. Исправь.`
          : "");
      const raw = process.env.CLAUDE_CODE_OAUTH_TOKEN
        ? askClaude(text)
        : await askApi(text);
      const json = JSON.parse(
        raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1),
      );
      const bad = problems(json);
      if (bad.length) throw new Error(bad.join("; "));
      writeFileSync(
        "carousel.json",
        JSON.stringify({ n, kind, topic, ...json }, null, 2),
      );
      history.push({ kind, n, at: new Date().toISOString(), lines: lines(json) });
      writeFileSync(HISTORY, JSON.stringify(history.slice(-200)));
      console.log(JSON.stringify(json, null, 2));
      process.exit(0);
    } catch (e) {
      last = e.message.slice(0, 400);
      console.log(`попытка ${attempt}: ${last}`);
    }
  }
  process.exit(1);
}
