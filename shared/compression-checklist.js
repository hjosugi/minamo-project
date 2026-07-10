// Sample-asset compression checklist evaluator.
//
// Backs the "test method" and "sample asset checklist test" acceptance criteria
// for the compression docs (issues #156-#163). It consumes the summary produced
// by scripts/inspect-glb.mjs (`summarizeGltf`) and fails an asset when a
// rig-critical structure regresses, a required visual-regression pose is
// missing, or the license does not clear redistribution and modification.

export const REQUIRED_REGRESSION_POSES = Object.freeze([
  'neutral',
  'blink-left',
  'blink-right',
  'mouth-open',
  'smile',
  'pucker',
  'look-left',
  'look-right',
  'look-up',
  'look-down',
  'spring-bone-head-turn',
  'obs-transparent',
  'low-end-load',
]);

export const ASSET_COMPRESSION_CHECKLIST = Object.freeze([
  { id: 'inspection', doc: 'docs/compression/glb-inspection.md', requires: ['morphTargets', 'expressions', 'humanBones'] },
  { id: 'gltf-transform', doc: 'docs/compression/gltf-transform.md', requires: ['nodes', 'morphTargets'] },
  { id: 'ktx2', doc: 'docs/compression/ktx2-textures.md', requires: ['materials'] },
  { id: 'geometry', doc: 'docs/compression/meshopt-vs-draco.md', requires: ['morphTargets', 'springBoneJoints'] },
  { id: 'atlas-2d', doc: 'docs/compression/texture-atlas-2d.md', requires: [] },
  { id: 'motion-delta', doc: 'docs/compression/motion-delta-quantization.md', requires: [] },
  { id: 'visual-regression', doc: 'docs/compression/visual-regression-checklist.md', requires: [] },
  { id: 'license', doc: 'docs/compression/asset-license-checklist.md', requires: [] },
]);

function morphTargets(summary) {
  return Number(summary?.counts?.morphTargets ?? 0);
}

function materials(summary) {
  return Number(summary?.counts?.materials ?? 0);
}

function springBoneJoints(summary) {
  return Number(summary?.vrm?.springBoneJoints ?? 0);
}

function expressionNames(summary) {
  return Array.isArray(summary?.vrm?.expressions) ? summary.vrm.expressions : [];
}

function humanBoneNames(summary) {
  return Array.isArray(summary?.vrm?.humanBones) ? summary.vrm.humanBones : [];
}

function missing(before, after) {
  const afterSet = new Set(after);
  return before.filter((name) => !afterSet.has(name));
}

// report = {
//   baseline: <summarizeGltf output>,   // required
//   optimized: <summarizeGltf output>,  // optional; enables the preservation diff
//   regressionPoses: string[],          // optional; pose ids that passed regression
//   license: { source, name, redistribution, modification, attribution } // optional
// }
export function evaluateAssetChecklist(report = {}) {
  const failures = [];
  const baseline = report.baseline;

  if (!baseline || typeof baseline !== 'object') {
    return { ok: false, failures: ['baseline inspection summary is required'] };
  }

  // Inspection gate: the source asset must actually carry a rig.
  if (morphTargets(baseline) <= 0) failures.push('inspection: baseline has no morph targets');
  if (!expressionNames(baseline).length) failures.push('inspection: baseline has no VRM expression or blendshape names');
  if (!humanBoneNames(baseline).length) failures.push('inspection: baseline has no humanoid bone mapping');

  // Preservation diff: nothing rig-critical may regress after optimization.
  if (report.optimized && typeof report.optimized === 'object') {
    const opt = report.optimized;
    if (morphTargets(opt) < morphTargets(baseline)) {
      failures.push(`geometry: morph target count dropped ${morphTargets(baseline)} -> ${morphTargets(opt)}`);
    }
    if (materials(opt) < materials(baseline)) {
      failures.push(`texture: material count dropped ${materials(baseline)} -> ${materials(opt)}, references may be broken`);
    }
    if (springBoneJoints(opt) < springBoneJoints(baseline)) {
      failures.push(`geometry: spring bone joint count dropped ${springBoneJoints(baseline)} -> ${springBoneJoints(opt)}`);
    }
    const lostExpressions = missing(expressionNames(baseline), expressionNames(opt));
    if (lostExpressions.length) failures.push(`geometry: expressions removed: ${lostExpressions.join(', ')}`);
    const lostBones = missing(humanBoneNames(baseline), humanBoneNames(opt));
    if (lostBones.length) failures.push(`geometry: humanoid bones removed: ${lostBones.join(', ')}`);
  }

  // Visual regression gate: the full pose grid must be recorded.
  if (report.regressionPoses !== undefined) {
    const passed = new Set(report.regressionPoses || []);
    const missingPoses = REQUIRED_REGRESSION_POSES.filter((pose) => !passed.has(pose));
    if (missingPoses.length) failures.push(`visual-regression: missing poses: ${missingPoses.join(', ')}`);
  }

  // License gate: redistribution and modification must both be permitted.
  if (report.license !== undefined) {
    const license = report.license || {};
    if (!license.source) failures.push('license: source is required');
    if (!license.name) failures.push('license: license name is required');
    if (license.redistribution !== true) failures.push('license: redistribution is not permitted');
    if (license.modification !== true) failures.push('license: modification/compression is not permitted');
  }

  return { ok: failures.length === 0, failures };
}
