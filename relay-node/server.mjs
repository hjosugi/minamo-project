// Minamo relay (Node).
// One process does two jobs:
//   1. serves the repo as a static site (tracker / viewer pages)
//   2. relays KGM1 binary frames between rooms over WebSocket
// This is the "works everywhere" path. For the lowest latency path,
// use relay-rs (WebTransport datagrams) instead.
//
// Run from the repository root: pnpm install --frozen-lockfile && pnpm --dir relay-node start
// Then open http://localhost:8787

import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import {
  normalizePairingTtlSeconds,
  parsePairingRoom,
} from '../shared/pairing.js';

const PORT = Number(process.env.PORT || 8787);
const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..')); // repo root
const ROOM_TOKEN = process.env.MINAMO_RELAY_TOKEN || process.env.ROOM_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.MINAMO_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
// A missing Origin header (non-browser client) is rejected by default; set this
// to opt non-browser publishers back in (#247). Browsers always send Origin.
const ALLOW_NO_ORIGIN = /^(1|true|yes|on)$/i.test(process.env.MINAMO_ALLOW_NO_ORIGIN || '');
// KGM1 frames are ~76-119 bytes; cap the ws payload far below the ws default
// (~100 MB) so a single peer cannot amplify a huge message to the whole room.
const MAX_FRAME_BYTES = Math.max(1024, Number(process.env.MINAMO_MAX_FRAME_BYTES) || 16 * 1024);
// Drop frames for a subscriber whose send queue exceeds this (newest-only
// semantics), matching the Rust relay, so one slow peer cannot grow memory.
const MAX_BUFFERED_BYTES = Math.max(64 * 1024, Number(process.env.MINAMO_MAX_BUFFERED_BYTES) || 1024 * 1024);
// Rate-limit pairing-token minting so an allowed origin cannot mint unbounded
// tokens.
const tokenMintLimiter = createRateLimiter({
  limit: Math.max(1, Number(process.env.MINAMO_PAIRING_RATE_LIMIT) || 30),
  windowMs: Math.max(1000, Number(process.env.MINAMO_PAIRING_RATE_WINDOW_MS) || 60_000),
});
const pairingTokens = createPairingTokenStore();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.vrm': 'model/gltf-binary',
  '.md': 'text/plain; charset=utf-8',
};

const http = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/api/pairing-tokens') {
      await handlePairingTokenRequest(req, res, pairingTokens);
      return;
    }
    if (path === '/api/pairing-qr') {
      await handlePairingQrRequest(req, res);
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

// room name -> Set<WebSocket>
const rooms = new Map();

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_FRAME_BYTES });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  let room;
  try {
    room = parsePairingRoom(url.searchParams.get('room') || 'demo');
  } catch {
    ws.close(1008, 'invalid room');
    return;
  }
  const role = url.searchParams.get('role') || 'sub';
  const token = url.searchParams.get('token') || '';
  const participantId = parseParticipantId(url.searchParams.get('participant'), role);

  if (!originAllowed(req.headers.origin, ALLOWED_ORIGINS, {
    requestHost: req.headers.host,
    allowNoOrigin: ALLOW_NO_ORIGIN,
  })) {
    ws.close(4403, 'origin not allowed');
    return;
  }
  const authorization = authorizeRoomToken(pairingTokens, {
    room,
    token,
    staticToken: ROOM_TOKEN,
  });
  if (!authorization.ok) {
    ws.close(4401, authorization.reason);
    return;
  }
  if (role !== 'pub' && role !== 'sub') {
    ws.close(1008, 'role must be pub or sub');
    return;
  }
  if (!participantId) {
    ws.close(1008, 'invalid participant id');
    return;
  }

  ws.minamo = { room, role, participantId };

  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
  console.log(`[ws] join room=${room} role=${role} participant=${participantId} (${rooms.get(room).size} in room)`);

  ws.on('message', (data, isBinary) => {
    if (!isBinary && !isKgm1Json(data)) return;
    for (const peer of rooms.get(room) ?? []) {
      if (peer === ws || peer.readyState !== peer.OPEN) continue;
      // Newest-only backpressure: skip a subscriber whose send queue is already
      // backed up rather than letting it grow without bound (#247).
      if (!withinBackpressureLimit(peer.bufferedAmount, MAX_BUFFERED_BYTES)) continue;
      peer.send(data, { binary: isBinary });
    }
  });

  ws.on('close', () => {
    leaveRoom(rooms, room, ws);
    console.log(`[ws] leave room=${room} role=${role} participant=${participantId}`);
  });
});

