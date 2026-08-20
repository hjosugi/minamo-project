<!-- i18n: language-switcher -->
[English](mediapipe-1.0-migration.md) | [日本語](mediapipe-1.0-migration.ja.md)

# MediaPipe tasks-vision 1.0 移行ウォッチリスト

`@mediapipe/tasks-vision@1.0.1` は公開済みですが、Minamoは引き続き
`0.10.35` に完全固定します。PR #358 の調査では、1.0のpackage／tracking APIには
互換性がある一方、公開ブラウザーバンドルに移行を止める新しいプライバシー変更が
あることを確認しました。

## 1.0.1で維持されているもの

1.0.1 packageには次が残っています。

- `vision_bundle.mjs` ESM entrypoint
- `scripts/fetch-models.sh` がmirrorするSIMD／非SIMD WASM loaderとbinaryの組
- `FilesetResolver`、`FaceLandmarker`、`HandLandmarker`、`PoseLandmarker`
- Minamoが使うsignatureの `detectForVideo`、`faceBlendshapes`、
  `facialTransformationMatrixes`

package／API canaryはこれらをすべて通過します。主なpublic type変更は、従来の
`InteractiveSegmenter` が新しいsplit-mode APIに置き換わり、旧APIが
`InteractiveSegmenterLegacy` に改名されたことです。Minamoはいずれも使用しません。

## 1.0.1を止める理由

1.0.1のESM／CJSブラウザーバンドルは各task用のmetrics loggerを生成し、性能／
利用状況のprotobuf eventを次へPOSTできます。

```text
https://odml.pa.googleapis.com/v1/log
```

バンドルには埋め込みAPI key bridgeと`x-goog-api-key`送信headerがあります。
0.10.35の対応バンドルにはODML senderがありません。MediaPipe公式privacy noticeは、
入力画像はon-deviceに残る一方、性能／利用状況metricsをGoogleへ送り、必要な
informed consentはapplication developerの責任だと説明しています。upstream maintainer
は、opt-outを予定していない一方、宛先hostをblockしてもSDKを使えると回答しています。

この挙動は、Minamoのデフォルト「ローカル限定プライバシー」「送信されるのは
トラッキング値だけ」という契約と両立しません。senderはインストール済み依存package
内にあるため、first-party raw-frame data-flow検査では見つかりません。したがって、
build、type、unit test、従来のpackage／API canaryが通っても、PR #358を承認するには
不十分です。

## 自動ガード

- `package.json` は `0.10.35` に完全固定します。
- `pnpm check:mediapipe` は、インストール済みpackageのentrypoint／WASM／API面を
  検査した後、root browser bundleを既知のODML endpoint／sender markerで走査します。
- 通常のpull-request CIと`scripts/release-smoke.mjs`がこのcommandを実行します。
  `scripts/verify_structure.py`はcommandの配線とblocked markerの維持も検査します。
- 週次nightly canaryも同じguardを使うため、version bumpの前にprivacy regressionを
  報告します。

依存関係更新をgreenにするためにprivacy markerを削除、改名、弱化してはいけません。
Minamoのtelemetry policy変更には、別のproduct/privacy判断とuser-consent設計が必要です。

## 将来の更新に必要な受け入れチェック

1. 自動third-party metrics senderを含まないupstream browser artifactを入手し、
   `pnpm check:mediapipe`を変更せずに通します。
2. bundle、WASM、modelをlocal vendorしたtrackerとpackaged desktopの通信をcaptureし、
   Face／Hand／Pose taskの開始、利用、停止で未宣言の外向きrequestがないことを確認します。
3. 実ブラウザーでface blendshape、facial matrix、pose、hands、CPU／非SIMD fallback、
   GPU／SIMD modeのcamera inferenceを再検証します。
4. `package.json`、`pnpm-lock.yaml`、`tracker/tracker.js`、
   `scripts/fetch-models.sh`、`types/browser-js.d.ts`の完全固定versionを同時に更新し、
   CDN bundle SRIと`scripts/model-pins.sha256`を再生成します。
5. `pnpm check:mediapipe`、`pnpm test`、`pnpm verify`、
   `pnpm typecheck:js`、`pnpm build`、full release smokeを実行します。

## アーキテクチャ上の注意

Face／Hand／Poseは分離taskのままにします。1.0依存関係reviewとHolistic Landmarkerへの
移行を同じ変更に含めないでください。

## 参考

- [MediaPipe v1.0.0 release notes](https://github.com/google-ai-edge/mediapipe/releases/tag/v1.0.0)
- [MediaPipe privacy notice](https://github.com/google-ai-edge/mediapipe#privacy-notice)
- [upstream Web telemetry clarification](https://github.com/google-ai-edge/mediapipe/issues/6306#issuecomment-4673728357)
- [@mediapipe/tasks-vision package](https://www.npmjs.com/package/@mediapipe/tasks-vision)
