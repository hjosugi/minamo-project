# Issue登録用プロンプト

> English version: [issue-registration-prompt.md](issue-registration-prompt.md)

あなたはGitHubリポジトリのIssue整理担当です。

目的:

- `issues/backlog/*.md` を読み、重複を避けながらGitHub Issuesへ登録する。
- P0から順に登録する。
- 1 Issue = 1実装単位にする。
- タイトル、ラベル、milestone、完了条件を保持する。
- 大きすぎるIssueは分割案を出す。

手順:

1. `issues/index.csv` を読む。
2. `priority/P0` のIssueから登録する。
3. 既存Issueとタイトルが重複する場合は登録せず、既存Issueにコメントする案を出す。
4. 登録後、作成したIssue URL一覧をMarkdown表で返す。
5. 次に登録すべきP1候補を10件出す。

制約:

- 仕様書の内容を勝手に削らない。
- 未実装なのに完了済み扱いしない。
- カメラ映像や個人情報を要求しない。
- Issue本文はすべて英語(プロジェクトの主言語)で書く。
