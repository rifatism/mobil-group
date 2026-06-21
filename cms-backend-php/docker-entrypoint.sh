#!/bin/sh
set -e

cd /var/www/html

if [ ! -d "vendor" ]; then
    echo "[entrypoint] Running composer install..."
    composer install --no-dev --optimize-autoloader --no-interaction --no-security-blocking
fi

mkdir -p uploads logs
chown -R www-data:www-data uploads logs 2>/dev/null || true

exec "$@"