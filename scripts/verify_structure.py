#!/usr/bin/env python3
from __future__ import annotations

import ast
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
    'docs/adr/README.md',
    'docs/product/onboarding.md',
    'docs/product/desktop-app.md',
    'docs/product/obs-setup.md',
    'docs/product/drummer-setup.md',
    'docs/product/troubleshooting.md',
    'docs/product/creator-presets.schema.json',
    'landing/index.html',
    'landing/app.js',
    'roadmap/index.html',
    'replay/index.html',
    'src/core/types.ts',
    'src/core/oneEuroFilter.ts',
    'src/core/anatomy.ts',
    'shared/runtime.js',
    'shared/recording.js',
    'tests/fixtures/kgm1-synthetic.jsonl',
    'tsconfig.browser-js.json',
    'scripts/fetch-models.sh',
    'scripts/release-smoke.mjs',
    '.github/workflows/ci.yml',
    '.nojekyll',
    'docker-compose.yml',
    'issues/index.csv',
    'desktop/index.html',
    'desktop/desktop.js',
    'desktop/styles.css',
    'src-tauri/Cargo.toml',
    'src-tauri/Info.plist',
    'src-tauri/tauri.conf.json',
    'src-tauri/capabilities/default.json',
    'src-tauri/icons/icon.png',
    'src-tauri/icons/icon.svg',
    'src-tauri/src/lib.rs',
    'src-tauri/src/main.rs',
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
            add_error(source, f'documented npm command runs in {cwd.relative_to(ROOT)} but no package.json exists there')
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

    for needle in ['npm run lint', 'npm test', 'npm run verify', 'npm run typecheck:js', 'npm run build']:
        if needle not in ci:
            add_error('.github/workflows/ci.yml', f'CI missing JavaScript gate: {needle}')
    if 'cargo test --manifest-path relay-rs/Cargo.toml' not in ci:
        add_error('.github/workflows/ci.yml', 'CI must run relay-rs tests')
    if 'npm test' not in ci or 'working-directory: relay-node' not in ci:
        add_error('.github/workflows/ci.yml', 'CI must run relay-node tests')
    if relay_node_package.get('scripts', {}).get('test') != 'node --test server.node-test.mjs':
        add_error('relay-node/package.json', 'relay-node must expose node:test script')
    if "['npm', ['test', '--prefix', 'relay-node']]" not in release_smoke:
        add_error('scripts/release-smoke.mjs', 'release smoke must run relay-node tests')
    if "['cargo', ['test', '--manifest-path', 'relay-rs/Cargo.toml']]" not in release_smoke:
        add_error('scripts/release-smoke.mjs', 'release smoke must run relay-rs tests')

    for export_name in ['constantTimeEqual', 'originAllowed', 'isKgm1Json', 'leaveRoom']:
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
        'estimateLandmarkConfidence(faceRes.faceLandmarks?.[0])',
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
        'resolveGaze(state.raw, faceRes.faceLandmarks?.[0]',
        'applyGazeToWeights(state.raw, gaze)',
        'sampleGazeCalibration(faceRes.faceLandmarks?.[0])',
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
        'vrm.scene.position.set(lean.x, lean.y, lean.z)',
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
validate_desktop_contracts()
validate_static_demo_entrypoints()
validate_replay_validation_ui()
validate_runtime_warning_taxonomy()

if errors:
    print('Structure verification failed:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print(f'OK: structure verified. issue_count={issue_count}')
