<!-- i18n: language-switcher -->
[English](ENVIRONMENT.md) | [日本語](ENVIRONMENT.ja.md)

# Inochi2D ランタイム環境

- 日付 (UTC): `2026-07-11`
- OS: Linux x86_64, カーネル `7.1.2-3-cachyos`
- ブラウザ: Google Chrome `150.0.7871.114`, ヘッドレスで WebGL2/SwiftShader 使用
- Node.js: `v26.4.0`
- pnpm: `11.0.0`
- WASM ビルドに使用された Rust ツールチェーン: `1.96.0`
- wasm-bindgen CLI: `0.2.126`
- Inochi2D リビジョン: `df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba`
- ランタイムスモーク中のネットワーク: localhost の静的サービングのみ

プロダクション `dist/` 出力は localhost から提供されました。Chrome は
チェックインされた/生成された WASM アセットを読み込みました; CDN からレンダラーコードは読み込まれませんでした。
