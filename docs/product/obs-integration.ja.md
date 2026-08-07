<!-- i18n: language-switcher -->
[English](obs-integration.md) | [日本語](obs-integration.ja.md)

# OBS 連携

ステータス: 実装済み。関連: [obs-setup.ja.md](obs-setup.ja.md)、
[situation-presets.ja.md](situation-presets.ja.md)、
[drum-obs-overlay.ja.md](drum-obs-overlay.ja.md)。

> English: [obs-integration.md](obs-integration.md)

## 役割分担

OBS はすでにコンポジタであり、ミキサーであり、レコーダーであり、配信クライアント
です。そして WebGL キャンバスがこの4つで OBS に勝つことはありません。だから Minamo
は背景・レイアウト・トランジション・通知オーバーレイ・録画を自前で持ちません。
透過ページにアバターを描画し、残りは OBS に渡します。

この分担は「覚えておくべき慣習」ではなくデータです。シチュエーション内の各ソースは
`owner` を持ちます。

| owner | ソース | 作る人 |
| --- | --- | --- |
| `minamo` | アバター、ドラムキットオーバーレイ | Minamo（ブラウザソースとして） |
| `obs` | 背景、ゲーム/画面キャプチャ、マイク、音楽、コメント欄、通知 | 配信者（OBS 側で） |

トラッカーはシチュエーション選択の下に `owner: 'obs'` の項目を並べます。
Minamo が「やらないこと」を、暗黙ではなく画面上に出すためです。

## 2通りの渡し方

### ブラウザソースURLをコピーする

**OBSソースURLをコピー** は、現在のシチュエーションのビューアURLをクリップボードに
入れます。`preset=obs`・シチュエーション・トランスポート・ルーム・ライティング
プリセット・`bg=transparent`・`hud=0`・`camera=locked` まで含まれています。OBS の
ブラウザソースに貼るだけで、他の設定は不要です。

この方法はプラグイン不要で、OBS が別マシンにある場合にも使えます。

### obs-websocket で OBS を直接動かす

**OBSに接続** は obs-websocket 5.x に接続します（OBS 28 以降のツール →
WebSocket サーバー設定。既定は `ws://127.0.0.1:4455`）。接続後、Minamo は:

1. `GetVideoSettings` で OBS の実際のキャンバスサイズを読み、1920x1080 の基準
   レイアウトを 720p や 1440p のプロジェクトにスケールします（1080p を前提にしません）
2. シチュエーションのシーンが無ければ作成します
3. ブラウザソースを作成、既にあればURLを差し替えます
4. `SetSceneItemTransform` で配置します。`OBS_BOUNDS_SCALE_INNER` を使うので
   アバターは歪まずに枠へ収まります
5. そのシーンを現在のシーンにします

**シチュエーションに合わせてOBSシーンを切り替える** を有効にすると、Minamo 側の
シチュエーション変更が OBS のシーン切り替えも行います。操作は2箇所ではなく1箇所です。

各ステップは冪等です。配信中にシチュエーションを切り替えた配信者が、既存のアバターの
上に2枚目を重ねてしまってはいけないので、既存シーンは再利用し、既存ソースは
差し替えます。複製はしません。

## ソケットを流れるもの

シーン名、ソース名、ビューアURLです。メディアもトラッキングフレームもカメラの画素も
流れません。この接続は `scripts/check-privacy-invariants.mjs` にその内容で
登録・レビューされています。

obs-websocket のパスワードは接続時に入力欄から読むだけで、保存しません（リレーの
ルームトークンと同じ規則です）。認証は v5 のチャレンジダイジェスト
（`base64(sha256(base64(sha256(password + salt)) + challenge))`）を使うため、
パスワード自体もページ外へ出ません。

## シーン名

各シチュエーションは OBS のシーン名を i18n キー経由で決めます。日本語UIなら
`Minamo - 雑談`、英語UIなら `Minamo - Just chatting` が作られます。OBS 側でシーン名
を変更すると、次回適用時に Minamo は自分のシーンを作り直します。名前を固定したい
場合は、シチュエーションの `sceneNameKey` の文字列そのものを変更してください。

## 参照

- `shared/obs-bridge.js` — プロトコルヘルパ（`buildIdentifyPayload`、
  `buildObsSourceRequests`、`buildObsTransformRequests`）と `createObsBridge`
- `shared/situation-presets.js` — `situationObsPlan` がシチュエーションを
  配置済みソースと委譲リストに解決します

## テスト

- `pnpm test` が、`node:crypto` で独立に計算したダイジェストとの一致、認証あり/なし
  両方の Identify、作成と更新のリクエスト選択、シーンアイテムIDが不明なソースを
  transform から除外することを検証します。
- 手動: OBS を起動して **OBSに接続** を押し、シーンにアバターが配置されることを確認。
  シチュエーションを切り替えて、OBS が追従しソースが複製されないことを確認します。
