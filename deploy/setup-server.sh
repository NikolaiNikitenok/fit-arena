#!/usr/bin/env bash
# Разовая настройка сервера под arena.nikitenok.ru (Ubuntu/Debian, запускать от root).
#   EMAIL=you@example.com bash setup-server.sh
# Необязательно: BOT_TOKEN=... — сразу пропишет кнопку «Арена» в меню бота.
set -euo pipefail

DOMAIN=arena.nikitenok.ru
WEBROOT=/var/www/arena
DEPLOY_USER=deploy
EMAIL=${EMAIL:?Укажите EMAIL для сертификата}

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx rsync curl

# Пользователь, под которым GitHub Actions будет выкладывать сборку.
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
mkdir -p "$WEBROOT" "/home/$DEPLOY_USER/.ssh"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$WEBROOT"
if [ ! -f "/home/$DEPLOY_USER/.ssh/id_deploy" ]; then
  ssh-keygen -t ed25519 -N "" -C "github-actions-fit-arena" -f "/home/$DEPLOY_USER/.ssh/id_deploy"
  cat "/home/$DEPLOY_USER/.ssh/id_deploy.pub" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"; chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

[ -f "$WEBROOT/index.html" ] || echo '<!doctype html><meta charset="utf-8"><p>Fit Arena скоро будет здесь</p>' > "$WEBROOT/index.html"

cat > "/etc/nginx/sites-available/$DOMAIN" <<'NGINX'
server {
    listen 80;
    server_name arena.nikitenok.ru;
    root /var/www/arena;
    index index.html;

    # Модель и WASM большие и не меняются между версиями без смены имени — кэшируем надолго.
    location ~* \.(wasm|task)$ {
        types { application/wasm wasm; application/octet-stream task; }
        add_header Cache-Control "public, max-age=2592000";
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri /index.html;
        add_header Cache-Control "no-cache";
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

if [ -n "${BOT_TOKEN:-}" ]; then
  curl -sS "https://api.telegram.org/bot$BOT_TOKEN/setChatMenuButton" \
    -H 'Content-Type: application/json' \
    -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Арена\",\"web_app\":{\"url\":\"https://$DOMAIN/\"}}}"
  echo
fi

echo
echo "Готово. Добавьте в GitHub → Settings → Secrets and variables → Actions:"
echo "  DEPLOY_HOST = $(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')"
echo "  DEPLOY_USER = $DEPLOY_USER"
echo "  DEPLOY_KEY  = содержимое файла ниже:"
echo
cat "/home/$DEPLOY_USER/.ssh/id_deploy"
