// Deterministic command adapter used to exercise the #234 runner end-to-end.
// It is not a tracking-quality fixture; real drum accuracy remains in #235.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const clipIndex = args.indexOf('--clip');
const output = outputIndex >= 0 ? args[outputIndex + 1] : '';
const clip = clipIndex >= 0 ? args[clipIndex + 1] : '';

if (!output || clip !== 'runner-validation') {
  console.error('usage: drum-benchmark-detector --output <events.json> --clip runner-validation');
  process.exit(2);
}

const event = (eventId, timeMs, hand) => ({
  eventId,
  timeNs: timeMs * 1_000_000,
  hand,
  stickId: `stick-${hand.toLowerCase()}`,
  zoneId: 'snare',
  zoneType: 'snare',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 1, z: 0 },
  speed: 1,
  confidence: 0.95,
  audioAligned: true,
});

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({
  schema: 'minamo.drum-detected-events.v1',
  events: [
    event('right:snare:502', 502, 'Right'),
    event('left:snare:1003', 1003, 'Left'),
    event('right:snare:1498', 1498, 'Right'),
  ],
}, null, 2)}\n`);
