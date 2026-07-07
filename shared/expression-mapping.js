import { ARKIT_52, CHANNEL_INDEX } from './blendshapes.js';

export const EXPRESSION_MAPPING_SCHEMA = 'minamo.expression-map.v1';
export const PERFECT_SYNC_MIN_MATCHES = 45;

export function detectPerfectSyncExpressions(availableNames, minMatches = PERFECT_SYNC_MIN_MATCHES) {
  const available = new Set(availableNames || []);
  const matched = ARKIT_52.filter((name) => available.has(name));
  return {
    active: matched.length >= minMatches,
    matched,
    missing: ARKIT_52.filter((name) => !available.has(name)),
    ratio: matched.length / ARKIT_52.length,
  };
}

export function createPerfectSyncExpressionMap(availableNames = ARKIT_52) {
  const available = new Set(availableNames);
  return normalizeExpressionMap({
    schema: EXPRESSION_MAPPING_SCHEMA,
    name: 'Perfect Sync identity',
    targets: ARKIT_52
      .filter((name) => available.has(name))
      .map((name) => ({ out: name, expr: [[name, 1]], curve: 'linear', clamp: [0, 1] })),
  });
}

export function createDefaultVrmExpressionMap(availableNames = []) {
  const available = new Set(availableNames);
  const has = (name) => available.size === 0 || available.has(name);
  const targets = [
    has('aa') && { out: 'aa', expr: [['jawOpen', 1.4]], curve: 'linear', clamp: [0, 1] },
    has('oh') && { out: 'oh', expr: [['mouthFunnel', 1.2]], curve: 'ease', clamp: [0, 1] },
    has('ou') && { out: 'ou', expr: [['mouthPucker', 1.2]], curve: 'ease', clamp: [0, 1] },
    has('ee') && {
      out: 'ee',
      expr: [['mouthStretchLeft', 0.6], ['mouthStretchRight', 0.6]],
      curve: 'linear',
      clamp: [0, 1],
    },
    has('ih') && {
      out: 'ih',
      expr: [['mouthLowerDownLeft', 0.55], ['mouthLowerDownRight', 0.55]],
      curve: 'linear',
      clamp: [0, 1],
    },
    has('blinkLeft') && { out: 'blinkLeft', expr: [['eyeBlinkLeft', 1]], curve: 'linear', clamp: [0, 1] },
    has('blinkRight') && { out: 'blinkRight', expr: [['eyeBlinkRight', 1]], curve: 'linear', clamp: [0, 1] },
    !has('blinkLeft') && !has('blinkRight') && has('blink') && {
      out: 'blink',
      expr: [['eyeBlinkLeft', 0.5], ['eyeBlinkRight', 0.5]],
      curve: 'linear',
      clamp: [0, 1],
    },
    has('happy') && {
      out: 'happy',
      expr: [['mouthSmileLeft', 0.6], ['mouthSmileRight', 0.6]],
      curve: 'ease',
      clamp: [0, 1],
    },
    has('angry') && {
      out: 'angry',
      expr: [['browDownLeft', 0.4], ['browDownRight', 0.4]],
      curve: 'ease',
      clamp: [0, 1],
    },
    has('surprised') && {
      out: 'surprised',
      expr: [['browInnerUp', 0.6], ['eyeWideLeft', 0.25], ['eyeWideRight', 0.25]],
      curve: 'linear',
      clamp: [0, 1],
    },
  ].filter(Boolean);
  return normalizeExpressionMap({
    schema: EXPRESSION_MAPPING_SCHEMA,
    name: 'VRM preset fallback',
    targets,
  });
}

export function parseExpressionMap(json) {
  return normalizeExpressionMap(JSON.parse(json));
}

export function serializeExpressionMap(map) {
  return `${JSON.stringify(normalizeExpressionMap(map), null, 2)}\n`;
}

export function normalizeExpressionMap(value) {
  if (!value || typeof value !== 'object') throw new Error('Expression mapping must be an object');
  if (value.schema && value.schema !== EXPRESSION_MAPPING_SCHEMA) throw new Error('Unsupported expression mapping schema');
  const targets = Array.isArray(value.targets) ? value.targets.map(normalizeTarget).filter(Boolean) : [];
  return {
    schema: EXPRESSION_MAPPING_SCHEMA,
    name: String(value.name || 'Expression mapping'),
    targets,
  };
}

export function evaluateExpressionMap(map, weights) {
  const normalized = normalizeExpressionMap(map);
  return normalized.targets.map((target) => {
    const raw = target.expr.reduce((sum, [source, weight]) => {
      const index = CHANNEL_INDEX[source];
      const value = index === undefined ? 0 : Number(weights[index] || 0);
      return sum + value * weight;
    }, 0);
    const curved = applyExpressionCurve(raw, target.curve);
    return { out: target.out, value: clamp(curved, target.clamp[0], target.clamp[1]) };
  });
}

export function applyExpressionCurve(value, curve) {
  if (curve === 'ease') {
    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.min(1, Math.abs(value));
    return sign * magnitude * magnitude * (3 - 2 * magnitude);
  }
  if (curve === 'easeIn') {
    const sign = value < 0 ? -1 : 1;
    return sign * Math.min(1, Math.abs(value)) ** 2;
  }
  if (curve === 'easeOut') {
    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.min(1, Math.abs(value));
    return sign * (1 - (1 - magnitude) ** 2);
  }
  return value;
}

function normalizeTarget(value) {
  if (!value || typeof value !== 'object') return null;
  const expr = Array.isArray(value.expr) ? value.expr.map(normalizeSource).filter(Boolean) : [];
  if (!value.out || expr.length === 0) return null;
  const clampValue = Array.isArray(value.clamp) ? value.clamp : [0, 1];
  const min = Number(clampValue[0]);
  const max = Number(clampValue[1]);
  return {
    out: String(value.out),
    expr,
    curve: ['linear', 'ease', 'easeIn', 'easeOut'].includes(value.curve) ? value.curve : 'linear',
    clamp: Number.isFinite(min) && Number.isFinite(max) ? [Math.min(min, max), Math.max(min, max)] : [0, 1],
  };
}

function normalizeSource(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const source = String(value[0] || '');
  const weight = Number(value[1]);
  if (!source || !Number.isFinite(weight)) return null;
  return [source, weight];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}
