// Отправка рилса от персонажа админу: файл без пережатия, версия без музыки и подпись с хэштегами.
// Запуск: node send.mjs <chat_id> [ошибка]. С текстом ошибки шлёт только сообщение о сбое.
import { readFileSync } from 'node:fs';

const [chat, fail] = process.argv.slice(2);
const api = (m) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`;
async function call(method, body) {
  const r = await fetch(api(method), body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
}
const doc = async (file, name, caption) => {
  const fd = new FormData();
  fd.set('chat_id', chat);
  fd.set('disable_content_type_detection', 'true');
  fd.set('caption', caption);
  fd.set('document', new Blob([readFileSync(file)], { type: 'video/mp4' }), name);
  await call('sendDocument', fd);
};
if (fail) {
  await call('sendMessage', { chat_id: chat, text: `🎭 Рилс от персонажа не собрался: ${fail}. Нажми «🎭 Рилс от персонажа» ещё раз.` });
} else {
  const s = JSON.parse(readFileSync('script.json', 'utf8'));
  const name = `NikitenokArena-talk-${String(s.n).padStart(3, '0')}.mp4`;
  const who = [...new Set(s.lines.map((l) => s.cast[l.who].name))].join(' и ');
  await doc('reel.mp4', name, `🎭 Рилс от персонажа №${s.n}: ${who}, «${s.hook.top} ${s.hook.accent}»\nМузыка «${s.music}». Файл 1080×1920 в исходном качестве — сохрани и загружай в Instagram.`);
  await doc('reel-voice.mp4', name.replace('.mp4', '-voice.mp4'), `🔇 Та же версия без музыки, только голоса. В Instagram добавь трендовый трек и убавь его громкость.`);
  await call('sendMessage', { chat_id: chat, text: `${s.caption}\n\n${s.hashtags.join(' ')}` });
}
