# Issue Registration Prompt

> 日本語版: [issue-registration-prompt-ja.md](issue-registration-prompt-ja.md)

You are in charge of organizing issues for a GitHub repository.

Goals:

- Read `issues/backlog/*.md` and register them as GitHub Issues while avoiding duplicates.
- Register in order starting from P0.
- Keep 1 issue = 1 implementation unit.
- Preserve title, labels, milestone, and acceptance criteria.
- Propose a split plan for issues that are too large.

Steps:

1. Read `issues/index.csv`.
2. Register `priority/P0` issues first.
3. If a title duplicates an existing issue, do not register it; propose commenting on the existing issue instead.
4. After registration, return the list of created issue URLs as a Markdown table.
5. List the next 10 P1 candidates that should be registered.

Constraints:

- Do not trim spec content on your own.
- Do not mark anything as done when it is not implemented.
- Do not request camera footage or personal information.
- Write all issue bodies in English (the project's primary language).
