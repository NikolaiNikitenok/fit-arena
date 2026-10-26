// Пересборка библиотеки музыки: node make.mjs [id…] → <id>.m4a рядом (34 с, громкость −16 LUFS). Нужны playwright и ffmpeg.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url).pathname;
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<html><body></body></html>');
await p.addScriptTag({ content: readFileSync(`${dir}synth.js`, 'utf8') });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : await p.evaluate(() => window.TRACK_IDS);
for (const id of ids) {
  const wav = await p.evaluate(([id]) => window.render(id, 34), [id]);
  writeFileSync(`${dir}${id}.wav`, Buffer.from(wav, 'base64'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${dir}${id}.wav`, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', `${dir}${id}.m4a`]);
  unlinkSync(`${dir}${id}.wav`);
  console.log(id);
}
await b.close();
