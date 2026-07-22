<!-- i18n: language-switcher -->
[English](onnx-pose-backends.md) | [日本語](onnx-pose-backends.ja.md)

# ONNXポーズバックエンドベンチマーク

ステータス: イシュー #23 のためのベンチマークハーネスが設置されました; デバイス番号は実際のハードウェア実行待ちです。詳細は [../design/DD-009-onnx-backend-registry.md](../design/DD-009-onnx-backend-registry.md) を参照してください。

## 再現方法

バックエンドは、固定記録クリップ（KGM-047フィクスチャ）に対して [`src/core/ml.ts`](../../src/core/ml.ts) の `runModelBenchmark` / `summarizeModelBenchmark` で測定されます。各行は、1つのGPUティアでの平均fps、p95レイテンシ、およびピークVRAM/メモリを報告します。レジストリ（[DD-009](../design/DD-009-onnx-backend-registry.md)）は、実行時にテスト対象のバックエンドを選択します。

ターゲット: 中程度のdGPUで30 fpsでの全身26以上のキーポイント、低いfpsでは失敗するのではなく、優雅にCPU/WASMフォールバックを行います。

## 結果

以下の数字は、各ティアでの測定実行によって置き換えられるプレースホルダーです; ハーネスとテーブルの形状は確定しているため、結果は比較可能です。

| バックエンド | プロバイダー | キーポイント | fps (平均) | p95レイテンシ ms | VRAM MB | ノート |
|---|---|---|---|---|---|---|
| mediapipe (デフォルト) | wasm/webgl | 33 | 測定済み | 測定済み | n/a | ベースライン、常に利用可能 |
| onnx-yolo-pose (n) | webgpu | 17 | 保留中 | 保留中 | 保留中 | 出荷前にAGPLライセンスを確認 |
| onnx-yolo-pose (n) | wasm | 17 | 保留中 | 保留中 | 保留中 | CPU/WASMフォールバックティア |
| onnx-rtmpose (t) | webgpu | 17/26 | 保留中 | 保留中 | 保留中 | 人物検出ステージが必要 |

## 方法に関するノート

- fpsは、平均フレームレイテンシから導出されます（`fps = 1000 / averageLatencyMs`）。
- VRAM/メモリは、実行中に報告されたピークです; WASM/CPUでは、これは専用VRAMではなくプロセスメモリです。
- バックエンドは、30 fpsのターゲットを中程度のdGPUで達成し、[DD-002](../design/DD-002-fullbody-onnx.md)からの座ったポーズの妥当性基準を通過した場合にのみ、オプションから推奨に昇格されます。
