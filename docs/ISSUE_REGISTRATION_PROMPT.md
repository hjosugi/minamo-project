# Issue Registration Prompt

> 日本語版: [ISSUE_REGISTRATION_PROMPT.ja.md](ISSUE_REGISTRATION_PROMPT.ja.md)

A prompt for bulk-registering every entry in `docs/BACKLOG.md` as GitHub Issues.
Paste it as-is into Claude Code (or any agent that can use the gh CLI) at the
root of the repository.

Prerequisites:
- `gh auth status` succeeds
- The current directory is the target repository

---

## Prompt (copy below this line)

```
Read docs/BACKLOG.md in this repository. It contains a backlog where every
issue follows this exact format:

### [KGM-NNN] <title>
- Labels: <comma-separated>
- Priority: P0|P1|P2|P3
- Effort: S|M|L|XL
- Milestone: <name>
- Design doc: <path or "-">

<body paragraphs>

Acceptance criteria:
- [ ] ...

Register every entry as a GitHub issue using the gh CLI. Follow these steps
exactly:

1. Create all labels first (idempotent; ignore "already exists" errors):
   - area labels (color 1d76db): area/tracking, area/body, area/protocol,
     area/transport, area/render, area/audio, area/tooling, area/app,
     area/infra, area/docs
   - type labels (color 5319e7): type/feature, type/bug, type/chore,
     type/research
   - priority labels: priority/P0 (b60205), priority/P1 (d93f0b),
     priority/P2 (fbca04), priority/P3 (c2e0c6)
   - effort labels (color bfdadc): effort/S, effort/M, effort/L, effort/XL
   Use: gh label create <name> --color <hex> --force

2. Create all milestones (idempotent):
   M0 Foundation, M1 Face quality, M2 Body and hands, M3 Protocol v2,
   M4 Scale-out, M5 Render backends, M6 Product
   Use: gh api repos/{owner}/{repo}/milestones -f title="<name>"
   (skip if a milestone with the same title already exists; check with
   gh api repos/{owner}/{repo}/milestones --paginate first)

3. For each backlog entry, in KGM number order:
   - Title: "[KGM-NNN] <title>" exactly as written.
   - Labels: the entry's Labels list, plus priority/<Priority> and
     effort/<Effort>.
   - Milestone: the entry's Milestone.
   - Body: the entry's body paragraphs, then the "Acceptance criteria"
     checklist verbatim, then a footer:

     ---
     Backlog ID: KGM-NNN
     Design doc: <value>  (omit this line when the value is "-";
       otherwise link it as a repo path)
     Source: docs/BACKLOG.md

   - Use: gh issue create --title "..." --body-file <tempfile>
     --label ... --milestone "..."
   - Before creating, check for duplicates:
     gh issue list --search "[KGM-NNN] in:title" --state all --json number
     If it exists, skip and report it.

4. Throttle: sleep 2 seconds between issue creations to avoid secondary
   rate limits.

5. When done, print a summary table: KGM ID, issue number, URL, and a list
   of skipped duplicates. Do not modify docs/BACKLOG.md.

If any step fails, stop and show the failing command and its stderr instead
of guessing.
```

---

## Notes

- To register only a subset, append
  `Only register entries KGM-001 through KGM-012.` to the end of the prompt.
- For a dry run, append
  `First do a dry run: print every gh command you would execute without
  running them, then wait for my confirmation.`
- If you change the label taxonomy, update both the taxonomy at the top of
  BACKLOG.md and this prompt (format contract).
