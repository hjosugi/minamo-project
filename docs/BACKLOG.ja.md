<!-- i18n: language-switcher -->
[English](BACKLOG.md) | [日本語](BACKLOG.ja.md)

# Minamo バックログ

Issue 対応可能なバックログ。各エントリは同じ固定フォーマットに従っており、
自動的に GitHub Issues にパース・登録できます。
`docs/ISSUE_REGISTRATION_PROMPT.md` を登録プロンプトとして参照してください。

フォーマット契約（変更不可。登録スクリプトが依存しています）:

```
### [KGM-NNN] <issue title>
- Labels: <comma-separated labels>
- Priority: P0 | P1 | P2 | P3
- Effort: S | M | L | XL
- Milestone: <milestone name>
- Design doc: <path or "-">

<body: one or more paragraphs>

Acceptance criteria:
- [ ] <criterion>
```

ラベル分類: `area/tracking`, `area/body`, `area/protocol`,
`area/transport`, `area/render`, `area/audio`, `area/tooling`,
`area/app`, `area/infra`, `area/docs` と `type/feature`, `type/bug`,
`type/chore`, `type/research`。

マイルストーン: `M0 Foundation`, `M1 Face quality`, `M2 Body and hands`,
`M3 Protocol v2`, `M4 Scale-out`, `M5 Render backends`, `M6 Product`。

---

## M0 Foundation

### [KGM-001] 共有モジュール用の lint・ユニットテスト付き CI パイプライン
- Labels: area/infra, type/chore
- Priority: P0
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

GitHub Actions を追加: ESLint + Prettier チェック、Node ベースのユニットテストを
`shared/codec.js`（エンコード/デコードのラウンドトリップ、クランプ、切り詰めバッファ）と
`shared/filters.js`（One Euro 収束、クォータニオン半球処理）に対して実施。
codec のラウンドトリップテストは既にアドホックスクリプトとして存在するので、
正式なテストランナー（`node:test`）に移動する。

Acceptance criteria:
- [ ] `pnpm test` で codec と filter のテストがローカル・CI 両方で実行される
- [ ] CI は lint エラーで失敗する
- [ ] ラウンドトリップテストは FACE, FACE+POSE, 空ブロックフレームをカバー

### [KGM-002] Codec の堅牢性: ファズ・異常パケットテスト
- Labels: area/protocol, type/chore
- Priority: P1
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

`decodeFrame` は敵対的入力（ランダムバイト、切り詰めヘッダー、間違った magic、バージョン、
過剰なポイント数）で決して throw しないこと。ランダム・変異バッファを feed し、
null または有効な出力をアサートするファズテストを追加。

Acceptance criteria:
- [ ] 100万個のランダムバッファで例外なくデコードできる
- [ ] 有効フレームの変異（ビット反転）も例外なくデコードできる
- [ ] ドキュメント化された契約: decode は無効入力で必ず null を返す

### [KGM-003] MediaPipe WASM とモデルを SRI 付きでローカルベンダリング
- Labels: area/infra, type/feature
- Priority: P1
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

トラッカーは現在 WASM と `.task` モデルを CDN からロードしている。
`scripts/fetch-models.sh` で固定バージョンを `vendor/` にダウンロードし、
ローカルで提供、なければ CDN にフォールバック。CDN パスには Subresource Integrity ハッシュを追加。
これによりオフライン利用と upstream 変更への保護が可能。

Acceptance criteria:
- [ ] `fetch-models.sh` 実行後、トラッカーは外部ネットワークなしで動作
- [ ] CDN フォールバックも動作継続
- [ ] バージョンは一箇所で固定管理

### [KGM-004] 機能・権限エラー時の丁寧な UX
- Labels: area/tooling, type/feature
- Priority: P0
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

検出・説明: カメラ権限拒否、カメラデバイスなし、WebGL2 なし、WebTransport なし（wt モード非表示）、
非セキュアコンテキスト（getUserMedia は HTTPS または localhost 必須）。
各ケースごとに具体的なメッセージと修正ヒントをステージヒント領域に表示（コンソールエラー不可）。

Acceptance criteria:
- [ ] 各障害モードごとに具体的なアクション可能なメッセージを表示
- [ ] WebTransport がない場合 wt モードオプションは無効化
- [ ] 非セキュアコンテキスト時は HTTPS 開発ドキュメント（KGM-012）へのリンクあり

