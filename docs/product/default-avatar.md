<!-- i18n: language-switcher -->
[English](default-avatar.md) | [日本語](default-avatar.ja.md)

# Default Avatar

Status: implemented. Related:
[../compression/asset-license-checklist.md](../compression/asset-license-checklist.md),
[situation-presets.md](situation-presets.md).

> 日本語版: [default-avatar.ja.md](default-avatar.ja.md)

## Why

The viewer's built-in fallback is a stack of capsules and spheres assembled in
`buildBot()`. It is a good diagnostic — it proves blendshapes, gaze and head pose
are arriving — but it is a poor first impression of an avatar tracker, and it is
what every new user saw first.

So the viewer now opens on a real humanoid VRM when one is present, and falls
back to the bot when it is not.

## The model

| | |
| --- | --- |
| Model | Sendagaya Shino (VRoid Studio sample model) |
| License | CC0 1.0 Universal (public domain dedication) |
| Source | `madjin/vrm-samples`, pinned to commit `e16eb18` |
| Size | ~15 MB |
| Rig | VRM 0.x, 54 humanoid bones including both eyes and all finger chains |
| Expressions | VRM 0.x presets: `a i u e o`, `blink`, `blink_l`, `blink_r`, `angry`, `fun`, `joy`, `sorrow` |

The licence is not inferred from a README. The model file's own VRM metadata
block declares it:

```json
{ "title": "Sendagaya Shino", "licenseName": "CC0",
  "allowedUserName": "Everyone", "commercialUssageName": "Allow",
  "violentUssageName": "Allow", "sexualUssageName": "Allow" }
```

Redistribution and modification are both permitted, which are the two hard gates
in [asset-license-checklist.md](../compression/asset-license-checklist.md). The
same file's sibling set, `AvatarSample_A/B/C`, declares `licenseName: "Other"` and
is deliberately **not** used.

The full rig matters: 54 bones with finger chains means hand tracking and the arm
solver have somewhere to go, so the default avatar exercises the same paths a
streamer's own model will.

Expressions are the VRM 0.x preset set, not ARKit 52, so the viewer's curated
fallback expression map applies rather than Perfect Sync. That is the normal path
for most VRMs and is worth having the default exercise.

## Fetching it

```sh
scripts/fetch-avatar.sh
```

Downloads to `assets/avatars/default.vrm` and writes `assets/avatars/LICENSE.txt`
beside it, per step 2 of the asset licence checklist.

Neither file is committed. The model is 15 MB, it is not ours, and a fresh
checkout should stay small. `assets/avatars/` is gitignored, and the viewer
treats the file's absence as the expected state rather than an error — no message
is shown, the bot simply stays.

This also means the GitHub Pages demo shows the bot, not the VRM: the asset is
not redistributed with the repository.

### Integrity

Pinned by commit SHA rather than a branch, and verified against the committed
SHA-256 in `scripts/avatar-pins.sha256`, for the same reason
`scripts/fetch-models.sh` pins the MediaPipe assets: a moved branch must not
silently change what ships. On mismatch the file is deleted rather than left on
disk — the viewer loads whatever is at that path, so a half-trusted file must not
sit there waiting to be picked up.

To change the model deliberately:

```sh
scripts/fetch-avatar.sh --update-pins
```

then review the diff before committing.

### Desktop builds

`pnpm build` copies `assets/avatars/` into `dist/` when it exists, because Tauri
ships `dist/` and nothing else. The copy is optional: CI has never run the fetch
script, and its absence is not a build failure.

## Overriding it

Unchanged: drop a `.vrm`/`.glb` onto the viewer, use **Open VRM / GLB**, or pass
`?vrm=<url>`. An explicit `?vrm=` or `?inochi=` skips the default entirely.

## Testing

- `pnpm test` covers that the fetch script pins a commit SHA rather than a branch
  and verifies against `scripts/avatar-pins.sha256`.
- Manual: run the fetch script, open the viewer, and confirm it opens on the VRM;
  delete `assets/avatars/default.vrm` and confirm it opens on the bot with no
  error message.
