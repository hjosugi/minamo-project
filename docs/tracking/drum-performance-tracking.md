# Drum Performance Tracking Design

> 日本語版: [drum-performance-tracking.ja.md](drum-performance-tracking.ja.md)

## 1. Goal

Track drum performance — with only a webcam and a microphone — at a level usable for avatar streaming and performance visualization.

Targets:

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

False positive prevention:

- no repeated hits inside cooldown
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
