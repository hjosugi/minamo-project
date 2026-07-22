<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Issue Backlog

> 日本語版: [README.ja.md](README.ja.md)

This directory contains Markdown files formatted for easy registration as GitHub Issues.

- Count: 142
- Index: `issues/index.csv`
- Bulk registration: `scripts/create_github_issues.py`

## Usage

```bash
python3 scripts/create_github_issues.py --repo OWNER/REPO --dry-run
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label priority/P0
```

## Policy

- P0: Required for the MVP
- P1: Needed right after the MVP
- P2: Strong differentiating features
- P3: Research / future extensions
