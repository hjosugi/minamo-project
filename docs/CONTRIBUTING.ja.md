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

## KGM1B コンテナデコーダーのファジング

`crates/kgm1-codec` は信頼できないネットワーク入力をパースするため、`crates/kgm1-codec/fuzz` に cargo-fuzz ハーネスがあります。CI は push ごとに各ターゲットを30秒実行し、`.github/workflows/fuzz.yml` は実行間でキャッシュされたコーパスに対して毎週各ターゲットを10分実行します。ローカルで実行するには nightly ツールチェーンが必要です：

```
rustup toolchain install nightly
cargo install cargo-fuzz
node scripts/seed-fuzz-corpus.mjs
cargo +nightly fuzz run --fuzz-dir crates/kgm1-codec/fuzz decode_packet
```

ターゲットは `decode_packet`（任意のバイト列）、`corrupt_valid`（有効なパケットをファザーが破壊するため、変異が magic とバージョンゲートの先に到達する）、`roundtrip`（切り詰めとバージョンゲートの不変条件を網羅的に検証）の3つです。

失敗し得ないファズターゲットは、失敗しないターゲットと区別がつきません。ハーネスを変更する際は、デコーダーにバグを仕込んでターゲットが検出することを確認してください。`fuzz/src/lib.rs` の契約が双方向にアサートしているのは意図的です — 受理されたバイト列は入力と完全に一致するように再エンコードされなければならず、拒否されたバイト列は本当に無効でなければなりません。「panic しない」という条件は、すべてを拒否するデコーダーでも満たされてしまうからです。
