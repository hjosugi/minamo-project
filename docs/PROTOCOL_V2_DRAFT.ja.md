<!-- i18n: language-switcher -->
[English](PROTOCOL_V2_DRAFT.md) | [日本語](PROTOCOL_V2_DRAFT.ja.md)

# KGMリッチトラッキングプロトコル (v2ドラフト)

Version: 0.1.0
Status: ドラフト (ターゲットスキーマ)

以下で使用される用語は [GLOSSARY.md](GLOSSARY.md) に定義されています。

> **他の仕様との関係:** 実装済みのv1ワイヤフォーマット
> (76バイトのバイナリフレーム、顔 + 上半身) は [PROTOCOL.md](PROTOCOL.md) に記載されています。
> この文書は次世代プロトコルのセマンティックスキーマのドラフトです - 手、指ごとの状態、ドラムイベント、品質メタデータ - そして [design/DD-006-kgm2.md](design/DD-006-kgm2.md) におけるKGM2設計に基づいています。
ターゲット: リアルタイムアバタートラッキング、ローカル優先のウェブカメラトラッキング、ストリーミング、コラボレーション、リモートレンダリング

## 1. 設計目標

KGM1はアバターストリーミングのためのコンパクトなリアルタイムモーションプロトコルです。

プロトコルは以下をサポートする必要があります:

- 顔のランドマーク、顔のブレンドシェイプ、視線、虹彩、まぶた、口の状態
- 体のポーズと上半身の動き
- 左右の手と各指の独立したトラッキング
- 指ごとの関節の回転、カール、広がり、指先の速度、接触状態、自信度、遮蔽状態
- ドラム演奏イベント: スティック、ヒット、ドラムピース、速度、フットペダル、音声のオンセットアラインメント
- 品質メタデータ: レイテンシー、フレームの信頼性、ドロップフレーム、スムージング量、モデル識別
- VRM、Live2D、Inochi2D、カスタムリグ用のアバターマッピングメタデータ
- WebTransportデータグラムによるバイナリトランスポート
- デバッグ、テスト、WebSocketフォールバック用のJSONトランスポート

## 2. トランスポートモード

### 2.1 KGM1 JSON

開発およびデバッグ時に使用します。

```json
{
  "magic": "KGM1",
  "version": "0.1.0",
  "frameId": 1024,
  "clock": {
    "sourceTimeNs": 1720000000000000000,
    "monotonicTimeNs": 12000000000,
    "estimatedLatencyMs": 18.4
  },
  "tracking": {
    "face": {},
    "hands": [],
    "body": {},
    "drums": {}
  },
  "quality": {
    "fps": 59.8,
    "overallConfidence": 0.91,
    "droppedFrames": 0,
    "stabilizer": "one_euro+anatomy_clamp+outlier_gate"
  }
}
```

### 2.2 KGM1B バイナリ

リアルタイムトランスポートに使用します。

ヘッダーレイアウト:

| オフセット | 型 | 名前 | 説明 |
|---:|---|---|---|
| 0 | u32 | magic | ASCII `KGM1` |
| 4 | u16 | version_major | プロトコルのメジャーバージョン |
| 6 | u16 | version_minor | プロトコルのマイナーバージョン |
| 8 | u64 | frame_id | 単調に増加するフレームID |
| 16 | u64 | source_time_ns | ソースクロックのタイムスタンプ |
| 24 | u64 | monotonic_time_ns | 送信者の単調クロックタイムスタンプ |
| 32 | u16 | flags | ビットフラグ |
| 34 | u8 | encoding | 0=json, 1=flatbuffer-like, 2=msgpack, 3=custom packed |
| 35 | u8 | payload_type | 0=フルフレーム, 1=デルタ, 2=イベントのみ |
| 36 | u32 | payload_len | バイト長 |
| 40 | bytes | payload | エンコードされたフレーム |

パケットフレーミングは `shared/kgm1b.js`、Rustワークスペースのクレート `crates/kgm1-codec`、およびPythonワークスペースローカルパッケージ `packages/kgm1-codec-py` に実装されています。JSで生成されたゴールデンベクトルは、`pnpm test` 内でRustとPythonによってデコードされます。

### 2.3 KGM2 コンパクト顔プロファイル

KGM2は、DD-006をデフォルトのリアルタイムパケットにする前に検証するために使用されるコンパクトなバイナリプロファイルです。実装されたプロファイルは `shared/kgm2.js` にあり、`tests/run-tests.mjs` によってガードされています。

ヘッダーレイアウト:

| オフセット | 型 | 名前 | 説明 |
|---:|---|---|---|
| 0 | u16 | magic | `0x324b` |
| 2 | u8 | version | `2` |
| 3 | u8 | frame_type | `1` キーフレーム, `2` デルタ |
| 4 | u32 | t | ソースタイムスタンプ (ミリ秒) |
| 8 | u16 | seq | シーケンス番号 |
| 10 | u16 | key_id | 参照されるキーフレームID |

