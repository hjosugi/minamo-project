<!-- i18n: language-switcher -->
[English](drum-benchmark-runner.md) | [日本語](drum-benchmark-runner.ja.md)

# Local Drum Benchmark Runner

Status: implemented runner contract for #234. Raw media remains local.

## Command

```sh
pnpm benchmark:drum -- /private/path/manifest.json
```

The runner verifies each media SHA-256 and ffprobe-reported duration, video
fps/resolution, and audio codec/sample rate/channels. It then invokes the
manifest's detector command without a shell, reads its `DrumHitEvent` output,
applies the production `scoreDrumBenchmarkEvents` implementation, and writes:

```text
<outputDir>/drum-benchmark.json
<outputDir>/drum-benchmark.md
```

Use `--reuse-detections` only to regenerate a report from preserved detector
output. A normal evidence run must execute the detector command.

## Manifest

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
      "sha256": "<64 lowercase hexadecimal characters>",
      "durationMs": 10000,
      "video": { "fps": 60, "width": 1920, "height": 1080 },
      "audio": { "codec": "aac", "sampleRate": 48000, "channels": 2 },
      "consent": {
        "localOnly": true,
        "license": "private-consented",
        "reportMetadataAllowed": true
      },
      "annotations": [
        { "timeMs": 1000, "zoneId": "snare", "hand": "Right" },
        { "timeMs": 1500, "zoneId": "snare", "hand": "Left" }
      ],
      "detectedEvents": "private/alternating-hands.detected.json",
      "pipeline": {
        "name": "minamo-local-detector",
        "version": "<commit or model hash>",
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

Command placeholders are `{media}`, `{detected}`, `{manifest}`, and `{clipId}`.
Each becomes one process argument; shell expansion is never used.

## Detector output

```json
{
  "schema": "minamo.drum-detected-events.v1",
  "events": [
    {
      "eventId": "right:snare:1002",
      "timeNs": 1002000000,
      "hand": "Right",
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

## Privacy

The report contains the media basename, hash, technical stream metadata,
derived events, scores, and detector version. It never embeds raw frames,
audio, absolute local paths, tokens, or the detector command. Keep manifests,
media, and unredacted detector logs outside the repository unless their license
and participant consent explicitly allow publication.
