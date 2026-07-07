import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;

export function parseGlb(input) {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buffer.byteLength < 20) throw new Error('GLB is too small');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  if (magic !== GLB_MAGIC) throw new Error('Invalid GLB magic');
  if (version !== GLB_VERSION) throw new Error(`Unsupported GLB version ${version}`);
  if (length > buffer.byteLength) throw new Error('GLB declared length exceeds file size');

  const chunks = [];
  let offset = 12;
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > length) throw new Error('GLB chunk exceeds declared length');
    chunks.push({ type: chunkType, data: buffer.slice(offset, offset + chunkLength) });
    offset += chunkLength;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === CHUNK_JSON);
  if (!jsonChunk) throw new Error('GLB has no JSON chunk');
  const jsonText = new TextDecoder().decode(jsonChunk.data).replace(/[\u0000 ]+$/g, '');
  const json = JSON.parse(jsonText);
  return { version, length, chunks, json };
}

export function summarizeGltf(gltf, byteLength = 0) {
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];
  const primitives = meshes.flatMap((mesh) => Array.isArray(mesh.primitives) ? mesh.primitives : []);
  const morphTargets = primitives.reduce((sum, primitive) => sum + (Array.isArray(primitive.targets) ? primitive.targets.length : 0), 0);
  const vertices = primitives.reduce((sum, primitive) => {
    const positionAccessor = primitive.attributes?.POSITION;
    const accessor = Number.isInteger(positionAccessor) ? accessors[positionAccessor] : null;
    return sum + (Number.isFinite(accessor?.count) ? accessor.count : 0);
  }, 0);
  const images = Array.isArray(gltf.images) ? gltf.images : [];
  const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
  const extensionsUsed = Array.isArray(gltf.extensionsUsed) ? gltf.extensionsUsed : [];
  const rootExtensions = gltf.extensions || {};
  const vrm0 = rootExtensions.VRM || null;
  const vrm1 = rootExtensions.VRMC_vrm || null;
  const springBone = rootExtensions.VRMC_springBone || rootExtensions.VRM_secondaryAnimation || null;
  const expressionNames = collectExpressionNames(vrm0, vrm1);
  const humanBones = collectHumanBones(vrm0, vrm1);
  const warnings = [];

  if (!vrm0 && !vrm1) warnings.push('VRM extension not found');
  if (!morphTargets) warnings.push('No morph targets found');
  if (!expressionNames.length) warnings.push('No VRM expression or blendshape names found');
  if (!humanBones.length) warnings.push('No humanoid bone mapping found');
  if (!springBone) warnings.push('Spring bone extension not found');
  for (const extension of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']) {
    if (extensionsUsed.includes(extension)) warnings.push(`Already uses ${extension}`);
  }

  return {
    fileBytes: byteLength,
    asset: {
      version: gltf.asset?.version || 'unknown',
      generator: gltf.asset?.generator || '',
      copyright: gltf.asset?.copyright || '',
    },
    counts: {
      scenes: count(gltf.scenes),
      nodes: count(gltf.nodes),
      meshes: meshes.length,
      primitives: primitives.length,
      vertices,
      morphTargets,
      materials: count(gltf.materials),
      textures: count(gltf.textures),
      images: images.length,
      animations: animations.length,
      skins: count(gltf.skins),
    },
    vrm: {
      version: vrm1 ? 'VRM 1.0' : vrm0 ? 'VRM 0.x' : 'none',
      humanBones,
      expressions: expressionNames,
      springBoneJoints: countSpringBoneJoints(springBone),
      springBoneColliders: countSpringBoneColliders(springBone),
    },
    images: images.map((image, index) => ({
      index,
      name: image.name || '',
      mimeType: image.mimeType || '',
      uri: image.uri || '',
      bufferView: Number.isInteger(image.bufferView) ? image.bufferView : null,
    })),
    animations: animations.map((animation, index) => ({
      index,
      name: animation.name || `animation-${index}`,
      channels: count(animation.channels),
      samplers: count(animation.samplers),
      durationSeconds: animationDurationSeconds(animation, accessors),
    })),
    extensionsUsed,
    warnings,
  };
}