顔キーフレームボディ:

| フィールド | 型 | 備考 |
|---|---|---|
| 頭部回転 | u32 | 最小三成分クォータニオン、2ビットインデックス + 3 x 10ビットコンポーネント |
| 頭部位置 | i16 x3 | メートルからミリメートル |
| 重み | u8 x52 | 標準的なARKitチャンネル順 |

顔デルタボディ:

| フィールド | 型 | 備考 |
|---|---|---|
| 頭部回転 | u32 | 絶対最小三成分クォータニオン |
| 頭部位置のデルタ | i8 x3 | キーフレームからのデルタ、ミリメートル |
| チャンネルマスク | 7 bytes | 52ビットのスパースチャンネルマスク |
| 重みのデルタ | i8 x N | マスクされたチャンネルのみの符号付きデルタ |

デルタフレームは前のデルタではなく、最後のキーフレームに基づいています。デコーダーは、参照された基底キーフレームが見つからない場合、デルタを拒否します。これにより、損失回復がキーフレーム間隔に制限されます。現在の回帰コーパスでは、アイドル状態の顔のデルタは26バイトで、平均的なKGM2フレームサイズはKGM1顔フレームより少なくとも35%小さいです。

## 3. 座標系

KGM1は3つの座標空間を持ちます。

| 空間 | 用途 |
|---|---|
| `image` | 正規化された画面座標、x/yは0..1、zはモデル相対 |
| `world` | トラッカーからのモデルワールド座標 |
| `avatar` | 安定化およびリターゲティング後のリグ対応正規化値 |

すべての回転は `[x, y, z, w]` 順のクォータニオンを使用します。デバッグ出力に限り、オイラー角が許可されます。

## 4. 顔スキーマ

```ts
interface FaceState {
  detected: boolean;
  confidence: number;
  head: HeadState;
  eyes: EyePairState;
  mouth: MouthState;
  brows: BrowState;
  cheeks: CheekState;
  blendshapes: Record<string, number>;
  landmarks?: Landmark[];
}
```

### 4.1 目の状態

```ts
interface EyeState {
  blink: number;
  openness: number;
  squint: number;
  gaze: Vec3;
  irisCenter?: Vec2;
  pupilDilationApprox?: number;
  confidence: number;
}
```

品質ルール:

- 瞬きは急激な開閉のちらつきを避けるためヒステリシスを使用する必要があります。
- 視線は不可能なジャンプを抑制する必要があります。
- 頭部の回転によって片方の目が遮蔽される場合、もう片方の目と頭部のポーズから推測し、信頼度を低く設定する必要があります。
- ウィンクは明示的である必要があり、スムージングによって意図的なウィンクが消されてはなりません。

### 4.2 口の状態

```ts
interface MouthState {
  open: number;
  wide: number;
  pucker: number;
  smileLeft: number;
  smileRight: number;
  frownLeft: number;
  frownRight: number;
  jawForward: number;
  tongueOut?: number;
  vowel?: "A" | "I" | "U" | "E" | "O" | "neutral";
  confidence: number;
}
```

品質ルール:

- 口の開閉は一時的なランドマークのノイズでジャンプしてはなりません。
- 唇の端は顎の開閉とは独立してスムージングされる必要があります。
- 話すアニメーションは音声支援が可能ですが、カメラ信号が主となります。
- 笑顔はユーザーが頭を回転させただけでトリガーされてはなりません。

## 5. 手と指のスキーマ

手には21の基本ランドマーク、ワールドランドマーク、および派生したリグ対応の指の状態があります。

```ts
interface HandState {
  handedness: "Left" | "Right";
  detected: boolean;
  confidence: number;
  palm: PalmState;
  fingers: Record<FingerName, FingerState>;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  occlusion: OcclusionState;
}
```

指の名前:

```ts
type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
```

```ts
interface FingerState {
  name: FingerName;
  mcp: JointState;
  pip?: JointState;
  dip?: JointState;
  tip: JointState;
  curl: number;
  spread: number;
  pinchToThumb?: number;
  contact: ContactState;
  tipVelocity: Vec3;
  confidence: number;
  occluded: boolean;
}
```

### 5.1 指ごとのランドマークインデックス

| 指 | ランドマークチェーン |
|---|---|
| 親指 | 1, 2, 3, 4 |
| 人差し指 | 5, 6, 7, 8 |
| 中指 | 9, 10, 11, 12 |
| 薬指 | 13, 14, 15, 16 |
| 小指 | 17, 18, 19, 20 |

### 5.2 解剖学的クランプ

トラッカーは破損したポーズを拒否する必要があります。

| 関節 | 典型的な安全ルール |
|---|---|
| MCP屈曲 | ユーザーごとにキャリブレーションされた範囲にクランプ |
| PIP屈曲 | キャリブレーションされた伸展を超えて後方に曲げない |
| DIP屈曲 | 通常はPIPに従い、振幅は低め |
| 指の広がり | 隣接するレイの間にクランプ |
| 親指 | 指とは異なる鞍関節モデルを使用 |

