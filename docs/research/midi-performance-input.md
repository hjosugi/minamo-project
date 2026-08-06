<!-- i18n: language-switcher -->
[English](midi-performance-input.md) | [日本語](midi-performance-input.ja.md)

# Research: MIDI as a Performance Input (Drums, Keys, Guitar)

Status: research pass for issue #278, widened beyond drums to keyboards and
guitar because the input adapter is the same for all three and only the mapping
differs. Everything below is settled from source and does not need hardware.
Related: #121, #123, #234, #235, #238–#241 (drum), #50 (desktop app), #274
(transport/feature-detection precedent), #271 (the MANO blocker),
[imu-stick-integration.md](imu-stick-integration.md) (#185).

## Goal

Decide whether MIDI input is worth adding as a second source of performance
events — for e-drum kits first, and for MIDI keyboards and guitars — and whether
the two papers #278 cites change the drum tracking design.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Web MIDI availability audited across every browser and webview this
  project ships to, not just "modern browsers".
- [x] Licence and artefact audit for DRUMS and for the piano/guitar equivalents
  — #278's second plan item.
- [x] Rapid-Motion-Track checked against the paper rather than against the
  issue's summary of it — #278's third plan item.
- [x] Adapter spec covering all three instruments — #278's first plan item.
- [x] Decision recorded here.
- [ ] Adapter implementation and e-kit verification. **Not done** — needs an
  e-kit, so it is gated the same way #235 and #238–#241 are.

## Findings

### Web MIDI is Chromium-only, and that decides where the adapter lives

Current support: **Chrome 43+, Edge 79+, Firefox 108+, Opera 30+, Samsung
Internet 4+. Safari: no support at any version, including 26.5. iOS: none, in
any browser**, because every iOS browser uses WebKit. WebKit declined on
fingerprinting grounds, and the specification itself names device enumeration as
a fingerprinting vector (while arguing the exposure is comparable to the Gamepad
API). There is no in-progress WebKit implementation to wait for.

That is the opposite of the situation recorded in #274. There, refusing to
UA-sniff meant Safari users got WebTransport on release day with no code change,
because WebKit eventually shipped it. Here, feature detection must degrade to
**"MIDI is unavailable on this browser"** and stay there — not "MIDI later". Any
UI copy has to say so plainly rather than implying a missing permission.

> **Correction (#240): that copy is right for Safari and wrong for Firefox.**
> Firefox implements Web MIDI, but `requestMIDIAccess()` **always rejects**
> (localhost excepted) until the user installs a generated *site permission
> add-on*. Feature detection passes and the promise still fails, so "unavailable
> on this browser" is both false and unactionable there. Presence of the API and
> "the API will resolve here" are separate facts and the UI has to treat them as
> such — see
> [ble-midi-drum-sticks.md](ble-midi-drum-sticks.md) and `selectStickTransport`.

The consequence for the desktop app (#50) is sharper, and it is easy to miss:

| Platform | Tauri webview | Web MIDI |
|---|---|---|
| Windows | WebView2 (Chromium, evergreen) | yes |
| macOS | WKWebView (WebKit, tied to the OS) | **no** |
| Linux | WebKitGTK | **no** |

So a webview-level Web MIDI adapter gives the desktop app MIDI **on Windows
only**. Desktop MIDI input therefore belongs in Rust behind a Tauri command, not
in the page — `src-tauri/Cargo.toml` currently carries six dependencies, four of
them Tauri's own, so a MIDI crate is a reviewed addition under
`DEPENDENCY_POLICY.md`, not a mechanical one. The browser build keeps Web MIDI behind feature detection. Both should emit
the same event shape so the tracker sees one adapter.

Web MIDI also requires a secure context, an explicit permission grant (**even
without sysex**), and is gated by the `midi` Permissions-Policy directive. The
HTTPS dev setup in `docs/DEV_HTTPS.md` already satisfies the first.

### MIDI is the only ground truth that already shares a clock with the tracker

`MIDIMessageEvent.timeStamp` is a `DOMHighResTimeStamp` on the document's time
origin. The tracker's clock is `performance.now()` (`src/core/kgm1.ts:36`, and
throughout `tracker/tracker.js`). Same origin, same page — **no offset
estimation and no drift correction**, which is not true of the audio path:
`fuseVisualHitWithAudio` in `src/core/drum.ts` snaps a visual hit to an onset
within a ±35 ms window and has to assume that window is meaningful.

For `pnpm benchmark:drum` this is the cheapest win available. Today
`minamo.drum-benchmark-manifest.v1` takes hand-written annotations:

```json
"annotations": [
  { "timeMs": 1000, "zoneId": "snare", "hand": "Right" }
]
```

A MIDI capture generates `timeMs` and `zoneId` for free, at the module's own
timing resolution, for as many clips as someone cares to record. **It cannot
generate `hand`.** MIDI note 38 says "snare"; it does not say which stick hit it.
So `handAssignmentAccuracy` in `scoreDrumBenchmarkEvents` stays manually
annotated, and MIDI removes most of the annotation cost, not all of it.

One anchoring detail that will bite whoever implements this: MIDI timestamps are
relative to the capture page's time origin, and manifest `timeMs` values are
relative to clip start. A capture needs an explicit sync marker (a first hit, or
a recorded `t0`) written into the manifest. That is engineering, not research,
but it is not free.

### Nothing carries a hit over the wire today, and the OBS overlay does not need it to

`shared/codec.js` (KGM1-WIRE) encodes exactly three blocks: `BLOCK_FACE`,
`BLOCK_POSE`, `BLOCK_HANDS`. **There is no drum block.** `DrumState` and
`DrumHitEvent` exist only in KGM1-JSON (`src/core/types.ts`) and
`docs/PROTOCOL_V2_DRAFT.md`.

What the networked viewer actually renders is not a hit stream at all:
`viewer/viewer.js:1150` calls `deriveDrumOverlayState(target.hands, …)`, which
re-derives zone activity from received **wrist positions** by proximity
(`shared/runtime.js:650`). A MIDI hit has no wrist position, so it would light up
nothing there.

The OBS overlay is a different and much better story. `viewer/drum-overlay.html`
subscribes to a `minamo-drum` `BroadcastChannel` and folds a stream of real
`DrumHitEvent`s into decaying flashes (`shared/drum-overlay.js`). That is
same-origin, same-device, and needs no protocol change — **a MIDI adapter on the
tracker page can drive the OBS overlay today.** Worth noting while doing so:
`docs/product/drum-obs-overlay.md` says the tracker/viewer publishes hits on that
channel, and nothing in the tree does. `minamo-drum` currently has a subscriber
and no publisher, so the MIDI adapter would be the first one.

So the split is: OBS overlay and benchmark ground truth need no wire work; a
remote viewer reacting to hits needs a KGM2 block, which belongs with #277 rather
than here.

### `DrumHitEvent` can carry a MIDI hit, but three of its fields stop being measurements

`position`, `velocity` and `speed` are geometric quantities from stick tracking.
MIDI supplies a note number, a 0–127 velocity, and a time. Fabricating the other
three would corrupt code that reads them: `confidence` is computed as
`clamp(0.5 + min(speed / 4, 1) * 0.5)`, and `DRUM_MIN_HIT_SPEED_MPS = 0.45`
gates emission. MIDI velocity is not metres per second and must not be cast as
if it were.

The honest shape is a `source` discriminator plus a separate intensity:

- `source: 'vision' | 'audio' | 'midi'` — `audio` is already implied by
  `audioAligned` and by `inferKickPedalHit`, which returns an event with a zero
  position and zero speed. That function is the existing precedent for a hit with
  no geometry, and it is currently indistinguishable from a stalled visual hit.
- `position` from the calibrated `DrumZone.center` — the kit calibration already
  knows where the snare is, which is exactly the information MIDI lacks.
- `velocity`/`speed` left at zero, with `source` explaining why.
- `intensity: number` (0–1) from MIDI velocity / 127, which is what the overlay
  flash and any future animation actually want.

### The GM percussion map nearly covers drums, does cover keys, and does not cover guitar

**Drums.** The General MIDI percussion key map (channel 10) lines up with the
existing `zoneType` union almost exactly — 35/36 kick, 38/40 snare, 42/44/46
hi-hat (closed/pedal/open), 41–50 toms, 49/57 crash, 51/59 ride. The caveat is
that e-kit modules ship manufacturer defaults and are user-remappable; Roland
publishes per-module default note maps and exposes note assignment under the
module's MIDI NOTE menu. So: ship the GM table as the default and add a
"hit each pad once" learn step. Do not hardcode a single vendor's map.

Note that `pedal` and `unknown` in `zoneType` have no GM equivalent, and 44
(pedal hi-hat) is a hi-hat note rather than a pedal note — the hi-hat pedal
state that `inferHiHatPedalState` estimates from audio arrives over MIDI as a
CC4 continuous value on many modules, which is strictly better information than
the audio heuristic and is a separate field, not a hit.

**Keys.** Note number to key is exact, standard, and needs no calibration at
all. Keyboards are also the one category where MIDI output is universal — every
MIDI keyboard has it by definition. The mapping is trivial; the animation is not
(next section).

**Guitar.** A MIDI note does not determine string and fret. The same pitch is
playable at several positions, so avatar fingering is underdetermined by plain
MIDI — the one instrument of the three where the note stream is genuinely
insufficient. Hex-pickup and MPE systems (Jamstik, MIDI Guitar 3 Hex) put each
string on its own channel, which recovers the string and therefore the fret. So
guitar has a MIDI path only for per-string-channel hardware, which is far rarer
than an e-kit or a MIDI keyboard. An ordinary electric guitar emits no MIDI.

That ordering — keys universal, drums common, guitar rare and ambiguous — is the
reason for the priority in the Decision below, and it is a hardware fact rather
than a research question.

### Every MIDI-to-motion model is unusable here, for three different reasons

| Work | Input | Licence | Why it does not apply |
|---|---|---|---|
| **DRUMS** (MIG 2025) | MIDI | paper CC BY 4.0; **no code found** | Nothing to evaluate |
| **FürElise** (SIGGRAPH Asia 2024) | MIDI | dataset **CC BY-NC 4.0**, MANO; code "to be released" | NC + MANO + physics sim |
| **PianoMotion10M** (ICLR 2025) | **audio**, not MIDI | code Apache-2.0 | 320–557 M parameters |
| **Guitar** (SIGGRAPH Asia 2024) | tab / note file | **MIT**, weights included | Requires Isaac Gym |

- **DRUMS** is the closest match to what #278 wants: a BiLSTM predicts both
  hands' 3D trajectories and orientations from MIDI with correct strike timing,
  and a MIDI-matching module retrieves upper-body and facial motion for the
  phrase. No code or weights are published, and the CC BY 4.0 on the ACM page
  covers the paper text. So #278's "evaluate DRUMS-style motion synthesis
  (license, model size)" has **no artefact to evaluate**. Reproducing it needs
  drummer mocap this project does not have.
- **FürElise** takes novel sheet music as MIDI, which is the right interface, and
  fails the licence audit the same way #271's candidates did: CC BY-NC 4.0 on the
  dataset and **MANO** for the hand representation. Same blocker, third issue in
  a row.
- **PianoMotion10M** is the only one with a clean code licence, and its input is
  **audio**, not MIDI — the paper's own pipeline transcribes video audio to MIDI
  for the dataset, not for inference. Its benchmark models are 320–557 M
  parameters. This project's model budget is a few megabytes of ONNX (#222,
  #269).
- The **guitar** paper is MIT with pretrained models included, which is the
  licence outcome this project keeps failing to get — and it is still not
  deployable. It is an RL policy trained and run in Isaac Gym with PyTorch, with
  no export path; the authors also could not ship the music tracks.

The structural point is worth stating once, because it generalises past these
four: **MIDI-to-performance animation is offline character animation.** It is
physics simulation with an RL policy, or a few hundred million parameters, and it
is evaluated as animation quality rather than latency. This project's constraint
is a browser tab holding 60 fps while face and hand tracking already run. The
licence audit is the usual gate, but here it is not the binding one — even the
MIT candidate is out of reach.

**What is actually tractable is not motion synthesis.** For an e-kit, the avatar
has to move a stick to a *known* zone centre at a *known* time: that is IK to a
calibrated target, driven by data the kit calibration already stores. The same
holds for a keyboard, whose key positions are a fixed geometric layout. The hard
research problem in those papers is inferring plausible motion when the target
geometry is unknown; this project's zone calibration removes that problem rather
than solving it. Guitar is the exception, and only because string and fret are
missing from the input — not because the motion is harder.

### Rapid-Motion-Track does not contain the technique #278 attributes to it

#278 describes RMT as using "interpolation/super-resolution against motion blur
and temporal aliasing at 30 fps". Checked against the paper: it has three
modules — a fingertip tracker adapting the authors' P-MSDSNet, an adaptive
vertex-recognition step that picks peaks and troughs, and a kinematic feature
extractor. **It uses no super-resolution, no frame interpolation, no deblurring
and no optical flow**; it handles blur through multi-scale feature fusion inside
the network. It is a January 2023 clinical movement-assessment system, it
publishes no code, and its validated output is *frequency* measures — 97.3% of
results within ±0.5 Hz of a 250 fps Optotrak reference, against ~88.2% for
DeepLabCut. **A ±0.5 Hz frequency agreement is not evidence about per-strike
timing**, which is what the drum benchmark scores at ±35 ms. So there is no
"anti-aliasing technique" here to fold into the stick-tip estimator docs.

The transferable idea is the second module, not the first: peak detection with an
*adaptive* threshold. This project's hit detection is fixed constants —
`DRUM_DOWNSTROKE_MIN_SPEED_MPS = 0.5`, `DRUM_MIN_HIT_SPEED_MPS = 0.45`, a
per-zone `cooldownMs` (40–45 ms in `tests/core.test.ts`), and the benchmark's
`minimumSeparationMs = 35`.

Those constants impose a ceiling that matters before any of this:

| Limit | Value | Max hits/s on one zone |
|---|---|---|
| Benchmark `minimumSeparationMs` | 35 ms | 28.6 |
| `DrumZone.cooldownMs` (as configured in tests) | 40–45 ms | 22–25 |
| Camera Nyquist at 30 fps | — | 15 |
| Camera Nyquist at 60 fps | — | 30 |
| MIDI | — | no ceiling |

`scoreDrumBenchmarkEvents` counts two hits on the same `zoneId` closer than
`minimumSeparationMs` as `falseDoubleHits` **by construction**, and the detector's
cooldown stops the second one being emitted at all. A double-stroke or buzz roll
on a single drum exceeds both. **So #123's fast-roll stress test, as currently
configured, would fail against the detector's own configuration rather than
against its accuracy** — the cooldown that suppresses false rolls
(`issues/backlog/061-drum-add-per-zone-cooldown-to-prevent-false-rolls.md`) is
the same mechanism that suppresses real ones. Whoever records those
clips should set the thresholds deliberately first, or the run measures the
constants instead of the tracking.

And the camera bounds it before the constants do. That is the strongest argument
for the e-kit path: MIDI is the only way to obtain ground truth for rolls the
camera cannot sample in the first place.

## Adapter spec

One adapter, three mappings. Instrument-agnostic at the transport edge so the
Rust desktop path and the Web MIDI browser path emit the same thing.

```ts
export type InstrumentKind = 'drums' | 'keys' | 'guitar';
export type PerformanceSource = 'vision' | 'audio' | 'midi';

/** Raw, before any instrument mapping. Emitted by both adapters. */
export interface MidiNoteEvent {
  timeMs: number;        // MIDIMessageEvent.timeStamp — performance.now() origin
  portId: string;
  channel: number;       // 0-15
  note: number;          // 0-127
  velocity: number;      // 0-127; note-on with velocity 0 is a note-off
  kind: 'noteOn' | 'noteOff' | 'controlChange';
  controller?: number;   // CC number, e.g. 4 for hi-hat pedal position
  value?: number;        // 0-127 for controlChange
}

/** After mapping. Drums additionally project onto DrumHitEvent. */
export interface PerformanceEvent {
  eventId: string;
  timeNs: number;
  source: PerformanceSource;
  instrument: InstrumentKind;
  intensity: number;     // 0-1, MIDI velocity / 127
  targetId: string;      // drums: zoneId | keys: `key:${note}` | guitar: `s${string}f${fret}`
  string?: number;       // guitar, per-string channel only
  fret?: number;         // guitar, derived from string + note
  hand?: Handedness;     // never set from MIDI
}
```

Mapping rules:

- **drums** — GM percussion table by default, overridable by a learn step;
  `targetId` is an existing `zoneId`, so `position` comes from
  `DrumZone.center` and the event projects cleanly onto `DrumHitEvent` with
  `source: 'midi'`, zero velocity/speed. Hi-hat pedal position arrives as CC and
  updates a continuous state rather than emitting a hit.
- **keys** — `targetId` is the note number; no calibration.
- **guitar** — only when each string is on its own channel. Otherwise the
  adapter reports the instrument as unsupported rather than guessing a position,
  because a guessed fret produces a visibly wrong avatar hand.

Ports are enumerated on grant and re-enumerated on `statechange`; a
disconnected module must not silently stop the benchmark capture.

Privacy: MIDI is not video, so the "your video never leaves the device" claim
(`scripts/check-privacy-invariants.mjs`, #264) is untouched — but MIDI *is* the
user's performance, and port names identify their hardware. Keep the same
local-first default the tracker already uses (`DEFAULT_TRACKER_SETTINGS.mode` is
`'local'`), and keep port names out of any report metadata.

## Decision

1. **Spec now, build behind the e-kit gate.** The adapter above is the
   deliverable of this pass; the implementation needs hardware to verify, like
   #235 and #238–#241.
2. **Priority is keys, then drums, then guitar** — by whether the hardware emits
   MIDI at all and whether the note determines a position. Guitar is supported
   only for per-string-channel hardware, and explicitly unsupported otherwise;
   that is a hardware limit, not a backlog item.
3. **Reject all four motion-synthesis models** for the runtime path: DRUMS (no
   artefact), FürElise (CC BY-NC + MANO), PianoMotion10M (audio input, 320–557 M
   params), guitar RL policy (MIT but Isaac Gym only). Drive the avatar with IK
   to calibrated targets instead — the zone/key geometry this project already
   captures is exactly what those models exist to infer.
4. **Take the benchmark ground truth first.** It shares the tracker's clock, it
   needs no protocol change, and it is the only source of truth for rolls above
   the camera's Nyquist limit. It supplies `timeMs` and `zoneId`; `hand` stays
   manual.
5. **Desktop MIDI goes native.** WKWebView and WebKitGTK have no Web MIDI, so a
   webview adapter would be Windows-only. Rust behind a Tauri command, same
   event shape, one reviewed dependency.
6. **Fix the roll ceiling before recording roll clips for #123.** The 35 ms
   benchmark separation and the 40–45 ms zone cooldown cap same-zone rolls at
   22–29 hits/s, below what a buzz roll produces.
7. **No action on Rapid-Motion-Track**, and the correction above is recorded so
   the claim is not re-cited. If someone wants its idea, it is adaptive-threshold
   peak picking, and it applies to the constants in item 6.

## Sources

- Web MIDI support table — <https://caniuse.com/midi>
- Web MIDI API specification (time coordinates, fingerprinting, permission) — <https://webaudio.github.io/web-midi-api/>
- `requestMIDIAccess()` permission model and `midi` Permissions-Policy — <https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess>
- Tauri webview per platform — <https://v2.tauri.app/reference/webview-versions/>
- General MIDI percussion key map (channel 10) — <https://www.cs.cmu.edu/~music/cmp/archives/cmsip/readings/GMSpecs_PercMap.htm>
- Roland default note maps are per-module and editable — <https://support.roland.com/hc/en-us/articles/360005173411-TD-17-Default-MIDI-Note-Map>
- DRUMS: Drummer Reconstruction Using Midi Sequences (MIG 2025) — <https://dl.acm.org/doi/10.1145/3769047.3769066>
- FürElise (SIGGRAPH Asia 2024), dataset CC BY-NC 4.0 — <https://for-elise.github.io/>, <https://huggingface.co/datasets/rcwang/for_elise>
- PianoMotion10M (ICLR 2025), Apache-2.0 code, audio input — <https://github.com/agnJason/PianoMotion10M>
- Synchronize Dual Hands for Physics-Based Dexterous Guitar Playing (SIGGRAPH Asia 2024), MIT, Isaac Gym — <https://github.com/xupei0610/guitar>
- Rapid-Motion-Track (arXiv 2302.08505, January 2023) — <https://arxiv.org/abs/2302.08505>
- Hex pickups / per-string MIDI channels — <https://jam.live/products/MG3Hex/>, <https://www.sweetwater.com/insync/hex-pickup/>
