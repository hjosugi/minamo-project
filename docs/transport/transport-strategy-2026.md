<!-- i18n: language-switcher -->
[English](transport-strategy-2026.md) | [日本語](transport-strategy-2026.ja.md)

# Transport Strategy Refresh (2026)

Status: research pass for issue #274. Refreshes the transport plan against two
ecosystem shifts — WebTransport reaching Baseline, and MoQ maturing — and records
which of #274's proposed items were already satisfied.
Related: [moq-evaluation.md](moq-evaluation.md), [../security/e2ee.md](../security/e2ee.md), #227, #248, #277.

## Goal

Decide whether the transport plan changes now that WebTransport is available in
every current browser, and whether `draft-ietf-moq-secure-objects` should replace
Minamo's E2EE envelope design.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: WebTransport stays preferred with a
  WebSocket fallback; the custom KGM datagram protocol is unchanged.
- [x] WebTransport Baseline status verified at source.
- [x] Transport negotiation audited against #274's "feature-detect, not UA-sniff".
- [x] MoQ transport and secure-objects revisions checked, with a go/no-go trigger.
- [x] E2EE envelope mapped onto secure-objects, deltas recorded.

## Two of #274's items were already done

**"Update transport negotiation defaults: WT-first on every capable browser
(feature-detect, not UA-sniff)"** — already the case, and the UA heuristic the
issue describes does not exist in this repository.

- `detectTransportCapabilities()` in `shared/transport.js` tests
  `typeof scope.WebTransport !== 'undefined'`. No user-agent involved.
- `recommendPhoneTransport()` in `shared/pairing.js` carries the comment: "User-agent
  sniffing is intentionally excluded so new Safari/WebKit releases can use
  WebTransport without waiting for an allow-list update."
- A tree-wide search for `navigator.userAgent` / `navigator.platform` finds one
  hit, `desktop/desktop.js` displaying an OS label. Nothing in transport
  selection reads it.
- `TRANSPORT_FALLBACKS.wt` is `['wt', 'ws', 'local']` — WebTransport first, then
  WebSocket, then local.

So the decision recorded in that comment has now paid off exactly as intended:
Safari 26.4 users got WebTransport on the day it shipped, with no code change.
`DEFAULT_TRACKER_SETTINGS.mode` is `'local'`, which is not a transport-preference
bug — it is the privacy-first default for the same-device tracker→viewer case.
Once a networked mode is chosen, negotiation is WT-first.

**"Refresh the MoQ evaluation doc"** — [moq-evaluation.md](moq-evaluation.md)
already cited `draft-ietf-moq-transport-18` and already recorded a no-go. It was
one revision stale (see below) and lacked the explicit trigger, both now fixed.

**"the e2ee.js nonce issue #248"** — #248 is **closed**. The current envelope is
the result of that fix, not a pending problem.

## WebTransport is Baseline

