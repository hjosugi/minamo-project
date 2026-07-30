<!-- i18n: language-switcher -->
[English](kgm2-bitrate.md) | [日本語](kgm2-bitrate.ja.md)

# Research: KGM2 Bitrate — Entropy Coding vs Neural Tokenizers

Status: research pass for issue #277, with the wire cost measured. Related:
[../design/DD-006-kgm2.md](../design/DD-006-kgm2.md),
[../PROTOCOL_V2_DRAFT.md](../PROTOCOL_V2_DRAFT.md),
[../compression/motion-delta-quantization.md](../compression/motion-delta-quantization.md),
[transport-strategy-2026.md](../transport/transport-strategy-2026.md) (#274).

## Goal

Decide whether KGM2 should adopt quantized-delta plus entropy coding
(HGC-Avatar's parameter-stream layer) or a causal neural motion tokenizer — and,
before either, establish how many bytes are actually available to win.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: no wire change is proposed here;
  this bounds the options before one is chosen.
- [x] Wire cost measured exactly and verified against the encoder
  (`pnpm bench:kgm2`).
- [x] Decision written, including the explicit "no neural codec unless
  loss-concealment lands" outcome #277 asks for.
- [ ] Measure the entropy of real KGM1 recordings. **Not done, and not
  possible in this repo** — see "There is no corpus".

## Findings

### The frame layout, exactly

Computed from `shared/kgm2.js` and confirmed against real encoder output by
`scripts/bench-kgm2-bitrate.mjs` (the script exits non-zero if the model and the
encoder disagree):

```text
keyframe: 74 B = header 12 + quat 4 + pos 6 + weights 52
delta:  26+N B = header 12 + quat 4 + pos 3 + mask 7 + N active channels
```

`N` is the number of blendshape channels whose quantized delta clears the change
threshold. KGM1 is ~76 B/frame and KGM2's target is half that, 38 B.

| N | delta bytes | vs 38 B target | entropy-codable | floor if payload were free |
|---|---|---|---|---|
| 0 | 26 | under by 12 | 7 B (27%) | 19 B |
| 4 | 30 | under by 8 | 11 B (37%) | 19 B |
| 8 | 34 | under by 4 | 15 B (44%) | 19 B |
| 12 | 38 | **exactly at target** | 19 B (50%) | 19 B |
| 24 | 50 | over by 12 | 31 B (62%) | 19 B |
| 52 | 78 | over by 40 | 59 B (76%) | 19 B |

### KGM2 already meets its target for a dozen active channels

At N ≤ 12 the format is at or under 38 B/frame **with no entropy coding at
all**. The compression question is therefore not "how do we reach the target"
but "how often does N exceed 12", which is a property of real motion — exactly
what the missing corpus would tell us.

### Both proposals target the smaller half of the frame

An entropy coder can only touch the mask and the delta bytes: 7 + N of
26 + N. The remaining **19 B is a floor** — a 12 B header, a quat already packed
smallest-three into 4 B, and 3 B of int8 position deltas. Those are already
near-minimal representations; no payload coder reaches them.

That floor is **50% of the entire 38 B target on its own.** So even a perfect
coder — one that compressed mask and deltas to nothing — could not do better
than halve a typical frame, and a realistic static Huffman or range coder
recovers some fraction of 7 + N, not all of it.

A neural tokenizer inherits exactly the same ceiling, while adding model weights,
inference latency in the encode path, and a decoder nobody can debug from a hex
dump. #277's own "practical prior" — that quantized-delta plus a static entropy
table beats neural codecs on complexity, latency and debuggability for this
channel count — is correct, and the measurement makes it stronger: they are
competing for the same ≤ 27–76% slice, and the simple one wins the rest of the
comparison outright.

### The largest fixed cost is the header, which neither proposal touches

The 12 B header is `magic 2 + version 1 + type 1 + t 4 + seq 2 + keyId 2`, and
at least three fields carry redundancy:

- **`keyId` (2 B) is fully derivable.** `Kgm2FaceEncoder` computes it as
  `Math.floor(frame.seq / this.keyframeInterval) & 0xffff` — a pure function of
  `seq` and an interval both sides already know.
- **`t` (4 B absolute ms) is mostly predictable from `seq`.** At a known frame
  rate `t ≈ seq × 1000/fps`; a small signed correction carries the jitter that
  matters, and the receiver already runs clock sync (`estimateClockOffsetMs`).
  Roughly 3 B recoverable.
- **`magic` + `version` (3 B) repeat on every datagram** of a session whose
  transport already framed and demultiplexed it.

That is **up to 8 B/frame from the header**, against 7 + N addressable by
entropy coding — and unlike entropy coding it is deterministic, needs no coder,
no probability tables, no decode-side CPU, and stays trivially debuggable.

### E2EE overhead dwarfs the payload win

From #274: `shared/e2ee.js` adds 24 B per frame — a transmitted 12 B random
nonce plus a 12 B GCM tag. At N = 12 the plain frame is 38 B, so the wire frame
is **62 B, a 63% overhead**.

Dropping the transmitted nonce alone saves 12 B — more than entropy-coding the
entire 19 B payload could plausibly deliver. That saving is available only with
per-participant keys (a room-scoped key makes a counter nonce unsafe under
multi-sender rooms; see #274), so it is key-management work, not codec work.

The ranking that falls out: **per-participant keys > header redesign > entropy
coding > neural tokenizer.**

### There is no corpus

#277's first work item is "measure the entropy of real KGM1 recordings (the
JSONL corpus)". No such corpus exists. `tests/fixtures/kgm1-synthetic.jsonl` is
**two lines** — one metadata record and one motion record — a schema fixture,
not a recording.

This is why the analysis above is structural rather than statistical. A synthetic
corpus could be generated, but its entropy would describe the generator, not
human motion, and would overstate achievable compression because synthetic
motion is smoother than real motion. A number like that is worse than no number,
because it would be quoted later.

What a real corpus would settle, and nothing else can: the distribution of `N`,
which decides how often KGM2 is already at target, and the delta-value
distribution, which decides what an entropy coder would actually recover.
Capturing it needs consented recordings and runs into the same privacy rules
that keep raw media out of this repo.

## Decision

**No neural motion codec.** Not now, and not when a corpus arrives — unless
packet-loss concealment is separately wanted, which is the one thing a predictive
model offers that a table cannot. Recorded as #277 requested.

**No entropy coding yet.** It attacks 7 + N of a 26 + N frame, against a 19 B
floor it cannot reach, and KGM2 already meets its target at N ≤ 12. Revisit only
if a corpus shows N routinely above ~16, and even then take the header work
first.

**Do the header instead, when bitrate next matters.** Up to 8 B/frame,
deterministic, no coder. `keyId` is the free one — it is already a pure function
of `seq`.

**Prioritise per-participant keys above all of it.** 12 B/frame from dropping the
transmitted nonce is the largest single saving identified, and it is blocked on
key management rather than compression (#274, and the rooms work in #43/#225).

**Prerequisite for any of it:** a consented motion corpus. Without one, `N` is
unknown, and `N` is the variable the whole question turns on.

## Sources

- HGC-Avatar (parameter-stream quantization + Huffman) — arXiv 2510.16463, cited by #277
- Causal Motion Tokenizer (ICCV 2025 W) — <https://openaccess.thecvf.com/content/ICCV2025W/I-HFM/papers/Jiang_Causal_Motion_Tokenizer_for_Streaming_Motion_Generation_ICCVW_2025_paper.pdf>
- Wire costs: `scripts/bench-kgm2-bitrate.mjs`, verified against `shared/kgm2.js`
