#!/usr/bin/env python3
from __future__ import annotations
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
    'landing/index.html',
    'landing/app.js',
    'src/core/types.ts',
    'src/core/oneEuroFilter.ts',
    'src/core/anatomy.ts',
    'issues/index.csv',
]
missing = [p for p in REQUIRED if not (ROOT / p).exists()]
issue_count = len(list((ROOT / 'issues' / 'backlog').glob('*.md')))
if missing:
    print('Missing files:')
    for p in missing:
        print(f'- {p}')
    sys.exit(1)
if issue_count < 100:
    print(f'Expected at least 100 issue files, got {issue_count}')
    sys.exit(1)
print(f'OK: structure verified. issue_count={issue_count}')
