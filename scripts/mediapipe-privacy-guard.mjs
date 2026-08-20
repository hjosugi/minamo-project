// MediaPipe 1.0 introduced an automatic ODML metrics sender in the published
// browser bundles. Minamo's local-only mode must not silently gain third-party
// egress through a dependency update, so these markers are deliberately strict.
export const FORBIDDEN_MEDIAPIPE_TELEMETRY_MARKERS = Object.freeze([
  Object.freeze({
    id: 'odml-metrics-endpoint',
    needle: 'odml.pa.googleapis.com/v1/log',
  }),
  Object.freeze({
    id: 'odml-api-key-header',
    needle: 'x-goog-api-key',
  }),
  Object.freeze({
    id: 'mediapipe-logger-api-key-bridge',
    needle: '_mediapipeLoggerGetEncodedApiKey',
  }),
  Object.freeze({
    id: 'mediapipe-network-logging-sender',
    needle: 'Logging failed with HTTP error',
  }),
]);

/**
 * Finds known MediaPipe telemetry endpoint/sender markers in browser bundles.
 *
 * @param {Iterable<{ file: string, source: string }>} bundles
 * @returns {Array<{ file: string, marker: string, needle: string }>}
 */
export function findForbiddenMediaPipeTelemetry(bundles) {
  const findings = [];
  for (const { file, source } of bundles) {
    for (const { id, needle } of FORBIDDEN_MEDIAPIPE_TELEMETRY_MARKERS) {
      if (source.includes(needle)) findings.push({ file, marker: id, needle });
    }
  }
  return findings;
}
