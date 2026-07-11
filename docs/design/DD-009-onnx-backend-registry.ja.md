<!-- i18n: language-switcher -->
[English](DD-009-onnx-backend-registry.md) | [日本語](DD-009-onnx-backend-registry.ja.md)

# DD-009: ランタイム切り替え可能なポーズバックエンドレジストリ

ステータス: 設計 + 実装 (イシュー #23 (KGM-023))。
[DD-002](DD-002-fullbody-onnx.md) に基づいています。

## 問題

[DD-002](DD-002-fullbody-onnx.md) では `PoseBackend` インターフェースと ONNX Runtime Web プランが定義されました。KGM-023 の受け入れ基準「ランタイムで統合され、切り替え可能な ONNX モデル」を満たすために、アプリは複数のバックエンドを一つのインターフェースの背後に登録し、選択されるまで重いモデルを読み込まずにライブで切り替える場所が必要です。

## レジストリ

レジストリは [`src/core/ml.ts`](../../src/core/ml.ts) に存在します：

- `createPoseBackendRegistry(descriptors)` はバックエンドの記述子（`name`、遅延 `create()` ファクトリ、オプションの `spec`、オプションの `isDefault`）からレジストリを構築します。
- `listBackends()` は設定ドロップダウン用に登録された名前を返します。
- `setActiveBackend(name)` はバックエンドを遅延インスタンス化してアクティブにし、それを返します。再アクティブ化は既存のインスタンスを再利用します。
- `getActiveBackend()` / `activeBackendName()` は現在の状態を報告します。
- `detect(video, tMs)` はアクティブなバックエンドに委譲されるため、呼び出し元はどのバックエンドがライブであるかに依存しません。

MediaPipe はデフォルトとして登録されます（`isDefault: true`）；ONNX バックエンド（`onnx-yolo-pose`、`onnx-rtmpose`）はそれに並んで登録され、ユーザーが切り替えたときにのみセッションが読み込まれます。これにより、プライバシー特性（デバイス上での推論）と「MediaPipe がデフォルトのままで、決して後退しない」という DD-002 の保証が維持されます。

## ベンチマーキング

バックエンドは `runModelBenchmark` / `summarizeModelBenchmark`（すでに `ml.ts` にあります）を使用して比較され、fps、平均/p95 レイテンシ、ピークメモリを報告します。コミットされた比較テーブルは [../benchmarks/onnx-pose-backends.md](../benchmarks/onnx-pose-backends.md) に存在し、ONNX バックエンドがオプションから推奨に昇格される前に、実際のデバイスでの実行からデータが入力されます。

## 受け入れ基準 (KGM-023)

- [x] バックエンドインターフェース: `detect(video, t) -> canonical keypoints` (DD-002)。
- [x] ランタイム切り替え: `createPoseBackendRegistry` + `setActiveBackend` がバックエンドをライブで選択します；テストでカバーされています。
- [ ] 一つの ONNX モデルが統合され、実際のハードウェアでベンチマークされ、ベンチマークテーブルが埋められます。これは残りのハードウェア制約のステップです；レジストリ、インターフェース、ベンチマークハーネスは整っており、ライセンスされたモデルと WebGPU テストデバイスが利用可能になったときにモデル統合が行われます。このイシューはその時までオープンのままです。

## リスク

- WebGPU の可用性はブラウザによって異なります；レジストリは ONNX をオプションとして保持し、MediaPipe をデフォルトとするため、バックエンドが欠けている場合は選択肢が減るだけで、失敗にはなりません。
- ライセンス（AGPL YOLO）はバックエンドごとの選択ゲートです；AGPL モデルはユーザー側のプラグインとしてのみ使用でき、出荷されるデフォルトにはなりません。