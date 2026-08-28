# ── Dockerfile for VS-AI chat application ──────────────────────────
# Deploys PHP-FPM + Nginx — the recommended setup for Railway.app.
# Avoids the Apache MPM conflict by using PHP-FPM as the PHP processor
# and Nginx as the web server (no mod_php required).
#
# Railway injects a dynamic $PORT env var at runtime; the start-up
# script re-configures Nginx to listen on that port.

FROM php:8.2-fpm

# ── Install Nginx (Debian-based, uses www-data like PHP-FPM) ─────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── PHP extensions ───────────────────────────────────────────────────
# curl, mbstring, session, json, hash, etc. are in the base image.
# pdo_mysql is needed for potential database use.
RUN docker-php-ext-install pdo_mysql

# ── Nginx configuration ─────────────────────────────────────────────
# Replaces .htaccess rules with native Nginx directives.
COPY nginx.conf /etc/nginx/sites-available/default

# ── Copy application ─────────────────────────────────────────────────
COPY . /var/www/html/
WORKDIR /var/www/html/

# Ensure the web-server user owns the files
RUN chown -R www-data:www-data /var/www/html/

# ── Startup script (dynamic PORT, env-based config) ────────────────
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80
CMD ["/start.sh"]
