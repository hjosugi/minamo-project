// Backward-compatible participant metadata around an unchanged KGM1 packet.
// Relays stay payload-opaque: publishers add this header and viewers remove it.

export const ROOM_FRAME_MAGIC = Object.freeze([0x4d, 0x52, 0x4d, 0x31]); // MRM1
export const ROOM_FRAME_VERSION = 1;
export const ROOM_FRAME_HEADER_BYTES = 6;
export const LEGACY_PARTICIPANT_ID = 'legacy';
export const MAX_PARTICIPANT_ID_BYTES = 64;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function normalizeParticipantId(value, fallback = LEGACY_PARTICIPANT_ID) {
  const text = String(value || '').trim();
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(text)) return text;
  return fallback;
}

export function createParticipantId(prefix = 'performer', cryptoImpl = globalThis.crypto) {
  const safePrefix = normalizeParticipantId(prefix, 'performer').slice(0, 24);
  const random = cryptoImpl?.randomUUID?.().replace(/-/g, '').slice(0, 12)
    || Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  return normalizeParticipantId(`${safePrefix}-${random}`);
}

/** @param {string} participantId @param {ArrayBuffer|ArrayBufferView} frame */
export function encodeRoomFrame(participantId, frame) {
  const id = normalizeParticipantId(participantId, '');
  if (!id) throw new Error('A valid participantId is required for a room frame.');
  const idBytes = encoder.encode(id);
  if (idBytes.byteLength > MAX_PARTICIPANT_ID_BYTES) throw new Error('participantId is too long.');
  const frameBytes = toUint8Array(frame);
  if (!frameBytes?.byteLength) throw new Error('A non-empty KGM1 frame is required.');

  const packet = new Uint8Array(ROOM_FRAME_HEADER_BYTES + idBytes.byteLength + frameBytes.byteLength);
  packet.set(ROOM_FRAME_MAGIC, 0);
  packet[4] = ROOM_FRAME_VERSION;
  packet[5] = idBytes.byteLength;
  packet.set(idBytes, ROOM_FRAME_HEADER_BYTES);
  packet.set(frameBytes, ROOM_FRAME_HEADER_BYTES + idBytes.byteLength);
  return packet.buffer;
}

/** @param {ArrayBuffer|ArrayBufferView} packet */
export function decodeRoomFrame(packet) {
  const bytes = toUint8Array(packet);
  if (!bytes) return null;
  const enveloped = bytes.byteLength >= ROOM_FRAME_HEADER_BYTES
    && ROOM_FRAME_MAGIC.every((value, index) => bytes[index] === value);
  if (!enveloped) {
    return { participantId: LEGACY_PARTICIPANT_ID, frameBytes: bytes, enveloped: false };
  }
  if (bytes[4] !== ROOM_FRAME_VERSION) return null;
  const idLength = bytes[5];
  if (idLength < 1 || idLength > MAX_PARTICIPANT_ID_BYTES) return null;
  const frameOffset = ROOM_FRAME_HEADER_BYTES + idLength;
  if (bytes.byteLength <= frameOffset) return null;
  try {
    const participantId = normalizeParticipantId(decoder.decode(bytes.subarray(ROOM_FRAME_HEADER_BYTES, frameOffset)), '');
    if (!participantId) return null;
    return { participantId, frameBytes: bytes.subarray(frameOffset), enveloped: true };
  } catch {
    return null;
  }
}

export class RoomParticipantStore {
  constructor({ staleAfterMs = 1000, fadeMs = 1500, maxParticipants = 8, disposeAvatar = null } = {}) {
    this.staleAfterMs = Math.max(0, Number(staleAfterMs) || 0);
    this.fadeMs = Math.max(1, Number(fadeMs) || 1);
    this.maxParticipants = Math.max(1, Number(maxParticipants) || 1);
    this.disposeAvatar = typeof disposeAvatar === 'function' ? disposeAvatar : () => {};
    this.participants = new Map();
    this.generations = new Map();
  }

  ingest(participantId, frame, receivedAtMs = performanceNow()) {
    const id = normalizeParticipantId(participantId);
    let participant = this.participants.get(id);
    if (participant && receivedAtMs - participant.lastSeenMs >= this.staleAfterMs + this.fadeMs) {
      if (participant.avatar) this.disposeAvatar(participant.avatar, id);
      this.participants.delete(id);
      participant = null;
    }
    if (!participant) {
      const generation = (this.generations.get(id) || 0) + 1;
      this.generations.set(id, generation);
      participant = { participantId: id, generation, latestFrame: null, lastSeenMs: receivedAtMs, avatar: null };
      this.participants.set(id, participant);
    }
    participant.latestFrame = frame;
    participant.lastSeenMs = Math.max(participant.lastSeenMs, Number(receivedAtMs) || 0);
    return participant;
  }

  assignAvatar(participantId, avatar) {
    const id = normalizeParticipantId(participantId);
    const participant = this.participants.get(id) || this.ingest(id, null, performanceNow());
    if (participant.avatar && participant.avatar !== avatar) this.disposeAvatar(participant.avatar, participant.participantId);
    participant.avatar = avatar;
    return participant;
  }

  snapshot(nowMs = performanceNow()) {
    const ordered = [...this.participants.values()]
      .sort((a, b) => a.participantId.localeCompare(b.participantId))
      .slice(0, this.maxParticipants);
    return ordered.map((participant, slot) => {
      const ageMs = Math.max(0, nowMs - participant.lastSeenMs);
      const fadeAgeMs = Math.max(0, ageMs - this.staleAfterMs);
      const fade = Math.max(0, 1 - fadeAgeMs / this.fadeMs);
      return { ...participant, slot, ageMs, fade, active: ageMs <= this.staleAfterMs };
    }).filter((participant) => participant.fade > 0);
  }

  prune(nowMs = performanceNow()) {
    const removed = [];
    const expiryMs = this.staleAfterMs + this.fadeMs;
    for (const [id, participant] of this.participants) {
      if (nowMs - participant.lastSeenMs < expiryMs) continue;
      if (participant.avatar) this.disposeAvatar(participant.avatar, id);
      this.participants.delete(id);
      removed.push(id);
    }
    return removed;
  }

  clear() {
    for (const [id, participant] of this.participants) {
      if (participant.avatar) this.disposeAvatar(participant.avatar, id);
    }
    this.participants.clear();
  }
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