// heartbeat: drop dead sockets so rooms do not leak
const beat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
beat.unref?.();
// periodic GC: bound the pairing-token store and the rate-limiter map (#247)
const purge = setInterval(() => {
  purgePairingTokens(pairingTokens);
  tokenMintLimiter.purge();
}, 60_000);
purge.unref?.();
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
wss.on('close', () => { clearInterval(beat); clearInterval(purge); });

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  http.listen(PORT, () => {
    console.log(`Minamo relay-node`);
    console.log(`  site : http://localhost:${PORT}`);
    console.log(`  ws   : ws://localhost:${PORT}/ws?room=<room>&role=<pub|sub>`);
    if (ROOM_TOKEN) console.log(`  auth : MINAMO_RELAY_TOKEN required`);
    if (ALLOWED_ORIGINS.includes('*')) {
      console.warn('  origins: * (all origins allowed — do not use beyond localhost)');
    } else if (ALLOWED_ORIGINS.length) {
      console.log(`  origins: ${ALLOWED_ORIGINS.join(', ')} (+ same-origin)`);
    } else {
      console.log('  origins: same-origin only (set MINAMO_ALLOWED_ORIGINS to allow others)');
    }
    console.log(`  limits: frame<=${MAX_FRAME_BYTES}B buffered<=${MAX_BUFFERED_BYTES}B`);
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function originAllowed(origin, allowedOrigins = ALLOWED_ORIGINS, options = {}) {
  const { requestHost = '', allowNoOrigin = false } = options;
  // Allow-all requires an explicit opt-in (MINAMO_ALLOWED_ORIGINS=*), never the
  // unset default (#247).
  if (allowedOrigins.includes('*')) return true;
  // A missing Origin (non-browser client) is only accepted when explicitly
  // permitted, so a client cannot bypass the allow-list by omitting the header.
  if (!origin) return allowNoOrigin === true;
  // Configured allow-list match.
  if (allowedOrigins.includes(origin)) return true;
  // Same-origin: the Origin's host matches the host serving this relay, which
  // keeps the no-config local demo (tracker/viewer served by this relay)
  // working without opening the door to cross-site origins.
  if (requestHost && originHostMatches(origin, requestHost)) return true;
  return false;
}

function originHostMatches(origin, requestHost) {
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

// Newest-only backpressure guard: true while the peer's send queue is small
// enough to keep sending, false once it is backed up (drop the frame).
export function withinBackpressureLimit(bufferedAmount, maxBufferedBytes = MAX_BUFFERED_BYTES) {
  return Number(bufferedAmount) <= maxBufferedBytes;
}

// Fixed-window rate limiter keyed by an arbitrary identity (e.g. client IP).
export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    check(key, nowMs = Date.now()) {
      const entry = hits.get(key);
      if (!entry || Number(nowMs) >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: Number(nowMs) + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
      }
      if (entry.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - Number(nowMs) };
      }
      entry.count += 1;
      return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
    },
    purge(nowMs = Date.now()) {
      for (const [key, entry] of hits) {
        if (Number(nowMs) >= entry.resetAt) hits.delete(key);
      }
    },
  };
}

// Bound the pairing-token store: drop expired/revoked tokens and any protected
// room left with no live token (#247).
export function purgePairingTokens(store, nowMs = Date.now()) {
  let removed = 0;
  for (const [token, record] of store.tokens) {
    const expired = Number(nowMs) >= record.expiresAt;
    const revoked = record.revokedAt !== null;
    if (expired || revoked) {
      store.tokens.delete(token);
      removed += 1;
    }
  }
  const liveRooms = new Set();
  for (const record of store.tokens.values()) liveRooms.add(record.room);
  for (const room of store.protectedRooms) {
    if (!liveRooms.has(room)) store.protectedRooms.delete(room);
  }
  return removed;
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  const max = Math.max(left.length, right.length, 1);
  const leftPadded = Buffer.alloc(max);
  const rightPadded = Buffer.alloc(max);
  left.copy(leftPadded);
  right.copy(rightPadded);
  return timingSafeEqual(leftPadded, rightPadded) && left.length === right.length;
}

export function createPairingTokenStore() {
  return {
    tokens: new Map(),
    protectedRooms: new Set(),
  };
}

export function issuePairingToken(store, {
  room,
  ttlSeconds,
  previousToken = '',
  nowMs = Date.now(),
  token = randomBytes(24).toString('base64url'),
} = {}) {
  const safeRoom = parsePairingRoom(room);
  const safeTtlSeconds = normalizePairingTtlSeconds(ttlSeconds);
  const opaqueToken = String(token || '');
  if (!/^[a-zA-Z0-9_-]{24,128}$/.test(opaqueToken)) {
    throw new Error('Unable to issue a valid pairing token.');
  }
  if (previousToken) revokePairingToken(store, previousToken, safeRoom, nowMs);
  const record = {
    room: safeRoom,
    issuedAt: Number(nowMs),
    expiresAt: Number(nowMs) + safeTtlSeconds * 1000,
    revokedAt: null,
  };
  store.tokens.set(opaqueToken, record);
  store.protectedRooms.add(safeRoom);
  return { token: opaqueToken, ...record, ttlSeconds: safeTtlSeconds };
}

