<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Issue Backlog

> English version: [README.md](README.md)

このディレクトリには、GitHub Issueへ登録しやすいMarkdownが入っています。

- 件数: 142
- index: `issues/index.csv`
- 一括登録: `scripts/create_github_issues.py`

## 使い方

```bash
python3 scripts/create_github_issues.py --repo OWNER/REPO --dry-run
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label priority/P0
```

## 方針

- P0: MVPで必須
- P1: MVP直後に必要
- P2: 強い差別化機能
- P3: 研究・将来拡張
