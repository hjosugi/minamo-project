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
いました(コードベース唯一のシンク)。現在は 2 つの `<span>` 子要素を
`textContent` で構築するため、状態文字列がマークアップを注入できません。

## 計画中(パッケージ済みアプリや CI シークレットが必要)

### `withGlobalTauri` の無効化

`app.withGlobalTauri` はまだ `true` で、IPC ブリッジ全体を `window.__TAURI__` に
露出し、注入コンテンツの影響範囲を広げます。無効化は実機での検証が必要な協調的
変更です:

1. `@tauri-apps/api` を依存に追加。
2. `desktop/desktop.js`: `window.__TAURI__?.core?.invoke` を
   `import { invoke } from '@tauri-apps/api/core'` に置換し、Tauri 有無で
   ガードして web プレビューのフォールバックを維持:
   `const isTauri = '__TAURI_INTERNALS__' in window;`
3. `viewer/viewer.js`: `core.invoke` と `event.listen` の両方を同様に
   (`import { listen } from '@tauri-apps/api/event'`)。
4. `withGlobalTauri: false` に設定し、現在 `true` を必須とする
   `scripts/verify_structure.py` のアサーションを更新。
5. パッケージ済みアプリで desktop status・phone pairing・native-avatar bridge を
   動作確認。`__TAURI_INTERNALS__` は `withGlobalTauri` に関係なく Tauri v2 が
   注入しますが、実行時に確認が必要です。

### 署名付き自動アップデータ

アップデータは未設定です。`tauri-plugin-updater` を採用します:

1. `tauri signer generate` で minisign 鍵ペアを生成。**公開**鍵を
   `tauri.conf.json`(`plugins.updater.pubkey`)にコミット。**秘密**鍵と
   パスワードは CI シークレット(`TAURI_SIGNING_PRIVATE_KEY`,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)にのみ保存(リポジトリには置かない)。
2. bundle 設定で `createUpdaterArtifacts` を有効化し、署名済み `latest.json` と
   成果物を CI から GitHub Releases に公開。
3. `plugins.updater.endpoints` をリリースの `latest.json` に向ける。

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
