<!-- i18n: language-switcher -->
[English](COMMANDS.md) | [日本語](COMMANDS.ja.md)

# Inochi2D ランタイムコマンド

## リポジトリチェック

```sh
pnpm lint
pnpm test
pnpm typecheck:js
pnpm verify
pnpm build
pnpm release:smoke

cargo fmt --manifest-path third_party/inochi2d-wasm/Cargo.toml -- --check
cargo clippy --manifest-path third_party/inochi2d-wasm/Cargo.toml \
  --target wasm32-unknown-unknown -- -D warnings
```

WASM ターゲットビルドは、固定された Rust 1.96 ツールチェーンとパッケージローカルの `CARGO_TARGET_DIR` を使用しました。ブラウザアーティファクトは次のコマンドで生成されました：

```sh
wasm-bindgen --target web \
  --out-dir viewer/vendor/inochi2d \
  --out-name minamo_inochi2d \
  third_party/inochi2d-wasm/target/wasm32-unknown-unknown/release/minamo_inochi2d_wasm.wasm
```

## ブラウザスモーク

1. Inochi2D/example-models コミット `cd95dd00ddff63b1f7d2b84a19914c3c70d05945` から公開された Aka モデルをダウンロードし、その Git LFS SHA-256 `dbf82ffb86d1c761bca883ad37ec1c47487a447f8104290b459ce60aaee81e0f` を確認します。
2. Aka の元の 1,593,026 バイトのパペット JSON、すべての 34 パラメータ、ノード、メッシュ、バインディング、および 76 テクスチャスロットを保持します。このランタイム専用のスモークでは、各テクスチャペイロードをモデルの最小の元の有効 TGA に置き換えます。ローカルで派生した入力は 1,686,758 バイトで、SHA-256 は `bd7feb293aa01c407c1deb86550145966b5c1969081bfab7fc6fc6693ce91ba9` です。
3. 本番用の `dist/` と派生入力を 1 つの localhost オリジンから提供します。Chrome で WebGL2 を有効にして `viewer/?inochi=/Aka-smoke2.inx` を開きます。
4. Chrome DevTools プロトコル `Runtime.exceptionThrown` を有効にし、リロードして、レンダーループが 7 秒間実行されるのを許可し、Viewer ステータスフィールドを評価します。
5. 例外イベントが発生していないこと、ステータスが `open` であること、隠れた Inochi2D レンダーキャンバスがあること、およびマッピングステータスが `Inochi2D 4/34 parameters` であることを確認します。

ダウンロードされたおよび派生したパペットはリポジトリの外に残り、公開スコープから削除されました。テクスチャの置き換えにより、これはレンダラーライフサイクルスモークとなり、#230 に必要な視覚品質の証拠ではありません。
