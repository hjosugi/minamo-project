<!-- i18n: language-switcher -->
[English](kgm2-reference-codecs.md) | [日本語](kgm2-reference-codecs.ja.md)

# KGM2 参照コーデック

ステータス: KGM2 コンパクトフェイスフレームおよび KGM1B パケットフレーミングの実装済み。

## 実装済みファイル

- `shared/kgm2.js`: JS KGM2 コンパクトフェイスエンコーダ/デコーダ。
- `shared/kgm1b.js`: JS KGM1B パケットフレーミング。
- `crates/kgm1-codec`: ルート Cargo ワークスペースに登録された Rust KGM1B 参照クレート。
- `packages/kgm1-codec-py`: Python KGM1B 参照パッケージ。
- `scripts/kgm1b_codec.py`: Python パッケージの CLI ラッパー。

## ゴールデンベクター

JS 実装は、クロスランゲージフィクスチャ用にこの 40 バイトの KGM1B ヘッダーを出力します：

```text
4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000
```

デコードされたフィールド：

| フィールド | 値 |
|---|---:|
| version | 1.7 |
| frame_id | 72623859790382856 |
| source_time_ns | 1720000000123456789 |
| monotonic_time_ns | 9876543210 |
| flags | 33 |
| encoding | 3 |
| payload_type | 2 |
| payload_len | 4 |

パケットフィクスチャはペイロード `cafebabe` を追加します。

## 検証

実行：

```sh
pnpm test
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
python3 scripts/kgm1b_codec.py decode-packet 4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000cafebabe
PYTHONPATH=packages/kgm1-codec-py python3 -m kgm1_codec decode-header 4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000
```

`pnpm test` はさらに以下を検証します：

- 最小三元数の最大角度誤差が 1,000,000 回のランダム回転で 0.5 度未満
- JS の最小三元数エンコード+デコードがローカル Node ランタイムで 1 マイクロ秒未満
- KGM2 デルタ/キーフレームのフレームサイズ削減が少なくとも 35%
- 10% のパケット損失とドロップされたキーフレームが次のキーフレームで回復
- ベースキーフレームなしのデルタは拒否される
- スパースマスクは変更されていないチャネルを保持
- アイドルフェイスデルタフレームは 26 バイト

## 非目標

このページは、自動交渉、リレーのスケールアウト、MoQ 評価、またはエンドツーエンド暗号化のための生産輸送作業を完了するものではありません。これらの問題には、別途ランタイム統合と検証が必要です。
