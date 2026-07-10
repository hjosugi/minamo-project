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
- [x] Documentation review ([PR #220 review record](../verification/pr-220/research-review/184.md)).
- [ ] Manual verification is `BLOCKED` by #226 (QR UI), #227 (secure transport
  negotiation), and #228 (real-iPhone timing); none of those results is claimed
  by this research decision.

## Findings

- Phones often have better cameras and on-device ML than laptops, so a phone as
  the capture device is attractive for face/hand quality.
- The browser tracker is the intended mobile implementation path, but this pass
  does not claim a verified phone prototype. QR pairing, secure HTTPS-to-WSS/WT
  transport, small-screen behavior, and real-device timing are tracked by
  #226–#228 under #51.
- A native app would add App Store/Play Store distribution, native camera
  control, and background stability, but at a large maintenance cost and a second
  codebase, which conflicts with the "single browser-first tracker" direction.

## Decision

Prefer the **browser companion** (progressive web app), not a native app:

- Reuse the existing tracker; add QR pairing (#51) and a mobile layout pass.
- Keep the privacy contract identical: on-device inference, motion-only
  publishing over the existing WS/WebTransport transports.
- Require HTTPS and secure WSS/WT from the phone page; plain WS from an HTTPS
  page is not a supported fallback.
- Only reconsider a native app if a concrete capability (true background
  capture, a camera API the browser cannot reach) becomes a hard requirement.

This keeps one tracker codebase and defers native work. The companion becomes the
first realistic "second camera" for multi-camera fusion (#183). Real iPhone
evidence must be linked from #228 before the prototype/manual criterion can
pass. No runtime completion is claimed by this research document.
