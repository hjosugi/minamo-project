import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeRoomToken,
  constantTimeEqual,
  createPairingTokenStore,
  isKgm1Json,
  issuePairingToken,
  leaveRoom,
  originAllowed,
  parseParticipantId,
  renderPairingQrSvg,
  revokePairingToken,
  validatePairingToken,
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

test('origin allow-list is explicit when configured', () => {
  assert.equal(originAllowed('https://studio.example', []), true);
  assert.equal(originAllowed(undefined, ['https://studio.example']), true);
  assert.equal(originAllowed('https://studio.example', ['https://studio.example']), true);
  assert.equal(originAllowed('https://evil.example', ['https://studio.example']), false);
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
