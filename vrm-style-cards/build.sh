#!/bin/sh
# Builds dist/vrm-style-cards.js from the files in src/ (plain concatenation, no tools needed)
set -e
cd "$(dirname "$0")"
cat src/*.js > dist/vrm-style-cards.js
node --check dist/vrm-style-cards.js 2>/dev/null || true
echo "dist/vrm-style-cards.js: $(wc -c < dist/vrm-style-cards.js) bytes"