ルール:

- 信頼度が明示的に低く、ポーズが回復済みとマークされていない限り、指のセグメントが親セグメントを通過して反転してはなりません。
- 指先がテレポートした場合、1〜3フレームの間、以前の速度制限状態を保持します。
- 信頼度が低い場合、スナップするのではなく、アニメーションの振幅を減少させます。
- 180度の反転を避けるためにクォータニオンの最短経路補間を使用します。

## 6. ドラム演奏スキーマ

```ts
interface DrumState {
  kitCalibrated: boolean;
  sticks: StickState[];
  zones: DrumZone[];
  hits: DrumHitEvent[];
  pedals: PedalState[];
  audioOnsets?: AudioOnset[];
}
```

```ts
interface DrumHitEvent {
  eventId: string;
  timeNs: number;
  hand?: "Left" | "Right";
  stickId?: string;
  zoneId: string;
  zoneType: "snare" | "hihat" | "ride" | "crash" | "tom" | "floorTom" | "kick" | "pedal" | "unknown";
  position: Vec3;
  velocity: Vec3;
  speed: number;
  confidence: number;
  audioAligned: boolean;
}
```

ドラムヒットの判定は以下を組み合わせる必要があります:

- スティックの先端の軌跡
- 手/指の速度
- ドラムゾーンの交差
- ダウンストロークの方向
- 音声オンセットのタイミング
- ゾーンごとのクールダウン
- リバウンドパターン

## 7. 品質スキーマ

```ts
interface QualityState {
  fps: number;
  captureLatencyMs: number;
  inferenceLatencyMs: number;
  stabilizationLatencyMs: number;
  transportLatencyMs?: number;
  overallConfidence: number;
  perSignalConfidence: Record<string, number>;
  droppedFrames: number;
  warnings: string[];
}
```

品質警告の例:

- `LOW_LIGHT`
- `HAND_OCCLUDED`
- `FACE_PARTIAL`
- `MOUTH_UNSTABLE`
- `FINGER_ANATOMY_CLAMPED`
- `DRUM_STICK_MOTION_BLUR`
- `AUDIO_DESYNC`
- `TRANSPORT_CONGESTED`

## 8. レイテンシー予算

| ステージ | ターゲット |
|---|---:|
| キャプチャ | 1-8 ms |
| 推論 | 4-16 ms |
| 後処理 | 1-3 ms |

## 9. マルチソースクロック同期

コラボレーションルームでは、異なるローカルクロックを持つWebSocketおよびWebTransportソースを混在させることができます。`shared/kgm2.js` はNTPスタイルのプローブを実装しています:

```text
clientSendMs -> relayReceiveMs -> relaySendMs -> clientReceiveMs
```

`ClockOffsetEstimator` は最小RTTサンプルを保持し、送信者からリレーへのオフセットを推定します。`MultiSourceClockSync` はソースごとに1つの推定器を保存し、ソースタイムスタンプを共有リレータイムラインに合わせます。このプローブペイロードはトランスポートに依存しません: WebSocketはJSONコントロールメッセージとして送信し、WebTransportは信頼性のあるコントロールストリームで送信します。

回帰テストは混合された `ws-source` と `wt-source` ペアをカバーし、整列した位相誤差が10msのターゲットを下回ることを確認します。
| レンダリングマッピング | 1-4 ms |
| トランスポートローカル/リモート | 1-20 ms |
| 合計ローカルプレビュー | 33 ms以下のターゲット |

## 9. 安定性要件

すべてのKGM1プロデューサーは、原始的な機械学習出力の後に安定性レイヤーを実装する必要があります。

必要なゲート:

1. 有限数チェック
2. 座標範囲チェック
3. 信頼度ゲート
4. 速度ゲート
5. 高リスク信号の加速度/ジャークゲート
6. 関節ごとの解剖学的クランプ
7. 時間的スムージング
8. 遮蔽回復
9. アバターリグクランプ
10. 警告の発行

## 10. 互換性レベル

| レベル | 意味 |
|---|---|
| KGM1-L0 | 顔のみ |
| KGM1-L1 | 顔 + 手 |
| KGM1-L2 | 顔 + 手 + 上半身 |
| KGM1-L3 | L2 + 指の完全な派生状態 |
| KGM1-L4 | L3 + ドラムイベント |
| KGM1-L5 | L4 + リモートWebTransport + マルチアバター |
| KGM1-L6 | L5 + カスタムYOLO/ONNX/WebGPUモデル |

## 11. プライバシー

デフォルトの製品は、カメラフレームをデバイス上で処理する必要があります。リモートトランスポートは、ユーザーが明示的にビデオ共有を有効にしない限り、KGM1モーションフレームを送信し、原始的なカメラフレームを送信してはなりません。