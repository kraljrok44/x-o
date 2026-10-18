#!/usr/bin/env bash
# Builds the release ZIPs into release/:
#   glidezone-crazygames.zip – the HTML5 client for CrazyGames (one build for Basic and Full launch)
#   glidezone-server.zip     – Node server + deploy scripts
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf release/stage release/*.zip && mkdir -p release/stage/glidezone-server
node tools/build.mjs
(cd dist && zip -qr ../release/glidezone-crazygames.zip .)
S=release/stage/glidezone-server
cp -a server shared dist deploy package.json package-lock.json "$S/"
(cd "$S" && npm ci --omit=dev --no-audit --no-fund --ignore-scripts >/dev/null && find node_modules -type d -empty -delete)
(cd release/stage && zip -qr ../glidezone-server.zip glidezone-server)
rm -rf release/stage
ls -l release
