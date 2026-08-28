# ── Dockerfile for VS-AI chat application ──────────────────────────
# Deploys a PHP 8.2 + Apache web server suitable for Railway.app.
# Railway injects a dynamic $PORT env var at runtime; the start-up
# script re-configures Apache to listen on that port.

FROM php:8.2-apache

# ── Apache modules ─────────────────────────────────────────────────
# Fix MPM conflict: remove ALL mpm symlinks, then enable only prefork
# (php:8.2-apache ships mpm_event by default; mod_php requires prefork)
RUN rm -f /etc/apache2/mods-enabled/mpm_*.load \
        /etc/apache2/mods-enabled/mpm_*.conf \
        /etc/apache2/mods-enabled/mpm_event.* \
        /etc/apache2/mods-enabled/mpm_worker.* \
        /etc/apache2/mods-enabled/mpm_prefork.* && \
    a2enmod mpm_prefork && \
    a2enmod rewrite headers && \
    echo "=== MPM modules after fix ===" && ls -la /etc/apache2/mods-enabled/mpm_*

# Allow .htaccess overrides in /var/www/html
RUN sed -ri \
    -e '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' \
    /etc/apache2/apache2.conf

# ── PHP extensions ───────────────────────────────────────────────────
# curl, mbstring, session, json, hash, etc. are in the base image.
# No additional extensions required for this project.
RUN docker-php-ext-install pdo_mysql

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
