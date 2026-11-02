#!/usr/bin/env bash
# Разовая настройка сервера под Nikitenok ID (id.nikitenok.ru, папка id/ в репозитории). Запускать от root.
#   sudo bash deploy/setup-id.sh
# Что делает (повторный запуск ничего не ломает):
#   1. /opt/nikitenok-id (код, его выкладывает автодеплой) и /opt/nikitenok-id/data (база, ключ подписи, копии) — владелец deploy.
#   2. clients.json с приложением «Свобода» (habit) и его секрет в /opt/arena-server/.nid-habit-secret.
#   3. Сервис systemd nikitenok-id на 127.0.0.1:8095 и право deploy его перезапускать.
#   4. Блок Caddy для id.nikitenok.ru (остальные сайты не трогает).
#   5. Ночные резервные копии данных Арены и Nikitenok ID в /var/backups/nikitenok (14 дней).
set -euo pipefail

DOMAIN=id.nikitenok.ru
APP=/opt/nikitenok-id
DATA=$APP/data
PORT=8095
DEPLOY_USER=deploy
CADDYFILE=/etc/caddy/Caddyfile
ARENA=/opt/arena-server

# node:sqlite без флагов есть с Node 22.13.
NODE_OK=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a>22||(a===22&&b>=13)?1:0)')
if [ "$NODE_OK" != 1 ]; then
  echo "Нужен Node.js 22.13 или новее (сейчас $(node -v)). Обнови: curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
  exit 1
fi

mkdir -p "$DATA"
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP" "$DATA"
chmod 700 "$DATA"

# Приложения, которым можно входить через ID. Секрет «Свободы» знает только сервер Арены (там живёт server/habit.ts).
if [ ! -f "$DATA/clients.json" ]; then
  HABIT_SECRET=$(openssl rand -hex 32)
  HABIT_HASH=$(printf '%s' "$HABIT_SECRET" | sha256sum | cut -d' ' -f1)
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$ARENA/.nid-habit-secret"
  printf '%s' "$HABIT_SECRET" > "$ARENA/.nid-habit-secret"
  cat > "$DATA/clients.json" <<JSON
[
  {
    "id": "habit",
    "name": "Свобода",
    "secret_sha256": "$HABIT_HASH",
    "redirect_uris": ["https://habit.nikitenok.ru/"],
    "url": "https://habit.nikitenok.ru/",
    "resolve": true
  }
]
JSON
  chown "$DEPLOY_USER:$DEPLOY_USER" "$DATA/clients.json"
  chmod 600 "$DATA/clients.json"
  echo "Создан клиент habit, секрет записан в $ARENA/.nid-habit-secret"
fi

cat > /etc/systemd/system/nikitenok-id.service <<UNIT
# /etc/systemd/system/nikitenok-id.service — Nikitenok ID, единый вход приложений Nikitenok.
[Unit]
Description=Nikitenok ID
After=network.target

[Service]
User=$DEPLOY_USER
WorkingDirectory=$APP
Environment=PORT=$PORT
Environment=ISSUER=https://$DOMAIN
Environment=DATA_DIR=$DATA
ExecStart=/usr/bin/node $APP/id.cjs
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart nikitenok-id" > /etc/sudoers.d/nikitenok-id
chmod 440 /etc/sudoers.d/nikitenok-id
systemctl daemon-reload
systemctl enable nikitenok-id
[ -f "$APP/id.cjs" ] && systemctl restart nikitenok-id || echo "Код ID ещё не выложен: сервис запустится после автодеплоя."

if ! grep -q "^$DOMAIN" "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDYFILE" <<CADDY

$DOMAIN {
	encode gzip
	header Strict-Transport-Security "max-age=31536000"
	reverse_proxy 127.0.0.1:$PORT
}
CADDY
fi
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl reload caddy

# Ночные копии: данные Арены (там же прогресс «Свободы») и копии базы ID, которые сервис делает сам.
mkdir -p /var/backups/nikitenok
chmod 700 /var/backups/nikitenok
cat > /etc/cron.daily/nikitenok-backup <<'CRON'
#!/bin/sh
# Копии данных приложений Nikitenok, 14 последних. Ключ подписи ID сюда не попадает.
set -e
D=/var/backups/nikitenok
DAY=$(date +%F)
[ -d /opt/arena-server/data ] && tar czf "$D/arena-data-$DAY.tgz" -C /opt/arena-server data
[ -d /opt/nikitenok-id/data/backups ] && tar czf "$D/id-db-$DAY.tgz" -C /opt/nikitenok-id/data backups
find "$D" -name '*.tgz' -mtime +14 -delete
CRON
chmod 755 /etc/cron.daily/nikitenok-backup
/etc/cron.daily/nikitenok-backup || echo "Первая копия не сделалась — проверь /etc/cron.daily/nikitenok-backup"

# Сервер Арены читает секрет habit при запуске.
systemctl restart arena-server || true

echo "Готово: https://$DOMAIN (A-запись $DOMAIN → IP этого сервера)."
echo "Дальше: секреты репозитория ID_BOT_TOKEN и ID_BOT_USERNAME (бот для виджета, в BotFather /setdomain $DOMAIN),"
echo "и в приложении на oauth.yandex.ru добавить Redirect URI https://$DOMAIN/auth/yandex/callback."
