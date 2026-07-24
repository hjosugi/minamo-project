import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeRoomToken,
  constantTimeEqual,
  createPairingTokenStore,
  createRateLimiter,
  isKgm1Json,
  issuePairingToken,
  leaveRoom,
  originAllowed,
  parseParticipantId,
  purgePairingTokens,
  renderPairingQrSvg,
  revokePairingToken,
  validatePairingToken,
  withinBackpressureLimit,
} from './server.mjs';

test('constant-time token comparison handles matches, mismatches, and length changes', () => {
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual('secret', 'wrong'), false);
  assert.equal(constantTimeEqual('secret', 'secret-extra'), false);
  assert.doesNotThrow(() => constantTimeEqual('', 'secret'));
});

test('short-lived room tokens expire and are rejected without exposing token text', () => {
  const store = createPairingTokenStore();
  const token = 'a'.repeat(32);
  const issued = issuePairingToken(store, {
    room: 'phone-stage',
    ttlSeconds: 120,
    nowMs: 1_000,
    token,
  });
  assert.equal(issued.expiresAt, 121_000);
  assert.equal(validatePairingToken(store, { room: 'phone-stage', token, nowMs: 120_999 }).ok, true);
  const expired = validatePairingToken(store, { room: 'phone-stage', token, nowMs: 121_000 });
  assert.deepEqual(expired, { ok: false, reason: 'expired room token' });
  assert.equal(expired.reason.includes(token), false);
  assert.deepEqual(
    authorizeRoomToken(store, { room: 'phone-stage', token: '', nowMs: 121_000 }),
    { ok: false, reason: 'invalid room token' },
  );
});

test('regeneration revokes the previous token and explicit expiry is idempotent', () => {
  const store = createPairingTokenStore();
  const first = 'b'.repeat(32);
  const second = 'c'.repeat(32);
  issuePairingToken(store, { room: 'room-2', ttlSeconds: 300, nowMs: 10, token: first });
  issuePairingToken(store, {
    room: 'room-2',
    ttlSeconds: 300,
    previousToken: first,
    nowMs: 20,
    token: second,
  });
  assert.deepEqual(
    validatePairingToken(store, { room: 'room-2', token: first, nowMs: 21 }),
    { ok: false, reason: 'revoked room token' },
  );
  assert.equal(validatePairingToken(store, { room: 'room-2', token: second, nowMs: 21 }).ok, true);
  assert.equal(revokePairingToken(store, second, 'room-2', 30), true);
  assert.equal(revokePairingToken(store, second, 'room-2', 31), true);
  assert.equal(validatePairingToken(store, { room: 'room-2', token: second, nowMs: 31 }).ok, false);
});

test('static relay tokens remain supported alongside protected pairing rooms', () => {
  const store = createPairingTokenStore();
  issuePairingToken(store, { room: 'protected', ttlSeconds: 30, nowMs: 0, token: 'd'.repeat(32) });
  assert.equal(authorizeRoomToken(store, {
    room: 'protected',
    token: 'legacy-secret',
    staticToken: 'legacy-secret',
    nowMs: 60_000,
  }).ok, true);
  assert.equal(authorizeRoomToken(store, { room: 'open-room', token: '' }).ok, true);
  assert.equal(authorizeRoomToken(store, { room: 'open-room', token: 'unknown-token' }).ok, false);
  assert.equal(authorizeRoomToken(store, {
    room: 'open-room',
    token: '',
    staticToken: 'legacy-secret',
  }).ok, false);
});

test('relay QR fallback renders locally without embedding readable token text', async () => {
  const token = 'private-token-value';
  const svg = await renderPairingQrSvg(`https://studio.example/tracker/?room=stage&token=${token}`);
  assert.match(svg, /^<svg/);
  assert.equal(svg.includes(token), false);
  await assert.rejects(() => renderPairingQrSvg('x'.repeat(2049)), /between 1 and 2048/);
});

