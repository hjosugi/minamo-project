#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Kgm1Header {
    pub version_major: u16,
    pub version_minor: u16,
    pub frame_id: u64,
    pub source_time_ns: u64,
    pub monotonic_time_ns: u64,
    pub flags: u16,
    pub encoding: u8,
    pub payload_type: u8,
    pub payload_len: u32,
}

pub const MAGIC: &[u8; 4] = b"KGM1";
pub const HEADER_LEN: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Kgm1Packet {
    pub header: Kgm1Header,
    pub payload: Vec<u8>,
}

impl Kgm1Header {
    pub fn encode(self) -> [u8; HEADER_LEN] {
        let mut out = [0u8; HEADER_LEN];
        out[0..4].copy_from_slice(MAGIC);
        out[4..6].copy_from_slice(&self.version_major.to_le_bytes());
        out[6..8].copy_from_slice(&self.version_minor.to_le_bytes());
        out[8..16].copy_from_slice(&self.frame_id.to_le_bytes());
        out[16..24].copy_from_slice(&self.source_time_ns.to_le_bytes());
        out[24..32].copy_from_slice(&self.monotonic_time_ns.to_le_bytes());
        out[32..34].copy_from_slice(&self.flags.to_le_bytes());
        out[34] = self.encoding;
        out[35] = self.payload_type;
        out[36..40].copy_from_slice(&self.payload_len.to_le_bytes());
        out
    }

    pub fn decode(input: &[u8]) -> Result<Self, &'static str> {
        if input.len() < HEADER_LEN {
            return Err("input too short");
        }
        if &input[0..4] != MAGIC {
            return Err("invalid magic");
        }
        Ok(Self {
            version_major: u16::from_le_bytes(input[4..6].try_into().unwrap()),
            version_minor: u16::from_le_bytes(input[6..8].try_into().unwrap()),
            frame_id: u64::from_le_bytes(input[8..16].try_into().unwrap()),
            source_time_ns: u64::from_le_bytes(input[16..24].try_into().unwrap()),
            monotonic_time_ns: u64::from_le_bytes(input[24..32].try_into().unwrap()),
            flags: u16::from_le_bytes(input[32..34].try_into().unwrap()),
            encoding: input[34],
            payload_type: input[35],
            payload_len: u32::from_le_bytes(input[36..40].try_into().unwrap()),
        })
    }
}

impl Kgm1Packet {
    pub fn new(mut header: Kgm1Header, payload: Vec<u8>) -> Result<Self, &'static str> {
        header.payload_len = payload.len().try_into().map_err(|_| "payload too large")?;
        Ok(Self { header, payload })
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(HEADER_LEN + self.payload.len());
        let mut header = self.header;
        header.payload_len = self.payload.len() as u32;
        out.extend_from_slice(&header.encode());
        out.extend_from_slice(&self.payload);
        out
    }

    pub fn decode(input: &[u8]) -> Result<Self, &'static str> {
        let header = Kgm1Header::decode(input)?;
        let end = HEADER_LEN
            .checked_add(header.payload_len as usize)
            .ok_or("payload length overflow")?;
        if input.len() < end {
            return Err("payload truncated");
        }
        Ok(Self {
            header,
            payload: input[HEADER_LEN..end].to_vec(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_header() {
        let header = Kgm1Header {
            version_major: 0,
            version_minor: 1,
            frame_id: 42,
            source_time_ns: 100,
            monotonic_time_ns: 200,
            flags: 0,
            encoding: 1,
            payload_type: 0,
            payload_len: 1234,
        };
        let encoded = header.encode();
        let decoded = Kgm1Header::decode(&encoded).unwrap();
        assert_eq!(decoded, header);
    }

    #[test]
    fn decodes_js_golden_header_vector() {
        let bytes = [
            0x4b, 0x47, 0x4d, 0x31, 0x01, 0x00, 0x07, 0x00, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03,
            0x02, 0x01, 0x15, 0xcd, 0x07, 0x1d, 0xe3, 0xaa, 0xde, 0x17, 0xea, 0x16, 0xb0, 0x4c,
            0x02, 0x00, 0x00, 0x00, 0x21, 0x00, 0x03, 0x02, 0x04, 0x00, 0x00, 0x00,
        ];
        let header = Kgm1Header::decode(&bytes).unwrap();
        assert_eq!(header.version_major, 1);
        assert_eq!(header.version_minor, 7);
        assert_eq!(header.frame_id, 0x0102030405060708);
        assert_eq!(header.source_time_ns, 1_720_000_000_123_456_789);
        assert_eq!(header.monotonic_time_ns, 9_876_543_210);
        assert_eq!(header.flags, 0x21);
        assert_eq!(header.encoding, 3);
        assert_eq!(header.payload_type, 2);
        assert_eq!(header.payload_len, 4);
        assert_eq!(header.encode(), bytes);
    }

    #[test]
    fn round_trips_packet_payload() {
        let header = Kgm1Header {
            version_major: 1,
            version_minor: 7,
            frame_id: 0x0102030405060708,
            source_time_ns: 1_720_000_000_123_456_789,
            monotonic_time_ns: 9_876_543_210,
            flags: 0x21,
            encoding: 3,
            payload_type: 2,
            payload_len: 0,
        };
        let packet = Kgm1Packet::new(header, vec![0xca, 0xfe, 0xba, 0xbe]).unwrap();
        let encoded = packet.encode();
        let decoded = Kgm1Packet::decode(&encoded).unwrap();
        assert_eq!(decoded.header.payload_len, 4);
        assert_eq!(decoded.payload, vec![0xca, 0xfe, 0xba, 0xbe]);
        assert_eq!(
            Kgm1Packet::decode(&encoded[..encoded.len() - 1]).unwrap_err(),
            "payload truncated"
        );
    }
}
