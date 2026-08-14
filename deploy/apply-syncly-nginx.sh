#!/usr/bin/env bash
set -Eeuo pipefail

deploy_user="${DEPLOY_USER:-coolspectre}"
upload_dir="/home/${deploy_user}/lyricweb-deploy"
nginx_source="${upload_dir}/syncly.lyricweb.ru.conf"
ensure_https_script="${upload_dir}/ensure-syncly-https.sh"
nginx_available="/etc/nginx/sites-available/syncly.lyricweb.ru.conf"
nginx_enabled="/etc/nginx/sites-enabled/syncly.lyricweb.ru.conf"
backup_file=""
had_previous_config=false

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

for required_file in "${nginx_source}" "${ensure_https_script}"; do
    if [[ ! -f "${required_file}" ]]; then
        echo "Missing deployment file: ${required_file}" >&2
        exit 1
    fi
done

backup_file="$(mktemp /tmp/syncly-nginx.XXXXXX)"

if [[ -f "${nginx_available}" ]]; then
    cp --preserve=mode,ownership,timestamps "${nginx_available}" "${backup_file}"
    had_previous_config=true
fi

rollback_on_error() {
    status=$?
    trap - EXIT

    if [[ "${status}" -ne 0 ]]; then
        echo "Nginx update failed; restoring the previous configuration." >&2
        if [[ "${had_previous_config}" == true ]]; then
            install -m 0644 "${backup_file}" "${nginx_available}"
        else
            rm -f "${nginx_available}" "${nginx_enabled}"
        fi

        if nginx -t; then
            systemctl reload nginx
        else
            echo "Restored Nginx configuration did not validate." >&2
        fi
    fi

    rm -f "${backup_file}"
    exit "${status}"
}
trap rollback_on_error EXIT

install -m 0644 "${nginx_source}" "${nginx_available}"
ln -sfn "${nginx_available}" "${nginx_enabled}"
nginx -t

# The tracked configuration is an HTTP bootstrap template. Certbot's `run`
# command with --keep-until-expiring reinstalls the existing certificate into
# that template without renewing it early, then reloads Nginx.
bash "${ensure_https_script}"
nginx -t
systemctl reload nginx

trap - EXIT
rm -f "${backup_file}"
echo "Syncly Nginx configuration updated successfully."
