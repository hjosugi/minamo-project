//! Structural invariants of a valid packet (#262).
//!
//! Where `corrupt_valid` lets the fuzzer choose the damage, this target applies
//! the two mutations whose handling is a stated contract, exhaustively:
//! truncation at *every* offset must be rejected, and *every* unsupported
//! version_major must fail closed rather than be misread as this layout (#256).

#![no_main]

use arbitrary::Arbitrary;
use kgm1_codec::{Kgm1Header, Kgm1Packet, SUPPORTED_VERSION_MAJORS};
use libfuzzer_sys::fuzz_target;

/// Keeps the per-offset sweep below quadratic in fuzzer time; the interesting
/// boundaries are all within the first few dozen bytes anyway.
const MAX_PAYLOAD: usize = 256;

#[derive(Arbitrary, Debug)]
struct Input {
    version_major_choice: u8,
    version_minor: u16,
    frame_id: u64,
    source_time_ns: u64,
    monotonic_time_ns: u64,
    flags: u16,
    encoding: u8,
    payload_type: u8,
    payload: Vec<u8>,
    /// Bytes appended past the declared payload, which the decoder must ignore.
    trailing: Vec<u8>,
}

fuzz_target!(|input: Input| {
    let mut payload = input.payload;
    payload.truncate(MAX_PAYLOAD);

    let header = Kgm1Header {
        version_major: SUPPORTED_VERSION_MAJORS
            [input.version_major_choice as usize % SUPPORTED_VERSION_MAJORS.len()],
        version_minor: input.version_minor,
        frame_id: input.frame_id,
        source_time_ns: input.source_time_ns,
        monotonic_time_ns: input.monotonic_time_ns,
        flags: input.flags,
        encoding: input.encoding,
        payload_type: input.payload_type,
        payload_len: 0,
    };
    let packet =
        Kgm1Packet::new(header, payload.clone()).expect("payload is capped well under u32");
    let encoded = packet.encode();

    let decoded = Kgm1Packet::decode(&encoded).expect("a freshly encoded packet must decode");
    assert_eq!(decoded.payload, payload, "round trip altered the payload");
    assert_eq!(
        decoded.header.frame_id, header.frame_id,
        "round trip altered frame_id"
    );
    assert_eq!(
        decoded.header.source_time_ns, header.source_time_ns,
        "round trip altered source_time_ns"
    );
    assert_eq!(
        decoded.header.monotonic_time_ns, header.monotonic_time_ns,
        "round trip altered monotonic_time_ns"
    );
    assert_eq!(decoded.encode(), encoded, "re-encoding is not byte-stable");

    // Every prefix short of the full packet is a truncated packet.
    for cut in 0..encoded.len() {
        assert!(
            Kgm1Packet::decode(&encoded[..cut]).is_err(),
            "a {cut}-byte prefix of a {}-byte packet must be rejected",
            encoded.len()
        );
    }

    // Bytes past the declared payload belong to the next record, not this one.
    let mut with_trailing = encoded.clone();
    with_trailing.extend_from_slice(&input.trailing);
    let over_read =
        Kgm1Packet::decode(&with_trailing).expect("trailing bytes must not break decode");
    assert_eq!(
        over_read.payload, payload,
        "decode read past the declared payload length"
    );

    // A future major changes the layout, so decoding it as this one would
    // silently misreport every field.
    let mut future = encoded.clone();
    for major in [2u16, 3, 255, 4096, u16::MAX] {
        if SUPPORTED_VERSION_MAJORS.contains(&major) {
            continue;
        }
        future[4..6].copy_from_slice(&major.to_le_bytes());
        assert_eq!(
            Kgm1Header::decode(&future),
            Err("unsupported version_major"),
            "version_major {major} must fail closed"
        );
        assert!(
            Kgm1Packet::decode(&future).is_err(),
            "a packet with version_major {major} must be rejected"
        );
    }

    // The magic exists to keep foreign traffic out of the parser entirely.
    let mut wrong_magic = encoded;
    wrong_magic[3] ^= 0xff;
    assert!(
        Kgm1Packet::decode(&wrong_magic).is_err(),
        "a packet without the KGM1 magic must be rejected"
    );
});