### [KGM-005] カメラデバイス・解像度・フレームレートセレクター
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

`mediaDevices.enumerateDevices` でデバイスを列挙し、ユーザーがカメラ・解像度（480p/720p/1080p）・
ターゲット fps（30/60）を選択できるようにし、ストリームをライブで再オープン（トランスポート接続は維持）。

Acceptance criteria:
- [ ] `devicechange` でデバイスリストが更新される
- [ ] デバイス切り替え時にページリロード不要
- [ ] 選択した制約が stats ラインに表示される

### [KGM-006] トラッカー・ビューア設定の永続化
- Labels: area/tooling, type/feature
- Priority: P2
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

モード、ルーム、wt url、cert hash、ミラー、ポーズフラグ、フィルタプリセット、選択カメラを
localStorage に保存。ロード時に復元。リセットボタン追加。

Acceptance criteria:
- [ ] リロードで前回セッション設定が復元される
- [ ] リセットでデフォルトに戻る

### [KGM-007] ビューアジッターバッファ（ラップ対応シーケンス処理）
- Labels: area/render, type/feature
- Priority: P1
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

データグラムは順不同で到着する。RFC 1982 スタイルの 16bit wrap 比較で最新フレームのみ保持し、
古いフレームはドロップ。HUD（KGM-049）に損失・再順序カウンタを表示。
イージング定数は受信フレームレートに適応し、30fps ソースは遅く見えず、60fps ソースは硬くならない。

Acceptance criteria:
- [ ] 順不同フレームでアバターが後ろに戻ることはない
- [ ] seq の 65535 -> 0 ラップを正しく処理
- [ ] イージングは 24-60fps ソース間で適応

### [KGM-008] リレー用ルームアクセス・トークン
- Labels: area/transport, type/feature
- Priority: P1
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

ルーム名を知っていれば誰でも publish できる。オプションでトークン追加:
リレーはシークレットで起動、publishers は `?token=`（ws）またはパスセグメント（wt）を提示。
subscribers もオプションで。コンスタントタイム比較。

Acceptance criteria:
- [x] relay-node と relay-rs 両方でトークン対応
- [x] トラッカー・ビューア UI にトークンフィールドあり
- [x] 間違ったトークンは明確なコードで接続を閉じる

### [KGM-009] relay-rs の CI ビルド・統合テスト
- Labels: area/infra, type/chore
- Priority: P0
- Effort: M
- Milestone: M0 Foundation
- Design doc: -

Rust リレーは現在レビュー済みソースのみ。CI で `cargo build` と
ネイティブ WebTransport クライアント（wtransport client feature）による pub -> sub echo の
KGM1 フレーム統合テストを実施。

Acceptance criteria:
- [x] CI で cargo build + clippy + fmt 実行
- [x] pub/sub 統合テストが CI でパス
- [x] README バッジがビルドステータスを反映

### [KGM-010] relay-rs・relay-node: ルームガベージコレクション
- Labels: area/transport, type/bug
- Priority: P1
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

relay-rs は rooms map からエントリを削除しないため、長時間稼働で
ルーム名ごとにブロードキャストチャネルがリークする。最後の参加者が離脱したら
（receiver_count == 0 かつ publisher task なし）エントリ削除。
relay-node は既に空ルーム削除済み。両方にテスト追加。

Acceptance criteria:
- [ ] 全クライアント離脱後、rooms map サイズがゼロに戻る
- [ ] GC 中にクライアント参加してもパニックしない

### [KGM-011] Docker compose によるワンコマンドセルフホスティング
- Labels: area/infra, type/feature
- Priority: P2
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

`docker compose up` で relay-node（静的サイト＋ws）と relay-rs（WebTransport）を
適切なポート・共通トークン環境変数で起動。マルチステージビルド、distroless ランタイムイメージ。

Acceptance criteria:
- [ ] compose up でサイトと両リレーを提供
- [ ] イメージは amd64・arm64 両方でビルド可能

### [KGM-012] HTTPS ローカル開発ガイド
- Labels: area/docs, type/chore
- Priority: P2
- Effort: S
- Milestone: M0 Foundation
- Design doc: -

getUserMedia は localhost 以外ではセキュアコンテキスト必須、WebTransport は HTTPS ページ必須。
mkcert セットアップ、LAN 上のスマホテスト、serverCertificateHashes 利用時に不要な Chrome フラグを
ドキュメント化。

