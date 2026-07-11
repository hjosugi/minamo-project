<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# アーキテクチャ決定記録

ADRsは、トラッカー、ビューア、リレー、プロトコル、および開発者ワークフローを形作る決定を記録します。新しいADRは `000-template.md` から始め、安定した番号を使用し、関連する問題を `## References` に含める必要があります。

| ADR | ステータス | エリア | 関連する問題 |
| --- | --- | --- | --- |
| [000-template.md](000-template.md) | 提案中 | devex | #181 |
| [001-local-first-tracking.md](001-local-first-tracking.md) | 承認済み | プライバシー / トラッキング | #179 |
| [002-stability-layer-required.md](002-stability-layer-required.md) | 承認済み | トラッキング / レンダリング | #176 |

## 必要なセクション

- `## ステータス`
- `## コンテキスト`
- `## 決定`
- `## 結果`
- `## 検証`
- `## 考慮された代替案`
- `## 参考文献`

`pnpm verify` はこれらのセクションとステータス値をチェックします。