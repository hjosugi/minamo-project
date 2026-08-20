<!-- i18n: language-switcher -->
[English](drum-dataset-schema.md) | [日本語](drum-dataset-schema.ja.md)

# YOLO スティック/ドラムトレーニングデータスキーマ

ステータス: issue #122 向けに実装され、実行時検証にも対応済み。関連:
[model-roadmap-yolo-edge.ja.md](model-roadmap-yolo-edge.ja.md) と
[dataset-labeling-guide.ja.md](dataset-labeling-guide.ja.md)。

スティック/ドラム検出器には、スティックの先端と末端、ドラム/シンバルの輪郭、
打点についてレビュー済みの幾何ラベルが必要です。`minamo.drum-dataset.v1` は
それらを表すフレーム単位の厳密なアノテーション契約です。機械可読な JSON Schema は
[../product/drum-dataset.schema.json](../product/drum-dataset.schema.json) にあります。

## アノテーション種別

各ラベルは次のいずれか1種類だけです。別種別のフィールドは無視せず拒否します。

| `kind` | 必須フィールド | 点の数 |
|---|---|---:|
| `stick` | `id`, `points`, `hand`, `representation` | `representation` に応じて厳密に1点または2点 |
| `drumZone` | `id`, `points`, `zoneType` | 輪郭ポリゴン (3点以上) |
| `hit` | `id`, `points`, `zoneType`, `timeMs`; `hand` は任意 | 打点1点 |

スティックの `representation: "keypoint-only"` は先端1点だけを要求します。
姿勢キーポイントには使えますが、面積ゼロの YOLO ボックスとして出力してはなりません。
`representation: "tip-tail-padded"` は厳密に2点を要求します。そのボックスは先端/末端の
外接範囲を上下左右それぞれ正規化フレーム単位 `0.01` だけ拡張し、`[0, 1]` にクランプします。
`deriveStickLabelBox(label)` がこの規則を実装し、1点ラベルには `null` を返します。

キックなど足で発生するイベントには左右の手がないため、ヒットの `hand` は任意です。
スティックラベルでは必須です。`timeMs` は元クリップまたは収録セッションからの相対時刻で、
0以上でなければなりません。

点は元フレームの正規化座標を使用します。`x` と `y` は `[0, 1]`、`z` は有限値で
負でも構いません。YOLO のボックス出力は `z` を無視しますが、保持しておくことで
姿勢形式の出力時に先端/末端の深度推定を利用できます。レビュー済みネガティブフレームでは
空の `labels` 配列が有効です。

学習可能な `zoneType` はドラムキットと対応済みハンドパーカッションを含みます。
通信上の `unknown` と、打撃ではないペダル状態は検出クラスから除外します。

## 実行時 API

[`shared/drum-dataset.js`](../../shared/drum-dataset.js) がブラウザおよび Node ツールの
プロダクション用コンシューマーです。

- `validateDrumDatasetAnnotation(value)` はすべての検証エラーを返します。
- `parseDrumDatasetAnnotation(jsonOrValue)` は壊れた入力や無効な入力を拒否します。
- `createDrumDatasetAnnotation(...)` は返却前にデータを検証します。
- `createDrumDatasetAnnotationFromTrackerSample(sample, labels)` はトラッカーサンプルの
  フレーム識別子、ライセンス、ローカル限定同意をレビュー済みアノテーションへ引き継ぎます。
- `deriveStickLabelBox(label)` は固定の2点padding規則を適用し、1点からボックスを捏造しません。

[`src/core/drum.ts`](../../src/core/drum.ts) は、同じ実行時実装から型付きの位置引数 API
`createDrumDatasetAnnotation(frameId, labels, license)` を再エクスポートします。
並行する検証実装が分岐することはありません。

## トラッカー出力との境界

トラッカーがダウンロードするのは `minamo.dataset.tracker-sample.v1` NDJSON です。
これはランドマーク、キャリブレーション済みゾーン、品質、`label: "drum-hit"` のような
粗い選択値を含む、プライバシー保護された **収録エンベロープ** です。レビュー済みの
スティック先端/末端、打点、ヒット時刻、各幾何オブジェクトの手は含まれないため、
自動的に YOLO の正解データにはなりません。

人またはラベリングツールが明示的な幾何ラベルを追加した後で
`createDrumDatasetAnnotationFromTrackerSample` を呼びます。この橋渡しは粗い選択値から
ラベルを推測しません。由来情報をコピーする前に、トラッカー生成側と同じ
`validateDatasetRecord` 契約で raw media の走査、canonical な `createdAt`、0以上の整数 `seq`
を検証します。そのため、衝突しうる `unknown-time` / `unknown-seq` のフレームIDを出力しません。
これにより、2つのスキーマは矛盾した出力形式ではなく相補的になります。

## YOLO 出力への対応

- クラスID: `stick-tip`、`stick`、および学習可能な `zoneType` ごとのクラス。
- `keypoint-only` スティックは先端キーポイントだけを提供し、物体ボックスを持ちません。
- `tip-tail-padded` スティックは固定の `0.01` padding規則でボックスを生成します。
- ドラムゾーンのボックスはポリゴンの外接矩形を使います。
- 任意の姿勢キーポイントはスティックの先端と、存在する場合は末端です。
- `hit` ラベルは時刻/ゾーン評価用であり、物体ボックスではありません。

## プライバシーとライセンス

- `consent.localOnly` はアノテーションをローカルに限定すべきかを記録します。
- `consent.license` は必須で、橋渡し時はトラッカーサンプルからコピーされます。
  新しいローカルアノテーションの作成時は既定で `0BSD` です。
- 生の映像/音声はアノテーション JSON と既定のトラッカー出力のどちらにも含めません。
  メディアの共有には引き続き参加者の明示的同意とライセンスレビューが必要です。

## テスト

- `pnpm test` は同一fixture群を Ajv の draft-07 検証とruntime validatorの両方に通し、
  空白、representation/点数、レビュー済みネガティブ、余分なフィールド、不正 JSON、
  raw media拒否、衝突しないトラッカーidentityをカバーします。
- `pnpm typecheck` は TypeScript の判別共用体を固定します。
- `pnpm verify` は JSON Schema の `oneOf` 定義、必須フィールド、座標範囲、
  実行時エクスポートを確認します。
