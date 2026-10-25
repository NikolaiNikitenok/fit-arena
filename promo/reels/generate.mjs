// Сценарий рилса: Claude пишет хук, реплики озвучки, титры и подпись; проверяем и сохраняем в script.json.
// Запуск: node generate.mjs <номер> [тема]. Нужен CLAUDE_CODE_OAUTH_TOKEN (подписка, через `claude -p`) или ANTHROPIC_API_KEY.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const n = Number(process.argv[2] ?? 0) || 0;
const topic = (process.argv[3] ?? '').trim().slice(0, 300);

// Формулы хука по кругу, чтобы рилсы подряд не были похожи.
export const ANGLES = [
  'Боль и провокация: зритель узнаёт себя («Ты снова бросишь…», «Признайся, ты…»).',
  'Вызов: «Сколько ты отожмёшься за минуту? Проверь».',
  'Неожиданный факт про приложение: «Твой телефон умеет считать отжимания».',
  'До и после: скучная тренировка против тренировки-игры.',
  'Ошибка, которую делают все: «Ты тренируешься неправильно, если…» и решение.',
  'Секрет мотивации: почему игры затягивают, а спорт нет, и как это объединить.',
  'Соревнование с другом: «Спорим, твой друг отожмётся больше?».',
  'Нет времени и зала: «10 минут дома без инвентаря».',
  'Геймер против качка: «Если любишь игры, но хочешь быть в форме».',
  'Список: «3 причины, почему ты не бросишь эту тренировку».',
  'Сторителлинг от первого лица: «Я качаюсь, играя в телефон».',
  'Вопрос-интрига: «Что будет, если каждое отжимание бьёт босса?».',
];

const FACTS = `Факты о приложении (только это, ничего не выдумывай):
- NikitenokArena — бесплатная фитнес-игра прямо в Telegram, ничего не нужно скачивать, без инвентаря.
- Камера телефона распознаёт позу и сама считает отжимания, приседания и пресс (и время в планке). Если повтор неполный, он не засчитывается.
- Каждый повтор — удар по врагу. Приключение: 3 мира по 100 уровней, боссы, сюжет с наставником Мастером Громом и злодеем Князем Диваном.
- Сила врагов подстраивается под твою: растёшь ты, растут и они.
- Дуэли с друзьями в реальном времени: кто больше за минуту. Лиги, кубки, сезоны.
- Кланы: общий рейд-босс по выходным, войны кланов, чат.
- Заряд от тренировки тратится в подземелье «три в ряд»; добыча (дерево, камень, золото) строит свою деревню, войска ходят в набеги.
- Герой и снаряжение прокачиваются, есть питомец, который растёт от тренировок.
- Дневник зала: вес, подходы, рекорды. Программы тренировок от тренера. Серии дней, достижения, пропуск сезона.`;

function prompt() {
  const clips = Object.entries(catalog).map(([id, c]) => `- ${id} (${(c.to - c.from).toFixed(1)} с): ${c.about}`).join('\n');
  return `Напиши сценарий вертикального рилса для Instagram (20–28 секунд) про фитнес-игру NikitenokArena. Цель — чтобы рилс залетел: цеплял с первой секунды, решал проблему зрителя («нет мотивации, бросаю тренировки, скучно, нет времени и зала») и работал как реклама крутого приложения.

${FACTS}

Формула хука для этого рилса: ${ANGLES[n % ANGLES.length]}
${topic ? `Тема от автора: ${topic}\n` : ''}
Структура: хук (1 реплика, до 2,5 секунды) → проблема/интрига → 3–5 коротких реплик с решением и самыми эффектными фичами → короткий итог-выгода → призыв. Реплики короткие и энергичные, разговорный русский, на «ты». Без выдуманной статистики и процентов про людей. Без эмодзи в репликах и титрах.

Видеоряд — только клипы из списка (id и длительность):
${clips}
Каждой реплике подбери подходящий по смыслу клип. Один клип можно взять не больше двух раз и не два раза подряд. Последняя реплика всегда клип cta.

Озвучка (поле say): числа словами; название пиши только «Никитёнок Арена» (с буквой ё — это ударение), Telegram пиши «Телеграм». Последняя реплика: призыв с «Никитёнок Арена», что это бесплатно в Телеграме, и «ссылка в профиле».
Титры (поле subs): та же реплика, разбитая на 1–3 куска по 2–4 слова (до 24 символов в куске), цифрами где удобно; название в титрах пиши NikitenokArena, Telegram — латиницей.
Хук-карточка (hook) на весь экран в начале: top — 2–4 слова белым, accent — 1–3 слова цветом (самое цепляющее), sub — короткая подводка до 30 символов или пусто.

Ответь только JSON без пояснений и без markdown:
{"hook":{"top":"...","accent":"...","sub":"..."},"lines":[{"say":"...","subs":["..."],"clip":"..."}],"caption":"подпись для Instagram: 3–6 коротких строк, с эмодзи, вопрос для комментариев и «ссылка в профиле»","hashtags":["#..."]}
Первая реплика в lines — озвучка хука (её subs не показываются). Всего 7–10 реплик, 45–75 слов в say суммарно. Хэштегов 8–12, по-русски и пара английских.`;
}

