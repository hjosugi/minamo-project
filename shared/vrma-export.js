import { CHANNEL_INDEX } from './blendshapes.js';

export const VRMA_MIME = 'model/gltf-binary';
export const VRMA_EXTENSION = 'VRMC_vrm_animation';
export const VRMA_SPEC_VERSION = '1.0';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;

const REQUIRED_HUMAN_BONES = [
  'hips',
  'spine',
  'head',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
];

export const VRMA_PRESET_EXPRESSIONS = [
  'aa',
  'ih',
  'ou',
  'ee',
  'oh',
  'blink',
  'blinkLeft',
  'blinkRight',
  'happy',
  'angry',
  'surprised',
  'neutral',
];

export function exportVrmaFromFrames(frames, {
  trimStartMs = 0,
  trimEndMs = Infinity,
  loop = false,
  name = 'Minamo motion clip',
} = {}) {
  const clipFrames = trimMotionFrames(frames, { trimStartMs, trimEndMs });
  const times = clipFrames.map((frame) => frame.timeSec);
  const builder = createGltfBuilder();
  const nodes = createVrmaNodes();
  const headNode = nodes.boneNodeByName.head;
  const animation = {
    name,
    samplers: [],
    channels: [],
    extras: { loop: Boolean(loop), source: 'minamo-vrma-export' },
  };

  const timeAccessor = builder.addAccessor(times, 'SCALAR', times.length, {
    min: [times[0]],
    max: [times.at(-1)],
  });
  const headRotations = [];
  for (const frame of clipFrames) headRotations.push(...normalizeQuat(frame.frame.face?.quat));
  const headAccessor = builder.addAccessor(headRotations, 'VEC4', clipFrames.length);
  addAnimationChannel(animation, timeAccessor, headAccessor, headNode, 'rotation');

  const expressionNodes = {};
  const preset = {};
  for (const expression of VRMA_PRESET_EXPRESSIONS) {
    const nodeIndex = nodes.nodes.length;
    nodes.nodes.push({ name: `expr:${expression}`, translation: [0, 0, 0] });
    expressionNodes[expression] = nodeIndex;
    preset[expression] = { node: nodeIndex };
  }

  for (const expression of VRMA_PRESET_EXPRESSIONS) {
    const values = [];
    for (const frame of clipFrames) {
      const weight = expressionWeights(frame.frame.face?.weights)[expression] ?? 0;
      values.push(clamp01(weight), 0, 0);
    }
    const outputAccessor = builder.addAccessor(values, 'VEC3', clipFrames.length);
    addAnimationChannel(animation, timeAccessor, outputAccessor, expressionNodes[expression], 'translation');
  }

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Minamo VRMA exporter',
    },
    scene: 0,
    scenes: [{ nodes: [nodes.boneNodeByName.hips] }],
    nodes: nodes.nodes,
    animations: [animation],
    buffers: [{ byteLength: builder.byteLength }],
    bufferViews: builder.bufferViews,
    accessors: builder.accessors,
    extensionsUsed: [VRMA_EXTENSION],
    extensionsRequired: [VRMA_EXTENSION],
    extensions: {
      [VRMA_EXTENSION]: {
        specVersion: VRMA_SPEC_VERSION,
        humanoid: { humanBones: nodes.humanBones },
        expressions: { preset },
      },
    },
    extras: {
      minamo: {
        loop: Boolean(loop),
        frameCount: clipFrames.length,
        trimStartMs,
        trimEndMs: Number.isFinite(trimEndMs) ? trimEndMs : null,
      },
    },
  };

  return encodeGlb(gltf, builder.bytes());
}

export function trimMotionFrames(frames, { trimStartMs = 0, trimEndMs = Infinity } = {}) {
  const sorted = Array.from(frames || []).filter((frame) => frame?.face).sort((a, b) => Number(a.t) - Number(b.t));
  if (!sorted.length) throw new Error('VRMA export requires at least one face frame.');
  const baseT = Number(sorted[0].t) || 0;
  const start = baseT + Math.max(0, Number(trimStartMs) || 0);
  const duration = Math.max(0, Number(sorted.at(-1).t) - baseT);
  const endOffset = Number.isFinite(trimEndMs) ? Number(trimEndMs) : duration;
  const end = baseT + Math.max(0, endOffset);
  if (end <= start) throw new Error('VRMA trim end must be after trim start.');
  const clipped = sorted.filter((frame) => Number(frame.t) >= start && Number(frame.t) <= end);
  if (!clipped.length) throw new Error('VRMA trim range does not contain motion frames.');
  const firstT = Number(clipped[0].t) || start;
  return clipped.map((frame) => ({ frame, timeSec: Math.max(0, (Number(frame.t) - firstT) / 1000) }));
}

export function parseVrmaGlb(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('Invalid GLB magic.');
  if (dv.getUint32(4, true) !== GLB_VERSION) throw new Error('Unsupported GLB version.');
  const totalLength = dv.getUint32(8, true);
  if (totalLength !== data.byteLength) throw new Error('GLB length mismatch.');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < data.byteLength) {
    const length = dv.getUint32(offset, true); offset += 4;
    const type = dv.getUint32(offset, true); offset += 4;
    const chunk = data.slice(offset, offset + length); offset += length;
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk).trim());
    else if (type === CHUNK_BIN) bin = chunk;
  }
  if (!json) throw new Error('GLB JSON chunk is missing.');
  return { json, bin };
}

