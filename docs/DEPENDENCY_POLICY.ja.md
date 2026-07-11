<!-- i18n: language-switcher -->
[English](DEPENDENCY_POLICY.md) | [日本語](DEPENDENCY_POLICY.ja.md)

# 依存関係更新ポリシー

Minamoはローカルファーストのトラッキングソフトウェアであるため、依存関係の変更はプライバシー、レイテンシ、および再現性を保持する必要があります。

## ポリシー

- スクリプトやマニフェスト内でモデル、ランタイム、およびツールのバージョンを固定します。
- CDN専用の機能は避け、ローカルベンダリングまたはフォールバックパスを提供します。
- メディアを送信するように明示的にユーザーに要求しない限り、カメラ/ビデオ/オーディオの依存関係はローカルファーストに保ちます。
- 独立してレビューおよび元に戻すことができる小さな依存関係の更新を優先します。
- 推論、レンダラー、トランスポート、暗号化、およびビルドシステムの依存関係は高リスクの変更として扱います。

## 更新フロー

JavaScriptの依存関係:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm verify
pnpm build
```

`pnpm verify`は、MediaPipe Tasks Visionのバージョンが`package.json`、`tracker/tracker.js`、および`scripts/fetch-models.sh`の間で一貫していることを確認します。また、固定されたモデルバージョンセグメントを含まないMediaPipeモデルのURLを拒否します。

Rustの依存関係:

```sh
cargo update
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml --release
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
```

Relay-nodeの依存関係:

```sh
pnpm install --frozen-lockfile
cd relay-node
node --check server.mjs
pnpm test
```

## リスクノート

- MediaPipe、ONNX、モデル、圧縮、またはレンダリングの変更には、起動時間、推論時間、バンドルサイズ、およびプライバシーへの影響に関するノートを含める必要があります。
- WebSocket/WebTransport、TLS、トークン、またはオリジンチェックの変更は、`SECURITY_REVIEW.md`にリンクする必要があります。
- モデルまたはWASMアセットの更新は、実用的な場合にソースURL、バージョン、ライセンス、およびチェックサム/SRIを記録する必要があります。
- 依存関係がブラウザサポートを変更する場合は、`QUICKSTART.md`または`DEV_HTTPS.md`を更新します。

### 固定QRレンダラー

- `qrcode` `1.5.4` (MIT, <https://github.com/soldair/node-qrcode>)は、#226ペアリングペイロードをローカルでレンダリングします。ViteデスクトッププラスQRチャンクは、ペアリングUIを含めてgzip前で約35 kBです。
- 直接提供されるリレーページは、同じリレーの`no-store` SVGレンダラーにフォールバックします。どちらのパスもサードパーティのQRサービスを呼び出したり、カメラメディアをアップロードしたりしません; リレーはQRペイロードやルームトークンをログに記録しません。

### TypeScriptコマンドランナー

- `tsx`は、スコアリングロジックが重複しないようにTypeScriptコアからローカル専用のドラムベンチマークCLIを直接実行します。そのロックファイル依存関係`esbuild`は、pnpm 11の`allowBuilds`マップを通じてインストールスクリプトを実行する唯一のパッケージです; その許可リストの変更にはサプライチェーンレビューが必要です。

### Inox2Dブラウザレンダラー

- `third_party/inochi2d-wasm/Cargo.toml`は、公式のInox2D gitクレートを`df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba` (BSD-2-Clause)に固定します。
- `viewer/vendor/inochi2d/minamo_inochi2d_bg.wasm`は、`wasm-bindgen 0.2.126`を使用して生成されます; SHA-256:
  `e5545620cc98944b71200d0205628abcc1f2cb3ce5873fa5cfc61c6876f95667`.
- 生成されたJSのSHA-256は
  `59922217e5db606c8d77916987909d63d24e0de3a0acb59e07fbbb3120edd2ce`です。
  ランタイムの更新は両方のアーティファクトを再ビルドし、これらのハッシュを更新し、`LICENSE.inox2d`を保持し、実際のブラウザスモーク手順を繰り返す必要があります。

## ロールバック

- 各依存関係の更新は、コードの移行から切り離せない場合を除き、それぞれのコミットに保持します。
- 更新後にCIが失敗した場合は、まず依存関係の変更を元に戻し、原因がわかるまでコードの変更を再適用しません。
- ネットワークサービスに依存するno-serverローカルデモを作成する依存関係の更新をマージしないでください。
