<!-- i18n: language-switcher -->
[English](transport-strategy-2026.md) | [日本語](transport-strategy-2026.ja.md)

# トランスポート戦略の更新 (2026)

ステータス: issue #274 の調査パス。WebTransport の Baseline 到達と MoQ の成熟という2つのエコシステム変化に対してトランスポート計画を更新し、#274 の提案項目のうち既に満たされていたものを記録する。
関連: [moq-evaluation.md](moq-evaluation.md), [../security/e2ee.md](../security/e2ee.md), #227, #248, #277。

## Goal

WebTransport が現行の全ブラウザで利用可能になった今、トランスポート計画が変わるのか、そして `draft-ietf-moq-secure-objects` が Minamo の E2EE エンベロープ設計を置き換えるべきかを判断する。

## Acceptance criteria

- [x] Goal が明確である。
- [x] Acceptance criteria が明確である。
- [x] 既存設計と矛盾しない: WebTransport が優先されたまま WebSocket をフォールバックとし、独自 KGM データグラムプロトコルは変更しない。
- [x] WebTransport の Baseline 状況を一次情報で確認した。
- [x] #274 の「UA スニッフィングではなく機能検出」に対してトランスポート交渉を監査した。
- [x] MoQ transport と secure-objects のリビジョンを確認し、go/no-go トリガーを定めた。
- [x] E2EE エンベロープを secure-objects にマッピングし、差分を記録した。

## #274 の項目のうち2つは既に完了していた

**「トランスポート交渉の既定値を更新: 対応する全ブラウザで WT 優先 (UA スニッフィングではなく機能検出)」** — 既にそうなっており、issue が記述する UA ヒューリスティックはこのリポジトリに存在しない。

- `shared/transport.js` の `detectTransportCapabilities()` は `typeof scope.WebTransport !== 'undefined'` を検査する。user-agent は関与しない。
- `shared/pairing.js` の `recommendPhoneTransport()` にはコメントがある: 「新しい Safari/WebKit リリースが許可リストの更新を待たずに WebTransport を使えるよう、user-agent スニッフィングは意図的に除外している」。
- ツリー全体で `navigator.userAgent` / `navigator.platform` を検索すると1件、`desktop/desktop.js` の OS ラベル表示のみである。トランスポート選択でこれを読む箇所はない。
- `TRANSPORT_FALLBACKS.wt` は `['wt', 'ws', 'local']` — WebTransport が最初、次に WebSocket、最後に local。

つまりそのコメントに記録された判断は、意図どおりに報われた: Safari 26.4 のユーザーは出荷当日にコード変更なしで WebTransport を得た。`DEFAULT_TRACKER_SETTINGS.mode` が `'local'` であることはトランスポート優先度のバグではなく、同一デバイス tracker→viewer 用途におけるプライバシー優先の既定値である。ネットワークモードが選択されれば交渉は WT 優先になる。

**「MoQ 評価ドキュメントの更新」** — [moq-evaluation.md](moq-evaluation.md) は既に `draft-ietf-moq-transport-18` を引用し、no-go を記録していた。1リビジョン古く、明示的なトリガーが欠けていたので、いずれも本パスで修正した。

**「e2ee.js の nonce 問題 #248」** — #248 は **クローズ済み** である。現在のエンベロープはその修正の結果であり、未解決の問題ではない。

## WebTransport は Baseline である

