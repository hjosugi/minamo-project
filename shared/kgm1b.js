export const KGM1B_MAGIC = 0x314d474b; // "KGM1" little-endian
export const KGM1B_HEADER_BYTES = 40;

export function encodeKgm1bHeader({
  versionMajor = 0,
  versionMinor = 1,
  frameId = 0n,
  sourceTimeNs = 0n,
  monotonicTimeNs = 0n,
  flags = 0,
  encoding = 1,
  payloadType = 0,
  payloadLen = 0,
} = {}) {
  const buf = new ArrayBuffer(KGM1B_HEADER_BYTES);
  const dv = new DataView(buf);
  dv.setUint32(0, KGM1B_MAGIC, true);
  dv.setUint16(4, versionMajor, true);
  dv.setUint16(6, versionMinor, true);
  dv.setBigUint64(8, BigInt(frameId), true);
  dv.setBigUint64(16, BigInt(sourceTimeNs), true);
  dv.setBigUint64(24, BigInt(monotonicTimeNs), true);
  dv.setUint16(32, flags, true);
  dv.setUint8(34, encoding);
  dv.setUint8(35, payloadType);
  dv.setUint32(36, payloadLen, true);
  return buf;
}

export function decodeKgm1bHeader(data) {
  const buf = normalizeBuffer(data);
  if (!buf || buf.byteLength < KGM1B_HEADER_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== KGM1B_MAGIC) return null;
  return {
    versionMajor: dv.getUint16(4, true),
    versionMinor: dv.getUint16(6, true),
    frameId: dv.getBigUint64(8, true),
    sourceTimeNs: dv.getBigUint64(16, true),
    monotonicTimeNs: dv.getBigUint64(24, true),
    flags: dv.getUint16(32, true),
    encoding: dv.getUint8(34),
    payloadType: dv.getUint8(35),
    payloadLen: dv.getUint32(36, true),
  };
}

export function encodeKgm1bPacket(header, payload = new Uint8Array()) {
  const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const head = new Uint8Array(encodeKgm1bHeader({ ...header, payloadLen: body.byteLength }));
  const out = new Uint8Array(head.byteLength + body.byteLength);
  out.set(head, 0);
  out.set(body, head.byteLength);
  return out.buffer;
}

export function decodeKgm1bPacket(data) {
  const buf = normalizeBuffer(data);
  const header = decodeKgm1bHeader(buf);
  if (!buf || !header) return null;
  const end = KGM1B_HEADER_BYTES + header.payloadLen;
  if (buf.byteLength < end) return null;
  return {
    header,
    payload: new Uint8Array(buf.slice(KGM1B_HEADER_BYTES, end)),
  };
}

function normalizeBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return null;
}
