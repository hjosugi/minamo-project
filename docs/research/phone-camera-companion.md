# Research: Phone Camera Companion App

Status: research design for issue #184. Related: #51 (phone-as-tracker mode),
[../product/phone-tracker.md](../product/phone-tracker.md), #183.

## Goal

Evaluate whether a phone should act as a companion capture device for Minamo,
and decide between a native companion app and the existing browser tracker
running on the phone.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: no raw video leaves the phone;
  only KGM motion frames are published, exactly like the desktop tracker.
- [ ] Documentation review (this doc).
- [ ] Manual verification if a prototype is built (deferred).

## Findings

- Phones often have better cameras and on-device ML than laptops, so a phone as
  the capture device is attractive for face/hand quality.
- The browser tracker already runs on mobile browsers; the missing pieces are QR
  pairing and a small-screen layout, both tracked by #51.
- A native app would add App Store/Play Store distribution, native camera
  control, and background stability, but at a large maintenance cost and a second
  codebase, which conflicts with the "single browser-first tracker" direction.

## Decision

Prefer the **browser companion** (progressive web app), not a native app:

- Reuse the existing tracker; add QR pairing (#51) and a mobile layout pass.
- Keep the privacy contract identical: on-device inference, motion-only
  publishing over the existing WS/WebTransport transports.
- Only reconsider a native app if a concrete capability (true background
  capture, a camera API the browser cannot reach) becomes a hard requirement.

This keeps one tracker codebase and defers native work. The companion becomes the
first realistic "second camera" for multi-camera fusion (#183). No new code in
this doc beyond what #51 already tracks.
