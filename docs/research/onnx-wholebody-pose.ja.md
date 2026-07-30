<!-- i18n: language-switcher -->
[English](onnx-wholebody-pose.md) | [日本語](onnx-wholebody-pose.ja.md)

# 調査: ONNX 全身ポーズモデルとしての RTMW / RTMW3D

ステータス: issue #269 の調査パス。#222 が「配布可能なモデルを1つ選定する」前に必要なモデル選択を絞り込む。
関連: #23 (全身 ONNX), #222 (バックエンド統合),
[../design/DD-002-fullbody-onnx.md](../design/DD-002-fullbody-onnx.md),
[../design/DD-009-onnx-backend-registry.md](../design/DD-009-onnx-backend-registry.md)。

## Goal

DD-002 が挙げた YOLO11-pose と RTMPose の候補よりも、RTMW (2D 全身、133 キーポイント) または RTMW3D (単眼 3D) が #222 で統合すべきモデルかを判断する。そして #269 が本当に問うている点に答える: 1つの全身モデルが、現在トラッカーが動かしている pose モデルと hand モデルを置き換えられるか。

このパスはドキュメントレベルである。上流の情報源から確定できることを確定させ、実機実行がまだ必要な部分を正確に述べる。#222 のクローズ条件は、記録済みのミドルレンジ dGPU なしにはこのリポジトリで生成できない実測値だからである。

## Acceptance criteria

- [x] Goal が明確である。
- [x] Acceptance criteria が明確である。
- [x] 既存設計と矛盾しない: RTMW は DD-009 のレジストリ配下でオプションのバックエンドの1つとして登録され、MediaPipe がデフォルトのままで、face パイプラインは変更されない。
- [x] モデルファミリー、ライセンス、キーポイント配置、バリアント、アーキテクチャを上流から記録し、齟齬は隠さず記載した。
- [x] 推奨事項の文書化、および #222 の「1モデル」という枠組みへの影響。
- [ ] RTMW-m / RTMW3D を ONNX にエクスポートし、ハッシュ・入力形状・前後処理を記録する。**未実施** — mmpose/mmdeploy のツールチェーンが必要であり、バイトレベルの事実 (ハッシュ、ファイルサイズ) は実際に出荷される成果物から取得しなければ無価値である。
- [ ] #222 のプロトコルに従い YOLO11-pose と比較ベンチマークする。**未実施** — ハードウェア依存 (Windows、ミドルレンジ dGPU、フラグなしの WebGPU)。
- [ ] golden クリップでの MediaPipe Hand Landmarker との手キーポイント品質比較。**未実施** — 両モデルの実行が必要。
- [ ] 着座 / 側面 / オクルージョンのルーブリック。**未実施** — クリップが必要。

## Findings

### ファミリー、ライセンス、配置

- RTMW は RTMPose を **COCO-WholeBody 133 キーポイント** 配置に拡張する: body 17、feet 6、face 68、hands 42 (片手 21)。論文はカバー範囲を「顔・胴体・手・足」と記述している。
- **Apache-2.0**、mmpose 内、ONNX / TensorRT / TorchScript エクスポートとモデル zoo からのダウンロードあり。これは YOLO11-pose をデフォルトビルドから除外するライセンスゲート (DD-002 および DD-009) をクリアする。
- バリアントと報告されている COCO-WholeBody mAP (読み取り時点 2026-07-30 の上流記載):

  | バリアント | 入力 | mAP | FLOPs |
  |---|---|---|---|
  | RTMW-m | 256×192 | 58.2 | 4.3G |
  | RTMW-l | 256×192 | 66.0 | 7.9G |
  | RTMW-x | 256×192 | 67.2 | 13.1G |
  | RTMW-l | 384×288 | 70.1 | 17.7G |
  | RTMW-x | 384×288 | 70.2 | 29.3G |

