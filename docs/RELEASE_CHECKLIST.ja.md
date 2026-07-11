<!-- i18n: language-switcher -->
[English](RELEASE_CHECKLIST.md) | [日本語](RELEASE_CHECKLIST.ja.md)

# リリースチェックリスト

## プレフライト

- リリース変更が始まる前に作業ツリーがクリーンであること。
- `README.md`、`README.ja.md`、`docs/INDEX.md`、および `docs/ROADMAP.md` が
  リリースの範囲と一致していること。
- リリースによってクローズされるオープンな問題には検証ノートがあること。
- `SECURITY_REVIEW.md` がトランスポート、トークン、メディア、またはモデルの
  変更について確認されていること。

## 自動チェック

```sh
pnpm lint
pnpm test
pnpm verify
pnpm typecheck:js
pnpm build
pnpm release:smoke
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml --release
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
cd relay-node && node --check server.mjs
```

`pnpm release:smoke` は最初に `pnpm-lock.yaml` をフローズンインストールで検証し、
その後、必要なツールチェーンが利用可能な場合に上記の自動リリースチェックを実行します。
手動のブラウザ、カメラ、リレートークン、WebTransport、または OBS スモークテストを
置き換えるものではありません。

## 手動スモークテスト

- ローカルモード: トラッカー -> ビューアが BroadcastChannel を通じて動作する。
- WebSocket リレーは `MINAMO_RELAY_TOKEN` なしで動作する。
- WebSocket リレーは `MINAMO_RELAY_TOKEN` が設定されている場合に
  不足または誤ったトークンを拒否する。
- WebTransport リレーは開始し、証明書ハッシュを表示する。
- ビューアは古い/順序が乱れたフレームをフリーズせずにドロップする。
- トラッカーは開始、停止、キャリブレーションのリセットができ、設定をローカルに保持する。

## アーティファクトレビュー

- 生成されたファイルは期待されており、意図的であること。
- 録音、ローカルモデルのダウンロード、秘密情報、または一時的なキャプチャが
  コミットされていないこと。
- リリースノートには既知のブラウザ、HTTPS、WebTransport、およびモデルのフォールバックに関する
  注意事項が記載されていること。
- タグまたはデプロイメントターゲットは、CI が正常に完了したコミットを指していること。
