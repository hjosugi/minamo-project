#!/usr/bin/env node
// KGM2 wire-cost breakdown (#277).
//
// #277 proposes entropy-coding the quantized deltas and asks whether a neural
// motion tokenizer would do better. Both proposals target the payload. This
// script measures where the bytes actually are, because the answer decides
// whether either proposal is worth building.
//
// Everything here is exact rather than sampled: the KGM2 frame layout is fixed,
// so byte counts are computed from the format and then confirmed against real
// encoder output. No corpus is involved, which matters because the repo has no
// motion corpus to measure entropy against (tests/fixtures/kgm1-synthetic.jsonl
// is a two-line schema fixture, not a recording).
//
// Run: pnpm bench:kgm2
import {
  Kgm2FaceEncoder,
  KGM2_HEADER_BYTES,
  KGM2_FACE_CHANNELS,
  KGM2_FACE_MASK_BYTES,
} from '../shared/kgm2.js';

// Frame layout, from shared/kgm2.js encodeKeyframe/encodeDelta.
const QUAT_BYTES = 4; // packed smallest-three
const KEYFRAME_POS_BYTES = 6; // 3 x int16
const DELTA_POS_BYTES = 3; // 3 x int8
const KEYFRAME_BYTES = KGM2_HEADER_BYTES + QUAT_BYTES + KEYFRAME_POS_BYTES + KGM2_FACE_CHANNELS;
const DELTA_FIXED_BYTES = KGM2_HEADER_BYTES + QUAT_BYTES + DELTA_POS_BYTES + KGM2_FACE_MASK_BYTES;

const KGM1_BYTES_PER_FRAME = 76; // the baseline KGM2 aims to halve (#277)
const KGM2_TARGET_BYTES = KGM1_BYTES_PER_FRAME / 2;

/** Build a face frame whose delta from the keyframe touches exactly `active` channels. */
function makeFrame(seq, active, base) {
  const weights = base.slice();
  for (let i = 0; i < active; i++) weights[i] = Math.min(1, weights[i] + 0.05 * (1 + (i % 3)));
  return {
    t: seq * 16,
    seq,
    face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights },
  };
}

/** Confirm the analytic model against what the encoder actually emits. */
function verifyAgainstEncoder() {
  const failures = [];
  const base = new Array(KGM2_FACE_CHANNELS).fill(0.2);
  for (const active of [0, 1, 7, 26, 52]) {
    // keyframeInterval large enough that only seq 0 is a keyframe.
    const encoder = new Kgm2FaceEncoder({ keyframeInterval: 1000 });
    const keyframe = encoder.encode(makeFrame(0, 0, base));
    if (keyframe.byteLength !== KEYFRAME_BYTES) {
      failures.push(`keyframe is ${keyframe.byteLength} B, model says ${KEYFRAME_BYTES}`);
    }
    const delta = encoder.encode(makeFrame(1, active, base));
    const expected = DELTA_FIXED_BYTES + active;
    if (delta.byteLength !== expected) {
      failures.push(`delta with ${active} active channels is ${delta.byteLength} B, model says ${expected}`);
    }
  }
  return failures;
}

const failures = verifyAgainstEncoder();
if (failures.length) {
  console.error('kgm2-bitrate model disagrees with the encoder:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('# KGM2 wire cost (exact, verified against the encoder)\n');
console.log(`keyframe: ${KEYFRAME_BYTES} B  (header ${KGM2_HEADER_BYTES} + quat ${QUAT_BYTES} + pos ${KEYFRAME_POS_BYTES} + weights ${KGM2_FACE_CHANNELS})`);
console.log(`delta:    ${DELTA_FIXED_BYTES} + N B  (header ${KGM2_HEADER_BYTES} + quat ${QUAT_BYTES} + pos ${DELTA_POS_BYTES} + mask ${KGM2_FACE_MASK_BYTES} + N active channels)\n`);

console.log(`KGM1 baseline ${KGM1_BYTES_PER_FRAME} B/frame; KGM2 target ${KGM2_TARGET_BYTES} B/frame.\n`);

console.log('| active channels N | delta bytes | vs target | entropy-codable part | floor if payload were free |');
console.log('|---|---|---|---|---|');
for (const active of [0, 4, 8, 12, 16, 24, 32, 52]) {
  const total = DELTA_FIXED_BYTES + active;
  const codable = KGM2_FACE_MASK_BYTES + active; // mask + deltas: all an entropy coder can touch
  const floor = total - codable; // header + quat + pos, incompressible in this design
  const vsTarget = total <= KGM2_TARGET_BYTES ? `under by ${(KGM2_TARGET_BYTES - total).toFixed(0)}` : `over by ${(total - KGM2_TARGET_BYTES).toFixed(0)}`;
  console.log(`| ${active} | ${total} | ${vsTarget} | ${codable} B (${((codable / total) * 100).toFixed(0)}%) | ${floor} B |`);
}

console.log('\n## Where the ceiling is\n');
console.log(`An entropy coder can only touch the mask and the delta bytes. The other`);
console.log(`${DELTA_FIXED_BYTES - KGM2_FACE_MASK_BYTES} B — header ${KGM2_HEADER_BYTES}, packed quat ${QUAT_BYTES}, pos deltas ${DELTA_POS_BYTES} — are already`);
console.log(`near-minimal representations, so they survive any payload compression.`);
console.log(`Even a perfect coder that shrank mask+deltas to nothing leaves ${DELTA_FIXED_BYTES - KGM2_FACE_MASK_BYTES} B/frame,`);
console.log(`which is ${(((DELTA_FIXED_BYTES - KGM2_FACE_MASK_BYTES) / KGM2_TARGET_BYTES) * 100).toFixed(0)}% of the ${KGM2_TARGET_BYTES} B target on its own.\n`);

// The header is the part nobody proposed to compress, and it is the largest
// fixed cost. Two of its fields are derivable rather than transmitted.
console.log('## Header redundancy (not addressed by either #277 proposal)\n');
console.log(`header ${KGM2_HEADER_BYTES} B = magic 2 + version 1 + type 1 + t 4 + seq 2 + keyId 2`);
console.log('- keyId is `floor(seq / keyframeInterval)` in the encoder — fully derivable from seq: 2 B');
console.log('- t is ~seq * (1000/fps); a small signed correction would do, not a 32-bit absolute: ~3 B');
console.log('- magic + version repeat on every datagram of an established session: up to 3 B');
console.log(`\nThat is up to 8 B/frame recoverable from the header alone, against`);
console.log(`${KGM2_FACE_MASK_BYTES}+N B addressable by entropy coding the payload.`);

// Cross-check against the other per-frame cost, measured in #274.
const E2EE_OVERHEAD = 24; // 12 B random nonce + 12 B GCM tag, shared/e2ee.js
const typicalN = 12; // the N at which a delta frame exactly meets the target
const plain = DELTA_FIXED_BYTES + typicalN;
console.log('\n## Against E2EE overhead (#274)\n');
console.log(`At N=${typicalN} a delta frame is ${plain} B. E2EE adds ${E2EE_OVERHEAD} B`);
console.log(`(12 nonce + 12 tag), so the wire frame is ${plain + E2EE_OVERHEAD} B — ${((E2EE_OVERHEAD / plain) * 100).toFixed(0)}% overhead.`);
console.log(`Dropping the transmitted nonce (12 B, available only with per-participant`);
console.log(`keys) saves more than entropy-coding the entire ${KGM2_FACE_MASK_BYTES + typicalN} B payload could,`);
console.log('and it costs no coder, no tables and no decode-side CPU.');
