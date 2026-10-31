// Сторис для Instagram/TikTok: три картинки 1080×1920 разных форматов на выбор. Текст пишет Claude (prompt/problems),
// рисует render.mjs (storyHtml). У каждой сторис — подсказка, какой стикер поставить (опрос, викторина, ссылка…).
export const STORY_FORMATS = {
  challenge:
    "Челлендж дня: конкретное задание на 1–3 минуты (например «30 приседаний без остановки»). Стикер — опрос «Сделал / Завтра».",
  poll: "Опрос: спорный вопрос про тренировки с двумя вариантами («Что тяжелее: отжимания или планка?»). Стикер — опрос с этими вариантами.",
  quiz: "Правда или миф: утверждение про тренировки, ответ в стикере-викторине. В тексте не выдавай ответ.",
  tip: "Совет дня от персонажа: один конкретный приём, который можно применить сегодня. Стикер — слайдер «Полезно?».",
  slider:
    "Настроение: вопрос с юмором («Насколько тебе сегодня лень?»), персонаж подбадривает. Стикер — слайдер с эмодзи.",
  app: "Фишка приложения NikitenokArena со скриншотом: одна выгода для человека. Стикер — ссылка на бота.",
  question:
    "Вопрос к персонажу: персонаж предлагает задать вопрос о тренировках. Стикер — «Вопросы».",
  motivation:
    "Мотивация: короткая фраза персонажа, которая пинает начать прямо сейчас. Стикер — реакция-слайдер или опрос «Я в деле».",
  screen:
    "Кадр из игры на весь экран: самый яркий момент (бой с боссом, «Ратуша пала!», победа, деревня) и подпись-интрига, что тут происходит. Стикер — ссылка на бота.",
  boss: "Босс дня: кадр боя на весь экран и вызов — победить босса конкретным числом повторов сегодня. Стикер — опрос «Победил / Ещё бьюсь».",
  versus:
    "Это или то: два экрана игры рядом (shot и shot2), вопрос, что выбираешь (например, дуэль или набег на деревню). Стикер — опрос с этими двумя вариантами.",
};
/** Форматы со скриншотами игры вместо персонажа. */
export const SHOT_FORMATS = new Set(["app", "screen", "boss", "versus"]);
const KEYS = Object.keys(STORY_FORMATS);
export const STICKERS = {
  poll: "Опрос",
  quiz: "Викторина",
  slider: "Слайдер",
  link: "Ссылка",
  question: "Вопросы",
};
export const BOT_LINK = "https://t.me/ArenaNikitenokBot";

/** Три формата подряд по кругу: каждое нажатие даёт новую тройку. */
export const formatsFor = (n) =>
  [0, 1, 2].map((k) => KEYS[(n * 3 + k) % KEYS.length]);

export function storyPrompt({ n, topic, facts, npcs, shots }) {
  const f = formatsFor(n);
  return `Сделай 3 картинки для сторис Instagram и TikTok от фитнес-игры NikitenokArena${topic ? ` на тему: ${topic}` : ""}. Сторис смотрят 2–3 секунды: крупно, коротко, живо, на «ты», разговорный русский. Цель — вовлечь (ответить на стикер, сделать задание), а не продать.

Форматы (по одной сторис на каждый, в этом порядке):
${f.map((k, i) => `${i + 1}. ${k}: ${STORY_FORMATS[k]}`).join("\n")}

${facts}

Персонажи (поле npc, для форматов без скриншота):
${Object.entries(npcs)
  .map(([id, a]) => `- ${id}: ${a}`)
  .join("\n")}
Скриншоты (поле shot для app, screen, boss и versus; у versus ещё shot2 — второй, другой экран). Для screen и boss бери вертикальные кадры игры, они встанут на весь экран:
${Object.entries(shots)
  .map(([id, a]) => `- ${id}: ${a}`)
  .join("\n")}

Поля сторис: format; label — плашка сверху 1–3 слова («Челлендж дня», «Правда или миф?»); top — 2–5 слов белым; accent — 1–3 слова цветом; text — до 110 символов или пусто; sticker — {"type":"poll|quiz|slider|link|question","text":"вопрос/надпись стикера до 40 символов","options":["…","…"] для poll и quiz (2–4 варианта до 20 символов),"answer":номер правильного варианта с 0 для quiz}. Для app sticker.type = link, text — надпись на ссылке («Играть бесплатно»).
Без эмодзи в top/accent/text (в стикерах можно). Без выдуманной статистики. Название пиши NikitenokArena, Telegram латиницей.

Ответь только JSON без пояснений и без markdown:
{"title":"тема в 3–5 словах","stories":[{"format":"...","label":"...","top":"...","accent":"...","text":"...","npc":"id","shot":"id","shot2":"id","sticker":{"type":"...","text":"...","options":["..."],"answer":0}}]}`;
}

export function storyProblems(c, { npcs, shots, n }) {
  const out = [];
  const S = c?.stories;
  if (!Array.isArray(S) || S.length !== 3) return ["нужно ровно 3 сторис"];
  const want = formatsFor(n);
  S.forEach((s, i) => {
    const at = `сторис ${i + 1}`;
    if (s.format !== want[i]) out.push(`${at}: формат должен быть ${want[i]}`);
    if (!s.top || !s.accent || !s.label)
      out.push(`${at}: нужны label, top и accent`);
    if (String(s.top ?? "").length > 34 || String(s.accent ?? "").length > 24)
      out.push(`${at}: top до 30 и accent до 20 символов`);
    if (String(s.text ?? "").length > 130)
      out.push(`${at}: text длиннее 110 символов`);
    const shotted = SHOT_FORMATS.has(s.format);
    if (shotted ? !shots[s.shot] : !npcs[s.npc])
      out.push(
        `${at}: нет ${shotted ? `скриншота ${s.shot}` : `персонажа ${s.npc}`}`,
      );
    if (s.format === "versus" && (!shots[s.shot2] || s.shot2 === s.shot))
      out.push(`${at}: у versus нужен второй, другой скриншот shot2`);
    const t = s.sticker?.type;
    if (!STICKERS[t]) out.push(`${at}: стикер ${t} неизвестен`);
    if (
      (t === "poll" || t === "quiz") &&
      (!Array.isArray(s.sticker.options) ||
        s.sticker.options.length < 2 ||
        s.sticker.options.length > 4)
    )
      out.push(`${at}: у стикера 2–4 варианта`);
    if (
      t === "quiz" &&
      !(
        s.sticker.answer >= 0 &&
        s.sticker.answer < (s.sticker.options?.length ?? 0)
      )
    )
      out.push(`${at}: у викторины нет правильного ответа`);
  });
  return out;
}

/** Подсказка к сторис: какой стикер поставить и что в него вписать. */
export function stickerHint(s, i) {
  const st = s.sticker ?? {};
  const opts = st.options?.length
    ? `: ${st.options.map((o, k) => (st.type === "quiz" && k === st.answer ? `${o} ✅` : o)).join(" / ")}`
    : "";
  const link = st.type === "link" ? ` → ${BOT_LINK}` : "";
  return `${i + 1}. ${s.label} — стикер «${STICKERS[st.type] ?? st.type}»: «${st.text ?? ""}»${opts}${link}`;
}
