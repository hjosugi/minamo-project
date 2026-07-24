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
interpolation — the only such sink in the codebase. It now builds the two
`<span>` children with `textContent`, so status strings can never inject markup.

## Planned (needs the packaged app and/or CI secrets)

### Drop `withGlobalTauri`

`app.withGlobalTauri` is still `true`. It exposes the full IPC bridge on
`window.__TAURI__`, widening the blast radius of any injected content. Dropping
it is a coordinated change that must be verified in the running app:

1. Add `@tauri-apps/api` as a dependency.
2. `desktop/desktop.js`: replace `window.__TAURI__?.core?.invoke` with
   `import { invoke } from '@tauri-apps/api/core'`, gated on Tauri presence so
   the web preview still falls back:
   `const isTauri = '__TAURI_INTERNALS__' in window;`
3. `viewer/viewer.js`: same for `core.invoke` **and** `event.listen`
   (`import { listen } from '@tauri-apps/api/event'`).
4. Set `withGlobalTauri: false` and update the `scripts/verify_structure.py`
   assertion that currently *requires* it to be `true`.
5. Smoke-test desktop status, phone pairing, and the native-avatar bridge in the
   packaged app — `__TAURI_INTERNALS__` is injected by Tauri v2 regardless of
   `withGlobalTauri`, but this must be confirmed at runtime.

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
