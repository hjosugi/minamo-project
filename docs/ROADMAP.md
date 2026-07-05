# Roadmap

Milestone view of docs/BACKLOG.md (53 issues, KGM-001..053). Each backlog
entry is issue-ready; larger items have design docs under docs/design/.

| Milestone | Theme | Key items |
|---|---|---|
| M0 Foundation | Trust the base | CI (001), codec fuzz (002), vendored models (003), error UX (004), device picker (005), jitter buffer (007), room tokens (008), relay-rs CI (009), room GC bug (010), Docker (011), HTTPS guide (012) |
| M1 Face quality | Best-in-class webcam face | calibration (013, DD-008), interactive mixer (014), quality indicator (015), true iris gaze (016), distance mapping (017), wink disambiguation (018), filter presets (019), loss fade (020), multi-face policy (021) |
| M2 Body and hands | Beyond the face | hands (022, DD-001), ONNX/WebGPU body backend (023, DD-002), arm solver (024), seated mode (025), finger mapping (026) |
| M3 Protocol v2 | Half the bytes | smallest-three quats (027), delta+keyframes (028), sparse mask (029), clock sync (030), Rust/Python codecs (031) — DD-006 |
| M4 Scale-out | One streamer, any audience | Elixir cluster (032, DD-005), metrics (033), newest-only delivery (034), MoQ eval (035), transport negotiation (036), E2EE (037) |
| M5 Render backends | Every avatar format | Inochi2D via inox2d (038, DD-004), layered-PNG mode (039), OBS transparency (040), asset compression (041), scene presets (042), collab rooms (043), Perfect Sync editor (044) |
| M6 Product | Daily-driver | audio lipsync (045, DD-003), VAD accents (046), .kgm recording (047, DD-007), VRMA export (048), quality HUD (049), Tauri app + virtual camera (050), phone tracker (051), Pages demo (052), contributing (053) |

Sequencing notes:
- KGM-040 (OBS transparency) is deliberately small and P0: it is the single
  change that makes KAGAMI usable in real streams today.
- KGM-047 (recording) unblocks the KGM2 corpus and CI fixtures; schedule it
  before M3 work starts even though it sits in M6.
- KGM-009 (relay-rs CI) should land before any relay feature work.
