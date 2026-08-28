#!/bin/bash
# ── Start-up script for VS-AI on Railway ────────────────────────────
# 1. Reconfigure Nginx to listen on the dynamic $PORT (Railway).
# 2. Generate config.php from environment variables if missing.
# 3. Start PHP-FPM (background) + Nginx (foreground).

set -e

# ── 1. Dynamic PORT configuration for Nginx ────────────────────────
PORT="${PORT:-80}"

# Replace the listen port in the Nginx default site config
sed -i \
    -e "s/listen 80 default_server/listen ${PORT} default_server/" \
    -e "s/listen \[::\]:80 default_server/listen [::]:${PORT} default_server/" \
    /etc/nginx/sites-available/default

echo "[start.sh] Nginx configured to listen on port ${PORT}"

# ── 2. Generate config.php from environment when needed ────────────
if [ ! -f /var/www/html/config.php ] && [ -f /var/www/html/config.php.example ]; then
    echo "[start.sh] Generating config.php from config.php.example..."
    cp /var/www/html/config.php.example /var/www/html/config.php
fi

# ── 3. Start PHP-FPM then Nginx ────────────────────────────────────
echo "[start.sh] Starting PHP-FPM..."
php-fpm -D

echo "[start.sh] Starting Nginx..."
exec nginx -g 'daemon off;'
