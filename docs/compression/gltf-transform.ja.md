<!-- i18n: language-switcher -->
[English](gltf-transform.md) | [日本語](gltf-transform.ja.md)

# glTF トランスフォーム最適化ガイド

ステータス: issue #157 のデザインが実装されました。関連: #41。

glTF トランスフォームは、パイプライン内で最初の最適化ツールであり、GLB を予測可能に検査し、書き換え、アドホックツールよりも拡張データをより良く保持します。完全なパイプラインについては [avatar-compression.md](avatar-compression.md) を参照してください。

## 手順

1. まずは常に検査します:

   ```bash
   gltf-transform inspect avatar.glb
   ```

2. 保守的で可逆的なパスを一度に一つずつ適用し、すべての中間ファイルを保持します:

   ```bash
   gltf-transform dedup avatar.glb avatar.dedup.glb
   gltf-transform prune avatar.dedup.glb avatar.pruned.glb
   ```

3. 各パスの後にリポジトリインスペクターを再実行し、サマリーを比較します:

   ```bash
   pnpm inspect:glb -- avatar.pruned.glb --avatar
   ```

4. プルーニングされたファイルがビューワーでまだ読み込まれることを確認した後、テクスチャ
   ([ktx2-textures.md](ktx2-textures.md)) とジオメトリ
   ([meshopt-vs-draco.md](meshopt-vs-draco.md)) の圧縮に進みます。

## リグ破損のリスク

- `prune` はアーティストが意図的に残したノード（ヘルパーボーン、空のスロット）を削除する可能性があります。プルーニング後にヒューマノイドおよびスプリングボーンのノード数が変更されていないことを確認してください。
- `dedup` によるアクセサのマージはジオメトリには安全ですが、異なるモーフターゲットを統合してはいけません。モーフターゲットの数が変更されていないことを確認してください。
- `weld` と `resample` はアニメーションやブレンドシェイプデータを変更する可能性があるため、デフォルトの保守的なパスには含まれていません。視覚的回帰パス
  ([visual-regression-checklist.md](visual-regression-checklist.md)) と共にのみ追加してください。

## テスト方法

- `pnpm test` は、ガイドが依存するインスペクターサマリーフィールド（モーフターゲット数、ヒューマノイド名、表情名）を検証します。
- サンプルアセットチェックリスト（`evaluateAssetChecklist`）は、各ステージをベースラインサマリーに対してゲートし、リグに重要な回帰があれば失敗します。
- 手動: ビューワーで `avatar.pruned.glb` を読み込み、ロスのある圧縮の前に同一の外観であることを確認します。