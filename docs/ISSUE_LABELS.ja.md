<!-- i18n: language-switcher -->
[English](ISSUE_LABELS.md) | [日本語](ISSUE_LABELS.ja.md)

# イシューラベルの分類

ラベルはトリアージを機械的にするべきです：イシューは通常、1つの `type/*`、1つ以上の `area/*`、およびスケジューリングに関する優先度ラベルを持ちます。

## エリア

- `area/tracking`: カメラ、ランドマーク、フィルター、キャリブレーション、品質警告
- `area/body`: 手、指、ポーズ、ドラム、全身推論
- `area/protocol`: KGM1/KGM2 エンコーディング、JSONL、リプレイ、互換性
- `area/transport`: BroadcastChannel、WebSocket、WebTransport、リレー認証
- `area/render`: VRM、Live2D、Inochi2D、OBS、視覚的回帰
- `area/audio`: 発声検出、リップシンク、音声活動
- `area/tooling`: テスト、ベンチマーク、録音、デバッグサーフェス
- `area/app`: オンボーディング、設定、製品ページ、UX
- `area/infra`: CI、Docker、デプロイ、依存関係の更新
- `area/docs`: ガイド、ADR、リリース/セキュリティチェックリスト
- `area/quality`: トラッキング品質レポート、品質スコアの閾値、キャプチャ診断

トリアージをより鋭くするために、細かいエリアラベルを使用することができます：
`area/quality`、`area/capture`、`area/ui`、`area/test`、`area/devex`、
`area/calibration`、`area/benchmark`、`area/privacy`、および `protocol/kgm1`。

## タイプ

- `type/feature`: ユーザーが目にする機能
- `type/bug`: 壊れているまたは安全でない動作
- `type/chore`: メンテナンスまたは運用
- `type/research`: 書面による決定を伴う評価
- `type/docs`: ドキュメントのみの変更
- `type/test`: 回帰カバレッジおよび検証の変更

## 優先度

- `priority/P0`: ローカル開発、CI、セキュリティ、またはコアデモをブロックする
- `priority/P1`: 次のマイルストーンにとって重要
- `priority/P2`: 即時のリリースプレッシャーがない有用なバックログ作業

## ルール

- 期待される出力が比較または決定文書であり、プロダクションコードでない場合は `type/research` を使用してください。
- ランタイムの動作が変更されない場合は `type/docs` を使用してください。
- 変更が KGM1/KGM2 の互換性に影響を与える場合は、たとえコードがトラッカー、ビューワー、またはリレーパッケージに存在していても `area/protocol` を追加してください。
- CI、Docker、依存関係ポリシー、リリース、およびイシューワークフローの変更には `area/infra` を追加してください。
- ラベルをステータスマーカーとして使用しないでください。ステータスはイシューコメント、マイルストーン、またはリンクされたプルリクエストに属します。

## 例

- "WebTransport レシーバープロトタイプを追加": `type/feature`、`area/transport`、`area/protocol`
- "MediaPipe タスクとカスタム ONNX を比較": `type/research`、`area/tracking`、`area/body`
- "セキュリティレビューのチェックリストを追加": `type/docs`、`area/infra`、`area/docs`
- "ビューワーでの古いフレームのフリーズを修正": `type/bug`、`area/render`、`area/protocol`