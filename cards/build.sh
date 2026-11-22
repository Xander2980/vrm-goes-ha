#!/bin/sh
# Builds the card bundle from cards/src/ (plain concatenation, no tools needed).
# The integration serves it to the browser, so it lives inside custom_components.
set -e
cd "$(dirname "$0")"
OUT=../custom_components/vrm_forecast/frontend/vrm-style-cards.js
cat src/*.js > "$OUT"
node --check "$OUT" 2>/dev/null || true
echo "$OUT: $(wc -c < "$OUT") bytes"
