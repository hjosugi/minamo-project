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
nonce_suffix u8x8 | AES-GCM ciphertext+tag
```

The full AES-GCM nonce is 12 bytes. The first 4 bytes are derived from the room
key and room name; the last 8 bytes are random and sent with the frame. AES-GCM
adds a 16-byte tag, so per-frame overhead is exactly 24 bytes.

## Key Derivation

`deriveRoomKey(secret, room)` uses WebCrypto PBKDF2-SHA-256 and derives a
non-extractable AES-256-GCM key. The room key is shared out of band, for example
in a URL fragment that is never sent to the relay.

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
- overhead is exactly 24 bytes per frame

## Notes

This profile uses WebCrypto AES-GCM because it is available in browsers without
shipping a cryptography bundle. The KGM-037 acceptance criteria are about relay
opacity, overhead, and wrong-key behavior; if Minamo later vendors libsodium for
XChaCha20-Poly1305, the same `shared/e2ee.js` interface should be preserved.
