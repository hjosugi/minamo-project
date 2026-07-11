<!-- i18n: language-switcher -->
[English](drum-benchmark-runner.md) | [日本語](drum-benchmark-runner.ja.md)

# ローカルドラムベンチマークランナー

ステータス: #234のランナー契約が実装されました。生のメディアはローカルに残ります。

## コマンド

```sh
pnpm benchmark:drum -- /private/path/manifest.json
```

ランナーは各メディアのSHA-256とffprobeによって報告された持続時間、ビデオのfps/解像度、オーディオのコーデック/サンプルレート/チャンネルを検証します。その後、マニフェストの検出器コマンドをシェルなしで呼び出し、`DrumHitEvent`の出力を読み取り、プロダクションの`scoreDrumBenchmarkEvents`実装を適用し、次のファイルを書き込みます:

```text
<outputDir>/drum-benchmark.json
<outputDir>/drum-benchmark.md
```

`--reuse-detections`は、保存された検出器出力からレポートを再生成するためのみに使用してください。通常の証拠実行では、検出器コマンドを実行する必要があります。

## マニフェスト

```json
{
  "schema": "minamo.drum-benchmark-manifest.v1",
  "outputDir": "redacted-report",
  "toleranceMs": 35,
  "minimumSeparationMs": 35,
  "clips": [
    {
      "id": "alternating-hands",
      "media": "private/alternating-hands.mp4",
      "sha256": "<64の小文字の16進数>",
      "durationMs": 10000,
      "video": { "fps": 60, "width": 1920, "height": 1080 },
      "audio": { "codec": "aac", "sampleRate": 48000, "channels": 2 },
      "consent": {
        "localOnly": true,
        "license": "private-consented",
        "reportMetadataAllowed": true
      },
      "annotations": [
        { "timeMs": 1000, "zoneId": "snare", "hand": "右" },
        { "timeMs": 1500, "zoneId": "snare", "hand": "左" }
      ],
      "detectedEvents": "private/alternating-hands.detected.json",
      "pipeline": {
        "name": "minamo-local-detector",
        "version": "<コミットまたはモデルハッシュ>",
        "command": [
          "minamo-local-detector",
          "--media", "{media}",
          "--output", "{detected}"
        ]
      },
      "pass": {
        "precision": 0.95,
        "recall": 0.95,
        "falseDoubleHits": 0,
        "p95TimingErrorMs": 35,
        "zoneAccuracy": 0.9,
        "handAssignmentAccuracy": 0.9
      }
    }
  ]
}
```

コマンドのプレースホルダーは`{media}`、`{detected}`、`{manifest}`、`{clipId}`です。
それぞれが1つのプロセス引数になり、シェル展開は決して使用されません。

## 検出器出力

```json
{
  "schema": "minamo.drum-detected-events.v1",
  "events": [
    {
      "eventId": "right:snare:1002",
      "timeNs": 1002000000,
      "hand": "右",
      "stickId": "right",
      "zoneId": "snare",
      "zoneType": "snare",
      "position": { "x": 0, "y": 0, "z": 0 },
      "velocity": { "x": 0, "y": 1, "z": 0 },
      "speed": 1,
      "confidence": 0.9,
      "audioAligned": true
    }
  ]
}
```

## プライバシー

レポートにはメディアのベース名、ハッシュ、技術的ストリームメタデータ、派生イベント、スコア、および検出器のバージョンが含まれます。生のフレーム、オーディオ、絶対ローカルパス、トークン、または検出器コマンドは決して埋め込まれません。マニフェスト、メディア、および未修正の検出器ログは、そのライセンスと参加者の同意が明示的に公開を許可しない限り、リポジトリの外に保管してください。