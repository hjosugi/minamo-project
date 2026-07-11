<!-- i18n: language-switcher -->
[English](IMPLEMENTATION_PROGRESS.md) | [日本語](IMPLEMENTATION_PROGRESS.ja.md)

# 実装進捗台帳

日付: 2026-07-05

範囲: パス開始時にオープンしていたGitHubの課題に対する進捗で、キュレーションされた課題 `#1`-`#53` と詳細な課題 `#55`-`#196` をカバーしています。

ステータス: これはクローズ文書ではありません。課題はそれぞれの受け入れ基準が実装され、検証されるまでオープンのままです。このファイルは、残りの作業を完了する際に使用できるリポジトリの証拠を記録します。

## 2026-07-08 パス (v0.1.4)

検証可能な成果物（ドキュメント + コード + テスト、すべてのゲートがグリーン）でクローズしました：

- 圧縮ドキュメント #156-#163: `docs/compression/` 内の8つのステージごとのガイドに加え、`shared/compression-checklist.js`（`evaluateAssetChecklist` サンプルアセットゲート）および `shared/motion-quant.js`（モーションデルタ量子化参照コーデック）を含み、ラウンドトリップおよびリグ保存テストを実施しました。
- ドラム #118-#123: ハイハット/キックペダル推論設計ドキュメント、OBSドラムオーバーレイ（`shared/drum-overlay.js` + `viewer/drum-overlay.html`）、高速ロールストレステストを含むベンチマーククリップフィクスチャ（`tests/fixtures/drum-benchmark-clips.json`）、およびYOLOスティック/ドラムトレーニングスキーマ（`docs/ml/drum-dataset-schema.md` + `docs/product/drum-dataset.schema.json`）。
- 研究 #183-#185: マルチカメラフュージョン、電話カメラコンパニオン、IMUスティック評価を `docs/research/` にて実施しました。

進行中だがオープンのまま（残りの基準はハードウェア/手動検証が必要）：

- #23 フルボディONNX: ランタイム切り替え可能なバックエンドレジストリ（`createPoseBackendRegistry`/`setActiveBackend` in `src/core/ml.ts`）、DD-009、およびfps/VRAMベンチマークテーブル。ONNXモデルが統合され、実際のWebGPUデバイスでベンチマークされるまでオープンです。
- #41 アセットパイプライン: `kagami-pack` プランナーCLI（`pnpm pack:avatar`）と、前後のサイズテーブル。パックされたVRMが実際のgltfpack/gltf-transformツールチェーンでビューワー内で同一であることが確認されるまでオープンです。
- #43 マルチアバタールーム: `assignRoomLayoutSlots` 決定論的レイアウト + フェードアウト。1つのビューワー内で2つのライブトラッカーが確認されるまでオープンです。
- #51 電話をトラッカーとして使用: `shared/pairing.js` URL契約、デスクトップQR/コピーUI、リレー発行の短命トークン、クエリアプリケーション、およびiOS Safari wsフォールバックが#226の下で実装されます。セキュアネゴシエーション（#227）および実際の電話タイミング（#228）が確認されるまでオープンです。
- #38 Inochi2D および #50 Tauri仮想カメラは、既存の設計ドキュメントに従ってオープンのままです。両方ともランタイム/ハードウェア検証が必要です（KGM-050は設計による構造チェックによってオープンのままです）。

## 実装証拠

- ランタイム/アプリ: `shared/runtime.js`, `shared/codec.js`, `shared/kgm1b.js`, `shared/kgm2.js`, `shared/transport.js`, `tracker/`, `viewer/`
- リレー: `relay-node/server.mjs`, `relay-rs/src/main.rs`
- テストとゲート: `tests/run-tests.mjs`, `scripts/lint.mjs`, `scripts/verify_structure.py`, `.github/workflows/ci.yml`
- オフラインモデルと参照コーデック: `scripts/fetch-models.sh`, `scripts/kgm1b_codec.py`, `crates/kgm1-codec`, `packages/kgm1-codec-py`
- セルフホスティング: `Dockerfile.relay-node`, `relay-rs/Dockerfile`, `docker-compose.yml`
- 製品/ドキュメント/運用: `docs/DEV_HTTPS.md`, `docs/CONTRIBUTING.md`, `docs/ISSUE_LABELS.md`, `docs/DEPENDENCY_POLICY.md`, `docs/SECURITY_REVIEW.md`, `docs/RELEASE_CHECKLIST.md`, `docs/GLOSSARY.md`, `roadmap/index.html`

## 検証

ローカルで合格しました：

