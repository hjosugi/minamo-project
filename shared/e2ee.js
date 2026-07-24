export const E2EE_ENVELOPE_VERSION = 2;

const AAD = new TextEncoder().encode(`minamo.kgm.e2ee.v${E2EE_ENVELOPE_VERSION}`);
const KEY_USAGE = ['encrypt', 'decrypt'];
const NONCE_BYTES = 12;
// A 96-bit GCM tag keeps the existing 24-byte envelope overhead while allowing
// the complete 96-bit nonce to be random and transmitted with every frame.
const TAG_BYTES = 12;

export const E2EE_OVERHEAD_BYTES = NONCE_BYTES + TAG_BYTES;

export async function deriveRoomKey(secret, room = 'demo', cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  const material = await crypto.subtle.importKey(
    'raw',
    utf8(String(secret || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const keyBits = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: utf8(`minamo:${room}`),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    material,
    256
  ));
  try {
    const key = await crypto.subtle.importKey('raw', keyBits, 'HKDF', false, ['deriveKey']);
    return { key, version: E2EE_ENVELOPE_VERSION };
  } finally {
    keyBits.fill(0);
  }
}

export async function encryptFrame(frame, roomKey, cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  const plaintext = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  const nonce = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(nonce);
  const frameKey = await deriveFrameKey(roomKey, nonce, crypto);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: AAD, tagLength: TAG_BYTES * 8 },
    frameKey,
    plaintext
  ));
  const out = new Uint8Array(NONCE_BYTES + ciphertext.byteLength);
  out.set(nonce, 0);
  out.set(ciphertext, NONCE_BYTES);
  return out;
}

export async function decryptFrame(packet, roomKey, cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  const bytes = packet instanceof Uint8Array ? packet : new Uint8Array(packet);
  if (bytes.byteLength <= E2EE_OVERHEAD_BYTES) {
    throw new Error('Unable to decrypt tracking frame: encrypted packet is too short');
  }
  const nonce = bytes.slice(0, NONCE_BYTES);
  const ciphertext = bytes.slice(NONCE_BYTES);
  try {
    const frameKey = await deriveFrameKey(roomKey, nonce, crypto);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: AAD, tagLength: TAG_BYTES * 8 },
      frameKey,
      ciphertext
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error('Unable to decrypt tracking frame: wrong room key or corrupted frame');
  }
}

export function ciphertextLooksOpaque(ciphertext, plaintext) {
  const sealed = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext);
  const clear = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext);
  if (sealed.byteLength <= clear.byteLength) return false;
  for (let offset = 0; offset <= sealed.byteLength - clear.byteLength; offset++) {
    let same = true;
    for (let i = 0; i < clear.byteLength; i++) {
      if (sealed[offset + i] !== clear[i]) {
        same = false;
        break;
      }
    }
    if (same) return false;
  }
  return true;
}

async function deriveFrameKey(roomKey, nonce, crypto) {
  if (!roomKey?.key || roomKey.version !== E2EE_ENVELOPE_VERSION || nonce.byteLength !== NONCE_BYTES) {
    throw new Error('Invalid Minamo E2EE room key');
  }
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: nonce, info: AAD },
    roomKey.key,
    { name: 'AES-GCM', length: 256 },
    false,
    KEY_USAGE
  );
}

function requireWebCrypto(cryptoImpl) {
  if (!cryptoImpl?.subtle || !cryptoImpl.getRandomValues) {
    throw new Error('WebCrypto is required for Minamo E2EE');
  }
  return cryptoImpl;
}

function utf8(value) {
  return new TextEncoder().encode(value);
}
