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

const wss = new WebSocketServer({ server: http, path: '/ws' });

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

  if (!originAllowed(req.headers.origin)) {
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
      if (peer !== ws && peer.readyState === peer.OPEN) {
        peer.send(data, { binary: isBinary });
      }
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
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
wss.on('close', () => clearInterval(beat));

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  http.listen(PORT, () => {
    console.log(`Minamo relay-node`);
    console.log(`  site : http://localhost:${PORT}`);
    console.log(`  ws   : ws://localhost:${PORT}/ws?room=<room>&role=<pub|sub>`);
    if (ROOM_TOKEN) console.log(`  auth : MINAMO_RELAY_TOKEN required`);
    if (ALLOWED_ORIGINS.length) console.log(`  origins: ${ALLOWED_ORIGINS.join(', ')}`);
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function originAllowed(origin, allowedOrigins = ALLOWED_ORIGINS) {
  if (!allowedOrigins.length || !origin) return true;
  return allowedOrigins.includes(origin);
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
  if (origin && originAllowed(origin)) headers['access-control-allow-origin'] = origin;
  if (origin && !originAllowed(origin)) {
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
  if (origin && originAllowed(origin)) headers['access-control-allow-origin'] = origin;
  if (origin && !originAllowed(origin)) {
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
  for (const ws of wss.clients) ws.close(1001, 'server shutdown');
  wss.close(() => {
    http.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
