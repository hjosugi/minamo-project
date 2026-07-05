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
}
