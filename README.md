# KAGAMI

普通のwebcamひとつで、誰でも無料・低遅延でアバターを動かすためのトラッキングシステム。

- 推論はすべてブラウザ内(MediaPipe Face Landmarker, GPU/WASM)。カメラ映像は端末から出ない
- ネットワークに流れるのは動きのパラメータだけ: 1フレーム約76バイト(映像比 約1/400)
- 表情52ch + 頭部姿勢 + 上半身(実験的)。One Euroフィルタで平滑化
- 配送は3段構え: BroadcastChannel(サーバ不要) / WebSocket(互換) / WebTransportデータグラム(最低遅延, Rust)
- ビューアはVRM(three-vrm)対応。VRMが無くても内蔵ボットで即動作。2D(Inochi2D)は設計済み

詳細: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) / プロトコル仕様: [docs/PROTOCOL.md](docs/PROTOCOL.md)

## クイックスタート

### 1. サーバ不要(local モード)

```sh
./scripts/dev.sh            # ただの静的配信 (python3 -m http.server 8000)
```

1. http://localhost:8000/tracker/ を開き **Start tracking**
2. mode: local のまま **Connect**
3. 「ビューアを別タブで開く」→ 同一ブラウザ内でBroadcastChannel経由で動く
4. ビューアに `.vrm` をドロップすると自分のアバターに差し替わる

### 2. WebSocketリレー(別マシンのビューアへ)

```sh
cd relay-node && npm install && npm start   # http://localhost:8787 で配信+中継
```

tracker / viewer 双方で mode: ws、同じ room 名で Connect。

### 3. WebTransportリレー(最低遅延)

```sh
cd relay-rs && cargo run --release
```

起動ログの `cert sha-256` を tracker / viewer の cert 欄に貼り、mode: wt で
Connect。証明書は自己署名(14日制限)なので再起動で再生成する。
※ relay-rs はAPIドキュメント(wtransport 0.7)に沿って書かれているが、この
zipの作成環境にはRustツールチェーンが無くコンパイル未検証。CI整備はKGM-009。

## リポジトリ構成

```
tracker/     webcam → 52ch表情+頭部姿勢 → KGM1送出(パブリッシャ)
viewer/      KGM1受信 → VRM / 内蔵ボット描画(OBSブラウザソース向け)
shared/      正準ブレンドシェイプ定義・One Euro・KGM1コーデック・トランスポート
relay-node/  静的配信 + WebSocket中継(Node, 依存はwsのみ)
relay-rs/    WebTransportデータグラム中継(Rust / wtransport)
docs/        ARCHITECTURE, PROTOCOL, ROADMAP, BACKLOG(53件), design/(設計書8本)
```

## 開発ロードマップ

53件のissue化可能なバックログを [docs/BACKLOG.md](docs/BACKLOG.md) に、
未実装の大物は設計書として [docs/design/](docs/design/) に置いてある:

- DD-001 手トラッキング / DD-002 全身(YOLO系, ONNX Runtime Web + WebGPU)
- DD-003 音声リップシンク融合 / DD-004 Inochi2D(inox2d WASM)2Dバックエンド
- DD-005 Elixirクラスタリレー(大規模fan-out) / DD-006 KGM2(delta+keyframe圧縮)
- DD-007 録画・リプレイ(.kgm) / DD-008 キャリブレーションとリターゲティング

GitHub Issuesへの一括登録は [docs/ISSUE_REGISTRATION_PROMPT.md](docs/ISSUE_REGISTRATION_PROMPT.md)
のプロンプトをClaude Code等に貼るだけ。

## 関連プロジェクト

Kalidokit(ソルバの先行例)、OpenSeeFace/VSeeFace(パラメータ伝送の先行例)、
Inochi2D/inox2d(オープン2Dフォーマット)、moeru-ai/airi、
handcrafted-persona-engine(KGM1の想定コンシューマ)。位置づけの詳細は
ARCHITECTURE.md の比較表を参照。

## License

0BSD. You can use, copy, modify, and distribute this project for almost any purpose.


MIT
