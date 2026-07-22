<!-- i18n: language-switcher -->
[English](obs-setup.md) | [日本語](obs-setup.ja.md)

# OBS セットアップ

## ブラウザソース

1. トラッカーを起動し、ルームに接続します。
2. `viewer/?preset=obs&room=<room>&bg=transparent&hud=0&camera=locked`を開きます。
3. VRMファイルを読み込むか、ドロップします。
4. ビューワーのURLをOBSのブラウザソースとして追加します。

推奨ソース設定：

- 幅: 1920
- 高さ: 1080
- FPS: マシンが維持できる場合は60、それ以外は30
- 表示されていないときにソースをシャットダウン: ライブアバター使用時はオフ
- シーンがアクティブになるときにブラウザをリフレッシュ: オフ
- カスタムCSS:

```css
body { background-color: rgba(0, 0, 0, 0); margin: 0; overflow: hidden; }
```

## プリセットURL

繰り返し可能なシーンのためにクエリパラメータを使用します：

```text
viewer/?preset=obs&room=stage&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&mode=ws&room=stage&token=<token>&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&mode=wt&room=stage&token=<token>&wtUrl=https://localhost:4433&wtHash=<hex>&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&room=stage&vrm=<cors-url-to-model.vrm>&bg=transparent&hud=0&camera=locked
viewer/?preset=obs&room=stage&bg=transparent&hud=0&camera=locked&drum=1
viewer/?room=stage&scene=anime&bg=solid&bgColor=%23151221&bloom=1&vignette=1&camera=locked
```

ルームトークンはローカル/プライベートセットアップではオプションですが、`MINAMO_RELAY_TOKEN`で構成された共有リレーには必要です。

`bg=transparent`はレンダラーをアルファにクリアにし、床を隠します。`hud=0`はキャプチャされたソースからすべてのビューワーコントロールを削除します。`camera=locked`はOBSのリフレッシュ間でデフォルトの前面フレーミングを安定させます。

## シーンプリセット

ビューワーには3つのライブ切り替え可能なシーンプリセットが搭載されています：

- `scene=soft`: 中立的なソフトキーライト
- `scene=anime`: 暖かいキー、強い色のリム、ブルーム、ビネット
- `scene=flat`: PNGまたはテクスチャの強いアバター用の低コントラストのフラットライティング

`bgColor=%23rrggbb`、`bloom=0|1`、および`vignette=0|1`を使用して、完全なシーン状態をシリアライズします。ビューワーの**URLをコピー**ボタンは、現在のシーン、トランスポート、ルーム、背景、ポストFX、HUD、ドラムオーバーレイ、およびカメラ状態を1つの再現可能なURLに書き込みます。トラッカーの**OBSオーバーレイURLをコピー**ボタンは、手動で作成されたドラムオーバーレイ用に`drum=1`を含むOBS準備完了の透明なURLを出力します。
