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
- [x] Documentation review ([PR #220 review record](../verification/pr-220/research-review/185.md)).
- [x] Manual verification: `N/A` for this research-only decision because no
  supported accessory or prototype exists; follow-up #240 owns the hardware
  prototype gate.

## Findings

- An IMU gives near-zero-latency impact detection and clean velocity from peak
  acceleration, which the camera path can only approximate.
- The cost is real hardware, per-stick pairing, battery charging/telemetry,
  firmware/version support, reconnect handling, and a BLE or serial transport.
- Web Bluetooth is available only on a subset of browser/platform combinations,
  requires a secure context and a user gesture, and is not implemented by
  Safari/WebKit. A browser-only accessory therefore cannot be the universal
  path. See the [Chrome implementation guidance](https://developer.chrome.com/docs/capabilities/bluetooth)
  and [WebKit's current position](https://webkit.org/tracking-prevention/).
- IMU data is another signal into the same hit fusion/cooldown stage; it does
  not change the `DrumHitEvent` schema, only its confidence and timing sources.

## Decision

Keep IMU **out of MVP** and behind an optional capability:

- Treat the IMU as an auxiliary onset/velocity signal fused with vision and
  audio, never a requirement.
- If prototyped, feature-detect Web Bluetooth and show an explicit unsupported
  diagnostic. Evaluate a native/Tauri BLE bridge for WebKit and unsupported
  desktop browsers; never imply that vision/audio is degraded when the optional
  accessory is absent.
- Pairing must be user-initiated, scoped to the selected device/services, and
  recover from disconnect without persisting identifiers in public logs.
- Record battery level when exposed, packet rate, dropped samples, clock drift,
  and the effect of reconnects on cooldown/double-hit behavior.
- Reuse the existing shared-clock offset estimation so IMU timestamps align with
  camera and audio, the same approach proposed for multi-camera fusion (#183).

No prototype code exists in this research pass. Revisit only if a specific IMU
stick, GATT profile, firmware/license policy, and supported-browser/native bridge
matrix are proposed in follow-up #240.
