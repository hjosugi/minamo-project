// CI throughput guard for the headless part of Minamo's shipped motion path
// (#264). This deliberately excludes camera inference, WebGL, and network I/O:
// those need real hardware. It catches order-of-magnitude regressions in the
// deterministic work between detector output and viewer controls.

import { decodeFrame, encodeFrame } from '../shared/codec.js';
import {
  FrameOrderGate,
  applyCalibrationProfile,
  createCalibrationProfile,
  sanitizeWeights,
  semanticFaceControls,
  syntheticBlendshapeFrame,
} from '../shared/runtime.js';

const BATCH_FRAMES = 20_000;
const MAX_ROUNDS = 7;
const MIN_FRAMES_PER_SECOND = 10_000;
const SOURCES = Array.from({ length: 256 }, (_, index) => syntheticBlendshapeFrame(index + 1));
const PROFILE = createCalibrationProfile('ci-throughput');

function measureRound(frameCount) {
  const orderGate = new FrameOrderGate();
  const outbound = syntheticBlendshapeFrame(1);
  let sink = 0;
  const startedAt = performance.now();

  for (let index = 0; index < frameCount; index += 1) {
    const source = SOURCES[index & 255];
    const sanitized = sanitizeWeights(source.face.weights);
    const calibrated = applyCalibrationProfile(sanitized.weights, PROFILE);
    outbound.t = index;
    outbound.seq = index;
    outbound.face.weights = calibrated;

    const decoded = decodeFrame(encodeFrame(outbound));
    if (!decoded?.face || !orderGate.accept(decoded, index * (1000 / 60)).ok) {
      throw new Error(`headless motion pipeline rejected synthetic frame ${index}`);
    }
    const controls = semanticFaceControls(decoded.face.weights);
    sink += controls.mouthOpen + controls.blinkLeft + decoded.seq;
  }

  const elapsedMs = performance.now() - startedAt;
  if (!Number.isFinite(sink)) throw new Error('headless motion pipeline produced a non-finite sink');
  return frameCount * 1000 / elapsedMs;
}

if (process.env.NODE_V8_COVERAGE) {
  console.log('SKIP: headless motion pipeline throughput (V8 coverage instrumentation is active)');
  process.exit(0);
}

measureRound(2_000); // Warm the JIT before the measured rounds.
const samples = Array.from({ length: MAX_ROUNDS }, () => measureRound(BATCH_FRAMES));
const best = Math.max(...samples);

console.log(
  `headless motion pipeline: best ${Math.round(best).toLocaleString()} fps `
  + `(floor ${MIN_FRAMES_PER_SECOND.toLocaleString()}, rounds `
  + `${samples.map((sample) => Math.round(sample).toLocaleString()).join(', ')})`,
);

if (best < MIN_FRAMES_PER_SECOND) {
  throw new Error(
    `headless motion pipeline best-of-${MAX_ROUNDS} throughput `
    + `${Math.round(best)} fps is below the ${MIN_FRAMES_PER_SECOND} fps floor`,
  );
}
