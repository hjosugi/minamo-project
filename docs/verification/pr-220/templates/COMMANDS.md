<!-- i18n: language-switcher -->
[English](COMMANDS.md) | [日本語](COMMANDS.ja.md)

# Command log

- Issue:
- Commit SHA:
- Started (UTC):
- Finished (UTC):
- Exit-code convention: `0 = success; non-zero = failure`

## Commands

| # | UTC time | Working directory | Command | Exit | Log/artifact | Redactions |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 |  | repository root | `pnpm install --frozen-lockfile` |  |  | none |
| 2 |  | repository root | `pnpm release:smoke` |  |  | none |

## Redaction review

- Token/cookie/header search:
- Private-key header search:
- Username/home-path/IP search:
- Raw-media and license review:
- Reviewer/date:

Preserve the unredacted log only in approved local storage. Never replace a
failed exit code while redacting.
