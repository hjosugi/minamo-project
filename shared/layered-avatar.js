import { CHANNEL_INDEX } from './blendshapes.js';

export const LAYERED_AVATAR_SCHEMA = 'minamo.layered-avatar.v1';

export const DEFAULT_LAYER_DEPTHS = Object.freeze({
  back: -0.35,
  body: 0,
  eyesOpen: 0.18,
  eyesClosed: 0.2,
  mouthClosed: 0.22,
  mouthOpen: 0.24,
  brows: 0.28,
  front: 0.35,
});

export function classifyLayerName(name) {
  const normalized = String(name || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  if (/\b(back|shadow|hair back)\b/.test(normalized)) return 'back';
  if (/\b(front|overlay|hair front)\b/.test(normalized)) return 'front';
  if (/\b(brow|eyebrow)\b/.test(normalized)) return 'brows';
  if (/\b(eye|eyes|lid|blink)\b/.test(normalized) && /\b(closed|close|blink|wink)\b/.test(normalized)) return 'eyesClosed';
  if (/\b(eye|eyes|lid)\b/.test(normalized)) return 'eyesOpen';
  if (/\b(mouth|jaw|viseme|aa|open)\b/.test(normalized) && /\b(open|aa|oh|wide)\b/.test(normalized)) return 'mouthOpen';
  if (/\b(mouth|jaw|viseme)\b/.test(normalized)) return 'mouthClosed';
  if (/\b(body|base|head|face|torso|neutral)\b/.test(normalized)) return 'body';
  return 'front';
}

export function createLayeredAvatarManifest(layerNames) {
  return {
    schema: LAYERED_AVATAR_SCHEMA,
    parallaxPx: 18,
    layers: Array.from(layerNames || [], (name) => {
      const slot = classifyLayerName(name);
      return {
        name: String(name),
        slot,
        depth: DEFAULT_LAYER_DEPTHS[slot] ?? 0,
      };
    }),
  };
}

export function serializeLayeredAvatarManifest(manifest) {
  return `${JSON.stringify(normalizeLayeredAvatarManifest(manifest), null, 2)}\n`;
}

export function parseLayeredAvatarManifest(json) {
  return normalizeLayeredAvatarManifest(JSON.parse(json));
}

export function normalizeLayeredAvatarManifest(value) {
  if (!value || typeof value !== 'object') throw new Error('Layered avatar manifest must be an object');
  if (value.schema && value.schema !== LAYERED_AVATAR_SCHEMA) throw new Error('Unsupported layered avatar schema');
  return {
    schema: LAYERED_AVATAR_SCHEMA,
    parallaxPx: normalizeParallaxPx(value.parallaxPx),
    layers: Array.isArray(value.layers) ? value.layers.map(normalizeLayer).filter(Boolean) : [],
  };
}

export function layeredAvatarStateFromWeights(weights) {
  const blink = Math.max(channel(weights, 'eyeBlinkLeft'), channel(weights, 'eyeBlinkRight'));
  const jawOpen = channel(weights, 'jawOpen');
  const mouthRound = Math.max(channel(weights, 'mouthFunnel'), channel(weights, 'mouthPucker'));
  const mouth = Math.max(jawOpen, mouthRound * 0.7);
  return {
    eyesClosed: blink >= 0.55,
    mouthOpen: mouth >= 0.22,
    blink,
    mouth,
    squashX: 1 + mouth * 0.035,
    squashY: 1 - mouth * 0.025,
  };
}

export function layerTransformForDepth({ yaw = 0, pitch = 0, depth = 0, parallaxPx = 18 } = {}) {
  const normalizedDepth = normalizeLayerDepth(depth, 0);
  return {
    x: -yaw * parallaxPx * normalizedDepth,
    y: pitch * parallaxPx * normalizedDepth,
    scale: 1 + Math.abs(normalizedDepth) * 0.015,
  };
}

export function normalizeLayerDepth(value, fallback = 0) {
  const depth = Number(value);
  if (!Number.isFinite(depth)) return fallback;
  return Math.max(-1, Math.min(1, depth));
}

function normalizeLayer(value) {
  if (!value || typeof value !== 'object') return null;
  const slot = value.slot && Object.hasOwn(DEFAULT_LAYER_DEPTHS, value.slot) ? value.slot : classifyLayerName(value.slot || value.name);
  return {
    name: String(value.name || slot),
    slot,
    depth: normalizeLayerDepth(value.depth, DEFAULT_LAYER_DEPTHS[slot] ?? 0),
  };
}

function normalizeParallaxPx(value) {
  const parallax = Number(value);
  if (!Number.isFinite(parallax)) return 18;
  return Math.max(0, Math.min(80, parallax));
}

function channel(weights, name) {
  const index = CHANNEL_INDEX[name];
  return index === undefined ? 0 : Number(weights[index] || 0);
}
