# Drum benchmark runner result

- Status: `PASS`
- Issue: `#234`
- Parent issue(s): `#221`
- Operator: Codex repository verification
- Date (UTC): `2026-07-11`
- Verification commit SHA: `e809c712cfdd95cfbd07edea6870bb300c9533f0`
- Environment: [ENVIRONMENT.md](ENVIRONMENT.md)
- Commands: [COMMANDS.md](COMMANDS.md)
- Score report: [DRUM-REPORT.md](DRUM-REPORT.md)
- Machine-readable report: [DRUM-REPORT.json](DRUM-REPORT.json)
- Manifest: [repository fixture manifest](../../../../../tests/fixtures/drum-benchmark-runner.manifest.json)
- CI: [GitHub Actions run 29133313578](https://github.com/hjosugi/minamo-project/actions/runs/29133313578)

## Scope and criteria

- One command validates a local manifest and media hash/metadata, executes the
  configured detector command without a shell, scores its `DrumHitEvent`
  records with the production scorer, and emits JSON plus Markdown.
- The report records clip hashes, media metadata, Node, ffprobe, detector name,
  and detector version while omitting absolute paths, commands, and raw media.
- The generated end-to-end fixture passed precision 1.0, recall 1.0, zero false
  doubles, 3 ms p95 timing error, zone accuracy 1.0, and hand accuracy 1.0.
- Deterministic unit coverage and the full release smoke passed on the recorded
  clean commit; the same commit passed all GitHub Actions jobs.

This PASS verifies the runner and report contract. It does not claim real-drum
accuracy: the real kit, pedals, fast roll, OBS, and private clip matrix remain
in #235.

## Privacy/license review

The published 58 KiB MP4 is a generated 0BSD validation fixture with synthetic
video/audio. No person or private session was recorded. The report contains
only the media basename, SHA-256, stream metadata, derived events, and scores.