Safari 26.4 shipped WebTransport in March 2026 on desktop and iOS, joining
Chrome 97+, Edge 98+ and Firefox 114+. Confirmed in WebKit's own release notes
(<https://webkit.org/blog/17862/webkit-features-for-safari-26-4/>).

Consequence for this repo: the Node WebSocket relay is now a **legacy fallback**,
not a co-equal path. It stays for enterprise proxies that block QUIC/UDP and for
older browsers, and it remains the only option on non-HTTPS origins. Docs should
describe it that way rather than as one of two normal choices.

## MoQ: still no-go, now with a trigger

`draft-ietf-moq-transport` is at **revision 19, dated 2026-07-06**, an Active
Internet-Draft in the moq WG, with an IESG-submission milestone of **Dec 2026**.
The repo doc cited -18 (May 2026), so it was one revision behind; #274's body
says "-17/-18", two behind. Wire changes still land per revision.

The no-go stands, and gets an explicit trigger so it stops being re-litigated:

> **Adopt MoQT when all three hold:** (1) `draft-ietf-moq-transport` is published
> as an RFC or has cleared IESG review; (2) at least two browser-native or
> widely-used client libraries interoperate against a public relay; (3) a MoQT
> track mapping for KGM frames can run in CI against a relay we do not operate.

Until then the custom KGM datagram protocol over raw WebTransport remains
correct: MoQT's object/group model is video-oriented, and its pub/sub machinery
buys nothing for a client-relay topology with one publisher per participant.
Keeping the relay's forwarding path protocol-agnostic is enough to leave the door
open. WebRTC DataChannel remains explicitly not worth building — ICE/SDP
complexity for no latency win in this topology.

## E2EE: secure-objects is a useful reference, not a replacement

`draft-ietf-moq-secure-objects` is at **revision 01, dated 2026-07-06**, Active
I-D, intended Standards Track. It specifies AEAD encryption of MoQT objects so
relays can still store-and-forward.

| Aspect | secure-objects -01 | `shared/e2ee.js` today |
|---|---|---|
| Key scope | per **track** `(Key ID, track_base_key)`; distribution out of scope | per **room**, HKDF salt `minamo:<room>` |
| Nonce | derived salt XOR 96-bit counter = 64-bit Group ID ‖ 32-bit Object ID — **deterministic, never on the wire** | 96-bit **random**, transmitted with every frame (12 B) |
| Per-message key | one track key, counter nonce | HKDF-derived **per-frame** key, salt = nonce |
| AEAD | AES-GCM or AES-CTR-HMAC | AES-GCM, 96-bit tag |
| Wire overhead | tag only | 24 B (12 nonce + 12 tag) |

The interesting delta is the nonce. secure-objects spends **zero bytes** on it by
deriving it from identifiers already in the MoQT header. Minamo spends 12 bytes
per frame — 720 B/s at 60 fps, purely for nonce transport, in a protocol whose
entire point is compact motion datagrams (cf. #277 on KGM2 bitrate). KGM frames
already carry a `seq`, so an equivalent counter nonce is constructible and would
halve E2EE overhead from 24 to 12 bytes.

**But that saving is not free, and the reason is why the current design is
right.** A counter nonce is only safe if it can never repeat under one key.
secure-objects gets that from key scope: a track has exactly one publisher, so
`(Group ID, Object ID)` is unique by construction. Minamo uses one key per
*room*, and multi-avatar rooms (#43, #225) put several senders under it — two
participants would collide on `seq` and reuse a GCM nonce, which is catastrophic.
The random 96-bit nonce plus per-frame HKDF avoids that with no cross-sender
coordination, which is exactly what #248 concluded.

**Decision: keep the current envelope.** Adopt secure-objects' construction only
as part of moving to **per-participant keys**, at which point `(participant, seq)`
becomes unique and the 12-byte nonce can be dropped. That is a key-management
change, not a nonce change, and it belongs with the multi-avatar room work rather
than being done speculatively. Recorded here so the 12 bytes are understood as a
deliberate purchase of multi-sender safety, not an oversight.

## Decision

1. **Keep WebTransport-first with a WebSocket fallback.** No code change needed;
   negotiation is already capability-detected and correctly ordered.
2. **Reposition the WebSocket relay as a legacy fallback** in documentation —
   enterprise proxies, pre-26.4 Safari, non-HTTPS origins.
3. **MoQ stays no-go**, with the three-part trigger above.
4. **Keep the E2EE envelope**, and revisit secure-objects' counter nonce together
   with per-participant keys.
5. **No WebRTC DataChannel.**

## Sources

- WebKit features for Safari 26.4 — <https://webkit.org/blog/17862/webkit-features-for-safari-26-4/>
- `draft-ietf-moq-transport` (rev 19, 2026-07-06) — <https://datatracker.ietf.org/doc/draft-ietf-moq-transport/>
- `draft-ietf-moq-secure-objects` (rev 01, 2026-07-06) — <https://datatracker.ietf.org/doc/draft-ietf-moq-secure-objects/>
