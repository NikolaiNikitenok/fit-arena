// Отправка готового рилса админу: файл без пережатия и отдельным сообщением подпись с хэштегами.
// Запуск: node send.mjs <chat_id> [ошибка]. С текстом ошибки шлёт только сообщение о сбое.
import { readFileSync } from 'node:fs';

const [chat, fail] = process.argv.slice(2);
const api = (m) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`;
async function call(method, body) {
  const r = await fetch(api(method), body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
}
if (fail) {
  await call('sendMessage', { chat_id: chat, text: `🎬 Рилс не собрался: ${fail}. Нажми «🎬 Новый рилс» ещё раз.` });
} else {
  const s = JSON.parse(readFileSync('script.json', 'utf8'));
  const name = `NikitenokArena-reel-${String(s.n).padStart(3, '0')}.mp4`;
  const fd = new FormData();
  fd.set('chat_id', chat);
  fd.set('disable_content_type_detection', 'true');
  fd.set('caption', `🎬 Рилс №${s.n}: «${s.hook.top} ${s.hook.accent}»\nС музыкой «${s.music}». Файл в исходном качестве 1080×1920 — сохрани и загружай в Instagram.`);
  fd.set('document', new Blob([readFileSync('reel.mp4')], { type: 'video/mp4' }), name);
  await call('sendDocument', fd);
  // Та же версия без музыки: в Instagram под неё ставится трендовый трек.
  const fv = new FormData();
  fv.set('chat_id', chat);
  fv.set('disable_content_type_detection', 'true');
  fv.set('caption', `🔇 Рилс №${s.n} без музыки, только голос. В Instagram добавь трендовый трек из «Музыки» и убавь его громкость, чтобы голос было слышно.`);
  fv.set('document', new Blob([readFileSync('reel-voice.mp4')], { type: 'video/mp4' }), name.replace('.mp4', '-voice.mp4'));
  await call('sendDocument', fv);
  await call('sendMessage', { chat_id: chat, text: `${s.caption}\n\n${s.hashtags.join(' ')}` });
}
