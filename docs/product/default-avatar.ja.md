<!-- i18n: language-switcher -->
[English](default-avatar.md) | [日本語](default-avatar.ja.md)

# デフォルトアバター

ステータス: 実装済み。関連:
[../compression/asset-license-checklist.ja.md](../compression/asset-license-checklist.ja.md)、
[situation-presets.ja.md](situation-presets.ja.md)。

> English: [default-avatar.md](default-avatar.md)

## 目的

ビューアの組み込みフォールバックは、`buildBot()` で組み立てたカプセルと球の集合です。
ブレンドシェイプ・視線・頭部姿勢が届いていることを確認する診断用としては優秀ですが、
アバタートラッカーの第一印象としては不十分で、しかも新規ユーザーが最初に見るものが
これでした。

そこでビューアは、実物のヒューマノイド VRM があればそれで起動し、無ければ従来の
ボットにフォールバックするようになりました。

## モデル

| | |
| --- | --- |
| モデル | Sendagaya Shino（VRoid Studio サンプルモデル） |
| ライセンス | CC0 1.0 Universal（パブリックドメイン宣言） |
| 取得元 | `madjin/vrm-samples`、コミット `e16eb18` にピン留め |
| サイズ | 約15MB |
| リグ | VRM 0.x、両目と全指チェーンを含む 54 ヒューマノイドボーン |
| 表情 | VRM 0.x プリセット: `a i u e o`、`blink`、`blink_l`、`blink_r`、`angry`、`fun`、`joy`、`sorrow` |

ライセンスは README からの推測ではありません。モデルファイル自身の VRM メタデータが
宣言しています。

```json
{ "title": "Sendagaya Shino", "licenseName": "CC0",
  "allowedUserName": "Everyone", "commercialUssageName": "Allow",
  "violentUssageName": "Allow", "sexualUssageName": "Allow" }
```

再配布と改変の両方が許可されており、これは
[asset-license-checklist.ja.md](../compression/asset-license-checklist.ja.md)
の2つの必須ゲートです。同じ配布元の `AvatarSample_A/B/C` は
`licenseName: "Other"` を宣言しているため、意図的に**採用していません**。

フルリグであることには意味があります。指チェーンを含む54ボーンなので、手トラッキング
とアームソルバが実際に反映され、デフォルトアバターが配信者自身のモデルと同じ経路を
通ります。

表情は ARKit 52 ではなく VRM 0.x プリセットなので、Perfect Sync ではなくビューアの
フォールバック表情マップが適用されます。これは大多数の VRM で通る経路であり、
デフォルトがそこを通ることには価値があります。

## 取得方法

```sh
scripts/fetch-avatar.sh
```

`assets/avatars/default.vrm` にダウンロードし、アセットライセンスチェックリストの
手順2に従って `assets/avatars/LICENSE.txt` を隣に書き出します。

どちらもリポジトリにはコミットされません。15MB あり、我々のものではなく、新規
チェックアウトは軽いままであるべきだからです。`assets/avatars/` は gitignore され、
ビューアはファイルが無い状態を「エラー」ではなく「想定どおり」として扱います。
メッセージは出さず、単にボットのままになります。

このため GitHub Pages のデモでは VRM ではなくボットが表示されます。アセットは
リポジトリと一緒に再配布されません。

### 完全性の検証

ブランチ名ではなくコミットSHAでピン留めし、`scripts/avatar-pins.sha256` に
コミットした SHA-256 と照合します。理由は `scripts/fetch-models.sh` が MediaPipe
アセットをピン留めするのと同じで、ブランチが動いたときに出荷物が黙って変わっては
いけないからです。不一致の場合はファイルを残さず削除します。ビューアはそのパスに
あるものを読み込むので、半端に信頼できないファイルを置いたままにはできません。

モデルを意図的に変更する場合:

```sh
scripts/fetch-avatar.sh --update-pins
```

を実行し、差分をレビューしてからコミットしてください。

### デスクトップビルド

`pnpm build` は `assets/avatars/` が存在すれば `dist/` にコピーします。Tauri は
`dist/` だけを同梱するためです。このコピーは任意で、CI では取得スクリプトを実行して
いないため、存在しなくてもビルドは失敗しません。

## 上書きする

従来どおりです。ビューアに `.vrm`/`.glb` をドロップする、**Open VRM / GLB** を使う、
`?vrm=<url>` を渡す。`?vrm=` または `?inochi=` が明示されている場合、デフォルト
読み込みは行いません。

## テスト

- `pnpm test` が、取得スクリプトがブランチではなくコミットSHAをピン留めしていること、
  `scripts/avatar-pins.sha256` と照合していることを検証します。
- 手動: 取得スクリプトを実行してビューアを開き VRM で起動することを確認。
  `assets/avatars/default.vrm` を削除し、エラーメッセージなしでボット起動になることを
  確認します。
