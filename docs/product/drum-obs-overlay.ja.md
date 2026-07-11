<!-- i18n: language-switcher -->
[English](drum-obs-overlay.md) | [日本語](drum-obs-overlay.ja.md)

# ドラム OBS オーバーレイ

ステータス: issue #120 に対して実装済み。詳細は
[drummer-setup.md](drummer-setup.md) を参照してください。

ドラムオーバーレイは、ヒットしたときに各キットゾーンが点滅する透明なブラウザソースです。これはトラッカーのライブハンド・トゥ・ゾーンオーバーレイ（`deriveDrumOverlayState`）とは別のもので、OBSオーバーレイはストリーミングされた `DrumHitEvent` パケットをレンダリングするため、視聴者の隣や別のマシンで動作します。

## 使用方法

1. `viewer/drum-overlay.html` を OBS のブラウザソースとして開きます。
2. 透明な背景で追加します; ページは不透明なものをレンダリングしません。
3. ソースの位置を調整しながら合成ヒットをプレビューするには、`?demo=1` を追加します。
4. ローカルモードでは、トラッカー/ビューワーが `minamo-drum` の `BroadcastChannel` でヒットを公開し、オーバーレイはそれらを減衰する点滅にまとめます。

## リデューサー

レンダーロジックは `shared/drum-overlay.js` にあります：

- `reduceDrumOverlay(state, event, nowMs)` は1つのヒットをゾーンごとの状態に折り込み、重複する `eventId` を無視します。
- `deriveObsOverlayState(state, nowMs, { decayMs })` は各ゾーンのフラッシュアルファ（`decayMs` で0に線形減衰）、アクティブゾーンのID、およびヒットカウンターを返します。

## テスト

- `pnpm test` はリデューサーをカバーします: ヒットは正しいゾーンのフラッシュを引き起こし、フラッシュは減衰ウィンドウ後に0に減衰し、重複イベントは二重計上されず、ヒットカウンターは総ヒット数を追跡します。
- 手動: `?demo=1` で OBS にオーバーレイを読み込み、透明な背景とゾーンごとのフラッシュを確認します。
