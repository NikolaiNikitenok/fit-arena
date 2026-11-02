#!/usr/bin/env bash
# Разовая настройка сервера под habit.nikitenok.ru («Свобода» — отказ от привычек).
# Статический сайт: добавляет только новый блок в Caddy, остальные сайты не трогает. Запускать от root.
set -euo pipefail

DOMAIN=habit.nikitenok.ru
WEBROOT=/var/www/habit
DEPLOY_USER=deploy
CADDYFILE=/etc/caddy/Caddyfile
SRC="${1:-}"   # необязательно: папка habit/ из репозитория для первой выкладки

mkdir -p "$WEBROOT"
if [ -n "$SRC" ] && [ -f "$SRC/index.html" ]; then cp -r "$SRC"/. "$WEBROOT"/; fi
[ -f "$WEBROOT/index.html" ] || echo '<!doctype html><meta charset="utf-8"><p>Скоро здесь будет «Свобода»</p>' > "$WEBROOT/index.html"
id "$DEPLOY_USER" >/dev/null 2>&1 && chown -R "$DEPLOY_USER:$DEPLOY_USER" "$WEBROOT"

if ! grep -q "^$DOMAIN" "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDYFILE" <<CADDY

$DOMAIN {
	root * $WEBROOT
	encode gzip
	@sw path /sw.js /index.html /
	header @sw Cache-Control "no-cache"
	try_files {path} /index.html
	file_server
}
CADDY
fi
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl reload caddy
echo "Готово: https://$DOMAIN (нужна A-запись $DOMAIN → IP этого сервера)"
