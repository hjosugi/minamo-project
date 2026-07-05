import { decodeFrame } from './codec.js';

export const KGM_RECORDING_MAGIC = 'KGMR';
export const KGM_RECORDING_VERSION = 1;
export const KGM_RECORDING_MIME = 'application/x-minamo-kgm';

const HEADER_BYTES = 12;
const RECORD_HEADER_BYTES = 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeKgmRecording(records, metadata = {}) {
  const normalized = normalizeRecords(records);
  const metaBytes = textEncoder.encode(JSON.stringify({
    schema: 'minamo.kgm-recording.v1',
    createdAt: new Date().toISOString(),
    ...metadata,
  }));
  const bodyBytes = normalized.reduce((sum, record) => sum + RECORD_HEADER_BYTES + record.bytes.byteLength, 0);
  const out = new Uint8Array(HEADER_BYTES + metaBytes.byteLength + bodyBytes);
  const dv = new DataView(out.buffer);
  out.set([0x4b, 0x47, 0x4d, 0x52], 0);
  dv.setUint8(4, KGM_RECORDING_VERSION);
  dv.setUint8(5, 0);
  dv.setUint16(6, 0, true);
  dv.setUint32(8, metaBytes.byteLength, true);
  out.set(metaBytes, HEADER_BYTES);
  let offset = HEADER_BYTES + metaBytes.byteLength;
  let previousT = normalized[0]?.t ?? 0;
  for (const record of normalized) {
    const dt = Math.max(0, Math.min(0xffff, Math.round(record.t - previousT)));
    previousT = record.t;
    dv.setUint16(offset, dt, true); offset += 2;
    dv.setUint16(offset, record.bytes.byteLength, true); offset += 2;
    out.set(record.bytes, offset); offset += record.bytes.byteLength;
  }
  return out;
}

export function parseKgmRecording(data) {
  const bytes = normalizeBytes(data);
  if (bytes.byteLength < HEADER_BYTES) throw new Error('KGM recording is too short');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== KGM_RECORDING_MAGIC) throw new Error('KGM recording magic mismatch');
  const version = dv.getUint8(4);
  if (version !== KGM_RECORDING_VERSION) throw new Error(`Unsupported KGM recording version: ${version}`);
  const metaLen = dv.getUint32(8, true);
  if (HEADER_BYTES + metaLen > bytes.byteLength) throw new Error('KGM recording metadata is truncated');
  const metadata = JSON.parse(textDecoder.decode(bytes.slice(HEADER_BYTES, HEADER_BYTES + metaLen)));
  let offset = HEADER_BYTES + metaLen;
  let t = 0;
  const records = [];
  while (offset < bytes.byteLength) {
    if (offset + RECORD_HEADER_BYTES > bytes.byteLength) throw new Error('KGM record header is truncated');
    const dt = dv.getUint16(offset, true); offset += 2;
    const len = dv.getUint16(offset, true); offset += 2;
    if (offset + len > bytes.byteLength) throw new Error('KGM frame payload is truncated');
    t += dt;
    const frameBytes = bytes.slice(offset, offset + len);
    const frame = decodeFrame(frameBytes);
    if (!frame) throw new Error(`Invalid KGM1 frame payload at record ${records.length}`);
    frame.t = t;
    records.push({ t, dt, bytes: frameBytes, frame });
    offset += len;
  }
  return { metadata, records, frames: records.map((record) => record.frame) };
}

export function estimateKgmRecordingBytes(frameCount, averagePayloadBytes = 76) {
  return HEADER_BYTES + 512 + frameCount * (RECORD_HEADER_BYTES + averagePayloadBytes);
}

export function tenMinuteKgmEstimateBytes(fps = 60, averagePayloadBytes = 76) {
  return estimateKgmRecordingBytes(Math.round(fps * 60 * 10), averagePayloadBytes);
}

function normalizeRecords(records) {
  return Array.from(records || [], (record) => ({
    t: Number(record.t) || 0,
    bytes: normalizeBytes(record.bytes),
  })).filter((record) => record.bytes.byteLength > 0);
}

function normalizeBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('Expected binary frame bytes');
}
