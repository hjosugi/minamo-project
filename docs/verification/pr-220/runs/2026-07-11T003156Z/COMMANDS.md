# Command log

- Verification commit SHA: `e809c712cfdd95cfbd07edea6870bb300c9533f0`
- Started (UTC): `2026-07-11T00:47Z`
- Finished (UTC): `2026-07-11T00:49:25Z`
- Exit-code convention: `0 = success; non-zero = failure`

| # | Working directory | Command | Exit | Result |
| --- | --- | --- | ---: | --- |
| 1 | detached clean worktree | `git status --porcelain` | 0 | empty; clean worktree |
| 2 | detached clean worktree | `pnpm release:smoke` | 0 | all automated release gates passed |
| 3 | detached clean worktree | `pnpm benchmark:drum -- tests/fixtures/drum-benchmark-runner.manifest.json` | 0 | redacted report PASS |
| 4 | detached clean worktree | `git status --porcelain` | 0 | empty; generated output ignored |
| 5 | GitHub Actions | CI workflow for the same commit | 0 | [run 29133313578](https://github.com/hjosugi/minamo-project/actions/runs/29133313578) |

The release smoke covered frozen dependency installation, lint, 37 Vitest
tests, repository tests and structure verification, TypeScript checks, the
production build, Rust relay format/clippy/build/tests, KGM1 codec tests, Tauri
format/check/tests, and Node relay tests.

## Redaction review

- Token/cookie/header search: no credential was supplied or recorded
- Private-key header search: no certificate or key was used
- Username/home-path/IP search: machine-specific paths and addresses are omitted
- Raw-media review: only the repository's generated 0BSD fixture was used
- Reviewer/date: Codex repository verification, 2026-07-11
