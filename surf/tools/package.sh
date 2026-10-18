#!/usr/bin/env bash
# Builds the release ZIPs into release/:
#   glidezone-crazygames-basic.zip – CrazyGames "Basic" launch: no ads, crates open for free
#   glidezone-crazygames-full.zip  – CrazyGames "Full" launch: rewarded ad per crate + midgame ads
#   glidezone-server.zip           – Node server + deploy scripts (serves the basic client itself)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf release && mkdir -p release/stage/glidezone-server
node tools/build.mjs --ads --out release/stage/full
(cd release/stage/full && zip -qr ../../glidezone-crazygames-full.zip .)
node tools/build.mjs
(cd dist && zip -qr ../release/glidezone-crazygames-basic.zip .)
S=release/stage/glidezone-server
cp -a server shared dist deploy package.json package-lock.json "$S/"
(cd "$S" && npm ci --omit=dev --no-audit --no-fund --ignore-scripts >/dev/null && find node_modules -type d -empty -delete)
(cd release/stage && zip -qr ../glidezone-server.zip glidezone-server)
rm -rf release/stage
ls -l release