Acceptance criteria:
- [ ] docs/DEV_HTTPS.md が存在し README からリンクされている
- [ ] スマホ LAN テスト手順が一度検証済み

## M1 Face quality

### [KGM-013] ニュートラルポーズ・表情レンジのキャリブレーション
- Labels: area/tracking, type/feature
- Priority: P0
- Effort: L
- Milestone: M1 Face quality
- Design doc: docs/design/DD-008-calibration-retargeting.md

顔は個人差あり: `jawOpen` が 0.6 を超えない人もいれば、`browDownLeft` が
0.15 で休む人もいる。ガイド付きキャリブレーション（ニュートラル保持→最大表情）で
チャンネルごとにオフセット・ゲインを算出し、フィルタ前に適用。プロファイルごとに保存。

Acceptance criteria:
- [x] 30秒ガイドフローでチャンネルごとにオフセット・ゲイン算出
- [x] キャリブレーション後ニュートラルで全チャンネル < 0.05
- [x] プロファイルは保存・ロード・JSON エクスポート可能

### [KGM-014] インタラクティブミキサー: チャンネルごとのゲイン・デッドゾーン・ミュート
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: M
- Milestone: M1 Face quality
- Design doc: docs/design/DD-008-calibration-retargeting.md

52 チャンネルメーターパネルをインタラクティブ化: チャンネルをドラッグでゲイン設定、
右クリック/長押しでミュート、小型デッドゾーンスライダー。
KGM-013 の手動補完かつデバッグ面も兼ねる。

Acceptance criteria:
- [x] チャンネルごとにゲイン 0-2x・デッドゾーン 0-0.2
- [x] 設定はキャリブレーションプロファイルと共に永続化・エクスポート
- [x] ミュートチャンネルはメーターで薄く表示

### [KGM-015] 低照度耐性・信号品質インジケーター
- Labels: area/tracking, type/feature
- Priority: P2
- Effort: M
- Milestone: M1 Face quality
- Design doc: -

入力品質（平均ルーマ、ランドマーク信頼度分散）を推定し、信号品質チップを表示。
閾値以下なら改善提案（照明・カメラ）。対応機種では `exposureMode`/`brightness` 制約も試す。

Acceptance criteria:
- [x] 品質チップ: 良好 / 劣化 / 不良＋理由
- [x] 通常室内照明で誤「不良」なし

### [KGM-016] アイリスランドマークによる真の視線
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: L
- Milestone: M1 Face quality
- Design doc: -

現在の視線は eyeLook* blendshape 由来で、飽和・まばたきと混ざる。
Face Landmarker はアイリスランドマーク（468-477）を出力するので、
アイリス中心と目輪郭から視線ベクトルを算出、5点ターゲットフローでキャリブレーションし、
viewer の lookAt に供給（新規オプション KGM2 フィールド）。

Acceptance criteria:
- [x] キャリブレーション後、画面上のターゲットを約5度以内で追従
- [x] まばたきで視線スパイクなし
- [x] アイリス未取得時は blendshape 視線にフォールバック

### [KGM-017] 頭距離マッピング・位置安定化
- Labels: area/tracking, type/feature
- Priority: P2
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

頭の z 移動をアバターの微妙な前傾・後傾にマッピング（範囲設定可能）、
位置ドリフトはゆっくり再センタリングして長時間配信でもアバターが枠内に留まるようにする。

Acceptance criteria:
- [x] 前傾範囲は 0-20cm 設定可能、デフォルトは控えめ
- [x] 1時間セッションで目立つドリフトなし

### [KGM-018] まばたきヒステリシス・ウィンク判別
- Labels: area/tracking, type/feature
- Priority: P1
- Effort: M
- Milestone: M1 Face quality
- Design doc: -

Webcam blendshape は両目間クロストークあり: ウィンクが 0.7/0.4 で読まれることが多い。
小型ステートマシン追加: 開閉ヒステリシス閾値、ウィンク判別（片目が他より明確に低い状態が N フレーム続くと
開いている方を open にスナップ）。

Acceptance criteria:
- [x] 意図的ウィンクは 50回手動テストで >90% ウィンク判定
- [x] 通常まばたきは左右対称
- [x] 半開状態でちらつきなし

### [KGM-019] フィルタプリセット・ライブ調整パネル
- Labels: area/tracking, type/feature
- Priority: P2
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

One Euro（minCutoff, beta）をプリセットで公開: 「レスポンシブ」「バランス」「スムーズ」＋
詳細パネル（スライダー・ライブ遅延/ジッター表示）でトレードオフを可視化。

