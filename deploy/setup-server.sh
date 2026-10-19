#!/usr/bin/env bash
# Разовая настройка сервера под arena.nikitenok.ru. Сервер уже работает на Caddy:
# скрипт добавляет только новый сайт и не трогает остальные. Запускать от root.
set -euo pipefail

DOMAIN=arena.nikitenok.ru
WEBROOT=/var/www/arena
DEPLOY_USER=deploy
CADDYFILE=/etc/caddy/Caddyfile

# Пользователь, под которым GitHub Actions будет выкладывать сборку.
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
command -v rsync >/dev/null || apt-get install -y rsync
mkdir -p "$WEBROOT" "/home/$DEPLOY_USER/.ssh"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$WEBROOT"
if [ ! -f "/home/$DEPLOY_USER/.ssh/id_deploy" ]; then
  ssh-keygen -t ed25519 -N "" -C "github-actions-fit-arena" -f "/home/$DEPLOY_USER/.ssh/id_deploy"
  cat "/home/$DEPLOY_USER/.ssh/id_deploy.pub" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"; chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

[ -f "$WEBROOT/index.html" ] || echo '<!doctype html><meta charset="utf-8"><p>Fit Arena скоро будет здесь</p>' > "$WEBROOT/index.html"

# Caddy сам выпускает HTTPS-сертификат для нового домена.
if ! grep -q "^$DOMAIN" "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDYFILE" <<CADDY

$DOMAIN {
	# Сервер матчей (deploy/arena-server.service)
	handle /ws* {
		reverse_proxy localhost:8787
	}
	handle /api/* {
		reverse_proxy localhost:8787
	}
	handle {
		root * $WEBROOT
		encode gzip
		@immutable path /assets/*
		header @immutable Cache-Control "public, max-age=31536000, immutable"
		@heavy path *.wasm *.task *.glb
		header @heavy Cache-Control "public, max-age=2592000"
		try_files {path} /index.html
		file_server
	}
}
CADDY
fi
caddy validate --config "$CADDYFILE" --adapter caddyfile

# Сервер матчей: Node.js, каталог для выкладки и сервис, который deploy может перезапускать.
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs; }
mkdir -p /opt/arena-server && chown "$DEPLOY_USER:$DEPLOY_USER" /opt/arena-server
[ -f /etc/arena-server.env ] || { printf 'ALLOW_GUESTS=1\nBOT_TOKEN=%s\n' "${BOT_TOKEN:-}" > /etc/arena-server.env; chmod 600 /etc/arena-server.env; }
cat > /etc/systemd/system/arena-server.service <<'UNIT'
# /etc/systemd/system/arena-server.service — сервер матчей Fit Arena.
[Unit]
Description=Fit Arena match server
After=network.target

[Service]
User=deploy
WorkingDirectory=/opt/arena-server
EnvironmentFile=-/etc/arena-server.env
Environment=PORT=8787
ExecStart=/usr/bin/node /opt/arena-server/server.cjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart arena-server" > /etc/sudoers.d/arena-server
chmod 440 /etc/sudoers.d/arena-server
systemctl daemon-reload
systemctl enable arena-server
systemctl reload caddy

if [ -n "${BOT_TOKEN:-}" ]; then
  curl -sS "https://api.telegram.org/bot$BOT_TOKEN/setChatMenuButton" \
    -H 'Content-Type: application/json' \
    -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Арена\",\"web_app\":{\"url\":\"https://$DOMAIN/\"}}}"
  echo
fi

echo "Готово. Секреты для GitHub Actions: DEPLOY_HOST, DEPLOY_USER=$DEPLOY_USER, DEPLOY_KEY=/home/$DEPLOY_USER/.ssh/id_deploy"
