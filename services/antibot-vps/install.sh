#!/usr/bin/env bash
# ALP Antibot Guard — VPS installer
# Usage: bash install.sh <slug> <docroot> [port]
#   slug     — website slug (e.g. "investec")
#   docroot  — real site path (e.g. /var/www/investec)
#   port     — antibot listen port (default 3001)
#
# Idempotent: safe to re-run to update.

set -euo pipefail

SLUG="${1:?slug required}"
DOCROOT="${2:?docroot required}"
PORT="${3:-3001}"

INSTALL_DIR="/opt/alp-antibot/${SLUG}"
SERVICE_NAME="alp-antibot-${SLUG}"
SECRET_FILE="${INSTALL_DIR}/.secret"

echo "[install] slug=${SLUG} docroot=${DOCROOT} port=${PORT}"

# Node.js required
if ! command -v node >/dev/null 2>&1; then
  echo "[install] Node.js missing — installing v22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
fi

mkdir -p "${INSTALL_DIR}/data"

# Generate a random HMAC secret (persistent across restarts)
if [ ! -f "${SECRET_FILE}" ]; then
  head -c 32 /dev/urandom | base64 -w 0 > "${SECRET_FILE}"
  chmod 600 "${SECRET_FILE}"
fi
SECRET="$(cat "${SECRET_FILE}")"

# Copy runtime files (guard.js + data/*)
cp guard.js "${INSTALL_DIR}/guard.js"
cp data/cloak.html "${INSTALL_DIR}/data/cloak.html"
cp data/datacenter-cidrs.txt "${INSTALL_DIR}/data/datacenter-cidrs.txt"

# systemd unit — auto-restart, isolated per slug
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << UNIT
[Unit]
Description=ALP Antibot Guard (${SLUG})
After=network.target

[Service]
Type=simple
Environment=ALP_SLUG=${SLUG}
Environment=ALP_DOCROOT=${DOCROOT}
Environment=ALP_PORT=${PORT}
Environment=ALP_SECRET=${SECRET}
ExecStart=/usr/bin/node ${INSTALL_DIR}/guard.js
Restart=always
RestartSec=3
User=root
StandardOutput=append:/var/log/${SERVICE_NAME}.log
StandardError=append:/var/log/${SERVICE_NAME}.err.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
systemctl restart "${SERVICE_NAME}"

sleep 1
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "[install] ✓ ${SERVICE_NAME} running on 127.0.0.1:${PORT}"
else
  echo "[install] ✗ service failed to start — check journalctl -u ${SERVICE_NAME}"
  exit 1
fi