Acceptance criteria:
- [x] 3プリセットはトラッキング中に切替可能
- [x] 詳細スライダーは再起動不要で適用

### [KGM-020] トラッキングロス時のフェード・再取得イージング
- Labels: area/tracking, type/bug
- Priority: P1
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

顔が失われた時（遮蔽・フレーム外）は最後のフレームがフリーズ、
再取得時はアバターがスナップする。ロス時は約400msでニュートラルへフェード、
再取得時はフィルタリセット・約250msでイージング復帰。

Acceptance criteria:
- [x] カメラを覆うとアバターが滑らかにニュートラルへ戻る
- [x] 再入時にスナップなし

### [KGM-021] 複数顔選択ポリシー
- Labels: area/tracking, type/bug
- Priority: P2
- Effort: S
- Milestone: M1 Face quality
- Design doc: -

2人フレームイン時、トラッキングが顔間でジャンプすることがある。
前回トラッキング顔とバウンディングエリアが重なる顔を優先（スティッキー）、なければ最大顔。
オプションで顔ロック矩形追加。

Acceptance criteria:
- [x] 背後を通過する2人目でトラッキングが奪われない
- [x] ロック領域はセッション間で永続化

## M2 Body and hands

### [KGM-022] 手トラッキング・KGM2 HAND ブロック
- Labels: area/body, type/feature
- Priority: P1
- Effort: XL
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-001-hand-tracking.md

MediaPipe Hand Landmarker（21ランドマーク×2手）→指ごとカール＋手首ポーズ→KGM2 HAND ブロック→VRM 指ボーン。
ソルバー・エンコード（16バイト/手ターゲット）・スケジューリング（手は30fps、顔は60fpsで交互）詳細は設計書参照。

Acceptance criteria:
- [x] 開閉・指差し・ピースが VRM 指で正しく再現
- [x] 手有効時でも顔 fps がミドル GPU で 50 を下回らない
- [x] 手なし時はブロック省略・ゼロコスト

### [KGM-023] ONNX Runtime Web（YOLO11-pose / RTMPose）による全身バックエンド
- Labels: area/body, type/research
- Priority: P2
- Effort: XL
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-002-fullbody-onnx.md

WebGPU 上で ONNX Runtime Web を用いた高性能ポーズバックエンドを評価・統合。
MediaPipe と同じソルバーインターフェースで、目標は全身26+キーポイントを
ミドル dGPU で30fps。設計書にモデル候補・ライセンス・量子化（fp16/int8）・バックエンド抽象化記載。

Acceptance criteria:
- [ ] バックエンドインターフェース: `detect(video, t) -> canonical keypoints`
- [ ] ONNX モデル1つ統合・ランタイム切替可能
- [ ] ベンチマーク表（fps, VRAM）を docs にコミット

### [KGM-024] 腕回転ソルバー（実験的 pose のアップグレード）
- Labels: area/body, type/feature
- Priority: P1
- Effort: L
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-001-hand-tracking.md

肩スウェイ仮実装を置換: 肩・肘・手首ワールド座標から上腕・前腕回転を算出（Kalidokit風）、
関節リミット・半球判別・ボーンごとスムージング。VRM 正規化ボーンに供給。

Acceptance criteria:
- [x] 手振り・腕交差・休憩ポーズが VRM で自然
- [x] 手首が肩付近を通過しても肘ポップなし
- [x] トグルでスウェイのみモードに綺麗にフォールバック

### [KGM-025] 座り/立ちモード・ヒップアンカー
- Labels: area/body, type/feature
- Priority: P2
- Effort: M
- Milestone: M2 Body and hands
- Design doc: -

配信者は座ることが多い。座りモードは下半身ノイズ無視・ヒップ固定・肩中心から傾き算出。
立ちモードはヒップ移動を小範囲でマッピング。

Acceptance criteria:
- [x] 座りモードで脚フレーム外時に脚ジッターなし
- [x] モードはプロファイルごとに永続化

### [KGM-026] 指カール→VRM 指ボーンマッピング
- Labels: area/body, type/feature
- Priority: P2
- Effort: M
- Milestone: M2 Body and hands
- Design doc: docs/design/DD-001-hand-tracking.md

指ごとカール値（0-1）＋親指対向を、手ごと15 VRM 指ボーンに自然なカップリングカーブでマッピング
（近位主導・遠位追従）。

