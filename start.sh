#!/bin/bash
# ── Start-up script for VS-AI on Railway ────────────────────────────
# 1. Reconfigure Apache to listen on the dynamic $PORT provided by
#    Railway (defaults to 80 for local / non-containerised use).
# 2. Generate config.php from environment variables if a template
#    exists and config.php is not already present.
# 3. Hand over to apache2-foreground.

set -e

# ── 1. Dynamic PORT configuration ──────────────────────────────────
PORT="${PORT:-80}"

# Update ports.conf — change every "Listen 80" to "Listen $PORT"
sed -i "s/^Listen 80\b/Listen ${PORT}/" /etc/apache2/ports.conf

# Update the default vhost to match
sed -i \
    -e "s|VirtualHost \*:80|VirtualHost *:${PORT}|g" \
    -e "s|ServerName .*|ServerName localhost|" \
    /etc/apache2/sites-available/000-default.conf

echo "[start.sh] Apache configured to listen on port ${PORT}"

# ── 2. Generate config.php from environment when needed ────────────
# If config.php doesn't exist in the container (it's in .gitignore)
# but config.php.example does, render it from env vars.
if [ ! -f /var/www/html/config.php ] && [ -f /var/www/html/config.php.example ]; then
    echo "[start.sh] Generating config.php from environment variables..."
    cp /var/www/html/config.php.example /var/www/html/config.php
fi

# ── 3. Start Apache ────────────────────────────────────────────────
exec apache2-foreground
