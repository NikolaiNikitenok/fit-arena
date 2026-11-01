// Скачивает свой клип админа из Telegram по file_id (вход CLIP) в user.mp4. Без CLIP ничего не делает.
// Боту Telegram отдаёт файлы до 20 МБ — больше server/reels.ts и не принимает.
import { writeFileSync } from 'node:fs';

const id = process.env.CLIP;
if (id) {
  const api = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;
  const j = await (await fetch(`${api}/getFile?file_id=${encodeURIComponent(id)}`)).json();
  if (!j.ok) throw new Error(`getFile: ${j.description}`);
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${j.result.file_path}`);
  if (!r.ok) throw new Error(`скачать клип: ${r.status}`);
  writeFileSync('user.mp4', Buffer.from(await r.arrayBuffer()));
  console.log(`user.mp4 ${(j.result.file_size / 1e6).toFixed(1)} МБ`);
}