Acceptance criteria:
- [x] カール 0/0.5/1 で自然な開/半分/拳
- [x] VRM0・VRM1 両モデルで動作

## M3 Protocol v2

### [KGM-027] KGM2: smallest-three クォータニオンパッキング
- Labels: area/protocol, type/feature
- Priority: P2
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: docs/design/DD-006-kgm2.md

クォータニオンを smallest-three（2bit index + 3x10bit）= 4バイトでパックし、
8バイトから半減。手・体ブロックで多数の回転を持つ前提。

Acceptance criteria:
- [x] 100万ランダム回転で最大角度誤差 < 0.5度
- [x] JS encode+decode がクォータニオン1つあたり < 1us

### [KGM-028] KGM2: 周期キー付きデルタフレーム
- Labels: area/protocol, type/feature
- Priority: P2
- Effort: L
- Milestone: M3 Protocol v2
- Design doc: docs/design/DD-006-kgm2.md

ほとんどのチャンネルはフレーム間でほぼ変化しない。前回キーに対するデルタをエンコードし、
Nフレームごとにキー（損失回復境界）。典型的な顔ストリームで約40%サイズ削減目標。
損失時は次キーまで劣化のみで、状態レスを維持。

Acceptance criteria:
- [x] 録画セッションコーパスで平均フレームサイズ >= 35% 削減
- [x] 10% ランダム損失は1キー間隔で回復
- [x] デコーダは未受信キー基準のデルタを拒否

### [KGM-029] KGM2: スパースチャンネルマスク
- Labels: area/protocol, type/feature
- Priority: P3
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: docs/design/DD-006-kgm2.md

52bit（7バイト）プレゼンスマスクで、エンコーダが変化閾値超のみ送信可能。
デルタと組み合わせ、低消費電力モード向け。

Acceptance criteria:
- [x] マスク付きフレームは変化なしチャンネルを保持してデコード
- [x] アイドル顔フレームは30バイト未満

### [KGM-030] マルチソースシーン用送信者クロック同期
- Labels: area/protocol, type/feature
- Priority: P3
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: -

コラボルーム（KGM-043）は独立クロックのソースを混合。
軽量オフセット推定（リレーが受信時刻をエコー、または NTP風プローブフレーム）で
~10ms 内でソースを整列。

Acceptance criteria:
- [x] 1画面上の2ソースで位相ズレが目視できない
- [x] ws・wt 両方で動作

### [KGM-031] Rust・Python 参照 codec 実装
- Labels: area/protocol, type/chore
- Priority: P2
- Effort: M
- Milestone: M3 Protocol v2
- Design doc: -

`kgm-codec` crate/package を提供し、リレーでフレーム検査やツール（レコーダ・解析）が
ブラウザ外でも書けるように。JS 実装から生成したゴールデンベクトルでクロス言語テスト。

Acceptance criteria:
- [x] Rust・Python が JS ゴールデンベクトルをビット単位でデコード
- [x] ワークスペースメンバーとして公開（レジストリ未登録）

## M4 Scale-out

### [KGM-032] 大規模ファンアウト用 Elixir クラスタリレー
- Labels: area/transport, type/feature
- Priority: P2
- Effort: XL
- Milestone: M4 Scale-out
- Design doc: docs/design/DD-005-elixir-relay-cluster.md

Rust リレーは1配信者ルームのみ。数千人視聴・複数地域対応には BEAM クラスタ構築:
Phoenix.PubSub でノード間ファンアウト、エッジノードは WebTransport（Rust NIF またはサイドカー）・
WebSocket をネイティブで終端。KGM フレームはバイナリのまま。設計書にトポロジ・バックプレッシャー・
Rust サイドカー vs NIF の決定記載。

Acceptance criteria:
- [x] 1配信者→3ノードで5000人購読、p99 リレー遅延 < 30ms（ラボ）
- [x] ノード喪失時はそのノードの購読者のみ切断
- [x] 負荷テストハーネスをコミット

### [KGM-033] relay-rs の可観測性: メトリクス・構造化ログ
- Labels: area/transport, type/chore
- Priority: P2
- Effort: S
- Milestone: M4 Scale-out
- Design doc: -

Prometheus エンドポイント: ルーム数・接続数・入出力データグラム・ドロップカウンタ・
ファンアウト遅延ヒストグラム。tracing-subscriber JSON ログ。

