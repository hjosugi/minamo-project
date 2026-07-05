#!/usr/bin/env python3
from __future__ import annotations
import ast
import json
import re
from pathlib import Path
import sys

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
    'docs/product/onboarding.md',
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
    'scripts/fetch-models.sh',
    '.github/workflows/ci.yml',
    '.nojekyll',
    'docker-compose.yml',
    'issues/index.csv',
]
missing = [p for p in REQUIRED if not (ROOT / p).exists()]
issue_count = len(list((ROOT / 'issues' / 'backlog').glob('*.md')))
errors: list[str] = []


def add_error(path: str | Path, message: str) -> None:
    errors.append(f'{path}: {message}')


for p in missing:
    add_error(p, 'required file is missing')
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
    taxonomy_text = (ROOT / 'docs' / 'ISSUE_LABELS.md').read_text(encoding='utf-8')
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
            missing_ids = required_ids - set(ids)
            for item_id in sorted(missing_ids):
                add_error(path, f'tracking quality template must ask for "{item_id}"')
            text = path.read_text(encoding='utf-8')
            if 'No private raw camera recording is attached' not in text:
                add_error(path, 'capture checklist must include the no-raw-recording privacy confirmation')


def validate_adr_headings() -> None:
    required_headings = {'## Status', '## Context', '## Decision', '## Consequences'}
    for path in sorted((ROOT / 'docs' / 'adr').glob('*.md')):
        headings = {line.strip() for line in path.read_text(encoding='utf-8').splitlines() if line.startswith('## ')}
        for heading in sorted(required_headings - headings):
            add_error(path, f'missing ADR heading "{heading}"')


def validate_local_docs_links() -> None:
    link_pattern = re.compile(r'(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
    for base_dir in (ROOT, ROOT / 'docs'):
        for path in sorted(base_dir.glob('*.md') if base_dir == ROOT else base_dir.rglob('*.md')):
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


validate_issue_templates()
validate_adr_headings()
validate_local_docs_links()
validate_documented_package_scripts()

if errors:
    print('Structure verification failed:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print(f'OK: structure verified. issue_count={issue_count}')
