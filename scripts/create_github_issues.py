#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
ISSUES_DIR = ROOT / 'issues' / 'backlog'


def parse_issue(path: Path) -> dict:
    text = path.read_text(encoding='utf-8')
    if not text.startswith('---\n'):
        raise ValueError(f'{path} has no front matter')
    _, fm, body = text.split('---\n', 2)
    meta = {}
    for line in fm.splitlines():
        if not line.strip() or ':' not in line:
            continue
        key, value = line.split(':', 1)
        key = key.strip()
        value = value.strip()
        if value.startswith('['):
            meta[key] = json.loads(value.replace("'", '"'))
        else:
            meta[key] = value.strip('"')
    meta['body'] = body.strip() + '\n'
    meta['path'] = str(path.relative_to(ROOT))
    return meta


def matches(meta: dict, required_label: str | None) -> bool:
    if not required_label:
        return True
    return required_label in meta.get('labels', [])


def main() -> int:
    parser = argparse.ArgumentParser(description='Create GitHub issues from issues/backlog/*.md')
    parser.add_argument('--repo', required=True, help='OWNER/REPO')
    parser.add_argument('--apply', action='store_true', help='Actually create issues')
    parser.add_argument('--dry-run', action='store_true', help='Print commands only')
    parser.add_argument('--label', help='Only create issues containing this label, e.g. priority:P0')
    args = parser.parse_args()

    if not args.apply and not args.dry_run:
        print('Use --dry-run or --apply')
        return 2

    paths = sorted(ISSUES_DIR.glob('*.md'))
    issues = [parse_issue(path) for path in paths]
    issues = [issue for issue in issues if matches(issue, args.label)]

    print(f'Found {len(issues)} issue(s). repo={args.repo} apply={args.apply}')
    with TemporaryDirectory(prefix='kgm1-issues-') as tmp:
        tmpdir = Path(tmp)
        for idx, issue in enumerate(issues, 1):
            body_file = tmpdir / f'{idx:03d}.md'
            body_file.write_text(issue['body'], encoding='utf-8')
            cmd = ['gh', 'issue', 'create', '-R', args.repo, '--title', issue['title'], '--body-file', str(body_file)]
            for label in issue.get('labels', []):
                cmd.extend(['--label', label])
            milestone = issue.get('milestone')
            if milestone:
                cmd.extend(['--milestone', milestone])
            print(' '.join(json.dumps(c) if ' ' in c else c for c in cmd))
            if args.apply:
                subprocess.run(cmd, check=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
