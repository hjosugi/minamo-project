<!-- i18n: language-switcher -->
[English](meshopt-vs-draco.md) | [日本語](meshopt-vs-draco.ja.md)

# Meshopt vs Draco 決定文書

ステータス: イシュー #159 の実装された決定。関連: #41。

ジオメトリ圧縮は、[avatar-compression.md](avatar-compression.md) の3Dアセット段階の最後です。この文書は、デフォルトの選択肢とアセットごとにそれをオーバーライドする方法を記録します。

## 現在の互換性（2026-07-27確認）

- meshoptimizer 1.0では既存ライブラリのAPIが安定化され、gltfpackにドラフト版
  `KHR_meshopt_compression` の出力モードが追加されました。`-cz` または
  `-ce khr` で出力でき、通常の `-c` / `-cc` は引き続き
  `EXT_meshopt_compression` を出力します。
- KhronosのglTF拡張レジストリで批准済みとして掲載されているのは、現在も
  `EXT_meshopt_compression` です。`KHR_meshopt_compression` はより高密度な
  ビットストリームを持つ新しいドラフトであり、広いビューア環境に対する
  ポータブルなデフォルトではありません。
- Minamoが固定しているthree.js 0.185.1の `GLTFLoader` は、同じ
  `setMeshoptDecoder` 統合を通じて `EXT` と `KHR` の両方のmeshopt
  buffer viewを認識します。そのため、Minamo側のローダー変更なしで両形式を
  評価できます。

したがって、Minamoの公開既定値は引き続き `EXT_meshopt_compression` とします。
`KHR_meshopt_compression` は、対象となるすべての利用環境（Minamoのブラウザ/
Tauri、検査ツール、OBS/ブラウザソース環境、リリース証拠で指定する
サードパーティービューア）について、そのアセットで動作確認できるまで
オプトインの実験扱いです。

## ステップ

1. アニメーション付きアバターには **meshopt** (`EXT_meshopt_compression`) をデフォルトとします：高速でGPUフレンドリーなデコードと、リグ付き、モーフが多いメッシュに対して良好な比率。
2. ドラフト版 **KHR meshopt** は、対象ビューアの完全な一覧を記録して検証できる場合に限り、`gltfpack -cz`（または `-ce khr`）で比較します。ポータブルな `EXT` 成果物を暗黙に置き換えてはいけません。
3. **Draco** は静的な小道具や、meshopt がサイズ目標を達成できない場合にのみ検討し、視覚的回帰がブレンドシェイプとスプリングボーンが生き残ることを確認した後にのみ使用します。
4. アセットの決定入力を記録します：拡張名、gltfpackとデコーダーのバージョン、元のバイトサイズと最適化されたバイトサイズ、低スペックデバイスでの初フレームビューワーの読み込み時間、Chromeパフォーマンスプロファイルからのデコード時間、インスペクターサマリーからのすべての表情がまだ存在するかどうか、スプリングボーンのジョイント/コライダーの数が一致するかどうか。

| 選択肢 | 使用する場合 | 避ける場合 |
|---|---|---|
| meshopt `EXT` | ポータブルなリアルタイムWebビューア、アニメーション付きアバター、良好なデコード速度 | アセットパイプラインが拡張子の順序を保持できない場合 |
| meshopt `KHR` ドラフト | 指定した全利用環境を検証済みで、互換性の狭まりに見合うサイズ改善が測定できた場合 | 汎用アバターを公開する場合、または未検証のサードパーティーローダーを利用する場合 |
| Draco | 静的メッシュ、最大ジオメトリ圧縮 | モーフが多いアバターや遅いモバイルデコードパス |

## エンコーダー互換性

meshoptimizer 1.0では、生の頂点エンコーダーがデフォルトでビットストリーム
バージョン1を出力するようになりました。一方、
`EXT_meshopt_compression` の頂点データにはバージョン0が必要です。
したがって、本番アセットにはgltfpackの拡張対応モードを使用します。

- ポータブルな `EXT` 成果物: `gltfpack -c` / `-cc`
- 明示的に検証する `KHR` 成果物: `gltfpack -cz` / `-ce khr`

生の `meshopt_encodeVertexBuffer` のデフォルト出力を `EXT` buffer viewへ
格納してはいけません。カスタムエンコーダーが不可避な場合は、選択した拡張に
必要なバージョンを明示し、デコーダーのバージョンも証拠に残します。

## リグ破損のリスク

- Dracoによる位置/法線の量子化はブレンドシェイプのデルタを歪める可能性があるため、デコード後に各表情が正しく読み取れるか確認します。
- 拡張子の順序が重要です：スプリングボーンの拡張が確定する前にジオメトリ圧縮を適用すると、`VRMC_springBone` データが失われる可能性があります。
- 過剰に量子化されたスキンウェイトは、アニメーション中に目に見えるシームや肢のポッピングを引き起こします。

## テスト方法

- チェックリスト評価者 (`evaluateAssetChecklist`) は、モーフターゲットの数、表情名、またはスプリングボーンの数がベースライン検査に対して後退した場合、ジオメトリ段階で失敗します。
- `pnpm test` は評価者ゲートを実行します。
- 手動: 圧縮ファイルに対して視覚的回帰パス
  ([visual-regression-checklist.md](visual-regression-checklist.md)) を実行し、上記の決定テーブルを記録します。

## 情報源

- [meshoptimizer v1.0リリースノート](https://github.com/zeux/meshoptimizer/releases/tag/v1.0)
- [gltfpackの拡張・フラグ一覧](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)
- [Khronos glTF拡張レジストリ](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)
- [批准済み `EXT_meshopt_compression` 仕様](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md)
- [three.js r185 `GLTFLoader`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/loaders/GLTFLoader.js)
