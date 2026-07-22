<!-- i18n: language-switcher -->
[English](PAGES_DEMO.md) | [日本語](PAGES_DEMO.ja.md)

# GitHub Pages デモガイド

公開URL: <https://hjosugi.github.io/minamo-project/>

MinamoのGitHub Pagesは、「どういうプロジェクトかを知る」「簡単に試す」ための
公開入口です。モック表示と実トラッキングを混同しないよう、3段階に分けています。

## 1. UIデモ — カメラなしでも動作

[ブラウザデモ](https://hjosugi.github.io/minamo-project/landing/)を開き、
**デモを開始**を押します。顔・手・ドラム信号のモック可視化が動きます。
カメラを許可するとローカルプレビューの上に重なり、拒否した場合やカメラがない場合も
アニメーションだけで動作します。

このページの骨格、confidence、drum hitの値はシミュレーションです。
UIと信号の流れを確認するためのもので、MediaPipeの測定精度を示すものではありません。

## 2. 実Webカメラトラッカー

1. [Tracker](https://hjosugi.github.io/minamo-project/tracker/)を開きます。
2. カメラを許可し、**Start tracking**を押します。
3. transportを`local`のままにして、**Connect**を押します。
4. 同じブラウザの別タブで
   [Viewer](https://hjosugi.github.io/minamo-project/viewer/)を開きます。
5. 内蔵ボットを使うか、ローカルの`.vrm`、`.glb`、`.inp`、`.inx`をViewerへ
   ドロップします。

localモードは`BroadcastChannel`を使います。relay serverは不要で、カメラ映像を
アップロードしません。

## 3. カメラなしでViewerとReplayを試す

- [Viewer](https://hjosugi.github.io/minamo-project/viewer/)は、ローカルアバターや
  trackerの`.jsonl`記録をドラッグ&ドロップで読み込めます。
- [Replay](https://hjosugi.github.io/minamo-project/replay/)は、ローカルのKGM1 JSONLを
  Viewerへ送信し、同じ動きを繰り返し検証できます。

これらのページで選んだファイルは、利用者が明示的にnetwork relayを設定しない限り
ブラウザ内に留まります。

## 動くものと実験中のもの

対応デスクトップブラウザですぐ試せるもの:

- MediaPipeによる顔表情と頭部姿勢
- localのtracker-to-viewer送信、記録、replay
- VRM / GLB ViewerとOBS向け透明表示
- calibration、smoothing、品質diagnostics

まだ実験中、または手動の実機検証が必要なもの:

- Inochi2D WASM描画と実puppetの再現品質
- WebTransportとphone / Safari pairing
- 実ドラム、pedal、fast rollの精度
- OS別のvirtual camera backend

実験中の経路をrelease-readyと判断する前に、
[IMPLEMENTATION_PROGRESS.ja.md](IMPLEMENTATION_PROGRESS.ja.md)と
[ROADMAP.ja.md](ROADMAP.ja.md)を確認してください。

## プライバシーとブラウザ権限

カメラ権限は、ローカルプレビューまたは実トラッキングが必要なページだけで要求します。
モックデモは権限がなくても動きます。Minamoの標準local flowはraw camera videoを
アップロードしません。データ境界は[security/privacy.ja.md](security/privacy.ja.md)を
参照してください。

## ローカル確認とデプロイ

```bash
pnpm install --frozen-lockfile
pnpm build
python3 -m http.server 8000 --directory dist
```

<http://localhost:8000/>を開きます。`Pages` workflowは`main`へのpush後に`dist/`を
buildしてdeployします。Pages変更をmergeする前に次を実行します。

```bash
pnpm lint
pnpm test
pnpm verify
pnpm build
```

