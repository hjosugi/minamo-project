<!-- i18n: language-switcher -->
[English](webgpu-renderer-migration.md) | [日本語](webgpu-renderer-migration.ja.md)

# 調査: three.js WebGPURenderer + MToonNodeMaterial への移行

ステータス: issue #276 の調査パス。インストール済みパッケージに対して移行範囲を実測した。関連: #223, #224,
[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md)。

## Goal

viewer を `WebGLRenderer` から `WebGPURenderer` + `MToonNodeMaterial` へ移行すべきかを判断し、着手前に実際のコストを確定させる。

## Acceptance criteria

- [x] Goal が明確である。
- [x] Acceptance criteria が明確である。
- [x] 既存設計と矛盾しない: 本書ではレンダラを変更しない。WebGL がデフォルトのまま。
- [x] *固定済み* バージョンの対応状況を、リリースノートではなく `node_modules` で確認した。
- [x] 移行範囲を `viewer/viewer.js` から列挙した。
- [x] #276 が「どちらの結論でも」求めるバージョン組み合わせ規則を文書化した。
- [ ] `?renderer=webgpu` の背後でのプロトタイプ。**未実施** — 「順序」参照。
- [ ] 13ポーズグリッドでの視覚回帰、およびローエンド機での fps/GPU メモリ計測。**未実施** — アセットとハードウェアに依存し、#224 と同じゲート。

## Findings

### 固定済みバージョンで既に対応済み — アップグレードは不要

リリースノートではなく `node_modules` で確認:

- `three@0.185.1` は `build/three.webgpu.js` (および `three.webgpu.nodes.js`、`three.tsl.js`) を同梱しており、固定済みバージョンで `WebGPURenderer` が利用可能である。
- `@pixiv/three-vrm@3.5.5` は `./nodes` をエクスポートし、`lib/nodes/index.module.js` に `MToonNodeMaterial` を含む。`peerDependencies` は `three: >=0.137`。

明記する価値がある点: **`MToonNodeMaterial` はパッケージのメインエントリには存在しない。** トップレベルのビルドのみを検索すると何も見つからず、「非対応」と読めてしまう。実体は `@pixiv/three-vrm/nodes` サブエクスポートの背後にある。本パスも当初まさにそれで誤った結論を出した。

したがって #276 の前提は成立し、バージョン更新は不要である。記録を求められている組み合わせ規則は *将来の* 更新に対して依然重要であり、[../DEPENDENCY_POLICY.md](../DEPENDENCY_POLICY.md) に記載した。

### 移行範囲は3項目であり、マテリアルが最も小さい

`viewer/viewer.js` から列挙:

1. **レンダラ構築と非同期初期化。** `new THREE.WebGLRenderer({antialias, alpha})` は `three/webgpu` からインポートする `WebGPURenderer` になり、**`WebGPURenderer` の初期化は非同期である。** 現在レンダラはモジュールスコープ (`viewer.js:158`) で構築され、直後の行で即座に使われている — `container.appendChild(renderer.domElement)` と `createVrmLoader(renderer)`。
2. **ポストプロセッシング。** `three/addons/postprocessing/*` の `EffectComposer` + `RenderPass` + `UnrealBloomPass` は WebGL 用スタックであり、WebGPU ではノード/TSL の `PostProcessing` 経路と bloom ノードを使う。**ここが作業の大部分である。**
3. **マテリアル配線。** `viewer/avatar-loader.js` が `VRMLoaderPlugin(parser)` を登録し、レンダラ (型は `import('three').WebGLRenderer`) を受け取る。ノード経路では MToon ノードマテリアルをプラグイン経由で選択する必要があり、正確なオプションは推測ではなく `./nodes` エクスポートに対して確認すること。

#276 は `MToonNodeMaterial` を前面に置いているが、それは項目3であり3つの中で最も狭い — ローダプラグインが既にマテリアル構築を抽象化している。実際の移植工数はポストプロセッシング連鎖にある。

### 回帰対象は #276 の想定より小さい

#276 は視覚回帰の対象として「MToon アウトライン、透過/OBS アルファ、bloom/vignette」を挙げている。**vignette は DOM 要素であり** (`viewer.js:196` の `$('sceneVignette')`)、シェーダパスではない。canvas 上の CSS であり、レンダラに完全に非依存である。viewer における GPU ポストプロセッシング効果は bloom のみである。

したがって実際にリスクがあるのは3つ: MToon アウトライン (ノードマテリアル)、OBS キャプチャ用の `alpha: true` 透過、bloom。4つではなく3つで、うち1つは単一パスである。

### 真のリスクは、前科のあるファイルでのモジュールスコープ非同期初期化

`WebGPURenderer.init()` は非同期であり、構築の次の行でレンダラを使うことはできない。`viewer.js` ではレンダラがモジュールスコープで構築され直後に消費されるため、移行はモジュールロード順序の再構成を要する。

このリポジトリは既にまさにその形のバグを出荷している: `landing/app.js` は v0.1.11/v0.1.12 で temporal dead zone の `ReferenceError` を出荷し (#302 で修正)、それが `tests/helpers/dom-stub.mjs` がページのエントリモジュールを実際にロードしてモジュールスコープで throw しないことを証明するために存在する理由である。WebGPU 移行はその種のバグに真正面から戻ることになり、dom-stub テストが最も検出しやすい。よってプロトタイプはブラウザだけでなくスタブ下でも viewer がロード可能な状態を保つべきである。

## Decision

**WebGL をデフォルトのまま維持する。`?renderer=webgpu` の背後でのプロトタイプは正しい次の一手だが、#223 の後に順序づける。**

理由:

1. **順序。** #223 は KTX2・Meshopt・Draco デコーダを viewer に配線する。これらはレンダラと GLTF ローダに接続する — WebGPU 移行が置き換えるのと同じ2つのオブジェクトである。同時に行えば、同一の継ぎ目に対する2つの変更を同時にデバッグすることになる。#223 が先、次にレンダラ。
2. **#224 が保有する証拠なしにデフォルトは切り替えられない。** 切り替えには13ポーズの視覚回帰が必要で、それにはライセンス済み VRM と実 GPU が必要である。いずれも #224 が既に記録しているとおりゲートされており、本パスで下せる判断ではない。
3. **期限切れになるものはない。** WebGLRenderer は削除ではなくメンテナンスモードであり、`WebGPURenderer` は WebGL2 フォールバックを持つ。したがって後の移行が早期の移行より高くつくことはなく、デコーダ作業と絡まずに済む。

述べられている利点 — ONNX WebGPU pose バックエンド (#222) のための GPU 余力確保 — は実在するが現時点では到達不能である: #222 自体が `onnxruntime-web` のサプライチェーンレビューにブロックされており、レンダラと GPU を奪い合う ONNX バックエンドがまだ存在しない。この論拠は #222 が動いたときに有効になる。

## 順序

1. #223 — デコーダ (レンダラ選択に非依存)
2. `?renderer=webgpu` プロトタイプ。`tests/helpers/dom-stub.mjs` 下でロード可能な状態を維持する
3. #224 の13ポーズ回帰 (ライセンス済み VRM が揃い次第)
4. その証拠に基づくデフォルト切り替えの判断

## Sources

- インストール済み `three@0.185.1` (`build/three.webgpu.js`) および `@pixiv/three-vrm@3.5.5` (`lib/nodes/index.module.js`、`./nodes` エクスポート)
- three.js WebGPURenderer — <https://threejs.org/docs/pages/WebGPURenderer.html>
- @pixiv/three-vrm — <https://github.com/pixiv/three-vrm>
