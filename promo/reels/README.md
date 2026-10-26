# Рилсы для Instagram по кнопке

Админ жмёт в боте «🎬 Новый рилс» (или `/reel тема`) → `server/reels.ts` запускает `.github/workflows/reel.yml` → готовый файл 1080×1920 и подпись с хэштегами приходят админу в Telegram.

Шаги в workflow (каждый — отдельный скрипт, запускается из рабочей папки):
1. `generate.mjs <номер> [тема]` — Claude (подписка `CLAUDE_CODE_OAUTH_TOKEN` или `ANTHROPIC_API_KEY`) пишет `script.json`: хук, реплики, клипы из `catalog.json`, подпись. Формула хука меняется по номеру рилса.
2. `synth.py` — озвучка нейроголосом Microsoft (edge-tts, без ключа), `vo/N.wav`. В озвучке название всегда «Никитёнок» через ё.
3. `render.mjs` — титры и хук-карточка (Playwright, шрифт Nunito из `fonts/`).
4. `build.py` — монтаж из `footage.mp4` (кадры промо v2), наезды на склейках, музыка под голосом; рядом `reel-voice.mp4` — тот же ролик только с голосом.
5. `send.mjs <chat_id>` — отправка двух файлов без пережатия (с музыкой и без) и подписи.

Музыка: `music/<id>.m4a`, описания настроений в `music/library.json` — по ним Claude выбирает трек. Свои 8 треков синтезируются `music/synth.js` (`node music/make.mjs [id…]`). Чужой трек можно добавить так же: файл `music/<id>.m4a` (34+ с, без авторских прав) и строка в `library.json`.

Новые сцены: добавить кусок в `footage.mp4` и описать его в `catalog.json` (`from`/`to` в секундах и что видно).
Секреты: `GH_ACTIONS_TOKEN` (fine-grained, только этот репозиторий, Actions: Read and write) для кнопки; `BOT_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` уже есть.
