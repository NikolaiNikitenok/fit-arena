// Сценарий рилса-петли (8–10 с, без озвучки): крупный вопрос-хук на весь ролик, якорный клип открывает и закрывает
// ролик (конец переходит в начало), между ними 2 кадра игры, внизу плашка «пиши в комменты».
// Запуск: node generate.mjs <номер> [тема]. Если рядом есть user.mp4 (свой клип админа), якорь — он.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { askApi, askClaude, FACTS } from '../generate.mjs';

const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const music = JSON.parse(readFileSync(new URL('../music/library.json', import.meta.url), 'utf8'));
const n = Number(process.argv[2] ?? 0) || 0;
const topic = (process.argv[3] ?? '').trim().slice(0, 300);
const user = existsSync('user.mp4');

/** Клипы, которые годятся в якорь: яркие и не короче 3 с (якорь делится на начало и конец ролика). */
export const anchors = Object.entries(catalog).filter(([, c]) => c.hook && c.to - c.from >= 3).map(([id]) => id);
/** Клипы для середины: без финального экрана и загрузки. */
export const middles = Object.keys(catalog).filter((id) => id !== 'cta' && id !== 'splash');

// Вопросы по кругу: каждый провоцирует ответ цифрой в комментариях — так рилс получает комментарии.
export const ANGLES = [
  'Рекорд: «Сколько отжиманий подряд сделаешь ты?»',
  'Пари: «Твой друг отожмётся больше тебя?»',
  'Механика: «Каждое отжимание — удар по боссу». Вопрос — сколько ударов нужно, чтобы победить.',
  'Минута: «Сколько приседаний успеешь за минуту?»',
  'Честность: «Халтуру камера не засчитает». Вопрос — сколько чистых повторов сделаешь.',
  'Слабо: «Слабо 20 отжиманий без перерыва?»',
];

function prompt() {
  const list = (ids) => ids.map((id) => `- ${id} (${(catalog[id].to - catalog[id].from).toFixed(1)} с): ${catalog[id].about}`).join('\n');
  return `Сценарий короткого закольцованного рилса (8–10 секунд, без голоса, только музыка и крупный текст) для Instagram про фитнес-игру NikitenokArena. Ролик зациклен: конец незаметно переходит в начало, поэтому его пересматривают 2–3 раза. Задача — чтобы зритель понял суть без звука за 1 секунду и написал ответ в комментариях.

${FACTS}

Угол этого ролика: ${ANGLES[n % ANGLES.length]}
${topic ? `Тема от автора: ${topic}\n` : ''}${user ? 'Ролик открывает и закрывает настоящее видео: человек отжимается перед телефоном. Между ними — кадры игры, где эти повторы бьют врагов.\n' : ''}
Текст на экране весь ролик:
- hook.top — 2–4 слова белым, hook.accent — 1–3 слова цветом. Вместе это вопрос или вызов, понятный без звука. Без названия приложения, без эмодзи, до 30 символов вместе.
- ask — плашка внизу, до 30 символов: призыв ответить цифрой в комментариях («Пиши свой рекорд в комменты»).

Видеоряд:${user ? '' : `
- anchor — клип, который откроет и закроет ролик (самое яркое действие), один из:
${list(anchors)}`}
- middle — ровно 2 разных клипа для середины (что происходит в игре от повторов)${user ? '' : ', не равные anchor'}, из:
${list(middles)}

Фоновая музыка — один трек по настроению:
${Object.entries(music).map(([id, about]) => `- ${id}: ${about}`).join('\n')}

Подпись (caption): первая строка — тот же вопрос с ключевыми словами (тренировки дома, отжимания, фитнес-игра), 1–2 строки о том, что это игра в Telegram, где камера считает повторы, затем «Напиши в комментах свой результат — а кто напишет «ХОЧУ», пришлю ссылку». Хэштегов 3–5, по-русски и один английский.

Ответь только JSON без пояснений и без markdown:
{"hook":{"top":"...","accent":"..."},"ask":"...",${user ? '' : '"anchor":"id",'}"middle":["id","id"],"music":"id","caption":"...","hashtags":["#..."]}`;
}

/** Проверка сценария: список проблем (пустой — всё хорошо). */
export function problems(s, withUser = user) {
  const out = [];
  if (!s?.hook?.top || !s.hook.accent) out.push('нет hook.top/accent');
  else if ((s.hook.top + s.hook.accent).length > 38) out.push('хук длиннее 30 символов');
  if (!s?.ask || String(s.ask).length > 36) out.push('ask до 30 символов');
  if (!withUser && !anchors.includes(s?.anchor)) out.push(`anchor ${s?.anchor} не из списка`);
  const M = Array.isArray(s?.middle) ? s.middle : [];
  if (M.length !== 2 || M[0] === M[1]) out.push('middle — ровно 2 разных клипа');
  for (const id of M) if (!middles.includes(id) || id === s.anchor) out.push(`клип ${id} не подходит для середины`);
  if (!music[s?.music]) out.push(`нет трека ${s?.music}`);
  if (!Array.isArray(s?.hashtags) || s.hashtags.length < 2 || s.hashtags.length > 5) out.push('хэштегов 3–5');
  if (!s?.caption) out.push('нет caption');
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
      if (user) json.anchor = 'user';
      writeFileSync('script.json', JSON.stringify({ n, loop: true, angle: ANGLES[n % ANGLES.length], topic, ...json }, null, 2));
      console.log(JSON.stringify(json, null, 2));
      process.exit(0);
    } catch (e) {
      last = e.message.slice(0, 400);
      console.log(`попытка ${attempt}: ${last}`);
    }
  }
  process.exit(1);
}
