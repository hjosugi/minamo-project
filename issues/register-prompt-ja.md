# GitHub Issue登録プロンプト

> English version: [register-prompt.md](register-prompt.md)

次の条件で `issues/backlog/` のMarkdownをGitHub Issueへ登録してください。

## 条件

- まず `priority/P0` だけ登録する。
- 既存Issueと重複するタイトルは登録しない。
- Markdown front matterの `title`, `labels`, `milestone` を使う。
- 本文はfront matterを除いた内容を使う。
- 登録後、Issue URL一覧をMarkdown表で出す。
- 登録できなかったものは理由を書く。

## 推奨コマンド

```bash
python3 scripts/create_github_issues.py --repo OWNER/REPO --dry-run --label priority/P0
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label priority/P0
```

## 次の登録順

1. `priority/P0`
2. `tracking/stability`
3. `tracking/hand`
4. `tracking/face`
5. `area/avatar`
6. `tracking/drum`
7. `area/transport`
8. `area/ml`
