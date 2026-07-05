# KGM2 Reference Codecs

Status: implemented for KGM2 compact face frames and KGM1B packet framing.

## Implemented Files

- `shared/kgm2.js`: JS KGM2 compact face encoder/decoder.
- `shared/kgm1b.js`: JS KGM1B packet framing.
- `crates/kgm1-codec`: Rust KGM1B reference crate, registered in the root Cargo workspace.
- `packages/kgm1-codec-py`: Python KGM1B reference package.
- `scripts/kgm1b_codec.py`: CLI wrapper around the Python package.

## Golden Vector

The JS implementation emits this 40-byte KGM1B header for the cross-language
fixture:

```text
4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000
```

Decoded fields:

| Field | Value |
|---|---:|
| version | 1.7 |
| frame_id | 72623859790382856 |
| source_time_ns | 1720000000123456789 |
| monotonic_time_ns | 9876543210 |
| flags | 33 |
| encoding | 3 |
| payload_type | 2 |
| payload_len | 4 |

The packet fixture appends payload `cafebabe`.

## Verification

Run:

```sh
npm test
cargo test --manifest-path crates/kgm1-codec/Cargo.toml
python3 scripts/kgm1b_codec.py decode-packet 4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000cafebabe
PYTHONPATH=packages/kgm1-codec-py python3 -m kgm1_codec decode-header 4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000
```

`npm test` additionally verifies:

- smallest-three quaternion max angular error below 0.5 degrees over
  1,000,000 random rotations
- JS smallest-three encode+decode below 1 microsecond per quaternion on the
  local Node runtime
- KGM2 delta/keyframe frame-size reduction of at least 35%
- 10% packet loss plus a dropped keyframe recovers at the next keyframe
- deltas without a base keyframe are rejected
- sparse masks hold unchanged channels
- idle-face delta frames are 26 bytes

## Non-Goals

This page does not close the production transport work for automatic
negotiation, relay scale-out, MoQ evaluation, or end-to-end encryption. Those
issues require separate runtime integration and verification.
