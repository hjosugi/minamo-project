<!-- i18n: language-switcher -->
[English](ARCHITECTURE_TARGET.md) | [日本語](ARCHITECTURE_TARGET.ja.md)

# ターゲットアーキテクチャ

> **他のドキュメントとの関係:** [ARCHITECTURE.md](ARCHITECTURE.md)
> は、現在実装されているアーキテクチャを説明しています。このドキュメントは、バックログが目指す
> ターゲットステートパイプライン（ハンズ、ドラム、カスタムMLバックエンド、Erlang/Elixir
> ルーティング）です。

## 1. 概要

KGM1は、ローカルファーストのリアルタイムトラッキングパイプラインです。

```text
Webcam / mic
  -> capture scheduler
  -> ML inference adapters
      -> Face Landmarker
      -> Hand Landmarker
      -> Pose Landmarker
      -> YOLO / ONNX custom detectors
  -> signal normalization
  -> quality gate
  -> stabilizer
      -> One Euro Filter
      -> Kalman / temporal prediction
      -> anatomy constraints
      -> occlusion recovery
      -> avatar rig constraints
  -> derived signals
      -> per-finger states
      -> eye and mouth states
      -> drum hit events
  -> KGM1 frame encoder
  -> local renderer / OBS / WebTransport
```

## 2. 主要サブシステム

### 2.1 キャプチャ

責任:

- カメラを選択する
- 解像度とFPSを設定する
- 手の向きを損なうことなくプレビューをミラーリングする
- 各フレームにソースとモノトニッククロックでタイムスタンプを付ける
- ドロップされたフレームを検出する
- キャリブレーション画像を公開する

### 2.2 推論アダプタ

アダプタは、KGM1からMLライブラリを隔離します。

初期アダプタ:

- MediaPipe Tasks Hand Landmarker
- MediaPipe Tasks Face Landmarker
- MediaPipe Pose Landmarker
- オーディオオンセット検出器

将来のアダプタ:

- YOLOスティック/ドラム検出器
- ONNX Runtime Web WebGPU検出器
- カスタムセグメンテーションモデル
- マルチカメラフュージョン
- オプションの電話カメラ/IMUコンパニオン

### 2.3 スタビライザー

スタビライザーは、製品のコアの差別化要因です。

以下を防ぐ必要があります:

- ジッター
- 壊れた指
- 逆さまの肘
- 突然のフェイスブレンドシェイプのスパイク
- 口のちらつき
- 左右の手の入れ替えミス
- スティックのテレポート
- ドラムの誤ヒット

### 2.4 リターゲティング

リターゲティングは、KGM1の正規化された値をアバター固有のパラメータに変換します。

ターゲット:

- VRM 1.0 ヒューマノイド / 表情
- Live2D Cubism パラメータ
- Inochi2D / Inox2D パラメータ
- カスタム2Dリグ
- OBSブラウザソースオーバーレイ

### 2.5 トランスポート

デフォルトはローカルプレビューです。リモートモードはKGM1フレームを使用します。

- デバッグ: JSON over WebSocket
- リアルタイム: KGM1B over WebTransport datagrams
- 信頼性のある制御: WebTransport streams
- フォールバック: WebSocket binary frames

### 2.6 サーバー/ルーター

ルーターは生のビデオを必要としないはずです。

- Erlang/OTPはセッション、ルーム、プレゼンス、ファンアウト、バックプレッシャーを監視します。
- Rustはコーデック、ホットパス、オプションのQUIC/WebTransport実装を処理します。
- ブラウザクライアントはスタンドアロンのローカル専用操作が可能です。

## 3. データフローディテール

### 3.1 生フレーム

```ts
interface CaptureFrame {
  videoFrame: VideoFrame | HTMLVideoElement | ImageBitmap;
  sourceTimeNs: bigint;
  monotonicTimeNs: bigint;
  width: number;
  height: number;
  mirroredPreview: boolean;
}
```

### 3.2 生推論

各モデルは生のランドマークと信頼度を返します。ここではアバター固有のスムージングは行われません。

### 3.3 正規化されたトラッキング状態

正規化された状態は、アバターとは独立しています。

### 3.4 安定化されたトラッキング状態

この状態はアニメーションに安全です。記録、ストリーミング、またはレンダリングできます。

## 4. スレッドモデル

ブラウザMVP:

- メインスレッド: UIと最小限のオーケストレーション
- ワーカー: モデル推論とKGM1フレーム構築
- オプションのワーカー: トランスポート
- OffscreenCanvas: 将来のレンダリングパス

ネイティブ/デスクトップの未来:

- Rustサービス: カメラ + 推論 + コーデック
- Erlangノード: セッションルーティング
- Web UI: コントロールサーフェス

## 5. クオリティゲート

フレームは以下を通過した場合のみレンダリング可能です:

- タイムスタンプのモノトニシティ
- 有限数値チェック
- 信頼度の閾値
- 解剖学的妥当性
- 速度制限
- アバターリグの妥当性

信号が失敗した場合、その信号のみが劣化します。全体のアバターは、グローバルな信頼度が低すぎない限り、フリーズすべきではありません。

## 6. 製品モード

| モード | 説明 |
|---|---|
| 初心者ストリーマー | Webcam + browser + OBS Browser Source |
| クリエイタースタジオ | 高品質なアバターキャリブレーションとプリセット |
| ドラマーモード | ドラムキットキャリブレーション、スティック/ヒットトラッキング、オーディオ同期 |
| リモートパフォーマー | WebTransportモーションストリーミング |
| 研究モード | データセットキャプチャ、ベンチマーク、モデル比較 |
| オフラインプライバシーモード | ネットワークなし、すべてローカル推論 |

## 7. MVPの非目標

- 完全なカスタムモデルトレーニングUI
- 完璧なマルチカメラ3D再構築
- プロダクションWebTransportサーバー
- マーケットプレイス/決済システム
- すべてのアバターフォーマットに対する自動リギング

これらは将来の課題として文書化されています。
