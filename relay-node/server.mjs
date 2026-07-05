// Minamo relay (Node).
// One process does two jobs:
//   1. serves the repo as a static site (tracker / viewer pages)
//   2. relays KGM1 binary frames between rooms over WebSocket
// This is the "works everywhere" path. For the lowest latency path,
// use relay-rs (WebTransport datagrams) instead.
//
// Run:  cd relay-node && npm install && npm start
// Then open http://localhost:8787

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..')); // repo root
const ROOM_TOKEN = process.env.MINAMO_RELAY_TOKEN || process.env.ROOM_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.MINAMO_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
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
  const room = url.searchParams.get('room') || 'demo';
  const role = url.searchParams.get('role') || 'sub';
  const token = url.searchParams.get('token') || '';

  if (!originAllowed(req.headers.origin)) {
    ws.close(4403, 'origin not allowed');
    return;
  }
  if (ROOM_TOKEN && !constantTimeEqual(token, ROOM_TOKEN)) {
    ws.close(4401, 'invalid room token');
    return;
  }
  if (role !== 'pub' && role !== 'sub') {
    ws.close(1008, 'role must be pub or sub');
    return;
  }

  ws.minamo = { room, role };

  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
  console.log(`[ws] join room=${room} role=${role} (${rooms.get(room).size} in room)`);

  ws.on('message', (data, isBinary) => {
    if (!isBinary && !isKgm1Json(data)) return;
    for (const peer of rooms.get(room) ?? []) {
      if (peer !== ws && peer.readyState === peer.OPEN) {
        peer.send(data, { binary: isBinary });
      }
    }
  });

  ws.on('close', () => {
    const set = rooms.get(room);
    if (set) {
      set.delete(ws);
      if (set.size === 0) rooms.delete(room);
    }
    console.log(`[ws] leave room=${room} role=${role}`);
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
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
wss.on('close', () => clearInterval(beat));

http.listen(PORT, () => {
  console.log(`Minamo relay-node`);
  console.log(`  site : http://localhost:${PORT}`);
  console.log(`  ws   : ws://localhost:${PORT}/ws?room=<room>&role=<pub|sub>`);
  if (ROOM_TOKEN) console.log(`  auth : MINAMO_RELAY_TOKEN required`);
  if (ALLOWED_ORIGINS.length) console.log(`  origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

function originAllowed(origin) {
  if (!ALLOWED_ORIGINS.length || !origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  const max = Math.max(left.length, right.length, 1);
  const leftPadded = Buffer.alloc(max);
  const rightPadded = Buffer.alloc(max);
  left.copy(leftPadded);
  right.copy(rightPadded);
  return timingSafeEqual(leftPadded, rightPadded) && left.length === right.length;
}

function isKgm1Json(data) {
  try {
    const msg = JSON.parse(String(data));
    return msg && msg.type === 'kgm1' && typeof msg.payload === 'string';
  } catch {
    return false;
  }
}
