<!-- i18n: language-switcher -->
[English](RESULT.md) | [日本語](RESULT.ja.md)

# Verification result

- Status: `PASS`
- Issue: `#237`
- Parent issue(s): `#221`
- Operator: Codex repository verification
- Reviewer: automated release gates plus GitHub Actions
- Date (UTC): `2026-07-10`
- Commit SHA: `c6f7eac931503540a268152ddff120ac2f9a732f`
- Lockfile SHA-256: `79a8d7ba80dc63f32e0a9c033d307664bca12605ebc2a2406719b44427e45ec4`
- Environment record: [ENVIRONMENT.md](ENVIRONMENT.md)
- Command log: [COMMANDS.md](COMMANDS.md)

## Scope and criteria

- `pnpm-lock.yaml` and `pnpm-workspace.yaml` are committed and a clean checkout
  resolves them with `pnpm install --frozen-lockfile`.
- CI, release smoke, Docker dependency setup, Tauri before-dev/build commands,
  and maintained documentation consistently use pnpm 11.0.0.
- PASS, FAIL, BLOCKED, N/A, environment, and command-log templates are present;
  the evidence index maps every PR #220 child issue to a durable artifact path.
- The local clean run passed lint, 36 Vitest tests, repository smoke tests,
  structure verification, strict TypeScript gates, the production build, seven
  Rust relay tests, three KGM1 codec tests, two Tauri tests, and nine Node relay
  tests.
- [GitHub Actions run 29096439576](https://github.com/hjosugi/minamo-project/actions/runs/29096439576)
  passed all JS, Rust, desktop, and Node relay jobs on the same commit.

## Artifacts

- This result, environment record, command log, lockfile hash, and linked public
  CI run.
- The repository intentionally does not commit local dependency caches or raw
  command logs containing machine-specific paths.

## Privacy/license review

No token, cookie, private key, private address, device identifier, raw media, or
third-party avatar was used or included. The records contain only public commit,
dependency, toolchain, and CI identifiers.

## Follow-ups

The container image build could not start in this environment because its
Podman compatibility layer cannot mount an overlay over the workspace. This is
an environment limitation, not a #237 acceptance gate; the Dockerfile uses the
same frozen pnpm lockfile and remains subject to a container-capable CI/manual
run.