function askClaude(text) {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    const r = spawnSync('claude', ['-p', '--model', 'opus', '--output-format', 'text'], { input: text, encoding: 'utf8', timeout: 240_000, maxBuffer: 4 << 20 });
    if (r.status !== 0) throw new Error(`claude: ${(r.stderr || r.stdout || '').slice(0, 500)}`);
    return r.stdout;
  }
  throw new Error('нет CLAUDE_CODE_OAUTH_TOKEN');
}

async function askApi(text) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 4000, messages: [{ role: 'user', content: text }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`api: ${JSON.stringify(j).slice(0, 500)}`);
  return j.content.map((c) => c.text ?? '').join('');
}

/** Проверка сценария: возвращает список проблем (пустой — всё хорошо). */
export function problems(s) {
  const out = [];
  if (!s?.hook?.top || !s.hook.accent) out.push('нет hook.top/accent');
  const L = s?.lines;
  if (!Array.isArray(L) || L.length < 6 || L.length > 11) return [...out, 'реплик должно быть 7–10'];
  const words = L.reduce((a, l) => a + String(l.say ?? '').split(/\s+/).filter(Boolean).length, 0);
  if (words < 35 || words > 90) out.push(`слов ${words}, нужно 45–75`);
  L.forEach((l, i) => {
    if (!catalog[l.clip]) out.push(`реплика ${i + 1}: нет клипа ${l.clip}`);
    if (i > 0 && l.clip === L[i - 1].clip) out.push(`реплика ${i + 1}: клип подряд`);
    if (i > 0 && (!Array.isArray(l.subs) || !l.subs.length || l.subs.length > 4)) out.push(`реплика ${i + 1}: subs 1–3 куска`);
    if (l.clip === 'cta' && i !== L.length - 1) out.push('cta только последним');
  });
  if (L.at(-1).clip !== 'cta') out.push('последний клип должен быть cta');
  if (!/Никитёнок Арен/i.test(L.at(-1).say ?? '')) out.push('в призыве нет «Никитёнок Арена»');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = prompt() + (last ? `\n\nПрошлый вариант не прошёл проверку: ${last}. Исправь.` : '');
      const raw = process.env.CLAUDE_CODE_OAUTH_TOKEN ? askClaude(text) : await askApi(text);
      const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const bad = problems(json);
      if (bad.length) throw new Error(bad.join('; '));
      // Подстраховка ударения: «Никитенок» в озвучке всегда через ё.
      for (const l of json.lines) l.say = l.say.replace(/Никитенок/g, 'Никитёнок');
      writeFileSync('script.json', JSON.stringify({ n, angle: ANGLES[n % ANGLES.length], topic, ...json }, null, 2));
      console.log(JSON.stringify(json, null, 2));
      process.exit(0);
    } catch (e) {
      last = e.message.slice(0, 400);
      console.log(`попытка ${attempt}: ${last}`);
    }
  }
  process.exit(1);
}
