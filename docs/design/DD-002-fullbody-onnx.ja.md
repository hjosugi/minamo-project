<!-- i18n: language-switcher -->
[English](DD-002-fullbody-onnx.md) | [日本語](DD-002-fullbody-onnx.ja.md)

# DD-002: ONNX Runtime Webによるフルボディバックエンド

ステータス: 研究設計。バックログ: KGM-023。

## 問題

MediaPipe Pose (BlazePose) は高速ですが、その33キーポイントの精度は、ストリーミングセットアップで一般的な座位、遮蔽、側面のポーズで劣化します。より強力なポーズモデル（YOLO-poseファミリー、RTMPose）がONNXとして存在し、現在はONNX Runtime Webを通じてWebGPU上でブラウザ内で実行されます。

## 目標

- プラグ可能なポーズバックエンドインターフェース; MediaPipeがデフォルトのまま。
- 中程度のdGPUで30 fpsのフルボディ; 失敗ではなく、低いfpsでの優雅なCPU/WASMフォールバック。
- プライバシー特性を保持: 推論はデバイス上に留まる。

## バックエンドインターフェース

```
interface PoseBackend {
  init(opts): Promise<void>
  detect(video: HTMLVideoElement, tMs: number): CanonicalPose | null
  dispose(): void
}
// CanonicalPose: メートル単位の名前付きキーポイント (COCO-17スーパーセット),
// ヒップ中心、+Y上、各ポイントの信頼度付き。
```

ソルバーとコーデックはCanonicalPoseのみを参照します。バックエンド: `mediapipe` (今日)、`onnx-yolo-pose`、`onnx-rtmpose`。

実装されたTypeScript境界は`src/core/ml.ts`にあります:

- `PoseBackend`
- `OnnxModelSpec`
- `OnnxRuntimeAdapter`
- `chooseExecutionProvider()`
- `createModelExportManifest()`

## モデル候補

| モデル | ポイント | 実装時に確認するノート |
|---|---|---|
| YOLO11-pose (n/s) | 17 | 一段階、前処理/後処理が簡単; AGPLライセンスの影響を確認 |
| RTMPose (t/s) | 17/26 | トップダウン、人物検出ステージが必要; 寛容なライセンス |
| MoveNet Thunder | 17 | TF起源、簡単な変換、古い |

ライセンスは一級の選択基準です: AGPLモデルはデフォルトビルドに出荷できません; ユーザー側のプラグインとして使用できます。

## パイプライン

1. WebGPUで前処理（レターボックス、正規化）を行い、CPUコピーを回避します。
2. `webgpu`実行プロバイダー、fp16ウェイトを使用したORT Webセッション; 精度検証後にint8をストレッチゴールとして設定。
3. JSまたは小さなWGSLカーネルで後処理（1段階モデル用のNMS）。
4. 2Dキーポイントを擬似3Dに持ち上げる: 両方が実行されているときにMediaPipeのワールドランドマークを再利用するか、小さな学習されたリフティングMLP（研究タスク）。

## 評価計画

固定された録画クリップ（KGM-047フィクスチャ）を以下の基準でスコアリングします: キーポイントの安定性（静止時の時間的変動）、座位ポーズの妥当性（手動ルーブリック）、3つのGPUティアでのfpsとVRAM。結果テーブルはドキュメントにコミットされます。

`summaryModelBenchmark()`を使用してコミットされたベンチマークテーブルを作成し、WebGPU、WASM、およびCPUフォールバックの結果を比較可能にします。

## リスク

- WebGPUの可用性（設計時にSafariの安定したパスはまだなし）: バックエンドはオプションのままで、必須ではありません。
- 2D専用モデルはBlazePoseが提供するメトリックワールド座標を失います; リフティングステップは難しい研究部分であり、KGM-024の品質を制約します。