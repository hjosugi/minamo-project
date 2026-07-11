<!-- i18n: language-switcher -->
[English](avatar-integrations.md) | [日本語](avatar-integrations.ja.md)

# アバター統合

## 1. VRM

3DヒューマノイドアバターにはVRMを使用します。

マッピングターゲット：

- 頭の回転
- 目の注視
- 左/右のまばたき
- 口の母音
- 表情プリセット
- 手の骨と指のカール

プリセットプロファイルは、[../product/avatar-preset-profile.schema.json](../product/avatar-preset-profile.schema.json) に文書化された `minamo.avatar-preset.v1` スキーマを使用します。
ランタイムターゲット名は意図的に明示的です：

- `expression:aa`, `expression:blinkLeft`, `expression:happy`
- `lookAt:yaw`, `lookAt:pitch`
- `finger:Right:index:proximal`, `finger:Left:thumb:spread`

## 2. Live2D

2DキャラクターストリーミングにはLive2Dを使用します。

マッピングターゲット：

- ParamAngleX/Y/Z
- ParamEyeLOpen / ParamEyeROpen
- ParamMouthOpenY
- ParamMouthForm
- 体の揺れ
- リグされた際の手/指のカスタムパラメータ

## 3. Inochi2D / Inox2D

`.inp` または `.inx` のパペットをビューワーにドロップするか、**Open INP / INX** を使用します。
ビューワーは、ピン留めされたInox2D WebGL2/WASMバックエンドをローカルで実行し、その透明なキャンバスを既存のThree.jsシーンに合成します。パペットデータやトラッキングデータはアップロードされません。

マッピングエディタは、パペットから発見されたパラメータをリストし、正規化された名前エイリアスから保守的な頭、まばたき、口のデフォルトを生成します。
一致しない名前はマッピングされず、JSONをライブで編集して、VRMで使用されるのと同じ `minamo.expression-map.v1` 形式で保存します。`.inp` と `.inx` は同じランタイムパーサーを使用します。BC7テクスチャはピン留めされた上流レンダラーではサポートされていないため、影響を受けるパペットをPNGまたはTGAテクスチャで再エクスポートしてください。

## 4. レイヤー付きPNG / PSD

レイヤー付きPNG/PSDモードは、ゼロリグのフォールバックです。 [../product/layered-avatar.md](../product/layered-avatar.md) の命名規則を使用して、PSDまたはPNGセットをビューワーにドロップします。
まばたきの重みは `eyesOpen`/`eyesClosed` を切り替え、顎と丸い口の重みは `mouthClosed`/`mouthOpen` を切り替え、頭のポーズはレイヤーごとの視差深度を駆動します。

## 5. リグ制限とカスタムマッピング

すべてのプリセットは、ターゲットごとに安全でないリグの動きを制限でき、生成されたターゲットをクリエイターリグが期待するカスタムターゲットにマッピングできます。

```json
{
  "schema": "minamo.avatar-preset.v1",
  "name": "streaming rig",
  "format": "vrm",
  "rigLimits": {
    "lookAt:yaw": { "min": -0.25, "max": 0.25 },
    "ParamCustomSmile": { "min": 0, "max": 0.5 }
  },
  "mappings": [
    {
      "source": "expression:happy",
      "target": "ParamCustomSmile",
      "weight": 0.8,
      "curve": "linear"
    }
  ]
}
```

表情のリターゲティングは、共有可能な [`minamo.expression-map.v1`](../product/expression-mapping.schema.json) 形式を使用します。
Perfect Sync VRMは、少なくとも45のARKit表情名が存在する場合に自動検出され、ビューワーは一致する表情を1:1で駆動します。他のリグは、ライブで編集可能な重み付きソースチャネルマッピングを使用し、JSONとしてエクスポートできます。

## 6. OBS

OBSパス：

- ローカルWebアプリ用のブラウザソース
- 透明な背景モード
- Spout/NDIの将来
- キャリブレーションとリセット用のホットキー

## 7. AIキャラクターエンジン

AIRI/ペルソナエンジンのようなプロジェクトは、以下を消費できます：

- 表情状態
- 発話状態
- 視線状態
- ジェスチャー状態
- ドラムヒットイベント

優先ルールなしでLLMの感情生成と生の顔トラッキングを混合しないでください。ユーザーの表情は、デフォルトで生成された感情よりも優先されるべきです。