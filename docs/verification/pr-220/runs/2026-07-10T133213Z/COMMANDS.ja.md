<!-- i18n: language-switcher -->
[English](COMMANDS.md) | [日本語](COMMANDS.ja.md)

# コマンドログ

- 問題: `#237`
- コミットSHA: `c6f7eac931503540a268152ddff120ac2f9a732f`
- 開始時刻 (UTC): `2026-07-10T13:31Z`
- 終了時刻 (UTC): `2026-07-10T13:32:13Z`
- 終了コードの規約: `0 = 成功; 非ゼロ = 失敗`

## コマンド

| # | UTC 時間 | 作業ディレクトリ | コマンド | 終了 | ログ/アーティファクト | 削除内容 |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 | 13:31 | リポジトリルート | `git status --porcelain` | 0 | 空の出力; クリーンな作業ツリー | なし |
| 2 | 13:31 | リポジトリルート | `sha256sum pnpm-lock.yaml` | 0 | 環境記録のハッシュ | なし |
| 3 | 13:31 | リポジトリルート | `pnpm release:smoke` | 0 | `RESULT.md`に要約 | ローカルキャッシュパスは省略 |
| 4 | 13:32 | GitHub Actions | 同じコミットのCIワークフロー | 0 | [run 29096439576](https://github.com/hjosugi/minamo-project/actions/runs/29096439576) | なし |

`pnpm release:smoke`は
`pnpm install --frozen-lockfile --prefer-offline`から始まります; GitHub Actionsは
JS、デスクトップ、Nodeリレーのジョブで`pnpm install --frozen-lockfile`を別々に実行しました。

## 削除内容のレビュー

- トークン/クッキー/ヘッダーの検索: 認証情報は提供されず、印刷されませんでした
- プライベートキーのヘッダー検索: 証明書やキーは使用されませんでした
- ユーザー名/ホームパス/IPの検索: マシン固有のキャッシュパスはここに再現されていません
- 生メディアとライセンスのレビュー: カメラ、音声、アバター、またはその他のメディアは使用されませんでした
- レビュアー/日付: Codexリポジトリの検証, 2026-07-10
