import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_MEDIAPIPE_TELEMETRY_MARKERS,
  findForbiddenMediaPipeTelemetry,
} from '../scripts/mediapipe-privacy-guard.mjs';

describe('MediaPipe dependency privacy guard', () => {
  it('detects every blocked ODML endpoint/sender marker independently', () => {
    for (const expected of FORBIDDEN_MEDIAPIPE_TELEMETRY_MARKERS) {
      const findings = findForbiddenMediaPipeTelemetry([
        { file: 'vision_bundle.mjs', source: `prefix ${expected.needle} suffix` },
      ]);
      expect(findings).toEqual([
        {
          file: 'vision_bundle.mjs',
          marker: expected.id,
          needle: expected.needle,
        },
      ]);
    }
  });

  it('reports the bundle that contains a telemetry sender', () => {
    const findings = findForbiddenMediaPipeTelemetry([
      { file: 'vision_bundle.mjs', source: 'clean local model fetch' },
      {
        file: 'vision_bundle.cjs',
        source: 'fetch("https://odml.pa.googleapis.com/v1/log")',
      },
    ]);
    expect(findings).toEqual([
      {
        file: 'vision_bundle.cjs',
        marker: 'odml-metrics-endpoint',
        needle: 'odml.pa.googleapis.com/v1/log',
      },
    ]);
  });

  it('allows ordinary local/CDN asset loading without telemetry', () => {
    const findings = findForbiddenMediaPipeTelemetry([
      {
        file: 'vision_bundle.mjs',
        source: 'fetch(modelAssetPath); fetch(wasmBinaryPath); console.error(message);',
      },
    ]);
    expect(findings).toEqual([]);
  });
});
