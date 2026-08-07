#!/usr/bin/env node
// "Your video never leaves the device" is the product's central claim — it is on
// the site home, the landing page and the tracker — and until now nothing
// asserted it (#264). This checks the two properties that make it true.
//
// 1. No value derived from a raw-frame API (getImageData, toDataURL, toBlob,
//    captureStream, MediaRecorder, a MediaStream) is passed to a network sink.
//    This is the property that actually matters: it is what "no raw webcam
//    upload" means mechanically.
//
// 2. The set of network sinks in first-party shipped code matches a reviewed
//    inventory. A new way to reach the network fails this check until someone
//    writes down what it sends. Defence in depth for the cases a textual scan
//    of (1) would miss.
//
// Vendored third-party code is out of scope: it is not ours to annotate, and it
// is covered by the desktop CSP's connect-src instead.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// First-party code that runs in a page and can reach the network.
const SCAN_DIRS = ['tracker', 'viewer', 'replay', 'desktop', 'landing', 'shared'];
const SCAN_FILES = ['site.js'];
const SKIP_DIR_NAMES = new Set(['vendor', 'node_modules']);

/** Ways to reach the network, as they appear in this codebase. */
const SINKS = [
  { name: 'fetch', re: /(?<![.\w])fetch\s*\(/g },
  { name: 'sendBeacon', re: /sendBeacon\s*\(/g },
  { name: 'XMLHttpRequest', re: /new\s+XMLHttpRequest\s*\(/g },
  { name: 'RTCPeerConnection', re: /new\s+RTCPeerConnection\s*\(/g },
  { name: 'WebSocket', re: /new\s+WebSocket\s*\(/g },
  { name: 'WebTransport', re: /new\s+WebTransport\s*\(/g },
  { name: 'send', re: /\.send\s*\(/g },
  { name: 'writer.write', re: /\b_?wtWriter\s*\.\s*write\s*\(/g },
];

/**
 * Reviewed inventory of every network sink in first-party shipped code.
 * `why` must say what crosses the wire. Adding a sink without adding it here
 * fails the check — deliberately, because that is the moment to think about it.
 */
const REVIEWED_SINKS = {
  'tracker/tracker.js': [
    { name: 'fetch', count: 2, why: 'fetches the pinned MediaPipe bundle and models (and HEAD-probes them); request bodies are empty' },
    { name: 'send', count: 1, why: 'transport.send of an encodeFrame() motion packet — quaternion, position and blendshape weights only' },
  ],
  'viewer/viewer.js': [
    { name: 'fetch', count: 1, why: 'loads an Inochi2D puppet from a URL supplied in the query string; download only' },
  ],
  'desktop/desktop.js': [
    { name: 'fetch', count: 2, why: 'requests and revokes a short-lived pairing token from the relay; bodies carry room id and TTL, no media' },
  ],
  'shared/transport.js': [
    { name: 'WebSocket', count: 1, why: 'opens the relay WebSocket' },
    { name: 'WebTransport', count: 1, why: 'opens the relay WebTransport session' },
    { name: 'send', count: 2, why: 'sends a KGM1-WIRE motion packet as binary, and the same packet base64-encoded on the JSON fallback path' },
    { name: 'writer.write', count: 1, why: 'writes a KGM1-WIRE motion datagram' },
  ],
  'shared/obs-bridge.js': [
    { name: 'WebSocket', count: 1, why: 'opens the local obs-websocket control socket (default ws://127.0.0.1:4455)' },
    { name: 'send', count: 1, why: 'sends obs-websocket Identify and Request frames — scene names, source names and the viewer URL; no media and no tracking frame' },
  ],
  'shared/pairing.js': [],
  'shared/e2ee.js': [],
};

/**
 * Expressions that yield raw camera or canvas pixels. A value derived from any
 * of these must never reach a sink.
 */
const RAW_FRAME_SOURCES = [
  /\.getImageData\s*\(/,
  /\.toDataURL\s*\(/,
  /\.toBlob\s*\(/,
  /\.captureStream\s*\(/,
  /new\s+MediaRecorder\s*\(/,
  /getUserMedia\s*\(/,
  /\.srcObject\b/,
  /createImageBitmap\s*\(/,
  /new\s+VideoFrame\s*\(/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (entry.name.endsWith('.js')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const files = [
  ...SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))),
  ...SCAN_FILES.map((file) => join(ROOT, file)).filter((file) => statSync(file, { throwIfNoEntry: false })),
];

const errors = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');

  // --- Property 1: no raw-frame value flows into a sink -------------------
  // Names bound to a raw-frame expression, e.g. `const data = ctx.getImageData(...)`.
  const tainted = new Set();
  for (const line of lines) {
    const binding = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (binding && RAW_FRAME_SOURCES.some((re) => re.test(binding[2]))) tainted.add(binding[1]);
    const assign = line.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (assign && RAW_FRAME_SOURCES.some((re) => re.test(assign[2]))) tainted.add(assign[1]);
  }

  lines.forEach((line, index) => {
    for (const sink of SINKS) {
      sink.re.lastIndex = 0;
      if (!sink.re.test(line)) continue;
      // A raw-frame call used directly as an argument.
      if (RAW_FRAME_SOURCES.some((re) => re.test(line))) {
        errors.push(`${rel}:${index + 1}: a raw-frame expression is used at a ${sink.name} call — `
          + `camera or canvas pixels must never reach the network\n    ${line.trim()}`);
      }
      // A variable previously bound to raw-frame data.
      for (const name of tainted) {
        if (new RegExp(`(?<![.\\w])${name}(?![\\w])`).test(line.replace(/^.*?\.send\s*\(/, ''))
          && new RegExp(`(?<![.\\w])${name}(?![\\w])`).test(line)) {
          errors.push(`${rel}:${index + 1}: '${name}' holds raw-frame data and reaches a ${sink.name} call\n    ${line.trim()}`);
        }
      }
    }
  });

  // --- Property 2: the sink inventory is reviewed -------------------------
  const found = new Map();
  for (const sink of SINKS) {
    sink.re.lastIndex = 0;
    const count = (source.match(sink.re) ?? []).length;
    if (count) found.set(sink.name, count);
  }
  if (found.size === 0) continue;

  const reviewed = REVIEWED_SINKS[rel];
  if (!reviewed) {
    const summary = [...found].map(([name, count]) => `${name} x${count}`).join(', ');
    errors.push(`${rel}: reaches the network (${summary}) but is not in the reviewed inventory in `
      + `scripts/check-privacy-invariants.mjs — add it with a note on what it sends`);
    continue;
  }
  const expected = new Map(reviewed.map((entry) => [entry.name, entry.count]));
  for (const [name, count] of found) {
    const want = expected.get(name);
    if (want === undefined) {
      errors.push(`${rel}: new ${name} network sink is not in the reviewed inventory — `
        + `add it with a note on what it sends`);
    } else if (want !== count) {
      errors.push(`${rel}: ${name} sink count changed (${want} reviewed, ${count} found) — `
        + `re-review what crosses the wire, then update the inventory`);
    }
  }
  for (const [name, want] of expected) {
    if (!found.has(name)) {
      errors.push(`${rel}: the inventory lists ${want} ${name} sink(s) that no longer exist — remove the stale entry`);
    }
  }
}

if (errors.length) {
  console.error('Privacy invariant check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const sinkTotal = Object.values(REVIEWED_SINKS)
  .flat()
  .reduce((sum, entry) => sum + entry.count, 0);
console.log(`OK: no raw-frame value reaches the network; ${sinkTotal} reviewed network sinks across `
  + `${Object.keys(REVIEWED_SINKS).filter((key) => REVIEWED_SINKS[key].length).length} files.`);
