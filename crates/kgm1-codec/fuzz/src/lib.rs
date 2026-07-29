//! The decode contract every byte-oriented fuzz target asserts (#262).
//!
//! A fuzz target that only checks "did not panic" is nearly worthless here: the
//! decoder is safe Rust, so a length-field bug shows up as a wrong *value* or a
//! wrong *verdict*, not a crash. Worse, "never panics" is also satisfied by a
//! decoder that rejects everything. So the contract is stated in both
//! directions — accepted bytes must be a faithful packet, and rejected bytes
//! must be genuinely invalid.
//!
//! The validity predicate below is re-derived from the format description in
//! `docs/PROTOCOL.md` rather than from the decoder, so it cannot agree with the
//! decoder by sharing its bug.

use kgm1_codec::{Kgm1Header, Kgm1Packet, HEADER_LEN, MAGIC, SUPPORTED_VERSION_MAJORS};

/// `Some(declared payload length)` if the first 40 bytes are a header this
/// decoder is allowed to interpret, `None` otherwise.
fn header_payload_len(data: &[u8]) -> Option<usize> {
    if data.len() < HEADER_LEN {
        return None;
    }
    if &data[0..4] != MAGIC {
        return None;
    }
    let version_major = u16::from_le_bytes([data[4], data[5]]);
    if !SUPPORTED_VERSION_MAJORS.contains(&version_major) {
        return None;
    }
    Some(u32::from_le_bytes([data[36], data[37], data[38], data[39]]) as usize)
}

/// `Some(payload length)` if `data` also carries the payload its header claims.
fn packet_payload_len(data: &[u8]) -> Option<usize> {
    let payload_len = header_payload_len(data)?;
    let end = HEADER_LEN.checked_add(payload_len)?;
    if data.len() < end {
        return None;
    }
    Some(payload_len)
}

/// Assert the full decode contract for one arbitrary byte string.
pub fn assert_decode_contract(data: &[u8]) {
    assert_header_contract(data);

    match (Kgm1Packet::decode(data), packet_payload_len(data)) {
        (Ok(packet), Some(payload_len)) => {
            let end = HEADER_LEN + payload_len;
            // The bounds check is the point of this target: an accepted packet
            // hands back exactly as many payload bytes as its header declares,
            // and every one of them came from inside the input.
            assert_eq!(
                packet.header.payload_len as usize, payload_len,
                "decoded payload_len disagrees with the header field"
            );
            assert_eq!(
                packet.payload.len(),
                payload_len,
                "payload length {} does not match the declared {payload_len}",
                packet.payload.len()
            );
            assert_eq!(
                packet.payload.as_slice(),
                &data[HEADER_LEN..end],
                "payload bytes are not the ones the input carried"
            );
            // Re-encoding reproduces the input prefix byte for byte, so no field
            // can be read from the wrong offset without this diverging.
            assert_eq!(
                packet.encode().as_slice(),
                &data[..end],
                "re-encoding an accepted packet did not reproduce its bytes"
            );
        }
        (Err(_), None) => {}
        (Ok(packet), None) => panic!(
            "accepted {} bytes that are not a valid packet: {:?}",
            data.len(),
            packet.header
        ),
        // Without this arm a decoder that rejects everything passes the target.
        (Err(error), Some(payload_len)) => {
            panic!("rejected a well-formed packet with a {payload_len}-byte payload: {error}")
        }
    }
}

/// Header decoding is reachable on its own (the recorder reads a header before
/// deciding whether to pull the payload), so it carries its own contract.
fn assert_header_contract(data: &[u8]) {
    match (Kgm1Header::decode(data), header_payload_len(data)) {
        (Ok(header), Some(payload_len)) => {
            assert_eq!(
                header.payload_len as usize, payload_len,
                "header payload_len read from the wrong offset"
            );
            assert!(
                SUPPORTED_VERSION_MAJORS.contains(&header.version_major),
                "accepted unsupported version_major {}",
                header.version_major
            );
            // A header round-trips into the same 40 bytes it was read from.
            assert_eq!(
                header.encode().as_slice(),
                &data[..HEADER_LEN],
                "re-encoding an accepted header did not reproduce its bytes"
            );
        }
        (Err(_), None) => {}
        (Ok(header), None) => panic!("accepted an invalid header: {header:?}"),
        (Err(error), Some(_)) => panic!("rejected a well-formed header: {error}"),
    }
}
