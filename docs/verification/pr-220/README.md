# PR #220 verification evidence

This directory defines the durable, redacted evidence format for PR #220 and
tracking issue #221. It does not turn an unrun hardware check into a pass.

## Reproducible baseline

Use Node.js 22 and the package manager pinned by `package.json`:

```sh
pnpm --version
pnpm install --frozen-lockfile
sha256sum pnpm-lock.yaml
pnpm release:smoke
```

Record the exact verification commit, lockfile hash, environment, commands, and
result. A dirty worktree is not acceptable evidence unless its diff is attached
and the result is explicitly marked `BLOCKED` or `FAIL`.

## Evidence layout

Collect private/raw evidence outside the tracked docs first:

```text
evidence/pr-220/<UTC timestamp>/
  commit.txt
  pnpm-lock.sha256
  release-smoke.log
  ENVIRONMENT.md
  COMMANDS.md
  RESULT.md
  windows/
  webgpu/
  avatar-pack/
  iphone/
  multi-tracker/
  inochi2d/
  virtual-camera/
  drum/
  research-review/
```

`evidence/pr-220/` is gitignored because it may contain private device data.
After review, copy only the redacted, redistributable records into
`docs/verification/pr-220/runs/<UTC timestamp>/` and link them from
[INDEX.md](INDEX.md).

## Result semantics

- `PASS`: every stated pass criterion ran and passed on the recorded commit.
- `FAIL`: the procedure ran and at least one required criterion failed.
- `BLOCKED`: the procedure could not complete; list the owner and unblock step.
- `N/A`: the criterion genuinely does not apply; give a scoped reason and an
  approving reviewer. Missing hardware or unfinished code is `BLOCKED`, not
  `N/A`.

Start from the status-specific files in [templates/](templates/). Do not delete
mandatory fields. One filled, non-product sample is in [sample/RESULT.md](sample/RESULT.md).

## Privacy and redaction

Never commit or attach:

- room tokens, API credentials, cookies, authorization headers, or `.env` files;
- private CA keys, signing identities, provisioning profiles, or reusable certs;
- private raw camera/audio/video, biometric imagery, or unlicensed avatars;
- full local usernames, home paths, device serials, LAN addresses, or QR tokens.

Raw media stays local unless every recorded person explicitly consented and the
license permits redistribution. Prefer hashes, derived motion events, cropped or
blurred captures, and redacted logs. Public TLS certificates and certificate
fingerprints may be recorded; private keys may not.

Before publishing, search the candidate evidence for the token, local username,
home directory, IP addresses, and private-key headers. Record the redaction
reviewer and date in `RESULT.md`.
