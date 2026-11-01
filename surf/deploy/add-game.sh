#!/usr/bin/env bash
# GLIDEZONE – namestitev strežnika igre na OBSTOJEČI strežnik (poleg Fightstorm).
#
# Uporaba (v razpakirani mapi glidezone-server):
#   sudo bash deploy/add-game.sh <duckdns-poddomena> <duckdns-token>
#   npr.  sudo bash deploy/add-game.sh glidezone-rok <token>
#
# Skripta:
#   * NE spreminja fightstorm.service, /opt/fightstorm-server, /etc/fightstorm, obstoječega
#     cron/conf za Fightstorm ali obstoječega bloka v Caddyfile;
#   * NE namešča Node.js/Caddy (samo preveri, da obstajata) in NE nadgrajuje sistema;
#   * NE odpira novih vrat – igra posluša samo na 127.0.0.1:8081, ven gre prek Caddy (443);
#   * tokena nikoli ne izpiše (shrani ga v /etc/glidezone/duckdns.conf, chmod 600).
set -euo pipefail
umask 022

GAME=glidezone
PORT=8081
APP_DIR=/opt/${GAME}-server
DATA_DIR=/var/lib/${GAME}
CONF_DIR=/etc/${GAME}
DUCK_CONF=${CONF_DIR}/duckdns.conf
CRON_FILE=/etc/cron.d/${GAME}-duckdns
UNIT=/etc/systemd/system/${GAME}.service
CADDYFILE=/etc/caddy/Caddyfile
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m  %s\n' "$*"; }
die()  { printf '\n\033[1;31mNAPAKA: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- argumenti / preverjanja
[ "$(id -u)" -eq 0 ] || die "zaženi s sudo:  sudo bash deploy/add-game.sh <poddomena> <token>"
[ $# -eq 2 ] || die "uporaba:  sudo bash deploy/add-game.sh <duckdns-poddomena> <duckdns-token>"

SUB=${1,,}
SUB=${SUB%.duckdns.org}
SUB=${SUB#https://}
TOKEN=$2
[[ "$SUB" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || die "neveljavna poddomena '$SUB' (dovoljeno: a-z, 0-9, -)"
[[ "$TOKEN" =~ ^[A-Za-z0-9-]{20,64}$ ]] || die "token nima pričakovane oblike (preveri, da si ga pravilno prilepil)"
[ "$SUB" != "fightstorm-rok" ] || die "to je poddomena Fightstorma – za igro uporabi NOVO poddomeno"
DOMAIN="${SUB}.duckdns.org"

say "Preverjam sistem"
for f in server/index.js shared/room.js package.json dist/index.html; do
  [ -f "$SRC_DIR/$f" ] || die "manjka $f – zaženi skripto iz razpakirane mape glidezone-server"
done
command -v node >/dev/null || die "Node.js ni nameščen (pričakovan Node 20 iz NodeSource) – skripta ga namenoma ne namešča"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js $(node -v) je prestar (potreben vsaj 18)"
ok "Node.js $(node -v) ($(uname -m))"
command -v caddy >/dev/null || die "Caddy ni nameščen – skripta ga namenoma ne namešča"
[ -f "$CADDYFILE" ] || die "$CADDYFILE ne obstaja"
ok "Caddy $(caddy version | awk '{print $1}')"
command -v curl >/dev/null || die "curl ni nameščen"
if systemctl is-active --quiet fightstorm; then ok "fightstorm.service je aktiven (ga ne spreminjam)"; else
  printf '    \033[33mOPOZORILO\033[0m fightstorm.service trenutno ni aktiven – skripta ga ne spreminja.\n'; fi
# vrata 8081 ne sme zasedati kaj drugega (razen naše igre ob ponovnem zagonu skripte)
if ss -ltnH "sport = :$PORT" | grep -q . && ! systemctl is-active --quiet "$GAME"; then
  die "vrata $PORT že uporablja drug program:  sudo ss -ltnp 'sport = :$PORT'"
fi
ok "vrata 127.0.0.1:$PORT so prosta za igro"

# ---------------------------------------------------------------- DuckDNS (lasten conf + cron)
say "DuckDNS: posodabljam $DOMAIN"
install -d -m 700 -o root -g root "$CONF_DIR"
( umask 077
  printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\nsilent\nshow-error\nmax-time = 20\n' "$SUB" "$TOKEN" > "$DUCK_CONF.tmp"
  mv "$DUCK_CONF.tmp" "$DUCK_CONF" )
chmod 600 "$DUCK_CONF"
unset TOKEN
DUCK_RESULT=$(curl -K "$DUCK_CONF" 2>/dev/null || true)
if [ "$DUCK_RESULT" != "OK" ]; then
  rm -f "$DUCK_CONF"
  die "DuckDNS ni sprejel posodobitve (odgovor: '${DUCK_RESULT:-ni odgovora}'). Preveri, da si poddomeno '$SUB' dodal na duckdns.org in da je token pravilen."
fi
ok "DuckDNS odgovoril OK (token shranjen v $DUCK_CONF, chmod 600)"
cat > "$CRON_FILE" <<EOF
# GLIDEZONE – osvežitev DuckDNS za $DOMAIN (token je v $DUCK_CONF)
SHELL=/bin/sh
PATH=/usr/sbin:/usr/bin:/sbin:/bin
2-59/5 * * * * root curl -K $DUCK_CONF >/dev/null 2>&1
EOF
chmod 644 "$CRON_FILE"
ok "cron: $CRON_FILE (vsakih 5 minut)"

# ---------------------------------------------------------------- uporabnik + koda
say "Nameščam igro v $APP_DIR"
if ! id -u "$GAME" >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$GAME"
  ok "ustvarjen sistemski uporabnik '$GAME'"
else ok "uporabnik '$GAME' že obstaja"; fi
install -d -m 750 -o "$GAME" -g "$GAME" "$DATA_DIR"

STAGE="${APP_DIR}.new"
rm -rf "$STAGE"
install -d -m 755 "$STAGE"
cp -a "$SRC_DIR/server" "$SRC_DIR/shared" "$SRC_DIR/dist" "$SRC_DIR/deploy" "$SRC_DIR/package.json" "$STAGE/"
[ -f "$SRC_DIR/package-lock.json" ] && cp -a "$SRC_DIR/package-lock.json" "$STAGE/"
if [ -f "$SRC_DIR/node_modules/ws/package.json" ]; then
  cp -a "$SRC_DIR/node_modules" "$STAGE/"
  ok "odvisnosti so priložene v ZIP (ws, čisti JavaScript – deluje na ARM)"
else
  command -v npm >/dev/null || die "npm ni na voljo in node_modules ni v ZIP-u"
  ( cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund --cache /tmp/${GAME}-npm-cache ) || die "npm ci ni uspel"
  rm -rf /tmp/${GAME}-npm-cache
  ok "odvisnosti nameščene z npm ci --omit=dev"
fi
chown -R root:root "$STAGE"
chmod -R u=rwX,go=rX "$STAGE"
if [ -d "$APP_DIR" ]; then rm -rf "${APP_DIR}.prev"; mv "$APP_DIR" "${APP_DIR}.prev"; fi
mv "$STAGE" "$APP_DIR"
ok "koda v $APP_DIR (podatki igralcev v $DATA_DIR)"

# ---------------------------------------------------------------- systemd
say "Systemd storitev $GAME.service"
cat > "$UNIT" <<EOF
[Unit]
Description=GLIDEZONE multiplayer surf server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$GAME
Group=$GAME
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOST=127.0.0.1
Environment=DATA_DIR=$DATA_DIR
# Neobvezno: omeji WebSocket povezave na določene domene (vejica med njimi)
#Environment=ALLOWED_ORIGINS=crazygames.com
ExecStart=$(command -v node) $APP_DIR/server/index.js
Restart=always
RestartSec=3
# varnost in zaščita Fightstorma pred porabo virov
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
MemoryMax=1500M

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$GAME" >/dev/null 2>&1
systemctl restart "$GAME"
for i in $(seq 1 20); do
  curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 \
  || die "igra se ne odziva na 127.0.0.1:$PORT – poglej:  sudo journalctl -u $GAME -n 50 --no-pager"
ok "$GAME.service teče in odgovarja na http://127.0.0.1:$PORT/health"

# ---------------------------------------------------------------- Caddy (samo DODAJ blok)
say "Caddy: dodajam $DOMAIN"
DOMAIN_RE=${DOMAIN//./\\.}
if grep -Eq "^[[:space:]]*(https?://)?${DOMAIN_RE}(:[0-9]+)?[[:space:]]*(,[^{]*)?\{" "$CADDYFILE"; then
  ok "blok za $DOMAIN v Caddyfile že obstaja – Caddyfile ne spreminjam"
else
  BACKUP="${CADDYFILE}.bak-${GAME}-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CADDYFILE" "$BACKUP"
  ok "varnostna kopija: $BACKUP"
  restore() { cp -a "$BACKUP" "$CADDYFILE"; printf '    obnovljen izvirni Caddyfile iz %s\n' "$BACKUP" >&2; }
  printf '\n%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DOMAIN" "$PORT" >> "$CADDYFILE"
  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/tmp/${GAME}-caddy-validate.log 2>&1; then
    cat /tmp/${GAME}-caddy-validate.log >&2
    restore
    die "caddy validate ni uspel – Caddyfile je obnovljen, Caddy ni bil ponovno naložen"
  fi
  ok "caddy validate: konfiguracija je veljavna"
  if ! systemctl reload caddy; then
    restore
    systemctl reload caddy || true
    die "systemctl reload caddy ni uspel – Caddyfile je obnovljen"
  fi
  ok "Caddy ponovno naložen (Fightstorm blok nespremenjen)"
fi

# ---------------------------------------------------------------- končno preverjanje
say "Preverjam obe igri"
FAIL=0
if systemctl is-active --quiet fightstorm; then ok "fightstorm: active"; else echo "    fightstorm: $(systemctl is-active fightstorm || true)"; FAIL=1; fi
if systemctl is-active --quiet "$GAME"; then ok "$GAME: active"; else echo "    $GAME: $(systemctl is-active "$GAME" || true)"; FAIL=1; fi

printf '    čakam na DNS in HTTPS certifikat za %s (do 3 minute) ' "$DOMAIN"
HTTPS_OK=0
for i in $(seq 1 36); do
  if curl -fsS --max-time 8 "https://$DOMAIN/health" >/dev/null 2>&1; then HTTPS_OK=1; break; fi
  printf '.'; sleep 5
done
echo
if [ $HTTPS_OK -eq 1 ]; then ok "https://$DOMAIN/health odgovarja"; else
  echo "    https://$DOMAIN še ne odgovarja. DNS ali certifikat morda še nista pripravljena –"
  echo "    počakaj nekaj minut in preveri:  curl https://$DOMAIN/health"
  echo "    dnevnik Caddy:  sudo journalctl -u caddy -n 50 --no-pager"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  printf '\n\033[1;32mSUCCESS\033[0m – GLIDEZONE teče na https://%s (Fightstorm deluje naprej).\n' "$DOMAIN"
else
  printf '\n\033[1;33mNamestitev je končana, a zgornja preverjanja niso vsa uspela.\033[0m\n'
fi
cat <<EOF

Nastavitev klienta (client/index.html):
    window.GLIDEZONE_SERVER = 'wss://$DOMAIN/ws';

Uporabni ukazi:
    sudo systemctl status $GAME
    sudo journalctl -u $GAME -f
    sudo systemctl restart $GAME
EOF
exit $FAIL
