<!-- i18n: language-switcher -->
[English](desktop-security.md) | [日本語](desktop-security.ja.md)

# Desktop (Tauri) security hardening

Tracking issue: #251. Tauri v2's 2025–2026 advisories all landed in
plugin/webview surface area, so we minimize that surface and lock down the
webview.

## Shipped

### Content-Security-Policy

`src-tauri/tauri.conf.json` previously set `"csp": null`, which disabled the
webview CSP entirely. It now ships a strict policy:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' blob:;
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
media-src 'self' blob: mediastream:;
connect-src 'self' ipc: http://ipc.localhost ws: wss: https: blob: data:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none'
```

Why each allowance exists (all are required by the bundled tracker/viewer):

- `script-src 'self' 'wasm-unsafe-eval' blob:` — ES-module scripts, MediaPipe /
  ONNX WebAssembly compilation, and the tracker's `import(blobURL)` of the
  MediaPipe bundle. No `'unsafe-inline'`: the bundled pages contain **no** inline
  `<script>` or inline event handlers. Tauri appends its own nonce for the IPC
  bootstrap script automatically when it processes this CSP.
- `worker-src blob:` — MediaPipe / ONNX web workers.
- `img-src data: blob:` and `media-src blob: mediastream:` — canvas/data-URI
  images and the `getUserMedia` camera stream.
- `connect-src … ipc: http://ipc.localhost ws: wss: https: …` — Tauri IPC, the
  WebSocket relay, WebTransport (`https:`), and the MediaPipe CDN fallback.
  Relay hosts are user-configurable, so the transport schemes must stay open.
- `style-src 'unsafe-inline'` — the pages still use inline style attributes;
  tightening this is a follow-up (hash/nonce the remaining inline styles).

> **Verification required:** CI builds the app but does not launch it, so this
> CSP must be smoke-tested in the packaged desktop app (tracker capture, viewer
> avatar load, replay) after any change. If a feature breaks, widen the specific
> directive rather than reverting to `null`.

### innerHTML sink removed

`desktop/desktop.js` built the page-status rows with an `innerHTML` template
interpolation. It now builds the two `<span>` children with `textContent`.

`viewer/drum-overlay.html` had the same pattern for drum-zone labels
(`el.innerHTML = \`<div><div>${zone.label}</div>…\``). Those labels come from a
hardcoded layout constant, so it was not exploitable — but it was the last
interpolation sink, and the invariant is only useful if it holds everywhere. It
now builds nodes and sets `textContent`. There are no remaining `innerHTML`
interpolations in the codebase.

### `withGlobalTauri` disabled

`app.withGlobalTauri` is now `false`, so the IPC bridge is no longer exposed on
the window object. The renderers import the API instead:

- `desktop/desktop.js` — `import { invoke, isTauri } from '@tauri-apps/api/core'`
- `viewer/viewer.js` — the same, plus
  `import { listen } from '@tauri-apps/api/event'` for the native-avatar bridge

Presence is detected with the official `isTauri()` helper rather than sniffing an
internals global. Outside a Tauri webview it returns false, both handles stay
null, and the existing web-preview fallbacks run unchanged — this path is
covered by the page smoke tests (#263).

`scripts/verify_structure.py` previously *required* `withGlobalTauri: true`. It
now requires `false`, requires both renderers to import from
`@tauri-apps/api/core`, and fails if either reads the bridge off the window
object again.

> **Verification required:** the IPC path itself cannot be exercised in CI,
> which builds the bundle but never launches it. Before release, smoke-test in
> the packaged app: desktop status, phone pairing, and the viewer's
> native-avatar open/read bridge.

## Planned (needs CI secrets)

### Signed auto-updater

No updater is configured. Adopt `tauri-plugin-updater`:

1. `tauri signer generate` → a minisign keypair. Commit the **public** key to
   `tauri.conf.json` (`plugins.updater.pubkey`); store the **private** key and
   its password only in CI secrets (`TAURI_SIGNING_PRIVATE_KEY`,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) — never in the repo.
2. Enable `createUpdaterArtifacts` in the bundle config and publish the signed
   `latest.json` + artifacts to GitHub Releases from CI.
3. Point `plugins.updater.endpoints` at the release `latest.json`.

### OS code signing

Distributables are currently unsigned.

- **macOS:** Developer ID Application certificate + `codesign`, then
  `notarytool` notarization and stapling. Configure
  `bundle.macOS.signingIdentity` and the notarization credentials via CI env.
- **Windows:** Authenticode signing (`bundle.windows.certificateThumbprint` or a
  signing service) so SmartScreen trusts the installer.

## Reference

- https://v2.tauri.app/security/
- https://v2.tauri.app/plugin/updater/
