<!-- i18n: language-switcher -->
[English](ble-midi-drum-sticks.md) | [日本語](ble-midi-drum-sticks.ja.md)

# BLE ドラムスティックプロファイル

ステータス: **issue #240 のプロトタイプ結果 — ソフトウェアゲートは PASS、ハードウェアゲートは
BLOCKED。** [imu-stick-integration.md](imu-stick-integration.md) (#185) の調査判断を引き継ぎ、
[midi-performance-input.md](midi-performance-input.md) (#278) が定めた MIDI アダプタ面を共有する。

## #240 の前提は、購入可能なデバイスと一致しない

#240 のプロトタイプスコープは「タイムスタンプ付き加速度/ジャイロサンプルを補助信号として取り込む」
と記し、その前の #185 もアクセサリを、生の出力をトラッカーが消費する IMU として位置づけていた。
**出荷されているドラムスティックセンサーでそのように動作するものは存在しない。**

実在する2製品はいずれも打撃検出を **スティック側で** 行い、**BLE-MIDI のノートオン + ベロシティ** を
送信する。Freedrum は nRF52832 にジャイロと加速度計を載せ、デバイス上で衝撃を検出し、「MIDI over
Bluetooth LE でデータを送信する」。Senstroke（Redison）も同様に「ユニバーサルな MIDI フォーマット」を
出力し、それゆえベンダー製ソフトなしで DAW を駆動できる。どちらも生の IMU ストリームが電波に乗ることはない。

これは issue の想定より良い結果であり、作業内容を変える:

- **書くべき IMU 信号処理は存在しない。** スティック自身の DSP は衝撃の瞬間の加速度を内部のフル
  サンプルレートで持っている。7.5 ms のコネクションインターバル越しに間引かれたサンプルを受け取る
  ブラウザがそれに勝てるはずがない。オンセット検出はセンサーのある場所に留まる。
- **リバースエンジニアリングやライセンスが必要なベンダー GATT プロファイルは存在しない。**
  プロファイルは公開標準である BLE-MIDI である。
- プロトタイプに実際に必要なのは **BLE-MIDI デコーダ** であり、それが
  `src/core/bleMidiStick.ts` である。

失われるものが1つある: ノートオンを疑うことができない。スティックの閾値がリムクリックで発火しても、
トラッカーは反論の材料となる加速度を見られない。これは実在する制約であり、合成テストではなく
ハードウェア評価に属する。

## プロファイル

BLE-MIDI、MIDI Association (MMA/AMEI RP-052) による仕様。実装にデバイス単位のライセンスは不要で、
パケットフォーマットは複数の独立したベンダー実装（Nordic、SparkFun、Silicon Labs、Espressif）で公開
されている。規範文書自体は一部が MIDI Association の会員資格の背後にある。

| | |
|---|---|
| GATT サービス | `03B80E5A-EDE8-4B33-A751-6CE34EC4C700` |
| キャラクタリスティック | `7772E5DB-3868-4112-A1A9-F2669D106BF3` |
| プロパティ | Notify、Write Without Response（一部デバイスは Read も） |
| ディスクリプタ | Client Characteristic Configuration (`0x2902`) |
| 既定 MTU | 20 バイト。パケットは小さく、多くは1メッセージのみ |

パケット符号化。鋭い角があるのはここである:

```
byte 0   ヘッダ      1 0 H H H H H H    bit7 セット、bit6 クリア、タイムスタンプ上位6ビット
次       タイムスタンプ 1 L L L L L L L    bit7 セット、タイムスタンプ下位7ビット
次       ステータスバイト（bit7 セット）、またはランニングステータス下のデータバイト
```

デコーダが正しく扱う必要のある3点。いずれも見落とすとタイミングを静かに壊すか、幻のヒットを発火させる:

1. **タイムスタンプバイトとステータスバイトはどちらも「bit7 セット」である。** 両者は位置でしか
   区別できない。ヘッダの直後は必ずタイムスタンプであり、タイムスタンプの次のバイトは bit7 が
   セットされている場合に限りステータスバイトである。
2. **ヘッダの上位6ビットはパケットにつき1回しか送られない。** パケット内のメッセージが 128 ms 境界を
   跨ぐと下位フィールドが減少し、受信側が上位ビットを繰り上げなければならない。これがないと、その
   パケットの2番目の打撃は最大 128 ms **早く** デコードされる。
3. **タイムスタンプは 13 ビットのミリ秒であり、8192 ms ごとに一周する。** デバイス時刻を 8.192 秒を
   超えて保持する消費側はアンラップが必須であり、再接続時にはデバイスクロックが再スタートするため
   その状態をリセットしなければならない。

SysEx はパースせずスキップする。スティックが送る理由はなく、ペイロードバイトをノートと誤読すれば
起きていないヒットが発火する。

## Web Bluetooth は不要だと判明した

#240 の形を最も変える発見である。issue の前提条件は Web Bluetooth の機能検出経路と、
「Safari/WebKit 向けの Tauri/ネイティブ BLE ブリッジの判断」を求めている。しかし **OS レベル** で
ペアリングされた BLE-MIDI デバイスは通常の MIDI ポートとして見える — macOS は Audio MIDI Setup の
「Bluetooth 構成」でペアリングし、Windows・Android・ChromeOS にも同等の仕組みがある — その後
ブラウザは **Web MIDI** 経由でそれを見る。Bluetooth API は一切関与しない。

したがってトランスポートの問題は #278 が既に答えた Web MIDI の問題に収束し、#240 が問うている
ネイティブブリッジは **BLE GATT** ブリッジではなく **MIDI** ブリッジになる。ネイティブ面は大幅に
小さい: 対象 OS はいずれも MIDI スタック（CoreMIDI、WinRT MIDI、ALSA）を標準搭載しているため、
ブリッジは GATT を喋りペアリングを管理し上記のパケットデコーダを再実装する代わりに、OS のポートを
消費するだけで済む。

直接の Web Bluetooth 経路は依然 *許可されている* — BLE-MIDI サービスは Web Bluetooth の GATT
ブロックリストに **載っていない**（同リストは14項目で、MIDI の UUID は1つも含まない）。OS レベルで
ペアリングできない/したくないユーザー向けのフォールバックとして `selectStickTransport` に残す。
既定にはしない。選べば、OS が処理するはずのペアリング・再接続・BLE-MIDI デコードを、もともと最も
容易だった2プラットフォーム（Chrome、Edge）上で自前で抱えることになるからである。

## ブラウザ／ネイティブ対応表

| プラットフォーム | Web MIDI | Web Bluetooth | スティック利用可否 |
|---|---|---|---|
| Chrome / Edge デスクトップ | あり (43+ / 79+) | あり | 可 |
| Chrome Android | あり | あり | 可 |
| Firefox デスクトップ | 108+、**ただし下記参照** | なし | アドオン導入後に可 |
| Safari デスクトップ・iOS | **なし**（全バージョン） | なし | 不可 — デスクトップアプリのみ |
| Tauri, Windows (WebView2) | あり | あり | 可 |
| Tauri, macOS/Linux (WebKit) | **なし** | なし | ネイティブ MIDI ブリッジ |

### #278 への訂正: Firefox は単なる「対応済み」ではない

#278 は対応状況を「Chrome 43+, Edge 79+, **Firefox 108+**, Opera 30+, Samsung Internet 4+」と記録し、
機能検出は **「このブラウザでは MIDI を利用できません」** に縮退して「そのまま留まる」べきだと規定して
いる。この文言は Safari には正しく、**Firefox には誤りである**。

Firefox は Web MIDI を実装しているが、`navigator.requestMIDIAccess()` はユーザーが生成された
*サイト権限アドオン* をインストールするまで **常に reject する**（localhost は例外）。API は存在し、
機能検出は通過し、それでも Promise は失敗する。「このブラウザでは利用できません」と表示されたユーザーは、
実際にはスティックが動作するブラウザについて誤った情報を与えられ、しかも解決手段を示されない。

そこで `selectStickTransport` は「Web MIDI が存在する」と「ここで Web MIDI が resolve する」を別の事実
として扱い、後者にはアドオンの案内文を出す。Safari のケースは #278 が論じた行き止まりの文言を維持する
— WebKit には Web MIDI も Web Bluetooth も実装がなく、進行中のものもないためである — 加えて、カメラと
音声のトラッキングには影響がない旨を添える。アクセサリの不在が製品の劣化として読まれないようにするためである。

## スティックが提供するもの、できないこと

スティックは **いつ** と **どれだけ強く** を測る。キットが **どこ** にあるかは知らない。したがって
スティック単独の `DrumHitEvent` は `position` ゼロ、`velocity` ベクトルゼロを持ち、打撃の強さは
`speed` にマップされる。消費側は捏造された座標を信じるのではなく、そのゼロ位置によってスティック
ヒットとビジョンヒットを区別する。

`fuseStickHitsWithVisual` は各センサーが実際に測ったものに基づいて権限を分割する: スティックが
タイミングとベロシティを、カメラが位置を提供し、片方だけが見た打撃は双方向とも無改変で通過する。
後半は前半と同じくらい重要である — アクセサリを挿すことで、カメラが既に得ていたヒットが
*失われて* はならない。

ノートマッピングは #278 が定めた方針に従う: 既定は General MIDI パーカッションテーブル、learn ステップで
上書き可能。モジュールやアクセサリはメーカー既定値で出荷され、プレイヤーがそれを再割り当てするためである。

## クロック整列

スティックの 13 ビットクロックはホストのそれと無関係であり、BLE はオフセットの上にさらにレイテンシを
加える。デバイスタイムスタンプが存在する理由はまさにこれである: BLE は 7.5 ms 以上のコネクション
インターバルで配送するため、到着時刻は無線によって量子化されジッタを受けるが、デバイス上のタイムスタンプは
そうではない。

プロトタイプは #241 の線形クロックフィット（`measureCaptureTimestampAlignment` /
`applyClockAlignment`）を再導出せずに再利用する — 問題は同一であり、複製すればツリーに2つのクロック
モデルが並ぶことになる。ここでフィットが達成しうる精度はコネクションインターバルに律速され、その数値こそ
ハードウェア実行が出すべきものである。

## 実測ゲート — すべて BLOCKED

#240 の「Measured gates」の全項目が物理アクセサリを必要とし、本プロトタイプはそのいずれにも答えない:

| ゲート | 状態 |
|---|---|
| パケットレート、ロス、タイムスタンプのオフセット/ドリフト、再接続時間 | BLOCKED — 実機が必要 |
| ヒットタイミングとベロシティ相関のウェブカメラ/音声ベースラインとの比較 | BLOCKED |
| 切断/再接続と高速ロールにおける誤二重ヒット | 一部カバー — 重複ガードは再送パケットと再接続に対して単体テスト済みだが、実際の重複 *発生率* は未測定 |
| 一定時間実行時のバッテリー消費 | BLOCKED |
| 環境、同意/ライセンスメタデータ、コミット SHA、秘匿済みエビデンス | BLOCKED |

ソフトウェアで確定できること、そして実際に確定したこと: 公開フォーマットに対するパケットデコードの正しさ
（間違えやすい2つの符号化を含む）、シード付きランダムパケット2万件に対して例外を投げず縮退すること、
再接続が打撃を再生しないこと、トランスポート選択がユーザーエージェント判定なしの機能ベースであること、
デバイス識別子がログ行に到達し得ないこと。

本プロトタイプはアクセサリを必須にせず、ウェブカメラ/音声の受け入れ経路の完了として数えられない。

## 出典

- BLE-MIDI 概要と仕様 — <https://midi.org/midi-over-bluetooth-low-energy-ble-midi>
- MIDI over Bluetooth LE、パケットフォーマットと UUID — <https://devzone.nordicsemi.com/guides/short-range-guides/b/bluetooth-low-energy/posts/midi-over-bluetooth-le>
- MIDI BLE チュートリアル、タイムスタンプ構成とランニングステータス — <https://learn.sparkfun.com/tutorials/midi-ble-tutorial/all>
- Freedrum は nRF52832 から MIDI over BLE を送信 — <https://www.nordicsemi.com/Nordic-news/2018/10/Freedrum-employs-nRF52832-to-wirelessly-connect-drumstick-attached-devices>
- Senstroke センサーはユニバーサル MIDI を出力 — <https://www.redison.com/products/individual-senstroke-sensor>
- Web Bluetooth GATT ブロックリスト（MIDI 項目なし） — <https://github.com/WebBluetoothCG/registries/blob/master/gatt_blocklist.txt>
- Web MIDI のブラウザ対応 — <https://caniuse.com/midi>
- Firefox のサイト権限アドオン要件 — <https://blog.karimratib.me/2022/04/23/firefox-webmidi.html>
- Firefox Web MIDI 有効化バグ — <https://bugzilla.mozilla.org/show_bug.cgi?id=1752906>
- macOS での Bluetooth MIDI ペアリング — <https://support.apple.com/guide/audio-midi-setup/set-up-bluetooth-midi-devices-ams33f013765/mac>
