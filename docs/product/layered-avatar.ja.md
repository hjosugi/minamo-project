<!-- i18n: language-switcher -->
[English](layered-avatar.md) | [日本語](layered-avatar.ja.md)

# レイヤー付きアバターモード

レイヤー付きアバターモードは、ノーリグの PNGTuber パスです。PSD ファイルまたは複数の PNG ファイルをビューワーにドロップします。ビューワーはレイヤーを名前で分類し、KGM1 フェイスウェイトからまばたきと口のレイヤーを切り替え、頭に基づくパララックスを適用します。

## レイヤー名

PSD レイヤーまたは PNG ファイル名にこれらの名前を使用してください：

- `body`, `base`, `head`, `face`: ニュートラルなベースレイヤー
- `eyes open`, `eyes`: まばたきが低いときに表示
- `eyes closed`, `blink`, `wink`: まばたきが高いときに表示
- `mouth closed`, `mouth`: 顎/口がニュートラルなときに表示
- `mouth open`, `jaw open`, `aa`: 顎/口が開くときに表示
- `brow`, `eyebrow`: 常に表示される表情のアクセント
- `back`, `shadow`, `hair back`: ネガティブパララックスの深さ
- `front`, `overlay`, `hair front`: ポジティブパララックスの深さ

## マニフェスト

生成されたマニフェストは
[`minamo.layered-avatar.v1`](layered-avatar.schema.json) を使用します：

```json
{
  "schema": "minamo.layered-avatar.v1",
  "parallaxPx": 18,
  "layers": [
    { "name": "body.png", "slot": "body", "depth": 0 },
    { "name": "eyes closed.png", "slot": "eyesClosed", "depth": 0.2 },
    { "name": "mouth open.png", "slot": "mouthOpen", "depth": 0.24 }
  ]
}
```

深さは `[-1, 1]` に制限されています。ポジティブな深さは頭に合わせてより多く動き、ネガティブな深さはそれに逆らって動きます。ビューワーはクリエイターがアセットを再構築することなく量を調整できるように、パララックスコントロールを公開しています。
