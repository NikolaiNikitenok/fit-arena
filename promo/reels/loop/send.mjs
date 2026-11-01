// Отправка рилса-петли админу: файл без пережатия, обложка и подпись. node send.mjs <chat_id> [ошибка].
import { readFileSync } from 'node:fs';

const [chat, fail] = process.argv.slice(2);
const api = (m) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`;
async function call(method, body) {
  const r = await fetch(api(method), body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
}
const doc = async (file, type, name, caption) => {
  const fd = new FormData();
  fd.set('chat_id', chat);
  fd.set('disable_content_type_detection', 'true');
  fd.set('caption', caption);
  fd.set('document', new Blob([readFileSync(file)], { type }), name);
  await call('sendDocument', fd);
};
if (fail) {
  await call('sendMessage', { chat_id: chat, text: `🔁 Рилс-петля не собралась: ${fail}. Нажми «🔁 Рилс-петля» ещё раз.` });
} else {
  const s = JSON.parse(readFileSync('script.json', 'utf8'));
  const name = `NikitenokArena-loop-${String(s.n).padStart(3, '0')}.mp4`;
  await doc('reel.mp4', 'video/mp4', name,
    `🔁 Рилс-петля №${s.n}: «${s.hook.top} ${s.hook.accent}»${s.anchor === 'user' ? ', открывает твой клип' : ''}. Конец переходит в начало, поэтому его смотрят по несколько раз.\n` +
    `В Instagram не обрезай и не добавляй текст в конце, иначе шов станет заметен. Трендовый звук можно поставить поверх, громкость оригинала тогда убавь до нуля.`);
  await doc('cover.jpg', 'image/jpeg', name.replace('.mp4', '-cover.jpg'), `🖼 Обложка рилса-петли №${s.n}.`);
  await call('sendMessage', { chat_id: chat, text: `${s.caption}\n\n${s.hashtags.join(' ')}` });
}
