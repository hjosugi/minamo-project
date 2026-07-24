#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="0.10.35"
VENDOR="$ROOT/vendor/mediapipe"
WASM_DIR="$VENDOR/tasks-vision@$VERSION/wasm"
MODEL_DIR="$VENDOR/models"
PINS="$ROOT/scripts/model-pins.sha256"
TASKS_BUNDLE="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$VERSION/vision_bundle.mjs"
WASM_BASE="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$VERSION/wasm"
FACE_MODEL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
HAND_MODEL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

# By default the script VERIFIES every download against the committed pinned
# hashes in scripts/model-pins.sha256 (#260). Pass --update-pins to instead
# regenerate that file after a deliberate version bump; review the diff before
# committing.
UPDATE_PINS=0
if [ "${1:-}" = "--update-pins" ]; then
  UPDATE_PINS=1
elif [ -n "${1:-}" ]; then
  echo "Usage: $0 [--update-pins]" >&2
  exit 2
fi

mkdir -p "$WASM_DIR" "$MODEL_DIR"

download() {
  local url="$1"
  local out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 2 "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$out" "$url"
  else
    echo "curl or wget is required" >&2
    exit 1
  fi
}

download "$TASKS_BUNDLE" "$VENDOR/tasks-vision@$VERSION/vision_bundle.mjs"

for file in \
  vision_wasm_internal.js \
  vision_wasm_internal.wasm \
  vision_wasm_nosimd_internal.js \
  vision_wasm_nosimd_internal.wasm
do
  download "$WASM_BASE/$file" "$WASM_DIR/$file"
done

download "$FACE_MODEL" "$MODEL_DIR/face_landmarker.task"
download "$POSE_MODEL" "$MODEL_DIR/pose_landmarker_lite.task"
download "$HAND_MODEL" "$MODEL_DIR/hand_landmarker.task"

# The vendor-relative paths that make up a complete pinned asset set.
PINNED_PATHS=(
  "tasks-vision@$VERSION/vision_bundle.mjs"
  "tasks-vision@$VERSION/wasm/vision_wasm_internal.js"
  "tasks-vision@$VERSION/wasm/vision_wasm_internal.wasm"
  "tasks-vision@$VERSION/wasm/vision_wasm_nosimd_internal.js"
  "tasks-vision@$VERSION/wasm/vision_wasm_nosimd_internal.wasm"
  "models/face_landmarker.task"
  "models/pose_landmarker_lite.task"
  "models/hand_landmarker.task"
)

if [ "$UPDATE_PINS" -eq 1 ]; then
  {
    echo "# Pinned known-good SHA-256 hashes for vendored MediaPipe assets (#260)."
    echo "# Paths are relative to vendor/mediapipe/. fetch-models.sh verifies every"
    echo "# download against these; a mismatch fails the fetch (supply-chain guard)."
    echo "# Regenerate for a new version with:"
    echo "#   scripts/fetch-models.sh --update-pins"
    echo "# then review the diff before committing."
    ( cd "$VENDOR" && sha256sum "${PINNED_PATHS[@]}" )
  } > "$PINS"
  echo "Wrote pinned hashes to $PINS. Review the diff before committing."
else
  if [ ! -f "$PINS" ]; then
    echo "Missing $PINS. Run '$0 --update-pins' once, review the hashes, then commit them." >&2
    exit 1
  fi
  echo "Verifying downloads against pinned hashes in $PINS ..."
  ( cd "$VENDOR" && sha256sum -c "$PINS" )
  echo "All downloads match the pinned SHA-256 hashes."
fi

(
  cd "$VENDOR"
  find . -type f ! -name SHA256SUMS ! -name manifest.json -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

node --input-type=module - "$VENDOR" "$VERSION" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const vendor = process.argv[2];
const version = process.argv[3];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!['SHA256SUMS', 'manifest.json'].includes(entry.name)) files.push(full);
  }
}

walk(vendor);
const manifest = {
  schema: 'minamo.mediapipe-vendor.v1',
  tasksVisionVersion: version,
  generatedAt: new Date().toISOString(),
  files: files.sort().map((file) => {
    const data = fs.readFileSync(file);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const sri = `sha256-${createHash('sha256').update(data).digest('base64')}`;
    return {
      path: path.relative(vendor, file),
      bytes: data.byteLength,
      sha256,
      integrity: sri,
    };
  }),
};
fs.writeFileSync(path.join(vendor, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
NODE

echo "Vendored MediaPipe Tasks Vision $VERSION into $VENDOR"
echo "SHA256SUMS and manifest.json were written for integrity review."
