# Nikitenok ID

Единый вход для приложений Nikitenok на https://id.nikitenok.ru. План: https://claude.ai/artifact/ACbFfEzNifdV35HV2GhbHq

- OpenID Connect, Authorization Code + PKCE, токены ES256 (`/.well-known/openid-configuration`, `/.well-known/jwks.json`).
- Вход через Telegram (виджет, свой бот с `/setdomain id.nikitenok.ru`) и Яндекс ID (то же приложение, что у Арены, плюс Redirect URI `https://id.nikitenok.ru/auth/yandex/callback`).
- Аккаунт `nid_…` + привязки `tg:N` / `ya:N` / `max:N` (SQLite, `id/server/store.ts`). Данные приложений здесь не хранятся.
- Главная `/`: карточки всех сервисов экосистемы (`id/server/services.ts`: Арена, Print Control, Семейная касса, Свобода, Сервер). У сервиса, чей `client` есть в `clients.json`, золотая отметка «Вход через ID».
- Страница `/account`: имя, привязать/отвязать способ входа, выйти на всех устройствах, удалить аккаунт.
- `POST /api/resolve` — служебный запрос наших серверов «какому nid принадлежит tg:N» (по секрету клиента).
- Приложения-клиенты описаны в `data/clients.json` на сервере. Сейчас подключена «Свобода» (`server/habit.ts`, `habit/cloud.js`).

Код: `id/server/` (`app.ts` — маршруты, `store.ts`, `jwt.ts`, `providers.ts`, `pages.ts`). Тесты: `npx vitest run id/ server/habitNid.test.ts`.
Сборка: `npm run build:id` → `dist-id/id.cjs`. Локально: `PORT=8096 ISSUER=http://127.0.0.1:8096 DATA_DIR=./tmp-id node dist-id/id.cjs`.

Сервер, один раз: `sudo bash deploy/setup-id.sh` (сервис `nikitenok-id` на 127.0.0.1:8096, блок Caddy, секрет клиента habit, ночные копии в /var/backups/nikitenok). Дальше автодеплой при пуше в main.
Нужен Node.js 22.13+ (встроенный `node:sqlite`).
