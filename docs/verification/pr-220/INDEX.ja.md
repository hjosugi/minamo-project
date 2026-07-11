<!-- i18n: language-switcher -->
[English](INDEX.md) | [日本語](INDEX.ja.md)

# PR #220 証拠インデックス

ステータス値は、修正された実行がリンクされるまで `PENDING` のままです。必要な証拠が保留中、ブロック中、または失敗している間は、親の問題はオープンのままでなければなりません。

| 問題 | エリア | 提案されたアーティファクトパス | ステータス | 証拠 |
| --- | --- | --- | --- | --- |
| #222 | ONNX/WebGPU バックエンド | `webgpu/` | PENDING | — |
| #223 | 圧縮アバターデコーダー | `avatar-pack/decoders/` | PENDING | — |
| #224 | ライセンス付きアバター回帰 | `avatar-pack/13-pose/` | PENDING | — |
| #225 | 二重ソースビューワー | `multi-tracker/` | PENDING | — |
| #226 | QRペアリングUI | `iphone/qr-ui/` | PENDING | — |
| #227 | セキュアWSS/WT交渉 | `iphone/transports/` | BLOCKED | [自動スコープとブラウザブロッカー](runs/2026-07-11T003156Z/RESULT-227.md) |
| #228 | 実際のiPhoneタイミング | `iphone/timing/` | PENDING | — |
| #229 | Inochi2Dランタイム | `inochi2d/runtime/` | PASS | [ランタイム結果](runs/2026-07-11T020516Z/RESULT-229.md) |
| #230 | 実際のInochi2Dパペット | `inochi2d/puppet/` | PENDING | — |
| #231 | Windows仮想カメラ | `virtual-camera/windows/` | PENDING | — |
| #232 | Linux仮想カメラ | `virtual-camera/linux/` | PENDING | — |
| #233 | macOS仮想カメラ | `virtual-camera/macos/` | PENDING | — |
| #234 | ドラムベンチマークランナー | `drum/runner/` | PASS | [ランナー結果](runs/2026-07-11T003156Z/RESULT-234.md), [修正されたレポート](runs/2026-07-11T003156Z/DRUM-REPORT.md) |
| #235 | 実際のドラムとOBS | `drum/hardware/` | PENDING | — |
| #236 | 研究レビュー | `research-review/` | PASS | [#183](research-review/183.md), [#184](research-review/184.md), [#185](research-review/185.md) |
| #237 | ロックファイル/テンプレート | `release/` | PASS | [クリーンリリース実行](runs/2026-07-10T133213Z/RESULT.md), [テンプレートのみのサンプル](sample/RESULT.md) |