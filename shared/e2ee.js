const AAD = new TextEncoder().encode('minamo.kgm.e2ee.v1');
const KEY_USAGE = ['encrypt', 'decrypt'];
const NONCE_SUFFIX_BYTES = 8;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export const E2EE_OVERHEAD_BYTES = NONCE_SUFFIX_BYTES + TAG_BYTES;

export async function deriveRoomKey(secret, room = 'demo', cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  const material = await crypto.subtle.importKey(
    'raw',
    utf8(String(secret || '')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: utf8(`minamo:${room}`),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    KEY_USAGE
  );
  const nonceDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(`nonce:${room}:${secret}`)));
  return { key, noncePrefix: nonceDigest.slice(0, NONCE_BYTES - NONCE_SUFFIX_BYTES) };
}

export async function encryptFrame(frame, roomKey, cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  const plaintext = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  const nonceSuffix = new Uint8Array(NONCE_SUFFIX_BYTES);
  crypto.getRandomValues(nonceSuffix);
  const nonce = buildNonce(roomKey, nonceSuffix);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: AAD, tagLength: TAG_BYTES * 8 },
    roomKey.key,
    plaintext
  ));
  const out = new Uint8Array(NONCE_SUFFIX_BYTES + ciphertext.byteLength);
  out.set(nonceSuffix, 0);
  out.set(ciphertext, NONCE_SUFFIX_BYTES);
  return out;
}

export async function decryptFrame(packet, roomKey, cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  const bytes = packet instanceof Uint8Array ? packet : new Uint8Array(packet);
  if (bytes.byteLength <= E2EE_OVERHEAD_BYTES) {
    throw new Error('Unable to decrypt tracking frame: encrypted packet is too short');
  }
  const nonceSuffix = bytes.slice(0, NONCE_SUFFIX_BYTES);
  const ciphertext = bytes.slice(NONCE_SUFFIX_BYTES);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buildNonce(roomKey, nonceSuffix), additionalData: AAD, tagLength: TAG_BYTES * 8 },
      roomKey.key,
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

function buildNonce(roomKey, suffix) {
  if (!roomKey?.key || !roomKey?.noncePrefix || roomKey.noncePrefix.byteLength !== NONCE_BYTES - NONCE_SUFFIX_BYTES) {
    throw new Error('Invalid Minamo E2EE room key');
  }
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce.set(roomKey.noncePrefix, 0);
  nonce.set(suffix, NONCE_BYTES - NONCE_SUFFIX_BYTES);
  return nonce;
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
