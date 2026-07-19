#!/usr/bin/env bash
set -Eeuo pipefail

# Installs the static Syncly build and enables HTTPS for its subdomain.

domain="syncly.lyricweb.ru"
server_ip="109.172.7.119"
deploy_user="coolspectre"
upload_dir="/home/${deploy_user}/lyricweb-deploy"
archive="${upload_dir}/dist.tar.gz"
nginx_source="${upload_dir}/syncly.lyricweb.ru.conf"
release_root="/var/www/syncly.lyricweb.ru"
release_id="$(date -u +%Y%m%d%H%M%S)"
release_dir="${release_root}/releases/${release_id}"
current_link="${release_root}/current"
nginx_available="/etc/nginx/sites-available/syncly.lyricweb.ru.conf"
nginx_enabled="/etc/nginx/sites-enabled/syncly.lyricweb.ru.conf"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

for required_file in "${archive}" "${nginx_source}"; do
    if [[ ! -f "${required_file}" ]]; then
        echo "Missing deployment file: ${required_file}" >&2
        exit 1
    fi
done

install -d -m 0755 "${release_dir}" /var/www/letsencrypt
tar -xzf "${archive}" -C "${release_dir}"
chown -R root:root "${release_dir}"
find "${release_dir}" -type d -exec chmod 0755 {} +
find "${release_dir}" -type f -exec chmod 0644 {} +

install -m 0644 "${nginx_source}" "${nginx_available}"
ln -sfn "${nginx_available}" "${nginx_enabled}"
ln -sfn "${release_dir}" "${current_link}"

nginx -t
systemctl reload nginx

resolved_ip="$(getent ahostsv4 "${domain}" | awk 'NR == 1 { print $1 }' || true)"
if [[ "${resolved_ip}" == "${server_ip}" ]]; then
    certbot --nginx \
        --domain "${domain}" \
        --non-interactive \
        --agree-tos \
        --register-unsafely-without-email \
        --redirect
else
    echo "HTTP deployment is ready, but HTTPS was skipped."
    echo "${domain} currently resolves to '${resolved_ip:-nothing}', expected '${server_ip}'."
fi

echo "Deployment release: ${release_dir}"
