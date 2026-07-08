# Research: IMU Stick Optional Integration

Status: research design for issue #185. Out of MVP scope; kept as a design doc.
Related: [../tracking/drum-performance-tracking.md](../tracking/drum-performance-tracking.md),
#183.

## Goal

Evaluate adding an optional IMU (accelerometer/gyro) on drum sticks to improve
hit timing and velocity, and decide whether it fits the webcam-first,
no-extra-hardware design.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: IMU is strictly optional; the
  webcam + audio path remains the default and never depends on hardware.
- [ ] Documentation review (this doc).
- [ ] Manual verification if a prototype is built (deferred).

## Findings

- An IMU gives near-zero-latency impact detection and clean velocity from peak
  acceleration, which the camera path can only approximate.
- The cost is real hardware, per-stick pairing, battery, and a wireless
  transport (BLE/serial) that the browser can reach only through Web Bluetooth,
  which is not universally available.
- IMU data is another signal into the same hit fusion/cooldown stage; it does
  not change the `DrumHitEvent` schema, only its confidence and timing sources.

## Decision

Keep IMU **out of MVP** and behind an optional capability:

- Treat the IMU as an auxiliary onset/velocity signal fused with vision and
  audio, never a requirement.
- If prototyped, use Web Bluetooth and fall back silently when unavailable.
- Reuse the existing shared-clock offset estimation so IMU timestamps align with
  camera and audio, the same approach proposed for multi-camera fusion (#183).

No code changes now. Revisit only if a specific IMU stick becomes a supported
accessory.
