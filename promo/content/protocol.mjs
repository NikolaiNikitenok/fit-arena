import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const DRAFT_PREFIX = '__ARENA_DRAFT_V1__:';
export const MAX_DRAFT_BYTES = 35_000;
export const isMain = (url) => !!process.argv[1] && url === pathToFileURL(resolve(process.argv[1])).href;

/** A local Codex draft is data, never a shell command or executable JavaScript. */
export function preparedDraft(topic) {
  if (!String(topic ?? '').startsWith(DRAFT_PREFIX)) return null;
  const bytes = Buffer.from(topic.slice(DRAFT_PREFIX.length), 'base64url');
  if (bytes.length > MAX_DRAFT_BYTES) throw new Error('Prepared draft is too large');
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value.script !== 'object' || Array.isArray(value.script) || !value.script) throw new Error('Invalid prepared draft');
  return { script: value.script, topic: String(value.topic ?? '').slice(0, 300) };
}

export function encodeDraft(script, topic) {
  const bytes = Buffer.from(JSON.stringify({ script, topic }));
  if (bytes.length > MAX_DRAFT_BYTES) throw new Error('Prepared draft is too large');
  return DRAFT_PREFIX + bytes.toString('base64url');
}

export const QUALITY_BRIEF = `
Редакционная задача: один выпуск — одна ясная идея, не каталог функций.
Хук сразу показывает действие и понятный конфликт/вопрос. Первые две секунды без заставки и общих слов.
Дальше конкретное доказательство в геймплее, затем короткая развязка и один призыв.
Не выдумывай личные результаты, отзывы, статистику и обещания похудения. В игре есть дополнительные PRO-функции: не обещай, что абсолютно всё бесплатно.
Подпись дополняет ролик: первая строка понятна без видео, дальше короткий контекст и естественный вопрос. Не обещай автоматически прислать ссылку каждому комментатору.
Не используй «это изменит твою жизнь», «ты не поверишь», гарантии вирусности и набор из пяти несвязанных преимуществ.
Русский язык разговорный и точный. Смысл должен быть понятен по титрам без звука.`;
