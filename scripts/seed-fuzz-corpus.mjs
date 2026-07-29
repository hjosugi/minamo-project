#!/usr/bin/env node
// Seed the cargo-fuzz corpus for crates/kgm1-codec from the shared conformance
// vectors (#262).
//
// The decoder rejects anything that does not open with "KGM1" and a supported
// version_major, so a fuzzer starting from nothing spends its budget failing at
// byte 0 and the branches this issue cares about — the payload length check, the
// per-field offsets — are never reached. Seeding it with packets that already
// clear the gate is what makes the mutations land somewhere interesting.
//
// The seeds are generated rather than checked in so they cannot drift from
// tests/fixtures/kgm1b-vectors.txt, which is the same reason the Rust, JS and
// Python tests all read that file instead of keeping their own copies (#257).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VECTORS = join(ROOT, 'tests', 'fixtures', 'kgm1b-vectors.txt');
const CORPUS = join(ROOT, 'crates', 'kgm1-codec', 'fuzz', 'corpus', 'decode_packet');

const rows = readFileSync(VECTORS, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split('|'));

if (rows.length === 0) {
  console.error(`${VECTORS}: no conformance vectors to seed from`);
  process.exit(1);
}

// Seed names are derived from the vector, so re-running overwrites the seeds in
// place and leaves anything the fuzzer discovered on earlier runs alone — the
// scheduled job restores its corpus from cache before calling this.
mkdirSync(CORPUS, { recursive: true });

let written = 0;
for (const [kind, name, packetHex] of rows) {
  if (!/^[0-9a-f]*$/.test(packetHex) || packetHex.length % 2 !== 0) {
    console.error(`vector ${name}: packetHex is not an even-length hex string`);
    process.exit(1);
  }
  // Both kinds are useful seeds. The rejects are the near misses — a wrong
  // version, a payload one byte short — which sit a single mutation away from
  // the accepting paths.
  writeFileSync(join(CORPUS, `seed-${kind}-${name}`), Buffer.from(packetHex, 'hex'));
  written += 1;
}

console.log(`seeded ${written} corpus files in ${CORPUS.slice(ROOT.length + 1)}`);
