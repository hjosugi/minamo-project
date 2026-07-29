<!-- i18n: language-switcher -->
[English](desktop-security.md) | [日本語](desktop-security.ja.md)

# デスクトップ (Tauri) セキュリティ強化

追跡 issue: #251。Tauri v2 の 2025–2026 年の脆弱性はすべてプラグイン/webview
まわりで発生しており、その攻撃面を最小化し webview を締めます。

## 実装済み

### Content-Security-Policy

`src-tauri/tauri.conf.json` は以前 `"csp": null` で webview の CSP を完全に無効化
していました。現在は厳格なポリシーを設定します:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' blob:;
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
media-src 'self' blob: mediastream:;
connect-src 'self' ipc: http://ipc.localhost ws: wss: https: blob: data:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none'
```

各許可の理由(すべてバンドルされた tracker/viewer が必要とします):

- `script-src 'self' 'wasm-unsafe-eval' blob:` — ES モジュール、MediaPipe /
  ONNX の WebAssembly コンパイル、tracker の MediaPipe バンドルの
  `import(blobURL)`。`'unsafe-inline'` は付けません(バンドルページにインライン
  `<script>` やインラインイベントハンドラは存在しません)。Tauri は IPC
  ブートストラップ用の nonce をこの CSP 処理時に自動付与します。
- `worker-src blob:` — MediaPipe / ONNX の web worker。
- `img-src data: blob:` と `media-src blob: mediastream:` — canvas/data-URI 画像と
  `getUserMedia` のカメラストリーム。
- `connect-src … ipc: http://ipc.localhost ws: wss: https: …` — Tauri IPC、
  WebSocket リレー、WebTransport(`https:`)、MediaPipe CDN フォールバック。
  リレーのホストはユーザ設定なので、トランスポートのスキームは開けておきます。
- `style-src 'unsafe-inline'` — ページはまだインライン style 属性を使うため。
  ここの厳格化は残りのインライン style を hash/nonce 化する後続作業です。

> **要検証:** CI はビルドのみで起動はしないため、この CSP は変更のたびに
> パッケージ済みデスクトップアプリ(tracker 取り込み、viewer アバター読み込み、
> replay)で必ず動作確認してください。機能が壊れたら `null` に戻さず、該当
> ディレクティブだけ広げてください。

### innerHTML シンクの除去

`desktop/desktop.js` はページ状態の行を `innerHTML` テンプレート補間で組み立てて
いました。現在は 2 つの `<span>` 子要素を `textContent` で構築します。

`viewer/drum-overlay.html` もドラムゾーンのラベルで同じパターンでした
(`el.innerHTML = \`<div><div>${zone.label}</div>…\``)。これらのラベルは同ファイル
内のハードコードされたレイアウト定数に由来するため悪用可能ではありませんでした
が、最後に残っていた補間シンクであり、この不変条件はすべての箇所で成立してこそ
意味があります。現在はノードを構築して `textContent` を設定します。コードベース
に `innerHTML` の補間は残っていません。

### `withGlobalTauri` の無効化

`app.withGlobalTauri` は `false` になり、IPC ブリッジは window オブジェクトに
露出しなくなりました。レンダラー側は API を import します:

- `desktop/desktop.js` — `import { invoke, isTauri } from '@tauri-apps/api/core'`
- `viewer/viewer.js` — 上記に加え、native-avatar bridge 用に
  `import { listen } from '@tauri-apps/api/event'`

Tauri 上かどうかは internals グローバルを覗くのではなく、公式の `isTauri()`
ヘルパーで判定します。Tauri webview 外では false を返し、両ハンドルは null の
ままなので、既存の web プレビュー用フォールバックがそのまま動作します
(このパスはページのスモークテストでカバーされています。#263)。

`scripts/verify_structure.py` は以前 `withGlobalTauri: true` を必須としていました
が、現在は `false` を必須とし、両レンダラーが `@tauri-apps/api/core` から import
していることを要求し、再び window オブジェクト経由でブリッジを読んだ場合は失敗
します。

> **要検証:** IPC パス自体は CI では実行できません(バンドルはビルドしますが
> 起動はしないため)。リリース前にパッケージ済みアプリで desktop status・
> phone pairing・viewer の native-avatar の open/read ブリッジを動作確認して
> ください。

### 署名付き自動アップデータ

Minamo Studio は `tauri-plugin-updater` を使用し、すべてのアップデートを
`tauri.conf.json` に埋め込んだ minisign 公開鍵で検証します。デスクトップの
コントロールサーフェスに **アップデートを確認** 操作があり、最新の GitHub
Release を確認し、インストール前に確認を求め、プラットフォーム用成果物を
ダウンロード・検証してからアプリを再起動します。

`main`ウィンドウ専用capabilityが許可するのは `check`、`download-and-install` と
プロセスの `restart` だけです。tracker、viewer、replayにはこれらを付与せず、
どのウィンドウにもプロセス終了やshellコマンドは公開しません。Release CI は暗号化された
秘密鍵とパスワードを `TAURI_SIGNING_PRIVATE_KEY` /
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` から読み、4 プラットフォームすべての
署名済み updater 成果物を生成し、`tauri-action` で `latest.json` に統合します。
この完全なマトリクスが成功するまで Release はドラフトのままです。

updater の秘密鍵とパスワードは長期利用するリリース資格情報です。リポジトリ外に
保ち、安全にバックアップする必要があります。どちらかを失うと、インストール済み
アプリが将来のアップデートを信頼できなくなります。

## 計画中（プラットフォーム署名IDが必要）

### OS コード署名

配布物は現在未署名です。

- **macOS:** Developer ID Application 証明書 + `codesign`、続いて
  `notarytool` による notarization と staple。`bundle.macOS.signingIdentity` と
  notarization 資格情報を CI env で設定。
- **Windows:** Authenticode 署名(`bundle.windows.certificateThumbprint` または
  署名サービス)で SmartScreen にインストーラを信頼させる。

## 参考

- https://v2.tauri.app/security/
- https://v2.tauri.app/plugin/updater/
