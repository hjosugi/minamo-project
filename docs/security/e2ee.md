<!-- i18n: language-switcher -->
[English](e2ee.md) | [日本語](e2ee.ja.md)

# Tracking Frame E2EE

Status: implemented reference profile in `shared/e2ee.js`.

Minamo relays should not need to read tracking frames. The E2EE profile seals
each KGM frame before it enters WebSocket or WebTransport. The relay sees only
opaque bytes and continues to forward frames without decoding KGM1/KGM2.
In short, the relay sees only opaque bytes.

## Frame Format

```text
nonce u8x12 | AES-GCM ciphertext+tag
```

Envelope version 2 sends a fully random 96-bit AES-GCM nonce with every frame.
It has no room-wide deterministic prefix, so independent publishers do not
share the old 64-bit random nonce space. AES-GCM uses a 96-bit authentication
tag, so per-frame overhead remains exactly 24 bytes.

The profile identifier `minamo.kgm.e2ee.v2` is authenticated as additional
data. A version 1 packet therefore fails authentication instead of being
misinterpreted as motion data.

## Key Derivation

`deriveRoomKey(secret, room)` uses WebCrypto PBKDF2-SHA-256 to derive a
non-extractable HKDF base key. Each full-width random nonce then derives a fresh
non-extractable AES-256-GCM frame key through HKDF-SHA-256. This per-frame rekeying
bounds use of each AES-GCM key to one message. The room secret is
shared out of band, for example in a URL fragment that is never sent to the
relay.

## Failure Behavior

`decryptFrame()` throws:

```text
Unable to decrypt tracking frame: wrong room key or corrupted frame
```

The viewer must surface that message instead of attempting to decode garbage
motion. Tests assert that a wrong key rejects with this clear error.

## Verification

`pnpm test` covers:

- ciphertext does not contain the plaintext KGM1 frame
- decrypting with the correct key returns the original frame bytes
- wrong-key decrypt fails with a clear error
- independent senders use the complete 96-bit random nonce field
- the version 2 profile rejects a legacy version 1 envelope
- overhead is exactly 24 bytes per frame

## Notes

This profile uses WebCrypto HKDF and AES-GCM because they are available in
browsers without shipping a cryptography bundle. The KGM-037 acceptance
criteria are about relay opacity, overhead, and wrong-key behavior; if Minamo
later vendors libsodium for XChaCha20-Poly1305 or aligns the envelope with
IETF MoQ Secure Objects, the same `shared/e2ee.js` interface should be
preserved.

MoQ Secure Objects is not adopted directly in version 2: Minamo still needs the
same compact envelope for both WebSocket and WebTransport, while that draft is
still evolving. Issue #274 tracks the transport-level evaluation. Its
publisher-specific key and nonce guidance should be revisited before a future
wire-format version is standardized.
