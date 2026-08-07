<!-- i18n: language-switcher -->
[English](situation-presets.md) | [日本語](situation-presets.ja.md)

# シチュエーションプリセット

ステータス: 実装済み。関連: [obs-integration.ja.md](obs-integration.ja.md)、
[default-avatar.ja.md](default-avatar.ja.md)、[drummer-setup.ja.md](drummer-setup.ja.md)。

> English: [situation-presets.md](situation-presets.md)

Minamo は1つのシチュエーションを中心に育ってきました。ドラム演奏には専用の設定
パネル・オーバーレイ・ベンチマーク・OBS URLボタンがある一方で、雑談配信には素の
チェックボックスしかありませんでした。シチュエーションは第一級のデータになり、
選ぶだけでトラッカーとビューアの両方が設定し直されます。

定義は `shared/situation-presets.js`、スキーマキーは `minamo.situation-preset.v1` です。

## 5つのシチュエーション

| id | シチュエーション | トラッキング | ビューア |
| --- | --- | --- | --- |
| `talk` | 雑談 | ポーズ・顔ロック・音声リップシンク／手なし／720p60／なめらか | soft key・透過 |
| `game` | ゲーム配信 | 顔のみ／480p30／バランス | anime rim・ビネットなし・透過 |
| `sing` | 歌枠 | ポーズ＋手・立ち姿勢／720p60／応答重視 | anime rim・ブルーム・透過 |
| `collab` | コラボ | ポーズ・手なし／720p30／バランス | soft key・透過 |
| `drum` | ドラム演奏 | ポーズ＋手＋ドラマーモード／720p60／応答重視 | soft key・キットオーバーレイ・透過 |

それぞれの設計理由:

- **talk** は手を意図的に切っています。座りのバストアップでは手が頻繁に画面外へ
  出るため、手が出たり消えたりするアバターは、手がないアバターより不自然に見えます。
- **game** は最小構成です。480p30・顔のみで、ポーズも手もモデルを読み込みません。
  マシンの余力はゲームに渡します。
- **sing** は `responsive` フィルタです。雑談で心地よいスムージングは、口が拍に
  乗るべき場面では遅延として見えてしまいます。
- **collab** は負荷が参加人数分かかるため、30fps・手なしに落とします。
- **drum** は従来の挙動そのままで、5つのうちの1つになりました。

## 変えるもの・変えないもの

変えるもの: ポーズ、手、音声リップシンク、顔ロック、ドラマーモード、姿勢モード、
解像度、fps、faceグループのスムージング、そしてビューアのライティングプリセット・
透過・アームソルバ・ブルーム・ビネット・ドラムオーバーレイ。

変えないもの: トランスポートモード、ルーム、トークン、カメラデバイス、
キャリブレーションプロファイル、プライバシーモード、face以外のグループの
スムージング、ビューアの背景色。これらは「今日なにをするか」ではなく
マシンとルームに属する設定です。シチュエーション切り替えでモーションの送り先が
黙って変わってはいけません。

切り替えはチェックボックスだけでなく動作中のパイプラインまで届きます。ポーズと手の
モデルは必要になった時点で読み込まれ、音声リップシンクはマイクストリームを開始・
停止し、カメラは解像度かfpsが実際に変わったときだけ再起動します。

## 使い方

トラッカー: 設定パネルの **シチュエーション**。ドラマー設定パネルは `drum` の
ときだけ表示されます。このパネルが常時表示されていたことが、アプリがドラム専用に
見えていた最大の理由でした。

ビューア: **シチュエーション** 欄、または URL の `?situation=<id>`。個別パラメータ
が優先されるため、`?situation=game&bloom=1` は「ゲームプリセット＋ブルーム強制ON」に
なります。ビューアの **Copy URL** はシチュエーションもURLに書き出します。

## スキーマ

```js
{
  id: 'talk',
  labelKey: 'situation.talk.label',
  descriptionKey: 'situation.talk.description',
  tracking: { pose, hands, audioLipsync, faceLock, drummerMode, bodyMode, filterPreset, resolution, fps },
  viewer: { scenePreset, transparent, armSolver, drumOverlay, bloom, vignette },
  obs: { sceneNameKey, sources: [{ id, kind, owner, hintKey, bounds? }] },
}
```

`obs.sources` の各要素は `owner` を持ちます。Minamo が作るのは
`owner: 'minamo'` のソースだけで、残りは
[obs-integration.ja.md](obs-integration.ja.md) で説明する OBS への受け渡しです。

## テスト

- `pnpm test` がプリセットの解決とフォールバック、各シチュエーションが文書どおりの
  トラッカー/ビューア設定を生成すること、切り替えでトランスポート・カメラ設定が
  保持されること、`situationObsPlan` が 1080p 以外のキャンバスに座標をスケールする
  ことを検証します。
- 手動: トラッキング中にシチュエーションを切り替え、解像度が変わる `game` のときだけ
  カメラが再起動すること、ドラマー設定が `drum` のときだけ現れることを確認します。
