<!-- i18n: language-switcher -->
[English](webtransport-realtime.md) | [日本語](webtransport-realtime.ja.md)

# WebTransport リアルタイムデザイン

ステータス: ブラウザの送信者/受信者トランスポートの実装プロトタイプ、WebSocket フォールバック、トークン/オリジンチェック、および混雑ポリシー。

## 1. 目標

低遅延でアバターの動きのフレームを送信し、生のウェブカメラビデオを送信しない。

## 2. チャンネル

| チャンネル | トランスポート | 信頼性 | ペイロード |
|---|---|---|---|
| motion | WebTransport データグラム | 信頼性なし | 現在の KGM1 フレーム、コンパクトプロファイルの KGM2 差分フレーム |
| keyframe | WebTransport ストリーム | 信頼性あり | 完全な KGM1/KGM2 キーフレームデザイン |
| control | WebTransport ストリーム | 信頼性あり | キャリブレーション、部屋の状態 |
| debug | WebSocket | 信頼性あり | JSON ログ |

`shared/transport.js` のブラウザプロトタイプは、`MinamoTransport` を通じて WebTransport データグラムを送受信します。`relay-rs/src/main.rs` の Rust リレープロトタイプには、データグラムをルームを通じてエコーするネイティブな pub/sub 統合テストがあります。

## 3. フォールバック

WebTransport が利用できない場合:

1. WebSocket バイナリ
2. WebSocket JSON (`{ "type": "kgm1", "payload": "<base64>" }`)
3. ローカル専用モード

`MinamoTransport.connectAuto()` は、`wt` リクエストのためにこの順序を使用し、トラッカー/ビューワー HUD に実際のアクティブモードを報告します。要求された `local` モードはローカルのままであり、ネットワークトランスポートにアップグレードされることはありません。フォールバックのタイムアウトはデフォルトで 3 秒であり、ブロックされた UDP/WebTransport パスは迅速にダウングレードされます。

## 4. 混雑動作

- 古い動きのフレームを最初にドロップする
- キューに入っている古い状態ではなく最新の状態を送信する
- 顔の口/目のコントロールの前に手のランドマークの詳細を減らす
- 必要に応じて、ドラムヒットイベントなどの重要なイベントを信頼性のあるストリームに保持する

ランタイムポリシー:

- WebTransport 送信は最新のみの保留データグラムスロットを使用します。データグラムの書き込みが進行中の間に新しいフレームが到着すると、保留中の古いフレームが置き換えられます。
- `relay-rs` は、送信前に各サブスクライバーのルームキューを排出するため、遅いサブスクライバーは古いポーズを再生するのではなく、最新のキューに入っているフレームを受け取ります。
- `bufferedAmount` が 512 KiB を超えると WebSocket 送信はスキップされ、古い動きが長い信頼性のあるキューを構築するのを防ぎます。
- `classifyCongestion()` は `clear`、`congested`、または `severe` を返し、将来の手/体の詳細制限のための `newestOnly` フラグと `reduceDetail` フラグを持ちます。
- `NewestOnlyMailbox` は遅いサブスクライバーのための参照プリミティブです: レイテンシは保持されたフレーム 1 つに制限され、古いフレームは置き換えられたものとしてカウントされます。

## 5. メトリクス

トラッカーとビューワーの HUD は、実際のアクティブなトランスポートモードとベストエフォートのレイテンシメトリックを表示します。KGM1 タイムスタンプのレイテンシは、クロックが互換性がある場合に計算されます; 不可能なスキューは誤解を招く数字を表示する代わりに拒否されます。将来のマルチソースルームは、送信者のクロックを整列させるために `shared/kgm2.js` の `ClockOffsetEstimator` を使用します。

`relay-rs` はデフォルトで `http://127.0.0.1:9487/metrics` で Prometheus メトリクスを公開します。`MINAMO_METRICS_ADDR=host:port` でオーバーライドするか、`MINAMO_METRICS_ADDR=off` で無効にします。

収集されたメトリクス:

- `minamo_relay_sessions_total`
- `minamo_relay_active_sessions`
- `minamo_relay_rooms`
- `minamo_relay_frames_in_total`
- `minamo_relay_frames_out_total`
- `minamo_relay_frames_dropped_newest_only_total`
- `minamo_relay_auth_failures_total`

Grafana ダッシュボード JSON: `relay-rs/grafana-dashboard.json`。

セッションの参加、退出、認証失敗、およびメトリクスサーバーエラーは、構造化されたログ収集のために `event` フィールドを持つ単一行の JSON オブジェクトとしてログに記録されます。

## 6. セキュリティ

- HTTPS のみ
- オリジンチェック
- セッショントークン
- デフォルトで生のビデオなし
- ルームごとの権限
- KGM1 フレームのレート制限

`relay-node` はオプションのルームトークンを定数時間でチェックし、設定されている場合は `MINAMO_ALLOWED_ORIGINS` を強制します。`relay-rs` は WebTransport セッションを受け入れる前に間違ったルームトークンを拒否します。共有の `transportSecurityNote()` ヘルパーは、公開のセキュリティノートを明示的に保ちます: 動きのフレームのみ、ルームトークンは推奨/有効、そして生のカメラビデオは送信されません。
