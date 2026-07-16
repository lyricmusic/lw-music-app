#!/usr/bin/env bash
set -Eeuo pipefail

deploy_user="${DEPLOY_USER:-coolspectre}"
upload_dir="/home/${deploy_user}/lyricweb-deploy"
archive="${upload_dir}/dist.tar.gz"
release_root="/var/www/syncly.lyricweb.ru"
release_id="$(date -u +%Y%m%d%H%M%S)"
release_dir="${release_root}/releases/${release_id}"
current_link="${release_root}/current"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

if [[ ! -f "${archive}" ]]; then
    echo "Missing deployment archive: ${archive}" >&2
    exit 1
fi

install -d -m 0755 "${release_dir}"
tar -xzf "${archive}" -C "${release_dir}"

if [[ ! -f "${release_dir}/index.html" ]]; then
    echo "The release does not contain index.html." >&2
    exit 1
fi

chown -R root:root "${release_dir}"
find "${release_dir}" -type d -exec chmod 0755 {} +
find "${release_dir}" -type f -exec chmod 0644 {} +

nginx -t
ln -sfn "${release_dir}" "${current_link}"
systemctl reload nginx

printf 'release=%s\n' "${release_dir}"
printf 'index_sha256='
sha256sum "${release_dir}/index.html" | awk '{print $1}'
