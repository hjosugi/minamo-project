//! Valid packets, then corrupted (#262).
//!
//! The lesson recorded on the JS half of this issue was that random buffers
//! essentially never produce a well-formed packet, so the branches past the
//! magic and version gate go untested while the target still reports success.
//! Here the fuzzer builds a *valid* packet first and only then mutates it, so
//! every input lands at or beyond that gate.

#![no_main]

use arbitrary::Arbitrary;
use kgm1_codec::{Kgm1Header, Kgm1Packet, HEADER_LEN, SUPPORTED_VERSION_MAJORS};
use kgm1_codec_fuzz::assert_decode_contract;
use libfuzzer_sys::fuzz_target;

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
    /// Byte positions to overwrite, and what to overwrite them with. Empty means
    /// the packet is left intact, which is a case worth fuzzing too.
    edits: Vec<(u16, u8)>,
    /// How many bytes to lop off the end after editing.
    truncate_by: u16,
}

fuzz_target!(|input: Input| {
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
    let Ok(packet) = Kgm1Packet::new(header, input.payload) else {
        return;
    };
    let mut bytes = packet.encode();

    // Intact, it must decode back to exactly what went in.
    let decoded = Kgm1Packet::decode(&bytes).expect("a freshly encoded packet must decode");
    assert_eq!(decoded, packet, "round trip lost or altered a field");
    assert_eq!(
        decoded.header.payload_len as usize,
        packet.payload.len(),
        "payload_len must be rewritten from the payload on encode"
    );

    for (offset, value) in input.edits {
        let offset = offset as usize;
        if offset < bytes.len() {
            bytes[offset] = value;
        }
    }
    let keep = bytes.len().saturating_sub(input.truncate_by as usize);
    bytes.truncate(keep);

    assert_decode_contract(&bytes);

    // A header claiming a payload it does not carry must be rejected rather than
    // read past the end — the class of bug this issue exists for. Only assert it
    // when the edits left a header the decoder will still look at.
    if bytes.len() >= HEADER_LEN {
        let mut overclaiming = bytes[..HEADER_LEN].to_vec();
        overclaiming[36..40].copy_from_slice(&u32::MAX.to_le_bytes());
        overclaiming.extend_from_slice(&bytes[HEADER_LEN..]);
        assert!(
            Kgm1Packet::decode(&overclaiming).is_err(),
            "a header claiming 4 GiB of payload must be rejected"
        );
    }
});