function createGltfBuilder() {
  const parts = [];
  const bufferViews = [];
  const accessors = [];
  let byteLength = 0;
  return {
    get bufferViews() { return bufferViews; },
    get accessors() { return accessors; },
    get byteLength() { return byteLength; },
    addAccessor(values, type, count, extras = {}) {
      const padding = (4 - (byteLength % 4)) % 4;
      if (padding) {
        parts.push(new Uint8Array(padding));
        byteLength += padding;
      }
      const array = new Float32Array(values);
      const bytes = new Uint8Array(array.buffer);
      const bufferView = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength });
      parts.push(bytes);
      byteLength += bytes.byteLength;
      const accessor = accessors.length;
      accessors.push({
        bufferView,
        componentType: COMPONENT_FLOAT,
        count,
        type,
        ...extras,
      });
      return accessor;
    },
    bytes() {
      const out = new Uint8Array(byteLength);
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
      }
      return out;
    },
  };
}

function createVrmaNodes() {
  const nodes = [
    { name: 'hips', children: [1, 3, 6], translation: [0, 0.9, 0] },
    { name: 'spine', children: [2, 9, 12], translation: [0, 0.18, 0] },
    { name: 'head', translation: [0, 0.46, 0] },
    { name: 'leftUpperLeg', children: [4], translation: [-0.09, -0.1, 0] },
    { name: 'leftLowerLeg', children: [5], translation: [0, -0.42, 0] },
    { name: 'leftFoot', translation: [0, -0.42, 0.08] },
    { name: 'rightUpperLeg', children: [7], translation: [0.09, -0.1, 0] },
    { name: 'rightLowerLeg', children: [8], translation: [0, -0.42, 0] },
    { name: 'rightFoot', translation: [0, -0.42, 0.08] },
    { name: 'leftUpperArm', children: [10], translation: [-0.22, 0.28, 0] },
    { name: 'leftLowerArm', children: [11], translation: [-0.28, 0, 0] },
    { name: 'leftHand', translation: [-0.24, 0, 0] },
    { name: 'rightUpperArm', children: [13], translation: [0.22, 0.28, 0] },
    { name: 'rightLowerArm', children: [14], translation: [0.28, 0, 0] },
    { name: 'rightHand', translation: [0.24, 0, 0] },
  ];
  const boneNodeByName = Object.fromEntries(REQUIRED_HUMAN_BONES.map((name, index) => [name, index]));
  const humanBones = Object.fromEntries(REQUIRED_HUMAN_BONES.map((name) => [name, { node: boneNodeByName[name] }]));
  return { nodes, boneNodeByName, humanBones };
}

function addAnimationChannel(animation, input, output, node, path) {
  const sampler = animation.samplers.length;
  animation.samplers.push({ input, output, interpolation: 'LINEAR' });
  animation.channels.push({ sampler, target: { node, path } });
}

function expressionWeights(weights) {
  const w = (name) => clamp01(weights?.[CHANNEL_INDEX[name]]);
  const jawOpen = w('jawOpen');
  const stretch = Math.max(w('mouthStretchLeft'), w('mouthStretchRight'));
  const pucker = Math.max(w('mouthPucker'), w('mouthFunnel'));
  const blinkLeft = w('eyeBlinkLeft');
  const blinkRight = w('eyeBlinkRight');
  return {
    aa: jawOpen,
    ih: stretch,
    ou: w('mouthPucker'),
    ee: stretch,
    oh: Math.max(w('mouthFunnel'), Math.min(jawOpen, pucker)),
    blink: Math.min(blinkLeft, blinkRight),
    blinkLeft,
    blinkRight,
    happy: Math.max(w('mouthSmileLeft'), w('mouthSmileRight')),
    angry: Math.max(w('mouthFrownLeft'), w('mouthFrownRight'), w('browDownLeft'), w('browDownRight')),
    surprised: Math.max(jawOpen, w('eyeWideLeft'), w('eyeWideRight')),
    neutral: 0,
  };
}

function encodeGlb(gltf, bin) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const paddedJson = padChunk(jsonBytes, 0x20);
  const paddedBin = padChunk(bin, 0);
  const totalLength = 12 + 8 + paddedJson.byteLength + 8 + paddedBin.byteLength;
  const out = new Uint8Array(totalLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, GLB_VERSION, true);
  dv.setUint32(8, totalLength, true);
  let offset = 12;
  dv.setUint32(offset, paddedJson.byteLength, true); offset += 4;
  dv.setUint32(offset, CHUNK_JSON, true); offset += 4;
  out.set(paddedJson, offset); offset += paddedJson.byteLength;
  dv.setUint32(offset, paddedBin.byteLength, true); offset += 4;
  dv.setUint32(offset, CHUNK_BIN, true); offset += 4;
  out.set(paddedBin, offset);
  return out;
}

function padChunk(bytes, padValue) {
  const padding = (4 - (bytes.byteLength % 4)) % 4;
  if (!padding) return bytes;
  const out = new Uint8Array(bytes.byteLength + padding);
  out.set(bytes);
  out.fill(padValue, bytes.byteLength);
  return out;
}

function normalizeQuat(quat = [0, 0, 0, 1]) {
  const x = Number(quat[0]) || 0;
  const y = Number(quat[1]) || 0;
  const z = Number(quat[2]) || 0;
  const w = Number(quat[3]) || 1;
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