export function formatInspection(summary) {
  const lines = [
    `file: ${formatBytes(summary.fileBytes)}`,
    `asset: glTF ${summary.asset.version}${summary.asset.generator ? `, ${summary.asset.generator}` : ''}`,
    `counts: ${summary.counts.nodes} nodes, ${summary.counts.meshes} meshes, ${summary.counts.primitives} primitives, ${summary.counts.vertices} vertices`,
    `materials/textures/images: ${summary.counts.materials}/${summary.counts.textures}/${summary.counts.images}`,
    `morph targets: ${summary.counts.morphTargets}`,
    `vrm: ${summary.vrm.version}, bones ${summary.vrm.humanBones.length}, expressions ${summary.vrm.expressions.length}`,
    `spring bones: ${summary.vrm.springBoneJoints} joints, ${summary.vrm.springBoneColliders} colliders`,
    `animations: ${summary.animations.map((animation) => `${animation.name} ${animation.durationSeconds.toFixed(2)}s`).join(', ') || 'none'}`,
    `extensions: ${summary.extensionsUsed.join(', ') || 'none'}`,
  ];
  if (summary.vrm.expressions.length) lines.push(`expressions: ${summary.vrm.expressions.join(', ')}`);
  if (summary.warnings.length) lines.push(`warnings: ${summary.warnings.join('; ')}`);
  return `${lines.join('\n')}\n`;
}

function collectExpressionNames(vrm0, vrm1) {
  const names = new Set();
  const expressions = vrm1?.expressions || {};
  for (const bucket of ['preset', 'custom']) {
    for (const name of Object.keys(expressions[bucket] || {})) names.add(name);
  }
  for (const group of vrm0?.blendShapeMaster?.blendShapeGroups || []) {
    if (group.name) names.add(group.name);
    if (group.presetName) names.add(group.presetName);
  }
  return [...names].sort();
}

function collectHumanBones(vrm0, vrm1) {
  if (vrm1?.humanoid?.humanBones) return Object.keys(vrm1.humanoid.humanBones).sort();
  const bones = vrm0?.humanoid?.humanBones;
  if (Array.isArray(bones)) return bones.map((bone) => bone.bone).filter(Boolean).sort();
  return [];
}

function countSpringBoneJoints(extension) {
  if (!extension) return 0;
  if (Array.isArray(extension.springs)) {
    return extension.springs.reduce((sum, spring) => sum + count(spring.joints), 0);
  }
  if (Array.isArray(extension.boneGroups)) {
    return extension.boneGroups.reduce((sum, group) => sum + count(group.bones), 0);
  }
  return 0;
}

function countSpringBoneColliders(extension) {
  if (!extension) return 0;
  if (Array.isArray(extension.colliders)) return extension.colliders.length;
  if (Array.isArray(extension.colliderGroups)) {
    return extension.colliderGroups.reduce((sum, group) => sum + count(group.colliders), 0);
  }
  return 0;
}

function animationDurationSeconds(animation, accessors) {
  let duration = 0;
  for (const sampler of animation.samplers || []) {
    const input = accessors[sampler.input];
    const max = Array.isArray(input?.max) ? Number(input.max[0]) : 0;
    if (Number.isFinite(max)) duration = Math.max(duration, max);
  }
  return duration;
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function formatBytes(bytes) {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function main(argv) {
  const json = argv.includes('--json');
  const avatar = argv.includes('--avatar');
  const file = argv.find((arg) => !arg.startsWith('-'));
  if (!file) {
    console.error('Usage: node scripts/inspect-glb.mjs <avatar.glb> [--json] [--avatar]');
    process.exit(2);
  }
  const bytes = fs.readFileSync(file);
  const parsed = parseGlb(bytes);
  const summary = summarizeGltf(parsed.json, parsed.length || bytes.byteLength);
  if (json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(path.relative(process.cwd(), file));
    process.stdout.write(formatInspection(summary));
  }
  if (avatar && summary.warnings.some((warning) => [
    'VRM extension not found',
    'No morph targets found',
    'No VRM expression or blendshape names found',
    'No humanoid bone mapping found',
  ].includes(warning))) {
    process.exit(1);
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
