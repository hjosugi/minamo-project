<!-- i18n: language-switcher -->
[English](midi-performance-input.md) | [日本語](midi-performance-input.ja.md)

# 調査: 演奏入力としての MIDI (ドラム・鍵盤・ギター)

ステータス: issue #278 の調査パス。入力アダプタは3種の楽器で共通でありマッピングだけが異なるため、ドラムに限定せず鍵盤とギターまで範囲を広げた。以下はすべて一次情報から確定でき、ハードウェアを要しない。関連: #121, #123, #234, #235, #238–#241 (ドラム), #50 (デスクトップアプリ), #274 (トランスポート/機能検出の先例), #271 (MANO のブロッカー),
[imu-stick-integration.md](imu-stick-integration.md) (#185)。

## Goal

MIDI 入力を演奏イベントの第二のソースとして追加する価値があるか — まず電子ドラム、次いで MIDI キーボードとギターについて — を判断し、#278 が挙げる2本の論文がドラムトラッキング設計を変えるかを確認する。

## Acceptance criteria

- [x] Goal が明確である。
- [x] Acceptance criteria が明確である。
- [x] 「モダンブラウザ」ではなく、本プロジェクトが配布する全ブラウザ/全 WebView について Web MIDI の可用性を監査した。
- [x] DRUMS およびピアノ/ギターの対応研究についてライセンスと成果物を監査した — #278 の2番目の計画項目。
- [x] Rapid-Motion-Track を issue の要約ではなく論文本体に照合した — #278 の3番目の計画項目。
- [x] 3楽器を対象としたアダプタ仕様 — #278 の最初の計画項目。
- [x] 判断を本書に記録した。
- [ ] アダプタ実装と電子ドラムでの検証。**未実施** — 実機が必要であり、#235 や #238–#241 と同じゲートに置かれる。

## Findings

### Web MIDI は Chromium 限定であり、それがアダプタの置き場所を決める

現在のサポート状況: **Chrome 43+、Edge 79+、Firefox 108+、Opera 30+、Samsung Internet 4+。Safari はバージョン 26.5 を含め全バージョン未対応。iOS はどのブラウザでも未対応** — iOS のブラウザはすべて WebKit を使うためである。WebKit はフィンガープリンティングを理由に見送っており、仕様自身もデバイス列挙をフィンガープリンティングの対象として挙げている (露出量は Gamepad API と同程度だとも述べている)。進行中の WebKit 実装は存在しない。

これは #274 で記録した状況の逆である。あちらでは UA スニッフィングを避けたことで、WebKit が最終的に実装した WebTransport をリリース当日から Safari ユーザが利用できた。ここでは機能検出は **「このブラウザでは MIDI を利用できない」** に縮退し、そのままとどまる — 「いずれ対応」ではない。UI 文言も、権限が未許可であるかのように示唆せず、その旨を明示する必要がある。

デスクトップアプリ (#50) への帰結はより鋭く、見落としやすい:

| プラットフォーム | Tauri の WebView | Web MIDI |
|---|---|---|
| Windows | WebView2 (Chromium、evergreen) | 可 |
| macOS | WKWebView (WebKit、OS バージョン依存) | **不可** |
| Linux | WebKitGTK | **不可** |

つまり WebView 層の Web MIDI アダプタでは、デスクトップアプリの MIDI は **Windows のみ** になる。したがってデスクトップの MIDI 入力はページ側ではなく Tauri コマンドの背後の Rust に置くべきである — `src-tauri/Cargo.toml` の依存は現在6件 (うち4件は Tauri 自身) であり、MIDI クレートの追加は `DEPENDENCY_POLICY.md` のレビュー対象であって機械的な作業ではない。ブラウザビルドは機能検出の背後で Web MIDI を使う。両者は同じイベント形状を出力し、トラッカーからは1つのアダプタに見えるようにする。

Web MIDI はセキュアコンテキストを要し、**sysex なしでも**明示的な権限付与を要し、`midi` Permissions-Policy ディレクティブで制御される。1点目は `docs/DEV_HTTPS.md` の HTTPS 開発環境が既に満たしている。

### トラッカーと時計を共有する ground truth は MIDI だけである

`MIDIMessageEvent.timeStamp` はドキュメントの time origin 基準の `DOMHighResTimeStamp` である。トラッカーの時計は `performance.now()` である (`src/core/kgm1.ts:36`、および `tracker/tracker.js` 全体)。同一 origin・同一ページであり、**オフセット推定もドリフト補正も不要**である。音声パスはそうではない: `src/core/drum.ts` の `fuseVisualHitWithAudio` は視覚ヒットを ±35 ms の窓内の onset にスナップし、その窓が妥当であることを前提せざるを得ない。

`pnpm benchmark:drum` にとってこれは最も安価な勝ち筋である。現在 `minamo.drum-benchmark-manifest.v1` は手書きのアノテーションを取る:

```json
"annotations": [
  { "timeMs": 1000, "zoneId": "snare", "hand": "Right" }
]
```

MIDI キャプチャは `timeMs` と `zoneId` を、モジュール自身のタイミング解像度で、記録したいだけのクリップ数ぶん無償で生成する。**しかし `hand` は生成できない。** MIDI ノート 38 は「スネア」を示すが、どちらのスティックが叩いたかは示さない。したがって `scoreDrumBenchmarkEvents` の `handAssignmentAccuracy` は手動アノテーションのまま残り、MIDI はアノテーション作業の大半を削るが全部ではない。

実装者が必ずぶつかる細部を1つ: MIDI のタイムスタンプはキャプチャページの time origin 基準であり、マニフェストの `timeMs` はクリップ先頭基準である。キャプチャには明示的な同期マーカー (最初のヒット、あるいは記録された `t0`) をマニフェストに書き込む必要がある。これは研究ではなく実装作業だが、無料ではない。

### 現状ヒットをワイヤに載せる経路は存在せず、OBS オーバーレイはそれを必要としない

`shared/codec.js` (KGM1-WIRE) がエンコードするブロックは `BLOCK_FACE`・`BLOCK_POSE`・`BLOCK_HANDS` の3つだけである。**ドラムブロックは存在しない。** `DrumState` と `DrumHitEvent` は KGM1-JSON (`src/core/types.ts`) と `docs/PROTOCOL_V2_DRAFT.md` にのみ存在する。

ネットワーク越しのビューワが実際に描いているものはヒットストリームですらない: `viewer/viewer.js:1150` は `deriveDrumOverlayState(target.hands, …)` を呼び、受信した**手首位置**からゾーンの活性を近接判定で再導出している (`shared/runtime.js:650`)。MIDI ヒットには手首位置がないため、そこでは何も点灯しない。

OBS オーバーレイは別の、そしてはるかに良い話である。`viewer/drum-overlay.html` は `minamo-drum` の `BroadcastChannel` を購読し、実際の `DrumHitEvent` のストリームを減衰する点滅に畳み込む (`shared/drum-overlay.js`)。これは same-origin・同一デバイスであり、プロトコル変更を要さない — **トラッカーページ上の MIDI アダプタは今日そのまま OBS オーバーレイを駆動できる。** その際に留意すべき点: `docs/product/drum-obs-overlay.md` はトラッカー/ビューワーが当該チャンネルにヒットを公開すると記載しているが、ツリー内にその実装は存在しない。`minamo-drum` は購読者だけがいて公開者がいない状態であり、MIDI アダプタが最初の公開者になる。

つまり切り分けはこうなる: OBS オーバーレイとベンチマークの ground truth はワイヤ作業を要さない。リモートビューワがヒットに反応するには KGM2 のブロックが必要で、それは本書ではなく #277 に属する。

### `DrumHitEvent` は MIDI ヒットを運べるが、3つのフィールドは測定値でなくなる

`position`・`velocity`・`speed` はスティックトラッキング由来の幾何量である。MIDI が供給するのはノート番号、0–127 のベロシティ、そして時刻である。残る3つを捏造すればそれらを読むコードが壊れる: `confidence` は `clamp(0.5 + min(speed / 4, 1) * 0.5)` で計算され、`DRUM_MIN_HIT_SPEED_MPS = 0.45` が発火を制御している。MIDI ベロシティは m/s ではなく、そう見せかけてはならない。

誠実な形は `source` 判別子と独立した強度である:

- `source: 'vision' | 'audio' | 'midi'` — `audio` は既に `audioAligned` と `inferKickPedalHit` によって暗に存在する。後者は position も speed もゼロのイベントを返す。この関数が「幾何情報のないヒット」の既存の先例であり、現状では停止した視覚ヒットと区別がつかない。
- `position` はキャリブレーション済みの `DrumZone.center` から取る — キットキャリブレーションはスネアの位置を既に知っており、それこそが MIDI に欠けている情報である。
- `velocity`/`speed` はゼロのままとし、その理由は `source` が説明する。
- `intensity: number` (0–1) を MIDI ベロシティ / 127 から取る。オーバーレイの点滅や将来のアニメーションが実際に欲しいのはこれである。

### GM パーカッションマップはドラムをほぼ覆い、鍵盤を完全に覆い、ギターを覆わない

**ドラム。** General MIDI パーカッションキーマップ (チャンネル 10) は既存の `zoneType` union とほぼ完全に対応する — 35/36 キック、38/40 スネア、42/44/46 ハイハット (クローズ/ペダル/オープン)、41–50 タム、49/57 クラッシュ、51/59 ライド。注意点は、電子ドラムのモジュールがメーカー既定値を持ち、かつユーザが再割当できることである。Roland はモジュール別の既定ノートマップを公開しており、ノート割当はモジュールの MIDI NOTE メニューで変更できる。よって GM テーブルを既定として同梱し、「各パッドを1回叩く」学習ステップを追加する。特定ベンダのマップをハードコードしてはならない。

なお `zoneType` の `pedal` と `unknown` に GM 対応はなく、44 (ペダルハイハット) はペダルのノートではなくハイハットのノートである。`inferHiHatPedalState` が音声から推定しているハイハットペダルの開度は、多くのモジュールでは CC4 の連続値として MIDI で届く。これは音声ヒューリスティクスより厳密に良い情報であり、ヒットではなく別フィールドである。

**鍵盤。** ノート番号から鍵への対応は厳密かつ標準であり、キャリブレーションを一切要さない。また MIDI 出力が普遍的に存在する唯一のカテゴリでもある — MIDI キーボードは定義上すべて備えている。マッピングは自明だが、アニメーションはそうではない (次節)。

**ギター。** MIDI ノートは弦とフレットを決定しない。同じ音高は複数のポジションで演奏可能であり、素の MIDI ではアバターの運指が不定になる — 3楽器のうちノートストリームが本質的に不十分な唯一の楽器である。ヘキサピックアップや MPE のシステム (Jamstik、MIDI Guitar 3 Hex) は各弦を個別チャンネルに割り当てるため、弦が、したがってフレットが復元できる。つまりギターに MIDI 経路があるのは弦別チャンネルのハードウェアに限られ、それは電子ドラムや MIDI キーボードよりはるかに希少である。通常のエレキギターは MIDI を出力しない。

この序列 — 鍵盤は普遍的、ドラムは一般的、ギターは希少かつ曖昧 — が後述の Decision の優先順位の理由であり、これは研究課題ではなくハードウェアの事実である。

### MIDI からモーションを生成するモデルはいずれも本プロジェクトで使えず、理由は3種類に分かれる

| 研究 | 入力 | ライセンス | 適用できない理由 |
|---|---|---|---|
| **DRUMS** (MIG 2025) | MIDI | 論文は CC BY 4.0、**コード未発見** | 評価対象の成果物が存在しない |
| **FürElise** (SIGGRAPH Asia 2024) | MIDI | データセット **CC BY-NC 4.0**、MANO、コードは "to be released" | NC + MANO + 物理シミュレーション |
| **PianoMotion10M** (ICLR 2025) | MIDI ではなく **音声** | コードは Apache-2.0 | 3.2–5.57 億パラメータ |
| **Guitar** (SIGGRAPH Asia 2024) | タブ譜 / ノートファイル | **MIT**、重み同梱 | Isaac Gym が必要 |

- **DRUMS** は #278 の望むものに最も近い: BiLSTM が MIDI から両手の 3D 軌道と向きを正確な打点タイミングつきで予測し、MIDI マッチングモジュールがそのフレーズに合う上半身と表情のモーションを検索する。コードも重みも公開されておらず、ACM ページの CC BY 4.0 は論文本文にかかる。したがって #278 の「DRUMS 方式のモーション合成を評価 (ライセンス、モデルサイズ)」には **評価すべき成果物が存在しない**。再現するにはドラマーのモーションキャプチャが必要で、本プロジェクトは保有していない。
- **FürElise** は新規の譜面を MIDI で受け取る。インタフェースとしては正しく、そして #271 の候補と同じ理由でライセンス監査に落ちる: データセットが CC BY-NC 4.0、手の表現に **MANO**。3件連続で同じブロッカーである。
- **PianoMotion10M** はコードライセンスが唯一クリーンだが、入力は MIDI ではなく **音声**である — 論文のパイプラインが音声を MIDI に変換するのはデータセット構築のためであり推論のためではない。ベンチマークモデルは 3.2–5.57 億パラメータ。本プロジェクトのモデル予算は数 MB の ONNX である (#222, #269)。
- **guitar** の論文は MIT かつ学習済みモデル同梱で、本プロジェクトが繰り返し得られずにいるライセンス上の結果そのものである — それでもなお配備できない。PyTorch と Isaac Gym で学習・実行される RL ポリシーであり、エクスポート経路はなく、著者も楽曲トラックを配布できていない。

この4件を超えて一般化するため、構造的な点を1度だけ述べる: **MIDI からの演奏アニメーションはオフラインのキャラクタアニメーションである。** 物理シミュレーション上の RL ポリシーか、数億パラメータかであり、レイテンシではなくアニメーション品質で評価される。本プロジェクトの制約は、顔と手のトラッキングが既に走っているブラウザタブで 60 fps を維持することである。ライセンス監査は通例のゲートだが、ここではそれが律速ではない — MIT の候補ですら手が届かない。

**実際に手が届くのはモーション合成ではない。** 電子ドラムであれば、アバターは*既知の*ゾーン中心へ*既知の*時刻にスティックを運べばよい。これはキットキャリブレーションが既に保持しているデータで駆動される、キャリブレーション済みターゲットへの IK である。鍵盤も同様で、鍵の位置は固定の幾何配置である。上記論文群の難しい研究課題はターゲット幾何が未知のときに尤もらしいモーションを推定することであり、本プロジェクトのゾーンキャリブレーションはその問題を解くのではなく消している。ギターだけが例外で、それは弦とフレットが入力から欠けているからであってモーションが難しいからではない。

### Rapid-Motion-Track に #278 が帰する技術は含まれていない

#278 は RMT を「30 fps でのモーションブラーと時間的エイリアシングに対する補間/超解像を用いる」と記述している。論文に照合した結果: 3つのモジュールからなる — 著者らの P-MSDSNet を転用した指先トラッカー、山と谷を拾う適応的頂点認識ステップ、そして運動学的特徴抽出器である。**超解像も、フレーム補間も、デブラーも、オプティカルフローも用いていない**。ブラーはネットワーク内のマルチスケール特徴融合で扱っている。これは 2023年1月の臨床的運動評価システムであり、コードは公開されておらず、検証された出力は*周波数*指標である — 250 fps の Optotrak を基準として 97.3% が ±0.5 Hz 以内 (DeepLabCut は約 88.2%)。**±0.5 Hz の周波数一致は打点ごとのタイミングに関する証拠ではない**。ドラムベンチマークが採点しているのは ±35 ms の後者である。したがってスティック先端推定の設計文書に折り込むべき「アンチエイリアシング技術」はここに存在しない。

転用できるのは第1モジュールではなく第2モジュール、すなわち*適応的*しきい値によるピーク検出である。本プロジェクトのヒット検出は固定定数である — `DRUM_DOWNSTROKE_MIN_SPEED_MPS = 0.5`、`DRUM_MIN_HIT_SPEED_MPS = 0.45`、ゾーンごとの `cooldownMs` (`tests/core.test.ts` では 40–45 ms)、そしてベンチマークの `minimumSeparationMs = 35`。

これらの定数は、以上すべてに先立つ天井を課している:

| 制限 | 値 | 同一ゾーンでの最大 hits/s |
|---|---|---|
| ベンチマークの `minimumSeparationMs` | 35 ms | 28.6 |
| `DrumZone.cooldownMs` (テストでの設定値) | 40–45 ms | 22–25 |
| 30 fps カメラのナイキスト限界 | — | 15 |
| 60 fps カメラのナイキスト限界 | — | 30 |
| MIDI | — | 天井なし |

`scoreDrumBenchmarkEvents` は同一 `zoneId` で `minimumSeparationMs` より近い2ヒットを **構造上** `falseDoubleHits` として数え、検出器側のクールダウンは2発目をそもそも発火させない。1つのドラム上のダブルストロークやバズロールは双方を超える。**したがって #123 の高速ロールストレステストは、現在の設定のままでは精度ではなく検出器自身の設定に対して失敗する** — 誤ロールを抑えるクールダウン (`issues/backlog/061-drum-add-per-zone-cooldown-to-prevent-false-rolls.md`) は、本物のロールを抑える機構と同一である。クリップを収録する人は先にしきい値を意図的に設定すべきで、さもなければ測っているのはトラッキングではなく定数である。

そしてカメラが定数より先に上限を課す。これが電子ドラム経路の最も強い論拠である: カメラがそもそもサンプリングできないロールの ground truth を得る手段は MIDI しかない。

## アダプタ仕様

アダプタは1つ、マッピングは3つ。Rust のデスクトップ経路と Web MIDI のブラウザ経路が同じものを出力するよう、トランスポート端では楽器非依存とする。

```ts
export type InstrumentKind = 'drums' | 'keys' | 'guitar';
export type PerformanceSource = 'vision' | 'audio' | 'midi';

/** 楽器マッピング前の生イベント。両アダプタが出力する。 */
export interface MidiNoteEvent {
  timeMs: number;        // MIDIMessageEvent.timeStamp — performance.now() の origin
  portId: string;
  channel: number;       // 0-15
  note: number;          // 0-127
  velocity: number;      // 0-127。velocity 0 の note-on は note-off
  kind: 'noteOn' | 'noteOff' | 'controlChange';
  controller?: number;   // CC 番号。ハイハットペダル開度なら 4 など
  value?: number;        // controlChange の 0-127
}

/** マッピング後。ドラムはさらに DrumHitEvent へ射影する。 */
export interface PerformanceEvent {
  eventId: string;
  timeNs: number;
  source: PerformanceSource;
  instrument: InstrumentKind;
  intensity: number;     // 0-1、MIDI velocity / 127
  targetId: string;      // drums: zoneId | keys: `key:${note}` | guitar: `s${string}f${fret}`
  string?: number;       // ギター。弦別チャンネル時のみ
  fret?: number;         // ギター。string と note から導出
  hand?: Handedness;     // MIDI からは決して設定しない
}
```

マッピング規則:

- **drums** — 既定は GM パーカッションテーブル、学習ステップで上書き可能。`targetId` は既存の `zoneId` であるため `position` は `DrumZone.center` から得られ、イベントは `source: 'midi'`、velocity/speed ゼロで `DrumHitEvent` へそのまま射影できる。ハイハットペダル開度は CC として届き、ヒットを発火せず連続状態を更新する。
- **keys** — `targetId` はノート番号。キャリブレーション不要。
- **guitar** — 各弦が個別チャンネルにある場合のみ対応する。それ以外では位置を推測せず、非対応として報告する。推測したフレットは目に見えて誤ったアバターの手を生むためである。

ポートは権限付与時に列挙し、`statechange` で再列挙する。モジュールが切断されたときにベンチマークのキャプチャが黙って止まってはならない。

プライバシー: MIDI は映像ではないため「映像はデバイスから出ない」という主張 (`scripts/check-privacy-invariants.mjs`, #264) は影響を受けない — ただし MIDI は利用者の演奏そのものであり、ポート名は利用者のハードウェアを特定する。トラッカーが既定とするローカルファースト (`DEFAULT_TRACKER_SETTINGS.mode` は `'local'`) を維持し、ポート名はレポートのメタデータに含めない。

## Decision

1. **仕様は今、実装は電子ドラムのゲートの後ろで。** 上記アダプタが本パスの成果物であり、実装の検証には実機が必要で、#235 や #238–#241 と同じ扱いになる。
2. **優先順位は鍵盤、ドラム、ギターの順** — ハードウェアがそもそも MIDI を出すか、ノートが位置を決定するかによる。ギターは弦別チャンネルのハードウェアでのみ対応し、それ以外は明示的に非対応とする。これはバックログ項目ではなくハードウェアの限界である。
3. **4件のモーション合成モデルはすべてランタイム経路から除外する**: DRUMS (成果物なし)、FürElise (CC BY-NC + MANO)、PianoMotion10M (音声入力、3.2–5.57 億パラメータ)、guitar の RL ポリシー (MIT だが Isaac Gym 限定)。代わりにキャリブレーション済みターゲットへの IK でアバターを駆動する — 本プロジェクトが既に取得しているゾーン/鍵の幾何こそ、これらのモデルが推定するために存在するものである。
4. **まずベンチマークの ground truth を取る。** トラッカーと時計を共有し、プロトコル変更を要さず、カメラのナイキスト限界を超えるロールについて唯一の真値源である。供給するのは `timeMs` と `zoneId` で、`hand` は手動のまま。
5. **デスクトップの MIDI はネイティブに置く。** WKWebView と WebKitGTK に Web MIDI はなく、WebView アダプタでは Windows 限定になる。Tauri コマンドの背後の Rust で、同一イベント形状、レビュー対象の依存1件。
6. **#123 のロールクリップを収録する前にロールの天井を直す。** ベンチマークの 35 ms 分離とゾーンの 40–45 ms クールダウンは同一ゾーンのロールを 22–29 hits/s に制限しており、バズロールが生む密度を下回る。
7. **Rapid-Motion-Track についてはアクションなし。** 上記の訂正を記録し、当該主張が再引用されないようにする。その着想を使いたい場合、それは適応的しきい値によるピーク検出であり、適用先は項目6の定数である。

## Sources

- Web MIDI サポート表 — <https://caniuse.com/midi>
- Web MIDI API 仕様 (時間座標、フィンガープリンティング、権限) — <https://webaudio.github.io/web-midi-api/>
- `requestMIDIAccess()` の権限モデルと `midi` Permissions-Policy — <https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess>
- プラットフォーム別の Tauri WebView — <https://v2.tauri.app/reference/webview-versions/>
- General MIDI パーカッションキーマップ (チャンネル 10) — <https://www.cs.cmu.edu/~music/cmp/archives/cmsip/readings/GMSpecs_PercMap.htm>
- Roland の既定ノートマップはモジュール別かつ編集可能 — <https://support.roland.com/hc/en-us/articles/360005173411-TD-17-Default-MIDI-Note-Map>
- DRUMS: Drummer Reconstruction Using Midi Sequences (MIG 2025) — <https://dl.acm.org/doi/10.1145/3769047.3769066>
- FürElise (SIGGRAPH Asia 2024)、データセットは CC BY-NC 4.0 — <https://for-elise.github.io/>, <https://huggingface.co/datasets/rcwang/for_elise>
- PianoMotion10M (ICLR 2025)、コードは Apache-2.0、入力は音声 — <https://github.com/agnJason/PianoMotion10M>
- Synchronize Dual Hands for Physics-Based Dexterous Guitar Playing (SIGGRAPH Asia 2024)、MIT、Isaac Gym — <https://github.com/xupei0610/guitar>
- Rapid-Motion-Track (arXiv 2302.08505, 2023年1月) — <https://arxiv.org/abs/2302.08505>
- ヘキサピックアップと弦別 MIDI チャンネル — <https://jam.live/products/MG3Hex/>, <https://www.sweetwater.com/insync/hex-pickup/>