Acceptance criteria:
- [x] /metrics がスクレイプ可能
- [x] Grafana ダッシュボード JSON をコミット

### [KGM-034] 混雑対応の購読者ごと最新のみ配信
- Labels: area/transport, type/feature
- Priority: P1
- Effort: M
- Milestone: M4 Scale-out
- Design doc: -

遅い購読者には最新フレームのみ配信し、キューが増大しないようにする。
ルームごとのブロードキャストバッファを購読者ごと1スロットメールボックス（最新フレーム優先）＋
ドロップカウンタに置換。

Acceptance criteria:
- [x] 人為的に遅い購読者でも再接続なしで1フレーム以内遅延
- [x] 速い購読者は影響なし（遅延追加なし）

### [KGM-035] MoQ（Media over QUIC）配信評価
- Labels: area/transport, type/research
- Priority: P3
- Effort: L
- Milestone: M4 Scale-out
- Design doc: -

KGM ストリームを MoQ トラック/オブジェクトにマッピングし、CDN規模リレー配信を評価。
成果物は設計・遅延計測・go/no-go 推奨をまとめたレポートと
公開 MoQ リレーへのプロトタイプ（プロダクションコード不要）。

Acceptance criteria:
- [x] レポート: マッピング設計・遅延計測・推奨

### [KGM-036] 自動トランスポートネゴシエーション・ダウングレード
- Labels: area/transport, type/feature
- Priority: P1
- Effort: M
- Milestone: M4 Scale-out
- Design doc: -

クライアントは wt を試し、UDP ブロックや Safari では自動的に ws にフォールバック。
指数バックオフで再接続、room+token でセッション再開、UI に「劣化トランスポート」表示。

Acceptance criteria:
- [x] UDP ブロック時、アクティブセッションが3秒以内に ws に切替
- [x] UI はアクティブトランスポートを正確に表示

### [KGM-037] トラッキングフレームのエンドツーエンド暗号化
- Labels: area/transport, type/feature
- Priority: P3
- Effort: L
- Milestone: M4 Scale-out
- Design doc: -

モーションデータはバイオメトリックに近いので、リレーが読めないようにする。
ルームキー E2EE: XChaCha20-Poly1305（WebCrypto/libsodium.js）、キーは外部で共有（room URL フラグメント）。
リレーは暗号文をそのまま転送、seq・timestamp はペイロード内に移動、最小限の外部ヘッダーのみ。

Acceptance criteria:
- [x] リレーはフレームをデコード不可（テストで暗号文アサート）
- [x] オーバーヘッド <= 24バイト/フレーム
- [x] 間違ったキー購読者は明確なエラー表示（モーションが壊れない）

## M5 Render backends

### [KGM-038] inox2d WASM による Inochi2D バックエンド
- Labels: area/render, type/feature
- Priority: P2
- Effort: XL
- Milestone: M5 Render backends
- Design doc: docs/design/DD-004-inochi2d.md

ビューアで `.inp/.inx` 2D パペットを inox2d を WASM 化（wgpu/WebGL バックエンド）してレンダリングし、
KGM チャンネルを Inochi2D パラメータにマッピング。
高品質2Dパスで Live2D スタイル用途をオープンフォーマットでカバー。

Acceptance criteria:
- [x] サンプル Inochi2D パペットが head＋blink＋mouth を追従
- [x] アバターファイル拡張子ごとにバックエンド選択可能
- [x] パラメータマッピングは編集・エクスポート可能（KGM-044 フォーマット共有）

ランタイム基準は #229 でカバー。実際のパペットの見た目・性能証拠は #230 で別管理。

### [KGM-039] レイヤードPNG擬似2.5Dモード（PNGTuber 相当）
- Labels: area/render, type/feature
- Priority: P2
- Effort: L
- Milestone: M5 Render backends
- Design doc: -

ゼロアセットアバター: ユーザーが PSD またはレイヤードPNG（体・目開閉・口開閉・眉）をドロップ。
head yaw/pitch でレイヤーごとパララックスオフセット、blink・jawOpen でレイヤー切替、
スクワッシュ＆ストレッチイージング。

Acceptance criteria:
- [ ] PSD インポート（ag-psd）＋レイヤー名規則をドキュメント化
- [ ] blink・mouth 切替がトラッキングと同期
- [ ] レイヤーごとパララックス深度調整可能

