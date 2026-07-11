# Quick Start

> English version: [QUICKSTART.md](QUICKSTART.md)

## 0. まず見るだけ

リポジトリのルートをローカルHTTPサーバーで配信します。

```bash
./scripts/dev.sh          # または: python3 -m http.server 8000
```

ブラウザで開きます。

- http://localhost:8000/tracker/ — 実webcamトラッカー(表情52ch + 頭部姿勢)
- http://localhost:8000/viewer/ — アバタービューア(`.vrm` / `.glb` またはInochi2D `.inp` / `.inx` をドロップで差し替え、
  trackerの`.jsonl`記録をドロップでモーション再生)
- http://localhost:8000/replay/ — viewer検証用のローカルJSONLリプレイ送信ページ
- http://localhost:8000/landing/ — ランディングハブ。**Start demo** を押すと、
  Webcamが使える環境では映像の上にモックの顔・手・ドラムトラッキングが重なります。
  Webcamが使えない場合もモックアニメーションだけで動作します。

## 1. pnpmで開発する場合

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev        # ランディングハブ + TypeScriptコアのvite開発サーバー
pnpm test       # 構造スモークテスト
```

## 2. 構造検証

```bash
python3 scripts/verify_structure.py
```

## 3. リレー(リモートビューア向け)

```bash
pnpm --dir relay-node start                 # WebSocket中継 + 静的配信 (:8787)
cd relay-rs && cargo run --release          # WebTransportデータグラム中継 (Rust)
```

接続手順の詳細は [README.ja.md](../README.ja.md) を参照。

## 4. IssueバックログのGitHub登録

リポジトリには相互補完的な2つのバックログがあります。

- `docs/BACKLOG.md` — 精選53件 `[KGM-001..053]`。
  [ISSUE_REGISTRATION_PROMPT.md](ISSUE_REGISTRATION_PROMPT.md) のプロンプトで登録
- `issues/backlog/` — 細分化タスク142件。dry-runしてから登録:

```bash
python3 scripts/create_github_issues.py --repo OWNER/REPO --dry-run
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label priority/P0   # P0のみ
python3 scripts/create_github_issues.py --repo OWNER/REPO --apply --label tracking/hand # 手のみ
```

先に `gh auth login` が必要です。

## 5. 推奨実装順

1. `src/core/oneEuroFilter.ts` と `src/core/anatomy.ts` をテストで固める。
2. MediaPipe Tasks Hand / Face Landmarkerを `src/adapters/mediapipe_tasks_adapter.ts` に接続する。
3. `KGM1Frame` として毎フレーム出力する。
4. 指1本ごとの `FingerState` を生成する。
5. Face blendshapeを目・口・眉・頬へ分解する。
6. ドラムキットキャリブレーションと打点判定を作る。
7. VRM、Live2D、Inochi2D mappingを追加する。
8. WebTransport senderを追加する。
9. ベンチマーク、破綻検出、低照度/遮蔽テストを自動化する。

## 6. 最小MVPの定義

MVP-0は、次を満たすと完成です。

- Webcam映像をブラウザで取得できる。
- Face Landmarkerから顔ランドマークとblendshapeを取得できる。
- Hand Landmarkerから左右の手、21点、world landmarksを取得できる。
- 指ごとのcurl/spread/bend/tip velocity/confidenceを出せる。
- One Euro Filter + anatomy clamp + outlier rejectionを通す。
- KGM1 JSON frameを60fps目標で出せる。
- ランディングページ上で値を可視化できる。
- GitHub Issueと品質ゲートが整っている。

MVP-1は、VRM/Live2D/Inochi2Dの1つ以上を実際に動かします。

MVP-2は、ドラム演奏トラッキングをWebcam + 音声で動かします。
