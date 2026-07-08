// Phone-as-tracker pairing helpers (issue #51 / KGM-051).
//
// The desktop viewer/landing page shows a QR code that opens the browser
// tracker on a phone. These helpers build and parse that URL per the contract
// in docs/product/phone-tracker.md, and pick a safe default transport for
// browsers (iOS Safari) that lack a stable WebTransport path.

export const PHONE_TRACKER_DEFAULT_BASE = '/tracker/';

// options: { base, mode, room, token, wtUrl, wtHash, resolution, fps, mirror, camera }
export function buildPhoneTrackerUrl(options = {}) {
  const base = options.base || PHONE_TRACKER_DEFAULT_BASE;
  const params = new URLSearchParams();
  params.set('mode', options.mode || 'ws');
  if (options.room) params.set('room', String(options.room));
  if (options.token) params.set('token', String(options.token));
  if (options.wtUrl) params.set('wtUrl', String(options.wtUrl));
  if (options.wtHash) params.set('wtHash', String(options.wtHash));
  if (options.resolution) params.set('resolution', String(options.resolution));
  if (options.fps) params.set('fps', String(options.fps));
  if (options.mirror !== undefined) params.set('mirror', options.mirror ? '1' : '0');
  params.set('camera', options.camera || 'user');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${params.toString()}`;
}

export function parsePhoneTrackerUrl(url) {
  const query = String(url).split('?')[1] || '';
  const params = new URLSearchParams(query);
  const out = {};
  for (const [key, value] of params.entries()) {
    if (key === 'mirror') out.mirror = value === '1';
    else if (key === 'fps') out.fps = Number(value);
    else out[key] = value;
  }
  return out;
}

// iOS Safari has no stable WebTransport path, so pair over WebSocket there even
// when a WebTransport room is available. Returns 'ws' or 'wt'.
export function recommendPhoneTransport(userAgent = '', hasWebTransportRoom = false) {
  const ua = String(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg/i.test(ua);
  if (isIos || isSafari) return 'ws';
  return hasWebTransportRoom ? 'wt' : 'ws';
}
