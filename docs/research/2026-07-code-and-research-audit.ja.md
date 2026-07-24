<!-- i18n: language-switcher -->
[English](2026-07-code-and-research-audit.md) | [日本語](2026-07-code-and-research-audit.ja.md)

# 研究: 2026年7月 コード・研究監査

ステータス: 監査パス完了。実行可能な指摘はすべて GitHub イシュー
(#246-#278) として登録済み。本書はその恒久的な索引であり、各イシューの
背景となる研究状況のまとめである。

## 手法

コード/文書の分析3パス(TypeScript/JavaScript ランタイム、Rust /
バックエンド / CI、ドキュメントとコードの乖離)と、文献/エコシステムの
調査2パス(2024-2026 のトラッキング研究、2026 のトランスポート/
ランタイム動向)をコミット `4676f1d`(v0.1.8)に対して実施した。
重大度の高い指摘は、イシュー登録前にワーキングツリーの該当行を再検証
した。既存のオープンイシュー(#23-#241)を確認し、重複を避けた。

## 登録イシュー

### セキュリティと正確性 (P0/P1)

- #246 relay-rs: ルーム/セッション無制限、レート制限なし (DoS)
- #247 relay-node: Origin バイパス、ペイロード上限なし、バックプレッシャーなし、トークンストア肥大
- #248 e2ee.js: AES-GCM ノンス構成(64ビット乱数空間の共有)
- #249 shared/filters.js OneEuroFilter: 有限値ガード欠如 (P0)
- #250 Tauri capability ファイルに tracker/replay ウィンドウがない
- #251 Tauri 強化: CSP、withGlobalTauri、innerHTML シンク、署名付きアップデータ
- #252 KGM2: デルタ量子化クランプによる破損、デコーダのキーフレームマップ肥大
- #253 トラッカーのカメラ起動が永久にハングし得る
- #254 drum.ts の速度/軸規約の不一致

### アーキテクチャと技術的負債

- #255 孤立した `src/` 次世代パイプライン: 統合かアーカイブか
- #256 互換性のない3フォーマットがすべて「KGM1」を名乗る問題; バージョン検査
- #258 Erlang ルーターはデッドコード; JS「負荷テスト」が偽のカバレッジを与える
- #259 tracker/replay ホットパスのフレーム毎アロケーション

### CI、テスト、サプライチェーン

- #257 実行可能なクロス言語 KGM1B 適合性テスト
- #260 依存関係/脆弱性スキャン; モデルハッシュの固定
- #261 出荷物を CI でビルドする(Tauri バンドル、Docker、clippy、--locked)
- #262 ネットワーク入力を受けるバイナリパーサのファズ/プロパティテスト
- #263 tracker.js/viewer.js のテストカバレッジゼロ
- #264 自動化可能な品質ゲートの CI 強制

### ドキュメントとプロダクト

- #265 ライセンス矛盾(0BSD と紛れ込んだ MIT)
- #266 BACKLOG チェックボックスの実態合わせ; 古い台帳の更新
- #267 ランタイム EN/JA 文字列ローカライズ

### 研究適用 (2024-2026 文献)

- #268 音声→ARKit リップシンクモデル (wav2arkit_cpu, LAM_Audio2Expression, Audio2Face-3D)
- #269 ONNX バックエンド向け RTMW/RTMW3D 全身モデル
- #270 学習型平滑化フィルタ (FLK, HPSTM) と One Euro の比較
- #271 手: WiLoR 検出器、ReJSHand
- #272 MediaPipe tasks-vision 1.0.0-rc カナリア
- #273 顔品質モード(SMIRK 系)と MobileGaze 視線
- #274 2026 トランスポート戦略: WebTransport Baseline 化、MoQ secure-objects
- #275 nijigenerate/nijilive フォーク後の Inochi2D 戦略
- #276 three.js WebGPURenderer + MToonNodeMaterial 移行
- #277 KGM2 ビットレート: 量子化デルタ+エントロピー符号化 vs ニューラルトークナイザ
- #278 MIDI 駆動アバタードラミングと高速モーション技術

## 研究状況ハイライト (2026年中頃)

- リップシンク: 単一ファイル ONNX の音声→52ブレンドシェイプモデルが登場
  (wav2arkit_cpu; LAM_Audio2Expression)。NVIDIA は 2025年9月に
  Audio2Face-3D をオープンソース化。
- 全身: RTMW/RTMW3D(Apache-2.0、公式 ONNX エクスポート)は1モデルで
  体・手・顔の133キーポイントをカバー。
- 平滑化: FLK(学習キネマティクス・カルマン)が最も実用的な One Euro
  後継。HPSTM は解剖学的制約付きトランスフォーマー平滑化を追加。
- 手: WiLoR の軽量検出器はオクルージョン下で BlazePalm を上回る。
  ReJSHand は 72 fps のエッジ MANO メッシュを実現。
- 顔: MediaPipe のブレンドシェイプモデルは2023年から不変。SMIRK 系
  キャプチャが現実的な品質向上策だが、FLAME ライセンスが関門。
- トランスポート: WebTransport は 2026年3月に Baseline 到達
  (Safari 26.4)。MoQ transport はドラフト -17/-18 で本番リレーが存在
  するが RFC 未満。draft-ietf-moq-secure-objects が E2EE の参照仕様。
- ランタイム: onnxruntime-web の WebGPU EP は本番品質。WebNN は依然
  オリジントライアル。MediaPipe tasks-vision は 1.0.0-rc ナイトリーを公開中。
- レンダリング: three.js WebGPURenderer が本番推奨。three-vrm 3.5.x は
  MToonNodeMaterial 経由で対応。Inochi2D コミュニティは
  nijigenerate/nijilive にフォーク。
- 圧縮: meshoptimizer が v1.0 到達。KHR_meshopt_compression は存在するが
  ローダー対応が薄く、EXT_meshopt_compression が引き続きデフォルト。

## 確認済みの安全事項

監査時点で既に最新と確認: quinn-proto 0.11.16(RUSTSEC-2026-0037 修正済み)、
ws 8.21.0(CVE-2026-45736/48779 修正済み)、wtransport 0.7.1、
tauri-plugin-shell は非依存。これが偶然ではなく自動的に維持されるよう
#260 を登録した。