test('origin allow-list is explicit and does not allow-all or missing-origin by default', () => {
  // Unset list no longer means allow-all: a foreign origin with no same-origin
  // context is rejected.
  assert.equal(originAllowed('https://studio.example', []), false);
  // Explicit allow-all opt-in.
  assert.equal(originAllowed('https://anything.example', ['*']), true);
  // Configured allow-list.
  assert.equal(originAllowed('https://studio.example', ['https://studio.example']), true);
  assert.equal(originAllowed('https://evil.example', ['https://studio.example']), false);
  // A missing Origin (non-browser) is rejected unless explicitly permitted.
  assert.equal(originAllowed(undefined, ['https://studio.example']), false);
  assert.equal(originAllowed(undefined, ['https://studio.example'], { allowNoOrigin: true }), true);
  // Same-origin: the Origin host matches the host serving the relay.
  assert.equal(originAllowed('http://localhost:8787', [], { requestHost: 'localhost:8787' }), true);
  assert.equal(originAllowed('https://evil.example', [], { requestHost: 'localhost:8787' }), false);
});

test('backpressure guard drops frames once a peer send queue is backed up', () => {
  assert.equal(withinBackpressureLimit(0, 1024), true);
  assert.equal(withinBackpressureLimit(1024, 1024), true);
  assert.equal(withinBackpressureLimit(1025, 1024), false);
});

test('pairing-token minting is rate limited per key with a resetting window', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.check('ip-a', 0).allowed, true);
  assert.equal(limiter.check('ip-a', 10).allowed, true);
  const blocked = limiter.check('ip-a', 20);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 980);
  // A different key has its own budget.
  assert.equal(limiter.check('ip-b', 20).allowed, true);
  // The window resets.
  assert.equal(limiter.check('ip-a', 1000).allowed, true);
});

test('purge removes expired/revoked tokens and empty protected rooms', () => {
  const store = createPairingTokenStore();
  issuePairingToken(store, { room: 'room-live', ttlSeconds: 300, nowMs: 0, token: 'a'.repeat(32) });
  issuePairingToken(store, { room: 'room-old', ttlSeconds: 60, nowMs: 0, token: 'b'.repeat(32) });
  const revoked = 'c'.repeat(32);
  issuePairingToken(store, { room: 'room-live', ttlSeconds: 300, nowMs: 0, token: revoked });
  revokePairingToken(store, revoked, 'room-live', 10);

  // At t=120s the room-old token is expired and the revoked one is gone.
  const removed = purgePairingTokens(store, 120_000);
  assert.equal(removed, 2);
  assert.equal(store.tokens.has('a'.repeat(32)), true);
  assert.equal(store.tokens.has('b'.repeat(32)), false);
  assert.equal(store.tokens.has(revoked), false);
  // room-old lost its only token, so it is no longer protected; room-live stays.
  assert.equal(store.protectedRooms.has('room-old'), false);
  assert.equal(store.protectedRooms.has('room-live'), true);
});

test('KGM1 JSON fallback only accepts typed payload records', () => {
  assert.equal(isKgm1Json(JSON.stringify({ type: 'kgm1', payload: 'AAAA' })), true);
  assert.equal(isKgm1Json(JSON.stringify({ type: 'kgm1', payload: 42 })), false);
  assert.equal(isKgm1Json('not json'), false);
});

test('room cleanup removes the room after the last participant leaves', () => {
  const ws1 = {};
  const ws2 = {};
  const rooms = new Map([['demo', new Set([ws1, ws2])]]);
  assert.equal(leaveRoom(rooms, 'demo', ws1), 1);
  assert.equal(rooms.has('demo'), true);
  assert.equal(leaveRoom(rooms, 'demo', ws2), 0);
  assert.equal(rooms.has('demo'), false);
  assert.equal(leaveRoom(rooms, 'missing', ws1), 0);
});

test('publisher participant ids are bounded and log-safe', () => {
  assert.equal(parseParticipantId('camera-a', 'pub'), 'camera-a');
  assert.equal(parseParticipantId('', 'pub'), 'legacy');
  assert.equal(parseParticipantId('../escape', 'pub'), null);
  assert.equal(parseParticipantId('x'.repeat(65), 'pub'), null);
  assert.equal(parseParticipantId(null, 'sub'), 'viewer');
});
