<!-- i18n: language-switcher -->
[English](drum-kick-pedal.md) | [日本語](drum-kick-pedal.ja.md)

# キックペダル推論設計

ステータス: イシュー #119 のデザインが実装されました。ドラムパフォーマンスシステムの一部です
([drum-performance-tracking.md](drum-performance-tracking.md))。

## 目標

キックドラムのための `DrumHitEvent` を、通常はキットによって隠されているビータと足を含む
単一のウェブカメラとマイクから生成します。

## 信号

- 低周波音の発生エネルギー（キックの基本周波数、約160 Hz以下）
- 下半身が見えるときのポーズベースの膝/足のディップ
- 手動キックゾーンキャリブレーションをフォールバックアンカーとして使用

参照ヘルパーは `inferKickPedalHit(onsets, timeMs, windowMs)` で
[`src/core/drum.ts`](../../src/core/drum.ts) にあります。ウィンドウ内で約160 Hz以下の
最も強い発生を選択し、`audioAligned: true` の `kick` `DrumHitEvent` を発信します。

## 偽陽性の軽減

- 低周波の発生を要求します。明るいバンドエネルギー（ハイハット/スネア）は拒否されます。
- ビジュアルヒットと同じゾーンごとのクールダウンを強制し、単一のキックが
  2つのイベントを生成できないようにします。
- 資格のある発生がない場合は、ポーズからの推測ではなく、何も発信しません。

## オーディオ同期設計

キックはオーディオファーストです: 発生のタイムスタンプが `timeNs` を設定し、ポーズの動きは
信頼性を高めるだけです。これにより、ペダルが見えなくてもキックのタイミングが厳密に保たれ、
[DD-003](../design/DD-003-audio-lipsync.md) と一貫性があります。

## ベンチマーク方法

- ベンチマークセット内のキック専用インパルスクリップとキック+スネアパターン
  ([../benchmarks/drum-benchmark-metrics.md](../benchmarks/drum-benchmark-metrics.md))。
- メトリクス: キックタイミングエラー、大音量のスネア演奏時の偽キック率。
- `pnpm test` は、低周波の発生に対して `kick` イベントを発信し、明るいバンドの発生を拒否する
  `inferKickPedalHit` をカバーします。