### [KGM-040] OBS 対応出力: 透過・プリセットURL
- Labels: area/render, type/feature
- Priority: P0
- Effort: S
- Milestone: M5 Render backends
- Design doc: -

ビューアクエリパラメータ: `?bg=transparent`（アルファキャンバス＋床なし）、`?hud=0`、
カメラ固定。OBS Browser Source レシピ（カスタムCSS・解像度）をドキュメント化。
これ一つで Minamo が実配信で利用可能になる。

Acceptance criteria:
- [ ] OBS Browser Source で透過背景を検証
- [ ] `?hud=0` で HUD 完全非表示
- [ ] README にコピペ可能な OBS 設定セクション

### [KGM-041] アバターアセットパイプライン: meshopt/Draco＋KTX2
- Labels: area/render, type/feature
- Priority: P3
- Effort: L
- Milestone: M5 Render backends
- Design doc: -

ホストアバター用に CLI（`minamo-pack`）を追加し、gltfpack（EXT_meshopt_compression）または Draco、
KTX2/BasisU テクスチャエンコードを VRM ファイルに実施。ビューアで three.js ローダーを連携。
典型的 VRM は 60-80% 縮小、テクスチャは GPU 上で圧縮維持。

Acceptance criteria:
- [ ] パック済み VRM がビューアで見た目同一でロード
- [ ] サイズ・GPUメモリ前後比較表を docs に記載
- [ ] スプリングボーン・表情データもパイプライン通過

### [KGM-042] シーンプリセット: ライティング・背景・ポストFX
- Labels: area/render, type/feature
- Priority: P3
- Effort: M
- Milestone: M5 Render backends
- Design doc: -

ライティングプリセット3種（ソフトキー・アニメリム・フラット）、背景色/画像/透過、
オプションでブルーム・ビネット。OBS 再現性のためクエリパラメータで全指定可能。

Acceptance criteria:
- [ ] プリセットはライブ切替可能
- [ ] シーン状態はURLで完全シリアライズ可能

### [KGM-043] マルチアバタールーム（コラボレンダリング）
- Labels: area/render, type/feature
- Priority: P2
- Effort: L
- Milestone: M5 Render backends
- Design doc: -

1ルームに複数配信者、1ビューアで並列レンダリング。
トランスポート層でソースごと識別（リレーが source id タグ付与、または KGM2 に source フィールド追加）、
ソースごとアバター割当・レイアウトスロット。

Acceptance criteria:
- [ ] 2トラッカーで1ビューアに2アバター表示
- [ ] ソースごと異なるアバターファイル割当可能
- [ ] ソース切断時はアバターがフェードアウト

### [KGM-044] Perfect Sync マッピングエディタ
- Labels: area/render, type/feature
- Priority: P1
- Effort: L
- Milestone: M5 Render backends
- Design doc: docs/design/DD-008-calibration-retargeting.md

多くの VRM は 52 ARKit 名表情（Perfect Sync）を持つ。存在時は1:1で自動利用。
他はマッピングエディタを提供: ソースチャンネル→ターゲット表情＋ウェイトカーブ、
アバターごとに JSON 保存・ロード、共有しやすいフォーマット。

Acceptance criteria:
- [ ] Perfect Sync モデルは自動検出・1:1駆動
- [ ] エディタでマッピング編集・アバターがライブ反応
- [ ] マッピング JSON はラウンドトリップ可能

## M6 Product

### [KGM-045] 音声リップシンクと視覚トラッキングの融合
- Labels: area/audio, type/feature
- Priority: P1
- Effort: XL
- Milestone: M6 Product
- Design doc: docs/design/DD-003-audio-lipsync.md

マイク→AudioWorklet でビジーム推定、視覚 jaw/mouth チャンネルと融合
（発話時は音声優先、形状は視覚優先）。設計書にフォルマントベース・小型ML方式・融合ルール記載。

Acceptance criteria:
- [ ] 静止顔で話しても自然な口動作
- [ ] 音声→アバター遅延 < 80ms
- [ ] オフライン動作（クラウドASR不要）

### [KGM-046] 音声活動による表情アクセント
- Labels: area/audio, type/feature
- Priority: P3
- Effort: S
- Milestone: M6 Product
- Design doc: docs/design/DD-003-audio-lipsync.md

VAD エネルギーで発話中に微妙な強調: 眉微上げ・頭うなずき増幅。
厳密に制限し「生き生き」に見せ、ノイズにならないように。

