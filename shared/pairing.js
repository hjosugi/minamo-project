// Phone-as-tracker pairing helpers (issue #51 / KGM-051).
//
// The desktop viewer/landing page shows a QR code that opens the browser
// tracker on a phone. These helpers build and parse that URL per the contract
// in docs/product/phone-tracker.md, and pick a safe default transport for
// browsers (iOS Safari) that lack a stable WebTransport path.

export const PHONE_TRACKER_DEFAULT_BASE = '/tracker/';
export const PAIRING_TOKEN_DEFAULT_TTL_SECONDS = 5 * 60;
export const PAIRING_TOKEN_MIN_TTL_SECONDS = 30;
export const PAIRING_TOKEN_MAX_TTL_SECONDS = 15 * 60;

const PAIRING_ROOM_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

// options: { base, mode, room, token, wsUrl, wtUrl, wtHash, resolution, fps, mirror, camera }
export function buildPhoneTrackerUrl(options = {}) {
  const base = options.base || PHONE_TRACKER_DEFAULT_BASE;
  const params = new URLSearchParams();
  params.set('mode', options.mode || 'ws');
  if (options.room) params.set('room', String(options.room));
  if (options.token) params.set('token', String(options.token));
  if (options.wsUrl) params.set('wsUrl', String(options.wsUrl));
  if (options.wtUrl) params.set('wtUrl', String(options.wtUrl));
  if (options.wtHash) params.set('wtHash', String(options.wtHash));
  if (options.resolution) params.set('resolution', String(options.resolution));
  if (options.fps) params.set('fps', String(options.fps));
  if (options.mirror !== undefined) params.set('mirror', options.mirror ? '1' : '0');
  params.set('camera', options.camera || 'user');
  return appendQuery(base, params);
}

export function parsePhoneTrackerUrl(url) {
  const text = String(url);
  const queryStart = text.indexOf('?');
  const hashStart = text.indexOf('#', queryStart);
  const query = queryStart === -1 ? '' : text.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const params = new URLSearchParams(query);
  const out = {};
  for (const [key, value] of params.entries()) {
    if (key === 'mirror') out.mirror = value === '1';
    else if (key === 'fps') out.fps = Number(value);
    else out[key] = value;
  }
  return out;
}

export function buildViewerPairingUrl(options = {}) {
  const base = options.base || '/viewer/';
  const params = new URLSearchParams();
  params.set('mode', options.mode || 'ws');
  if (options.room) params.set('room', String(options.room));
  if (options.token) params.set('token', String(options.token));
  if (options.wsUrl) params.set('wsUrl', String(options.wsUrl));
  if (options.wtUrl) params.set('wtUrl', String(options.wtUrl));
  if (options.wtHash) params.set('wtHash', String(options.wtHash));
  return appendQuery(base, params);
}

export function parsePairingRoom(value) {
  const room = String(value || '').trim();
  if (!PAIRING_ROOM_PATTERN.test(room)) {
    throw new Error('Room must be 1-64 letters, numbers, dots, underscores, or hyphens.');
  }
  return room;
}

export function normalizePairingTtlSeconds(value) {
  const ttl = Number(value);
  if (!Number.isFinite(ttl)) return PAIRING_TOKEN_DEFAULT_TTL_SECONDS;
  return Math.max(PAIRING_TOKEN_MIN_TTL_SECONDS, Math.min(PAIRING_TOKEN_MAX_TTL_SECONDS, Math.round(ttl)));
}

export function pairingTokenState(expiresAt, nowMs = Date.now()) {
  const expiresAtMs = Number(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return { state: 'missing', expiresAt: null, remainingMs: 0 };
  }
  const remainingMs = Math.max(0, expiresAtMs - Number(nowMs));
  return {
    state: remainingMs > 0 ? 'active' : 'expired',
    expiresAt: expiresAtMs,
    remainingMs,
  };
}

export function pairingTokenApiUrl(relayUrl) {
  const url = new URL(String(relayUrl));
  if (url.protocol === 'ws:') url.protocol = 'http:';
  else if (url.protocol === 'wss:') url.protocol = 'https:';
  else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Relay URL must use ws:// or wss://.');
  }
  url.pathname = '/api/pairing-tokens';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function redactPairingUrl(value, replacement = 'REDACTED') {
  const text = String(value || '');
  if (!text) return text;
  try {
    const relative = /^[/?#]/.test(text);
    const url = new URL(text, 'https://minamo.invalid');
    if (url.searchParams.has('token')) url.searchParams.set('token', replacement);
    const output = url.toString();
    return relative ? output.replace('https://minamo.invalid', '') : output;
  } catch {
    return text.replace(/([?&]token=)[^&#]*/gi, `$1${encodeURIComponent(replacement)}`);
  }
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

function appendQuery(base, params) {
  const text = String(base);
  const hashIndex = text.indexOf('#');
  const beforeHash = hashIndex === -1 ? text : text.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : text.slice(hashIndex);
  const separator = beforeHash.includes('?') ? (/[?&]$/.test(beforeHash) ? '' : '&') : '?';
  return `${beforeHash}${separator}${params.toString()}${hash}`;
}