Safari 26.4 は 2026年3月にデスクトップと iOS で WebTransport を出荷し、Chrome 97+、Edge 98+、Firefox 114+ に加わった。WebKit 自身のリリースノートで確認 (<https://webkit.org/blog/17862/webkit-features-for-safari-26-4/>)。

このリポジトリへの帰結: Node WebSocket リレーは同格の経路ではなく **レガシーフォールバック** になった。QUIC/UDP を遮断する企業プロキシと旧ブラウザのために残り、非 HTTPS オリジンでは唯一の選択肢である。ドキュメントは2つある通常の選択肢としてではなく、そのように記述すべきである。

## MoQ: 依然 no-go、ただしトリガー付き

`draft-ietf-moq-transport` は **リビジョン19、2026-07-06** であり、moq WG の Active Internet-Draft、IESG 提出マイルストーンは **2026年12月** である。リポジトリのドキュメントは -18 (2026年5月) を引用していたので1リビジョン遅れ、#274 の本文は「-17/-18」で2リビジョン遅れである。ワイヤ変更はリビジョンごとに依然発生する。

no-go は維持し、再議論を止めるために明示的なトリガーを与える:

> **以下3点すべてが成立したら MoQT を採用する:** (1) `draft-ietf-moq-transport` が RFC として発行される、または IESG レビューを通過している。(2) 少なくとも2つのブラウザネイティブまたは広く使われているクライアントライブラリが公開リレーに対して相互運用できる。(3) KGM フレームの MoQT トラックマッピングを、我々が運用していないリレーに対して CI で実行できる。

それまでは生の WebTransport 上の独自 KGM データグラムプロトコルが正しい: MoQT のオブジェクト/グループモデルは映像向きであり、参加者ごとに publisher が1つのクライアント-リレー構成では pub/sub 機構が何も生まない。リレーの転送経路をプロトコル非依存に保つだけで扉は開いたままにできる。WebRTC DataChannel は引き続き明確に構築価値なし — この構成ではレイテンシ利得なしに ICE/SDP の複雑性を負う。

## E2EE: secure-objects は有用な参照であり、置き換えではない

`draft-ietf-moq-secure-objects` は **リビジョン01、2026-07-06**、Active I-D、Standards Track 想定である。リレーが store-and-forward を継続できる形で MoQT オブジェクトの AEAD 暗号化を規定する。

| 観点 | secure-objects -01 | 現在の `shared/e2ee.js` |
|---|---|---|
| 鍵のスコープ | **トラック** ごとの `(Key ID, track_base_key)`。配布は範囲外 | **ルーム** ごと、HKDF salt `minamo:<room>` |
| nonce | 導出 salt XOR 96ビットカウンタ = 64ビット Group ID ‖ 32ビット Object ID — **決定的、ワイヤに載らない** | 96ビット **乱数**、毎フレーム送信 (12 B) |
| メッセージ鍵 | トラック鍵1つ + カウンタ nonce | HKDF 導出の **フレームごと** 鍵、salt = nonce |
| AEAD | AES-GCM または AES-CTR-HMAC | AES-GCM、96ビットタグ |
| ワイヤオーバーヘッド | タグのみ | 24 B (nonce 12 + タグ 12) |

興味深い差分は nonce である。secure-objects は MoQT ヘッダに既に存在する識別子から導出することで nonce に **0バイト** しか使わない。Minamo は毎フレーム12バイト — 60 fps で 720 B/s を nonce 転送のみに費やす。コンパクトなモーションデータグラムこそが目的のプロトコルにおいてである (#277 の KGM2 ビットレート参照)。KGM フレームは既に `seq` を持つため同等のカウンタ nonce は構成可能で、E2EE オーバーヘッドを 24 から 12 バイトへ半減できる。

**しかしその節約は無償ではなく、その理由が現行設計の正しさを示している。** カウンタ nonce が安全なのは、1つの鍵の下で決して繰り返さない場合のみである。secure-objects はそれを鍵スコープから得ている: トラックの publisher はちょうど1つなので `(Group ID, Object ID)` は構成上一意である。Minamo は **ルーム** ごとに1鍵を使い、マルチアバタールーム (#43, #225) はその下に複数の送信者を置く — 2人の参加者が `seq` で衝突し GCM の nonce を再利用することになり、これは致命的である。96ビット乱数 nonce とフレームごとの HKDF は送信者間の調整なしにそれを回避する。これはまさに #248 が結論したことである。

**判断: 現行エンベロープを維持する。** secure-objects の構成は **参加者ごとの鍵** への移行の一部としてのみ採用する。その時点で `(participant, seq)` が一意になり、12バイトの nonce を落とせる。これは nonce の変更ではなく鍵管理の変更であり、投機的に行うのではなくマルチアバタールームの作業と共に属する。12バイトが見落としではなくマルチ送信者安全性の意図的な購入であると理解されるよう、ここに記録する。

## Decision

1. **WebTransport 優先 + WebSocket フォールバックを維持する。** コード変更は不要であり、交渉は既に機能検出済みかつ正しい順序である。
2. **WebSocket リレーをレガシーフォールバックとして再位置づけする** (ドキュメント上) — 企業プロキシ、26.4 未満の Safari、非 HTTPS オリジン。
3. **MoQ は no-go 維持**、上記の3点トリガー付き。
4. **E2EE エンベロープを維持し**、secure-objects のカウンタ nonce は参加者ごとの鍵と併せて再検討する。
5. **WebRTC DataChannel は採用しない。**

## Sources

- WebKit features for Safari 26.4 — <https://webkit.org/blog/17862/webkit-features-for-safari-26-4/>
- `draft-ietf-moq-transport` (rev 19, 2026-07-06) — <https://datatracker.ietf.org/doc/draft-ietf-moq-transport/>
- `draft-ietf-moq-secure-objects` (rev 01, 2026-07-06) — <https://datatracker.ietf.org/doc/draft-ietf-moq-secure-objects/>