export function validatePairingToken(store, { room, token, nowMs = Date.now() } = {}) {
  const record = store.tokens.get(String(token || ''));
  if (!record || record.room !== room) return { ok: false, reason: 'invalid room token' };
  if (record.revokedAt !== null) return { ok: false, reason: 'revoked room token' };
  if (Number(nowMs) >= record.expiresAt) return { ok: false, reason: 'expired room token' };
  return { ok: true, reason: 'valid room token', expiresAt: record.expiresAt };
}

export function revokePairingToken(store, token, room = '', nowMs = Date.now()) {
  const record = store.tokens.get(String(token || ''));
  if (!record || (room && record.room !== room)) return false;
  if (record.revokedAt === null) record.revokedAt = Number(nowMs);
  return true;
}

export function authorizeRoomToken(store, {
  room,
  token = '',
  staticToken = '',
  nowMs = Date.now(),
} = {}) {
  if (staticToken && constantTimeEqual(token, staticToken)) {
    return { ok: true, reason: 'valid static room token' };
  }
  if (store.protectedRooms.has(room) || token) {
    return validatePairingToken(store, { room, token, nowMs });
  }
  if (staticToken) return { ok: false, reason: 'invalid room token' };
  return { ok: true, reason: 'open room' };
}

export async function renderPairingQrSvg(value) {
  const payload = String(value || '');
  if (!payload || payload.length > 2048) throw new Error('QR payload must be between 1 and 2048 characters.');
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 3,
    width: 300,
    color: { dark: '#15201dff', light: '#ffffffff' },
  });
}

export function isKgm1Json(data) {
  try {
    const msg = JSON.parse(String(data));
    return msg && msg.type === 'kgm1' && typeof msg.payload === 'string';
  } catch {
    return false;
  }
}

export function parseParticipantId(value, role = 'sub') {
  if (role !== 'pub') return 'viewer';
  const text = String(value || 'legacy').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(text) ? text : null;
}

export function leaveRoom(roomMap, room, ws) {
  const set = roomMap.get(room);
  if (!set) return 0;
  set.delete(ws);
  if (set.size === 0) roomMap.delete(room);
  return roomMap.get(room)?.size ?? 0;
}

async function handlePairingTokenRequest(req, res, store) {
  const origin = req.headers.origin;
  const headers = {
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, DELETE, OPTIONS',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    pragma: 'no-cache',
    'referrer-policy': 'no-referrer',
    vary: 'Origin',
  };
  const allowed = originAllowed(origin, ALLOWED_ORIGINS, {
    requestHost: req.headers.host,
    allowNoOrigin: ALLOW_NO_ORIGIN,
  });
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  if (origin && !allowed) {
    sendJson(res, 403, { error: 'origin not allowed' }, headers);
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers).end();
    return;
  }
  try {
    const body = await readJsonBody(req);
    if (req.method === 'POST') {
      const clientKey = req.socket?.remoteAddress || 'unknown';
      const limit = tokenMintLimiter.check(clientKey);
      if (!limit.allowed) {
        sendJson(res, 429, { error: 'too many pairing token requests' }, {
          ...headers,
          'retry-after': String(Math.ceil(limit.retryAfterMs / 1000)),
        });
        return;
      }
      const issued = issuePairingToken(store, {
        room: body.room,
        ttlSeconds: body.ttlSeconds,
        previousToken: body.previousToken,
      });
      sendJson(res, 201, {
        room: issued.room,
        token: issued.token,
        issuedAt: issued.issuedAt,
        expiresAt: issued.expiresAt,
        ttlSeconds: issued.ttlSeconds,
      }, headers);
      return;
    }
    if (req.method === 'DELETE') {
      const revoked = revokePairingToken(store, body.token, body.room);
      sendJson(res, 200, { revoked }, headers);
      return;
    }
    res.writeHead(405, { ...headers, allow: 'POST, DELETE, OPTIONS' }).end(JSON.stringify({ error: 'method not allowed' }));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'invalid request' }, headers);
  }
}

async function handlePairingQrRequest(req, res) {
  const origin = req.headers.origin;
  const headers = {
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    pragma: 'no-cache',
    'referrer-policy': 'no-referrer',
    vary: 'Origin',
  };
  const allowed = originAllowed(origin, ALLOWED_ORIGINS, {
    requestHost: req.headers.host,
    allowNoOrigin: ALLOW_NO_ORIGIN,
  });
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  if (origin && !allowed) {
    sendJson(res, 403, { error: 'origin not allowed' }, headers);
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { ...headers, allow: 'POST, OPTIONS' }).end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }
  try {
    const body = await readJsonBody(req);
    const svg = await renderPairingQrSvg(body.payload);
    sendJson(res, 200, { svg }, headers);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'unable to render QR' }, headers);
  }
}

async function readJsonBody(req, maxBytes = 4096) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function shutdown() {
  clearInterval(beat);
  clearInterval(purge);
  for (const ws of wss.clients) ws.close(1001, 'server shutdown');
  wss.close(() => {
    http.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