Acceptance criteria:
- [ ] トグル可能、デフォルトオフ
- [ ] 無音時は動作なし

### [KGM-047] .kgm セッション録画・再生
- Labels: area/tooling, type/feature
- Priority: P1
- Effort: M
- Milestone: M6 Product
- Design doc: docs/design/DD-007-recording.md

KGM フレームストリームをファイル（ヘッダー＋タイムスタンプ付きフレーム）に録画、
ビューアで再生、録画をソルバー・codec 回帰テストのテストフィクスチャとして利用。
KGM-028 のコーパス要件も解決。

Acceptance criteria:
- [ ] トラッカーで録画/停止/ダウンロード、ビューアでドロップ再生
- [ ] 10分セッション < 5MB
- [ ] テストフィクスチャとして録画1つコミット

### [KGM-048] モーションクリップの VRMA へのエクスポート
- Labels: area/tooling, type/feature
- Priority: P3
- Effort: L
- Milestone: M6 Product
- Design doc: docs/design/DD-007-recording.md

.kgm 録画を VRM Animation（.vrma）クリップに変換し、他 VRM ツールで再利用可能に。
トリムUI・ループマーク。

Acceptance criteria:
- [ ] エクスポート .vrma がサードパーティ VRMA プレイヤーで再生
- [ ] 表情・頭ボーン両方エクスポート

### [KGM-049] 遅延・品質 HUD
- Labels: area/tooling, type/feature
- Priority: P2
- Effort: M
- Milestone: M6 Product
- Design doc: -

ビューア HUD: 受信 fps・損失率・再順序数・推定エンドツーエンド遅延（プローブフレームでトラッカータイムスタンプエコー）・
トランスポートモード。トラッカー HUD: 推論時間パーセンタイル。

Acceptance criteria:
- [ ] 損失・遅延値が netem 制御テストと10%以内一致
- [ ] `?hud=0` で HUD 非表示

### [KGM-050] Tauri デスクトップアプリ＋仮想カメラ出力
- Labels: area/app, type/feature
- Priority: P2
- Effort: XL
- Milestone: M6 Product
- Design doc: -

トラッカー＋ビューアを Tauri アプリとしてパッケージ。
主機能: レンダリングアバターを OS 仮想カメラとして出力し、Zoom/Meet/Discord でも利用可能（OBS だけでなく）。
OS ごと仮想カメラバックエンド調査（Linux v4l2loopback、Windows softcam、macOS CoreMediaIO extension）。

Acceptance criteria:
- [ ] アプリはオフラインでトラッカー・ビューア両方動作
- [ ] 仮想カメラが各OSの会議アプリ1つで認識
- [ ] バイナリ < 25MB（モデル除く）

### [KGM-051] スマホトラッカーモード
- Labels: area/app, type/feature
- Priority: P3
- Effort: L
- Milestone: M6 Product
- Design doc: -

スマホはノートPCより良いカメラを持つことが多い。QR ペアリング: PC ビューアが room+token+relay URL の QR を表示、
スマホがトラッカーページを開いて publish。HTTPS（KGM-012）・トランスポートネゴシエーション（KGM-036）必須。

Acceptance criteria:
- [ ] QR ペアリングで10秒以内に接続
- [ ] iOS Safari の ws フォールバック経路をドキュメント化

### [KGM-052] GitHub Pages へのデモデプロイ
- Labels: area/docs, type/chore
- Priority: P1
- Effort: S
- Milestone: M6 Product
- Design doc: -

静的サイト（トラッカー＋ビューア、ローカルモード）を GitHub Pages にデプロイし、
誰でもセットアップ不要で Minamo を試せるように。main ブランチから Pages 公開。

Acceptance criteria:
- [ ] 公開URLでローカルモードデモがエンドツーエンド動作
- [ ] README の冒頭にリンク

### [KGM-053] コントリビューションガイド・Issue テンプレート
- Labels: area/docs, type/chore
- Priority: P2
- Effort: S
- Milestone: M6 Product
- Design doc: -

CONTRIBUTING.md（開発セットアップ・コードスタイル・プロトコル変更方針）、
.github Issue テンプレート（バグ・機能・トラッキング品質レポート用標準キャプチャチェックリスト）、
PR テンプレート。

Acceptance criteria:
- [ ] テンプレートが GitHub 上でレンダリング
- [ ] トラッキング品質レポートテンプレートはカメラ・照明・fps・ブラウザを尋ねる
