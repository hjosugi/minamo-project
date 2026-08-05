<!-- i18n: language-switcher -->
[English](drum-performance-tracking.md) | [日本語](drum-performance-tracking.ja.md)

# Drum Performance Tracking Design

> English version: [drum-performance-tracking.md](drum-performance-tracking.md)

## 1. Goal

Webcamとマイクだけで、ドラム演奏をアバター配信や演奏可視化に使えるレベルで追跡する。

対象:

- hands
- fingers
- sticks
- stick tips
- drum zones
- cymbal zones
- kick pedal
- hi-hat pedal
- hit timing
- hit velocity
- audio onset alignment

## 2. Inputs

Minimum:

- one webcam
- microphone audio

Recommended:

- 60fps or better webcam
- fixed camera position
- visible sticks and kit
- short calibration sequence

Optional future:

- phone camera as second angle
- IMU on sticks
- MIDI/audio interface
- depth camera

## 3. Pipeline

```text
webcam frame
  -> hand landmarks
  -> pose landmarks
  -> stick detector
  -> drum kit zone calibration
  -> stick tip trajectory
  -> hit candidate from geometry
  -> audio onset candidate
  -> fusion and cooldown
  -> DrumHitEvent
  -> avatar animation / overlay / MIDI-like event
```

## 4. Drum kit calibration

User marks or auto-detects:

- snare
- hi-hat
- ride
- crash
- toms
- floor tom
- kick area
- foot pedals

Calibration stores ellipses or polygons in image/world coordinates.

## 5. Hit detection

A hit is valid when enough signals agree.

Signals:

- stick tip enters a zone
- downward velocity exceeds threshold
- stick rebounds after contact
- zone cooldown is clear
- hand movement matches stick movement
- audio onset exists near the visual event

再アームの主体はクールダウンではなくリバウンドである (#123)。ヒット後、そのゾーンはチップが当該ヒットの発火位置から `DRUM_REARM_MIN_LIFT_M` (12 mm) 以上持ち上がるまで解除されない。スティックは持ち上げずに2度打つことができないためである。`cooldownMs` はリフトが観測されない場合 — 検出落ち、オクルージョン越しの追跡 — のフォールバックとして残る。経過時間のみで判定すると1ゾーンあたり 1000/`cooldownMs` hits/s が上限となり、ダブルストロークやバズロールはこれを超える。

False positive prevention:

- no repeated hits until the stick rebounds, or the cooldown expires
- no hit if stick is moving upward into the zone
- no hit if confidence is low and no audio onset exists
- no hit if only hand landmark jumps but stick detector is absent

## 6. Foot tracking

Foot tracking is hard with a single webcam. MVP should support:

- pose-based knee/foot motion estimate
- audio-assisted kick/hi-hat inference
- manual pedal calibration
- optional MIDI/audio input later

## 7. Avatar outputs

- arm swing
- wrist snap
- stick mesh animation
- hit flash
- drum piece bounce
- expression trigger
- sweat/impact effects
- camera shake amount

## 8. Benchmarks

Test patterns:

- single snare hits
- alternating hands
- hi-hat eighth notes
- snare roll
- tom fill
- crash hit
- kick + snare pattern
- fast blast beat

Metrics:

- hit timing error ms
- false positive rate
- false negative rate
- zone classification accuracy
- hand assignment accuracy
- velocity correlation
