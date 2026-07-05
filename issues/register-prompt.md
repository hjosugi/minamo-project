# GitHub Issue Registration Prompt

> 日本語版: [register-prompt-ja.md](register-prompt-ja.md)

Register the Markdown files in `issues/backlog/` as GitHub Issues under the following conditions.

## Conditions

- Register only `priority:P0` first.
- Do not register titles that duplicate existing issues.
- Use `title`, `labels`, and `milestone` from the Markdown front matter.
- Use the content excluding the front matter as the body.
- After registration, output the list of issue URLs as a Markdown table.
- For anything that could not be registered, state the reason.

## Recommended commands

```bash
python3 scripts/create_github_issues.py --repo OWNER/REPO --dry-run --label priority:P0
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label priority:P0
```

## Registration order

1. `priority:P0`
2. `tracking:stability`
3. `tracking:hand`
4. `tracking:face`
5. `area:avatar`
6. `tracking:drum`
7. `area:transport`
8. `area:ml`
