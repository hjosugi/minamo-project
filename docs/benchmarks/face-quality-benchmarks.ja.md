<!-- i18n: language-switcher -->
[English](face-quality-benchmarks.md) | [日本語](face-quality-benchmarks.ja.md)

# 顔の品質ベンチマーク

ステータス: イシュー #106 と #107 のベンチマーク定義が実装されました。

## 口のフリッカー

入力は、各フレームに1つの `mouth.open` サンプルを持つ中立的な口のクリップです。

メトリック:

- `mouthFlickerScore(samples)` は、フレーム間の平均絶対デルタです。
- 合格基準: 中立的な保持で30-60 fpsの場合、`<= 0.035`。
- 警告基準: `> 0.06`、中立的な口の動きがVRMおよびレイヤーPNGの口で可視化されるため。

このベンチマークを実行する条件:

- 中立的な保持
- 低照度の中立的な保持
- 音声アシストオフのスピーキングクリップ
- 音声アシストオンのスピーキングクリップ

## まばたきの偽陽性

入力は、各フレームに `blink` と `expectedClosed` がラベル付けされたクリップです。

メトリック:

- `blinkFalsePositiveRate(samples)` は、目が開いているとラベル付けされた状態で `blink >= 0.62` のフレームをカウントします。
- 合格基準: 前向きクリップの場合、`< 1%`。
- 警告基準: ヨーした/メガネのクリップの場合、`< 3%`。

ベンチマークは、片側のグレアが平均に隠れないように、左目と右目で別々に報告する必要があります。

## デバッググラフ

トラッカーのブレンドシェイプメーターとハンドデバッグキャンバスは、ライブデバッグサーフェスです。顔特有のデバッグのために、これらのチャンネルを一緒に記録します:

- `eyeBlinkLeft`, `eyeBlinkRight`, `eyeSquintLeft`, `eyeSquintRight`
- `jawOpen`, `mouthStretchLeft`, `mouthStretchRight`, `mouthPucker`, `mouthFunnel`
- 派生した `mouth.open`, `mouth.wide`, `mouth.pucker`, および母音
- `FACE_GLASSES_GLARE_POSSIBLE` 警告状態
