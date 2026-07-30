<!-- i18n: language-switcher -->
[English](inochi2d-fork-strategy.md) | [日本語](inochi2d-fork-strategy.ja.md)

# Research: 2D Puppet Strategy After the Inochi2D Fork

Status: research pass for issue #275. Decides the 2D-format target now that the
Inochi2D ecosystem has forked. Related: #38, #230,
[../design/DD-004-inochi2d.md](../design/DD-004-inochi2d.md),
[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md).

## Goal

Decide whether Minamo should track the nijilive format, stay frozen on
Inochi2D 0.8.x, or support both behind detection — before more integration work
lands on a line that may be stagnant.

## Acceptance criteria

- [x] The goal is clear.
- [x] Acceptance criteria are clear.
- [x] Does not contradict the existing design: the 2D path stays off the critical
  path and the vendored artefact stays hash-pinned.
- [x] Fork state, licences and production-readiness verified at source.
- [x] Decision recorded, with a trigger for revisiting.
- [x] DD-004 updated.
- [ ] Test nijigenerate-exported puppets against the existing runtime and record
  compatibility. **Not done** — needs `.inp`/`.inx` files authored in
  nijigenerate, which this pass has no lawful source for. See "What is blocked".

## Findings

### Neither line is production-ready, by their own statements

| Project | Licence | State (verified 2026-07-30) |
|---|---|---|
| `Inochi2D/inox2d` (Rust, what we vendor) | BSD-2-Clause | README: "this library and the specification is in a prototype state, it is not recommended to use this library in production". Actively developed (533 commits) but not promoted. |
| `nijigenerate` (editor, the active fork) | BSD-2-Clause | Updated 2026-07-26 — clearly alive. But **no official stable build**: nightly binaries and a weekly Flatpak only, with "stability is not guaranteed. These versions may crash unexpectedly." |
| `nijilive` (runtime + renamed puppet standard) | BSD-2-Clause | Reference implementation of the nijilive Puppet standard, derived from Inochi2D v0.8. |
| Original Inochi2D | BSD-2-Clause | Per #275: last release 0.8.7 (Sep 2024), v0.9/1.0 rewrite unshipped, own FAQ still says not production-ready. |

The licence question resolves cleanly: **nijilive and nijigenerate are BSD-2-Clause,
the same as Inochi2D and inox2d.** A fork does not introduce a new licensing gate,
which is the one thing that could have forced a decision on its own.

So the useful framing is not "which line is better" but "there is no stable line
to track yet". The active fork ships nightlies that its own project says may
crash; the line we vendor calls itself a prototype. Both are pre-1.0 in substance.

### The 2D path is already off the critical path — by data, not by a flag

#275's fourth item asks to "keep 2D rendering off the critical path
(feature-flagged) until one line stabilizes". That is already true, achieved by a
mechanism the issue did not assume:

`viewer/viewer.js` routes by asset type — `['inp', 'inx', 'vrm', 'glb']`, with
only `inp`/`inx` reaching `loadInochi2DFile`. The 2D runtime therefore activates
only when a user supplies a 2D puppet, and the 3D path is untouched otherwise.
That is stronger than a feature flag, because there is no flag to leave in the
wrong state and no way for the 2D backend to affect a VRM session.

Worth noting the viewer already accepts **both** `.inp` and `.inx` extensions, so
accepting a nijilive-era file is not blocked at the file-type layer. Whether the
vendored parser understands its *contents* is the untested question.

### The vendored artefact is already in the right posture

`third_party/inochi2d-wasm/Cargo.toml` pins both inox2d crates to a single git
revision (`df8413e6…`), and `DEPENDENCY_POLICY.md` additionally pins SHA-256
hashes for the generated `.wasm` and its JS shim, requiring both to be rebuilt and
re-reviewed together.

For a pre-production upstream that is the correct posture: **frozen and
reproducible, not tracking.** Chasing an upstream that describes its own builds as
crash-prone would convert a hash-pinned artefact into a moving target, and the
existing policy would fight that on every bump.

### nicxlive is the interesting watch item

A C++ implementation of nijilive, `nicxlive`, is in development and reportedly
targets OpenGL, Vulkan, DirectX, Unity **and WebGL**. If it matures, a C++→WASM
build could be a better browser runtime than a Rust prototype, because WebGL
support would be an upstream concern rather than ours. It is too early to plan
around — but it is the first sign that the browser case might stop being
self-supported, which is the main cost of the current approach.

## Decision

**Stay frozen on the pinned inox2d revision.** Do not track nijilive yet, and do
not support both formats behind detection.

Reasons:

1. There is no stable line to track. The active fork has no stable release and
   says its nightlies may crash; the vendored line calls itself a prototype.
   Moving from one pre-production dependency to another buys nothing.
2. The licence is unchanged (BSD-2-Clause throughout), so nothing forces a move.
3. "Both behind detection" is the worst option, not a safe hedge: it doubles the
   format surface and the vendored artefacts while this pass cannot test *either*
   against real puppets. Detection logic that has never seen a real file of one
   of its two branches is a liability.
4. The current posture — hash-pinned artefact, 2D reachable only by supplying a
   2D file — already contains the risk. A stagnant upstream costs us nothing
   until someone brings a puppet the parser cannot read, and that is a load-time
   error in an experimental path, not a regression to the 3D pipeline.

**Revisit when either holds:**

> (1) `nijilive` publishes a tagged stable release **and** a nijigenerate-exported
> puppet fails against the pinned runtime — i.e. there is both somewhere to go and
> a reason to go; or (2) `nicxlive` ships a WebGL/WASM target that removes the
> need to self-support a browser runtime.

Until then, treat inbound `.inp`/`.inx` failures as diagnostic data rather than a
strategy signal: `viewer/inochi2d-runtime.js` already classifies corrupt-vs-BC7-
vs-WebGL2 load failures, so a nijilive-format mismatch should surface as a
distinguishable error rather than a silent blank canvas.

## What is blocked

The compatibility test — #275's first item — needs `.inp`/`.inx` files exported
from current nijigenerate. This pass has no lawful source for one: puppets are
authored artwork, the repo commits no redistributable puppet (which is why #230
tracks a "redistributable real-puppet visual/latency matrix" separately), and the
privacy and asset-licence checklists rule out grabbing arbitrary community files.

That test is the only way to answer "does the pinned parser read nijilive-era
files", and it gates the first half of the revisit trigger above. It needs someone
with a nijigenerate install and a puppet they own.

## Sources

- `Inochi2D/inox2d` (prototype status, licence) — <https://github.com/Inochi2D/inox2d>
- nijigenerate (editor, build status) — <https://github.com/nijigenerate/nijigenerate>
- nijilive (runtime, puppet standard) — <https://github.com/nijigenerate/nijilive>
