#!/usr/bin/env python3
from __future__ import annotations

import ast
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'README.md',
    'docs/QUICKSTART.md',
    'docs/PROTOCOL.md',
    'docs/PROTOCOL_V2_DRAFT.md',
    'docs/ARCHITECTURE.md',
    'docs/ARCHITECTURE_TARGET.md',
    'docs/DEV_HTTPS.md',
    'docs/CONTRIBUTING.md',
    'docs/SECURITY_REVIEW.md',
    'docs/RELEASE_CHECKLIST.md',
    'docs/DEPENDENCY_POLICY.md',
    'docs/ISSUE_LABELS.md',
    'docs/GLOSSARY.md',
    'docs/IMPLEMENTATION_PROGRESS.md',
    'docs/transport/kgm2-reference-codecs.md',
    'docs/transport/moq-evaluation.md',
    'docs/security/e2ee.md',
    'docs/adr/README.md',
    'docs/product/onboarding.md',
    'docs/product/desktop-app.md',
    'docs/product/obs-setup.md',
    'docs/product/drummer-setup.md',
    'docs/product/layered-avatar.md',
    'docs/product/troubleshooting.md',
    'docs/product/creator-presets.schema.json',
    'docs/product/avatar-preset-profile.schema.json',
    'docs/product/expression-mapping.schema.json',
    'docs/product/layered-avatar.schema.json',
    'landing/index.html',
    'landing/app.js',
    'roadmap/index.html',
    'replay/index.html',
    'src/core/types.ts',
    'src/core/oneEuroFilter.ts',
    'src/core/anatomy.ts',
    'src/adapters/avatar_profile.ts',
    'shared/runtime.js',
    'shared/kgm1b.js',
    'shared/kgm2.js',
    'shared/kgm-recording.js',
    'shared/vrma-export.js',
    'shared/e2ee.js',
    'shared/hud-metrics.js',
    'shared/voice-activity.js',
    'shared/audio-lipsync.js',
    'shared/expression-mapping.js',
    'shared/layered-avatar.js',
    'shared/recording.js',
    'shared/compression-checklist.js',
    'shared/motion-quant.js',
    'shared/drum-overlay.js',
    'shared/pairing.js',
    'docs/compression/avatar-compression.md',
    'docs/compression/glb-inspection.md',
    'docs/compression/gltf-transform.md',
    'docs/compression/ktx2-textures.md',
    'docs/compression/meshopt-vs-draco.md',
    'docs/compression/texture-atlas-2d.md',
    'docs/compression/motion-delta-quantization.md',
    'docs/compression/visual-regression-checklist.md',
    'docs/compression/asset-license-checklist.md',
    'viewer/drum-overlay.html',
    'docs/tracking/drum-hihat-pedal.md',
    'docs/tracking/drum-kick-pedal.md',
    'docs/product/drum-obs-overlay.md',
    'docs/ml/drum-dataset-schema.md',
    'docs/product/drum-dataset.schema.json',
    'tests/fixtures/drum-benchmark-clips.json',
    'tests/fixtures/drum-benchmark-detector.mjs',
    'tests/fixtures/drum-benchmark-runner.manifest.json',
    'tests/fixtures/drum-benchmark-runner.mp4',
    'scripts/drum-benchmark.ts',
    'docs/benchmarks/drum-benchmark-runner.md',
    'docs/research/multi-camera-fusion.md',
    'docs/research/phone-camera-companion.md',
    'docs/research/imu-stick-integration.md',
    'docs/design/DD-009-onnx-backend-registry.md',
    'docs/benchmarks/onnx-pose-backends.md',
    'scripts/kagami-pack.mjs',
    'tests/fixtures/kgm1-synthetic.jsonl',
    'tests/fixtures/kgm1-synthetic.kgm',
    'tests/fixtures/hand-golden-clip.json',
    'tsconfig.browser-js.json',
    'scripts/fetch-models.sh',
    'scripts/kgm1b_codec.py',
    'scripts/release-smoke.mjs',
    '.github/workflows/ci.yml',
    '.nojekyll',
    'docker-compose.yml',
    'issues/index.csv',
    'desktop/index.html',
    'desktop/desktop.js',
    'desktop/styles.css',
    'diagnostics/no-broken-finger.html',
    'diagnostics/no-broken-finger.js',
    'diagnostics/avatar-mapping.html',
    'diagnostics/avatar-mapping.js',
    'docs/benchmarks/hand-stability-report.md',
    'src-tauri/Cargo.toml',
    'src-tauri/Info.plist',
    'src-tauri/tauri.conf.json',
    'src-tauri/capabilities/default.json',
    'src-tauri/icons/icon.png',
    'src-tauri/icons/icon.svg',
    'src-tauri/src/lib.rs',
    'src-tauri/src/main.rs',
    'relay-rs/grafana-dashboard.json',
    'services/erlang-router/load-test.mjs',
    'Cargo.toml',
    'Cargo.lock',
    'crates/kgm1-codec/Cargo.toml',
    'crates/kgm1-codec/src/lib.rs',
    'packages/kgm1-codec-py/pyproject.toml',
    'packages/kgm1-codec-py/kgm1_codec/__init__.py',
    'packages/kgm1-codec-py/kgm1_codec/__main__.py',
    'tracker/audio-lipsync-worklet.js',
]

errors: list[str] = []


def add_error(path: str | Path, message: str) -> None:
    errors.append(f'{path}: {message}')


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


missing = [p for p in REQUIRED if not (ROOT / p).exists()]
for path in missing:
    add_error(path, 'required file is missing')

issue_count = len(list((ROOT / 'issues' / 'backlog').glob('*.md')))
if issue_count < 100:
    add_error('issues/backlog', f'expected at least 100 issue files, got {issue_count}')


def parse_issue_template(path: Path) -> dict[str, object]:
    text = path.read_text(encoding='utf-8')
    data: dict[str, object] = {'body': []}
    current_item: dict[str, str] | None = None
    in_body = False

    for lineno, raw_line in enumerate(text.splitlines(), 1):
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        if not line.startswith(' '):
            key, sep, value = stripped.partition(':')
            if not sep:
                add_error(path, f'line {lineno} is not a key-value pair')
                continue
            if key == 'body':
                data[key] = []
            elif key == 'labels':
                try:
                    data[key] = list(ast.literal_eval(value.strip()))
                except (SyntaxError, ValueError):
                    add_error(path, f'line {lineno} labels must use ["slash/style"] list syntax')
            else:
                data[key] = value.strip()
            in_body = key == 'body'
            current_item = None
            continue
        if in_body and line.startswith('  - '):
            current_item = {}
            data['body'].append(current_item)  # type: ignore[index]
            key, sep, value = line[4:].partition(':')
            if sep:
                current_item[key.strip()] = value.strip()
            continue
        if in_body and current_item is not None and line.startswith('    '):
            key, sep, value = stripped.partition(':')
            if sep and key in {'id', 'type'}:
                current_item[key] = value.strip()

    return data


def validate_issue_templates() -> None:
    taxonomy_text = read('docs/ISSUE_LABELS.md')
    taxonomy_labels = set(re.findall(r'`((?:area|type|priority|effort|protocol|tracking|integration)/[^`]+)`', taxonomy_text))
    template_dir = ROOT / '.github' / 'ISSUE_TEMPLATE'
    required_templates = {'bug_report.yml', 'feature_request.yml', 'tracking_quality.yml'}
    found_templates = {p.name for p in template_dir.glob('*.yml')}
    for name in sorted(required_templates - found_templates):
        add_error(template_dir / name, 'required issue template is missing')
    for path in sorted(template_dir.glob('*.yml')):
        data = parse_issue_template(path)
        for key in ('name', 'description', 'labels', 'body'):
            if not data.get(key):
                add_error(path, f'missing required issue-form key "{key}"')
        labels = data.get('labels', [])
        if not isinstance(labels, list):
            add_error(path, 'labels must parse as a list')
            labels = []
        for label in labels:
            if not isinstance(label, str):
                add_error(path, f'label {label!r} is not a string')
                continue
            if ':' in label:
                add_error(path, f'label "{label}" must use slash-style naming, not colon-style')
            if label not in taxonomy_labels:
                add_error(path, f'label "{label}" is not documented in docs/ISSUE_LABELS.md')
        body = data.get('body', [])
        if not isinstance(body, list) or not body:
            add_error(path, 'body must contain at least one form item')
            continue
        ids = [item.get('id') for item in body if isinstance(item, dict) and item.get('id')]
        if len(ids) != len(set(ids)):
            add_error(path, 'body item ids must be unique')
        if path.name == 'tracking_quality.yml':
            required_ids = {'browser', 'camera', 'fps', 'lighting', 'mode', 'capture_checklist'}
            for item_id in sorted(required_ids - set(ids)):
                add_error(path, f'tracking quality template must ask for "{item_id}"')
            text = path.read_text(encoding='utf-8')
            if 'No private raw camera recording is attached' not in text:
                add_error(path, 'capture checklist must include the no-raw-recording privacy confirmation')


def validate_adr_headings() -> None:
    required_headings = {
        '## Status',
        '## Context',
        '## Decision',
        '## Consequences',
        '## Validation',
        '## References',
    }
    for path in sorted((ROOT / 'docs' / 'adr').glob('*.md')):
        if path.name == 'README.md':
            continue
        text = path.read_text(encoding='utf-8')
        headings = {line.strip() for line in text.splitlines() if line.startswith('## ')}
        for heading in sorted(required_headings - headings):
            add_error(path, f'missing ADR heading "{heading}"')
        if not re.search(r'## Status\s+\n\s*(Proposed|Accepted|Superseded|Deprecated)', text):
            add_error(path, 'ADR status must be Proposed, Accepted, Superseded, or Deprecated')


