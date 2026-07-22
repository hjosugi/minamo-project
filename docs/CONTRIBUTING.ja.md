<!-- i18n: language-switcher -->
[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md)

# 貢献ガイド

新しいバグや機能リクエストには、イシューテンプレートを使用してください。問題を追跡するために、キャプチャモード、ブラウザ、カメラ、照明条件、リレーモード、およびVRMモデルが読み込まれたかどうかを含めてください。

プルリクエストを開く前に：

- `pnpm lint`、`pnpm test`、`pnpm verify`、および`pnpm build`を実行してください。
- リレーコードが変更された場合は、`relay-rs/`内で`cargo fmt`、`cargo clippy`、および`cargo build`を実行してください。
- カメラ/ビデオデータはローカルに保管してください。合成であるか明示的に承認されている場合を除き、プライベートな顔の録画を添付しないでください。
- イシュー番号をリンクし、変更によってカバーされる受け入れ基準をリストしてください。

ラベルは[ISSUE_LABELS.md](ISSUE_LABELS.md)の分類に従います。