- **70.2 という数値の帰属が上流で一致していない**。#269 の要約も片方を継承している。論文アブストラクトは「RTMW-l が 70.2 mAP を達成し、このベンチマークで 70 mAP を超えた最初のオープンソースモデル」と主張するが、プロジェクト README の表は 70.1 を RTMW-l@384×288、70.2 を RTMW-x@384×288 に帰属させている。[../benchmarks/onnx-pose-backends.md](../benchmarks/onnx-pose-backends.md) に数値を引用する前に、エクスポート済み成果物に対してバリアントを確認すること。
- アーキテクチャ: RTMPose バックボーンに FPN と Hierarchical Encoding Module を追加し、Cocktail14 データセット群で2段階蒸留により学習。位置特定は **SimCC** コーデックを使う — 2D ヒートマップではなく X と Y の独立した 1D 分類ヘッド2つであり、後処理は 1D ビンに対する argmax になる。安価で移植性が高く、ORT Web の後処理では生の精度よりこの点が重要である。

### top-down であるため、セッションは1つではなく2つ

RTMW は RTMPose の **top-down** パイプラインを継承する: まず人物検出器 (上流では RTMDet-nano) が動き、その切り出しに対して pose モデルが動く。これは「配布可能なモデルを1つ選定する」と書かれている #222 の最初のチェックボックスにとって、最も影響の大きい発見である:

- 動作するバックエンドには **2つ** の ONNX 成果物が必要で、それぞれにライセンス、ハッシュ、入力形状、前後処理がある。
- 30 fps という受け入れ目標は、pose モデル単体ではなく検出器と pose を合わせた **エンドツーエンド** で計測しなければならない。DD-009 の `detect(video, t)` インターフェースは呼び出し側から2段構成を隠す。これは正しい形だが、同時に作業の半分だけをベンチマークしてしまいやすくもする。
- MediaPipe Pose Landmarker は自前の検出器を同梱しているため、これはデフォルトに対する実質的な追加コストであり、等価な差し替えではない。

検出器段を受け入れる前に試す価値のある代替案: 両バックエンドが有効なときに MediaPipe の pose バウンディングボックスを切り出し供給元として再利用する。2つ目の ONNX セッションより安価だが、ONNX バックエンドをデフォルトのバックエンドに結合させるため、これを唯一の経路にはできない。

### 1モデルは3つのうち2つを置き換える (3つではない)

これが #269 の問いであり、答えは条件付きの yes である:

- **Pose (33 → 17+6)**: RTMW は MediaPipe Pose Landmarker を置き換えられる。BlazePose の 33 点より body 点は *少ない* が、トラッカーが搬送しているのは 7 点 (`shared/blendshapes.js` の `POSE_POINTS`) のみなので、点数は問題にならない。
- **Hands (片手 21)**: RTMW の片手配置は MediaPipe Hand Landmarker の 21 と同数であり、`shared/hand-math.js` (`fingerCurl`, `fingerSpread`, `fingerVector`) が消費できる可能性がある — **ただしインデックス順序が一致する場合に限る**。これは仮定せず、エクスポート済みモデルに対して検証しなければならない。
- **Face: 不可**。RTMW の顔 68 点は *ランドマーク* である。KGM1 が搬送するのは 52 個の ARKit **ブレンドシェイプ** で、MediaPipe Face Landmarker が直接生成し、表情パス全体を駆動している。ランドマークはブレンドシェイプではなく、前者から後者を導出するのは別のモデリング問題である。どの pose バックエンドが選ばれても face パイプラインは MediaPipe に留まる。

したがって RTMW は現在の3つの MediaPipe タスクのうち2つを統合する候補であり、「body + hands + face を1モデルで」という見出しはこのアプリケーションには当てはまらない。

### 世界座標のギャップは変わらない

DD-002 は既に、2D のみのモデルは BlazePose が供給する計量的な世界ランドマークを失い、その lifting ステップが KGM-024 のゲートになると記録している。RTMW 2D はこれを変えない。RTMW3D は #269 がこのファミリーを取り上げた理由 — 同じ座標分類アプローチによる単眼 3D 全身 — だが、より重く、その 3D 精度の主張は着座深度ルーブリックに対する独自の評価を要し、2D の表と並ぶサイズや速度の数値は上流に記録されていなかった。最初に統合するものにすべきではない。

