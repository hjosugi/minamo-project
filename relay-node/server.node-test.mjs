import assert from 'node:assert/strict';
import test from 'node:test';
import {
  constantTimeEqual,
  isKgm1Json,
  leaveRoom,
  originAllowed,
} from './server.mjs';

test('constant-time token comparison handles matches, mismatches, and length changes', () => {
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual('secret', 'wrong'), false);
  assert.equal(constantTimeEqual('secret', 'secret-extra'), false);
  assert.doesNotThrow(() => constantTimeEqual('', 'secret'));
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