```sh
pnpm lint
pnpm test
pnpm verify
pnpm build
cargo fmt --manifest-path relay-rs/Cargo.toml -- --check
cargo clippy --manifest-path relay-rs/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path relay-rs/Cargo.toml
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
python3 scripts/kgm1b_codec.py decode-packet <kgm1b-golden-hex>
node --check relay-node/server.mjs
```

## 実装済みまたは部分的に実装済み

- CI/lint/build/testゲートは、JavaScript、TypeScript、Rustリレー、およびRust KGM1ヘッダーコーデックに存在します。
- `decodeFrame` はスローしないもので、ラウンドトリップ、誤った形式、変異、および1Mランダムバッファテストでカバーされています。
- ランタイムヘルパーは、シーケンス順序、ドロップフレーム検出、品質スコアリング、キャリブレーションプロファイルの正規化/適用、ミラーテスト、合成フレーム生成、警告分類、虹彩注視キャリブレーション/フォールバック、まばたき/ウィンクヒステリシス、セマンティックフェイスコントロールをカバーしています。
- トラッカーUIは、カメラ選択、解像度/FPSコントロール、設定の永続化、プライバシーモードコピー、品質警告、30秒のガイド付きキャリブレーションフロー、キャリブレーションプロファイルのインポート/エクスポート、チャネルごとのゲイン/デッドゾーン/ミュート、設定可能な頭部距離の傾斜安定化、遅延/ジッターの読み取りを伴うスムージングプリセット/スライダー、トラッキングロスのフェード/再エントリーの緩和、持続的なフェイスロックを伴うスティッキーなマルチフェイス選択、キーボードリセット、およびローカルJSONL記録を備えています。手は現在、制限された30Hzスケジュールで動作し、16バイトの手ターゲットを使用し、手のキャリブレーションと指ごとのデバッググラフを表示し、ポイント/ピース/ドラムグリップ/フィンガーカウントジェスチャーを分類し、短い遮蔽のみを保持して手ブロックを省略します。
- ビューワーUIは、接続設定を永続化し、ルームトークンをサポートし、透明なOBSモードを持ち、ラップを考慮したシーケンス処理で古い/順序が乱れたフレームをドロップし、自然なカップリングカーブでVRMフィンガーをマッピングし、スウェイのみのモードにフォールバックするアームソルバーのトグルを持っています。
- WebSocketおよびWebTransportリレーはオプションのルームトークンをサポートします。WebSocketは、オリジンの許可リストとJSONフォールバックペイロードもサポートします。
- `relay-rs` は間違ったルームトークンを `403` で拒否し、テスト中にネイティブWebTransportのpub/subデータグラムをリレーし、最後の参加者が退出した後に空のルームを削除します。
- KGM2コンパクトフェイスフレームには、最小の3つのクォータニオンパッキング、キーフレーム/デルタ回復、スパースチャネルマスク、およびクロックオフセット推定ヘルパーを持つJS参照エンコーダ/デコーダがあります。KGM1Bパケットフレーミングには、JS、Rust、およびPythonの参照実装があり、JS生成のゴールデンベクターテストがあります。
- 手の安定性には、合成ゴールデンクリップフィクスチャ、出荷された壊れた指診断ページ、ベンチマークレポート、およびジャンプクランプ、短い回復保持、長い遮蔽省略をカバーする検証者チェックがあります。
- Tauri 2デスクトップシェルは、既存のViteアプリからバンドルされたトラッカー、ビューワー、およびリプレイウィンドウを開き、OSごとの仮想カメラバックエンドのステータスを報告します。
- ビューワーには、`.inp/.inx` 用の実験的なオフラインInochi2Dバックエンドがあります：公式のInox2Dソースはリビジョンで固定され、チェックインされたWASMにコンパイルされ、名前付きパラメータはライブ/エクスポータブルな表現マッピングエディタを共有し、隠れたWebGL2ターゲットが最終的なThree.jsシーンを通じて合成されています。
- オフラインMediaPipeベンダリング、Docker Compose、HTTPS開発、貢献、セキュリティ、リリース、依存関係、ラベル、用語集、およびロードマップのドキュメントが存在します。

## 設計上オープンのまま

残りの課題セットには、大規模な機能、研究、アプリ、および統合作業が含まれており、設計文書が存在するだけでは完了していません。例：Tauri仮想カメラ出力、電話コンパニオンキャプチャ、フルボディONNXバックエンド、Live2Dランタイム統合、実際のパペットInochi2D検証、フルドラムパフォーマンストラッキング、KGM2生産輸送、MoQ/クラスターリレー、暗号化、アセット圧縮パイプライン、および手動ベンチマーク/検証タスク。

これらの課題は、コード、ドキュメント、テスト、および必要な手動検証で具体的な受け入れ基準が満たされるまでクローズしないでください。