### 調査中に判明した統合上の制約

- ORT Web の WebGPU 実行プロバイダは ONNX Runtime 1.17 で出荷された。現在のリリースは **1.27.0** であり、#222 の「WebGPU エントリポイントを使う」は十分にサポートされている。
- `onnxruntime-web@1.27.0` はディスク上で約 **133 MB** であり、**postinstall スクリプト** を実行する `protobufjs` を引き込む。`pnpm-workspace.yaml` は現在 `esbuild` のみに install スクリプトを許可しており、[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md) はその許可リストの変更にサプライチェーンレビューが必要と述べている。したがってこの依存関係の追加は機械的な手順ではなくレビュー対象の判断であり、#222 はそう扱うべきである。
- デスクトップの CSP は既に ORT Web が必要とするものを許可している — `script-src` に `'wasm-unsafe-eval'` が含まれ、`connect-src` が `https:` を許可する — ため、モデルや WASM の取得に CSP 変更は不要と見込まれる。
- モデル重みは既存のベンダリング経路に従う: `scripts/fetch-models.sh` と `scripts/model-pins.sha256` のピン留めダイジェストであり、既定で検証し `--update-pins` のときのみ再生成する (#260)。
- 上流は FLOPs を公開しているが成果物サイズ (MB) は公開していない。Web アプリではダウンロード予算が拘束条件になるため、ファイルサイズはエクスポート時に取得しなければならない。ドキュメントからは得られない。

## Decision

**#222 が最初に統合するモデルとして RTMW-m @256×192 を推奨する**。以下の条件付きであり、RTMW3D は最初のパスから外す。

理由: 許容的ライセンス (Apache-2.0、AGPL の YOLO11-pose とは異なる)、公式の ONNX エクスポート、1回の推論で手と体を供給できる、という3点を同時に満たす唯一の候補であること。そして SimCC の後処理がヒートマップデコードや NMS ではなく 1D argmax であり、ブラウザバックエンドで間違えうるコードが最も少ないこと。RTMW-m を起点とするのは 4.3G FLOPs で最小だからだが、その 58.2 mAP は 70 点台の見出しより大幅に低いため、`-m` で着座ルーブリックが不合格なら次は `-l@256×192` (66.0, 7.9G) であり、最後の数点のために 2〜4 倍の計算量となる 384×288 バリアントではない。

#222 が受け入れるべき帰結:

1. 「配布可能なモデルを1つ」というチェックボックスは **2つ** の成果物 (検出器と pose) になり、それぞれにライセンス・ハッシュ・形状・前後処理の記録が必要で、fps 目標はエンドツーエンドで計測する。
2. pose モデルと (インデックス順序の検証待ちで) hand モデルを置き換える。face パイプラインには触れず、issue はそう示唆すべきではない。
3. `onnxruntime-web` の追加には install スクリプト許可リストの拡大が必要で、`DEPENDENCY_POLICY.md` はコードが入る前にこれをサプライチェーンレビューに回す。

意図的に未解決のまま残すもの: すべての実測量。エクスポートハッシュ、成果物サイズ、fps、p95 レイテンシ、VRAM、MediaPipe との手キーポイント一致度、着座 / 側面 / オクルージョンのルーブリックは、いずれも #222 が指定する実機とクリップを要する。よって [../benchmarks/onnx-pose-backends.md](../benchmarks/onnx-pose-backends.md) は該当セルを推定値ではなく `pending` のままにする。誰も計測していない数値は空欄より悪い。空欄はゲートについて正直だからである。

## Sources

- RTMW: Real-Time Multi-Person 2D and 3D Whole-body Pose Estimation —
  <https://arxiv.org/abs/2407.08634>
- mmpose RTMPose プロジェクト (バリアント表、エクスポート、ライセンス) —
  <https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose>
- RTMPose (SimCC コーデック、RTMDet 検出器との組み合わせ) —
  <https://arxiv.org/abs/2303.07399>
- ONNX Runtime Web の WebGPU 提供状況 —
  <https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/>
