<!-- i18n: language-switcher -->
[English](mediapipe-1.0-migration.md) | [日本語](mediapipe-1.0-migration.ja.md)

# MediaPipe tasks-vision 1.0 移行ウォッチリスト

`@mediapipe/tasks-vision` は安定版 `0.10.35` と並行して、毎日 `1.0.0-rc.*` の
ナイトリーを公開しています。パッケージング/API 変更を含む 1.0 リリースが目前で
あり、トラッカーの中核機能は Face Landmarker のブレンドシェイプと顔の変換行列に
依存しています。本ページは 1.0 で壊れ得る点と、それを早期に検知する仕組みを
まとめます。

## 現在の防御策

- **完全固定 (exact pin)。** `package.json` は `@mediapipe/tasks-vision` を
  キャレットなしの `0.10.35` に固定しており、想定外の `0.11`/`1.0` が自動的に
  入ることはありません。
- **週次カナリア。** `.github/workflows/mediapipe-canary.yml` が定期的に
  `@mediapipe/tasks-vision@nightly`（`1.0.0-rc.*` ビルドを配信する dist-tag）を
  導入し、`scripts/mediapipe-canary-smoke.mjs` を実行します。トラッカーが依存する
  パッケージング面を検査し、破壊的変更が
  あれば固定ビルドに触れずにカナリアだけが失敗し、本ページを指し示します。

## ウォッチリスト — 1.0 で変わり得る箇所

### 1. エントリポイント

- トラッカーはパッケージの `exports["."]` / `module` フィールド（現在は
  `vision_bundle.mjs`）経由で ESM バンドルを import します。1.0 でバンドル名や
  構成、条件付き/サブパス exports が変わる可能性があります。
- トラッカーが生成する 4 つのタスククラスは export され続ける必要があります:
  `FilesetResolver`、`FaceLandmarker`、`HandLandmarker`、`PoseLandmarker`。

### 2. WASM アセットのパス

- `scripts/fetch-models.sh` は SIMD / 非 SIMD のランタイム対
  (`wasm/vision_wasm_internal.{js,wasm}`、
  `wasm/vision_wasm_nosimd_internal.{js,wasm}`) をローカル配信用にミラーします。
- 1.0 でこれらのファイル名や `wasm/` 配置が変わる、あるいはスレッド版が
  増減する可能性があります。ファイル名が変わったら `scripts/fetch-models.sh`
  とカナリアのアセット一覧の両方を更新してください。

### 3. ブレンドシェイプ / 結果フィールド名

- トラッカーは結果フィールドを直接読み取ります (`tracker/tracker.js`):
  `detectForVideo(...)`、
  `result.faceBlendshapes[i].categories[].categoryName` と `.score`、
  `result.facialTransformationMatrixes`。
- Face Landmarker のブレンドシェイプは 1.0 系でも非推奨ではありませんが、
  これらの結果フィールドが改名されると表情が無音で 0 になります。カナリアは
  同梱の `vision.d.ts` を各名称で grep します。

## アーキテクチャ上の注意

Holistic Landmarker はweb上ではまだ成熟しておらず、Face / Hand / Pose を
**分離した**タスクとして扱う構成が 1.0 移行後も引き続き正解です。1.0 バンプの
一環として Holistic に統合しないでください。

## カナリアが失敗したら

1. ワークフローログの失敗チェック名を読みます。上記ウォッチリストの節に 1:1 で
   対応します。
2. ローカルで再現します:
   `pnpm add -w @mediapipe/tasks-vision@nightly && node scripts/mediapipe-canary-smoke.mjs`。
3. 必要に応じてトラッカーのアダプタ、`scripts/fetch-models.sh`、カナリアの
   アセット一覧を調整し、`package.json` の完全固定バージョンを更新します
   （固定モデルハッシュも再生成 — `scripts/model-pins.sha256` を参照）。

## 参考

- https://www.npmjs.com/package/@mediapipe/tasks-vision
