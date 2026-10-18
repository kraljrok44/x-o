#!/usr/bin/env bash
# Builds both release ZIPs into release/:
#   glidezone-crazygames.zip – the HTML5 client to upload to CrazyGames (index.html at the root)
#   glidezone-server.zip     – the Node server + deploy scripts for the Linux (ARM) server
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf release && mkdir -p release/stage/glidezone-server
(cd dist && zip -qr ../release/glidezone-crazygames.zip .)
S=release/stage/glidezone-server
cp -a server shared dist deploy package.json package-lock.json "$S/"
(cd "$S" && npm ci --omit=dev --no-audit --no-fund --ignore-scripts >/dev/null && find node_modules -type d -empty -delete)
(cd release/stage && zip -qr ../glidezone-server.zip glidezone-server)
rm -rf release/stage
ls -l release
