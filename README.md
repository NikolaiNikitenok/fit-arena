# Fit Arena

Telegram Mini App для соревнований в отжиманиях, приседаниях и прессе. Камера телефона считает повторы прямо в браузере через MediaPipe Pose, видео никуда не отправляется.

Режимы:
- **Кампания** (`src/campaign.ts`, `src/Campaign.tsx`): три мира по пять уровней, в конце каждого мира босс с яростью на половине здоровья; за победу от 1 до 3 звёзд, следующий уровень открывается после победы. Прогресс пока хранится в браузере.
- **Дуэль** (`src/Duel.tsx`, `server/`): бой с живым соперником по коду или ссылке-приглашению из Telegram; бой считается на сервере матчей.

Каждый засчитанный повтор — удар по сопернику, три подряд — комбо. Сцена — `src/arena/Arena3D.tsx` (Three.js через React Three Fiber), бойцы — модель [RobotExpressive](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) от Tomás Laulhé (CC0).

## Запуск

```bash
npm install
npm run dev     # http://localhost:5173, в сети доступен по IP компьютера
npm run dev:server  # сервер матчей для дуэлей на :8787
npm test        # тесты
npm run build   # сборка в dist/
```

Камера работает только по HTTPS (или на localhost).

## Деплой на arena.nikitenok.ru

1. На сервере один раз запустить от root `deploy/setup-server.sh`: он добавляет сайт в Caddy (сертификат Caddy выпускает сам), создаёт пользователя `deploy` с SSH-ключом и показывает, где лежит ключ для секретов.
   ```bash
   BOT_TOKEN=<токен бота> bash setup-server.sh
   ```
   `BOT_TOKEN` необязателен: с ним скрипт сразу добавит кнопку «Арена» в меню бота. Токен никуда не сохраняется.
2. Добавить в GitHub → Settings → Secrets and variables → Actions секреты `DEPLOY_HOST` (IP сервера), `DEPLOY_USER` (`deploy`) и `DEPLOY_KEY` (приватный ключ из вывода скрипта).
3. Дальше каждый push в `main` проходит тесты, собирается и выкладывается на сервер (`.github/workflows/deploy.yml`).
4. Админ (статистика в настройках, сводка от бота в 9:00 по Москве, тревоги о новых ошибках, письма игроков боту): свой id из «Настроек» добавить в файл, сервер перечитает его сам.
   ```bash
   echo 123456789 >> /opt/arena-server/.admin-ids && chown deploy: /opt/arena-server/.admin-ids
   ```
   Статистика и ошибки копятся в `/opt/arena-server/data/telemetry.json`, политика конфиденциальности — `/privacy.html`.

## Как считаются повторы

`src/repCounter.ts` берёт угол в ключевом суставе со стороны, которую камера видит лучше, и считает повтор при переходе «верх → низ → верх».

| Упражнение | Угол | Низ | Верх | Камера |
| --- | --- | --- | --- | --- |
| Отжимания | плечо-локоть-запястье | < 90° | > 155° | сбоку, на полу; корпус должен быть прямым |
| Приседания | таз-колено-лодыжка | < 100° | > 160° | сбоку или вполоборота |
| Пресс | плечо-таз-колено | < 70° | > 110° | сбоку, на полу |

Кроме угла, в каждом кадре проверяется положение тела: для отжиманий упор лёжа и ладони на полу, для приседаний стойка, для пресса таз и стопы на полу; стопы должны быть в кадре. Повторы быстрее 400 мс не засчитываются. Модель (`public/models/pose_landmarker_lite.task`) и WASM раздаются со своего хостинга, без внешних CDN.

## Карта «Битвы городов»

Контуры России и соседей, сетка и 260 городов с координатами собраны из [Natural Earth](https://www.naturalearthdata.com/) (общественное достояние), границы — в варианте «с точки зрения России». Готовые файлы — `src/city/mapShapes.ts` и `shared/russiaCities.ts`; пересобрать их можно так: скачать `ne_10m_admin_0_countries_rus.geojson` и `ne_10m_populated_places.geojson` из [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson) в одну папку и запустить `node scripts/build-map.mjs <папка>`. Разговорные названия городов («Питер», «екб») — в `shared/cityNames.ts`.

## 3D-модели

Персонажи, постройки, космическая база и город — наборы [KayKit](https://kaylousberg.itch.io/) от Kay Lousberg (лицензия CC0). Исходники лежат в ветке `assets-kaykit`; `node scripts/build-assets.mjs <папка kaykit>` собирает из них сжатые файлы в `public/models/chars` и `public/models/lib`.
