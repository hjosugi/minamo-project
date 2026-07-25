// Micro-benchmark demonstrating the per-frame allocation reduction from #259:
// replacing whole-object structuredClone deep copies in the hot guards with
// targeted shallow copies. Run with:
//   node --expose-gc --import tsx scripts/bench-frame-allocs.ts
// (pnpm bench:allocs). Reports throughput (ops/sec) and, when --expose-gc is
// available, retained heap per 10k ops, for the old vs new copy strategy.
import { clampFingerState } from '../src/core/anatomy';
import { finiteFrameGuard } from '../src/core/stability';
import { createEmptyFrame } from '../src/core/kgm1';
import { defaultEye, defaultMouth } from '../src/core/face';
import { createSyntheticHandLandmarks, solveHandState } from '../src/core/hand';
import type { FingerState, KGM1Frame } from '../src/core/types';

const ITERATIONS = 200_000;

function buildFrame(): KGM1Frame {
  const frame = createEmptyFrame(1, 0);
  frame.tracking.face = {
    detected: true,
    confidence: 1,
    headRotation: { x: 0, y: 0, z: 0, w: 1 },
    leftEye: defaultEye(),
    rightEye: defaultEye(),
    mouth: defaultMouth(),
    blendshapes: Object.fromEntries(Array.from({ length: 52 }, (_, i) => [`bs${i}`, (i % 10) / 10])),
    warnings: [],
  };
  frame.tracking.hands = [solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0.3, 'Right') })];
  frame.quality.warnings = ['QUALITY_OK'];
  return frame;
}

// Faithful pre-#259 implementations: identical logic, whole-object deep clone.
function finiteFrameGuardOld(frame: KGM1Frame): KGM1Frame {
  const next = structuredClone(frame);
  const face = next.tracking.face;
  if (face) {
    for (const name of Object.keys(face.blendshapes)) {
      face.blendshapes[name] = Math.min(1, Math.max(0, face.blendshapes[name]));
    }
  }
  next.quality.warnings = [...new Set(next.quality.warnings)];
  return next;
}

function clampFingerStateOld(finger: FingerState): FingerState {
  const next = structuredClone(finger);
  next.curl = Math.min(1, Math.max(0, next.curl));
  return next;
}

function bench(label: string, fn: () => unknown): { label: string; opsPerSec: number; heapPerOp: number } {
  fn();
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  let sink = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const result = fn();
    sink ^= result === undefined ? 0 : 1;
  }
  const elapsedMs = performance.now() - start;
  const heapAfter = process.memoryUsage().heapUsed;
  if (sink === -1) throw new Error('unreachable');
  return {
    label,
    opsPerSec: (ITERATIONS / elapsedMs) * 1000,
    heapPerOp: (heapAfter - heapBefore) / ITERATIONS,
  };
}

const frame = buildFrame();
const finger = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0.3, 'Right') }).fingers.index;

const results = [
  bench('finiteFrameGuard  old (structuredClone)', () => finiteFrameGuardOld(frame)),
  bench('finiteFrameGuard  new (shallow copy)   ', () => finiteFrameGuard(frame)),
  bench('clampFingerState  old (structuredClone)', () => clampFingerStateOld(finger)),
  bench('clampFingerState  new (shallow copy)   ', () => clampFingerState(finger)),
];

console.log(`# frame/finger guard allocation benchmark (${ITERATIONS.toLocaleString()} ops each)\n`);
for (const r of results) {
  console.log(`${r.label}  ${Math.round(r.opsPerSec).toLocaleString().padStart(12)} ops/s   ${(r.heapPerOp).toFixed(1).padStart(8)} B/op retained`);
}

const [frameOld, frameNew, fingerOld, fingerNew] = results;
const frameSpeedup = frameNew.opsPerSec / frameOld.opsPerSec;
const fingerSpeedup = fingerNew.opsPerSec / fingerOld.opsPerSec;
console.log(`\nspeedup: finiteFrameGuard ${frameSpeedup.toFixed(1)}x, clampFingerState ${fingerSpeedup.toFixed(1)}x`);
if ((globalThis as { gc?: () => void }).gc === undefined) {
  console.log('(run with `node --expose-gc` for retained-heap figures)');
}
