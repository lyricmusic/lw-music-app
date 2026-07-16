#!/usr/bin/env bash
set -Eeuo pipefail

domain="syncly.lyricweb.ru"
server_ip="109.172.7.119"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
    echo "Certbot is not installed on the deployment server." >&2
    exit 1
fi

resolved_ip="$(getent ahostsv4 "${domain}" | awk 'NR == 1 { print $1 }' || true)"
if [[ "${resolved_ip}" != "${server_ip}" ]]; then
    echo "${domain} resolves to '${resolved_ip:-nothing}', expected '${server_ip}'." >&2
    exit 1
fi

certbot --nginx \
    --domain "${domain}" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --redirect \
    --keep-until-expiring
