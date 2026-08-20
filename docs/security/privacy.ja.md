<!-- i18n: language-switcher -->
[English](privacy.md) | [日本語](privacy.ja.md)

# セキュリティとプライバシー

## デフォルトルール

デフォルトでは、生のウェブカメラフレームをサーバーに送信しないでください。
ローカル限定modeでは、runtime依存関係経由の未宣言third-party telemetryも認めません。

## データクラス

| データ | デフォルトストレージ | デフォルトトランスポート |
|---|---|---|
| 生のウェブカメラフレーム | メモリのみ | 決して |
| 生の音声 | メモリのみ | 決して |
| 依存packageの性能／利用状況metrics | なし | ローカル限定modeでは決して |
| KGM1モーションフレーム | オプションのローカル録画 | ユーザーのアクションで許可 |
| キャリブレーションプロファイル | ローカルストレージ / ファイル | 明示的なエクスポートのみ |
| ベンチマークビデオ | ローカルファイル | 明示的なオプトインアップロードのみ |

## 脅威

- 偶発的な生のビデオアップロード
- 悪意のあるアバターパッケージ
- 悪意のあるnpmパッケージ
- 自動telemetryを追加する依存関係更新
- モデルサプライチェーン攻撃
- ブラウザの権限混乱
- リモートルームのなりすまし

## 緩和策

- 明確なカメラインジケーター
- ローカルファーストモード
- 依存関係のピン留め
- インストール済みbundleのtelemetry検査 (`pnpm check:mediapipe`)
- モデルハッシュの検証
- コンテンツセキュリティポリシー
- ルームトークン
- 生メディアなしの監査ログ

## 依存packageからの外向き通信

first-party privacy invariantは、camera／media API由来の値がMinamo source内のreview済み
network sinkへ到達しないことを検証します。しかし、`node_modules`内のminified codeに
senderがないことまでは単独で証明できません。両方の検査が必要です。

公開済み`1.0.1` browser bundleが自動ODML性能／利用状況metricsを追加するため、
`@mediapipe/tasks-vision`は`0.10.35`に固定します。
`scripts/mediapipe-privacy-guard.mjs`は、pull-request CIとrelease smokeで、
インストール済みbrowser entry bundleをendpoint／sender infrastructureについて
走査します。依存関係更新の中でguardを弱化してはいけません。詳しくは
[1.0移行ウォッチリスト](../mediapipe-1.0-migration.ja.md)を参照してください。
