const RUNTIME_KEYS = Object.freeze({
  tauri: 'desktop.runtime.tauri',
});

const PAGE_KEYS = Object.freeze({
  tracker: 'desktop.ui.btn.tracker',
  viewer: 'desktop.ui.btn.viewer',
  replay: 'desktop.ui.btn.replay',
});

const OS_KEYS = Object.freeze({
  linux: 'desktop.runtime.os.linux',
  windows: 'desktop.runtime.os.windows',
  macos: 'desktop.runtime.os.macos',
  other: 'desktop.runtime.os.other',
});

const BACKEND_KEYS = Object.freeze({
  v4l2loopback: 'desktop.runtime.backend.v4l2loopback',
  'media-foundation-softcam': 'desktop.runtime.backend.mediaFoundation',
  'core-media-io-camera-extension': 'desktop.runtime.backend.coreMediaIo',
  unsupported: 'desktop.runtime.backend.unsupported',
});

const DEVICE_KEYS = Object.freeze({
  'not-found': 'desktop.runtime.device.notFound',
  'not-installed': 'desktop.runtime.device.notInstalled',
  'not-available': 'desktop.runtime.device.notAvailable',
});

const STATE_KEYS = Object.freeze({
  'driver-loaded': 'desktop.runtime.state.driverLoaded',
  'driver-not-loaded': 'desktop.runtime.state.driverNotLoaded',
  'backend-not-installed': 'desktop.runtime.state.backendNotInstalled',
  'extension-not-installed': 'desktop.runtime.state.extensionNotInstalled',
  unavailable: 'desktop.runtime.state.unavailable',
});

/**
 * Translate a stable code from the Tauri payload while preserving unknown
 * future values as diagnostics instead of hiding them.
 *
 * @param {(key: string) => string} t
 * @param {Readonly<Record<string, string>>} keys
 * @param {unknown} value
 */
function translateCode(t, keys, value) {
  const code = typeof value === 'string' ? value : '';
  return keys[code] ? t(keys[code]) : code;
}

/**
 * Convert the stable, language-neutral `desktop_status` payload into display
 * strings. Keeping this at the UI boundary lets a language toggle render the
 * same native status again without another Tauri command (#307).
 *
 * @param {{
 *   runtime?: string,
 *   pages?: Array<{name?: string, route?: string, bundled?: boolean}>,
 *   virtualCamera?: {
 *     os?: string,
 *     backend?: string,
 *     device?: string | null,
 *     deviceStatus?: string,
 *     state?: string,
 *     tone?: string,
 *   },
 * }} status
 * @param {(key: string) => string} t
 */
export function localizeDesktopStatus(status, t) {
  const camera = status?.virtualCamera ?? {};
  return {
    ...status,
    runtime: translateCode(t, RUNTIME_KEYS, status?.runtime),
    pages: (status?.pages ?? []).map((page) => ({
      ...page,
      name: translateCode(t, PAGE_KEYS, page.name),
    })),
    virtualCamera: {
      ...camera,
      os: translateCode(t, OS_KEYS, camera.os),
      backend: translateCode(t, BACKEND_KEYS, camera.backend),
      device: camera.device || translateCode(t, DEVICE_KEYS, camera.deviceStatus),
      state: translateCode(t, STATE_KEYS, camera.state),
    },
  };
}
