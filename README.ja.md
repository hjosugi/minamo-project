<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Minamo

> English version: [README.md](README.md)

**[GitHub PagesでMinamoを試す](https://hjosugi.github.io/minamo-project/)** —
カメラなしでも動くUIデモから始め、実TrackerとViewerへ進めます。モックと実トラッキングの
違いは[Pagesデモガイド](docs/PAGES_DEMO.ja.md)を参照してください。

普通のwebcamひとつで、誰でも無料・低遅延でアバターを動かすための
高精度トラッキングシステム。

## 目標

- 誰でも安価に2D/3Dアバターで配信できる。まずはwebcam 1台から。
- 顔、目、口、手、指1本ずつ、上半身、さらにドラム演奏まで高精度に追跡する。
- ガタガタしない、折れない、変な方向に曲がらない、自然で破綻しにくい動きを最優先する。
- ローカル推論を標準にして、カメラ映像は端末から出さない。ネットワークに流れるのは
  動きのパラメータだけ(1フレーム約76バイト、映像比 約1/400)。
- WebTransport、WebGPU/WASM、Rust、BEAM系ルーティングと
  glTF/VRM/Live2D/Inochi2D描画バックエンドを統合できる拡張性を持つ。
- 未実装の部分は設計書とIssue化可能なバックログとして残し、計画全体を
  GitHub上で見えるようにする。

## いま動くもの

- 推論はすべてブラウザ内(MediaPipe Face Landmarker, GPU/WASM)。
  表情52ch + 頭部姿勢 + 上半身(実験的)。One Euroフィルタで平滑化
- 配送は3段構え: BroadcastChannel(サーバ不要) / WebSocket(互換) /
  WebTransportデータグラム(最低遅延, Rust)
- ビューアはVRM(three-vrm)、実験的なInochi2D `.inp/.inx` WASM描画、
  レイヤーPNG/PSDに対応。アバターが無くても内蔵ボットで即動作
- Tauriデスクトップ版はOS標準のファイル選択から
  `.inp`/`.inx`/`.vrm`/`.glb` を選ぶだけでビューアへ即読み込み
- [landing/](landing/) にランディングページハブとモックトラッキングデモ

詳細: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)(実装済み)/
[docs/ARCHITECTURE_TARGET.md](docs/ARCHITECTURE_TARGET.md)(目標像)。
プロトコル: [docs/PROTOCOL.md](docs/PROTOCOL.md)(実装済みv1ワイヤ形式)/
[docs/PROTOCOL_V2_DRAFT.md](docs/PROTOCOL_V2_DRAFT.md)(リッチスキーマ草案)。

## クイックスタート

最短の公開プレビューは <https://hjosugi.github.io/minamo-project/> です。
UIデモはインストールもアカウントも不要です。

### 1. サーバ不要(local モード)

```sh
./scripts/dev.sh            # ただの静的配信 (python3 -m http.server 8000)
```

1. http://localhost:8000/tracker/ を開き **Start tracking**
2. mode: local のまま **Connect**
3. 「ビューアを別タブで開く」→ 同一ブラウザ内でBroadcastChannel経由で動く
4. ビューアに `.vrm`、`.inp`、`.inx` をドロップすると自分のアバターに差し替わる

ランディングハブとモックデモは http://localhost:8000/landing/ 。

### 2. WebSocketリレー(別マシンのビューアへ)

```sh
pnpm install --frozen-lockfile
pnpm --dir relay-node start                 # http://localhost:8787 で配信+中継
```

tracker / viewer 双方で mode: ws、同じ room 名で Connect。

### 3. WebTransportリレー(最低遅延)

```sh
cd relay-rs && cargo run --release
```

起動ログの `cert sha-256` を tracker / viewer の cert 欄に貼り、mode: wt で
Connect。証明書は自己署名(14日制限)なので再起動で再生成する。
relay-rs のCI整備はKGM-009。

### 4. ネイティブデスクトップ

```sh
pnpm desktop:check
pnpm desktop:dev
```

起動した画面で **Open Avatar** を押し、`.inp`、`.inx`、`.vrm`、または
`.glb` を選択すると、Viewerが開いてそのまま読み込みます。配布用ビルドは
`pnpm desktop:build` で作成できます。詳細は
[docs/product/desktop-app.md](docs/product/desktop-app.md) を参照してください。

詳しい手順: [docs/QUICKSTART.md](docs/QUICKSTART.md)
([日本語版](docs/QUICKSTART.ja.md))。

## リポジトリ構成

```
tracker/     webcam → 52ch表情+頭部姿勢 → KGM1送出(パブリッシャ)
viewer/      KGM1受信 → VRM / 内蔵ボット描画(OBSブラウザソース向け)
shared/      正準ブレンドシェイプ定義・One Euro・KGM1コーデック・トランスポート(JS)
src/         次世代パイプラインのTypeScriptコア(型、フィルタ、解剖学的制約、
             MediaPipe/VRM/Live2D/Inochi2Dアダプタ)
crates/      RustのKGM1 binary headerコーデック
relay-node/  静的配信 + WebSocket中継(Node, 依存はwsのみ)
relay-rs/    WebTransportデータグラム中継(Rust / wtransport)
services/    Erlang/OTPルーター設計雛形
landing/     ランディングページハブ + webcam/モック可視化デモ
docs/        仕様、アーキテクチャ、ロードマップ、設計書、精選バックログ
issues/      Issue化用Markdown 142件 + 一括登録スクリプト
prompts/     エージェント用プロンプト(実装・調査・レビュー・登録)
scripts/     開発サーバ、Issue登録、構造検証
tests/       構造スモークテスト
```

ドキュメント索引: [docs/INDEX.md](docs/INDEX.md)。

## ロードマップとIssue

計画は相互補完的な2つのバックログにあり、どちらもGitHub Issuesに登録済み:

- [docs/BACKLOG.md](docs/BACKLOG.md) — 精選53件 `[KGM-001..053]`、
  マイルストーンM0–M6([docs/ROADMAP.md](docs/ROADMAP.md))。大物は
  [docs/design/](docs/design/) に設計書
- [issues/backlog/](issues/backlog/) — 細分化された実装タスク142件
  (手・指・安定化・顔・ドラム・伝送・描画)。
  [scripts/create_github_issues.py](scripts/create_github_issues.py) で登録

一括登録プロンプト:
[docs/ISSUE_REGISTRATION_PROMPT.md](docs/ISSUE_REGISTRATION_PROMPT.md) /
[issues/register-prompt.md](issues/register-prompt.md)。

## 関連プロジェクト

Kalidokit(ソルバの先行例)、OpenSeeFace/VSeeFace(パラメータ伝送の先行例)、
Inochi2D/inox2d(オープン2Dフォーマット)、moeru-ai/airi、
handcrafted-persona-engine(KGM1の想定コンシューマ)。位置づけの詳細は
ARCHITECTURE.md の比較表を参照。

## License

MIT
