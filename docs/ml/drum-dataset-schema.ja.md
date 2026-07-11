<!-- i18n: language-switcher -->
[English](drum-dataset-schema.md) | [日本語](drum-dataset-schema.ja.md)

# YOLO スティック/ドラム トレーニングデータスキーマ

ステータス: イシュー #122 のためにスキーマが実装されました。関連: フルボディ/スティック ML ロードマップ
([model-roadmap-yolo-edge.md](model-roadmap-yolo-edge.md),
[dataset-labeling-guide.md](dataset-labeling-guide.md))。

スティック/ドラム検出器（YOLOファミリー、ONNX Runtime Webを通じて実行）は、スティックの先端、尾、およびドラム/シンバルゾーンのラベル付きフレームを必要とします。このスキーマは、ラベルを一貫性を持たせ、プライバシーを保護します。

## アノテーションスキーマ

フレームごとのアノテーションは、`createDrumDatasetAnnotation(frameId, labels, license)`によって生成された`minamo.drum-dataset.v1`スキーマを使用します。
[`src/core/drum.ts`](../../src/core/drum.ts)にあります。機械可読のJSONスキーマは
[../product/drum-dataset.schema.json](../product/drum-dataset.schema.json)です。

各ラベルは次のいずれかです：

- `stick`: `points`（先端とオプションの尾）および`hand`を持つスティック
- `drumZone`: `zoneType`およびポリゴン/楕円の`points`を持つキット/シンバル領域
- `hit`: `zoneType`、`hand`、および`timeMs`を持つラベル付きヒット

## YOLO エクスポートマッピング

- クラスID: `stick-tip`、`stick`、および各`zoneType`ごとの1つのクラス（スネア、ハイハット、ライド、クラッシュ、トム、キック）。
- バウンディングボックスは、ラベルの`points`から導出されます（`stick-tip`の先端の周りのタイトなボックス、ゾーンのハル）。
- キーポイント（オプション）: ポーズスタイルのヘッド用のスティックの先端と尾。

## プライバシーとライセンス

- `consent.localOnly`はデフォルトで`true`です。生のビデオ/オーディオはデフォルトでデバイスから出ません。
- `consent.license`は、共有クリップの再配布条件を記録します。デフォルトは`0BSD`です。
- 貢献者は、フレームが共有される前に明示的にオプトインし、プライバシーを保護するデータセット記録と一致します。
  [../design/DD-002-fullbody-onnx.md](../design/DD-002-fullbody-onnx.md)。

## テスト

- `pnpm test`は、ローカル専用の同意を持つ`minamo.drum-dataset.v1`スキーマを生成する`createDrumDatasetAnnotation`をカバーします。
- JSONスキーマファイルは、構造チェックの一部として検証されます。