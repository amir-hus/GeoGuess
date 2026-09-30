#!/bin/bash
# Install or update the GeoGuess login helper on CT 104. Safe to run again.
# Run as root inside CT 104:  bash /opt/geoguess/deploy/ct104/install.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SITE=/etc/nginx/sites-available/geoguess
CONFIG=/etc/gg-helper/config.json

# Service user that can read the config but nothing else
id gg-helper >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin gg-helper
mkdir -p /etc/gg-helper
chown root:gg-helper /etc/gg-helper
chmod 750 /etc/gg-helper

# Password (first install only; change it later with set-password.js)
if [ ! -f "$CONFIG" ]; then
    echo "Choose the GeoGuess password."
    GG_HELPER_CONFIG="$CONFIG" node "$DIR/gg-helper/set-password.js"
fi
chown root:gg-helper "$CONFIG"
chmod 640 "$CONFIG"

# Login page
install -m 644 "$DIR/login.html" /var/www/gg-login/login.html

# Helper service
install -m 644 "$DIR/gg-helper.service" /etc/systemd/system/gg-helper.service
systemctl daemon-reload
systemctl enable gg-helper >/dev/null
systemctl restart gg-helper
sleep 1
systemctl is-active --quiet gg-helper || { journalctl -u gg-helper -n 20 --no-pager; exit 1; }

# nginx site (keeps a backup of the old one, and puts it back if the new one is rejected)
if ! cmp -s "$DIR/nginx-geoguess.conf" "$SITE"; then
    BACKUP="$SITE.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$SITE" "$BACKUP"
    install -m 644 "$DIR/nginx-geoguess.conf" "$SITE"
    if ! nginx -t; then
        cp "$BACKUP" "$SITE"
        echo "nginx rejected the new site config; the old one was restored. Nothing else was changed in nginx."
        exit 1
    fi
fi
nginx -t
systemctl reload nginx

echo "Done. Checks:"
echo -n "  no login     -> "; curl -s -o /dev/null -w "%{http_code} (expect 302)\n" http://127.0.0.1/
echo -n "  login page   -> "; curl -s -o /dev/null -w "%{http_code} (expect 200)\n" http://127.0.0.1/login.html
echo -n "  helper       -> "; curl -s http://127.0.0.1/__login/status; echo
