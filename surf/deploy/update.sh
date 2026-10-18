#!/usr/bin/env bash
# GLIDEZONE – posodobitev SAMO te igre (Fightstorm, Caddy in DuckDNS ostanejo nespremenjeni).
#
# Uporaba (v razpakirani mapi NOVEGA glidezone-server.zip):
#   sudo bash deploy/update.sh
# Podatki igralcev (/var/lib/glidezone) ostanejo. Če nova različica ne odgovori, se samodejno
# vrne prejšnja.
set -euo pipefail
umask 022

GAME=glidezone
PORT=8081
APP_DIR=/opt/${GAME}-server
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[32mOK\033[0m  %s\n' "$*"; }
die() { printf '\n\033[1;31mNAPAKA: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "zaženi s sudo:  sudo bash deploy/update.sh"
[ -f "/etc/systemd/system/${GAME}.service" ] || die "${GAME}.service ne obstaja – najprej zaženi deploy/add-game.sh"
[ "$SRC_DIR" != "$APP_DIR" ] || die "zaženi iz razpakirane mape novega ZIP-a, ne iz $APP_DIR"
for f in server/index.js shared/room.js package.json dist/index.html; do
  [ -f "$SRC_DIR/$f" ] || die "manjka $f – zaženi iz razpakirane mape glidezone-server"
done

say "Pripravljam novo različico"
STAGE="${APP_DIR}.new"
rm -rf "$STAGE"
install -d -m 755 "$STAGE"
cp -a "$SRC_DIR/server" "$SRC_DIR/shared" "$SRC_DIR/dist" "$SRC_DIR/deploy" "$SRC_DIR/package.json" "$STAGE/"
[ -f "$SRC_DIR/package-lock.json" ] && cp -a "$SRC_DIR/package-lock.json" "$STAGE/"
if [ -f "$SRC_DIR/node_modules/ws/package.json" ]; then
  cp -a "$SRC_DIR/node_modules" "$STAGE/"
else
  ( cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund --cache /tmp/${GAME}-npm-cache ) || die "npm ci ni uspel"
  rm -rf /tmp/${GAME}-npm-cache
fi
chown -R root:root "$STAGE"
chmod -R u=rwX,go=rX "$STAGE"
ok "nova koda pripravljena"

say "Zamenjujem in ponovno zaganjam $GAME.service"
rm -rf "${APP_DIR}.prev"
mv "$APP_DIR" "${APP_DIR}.prev"
mv "$STAGE" "$APP_DIR"
systemctl restart "$GAME"

healthy() {
  for i in $(seq 1 20); do
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
if ! healthy; then
  echo "    nova različica ne odgovarja – vračam prejšnjo" >&2
  journalctl -u "$GAME" -n 30 --no-pager >&2 || true
  rm -rf "${APP_DIR}.failed"
  mv "$APP_DIR" "${APP_DIR}.failed"
  mv "${APP_DIR}.prev" "$APP_DIR"
  systemctl restart "$GAME"
  healthy && echo "    prejšnja različica spet teče" >&2
  die "posodobitev ni uspela (neuspela koda je v ${APP_DIR}.failed)"
fi
ok "$GAME odgovarja na 127.0.0.1:$PORT"

systemctl is-active --quiet fightstorm && ok "fightstorm: active" || echo "    fightstorm: $(systemctl is-active fightstorm || true)"
systemctl is-active --quiet "$GAME" && ok "$GAME: active"
printf '\n\033[1;32mSUCCESS\033[0m – GLIDEZONE posodobljen (prejšnja različica: %s.prev)\n' "$APP_DIR"
