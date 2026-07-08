// kagami-pack: avatar asset pack planner and reporter (issue #41 / KGM-041).
//
// This is the dependency-free planning + reporting half of the pipeline. It
// inspects a GLB/VRM, plans the conservative compression stage order
// (dedup -> prune -> KTX2 -> meshopt/Draco), emits the exact tool commands to
// run, and renders the before/after size table required by the issue. It never
// mutates the asset itself, so it is safe to run anywhere; the heavy encoders
// (gltf-transform, gltfpack) are invoked by the operator using the emitted
// commands and then re-inspected with `npm run inspect:glb -- <out> --avatar`.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseGlb, summarizeGltf, formatInspection } from './inspect-glb.mjs';

export const KAGAMI_PACK_SCHEMA = 'minamo.kagami-pack.v1';

export function planAvatarPack(summary, options = {}) {
  const geometry = options.geometry === 'draco' ? 'draco' : 'meshopt';
  const texture = options.texture !== false;
  const stages = [
    { id: 'inspect', tool: 'kagami-pack', command: 'npm run inspect:glb -- <in> --avatar', note: 'record baseline summary' },
    { id: 'dedup', tool: 'gltf-transform', command: 'gltf-transform dedup <in> <out>' },
    { id: 'prune', tool: 'gltf-transform', command: 'gltf-transform prune <in> <out>' },
  ];
  if (texture) {
    stages.push({ id: 'ktx2', tool: 'gltf-transform', command: 'gltf-transform uastc <in> <out>', note: 'UASTC for normal/detail, ETC1S for large albedo' });
  }
  stages.push(
    geometry === 'draco'
      ? { id: 'geometry', tool: 'gltf-transform', command: 'gltf-transform draco <in> <out>' }
      : { id: 'geometry', tool: 'gltfpack', command: 'gltfpack -i <in> -o <out> -cc' },
  );
  stages.push({ id: 'verify', tool: 'kagami-pack', command: 'npm run inspect:glb -- <out> --avatar', note: 'must exit 0 and preserve rig-critical counts' });

  const rigCritical = {
    morphTargets: Number(summary?.counts?.morphTargets ?? 0),
    expressions: Array.isArray(summary?.vrm?.expressions) ? summary.vrm.expressions.length : 0,
    humanBones: Array.isArray(summary?.vrm?.humanBones) ? summary.vrm.humanBones.length : 0,
    springBoneJoints: Number(summary?.vrm?.springBoneJoints ?? 0),
    materials: Number(summary?.counts?.materials ?? 0),
  };

  const warnings = [];
  if (!rigCritical.morphTargets) warnings.push('no morph targets: confirm this avatar is not already broken before packing');
  if (!rigCritical.expressions) warnings.push('no VRM expression/blendshape names found');
  if (!rigCritical.humanBones) warnings.push('no humanoid bone mapping found');
  if (geometry === 'draco' && rigCritical.morphTargets > 0) {
    warnings.push('Draco on a morph-heavy avatar: run the visual regression checklist before shipping');
  }

  return {
    schema: KAGAMI_PACK_SCHEMA,
    geometry,
    texture,
    rigCritical,
    stages,
    warnings,
    verifyAfter: 'npm run inspect:glb -- <out> --avatar',
  };
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} KB`;
  return `${value} B`;
}

function percentDelta(before, after) {
  const from = Number(before) || 0;
  const to = Number(after) || 0;
  if (from <= 0) return 'n/a';
  const delta = ((to - from) / from) * 100;
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function renderMarkdownTable(rows) {
  const header = `| ${rows[0].join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows.slice(1).map((row) => `| ${row.join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

// before/after = { fileBytes, gpuMemoryMb? }
export function formatSizeTable(before = {}, after = {}) {
  const rows = [
    ['metric', 'before', 'after', 'delta'],
    ['file size', formatBytes(before.fileBytes), formatBytes(after.fileBytes), percentDelta(before.fileBytes, after.fileBytes)],
  ];
  if (before.gpuMemoryMb != null && after.gpuMemoryMb != null) {
    rows.push(['gpu memory', `${before.gpuMemoryMb} MB`, `${after.gpuMemoryMb} MB`, percentDelta(before.gpuMemoryMb, after.gpuMemoryMb)]);
  }
  return renderMarkdownTable(rows);
}

function main(argv) {
  const args = argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const input = positional[0];
  if (!input) {
    console.error('usage: kagami-pack <avatar.glb> [--draco] [--no-texture]');
    process.exit(2);
    return;
  }
  const options = {
    geometry: args.includes('--draco') ? 'draco' : 'meshopt',
    texture: !args.includes('--no-texture'),
  };
  const bytes = fs.readFileSync(input);
  const parsed = parseGlb(bytes);
  const summary = summarizeGltf(parsed.json, parsed.length || bytes.byteLength);
  const plan = planAvatarPack(summary, options);

  console.log(formatInspection(summary));
  console.log(`\nkagami-pack plan (geometry: ${plan.geometry}, texture: ${plan.texture ? 'ktx2' : 'off'})`);
  for (const stage of plan.stages) {
    console.log(`  [${stage.id}] ${stage.command}${stage.note ? `  # ${stage.note}` : ''}`);
  }
  if (plan.warnings.length) {
    console.log('\nwarnings:');
    for (const warning of plan.warnings) console.log(`  - ${warning}`);
  }
  console.log('\nbefore/after size table (fill in after running the stages):');
  console.log(formatSizeTable({ fileBytes: summary.fileBytes }, { fileBytes: summary.fileBytes }));
  console.log('\nAfter packing, re-run: ' + plan.verifyAfter);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv);
}
