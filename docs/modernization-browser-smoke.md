# Браузерный smoke — 2026-11-05

Playwright CLI, отдельная сессия arena-qa, desktop Chromium headed; локальный preview127.0.0.1:4173. Production/staging/реальные аккаунты не использовались.

Проверены реальные экраны: чат тренера → «Стать сильнее» → «До10» → «5минут» → «Приключение» → история Мастера Грома и Князя Дивана → «Дальше» → объяснение камеры → «Начать испытание». До первой попытки камеры7 нажатий по этому пути. До первой награды число не измерено: нет подтвержденного физического подхода. История и обе кнопки направления сохранены.

Для негативного сценария через page.evaluate подменен только navigator.mediaDevices.getUserMedia этой тестовой страницы: rejected DOMException('QA: camera denied','NotAllowedError'). Модель MediaPipe/WASM/GPU реально инициализировалась, затем экран показал ошибку и кнопки «Ещё раз», «Считать самому», «К карте». Нажата «Ещё раз», повторно получен отказ; «К карте» вернула главный экран с навигацией. Ручной ввод не использовался, награды/спортивные результаты не создавались. Smoke проведен на промежуточном production bundle; последние текстовые/локализационные изменения проверены сборкой и тестами, финальный полный UI-проход не заявляется.

При двух переходах retry устарели element refs CLI; повторный snapshot дал новые refs, после чего переход выполнен. Это ошибки автоматизации, не основание менять приложение. CLI snapshots находятся в неотслеживаемом .playwright-cli каталоге worktree. Для нового воспроизведения всегда получать свежие refs: open→snapshot→click→snapshot.

Ограничения: локальный backend не запускался; /api/friends/inbox и /api/telemetry отвечали502, поэтому доставка аналитики в реальный backend браузером не проверена (серверное ingestion отдельно покрыто unit tests). В dev режиме junction зависимостей вызывал403 шрифтов Vite; доступ не расширялся, применен production preview. В desktop Chromium видны прежние Three.Clock/PCFSoftShadowMap deprecation и Telegram browser-version warnings. Полный camera stream/readiness/реальное упражнение/награда/энергия/offline persistence этим smoke не проверены.

Для автоматического воспроизведения логики камеры: npm test -- src/useRepCamera.test.ts src/trainingLifecycle.test.ts src/game/WorkoutSession.test.tsx. Это подмена browser/React scheduler, не физические упражнения и не мобильный Telegram WebView.