def validate_local_docs_links() -> None:
    link_pattern = re.compile(r'(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
    for base_dir in (ROOT, ROOT / 'docs'):
        paths = base_dir.glob('*.md') if base_dir == ROOT else base_dir.rglob('*.md')
        for path in sorted(paths):
            text = path.read_text(encoding='utf-8')
            for match in link_pattern.finditer(text):
                target = match.group(1)
                if re.match(r'^[a-z][a-z0-9+.-]*:', target) or target.startswith('#'):
                    continue
                clean_target = target.split('#', 1)[0]
                if not clean_target:
                    continue
                resolved = (path.parent / clean_target).resolve()
                try:
                    resolved.relative_to(ROOT)
                except ValueError:
                    add_error(path, f'link "{target}" points outside the repository')
                    continue
                if not resolved.exists():
                    add_error(path, f'local link "{target}" does not resolve')


def validate_documented_package_scripts() -> None:
    package_script_cache: dict[Path, set[str] | None] = {}
    skip = {'install', 'add', 'remove', 'exec', 'dlx'}

    def scripts_for(cwd: Path, source: Path) -> set[str] | None:
        cwd = cwd.resolve()
        if cwd in package_script_cache:
            return package_script_cache[cwd]
        package_path = cwd / 'package.json'
        if not package_path.exists():
            add_error(source, f'documented package command runs in {cwd.relative_to(ROOT)} but no package.json exists there')
            package_script_cache[cwd] = None
            return None
        scripts = set(json.loads(package_path.read_text(encoding='utf-8')).get('scripts', {}))
        package_script_cache[cwd] = scripts
        return scripts

    def check_command(command: str, source: Path) -> None:
        cwd = ROOT
        for segment in [part.strip() for part in command.split('&&')]:
            if not segment:
                continue
            cd_match = re.match(r'^cd\s+([^\s;&]+)$', segment)
            if cd_match:
                cwd = (cwd / cd_match.group(1)).resolve()
                try:
                    cwd.relative_to(ROOT)
                except ValueError:
                    add_error(source, f'documented command changes outside the repository: {segment}')
                continue
            command_match = re.match(r'^(?:npm|pnpm|yarn)(?:\s+run)?\s+([a-zA-Z0-9:_-]+)\b', segment)
            if not command_match:
                continue
            script = command_match.group(1)
            if script in skip or script.startswith('-'):
                continue
            scripts = scripts_for(cwd, source)
            if scripts is not None and script not in scripts:
                location = cwd.relative_to(ROOT)
                add_error(source, f'documented package script "{script}" is not defined in {location}/package.json')

    def fenced_commands(text: str) -> list[str]:
        commands: list[str] = []
        in_fence = False
        for raw_line in text.splitlines():
            stripped = raw_line.strip()
            if stripped.startswith('```'):
                in_fence = not in_fence
                continue
            if in_fence and stripped and not stripped.startswith('#'):
                commands.append(stripped.split('#', 1)[0].strip())
        return commands

    inline_command_pattern = re.compile(r'`((?:npm|pnpm|yarn)(?:\s+run)?\s+[a-zA-Z0-9:_-]+)`')
    for path in sorted([ROOT / 'README.md', *list((ROOT / 'docs').rglob('*.md'))]):
        text = path.read_text(encoding='utf-8')
        for command in fenced_commands(text):
            check_command(command, path)
        for match in inline_command_pattern.finditer(text):
            check_command(match.group(1), path)


def validate_glossary_examples() -> None:
    glossary = read('docs/GLOSSARY.md')
    terms = ['KGM1', 'KGM1 JSON', 'KGM1B', 'KGM2', 'Face block', 'Pose block', 'JSONL recording', 'Room token', 'Quality score', 'Calibration profile']
    for term in terms:
        if f'- {term}:' not in glossary:
            add_error('docs/GLOSSARY.md', f'missing required term: {term}')
            continue
        entry = glossary.split(f'- {term}:', 1)[1].split('\n-', 1)[0]
        if 'Example:' not in entry:
            add_error('docs/GLOSSARY.md', f'term lacks example: {term}')


def validate_dependency_guardrails() -> None:
    package = json.loads(read('package.json'))
    tracker_version = re.search(r"MEDIAPIPE_VERSION = '([^']+)'", read('tracker/tracker.js'))
    fetch_version = re.search(r'^VERSION="([^"]+)"', read('scripts/fetch-models.sh'), re.MULTILINE)
    package_version = package.get('dependencies', {}).get('@mediapipe/tasks-vision', '').lstrip('^~')
    if tracker_version and fetch_version and tracker_version.group(1) != fetch_version.group(1):
        add_error('scripts/fetch-models.sh', 'MediaPipe version mismatch with tracker/tracker.js')
    if tracker_version and package_version and tracker_version.group(1) != package_version:
        add_error('package.json', 'MediaPipe version mismatch with tracker/tracker.js')
    model_text = read('scripts/fetch-models.sh') + read('tracker/tracker.js')
    external_model_urls = re.findall(r'https://storage\.googleapis\.com/mediapipe-models/[^\'"\s]+', model_text)
    for url in external_model_urls:
        if not re.search(r'/float16/\d+/', url):
            add_error('scripts/fetch-models.sh', f'MediaPipe model URL lacks pinned model version: {url}')
    tracker = read('tracker/tracker.js')
    fetch_script = read('scripts/fetch-models.sh')
    if 'vision_bundle.mjs' not in fetch_script:
        add_error('scripts/fetch-models.sh', 'MediaPipe vendor script must download vision_bundle.mjs for offline use')
    if "from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision" in tracker:
        add_error('tracker/tracker.js', 'MediaPipe Tasks must not be statically imported from CDN')
    if 'LOCAL_TASKS_VISION_BUNDLE' not in tracker or 'importVerifiedModule' not in tracker:
        add_error('tracker/tracker.js', 'tracker must prefer local MediaPipe bundle and integrity-check CDN fallback')
    if not re.search(r"CDN_TASKS_VISION_INTEGRITY = 'sha256-[A-Za-z0-9+/=]+'", tracker):
        add_error('tracker/tracker.js', 'CDN MediaPipe bundle SRI hash must be pinned')


def validate_foundation_contracts() -> None:
    ci = read('.github/workflows/ci.yml')
    release_smoke = read('scripts/release-smoke.mjs')
    relay_node_package = json.loads(read('relay-node/package.json'))
    relay_node = read('relay-node/server.mjs')
    relay_node_test = read('relay-node/server.node-test.mjs')
    relay_rs = read('relay-rs/src/main.rs')
    tracker = read('tracker/tracker.js')

    package = json.loads(read('package.json'))
    if package.get('packageManager') != 'pnpm@11.0.0':
        add_error('package.json', 'packageManager must pin pnpm@11.0.0')
    if package.get('scripts', {}).get('benchmark:drum') != 'tsx scripts/drum-benchmark.ts':
        add_error('package.json', 'benchmark:drum must run the TypeScript drum benchmark runner')
    if not (ROOT / 'pnpm-lock.yaml').exists():
        add_error('pnpm-lock.yaml', 'pnpm lockfile is required')
    if not (ROOT / 'pnpm-workspace.yaml').exists():
        add_error('pnpm-workspace.yaml', 'pnpm workspace must include relay-node')
    workspace = read('pnpm-workspace.yaml')
    if 'allowBuilds:\n  esbuild: true' not in workspace:
        add_error('pnpm-workspace.yaml', 'esbuild must be the explicitly reviewed pnpm 11 install-script dependency')

    for needle in ['pnpm lint', 'pnpm test', 'pnpm verify', 'pnpm typecheck:js', 'pnpm build']:
        if needle not in ci:
            add_error('.github/workflows/ci.yml', f'CI missing JavaScript gate: {needle}')
    if 'pnpm install --frozen-lockfile' not in ci:
        add_error('.github/workflows/ci.yml', 'CI must install the frozen pnpm lockfile')
    if 'cargo test --manifest-path relay-rs/Cargo.toml' not in ci:
        add_error('.github/workflows/ci.yml', 'CI must run relay-rs tests')
    if 'pnpm test' not in ci or 'working-directory: relay-node' not in ci:
        add_error('.github/workflows/ci.yml', 'CI must run relay-node tests')
    if relay_node_package.get('scripts', {}).get('test') != 'node --test server.node-test.mjs':
        add_error('relay-node/package.json', 'relay-node must expose node:test script')
    if "['pnpm', ['--dir', 'relay-node', 'test']]" not in release_smoke:
        add_error('scripts/release-smoke.mjs', 'release smoke must run relay-node tests')
    if "['pnpm', ['install', '--frozen-lockfile', '--prefer-offline']]" not in release_smoke:
        add_error('scripts/release-smoke.mjs', 'release smoke must validate the frozen pnpm lockfile')
    if "['cargo', ['test', '--manifest-path', 'relay-rs/Cargo.toml']]" not in release_smoke:
        add_error('scripts/release-smoke.mjs', 'release smoke must run relay-rs tests')

    for export_name in ['constantTimeEqual', 'originAllowed', 'isKgm1Json', 'leaveRoom', 'parseParticipantId']:
        if f'export function {export_name}' not in relay_node:
            add_error('relay-node/server.mjs', f'missing testable export {export_name}')
        if export_name not in relay_node_test:
            add_error('relay-node/server.node-test.mjs', f'missing test coverage for {export_name}')
    if 'beat.unref' not in relay_node:
        add_error('relay-node/server.mjs', 'relay heartbeat interval must not keep imported tests alive')
    for needle in [
        'constant_time_equal("secret", "secret")',
        'gc_room_removes_room_after_last_participant_leaves',
        'rejects_wrong_webtransport_room_token',
        'webtransport_pub_sub_echoes_datagram_through_room',
    ]:
        if needle not in relay_rs:
            add_error('relay-rs/src/main.rs', f'missing relay-rs regression test: {needle}')
    if 'request.forbidden().await' not in relay_rs:
        add_error('relay-rs/src/main.rs', 'relay-rs must reject wrong room tokens with a forbidden response')

    if 'blockingCapabilityMessage' not in tracker or 'stageHint' not in tracker:
        add_error('tracker/tracker.js', 'tracker must show blocking capability failures in the stage hint before startup')
    if 'devicechange' not in tracker or 'restartCameraIfRunning' not in tracker:
        add_error('tracker/tracker.js', 'tracker must support live camera device refresh and switching')
    if 'btnResetSettings' not in tracker or 'TRACKER_STORAGE_KEY' not in tracker:
        add_error('tracker/tracker.js', 'tracker settings persistence must include a reset path')
    if 'FrameOrderGate' not in read('viewer/viewer.js') or 'seq: 65535' not in read('tests/run-tests.mjs'):
        add_error('viewer/viewer.js', 'viewer jitter buffer must have wrap-aware test coverage')
    if 'gcr.io/distroless/nodejs22-debian12' not in read('Dockerfile.relay-node'):
        add_error('Dockerfile.relay-node', 'relay-node runtime image must be distroless')
    if 'STOPSIGNAL SIGINT' not in read('Dockerfile.relay-node') or 'function shutdown()' not in relay_node:
        add_error('Dockerfile.relay-node', 'relay-node container must stop cleanly under compose down')
    relay_rs_dockerfile = read('relay-rs/Dockerfile')
    if 'gcr.io/distroless/cc-debian12' not in relay_rs_dockerfile:
        add_error('relay-rs/Dockerfile', 'relay-rs runtime image must be distroless')
    if 'FROM rust:1.88-bookworm AS build' not in relay_rs_dockerfile or 'COPY Cargo.lock ./' not in relay_rs_dockerfile:
        add_error('relay-rs/Dockerfile', 'relay-rs Docker build must use Rust 1.88 and the locked dependency graph')
    if 'STOPSIGNAL SIGINT' not in relay_rs_dockerfile:
        add_error('relay-rs/Dockerfile', 'relay-rs container must declare a compose stop signal')


def validate_calibration_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')
    backlog = read('docs/BACKLOG.md')

    for needle in [
        'CALIBRATION_GUIDE_TOTAL_MS',
        'createGuidedCalibrationSession',
        'collectGuidedCalibrationSample',
        'buildCalibrationProfileFromSamples',
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing guided calibration helper: {needle}')
    for needle in ['btnStartCalibration', 'calibrationGuide', 'calibrationProgress', 'calibrationResult']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing guided calibration UI element: {needle}')
    for needle in [
        'sampleGuidedCalibration(sanitized.weights)',
        'tickGuidedCalibration();',
        'calibrationGuideProgress',
        'buildCalibrationProfileFromSamples',
        'saveProfile()',
        'resetFilters()',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing guided calibration tracker contract: {needle}')
    for needle in [
        'assert.equal(CALIBRATION_GUIDE_TOTAL_MS, 30_000)',
        'calibratedNeutral',
        'Math.max(...calibratedNeutral) < 0.05',
        'guidedProfile.gains.length',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing guided calibration regression coverage: {needle}')
    if '[KGM-013]' not in backlog or '30-second guided flow produces offset/gain per channel' not in backlog:
        add_error('docs/BACKLOG.md', 'KGM-013 acceptance criteria must stay documented')


def validate_mixer_contracts() -> None:
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    styles = read('assets/minamo.css')
    tests = read('tests/run-tests.mjs')

    for needle in [
        'id="rngGain" min="0" max="2"',
        'id="rngDeadzone" min="0" max="0.2"',
        'id="btnMuteChannel"',
    ]:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing mixer control contract: {needle}')
    for needle in [
        'gainFromMeterX',
        'startMeterInteraction',
        'moveMeterInteraction',
        'longPressTimer',
        'toggleSelectedChannelMute',
        "meters.addEventListener('contextmenu'",
        "ctx.globalAlpha = muted ? 0.25",
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing interactive mixer contract: {needle}')
    if 'touch-action: none' not in styles:
        add_error('assets/minamo.css', 'meter canvas must disable touch panning for drag/long-press controls')
    if 'profile.muted[CHANNEL_INDEX.jawOpen] = true' not in tests:
        add_error('tests/run-tests.mjs', 'calibration profile tests must cover muted channel output')


def validate_quality_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')

    for needle in [
        'export class LandmarkConfidenceTracker',
        'export function estimateLandmarkConfidence',
        'meanLuma',
        'low light',
        "state: score >= 0.72 ? 'good' : score >= 0.45 ? 'degraded' : 'poor'",
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing quality scoring contract: {needle}')
    for needle in [
        'qualityChip',
        'sampleLuma()',
        'estimateLandmarkConfidence(selectedLandmarks)',
        'configureCameraQualityControls',
        'nudgeBrightnessForLowLight',
        'exposureMode',
        'brightness',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker quality contract: {needle}')
    for needle in ['id="qualityChip"', 'checkExposure', 'lighting checklist']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing quality UI contract: {needle}')
    for needle in [
        'normal indoor',
        "assert.notEqual(result.state, 'poor'",
        'estimateLandmarkConfidence(stableFace) > 0.9',
        'new LandmarkConfidenceTracker',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing quality regression coverage: {needle}')


def validate_gaze_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')

    for needle in [
        'GAZE_CALIBRATION_STEPS',
        'estimateIrisGaze',
        'applyGazeToWeights',
        'resolveGaze',
        'buildGazeCalibrationProfile',
        'gazeAngularErrorDegrees',
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing iris gaze runtime contract: {needle}')
    for needle in [
        'resolveGaze(state.raw, selectedLandmarks',
        'applyGazeToWeights(state.raw, gaze)',
        'sampleGazeCalibration(selectedLandmarks)',
        'startGazeCalibration',
        'tickGazeCalibration();',
        'buildGazeCalibrationProfile',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker gaze contract: {needle}')
    for needle in ['btnStartGazeCalibration', 'gazeCalibrationGuide', 'gazeCalibrationProgress']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing gaze calibration UI: {needle}')
    for needle in [
        'syntheticIrisLandmarks',
        'iris gaze overrides blink-cross-talk eyeLook weights',
        "fallback.source, 'blendshape'",
        'gazeAngularErrorDegrees(calibratedRight',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing iris gaze regression coverage: {needle}')


def validate_head_position_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    viewer = read('viewer/viewer.js')
    tests = read('tests/run-tests.mjs')

    for needle in [
        'headLeanRangeCm: 8',
        'export class HeadPositionStabilizer',
        'normalizeHeadLeanRangeCm',
        'recenterHalfLifeMs = 20_000',
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing head position runtime contract: {needle}')
    for needle in [
        'rngHeadLean',
        'state.headPositionStabilizer.stabilize(pos',
        'settings.headLeanRangeCm',
        'state.headPositionStabilizer.reset()',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker head position contract: {needle}')
    if 'id="rngHeadLean" min="0" max="20"' not in tracker_html:
        add_error('tracker/index.html', 'head lean range control must expose 0-20 cm range')
    for needle in [
        'target.pos',
        'current.pos.lerp(target.pos',
        'avatarLeanOffset',
        'vrm.scene.position.set(lean.x + primarySlotX, lean.y, lean.z)',
        'model.scene.position.set(lean.x + runtime.slotX, lean.y, lean.z)',
    ]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing viewer head lean contract: {needle}')
    for needle in [
        'new HeadPositionStabilizer',
        'one-hour slow drift',
        'normalizeHeadLeanRangeCm(25), 20',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing head position regression coverage: {needle}')


def validate_blink_wink_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tests = read('tests/run-tests.mjs')

    for needle in [
        'export class BlinkWinkStabilizer',
        'openThreshold = 0.38',
        'closeThreshold = 0.62',
        'winkFrames = 3',
        'hysteresisClosed',
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing blink/wink runtime contract: {needle}')
    for needle in [
        'blinkWinkStabilizer: new BlinkWinkStabilizer()',
        'state.blinkWinkStabilizer.filter(state.raw)',
        'state.blinkWinkStabilizer.reset()',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing blink/wink tracker contract: {needle}')
    for needle in [
        'deliberate wink hit rate',
        'symmetric[CHANNEL_INDEX.eyeBlinkLeft]',
        'half-closed eye positions do not flicker',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing blink/wink regression coverage: {needle}')


def validate_filter_tuning_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')

    for needle in ['responsive', 'balanced', 'smooth', 'estimateOneEuroLagMs', 'rollingJitterMs']:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing filter tuning runtime contract: {needle}')
    for needle in [
        'selFilterPreset',
        'rngMinCutoff',
        'rngBeta',
        'applyFilterControls',
        'resetFilters()',
        'statFilterLag',
        'statJitter',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker filter tuning contract: {needle}')
    for needle in ['id="selFilterPreset"', 'id="rngMinCutoff"', 'id="rngBeta"', 'id="statFilterLag"', 'id="statJitter"']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing filter tuning UI contract: {needle}')
    for needle in ['estimateOneEuroLagMs(2.4) < estimateOneEuroLagMs(0.9)', 'rollingJitterMs']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing filter tuning regression coverage: {needle}')


def validate_tracking_loss_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tests = read('tests/run-tests.mjs')

    for needle in [
        'export class TrackingLossSmoother',
        'fadeMs = 400',
        'reacquireMs = 250',
        "phase: 'lost'",
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing tracking loss runtime contract: {needle}')
    for needle in [
        'trackingLossSmoother: new TrackingLossSmoother()',
        'state.trackingLossSmoother.update(false',
        'resetFilters({ resetTrackingLoss: false })',
        'shouldSendFace = lossState.active',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracking loss tracker contract: {needle}')
    for needle in [
        'new TrackingLossSmoother({ fadeMs: 400, reacquireMs: 250 })',
        're-entry starts near neutral',
        'firstReentry.reacquired, true',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing tracking loss regression coverage: {needle}')


def validate_face_selection_contracts() -> None:
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')

    for needle in ['selectTrackedFace', 'defaultFaceLockRegion', 'intersectionOverUnion', 'boxCenterInside']:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing face selection runtime contract: {needle}')
    for needle in [
        'numFaces: 4',
        'trackedFaceBox',
        'selectTrackedFace(faceRes.faceLandmarks || []',
        'faceRes.faceBlendshapes[faceIndex]',
        'faceRes.facialTransformationMatrixes',
        'drawOverlay(faceRes, poseRes, handRes, faceIndex)',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker face selection contract: {needle}')
    if 'id="chkFaceLock"' not in tracker_html:
        add_error('tracker/index.html', 'face lock checkbox must exist and persist through tracker settings')
    for needle in [
        'sticky overlap beats larger passer-by face',
        'largest face is fallback',
        'face lock region beats larger outside face',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing face selection regression coverage: {needle}')


def validate_body_hand_contracts() -> None:
    runtime = read('shared/runtime.js')
    codec = read('shared/codec.js')
    protocol = read('docs/PROTOCOL.md')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    diagnostic_html = read('diagnostics/no-broken-finger.html')
    diagnostic_js = read('diagnostics/no-broken-finger.js')
    report = read('docs/benchmarks/hand-stability-report.md')
    vite = read('vite.config.ts')
    tests = read('tests/run-tests.mjs')
    core_tests = read('tests/core.test.ts')
    adapter_tests = read('tests/adapters.test.ts')
    vrm_mapper = read('src/adapters/vrm_mapper.ts')

    for needle in [
        'HAND_INFERENCE_INTERVAL_MS',
        'HAND_CALIBRATION_TOTAL_MS',
        'createHandCalibrationSession',
        'collectHandCalibrationSample',
        'buildHandCalibrationProfile',
        'applyHandCalibrationProfile',
        'classifyHandGesture',
        'export class HandTargetStabilizer',
    ]:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing hand runtime contract: {needle}')
    for needle in [
        'export const HAND_TARGET_BYTES = 16',
        'flags + handedness + confidence + curls + spreads + wrist xyz',
        'wrist = new Float32Array(3)',
    ]:
        if needle not in codec:
            add_error('shared/codec.js', f'missing 16-byte hand codec contract: {needle}')
    if 'HANDS block (1 + 16 bytes/hand' not in protocol or 'FACE + HANDS x2 | 109' not in protocol:
        add_error('docs/PROTOCOL.md', 'protocol must document the 16-byte hand target and updated bandwidth')
    for needle in [
        'HAND_INFERENCE_INTERVAL_MS',
        'state.handLandmarker.detectForVideo(video, nowMs)',
        'applyHandCalibrationProfile(rawHandTargets, handProfile)',
        'state.handTargetStabilizer.update',
        'HAND_FAST_MOTION_BLUR',
        'HAND_LOW_LIGHT',
        'HAND_OUTSIDE_FRAME',
        'drawHandDebug',
        'settings.bodyMode ===',
    ]:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker hand/body contract: {needle}')
    for needle in [
        'id="btnStartHandCalibration"',
        'id="handCalibrationGuide"',
        'id="handDebug"',
        'id="selBodyMode"',
    ]:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing hand/body UI contract: {needle}')
    for needle in [
        'chkArmSolver',
        'applyVrmUpperBodyPose',
        'applyArmChain',
        'smoothstep',
        'curlScale = j === 0 ? 1.0 : j === 1 ? 0.85 : 0.7',
        'hand.wrist',
    ]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing viewer arm/finger contract: {needle}')
    if 'id="chkArmSolver"' not in viewer_html:
        add_error('viewer/index.html', 'viewer must expose an arm-solver fallback toggle')
    if 'proximal: curl' not in vrm_mapper or 'intermediate: curl * 0.85' not in vrm_mapper or 'distal: curl * 0.7' not in vrm_mapper:
        add_error('src/adapters/vrm_mapper.ts', 'VRM finger mapper must use proximal/intermediate/distal coupling curves')
    for needle in [
        'HAND_TARGET_BYTES, 16',
        'HAND_CALIBRATION_TOTAL_MS, 10_000',
        'HAND_CURL_CLAMPED',
        'short hand absence sets recovery flag',
        'long hand absence omits hand block',
        'tests/fixtures/hand-golden-clip.json',
        'golden clip curl step clamped',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing hand runtime regression coverage: {needle}')
    for needle in ['classifies finger count and drum grip gesture states', 'classifyHandGesture']:
        if needle not in core_tests:
            add_error('tests/core.test.ts', f'missing hand core gesture coverage: {needle}')
    if 'index?.proximal' not in adapter_tests:
        add_error('tests/adapters.test.ts', 'adapter tests must cover VRM finger coupling order')
    if "handStability: page('diagnostics/no-broken-finger.html')" not in vite:
        add_error('vite.config.ts', 'Vite build must include the no-broken-finger diagnostic page')
    for needle in ['No-broken-finger visual test', 'fingerCanvas', 'no-broken-finger.js']:
        if needle not in diagnostic_html:
            add_error('diagnostics/no-broken-finger.html', f'missing diagnostic page contract: {needle}')
    for needle in ['HandTargetStabilizer', 'handTargetDebugRows', 'HAND_CURL_CLAMPED', 'maxStep']:
        if needle not in diagnostic_js:
            add_error('diagnostics/no-broken-finger.js', f'missing diagnostic runtime contract: {needle}')
    for needle in ['tests/fixtures/hand-golden-clip.json', 'diagnostics/no-broken-finger.html', 'Stabilized per-frame curl step <= 0.24']:
        if needle not in report:
            add_error('docs/benchmarks/hand-stability-report.md', f'missing hand benchmark report evidence: {needle}')


def validate_protocol_v2_contracts() -> None:
    kgm1b = read('shared/kgm1b.js')
    kgm2 = read('shared/kgm2.js')
    tests = read('tests/run-tests.mjs')
    rust = read('crates/kgm1-codec/src/lib.rs')
    py = read('packages/kgm1-codec-py/kgm1_codec/__init__.py')
    py_cli = read('packages/kgm1-codec-py/kgm1_codec/__main__.py')
    script = read('scripts/kgm1b_codec.py')
    protocol = read('docs/PROTOCOL_V2_DRAFT.md')
    design = read('docs/design/DD-006-kgm2.md')
    reference_doc = read('docs/transport/kgm2-reference-codecs.md')
    backlog = read('docs/BACKLOG.md')
    cargo = read('Cargo.toml')

    for needle in [
        'export const KGM1B_HEADER_BYTES = 40',
        'encodeKgm1bPacket',
        'decodeKgm1bPacket',
        'payloadLen: dv.getUint32(36, true)',
    ]:
        if needle not in kgm1b:
            add_error('shared/kgm1b.js', f'missing KGM1B contract: {needle}')
    for needle in [
        'export function packSmallestThreeQuat',
        'export function unpackSmallestThreeQuat',
        'export class Kgm2FaceEncoder',
        'export class Kgm2FaceDecoder',
        'KGM2_FACE_MASK_BYTES = 7',
        'return null;',
        'ClockOffsetEstimator',
        'MultiSourceClockSync',
        'completeClockSyncProbe',
    ]:
        if needle not in kgm2:
            add_error('shared/kgm2.js', f'missing KGM2 contract: {needle}')
    for needle in [
        '1_000_000',
        'smallest-three quaternion max angular error',
        'medianUsPerQuat < 1',
        'KGM2 delta/keyframe average reduction',
        'delta with missing base keyframe is rejected',
        'idle-face delta frame',
        '10% random loss plus a keyframe loss recovers at the next keyframe',
        'two sources align below visible phase offset',
        'ws/wt source alignment stays inside 10 ms target',
        'python3\', [\'-m\', \'kgm1_codec\'',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing protocol v2 regression coverage: {needle}')
    for needle in [
        'pub struct Kgm1Packet',
        'payload truncated',
        'decodes_js_golden_header_vector',
        'round_trips_packet_payload',
    ]:
        if needle not in rust:
            add_error('crates/kgm1-codec/src/lib.rs', f'missing Rust reference codec contract: {needle}')
    for needle in [
        "HEADER_STRUCT = struct.Struct('<4sHHQQQHBBI')",
        'def decode_packet',
        'def encode_packet',
        'def header_json',
    ]:
        if needle not in py:
            add_error('packages/kgm1-codec-py/kgm1_codec/__init__.py', f'missing Python reference codec contract: {needle}')
    if 'decode-header' not in py_cli or 'decode-packet' not in py_cli:
        add_error('packages/kgm1-codec-py/kgm1_codec/__main__.py', 'Python codec CLI must decode headers and packets')
    if 'kgm1_codec.__main__ import main' not in script:
        add_error('scripts/kgm1b_codec.py', 'script wrapper must use the Python package implementation')
    if 'members = ["crates/kgm1-codec"]' not in cargo or 'exclude = ["relay-rs", "src-tauri"]' not in cargo:
        add_error('Cargo.toml', 'root Cargo workspace must register only the KGM1 reference crate and exclude app crates')
    for needle in [
        'KGM2 compact face profile',
        'smallest-three quaternion',
        'channel mask',
        'rejects a delta if the referenced base keyframe has not been seen',
    ]:
        if needle not in protocol:
            add_error('docs/PROTOCOL_V2_DRAFT.md', f'missing KGM2 protocol documentation: {needle}')
    if 'Status: reference implementation' not in design or 'tests/run-tests.mjs' not in design:
        add_error('docs/design/DD-006-kgm2.md', 'KGM2 design doc must point to the reference implementation and tests')
    for needle in [
        'crates/kgm1-codec',
        'packages/kgm1-codec-py',
        '4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000',
        'idle-face delta frames are 26 bytes',
    ]:
        if needle not in reference_doc:
            add_error('docs/transport/kgm2-reference-codecs.md', f'missing reference codec evidence: {needle}')
    for kgm in ['KGM-027', 'KGM-028', 'KGM-029', 'KGM-031']:
        entry = backlog.split(f'### [{kgm}]', 1)[1].split('\n### ', 1)[0]
        if '- [ ]' in entry:
            add_error('docs/BACKLOG.md', f'{kgm} acceptance criteria must remain checked after protocol implementation')
    kgm030 = backlog.split('### [KGM-030]', 1)[1].split('\n### ', 1)[0]
    if '- [ ]' in kgm030:
        add_error('docs/BACKLOG.md', 'KGM-030 acceptance criteria must remain checked after clock sync implementation')


def validate_e2ee_contracts() -> None:
    e2ee = read('shared/e2ee.js')
    tests = read('tests/run-tests.mjs')
    docs = read('docs/security/e2ee.md')
    backlog = read('docs/BACKLOG.md')

    for needle in [
        'E2EE_OVERHEAD_BYTES',
        'deriveRoomKey',
        'encryptFrame',
        'decryptFrame',
        'ciphertextLooksOpaque',
        'wrong room key or corrupted frame',
        'TAG_BYTES = 16',
        'NONCE_SUFFIX_BYTES = 8',
    ]:
        if needle not in e2ee:
            add_error('shared/e2ee.js', f'missing E2EE contract: {needle}')
    for needle in [
        'E2EE_OVERHEAD_BYTES, 24',
        'relay ciphertext test asserts',
        'wrong-key subscriber gets a clear decrypt error',
        'ciphertextLooksOpaque',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing E2EE regression coverage: {needle}')
    for needle in [
        'exactly 24 bytes',
        'wrong room key or corrupted frame',
        'WebCrypto AES-GCM',
        'relay sees only opaque bytes',
    ]:
        if needle not in docs:
            add_error('docs/security/e2ee.md', f'missing E2EE documentation: {needle}')
    entry = backlog.split('### [KGM-037]', 1)[1].split('\n### ', 1)[0]
    if '- [ ]' in entry:
        add_error('docs/BACKLOG.md', 'KGM-037 acceptance criteria must remain checked after E2EE implementation')


def validate_avatar_mapping_contracts() -> None:
    vrm = read('src/adapters/vrm_mapper.ts')
    live2d = read('src/adapters/live2d_mapper.ts')
    inochi = read('src/adapters/inochi2d_mapper.ts')
    profile = read('src/adapters/avatar_profile.ts')
    tests = read('tests/adapters.test.ts')
    schema = read('docs/product/avatar-preset-profile.schema.json')
    integrations = read('docs/integrations/avatar-integrations.md')
    diagnostic_html = read('diagnostics/avatar-mapping.html')
    diagnostic_js = read('diagnostics/avatar-mapping.js')
    vite = read('vite.config.ts')

    for needle in ['mapKGM1ToVrmExpressions', 'mapKGM1ToVrmLookAt', 'mapKGM1HandsToVrmFingers', 'clampSigned']:
        if needle not in vrm:
            add_error('src/adapters/vrm_mapper.ts', f'missing VRM mapper contract: {needle}')
    for needle in ['mapKGM1ToLive2D', 'mapKGM1HandsToLive2D', 'clamp01', 'clampSigned']:
        if needle not in live2d:
            add_error('src/adapters/live2d_mapper.ts', f'missing Live2D mapper contract: {needle}')
    for needle in ['mapKGM1ToInochi2D', 'mouth_pucker', 'clamp01', 'clampSigned']:
        if needle not in inochi:
            add_error('src/adapters/inochi2d_mapper.ts', f'missing Inochi2D mapper contract: {needle}')
    for needle in [
        'minamo.avatar-preset.v1',
        'createAvatarPresetProfile',
        'mapFrameWithAvatarPreset',
        'serializeAvatarPreset',
        'parseAvatarPreset',
        'applyRigLimit',
        'applyMappingCurve',
    ]:
        if needle not in profile:
            add_error('src/adapters/avatar_profile.ts', f'missing avatar preset profile contract: {needle}')
    for needle in [
        'maps VRM expressions, look-at, and fingers',
        'maps Live2D and Inochi2D parameters',
        'round-trips avatar preset profile JSON and enforces rig limits',
        'ParamCustomSmile',
        'toBeLessThanOrEqual(1)',
        'toBeGreaterThanOrEqual(-1)',
        'toMatchInlineSnapshot',
    ]:
        if needle not in tests:
            add_error('tests/adapters.test.ts', f'missing avatar mapper regression coverage: {needle}')
    for needle in ['avatar mapping diagnostics', 'vrmExpressions', 'presetProfile', 'limitYawMin', 'live2d', 'inochi2d']:
        if needle not in diagnostic_html:
            add_error('diagnostics/avatar-mapping.html', f'missing avatar mapping debug UI: {needle}')
    for needle in ['mapKGM1ToVrmExpressions', 'mapKGM1ToLive2D', 'mapKGM1ToInochi2D', 'solveHandState', 'createAvatarPresetProfile', 'mapFrameWithAvatarPreset']:
        if needle not in diagnostic_js:
            add_error('diagnostics/avatar-mapping.js', f'missing avatar mapping debug script contract: {needle}')
    for needle in ['minamo.avatar-preset.v1', 'rigLimits', 'mappings', 'linear', 'ease']:
        if needle not in schema:
            add_error('docs/product/avatar-preset-profile.schema.json', f'missing avatar preset schema contract: {needle}')
    for needle in ['avatar-preset-profile.schema.json', 'lookAt:yaw', 'finger:Right:index:proximal', 'ParamCustomSmile']:
        if needle not in integrations:
            add_error('docs/integrations/avatar-integrations.md', f'missing avatar integration documentation: {needle}')
    if "avatarMapping: page('diagnostics/avatar-mapping.html')" not in vite:
        add_error('vite.config.ts', 'Vite build must include the avatar mapping diagnostic page')


def validate_obs_viewer_contracts() -> None:
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    obs_doc = read('docs/product/obs-setup.md')
    readme = read('README.md')

    for needle in [
        "query.get('preset') === 'obs'",
        "query.get('bg') === 'transparent'",
        "params.get('hud') === '0'",
        "params.get('camera') === 'locked'",
        'floor.visible = !settings.transparent',
        'transport.connectAuto({',
    ]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing OBS viewer contract: {needle}')
    if 'body.hud-hidden .hud { display: none; }' not in viewer_html:
        add_error('viewer/index.html', 'viewer must fully hide HUD for OBS hud=0 URLs')
    for needle in [
        'viewer/?preset=obs&room=<room>&bg=transparent&hud=0&camera=locked',
        'Width: 1920',
        'Height: 1080',
        'background-color: rgba(0, 0, 0, 0)',
        '`bg=transparent` makes the renderer clear to alpha and hides the floor',
    ]:
        if needle not in obs_doc:
            add_error('docs/product/obs-setup.md', f'missing OBS setup documentation: {needle}')
    for needle in [
        'OBS Browser Source',
        'viewer/?preset=obs&room=stage&bg=transparent&hud=0&camera=locked',
        'width 1920',
        'height 1080',
    ]:
        if needle not in readme:
            add_error('README.md', f'missing README OBS setup detail: {needle}')


def validate_scene_preset_contracts() -> None:
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    runtime = read('shared/runtime.js')
    obs_doc = read('docs/product/obs-setup.md')
    readme = read('README.md')

    for needle in ['scenePreset', 'backgroundColor', 'bloom', 'vignette']:
        if needle not in runtime:
            add_error('shared/runtime.js', f'missing persisted viewer scene setting: {needle}')
    for needle in [
        'SCENE_PRESETS',
        'soft key',
        'anime rim',
        'flat',
        'EffectComposer',
        'UnrealBloomPass',
        'applySceneState',
        'applyScenePresetDefaults',
        'serializeViewerSceneUrl',
        "query.get('scene')",
        "query.get('bgColor')",
        "query.get('bloom')",
        "query.get('vignette')",
    ]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing scene preset runtime contract: {needle}')
    for needle in ['selScenePreset', 'inpBgColor', 'chkBloom', 'chkVignette', 'btnCopySceneUrl', 'sceneVignette']:
        if needle not in viewer_html:
            add_error('viewer/index.html', f'missing scene preset UI contract: {needle}')
    for needle in ['scene=soft', 'scene=anime', 'scene=flat', 'bgColor=%23rrggbb', 'bloom=0|1', 'vignette=0|1', 'Copy URL']:
        if needle not in obs_doc:
            add_error('docs/product/obs-setup.md', f'missing scene preset documentation: {needle}')
    for needle in ['scene=soft|anime|flat', 'bgColor=%23rrggbb', 'bloom=0|1', 'vignette=0|1']:
        if needle not in readme:
            add_error('README.md', f'missing README scene preset URL detail: {needle}')


def validate_perfect_sync_mapping_contracts() -> None:
    mapping = read('shared/expression-mapping.js')
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    schema = read('docs/product/expression-mapping.schema.json')
    tests = read('tests/run-tests.mjs')
    dd = read('docs/design/DD-008-calibration-retargeting.md')
    integrations = read('docs/integrations/avatar-integrations.md')

    for needle in [
        'EXPRESSION_MAPPING_SCHEMA',
        'PERFECT_SYNC_MIN_MATCHES = 45',
        'detectPerfectSyncExpressions',
        'createPerfectSyncExpressionMap',
        'createDefaultVrmExpressionMap',
        'parseExpressionMap',
        'serializeExpressionMap',
        'evaluateExpressionMap',
        'applyExpressionCurve',
    ]:
        if needle not in mapping:
            add_error('shared/expression-mapping.js', f'missing expression mapping contract: {needle}')
    for needle in [
        'configureExpressionMapping',
        'listVrmExpressionNames',
        'perfectSyncState.active',
        'applyVrmExpressionMap',
        'queueExpressionMapApply',
        'exportExpressionMap',
        'parseExpressionMap(await file.text())',
    ]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing Perfect Sync viewer contract: {needle}')
    for needle in ['mapping-editor', 'statMapping', 'txtExpressionMap', 'btnApplyMapping', 'btnImportMapping', 'btnExportMapping', 'btnResetMapping', 'fileExpressionMap']:
        if needle not in viewer_html:
            add_error('viewer/index.html', f'missing mapping editor UI contract: {needle}')
    for needle in ['minamo.expression-map.v1', 'targets', 'expr', 'easeIn', 'easeOut']:
        if needle not in schema:
            add_error('docs/product/expression-mapping.schema.json', f'missing expression mapping schema contract: {needle}')
    for needle in [
        'detectPerfectSyncExpressions(perfectNames)',
        'createPerfectSyncExpressionMap(perfectNames)',
        'parseExpressionMap(serializeExpressionMap(fallbackMap))',
        'evaluateExpressionMap(roundTripped, weights)',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing expression mapping regression coverage: {needle}')
    for needle in ['minamo.expression-map.v1', 'expression-mapping.schema.json', '>= 45 of the ARKit names']:
        if needle not in dd:
            add_error('docs/design/DD-008-calibration-retargeting.md', f'missing retargeting documentation: {needle}')
    for needle in ['minamo.expression-map.v1', 'Perfect Sync VRMs are auto-detected', 'edited live and exported as JSON']:
        if needle not in integrations:
            add_error('docs/integrations/avatar-integrations.md', f'missing integration Perfect Sync documentation: {needle}')


def validate_layered_avatar_contracts() -> None:
    package = json.loads(read('package.json'))
    layered = read('shared/layered-avatar.js')
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    schema = read('docs/product/layered-avatar.schema.json')
    docs = read('docs/product/layered-avatar.md')
    tests = read('tests/run-tests.mjs')
    integrations = read('docs/integrations/avatar-integrations.md')

    if 'ag-psd' not in package.get('dependencies', {}):
        add_error('package.json', 'layered PSD import must depend on ag-psd')
    for needle in [
        'LAYERED_AVATAR_SCHEMA',
        'classifyLayerName',
        'createLayeredAvatarManifest',
        'layeredAvatarStateFromWeights',
        'layerTransformForDepth',
        'normalizeLayerDepth',
    ]:
        if needle not in layered:
            add_error('shared/layered-avatar.js', f'missing layered avatar helper contract: {needle}')
    for needle in [
        "await import('ag-psd')",
        'loadLayeredPsdFile',
        'loadLayeredPngFiles',
        'collectPsdLayers',
        'applyLayeredAvatar',
        'layerVisible',
        'rngLayerParallax',
        'fileLayeredAvatar',
    ]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing layered avatar viewer contract: {needle}')
    for needle in ['layeredAvatar', 'btnLoadLayered', 'fileLayeredAvatar', 'rngLayerParallax', 'drop .vrm, .glb, .psd, .png set, or .jsonl']:
        if needle not in viewer_html:
            add_error('viewer/index.html', f'missing layered avatar UI contract: {needle}')
    avatar_loader = read('viewer/avatar-loader.js')
    for needle in ['KTX2Loader', 'detectSupport(renderer)', 'setKTX2Loader', 'MeshoptDecoder', 'setMeshoptDecoder', 'DRACOLoader', 'setDRACOLoader']:
        if needle not in avatar_loader:
            add_error('viewer/avatar-loader.js', f'compressed avatar decoder wiring missing {needle}')
    for needle in ['minamo.layered-avatar.v1', 'parallaxPx', 'eyesClosed', 'mouthOpen', 'depth']:
        if needle not in schema:
            add_error('docs/product/layered-avatar.schema.json', f'missing layered avatar schema contract: {needle}')
    for needle in ['PSD', 'PNG', 'eyes closed', 'mouth open', 'parallax control', 'layered-avatar.schema.json']:
        if needle not in docs:
            add_error('docs/product/layered-avatar.md', f'missing layered avatar documentation: {needle}')
    for needle in ['classifyLayerName', 'createLayeredAvatarManifest', 'layeredAvatarStateFromWeights', 'layerTransformForDepth']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing layered avatar regression coverage: {needle}')
    for needle in ['Layered PNG / PSD', 'layered-avatar.md', 'eyesOpen', 'mouthClosed']:
        if needle not in integrations:
            add_error('docs/integrations/avatar-integrations.md', f'missing layered avatar integration docs: {needle}')


def validate_transport_contracts() -> None:
    transport = read('shared/transport.js')
    tests = read('tests/run-tests.mjs')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    transport_doc = read('docs/transport/webtransport-realtime.md')
    moq_doc = read('docs/transport/moq-evaluation.md')
    relay_rs = read('relay-rs/src/main.rs')
    dashboard = read('relay-rs/grafana-dashboard.json')
    cluster_harness = read('services/erlang-router/load-test.mjs')
    cluster_readme = read('services/erlang-router/README.md')
    cluster_design = read('docs/design/DD-005-elixir-relay-cluster.md')

    for needle in [
        'TRANSPORT_FALLBACKS',
        'connectAuto',
        'DEFAULT_CONNECT_TIMEOUT_MS = 3000',
        'ws-json',
        'WS_BACKPRESSURE_LIMIT_BYTES',
        'NewestOnlyMailbox',
        'computeTransportLatencyMs',
        'classifyCongestion',
        'transportSecurityNote',
        '_wtNewestDatagram',
    ]:
        if needle not in transport:
            add_error('shared/transport.js', f'missing transport contract: {needle}')
    for needle in [
        "transportFallbackPlan('local'",
        "transportFallbackPlan('wt'",
        'WebSocket JSON fallback is explicit',
        'computeTransportLatencyMs(1000, 1042)',
        'classifyCongestion',
        'slow subscriber remains at most one frame behind',
        'packet drop simulation replaces stale frames',
        'motion frames only',
    ]:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing transport regression coverage: {needle}')
    for needle in ['connectAuto', 'getStats()', 'statTransportMode', 'statLatency', 'statTransportDrop']:
        if needle not in tracker and needle not in tracker_html:
            add_error('tracker/tracker.js', f'missing tracker transport UI contract: {needle}')
    for needle in ['connectAuto', 'getStats()', 'statTransportMode', 'statLatency']:
        if needle not in viewer and needle not in viewer_html:
            add_error('viewer/viewer.js', f'missing viewer transport UI contract: {needle}')
    for needle in [
        'WebSocket JSON',
        'connectAuto()',
        '3 seconds',
        'NewestOnlyMailbox',
        '127.0.0.1:9487/metrics',
        'grafana-dashboard.json',
        'latency metric',
        'MINAMO_ALLOWED_ORIGINS',
        'transportSecurityNote()',
    ]:
        if needle not in transport_doc:
            add_error('docs/transport/webtransport-realtime.md', f'missing transport documentation: {needle}')
    kgm036 = read('docs/BACKLOG.md').split('### [KGM-036]', 1)[1].split('\n### ', 1)[0]
    if '- [ ]' in kgm036:
        add_error('docs/BACKLOG.md', 'KGM-036 acceptance criteria must remain checked after auto-fallback implementation')
    for needle in [
        'metrics_server',
        'render_metrics',
        'log_event',
        'drain_newest',
        'MINAMO_METRICS_ADDR',
        'frames_dropped_newest_only_total',
        'metrics_render_prometheus_counters',
        'newest_only_drain_keeps_latest_frame',
    ]:
        if needle not in relay_rs:
            add_error('relay-rs/src/main.rs', f'missing relay observability/newest-only contract: {needle}')
    for needle in [
        'minamo_relay_active_sessions',
        'minamo_relay_frames_in_total',
        'minamo_relay_frames_out_total',
        'minamo_relay_frames_dropped_newest_only_total',
        'minamo_relay_auth_failures_total',
    ]:
        if needle not in dashboard:
            add_error('relay-rs/grafana-dashboard.json', f'missing Grafana metric: {needle}')
    backlog = read('docs/BACKLOG.md')
    for kgm in ['KGM-033', 'KGM-034']:
        entry = backlog.split(f'### [{kgm}]', 1)[1].split('\n### ', 1)[0]
        if '- [ ]' in entry:
            add_error('docs/BACKLOG.md', f'{kgm} acceptance criteria must remain checked after relay implementation')
    for needle in [
        'SUBSCRIBERS = 5000',
        'NODES = 3',
        'P99_TARGET_MS = 30',
        'localOnlyDrop',
        'runClusterLoadTest',
    ]:
        if needle not in cluster_harness:
            add_error('services/erlang-router/load-test.mjs', f'missing cluster harness contract: {needle}')
    for needle in ['5,000 subscribers', 'p99', 'localOnlyDrop', 'node-loss isolation']:
        if needle not in cluster_readme and needle not in cluster_design:
            add_error('services/erlang-router/README.md', f'missing cluster harness documentation: {needle}')
    kgm032 = backlog.split('### [KGM-032]', 1)[1].split('\n### ', 1)[0]
    if '- [ ]' in kgm032:
        add_error('docs/BACKLOG.md', 'KGM-032 acceptance criteria must remain checked after cluster harness implementation')
    for needle in [
        'Mapping Design',
        'Latency Findings',
        'Decision: no-go',
        'motion.delta',
        'motion.keyframe',
        'draft-ietf-moq-transport-18',
    ]:
        if needle not in moq_doc:
            add_error('docs/transport/moq-evaluation.md', f'missing MoQ evaluation section: {needle}')
    kgm035 = backlog.split('### [KGM-035]', 1)[1].split('\n### ', 1)[0]
    if '- [ ]' in kgm035:
        add_error('docs/BACKLOG.md', 'KGM-035 acceptance criteria must remain checked after MoQ evaluation')


def validate_desktop_contracts() -> None:
    package = json.loads(read('package.json'))
    ci = read('.github/workflows/ci.yml')
    release_smoke = read('scripts/release-smoke.mjs')
    vite = read('vite.config.ts')
    tauri_config = json.loads(read('src-tauri/tauri.conf.json'))
    tauri_cargo = read('src-tauri/Cargo.toml')
    tauri_lib = read('src-tauri/src/lib.rs')
    desktop_html = read('desktop/index.html')
    desktop_js = read('desktop/desktop.js')
    desktop_doc = read('docs/product/desktop-app.md')

    scripts = package.get('scripts', {})
    for script in ['desktop:dev', 'desktop:build', 'desktop:check']:
        if script not in scripts:
            add_error('package.json', f'missing desktop package script "{script}"')
    dev_dependencies = package.get('devDependencies', {})
    if '@tauri-apps/cli' not in dev_dependencies:
        add_error('package.json', 'desktop shell must pin @tauri-apps/cli')
    if "desktop: page('desktop/index.html')" not in vite:
        add_error('vite.config.ts', 'Vite build must include the desktop control surface')
    for needle in [
        "['cargo', ['fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--', '--check']]",
        "['cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml']]",
        "['cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml']]",
    ]:
        if needle not in release_smoke:
            add_error('scripts/release-smoke.mjs', 'release smoke must run desktop Tauri checks')
    for needle in [
        'libwebkit2gtk-4.1-dev',
        'cargo check --manifest-path src-tauri/Cargo.toml',
        'cargo test --manifest-path src-tauri/Cargo.toml',
    ]:
        if needle not in ci:
            add_error('.github/workflows/ci.yml', f'CI missing desktop gate: {needle}')

    if tauri_config.get('productName') != 'Minamo Studio':
        add_error('src-tauri/tauri.conf.json', 'Tauri productName must be Minamo Studio')
    if tauri_config.get('build', {}).get('frontendDist') != '../dist':
        add_error('src-tauri/tauri.conf.json', 'Tauri must package the existing Vite dist output')
    app_config = tauri_config.get('app', {})
    if app_config.get('withGlobalTauri') is not True:
        add_error('src-tauri/tauri.conf.json', 'desktop renderer must have Tauri invoke access')
    windows = app_config.get('windows', [])
    if not windows or windows[0].get('url') != 'desktop/index.html':
        add_error('src-tauri/tauri.conf.json', 'main desktop window must open desktop/index.html')
    if 'tauri = { version = "2.11.5"' not in tauri_cargo:
        add_error('src-tauri/Cargo.toml', 'desktop app must pin the checked Tauri 2 version')
    icon_png = ROOT / 'src-tauri' / 'icons' / 'icon.png'
    if icon_png.stat().st_size > 150_000:
        add_error('src-tauri/icons/icon.png', 'desktop app icon must stay lightweight')
    for command in ['desktop_status', 'virtual_camera_status', 'open_tracker', 'open_viewer', 'open_replay']:
        if command not in tauri_lib:
            add_error('src-tauri/src/lib.rs', f'missing Tauri command {command}')
        if command not in desktop_html and command.startswith('open_'):
            add_error('desktop/index.html', f'desktop UI must invoke {command}')
    for route in ['tracker/index.html', 'viewer/index.html', 'replay/index.html']:
        if route not in tauri_lib:
            add_error('src-tauri/src/lib.rs', f'desktop app must expose bundled page route {route}')
    for target in ['v4l2loopback', 'Media Foundation softcam', 'CoreMediaIO camera extension']:
        if target not in tauri_lib or target not in desktop_doc:
            add_error('src-tauri/src/lib.rs', f'missing virtual camera backend target {target}')
    if 'signalCanvas' not in desktop_html or 'drawSignal' not in desktop_js:
        add_error('desktop/index.html', 'desktop shell must include the KGM1 signal monitor canvas')
    if 'Keep issue KGM-050 open' not in desktop_doc:
        add_error('docs/product/desktop-app.md', 'desktop docs must keep KGM-050 open until virtual camera output is proven')


def validate_static_demo_entrypoints() -> None:
    nojekyll = ROOT / '.nojekyll'
    if not nojekyll.is_file():
        add_error('.nojekyll', 'Pages demo requires a .nojekyll file at repository root')

    old_name = ''.join(chr(code) for code in [107, 97, 103, 97, 109, 105])
    old_stylesheet = old_name + '.css'
    old_asset_path = 'assets/' + old_name
    entrypoints = {
        'index.html': './assets/minamo.css',
        'tracker/index.html': '../assets/minamo.css',
        'viewer/index.html': '../assets/minamo.css',
        'replay/index.html': '../assets/minamo.css',
        'roadmap/index.html': '../assets/minamo.css',
    }
    for rel, stylesheet in entrypoints.items():
        path = ROOT / rel
        if not path.exists():
            add_error(rel, 'static demo entrypoint is missing')
            continue
        text = path.read_text(encoding='utf-8')
        if stylesheet not in text:
            add_error(rel, f'static demo entrypoint must load {stylesheet}')
        if old_stylesheet in text or old_asset_path in text:
            add_error(rel, 'static demo entrypoint still references the old stylesheet')

    stale_paths = []
    for path in ROOT.rglob('*'):
        if not path.is_file() or any(part in {'.git', 'node_modules', 'dist'} for part in path.parts):
            continue
        if path.suffix not in {'.html', '.js', '.mjs', '.py', '.md', '.css', '.json', '.yml', '.yaml', '.ts'}:
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        if old_stylesheet in text or old_asset_path in text:
            stale_paths.append(path.relative_to(ROOT))
    for path in stale_paths:
        add_error(path, 'old stylesheet reference must not ship in source')


def validate_replay_validation_ui() -> None:
    html = read('replay/index.html')
    js = read('replay/replay.js')
    for element_id in ['replayValidation', 'replayValidationSummary', 'replayErrors']:
        if f'id="{element_id}"' not in html:
            add_error('replay/index.html', f'missing replay validation element #{element_id}')
    if 'validationErrors.length === 0' not in js or 'playback disabled' not in js:
        add_error('replay/replay.js', 'replay playback must be disabled and explained when validation errors exist')


def validate_kgm_recording_contracts() -> None:
    kgm = read('shared/kgm-recording.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    viewer = read('viewer/viewer.js')
    replay = read('replay/replay.js')
    replay_html = read('replay/index.html')
    tests = read('tests/run-tests.mjs')
    dd = read('docs/design/DD-007-recording.md')

    for needle in ['KGM_RECORDING_MAGIC', 'encodeKgmRecording', 'parseKgmRecording', 'tenMinuteKgmEstimateBytes', 'decodeFrame(frameBytes)']:
        if needle not in kgm:
            add_error('shared/kgm-recording.js', f'missing .kgm recording contract: {needle}')
    for needle in ['encodeKgmRecording(state.recording.frames', 'KGM_RECORDING_MIME', 'btnDownloadJsonl', 'tenMinuteKgmEstimateBytes', 'recordFrame(frame, buf)']:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker .kgm recording contract: {needle}')
    for needle in ['Record .kgm locally', 'Download .kgm', 'btnDownloadJsonl']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing tracker .kgm UI contract: {needle}')
    for needle in ['parseKgmRecording(await file.arrayBuffer())', 'isKgmRecordingFile(file)', "endsWith('.kgm')"]:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing viewer .kgm replay contract: {needle}')
    for needle in ['parseKgmRecording', 'parseReplayFile', "endsWith('.kgm')"]:
        if needle not in replay:
            add_error('replay/replay.js', f'missing replay .kgm parser contract: {needle}')
    if '.kgm,.jsonl,.ndjson' not in replay_html:
        add_error('replay/index.html', 'replay file input must accept .kgm recordings')
    for needle in ['encodeKgmRecording', 'parseKgmRecording', 'kgm1-synthetic.kgm', 'tenMinuteKgmEstimateBytes(60, 76) < 5_000_000']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing .kgm regression coverage: {needle}')
    for needle in ['records both the compact `.kgm` container', 'viewer and replay page can load dropped `.kgm`']:
        if needle not in dd:
            add_error('docs/design/DD-007-recording.md', f'missing .kgm implementation documentation: {needle}')


def validate_vrma_export_contracts() -> None:
    vrma = read('shared/vrma-export.js')
    replay = read('replay/replay.js')
    replay_html = read('replay/index.html')
    tests = read('tests/run-tests.mjs')
    dd = read('docs/design/DD-007-recording.md')

    for needle in ['VRMC_vrm_animation', 'exportVrmaFromFrames', 'parseVrmaGlb', 'humanoid: { humanBones', 'expressions: { preset', "target: { node, path }"]:
        if needle not in vrma:
            add_error('shared/vrma-export.js', f'missing VRMA exporter contract: {needle}')
    for needle in ['headRotations.push', "expressionWeights(frame.frame.face?.weights)[expression]", 'extras: { loop', "path === 'translation'"]:
        if needle not in tests + vrma:
            add_error('shared/vrma-export.js', f'missing VRMA head/expression/loop evidence: {needle}')
    for needle in ['btnExportVrma', 'inpTrimStart', 'inpTrimEnd', 'chkVrmaLoop']:
        if needle not in replay_html:
            add_error('replay/index.html', f'missing VRMA replay export UI: {needle}')
    for needle in ['exportVrmaFromFrames(frames', "downloadBytes(`minamo-motion-${stamp}.vrma`", 'trimStartMs', 'trimEndMs']:
        if needle not in replay:
            add_error('replay/replay.js', f'missing replay VRMA export behavior: {needle}')
    for needle in ['exportVrmaFromFrames(vrmaFrames', 'VRMA exports the head bone mapping', 'VRMA exports preset expression mappings', 'VRMA loop marker is preserved']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing VRMA export regression coverage: {needle}')
    for needle in ['Implemented exporter writes a binary `.vrma` GLB', 'head humanoid bone rotation', 'expression weights are exported']:
        if needle not in dd:
            add_error('docs/design/DD-007-recording.md', f'missing VRMA export implementation documentation: {needle}')


def validate_latency_quality_hud_contracts() -> None:
    hud = read('shared/hud-metrics.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    viewer = read('viewer/viewer.js')
    viewer_html = read('viewer/index.html')
    tests = read('tests/run-tests.mjs')

    for needle in ['computeLossPercent', 'latencyWithinTolerance', 'percentileSample', 'controlledNetemHudCheck']:
        if needle not in hud:
            add_error('shared/hud-metrics.js', f'missing HUD metric helper: {needle}')
    for needle in ['inferSamples', 'statInferP50', 'statInferP95', 'percentileSample(state.inferSamples, 0.95)']:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker inference percentile contract: {needle}')
    for needle in ['statInferP50', 'statInferP95']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing tracker inference percentile HUD: {needle}')
    for needle in ['computeLossPercent(orderGate.lost, orderGate.accepted)', 'statLatency', 'statTransportMode']:
        if needle not in viewer:
            add_error('viewer/viewer.js', f'missing viewer latency/loss HUD contract: {needle}')
    if '<span>loss <b id="statLoss">0.0</b>%</span>' not in viewer_html:
        add_error('viewer/index.html', 'viewer HUD must label packet loss as a percentage')
    for needle in ['controlledNetemHudCheck', 'computeLossPercent(10, 90)', 'latencyWithinTolerance(54, 50, 10)', 'percentileSample([4, 8, 16, 32, 64], 0.95)']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing HUD metric regression coverage: {needle}')


def validate_voice_activity_accent_contracts() -> None:
    voice = read('shared/voice-activity.js')
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')
    dd = read('docs/design/DD-003-audio-lipsync.md')

    for needle in ['voiceActivityLevelFromRms', 'applyVoiceActivityAccents', 'headNodAmount = 0.008', 'level <= 0']:
        if needle not in voice:
            add_error('shared/voice-activity.js', f'missing voice activity helper contract: {needle}')
    if 'voiceAccents: false' not in runtime:
        add_error('shared/runtime.js', 'voice accents must default off')
    for needle in ['startVoiceAccents', 'stopVoiceAccents', 'sampleVoiceRms', 'applyVoiceActivityAccents(lipsync.weights', 'voiceAccent.headNod', 'getUserMedia({\n      audio:']:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker voice accent contract: {needle}')
    for needle in ['chkVoiceAccents', 'statVoiceAccent']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing voice accent UI contract: {needle}')
    for needle in ['voiceActivityLevelFromRms(0.015)', 'applyVoiceActivityAccents(silentWeights, { enabled: true, rms: 0.005 })', 'headNod <= 0.008']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing voice accent regression coverage: {needle}')
    for needle in ['Voice accents are default off', 'silent VAD level returns identity']:
        if needle not in dd:
            add_error('docs/design/DD-003-audio-lipsync.md', f'missing voice accent implementation note: {needle}')


def validate_audio_lipsync_contracts() -> None:
    lipsync = read('shared/audio-lipsync.js')
    worklet = read('tracker/audio-lipsync-worklet.js')
    runtime = read('shared/runtime.js')
    tracker = read('tracker/tracker.js')
    tracker_html = read('tracker/index.html')
    tests = read('tests/run-tests.mjs')
    dd = read('docs/design/DD-003-audio-lipsync.md')

    for needle in ['AUDIO_LIPSYNC_TARGET_LATENCY_MS = 80', 'estimateAudioLipsyncFrame', 'fuseAudioLipsyncWeights', 'audioLipsyncWithinLatency', 'latencyMs > maxLatencyMs']:
        if needle not in lipsync:
            add_error('shared/audio-lipsync.js', f'missing audio lipsync helper contract: {needle}')
    for needle in ['class MinamoAudioLipsyncProcessor extends AudioWorkletProcessor', "registerProcessor('minamo-audio-lipsync'", 'TARGET_POST_INTERVAL_MS = 20', 'this.port.postMessage']:
        if needle not in worklet:
            add_error('tracker/audio-lipsync-worklet.js', f'missing AudioWorklet contract: {needle}')
    if 'audioLipsync: false' not in runtime:
        add_error('shared/runtime.js', 'audio lipsync must default off until the mic is opted in')
    for needle in ['startAudioLipsync', 'attachAudioLipsyncWorklet', "new URL('./audio-lipsync-worklet.js', import.meta.url)", 'fuseAudioLipsyncWeights(state.weights', 'currentAudioLipsyncLatencyMs', 'AUDIO_LIPSYNC_TARGET_LATENCY_MS']:
        if needle not in tracker:
            add_error('tracker/tracker.js', f'missing tracker audio lipsync contract: {needle}')
    for needle in ['chkAudioLipsync', 'statAudioLipsync', 'Audio lipsync']:
        if needle not in tracker_html:
            add_error('tracker/index.html', f'missing audio lipsync UI contract: {needle}')
    for needle in ['estimateAudioLipsyncFrame({ rms: 0.12', 'speaking with a still face produces plausible mouth motion', 'AUDIO_LIPSYNC_TARGET_LATENCY_MS + 1', 'audioLipsyncWithinLatency(79)']:
        if needle not in tests:
            add_error('tests/run-tests.mjs', f'missing audio lipsync regression coverage: {needle}')
    for needle in ['Audio lipsync implementation', 'AudioWorklet posts viseme frames every 20 ms', 'no cloud ASR']:
        if needle not in dd:
            add_error('docs/design/DD-003-audio-lipsync.md', f'missing audio lipsync implementation documentation: {needle}')


def validate_runtime_warning_taxonomy() -> None:
    runtime = read('shared/runtime.js')
    required_codes = [
        'INSECURE_CONTEXT',
        'NO_CAMERA_API',
        'CAMERA_PERMISSION_DENIED',
        'NO_CAMERA_DEVICE',
        'NO_WEBGL2',
        'NO_WEBTRANSPORT',
        'LOW_LIGHT',
        'MOTION_BLUR',
        'DROPPED_FRAMES',
        'OCCLUSION',
        'TEMPORAL_OUTLIER',
        'NON_FINITE_SIGNAL',
        'SIGNAL_CLAMPED',
    ]
    for code in required_codes:
        if f"'{code}'" not in runtime and f'"{code}"' not in runtime:
            add_error('shared/runtime.js', f'WARNING_TAXONOMY missing public code {code}')


def validate_compression_docs() -> None:
    focused_docs = [
        'docs/compression/glb-inspection.md',
        'docs/compression/gltf-transform.md',
        'docs/compression/ktx2-textures.md',
        'docs/compression/meshopt-vs-draco.md',
        'docs/compression/texture-atlas-2d.md',
        'docs/compression/motion-delta-quantization.md',
        'docs/compression/visual-regression-checklist.md',
        'docs/compression/asset-license-checklist.md',
    ]
    for rel in focused_docs:
        text = read(rel)
        for heading in ('## Steps', '## Rig-breaking risks', '## Test method'):
            if heading not in text:
                add_error(rel, f'compression doc missing required section: {heading}')
    checklist = read('shared/compression-checklist.js')
    for needle in ['evaluateAssetChecklist', 'REQUIRED_REGRESSION_POSES', 'ASSET_COMPRESSION_CHECKLIST']:
        if needle not in checklist:
            add_error('shared/compression-checklist.js', f'missing checklist export: {needle}')
    quant = read('shared/motion-quant.js')
    for needle in ['quantizeWeightDeltas', 'dequantizeWeightDeltas', 'encodeMotionFrame', 'decodeMotionStream', 'shouldForceKeyframe']:
        if needle not in quant:
            add_error('shared/motion-quant.js', f'missing motion-quant export: {needle}')


def validate_drum_docs() -> None:
    overlay = read('shared/drum-overlay.js')
    for needle in ['deriveObsOverlayState', 'reduceDrumOverlay']:
        if needle not in overlay:
            add_error('shared/drum-overlay.js', f'missing drum overlay export: {needle}')
    hihat = read('docs/tracking/drum-hihat-pedal.md')
    if 'inferHiHatPedalState' not in hihat:
        add_error('docs/tracking/drum-hihat-pedal.md', 'hi-hat pedal doc must point to inferHiHatPedalState')
    kick = read('docs/tracking/drum-kick-pedal.md')
    if 'inferKickPedalHit' not in kick:
        add_error('docs/tracking/drum-kick-pedal.md', 'kick pedal doc must point to inferKickPedalHit')
    schema_doc = read('docs/ml/drum-dataset-schema.md')
    if 'minamo.drum-dataset.v1' not in schema_doc:
        add_error('docs/ml/drum-dataset-schema.md', 'drum dataset schema doc must document minamo.drum-dataset.v1')
    try:
        clips = json.loads(read('tests/fixtures/drum-benchmark-clips.json'))
    except (json.JSONDecodeError, SystemExit):
        return
    if not isinstance(clips, dict) or 'clips' not in clips:
        add_error('tests/fixtures/drum-benchmark-clips.json', 'benchmark clips fixture must have a "clips" array')
        return
    for name in ('single-snare', 'alternating-hands', 'fast-roll', 'false-positive-hold'):
        if not any(clip.get('id') == name for clip in clips['clips']):
            add_error('tests/fixtures/drum-benchmark-clips.json', f'benchmark clips fixture missing clip: {name}')
    runner = read('scripts/drum-benchmark.ts')
    for needle in [
        'minamo.drum-benchmark-manifest.v1',
        'minamo.drum-detected-events.v1',
        'scoreDrumBenchmarkEvents',
        "execFileSync('ffprobe'",
        "spawnSync(executable, args, { cwd",
        'Raw video/audio is not embedded in this report.',
    ]:
        if needle not in runner:
            add_error('scripts/drum-benchmark.ts', f'drum runner missing privacy/reproducibility contract: {needle}')
    try:
        runner_manifest = json.loads(read('tests/fixtures/drum-benchmark-runner.manifest.json'))
        media = ROOT / 'tests/fixtures/drum-benchmark-runner.mp4'
        actual_hash = hashlib.sha256(media.read_bytes()).hexdigest()
        expected_hash = runner_manifest['clips'][0]['sha256']
        if actual_hash != expected_hash:
            add_error('tests/fixtures/drum-benchmark-runner.manifest.json', 'runner fixture SHA-256 does not match its media')
    except (json.JSONDecodeError, KeyError, IndexError, SystemExit):
        add_error('tests/fixtures/drum-benchmark-runner.manifest.json', 'runner fixture manifest is invalid')


def validate_secure_phone_transport() -> None:
    transport = read('shared/transport.js')
    pairing = read('shared/pairing.js')
    desktop = read('desktop/desktop.js')
    https_doc = read('docs/DEV_HTTPS.md')
    for needle in ['secureOnly', 'allowLocalFallback', 'validateTransportEndpoint', 'wss:// WebSocket fallback', 'sanitizeTransportError']:
        if needle not in transport:
            add_error('shared/transport.js', f'secure phone fallback contract missing: {needle}')
    if 'userAgent' in pairing or 'iPhone|iPad|iPod' in pairing:
        add_error('shared/pairing.js', 'phone transport selection must use runtime capabilities instead of UA sniffing')
    for needle in ['pairingPreferWt', 'pairingWtUrl', 'pairingWtHash', "mode: preferWt ? 'wt' : 'ws'"]:
        if needle not in desktop:
            add_error('desktop/desktop.js', f'desktop secure pairing control missing: {needle}')
    for needle in ['reverse_proxy 127.0.0.1:8787', 'wss://minamo.local/ws', 'Safari 26.4']:
        if needle not in https_doc:
            add_error('docs/DEV_HTTPS.md', f'HTTPS/WSS documentation missing: {needle}')


def validate_research_docs() -> None:
    research_docs = {
        'docs/research/multi-camera-fusion.md': '#183',
        'docs/research/phone-camera-companion.md': '#184',
        'docs/research/imu-stick-integration.md': '#185',
    }
    for rel, issue in research_docs.items():
        text = read(rel)
        for heading in ('## Goal', '## Acceptance criteria', '## Decision'):
            if heading not in text:
                add_error(rel, f'research doc missing required section: {heading}')
        if issue not in text:
            add_error(rel, f'research doc should reference tracking issue {issue}')


def validate_onnx_backend_registry() -> None:
    dd = read('docs/design/DD-009-onnx-backend-registry.md')
    for needle in ['createPoseBackendRegistry', 'setActiveBackend', 'onnx-pose-backends.md']:
        if needle not in dd:
            add_error('docs/design/DD-009-onnx-backend-registry.md', f'ONNX backend registry doc missing: {needle}')
    ml = read('src/core/ml.ts')
    for needle in ['createPoseBackendRegistry', 'setActiveBackend', 'listBackends']:
        if needle not in ml:
            add_error('src/core/ml.ts', f'missing runtime-toggleable backend registry export: {needle}')
    bench = read('docs/benchmarks/onnx-pose-backends.md')
    if 'fps' not in bench or 'VRAM' not in bench:
        add_error('docs/benchmarks/onnx-pose-backends.md', 'ONNX benchmark table must report fps and VRAM')


def validate_avatar_pack_cli() -> None:
    cli = read('scripts/kagami-pack.mjs')
    for needle in ['planAvatarPack', 'formatSizeTable']:
        if needle not in cli:
            add_error('scripts/kagami-pack.mjs', f'kagami-pack CLI missing export: {needle}')
    package_json = json.loads(read('package.json'))
    if 'pack:avatar' not in package_json.get('scripts', {}):
        add_error('package.json', 'missing pack:avatar script for kagami-pack CLI')


validate_issue_templates()
validate_adr_headings()
validate_local_docs_links()
validate_documented_package_scripts()
validate_glossary_examples()
validate_dependency_guardrails()
validate_foundation_contracts()
validate_calibration_contracts()
validate_mixer_contracts()
validate_quality_contracts()
validate_gaze_contracts()
validate_head_position_contracts()
validate_blink_wink_contracts()
validate_filter_tuning_contracts()
validate_tracking_loss_contracts()
validate_face_selection_contracts()
validate_body_hand_contracts()
validate_protocol_v2_contracts()
validate_e2ee_contracts()
validate_avatar_mapping_contracts()
validate_obs_viewer_contracts()
validate_scene_preset_contracts()
validate_perfect_sync_mapping_contracts()
validate_layered_avatar_contracts()
validate_transport_contracts()
validate_desktop_contracts()
validate_static_demo_entrypoints()
validate_replay_validation_ui()
validate_kgm_recording_contracts()
validate_vrma_export_contracts()
validate_latency_quality_hud_contracts()
validate_voice_activity_accent_contracts()
validate_audio_lipsync_contracts()
validate_runtime_warning_taxonomy()
validate_compression_docs()
validate_drum_docs()
validate_secure_phone_transport()
validate_research_docs()
validate_onnx_backend_registry()
validate_avatar_pack_cli()

if errors:
    print('Structure verification failed:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print(f'OK: structure verified. issue_count={issue_count}')
