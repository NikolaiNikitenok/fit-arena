// Сценарий рилса «от персонажа»: герои игры по очереди рассказывают про NikitenokArena, крупно как во влоге
// или в углу поверх геймплея. Ведущий и тон меняются по кругу от номера рилса.
// Запуск: node generate.mjs <номер> [тема] → script.json. Нужен CLAUDE_CODE_OAUTH_TOKEN или ANTHROPIC_API_KEY.
import { readFileSync, writeFileSync } from 'node:fs';
import { askApi, askClaude, FACTS } from '../reels/generate.mjs';

const catalog = JSON.parse(readFileSync(new URL('../reels/catalog.json', import.meta.url), 'utf8'));
const music = JSON.parse(readFileSync(new URL('../reels/music/library.json', import.meta.url), 'utf8'));
const n = Number(process.argv[2] ?? 0) || 0;
const topic = (process.argv[3] ?? '').trim().slice(0, 300);

// Мужские персонажи игры (src/game/npcs.ts): модель, окраска, голос (сдвиг тона и темпа edge-tts) и характер.
export const CAST = {
  grom: {
    name: 'Мастер Гром', role: 'наставник', model: 'Barbarian', pitch: '-8Hz', rate: '+6%',
    about: 'бывший тренер чемпионов, строгий, но добрый, говорит коротко и весомо, любит армейскую прямоту и сухой юмор',
  },
  knyaz: {
    name: 'Князь Диван', role: 'злодей', model: 'Skeleton_Mage', tint: 'mul:1.2,0.6,1.4', pitch: '-16Hz', rate: '-4%',
    about: 'главный злодей, ленивый и вальяжный, усыпил три мира, уговаривает не тренироваться и смешно злится, когда игрок всё равно качается; когда-то был чемпионом и выгорел',
  },
  boris: {
    name: 'Борис Петрович', role: 'физрук', model: 'Barbarian', tint: 'mul:0.75,0.95,1.3', pitch: '+2Hz', rate: '+14%',
    about: 'бывший школьный учитель физкультуры, бодрый, командует «равняйсь», «шагом марш», «не филоним», говорит свистками и школьными шутками',
  },
  fedor: {
    name: 'Купец Фёдор', role: 'торговец', model: 'Mage', pitch: '+8Hz', rate: '+10%',
    about: 'хитрый и обаятельный купец, всё сводит к выгоде и наградам: «за каждое отжимание — монетки», расхваливает товар как на ярмарке',
  },
};
const ORDER = ['grom', 'knyaz', 'boris', 'fedor'];

export const TONES = {
  funny: 'Смешной: скетч или перепалка, ирония, неожиданная концовка. Юмор добрый, без пошлости.',
  motivating: 'Мотивирующий: заряжает встать и сделать десять отжиманий прямо сейчас, сильные короткие фразы, без пафосной воды.',
  tips: 'Полезный: 2–3 конкретных совета по технике или привычке (отжимания, приседания, пресс, планка, регулярность), и как в этом помогает приложение.',
};
const TONE_ORDER = ['funny', 'motivating', 'tips'];

// Жесты — клипы animations.glb, которые подходят к речи.
export const GESTURES = {
  idle: 'Idle', explain: 'Interact', cheer: 'Cheer', wave: 'Block', magic: 'Spellcasting', punch: 'Unarmed_Melee_Attack_Punch_A', ready: 'Idle_Combat',
};

export function pick(n) {
  const host = ORDER[n % ORDER.length];
  const tone = TONE_ORDER[n % TONE_ORDER.length]; // 4 ведущих × 3 тона: все сочетания за 12 рилсов
  // Гость для перепалки: у злодея — наставник, у остальных — злодей.
  const guest = host === 'knyaz' ? 'grom' : 'knyaz';
  return { host, tone, guest };
}

