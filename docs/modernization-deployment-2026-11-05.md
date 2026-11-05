# Production deployment — 2026-11-05

Статус: PASS для выкладки проверенного пакета; это не закрывает критерии всех этапов модернизации.

Пользователь отдельно разрешил production deploy после отчета об оставшихся ограничениях. PR https://github.com/NikolaiNikitenok/fit-arena/pull/48 объединен squash в main: `1a7e69753f9a34c60d825a440c68a9eef9eac135`. Исходная проверенная ветка: `18bbbe1cd947a7b53e3c8c1095ecbc05bfa12bbf`; деревья исходной ветки и release commit совпали.

GitHub Actions https://github.com/NikolaiNikitenok/fit-arena/actions/runs/42075215618 завершился success, включая Upload to server, 2026-11-05 20:32:05 МСК. Linux: 114 файлов, 951 PASS, без пропусков; frontend/server/ID сборки PASS. Выложено существующим workflow, без изменения его логики и без дополнительных миграций данных.

До выкладки: production version eeb0fc0-2026-11-05, Arena health200/ok. После завершения workflow: version.json200, версия1a7e697-2026-11-05; homepage200; entry JS /assets/index-KHpHO9mL.js200; Arena /api/health200/ok; ID /health200/ok; habit homepage200. Проверки только читающие; тестовые тренировки, начисления, аккаунты и телеметрия в production не создавались. Публичные health endpoints не доказывают весь пользовательский сценарий.

Откат: сохранена remote ветка `codex/arena-production-before-modernization-20261105` на предыдущем production commit `eeb0fc0d0caf1d2376966f90a2e1fe84b54dcc8d`. Для срочного возвращения предыдущих bundles предусмотрен существующий workflow_dispatch:

    gh workflow run deploy.yml --repo NikolaiNikitenok/fit-arena --ref codex/arena-production-before-modernization-20261105

После отката проверить результат Actions и version eeb0fc0-2026-11-05, health endpoints. Такой dispatch не возвращает main назад: до следующего main deploy нужно устранить регрессию либо revert PR48, чтобы она не вернулась. Старый workflow сохраняет текущие data directories; резервная ветка — код для отката, а не backup production БД. `VITE_POSITIONING_GATE=0` — проверенный build-time fallback, требует новой сборки; текущий production workflow использует default enabled.

Оставшиеся ограничения из modernization-progress.md сохраняются: реальные телефоны/физические упражнения и полный camera→reward→spend→reopen E2E не проверены; новый admin dashboard не завершен; известная потеря clan reward при обрыве ответа и клиентская граница доверия соревнований не исправлены. 3D assets не менялись. Deploy не является подтверждением общей готовности проекта.

Этот документ и запись журнала сохраняются отдельно после релиза в рабочей ветке; они не требуют повторной production выкладки.
