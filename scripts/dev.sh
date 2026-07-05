#!/usr/bin/env sh
# Quick start without Node: serve the repo as a static site.
# local mode (BroadcastChannel) works with this alone.
cd "$(dirname "$0")/.."
echo "Minamo static dev server -> http://localhost:8000/"
python3 -m http.server 8000
