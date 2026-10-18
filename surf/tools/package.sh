#!/usr/bin/env bash
# Builds the release ZIPs into release/:
#   glidezone-crazygames.zip – the HTML5 client for CrazyGames: one self-contained index.html
#                              (one build for Basic and Full launch)
#   glidezone-server.zip     – Node server + deploy scripts
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf release/stage release/*.zip && mkdir -p release/stage/glidezone-server
node tools/build.mjs --single --out release/stage/single
(cd release/stage/single && zip -q ../../glidezone-crazygames.zip index.html)
node tools/build.mjs
S=release/stage/glidezone-server
cp -a server shared dist deploy package.json package-lock.json "$S/"
(cd "$S" && npm ci --omit=dev --no-audit --no-fund --ignore-scripts >/dev/null && find node_modules -type d -empty -delete)
(cd release/stage && zip -qr ../glidezone-server.zip glidezone-server)
rm -rf release/stage
ls -l release