function prompt({ host, tone, guest }) {
  const clips = Object.entries(catalog).map(([id, c]) => `- ${id} (${(c.to - c.from).toFixed(1)} с): ${c.about}`).join('\n');
  const who = (id) => `${id} — ${CAST[id].name} (${CAST[id].role}): ${CAST[id].about}`;
  return `Напиши сценарий вертикального рилса для Instagram (20–28 секунд) про фитнес-игру NikitenokArena. Рассказывают персонажи самой игры, человека в кадре нет. Цель — чтобы рилс досматривали и шли в приложение.

${FACTS}

Ведущий: ${who(host)}
Гость (может вставить 1–3 реплики, перебить, поспорить; можно обойтись без него, если тону не нужно): ${who(guest)}
Тон: ${TONES[tone]}
${topic ? `Тема от автора: ${topic}\n` : ''}
Персонажи говорят от первого лица, как блогеры: обращаются к зрителю на «ты», остаются в характере. Первая реплика — хук ведущего, цепляет с первой секунды. Последняя — призыв ведущего.

Кадр у каждой реплики (layout):
- vlog — персонаж крупно на весь экран, будто снимает влог на фронталку, фон — размытая игра (клип);
- corner — на весь экран идёт игра (клип), персонаж в углу комментирует.
Первая реплика всегда vlog, последняя всегда corner (на клипе cta). Чередуй: не больше двух одинаковых подряд, corner там, где важно показать фичу.

Жест (gesture) к каждой реплике: ${Object.keys(GESTURES).join(', ')}. Подбирай по смыслу (wave — отмахивается, cheer — радуется, explain — объясняет, magic — колдует, punch — удар, ready — в стойке).

Видеоряд — только клипы из списка:
${clips}
Один клип не больше двух раз и не два раза подряд; cta только последним.

Озвучка (say): числа словами; название только «Никитёнок Арена» (с ё), Telegram пиши «Телеграм». В последней реплике: «Никитёнок Арена», бесплатно в Телеграме, «ссылка в профиле».
Титры (subs): та же реплика, 1–3 куска по 2–4 слова (до 24 символов), цифрами где удобно; в титрах название NikitenokArena, Telegram латиницей.
Хук (hook): top — 2–4 слова, accent — 1–3 самых цепляющих слова; показываются сверху во время первой реплики.

Фоновая музыка — один трек по настроению:
${Object.entries(music).map(([id, about]) => `- ${id}: ${about}`).join('\n')}

Ответь только JSON без пояснений и без markdown:
{"hook":{"top":"...","accent":"..."},"lines":[{"who":"${host}","say":"...","subs":["..."],"clip":"...","layout":"vlog","gesture":"explain"}],"caption":"подпись для Instagram: 3–6 коротких строк, с эмодзи, вопрос для комментариев и «ссылка в профиле»","hashtags":["#..."],"music":"id трека"}
who — только ${host} или ${guest}. Всего 6–9 реплик, 45–65 слов в say суммарно, каждая реплика до 12 слов. Хэштегов 8–12.`;
}

/** Проверка сценария: список проблем (пустой — всё хорошо). */
export function problems(s, { host, guest }) {
  const out = [];
  if (!s?.hook?.top || !s.hook.accent) out.push('нет hook.top/accent');
  const L = s?.lines;
  if (!Array.isArray(L) || L.length < 6 || L.length > 9) return [...out, 'реплик должно быть 6–9'];
  const words = L.reduce((a, l) => a + String(l.say ?? '').split(/\s+/).filter(Boolean).length, 0);
  if (words < 35 || words > 75) out.push(`слов ${words}, нужно 45–65`);
  L.forEach((l, i) => {
    if (l.who !== host && l.who !== guest) out.push(`реплика ${i + 1}: who ${l.who}`);
    if (!catalog[l.clip]) out.push(`реплика ${i + 1}: нет клипа ${l.clip}`);
    if (i > 0 && l.clip === L[i - 1].clip) out.push(`реплика ${i + 1}: клип подряд`);
    if (l.layout !== 'vlog' && l.layout !== 'corner') out.push(`реплика ${i + 1}: layout ${l.layout}`);
    if (!GESTURES[l.gesture]) l.gesture = 'explain';
    if (!Array.isArray(l.subs) || !l.subs.length || l.subs.length > 4) out.push(`реплика ${i + 1}: subs 1–3 куска`);
    if (l.clip === 'cta' && i !== L.length - 1) out.push('cta только последним');
  });
  if (L[0].layout !== 'vlog' || L[0].who !== host) out.push('первая реплика — ведущий, vlog');
  if (L.at(-1).clip !== 'cta' || L.at(-1).layout !== 'corner') out.push('последняя реплика — corner на cta');
  if (!/Никитёнок Арен/i.test(L.at(-1).say ?? '')) out.push('в призыве нет «Никитёнок Арена»');
  if (!music[s.music]) out.push(`нет трека ${s.music}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = pick(n);
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = prompt(p) + (last ? `\n\nПрошлый вариант не прошёл проверку: ${last}. Исправь.` : '');
      const raw = process.env.CLAUDE_CODE_OAUTH_TOKEN ? askClaude(text) : await askApi(text);
      const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const bad = problems(json, p);
      if (bad.length) throw new Error(bad.join('; '));
      for (const l of json.lines) l.say = l.say.replace(/Никитенок/g, 'Никитёнок');
      writeFileSync('script.json', JSON.stringify({ n, ...p, topic, cast: { [p.host]: CAST[p.host], [p.guest]: CAST[p.guest] }, ...json }, null, 2));
      console.log(JSON.stringify(json, null, 2));
      process.exit(0);
    } catch (e) {
      last = e.message.slice(0, 400);
      console.log(`попытка ${attempt}: ${last}`);
    }
  }
  process.exit(1);
}
