//! Arbitrary bytes straight into the decoder (#262).
//!
//! This is the shape of the real threat: a datagram off the network, no
//! structure assumed. Seed the corpus with the shared conformance vectors
//! (`node scripts/seed-fuzz-corpus.mjs`) so the fuzzer starts from inputs that
//! already clear the magic and version gate — random bytes reach those states
//! only by accident.

#![no_main]

use kgm1_codec_fuzz::assert_decode_contract;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    assert_decode_contract(data);
});
