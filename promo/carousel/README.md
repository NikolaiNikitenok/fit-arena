# Карусели для Instagram по кнопке

Админ жмёт в боте «🖼 Карусель: советы» или «🖼 Карусель: приложение» (или `/carousel tips|app [тема]`) → `server/reels.ts` запускает `.github/workflows/carousel.yml` → альбом из 6–9 слайдов 1080×1350, те же слайды файлами без сжатия и подпись с хэштегами приходят админу в Telegram.

1. `generate.mjs <номер> <tips|app> [тема]` — Claude пишет `carousel.json`. Темы советов (`TIP_THEMES`) и ракурсы про приложение (`APP_ANGLES`) идут по кругу по номеру. В советах говорит персонаж игры (`NPCS`: Гром, Лиса, Марфа, Борис Петрович), приложение — только на последнем слайде. Про приложение — скриншоты из `server/media/channel` (список и описания в `server/channelMedia.ts`).
2. `render.mjs` — слайды `slide_NN.jpg` (Playwright; `CHROME` — путь к готовому Chrome, иначе Chromium Playwright). Портреты — `public/portraits`, шрифт Nunito — `fonts/`.
3. `send.mjs <chat_id>` — альбом фото, альбом файлов, подпись.

Новые скриншоты: положить jpg в `server/media/channel` и описать в `server/channelMedia.ts` — их начнут брать и посты канала, и карусели.
