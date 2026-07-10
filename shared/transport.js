// Transport layer with three modes, all carrying the same KGM1 packets:
//   local : BroadcastChannel. Same browser, zero setup. For instant demos.
//   ws    : WebSocket via relay-node. Reliable, ordered. Works everywhere.
//   wt    : WebTransport datagrams via relay-rs. Unreliable, unordered,
//           lowest latency. A dropped pose frame should be dropped, not
//           retransmitted late — that is why datagrams fit tracking data.

import { decodeRoomFrame, encodeRoomFrame, normalizeParticipantId } from './room-envelope.js';

export const TRANSPORT_FALLBACKS = {
  wt: ['wt', 'ws', 'local'],
  ws: ['ws', 'local'],
  'ws-json': ['ws-json', 'ws', 'local'],
  local: ['local'],
};

export const DEFAULT_CONNECT_TIMEOUT_MS = 3000;
export const WS_BACKPRESSURE_LIMIT_BYTES = 512 * 1024;

export class MinamoTransport extends EventTarget {
  constructor() {
    super();
    this.mode = null;
    this.requestedMode = null;
    this.room = null;
    this.role = null;
    this.participantId = null;
    this.token = '';
    this.wsEncoding = 'binary';
    this.bytesOut = 0;
    this.bytesIn = 0;
    this.droppedOut = 0;
    this.lastLatencyMs = null;
    this.fallbackHistory = [];
    this._bc = null;
    this._ws = null;
    this._wt = null;
    this._wtWriter = null;
    this._wtWriteInFlight = false;
    this._wtNewestDatagram = null;
    this.clockOffsetMs = 0;
  }

  _status(state, detail = '') {
    this.dispatchEvent(new CustomEvent('status', { detail: { state, detail, mode: this.mode, requestedMode: this.requestedMode } }));
  }

  _frame(bytes) {
    this.bytesIn += bytes.byteLength;
    const decoded = decodeRoomFrame(bytes);
    if (!decoded) return;
    const latencyMs = extractKgm1LatencyMs(decoded.frameBytes, performanceNow(), this.clockOffsetMs);
    if (latencyMs !== null) {
      this.lastLatencyMs = latencyMs;
      this.dispatchEvent(new CustomEvent('latency', { detail: { latencyMs } }));
    }
    this.dispatchEvent(new CustomEvent('participant-frame', {
      detail: {
        participantId: decoded.participantId,
        bytes: decoded.frameBytes,
        enveloped: decoded.enveloped,
        receivedAtMs: performanceNow(),
      },
    }));
    this.dispatchEvent(new CustomEvent('frame', { detail: decoded.frameBytes }));
  }

  getStats() {
    return {
      mode: this.mode,
      requestedMode: this.requestedMode,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
      droppedOut: this.droppedOut,
      latencyMs: this.lastLatencyMs,
      fallbackHistory: this.fallbackHistory.slice(),
    };
  }

  /**
   * @param {{ mode: string, room: string, role: string, participantId?: string, wsUrl?: string, wtUrl?: string, certHashHex?: string, token?: string, wsEncoding?: string }} options
   * @param {{ timeoutMs?: number, capabilities?: { local?: boolean, ws?: boolean, wt?: boolean } }} autoOptions
   */
  async connectAuto(options, autoOptions = {}) {
    const requestedMode = normalizeMode(options.mode);
    const plan = transportFallbackPlan(requestedMode, autoOptions.capabilities || detectTransportCapabilities());
    const attempts = [];
    let lastError = null;
    this.requestedMode = requestedMode;
    for (const mode of plan) {
      try {
        await promiseWithTimeout(
          this.connect({ ...options, mode, requestedMode, wsEncoding: mode === 'ws-json' ? 'json' : options.wsEncoding }),
          autoOptions.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
          `${mode} connection timed out`
        );
        this.fallbackHistory = attempts;
        if (mode !== requestedMode) this._status('open', `${mode} fallback active after ${requestedMode} failed`);
        return { mode, requestedMode, attempts };
      } catch (error) {
        lastError = error;
        attempts.push({ mode, error: error?.message || String(error) });
        this._status('fallback', `${mode} unavailable; trying fallback`);
        await this.close();
      }
    }
    this.fallbackHistory = attempts;
    throw new Error(`All transports failed for ${requestedMode}: ${lastError?.message || lastError || 'unknown error'}`);
  }

  /**
   * @param {{ mode: string, requestedMode?: string, room: string, role: string, participantId?: string, wsUrl?: string, wtUrl?: string, certHashHex?: string, token?: string, wsEncoding?: string }} options
   */
  async connect({ mode, requestedMode, room, role, participantId = '', wsUrl, wtUrl, certHashHex, token = '', wsEncoding = 'binary' }) {
    await this.close();
    mode = normalizeMode(mode);
    this.requestedMode = normalizeMode(requestedMode || mode);
    this.mode = mode;
    this.room = room;
    this.role = role;
    this.participantId = role === 'pub' ? normalizeParticipantId(participantId) : null;
    this.token = token;
    this.wsEncoding = wsEncoding === 'json' || mode === 'ws-json' ? 'json' : 'binary';

    if (mode === 'local') {
      this._bc = new BroadcastChannel(`minamo:${room}:${token || 'open'}`);
      this._bc.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) this._frame(new Uint8Array(ev.data));
      };
      this._status('open', `local channel "${room}"${token ? ' with token' : ''}`);
      return;
    }

    if (mode === 'ws' || mode === 'ws-json') {
      const url = new URL(wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      url.searchParams.set('room', room);
      url.searchParams.set('role', role);
      if (this.participantId) url.searchParams.set('participant', this.participantId);
      if (token) url.searchParams.set('token', token);
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this._ws = ws;
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error(`WebSocket failed: ${redactToken(url)}`));
        ws.onclose = () => reject(new Error('WebSocket closed during authentication'));
      });
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          this._frame(new Uint8Array(ev.data));
          return;
        }
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'kgm1' && msg.payload) {
              this._frame(base64ToBytes(msg.payload));
            }
          } catch {}
        }
      };
      ws.onclose = (ev) => this._status('closed', ev.reason || `WebSocket closed (${ev.code})`);
      this._status('open', `${this.wsEncoding === 'json' ? 'ws-json' : 'ws'} relay "${room}" as ${role}${token ? ' with token' : ''}`);
      return;
    }

    if (mode === 'wt') {
      if (typeof WebTransport === 'undefined') {
        throw new Error('WebTransport is not supported in this browser.');
      }
      const base = (wtUrl || 'https://localhost:4433').replace(/\/+$/, '');
      const tokenPath = token ? `/${encodeURIComponent(token)}` : '';
      const url = `${base}/room/${encodeURIComponent(room)}${tokenPath}/${role}`;
      /** @type {any} */
      const opts = {};
      const hex = (certHashHex || '').replace(/[^0-9a-fA-F]/g, '');
      if (hex.length === 64) {
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        opts.serverCertificateHashes = [{ algorithm: 'sha-256', value: bytes }];
      }
      const wt = new WebTransport(url, opts);
      this._wt = wt;
      await wt.ready;
      this._wtWriter = wt.datagrams.writable.getWriter();
      this._readDatagrams(wt);
      wt.closed
        .then(() => this._status('closed', 'WebTransport closed'))
        .catch((e) => this._status('closed', `WebTransport error: ${e.message}`));
      this._status('open', `wt relay "${room}" as ${role}${token ? ' with token' : ''}`);
      return;
    }

    throw new Error(`Unknown transport mode: ${mode}`);
  }

  async _readDatagrams(wt) {
    const reader = wt.datagrams.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this._frame(value);
      }
    } catch {
      // connection closed; the wt.closed handler reports status
    }
  }

  /** @param {ArrayBuffer} buf */
  send(buf) {
    const packet = this.role === 'pub' && this.participantId ? encodeRoomFrame(this.participantId, buf) : buf;
    this.bytesOut += packet.byteLength;
    if (this.mode === 'local' && this._bc) {
      this._bc.postMessage(packet);
    } else if (this.mode === 'ws' && this._ws && this._ws.readyState === WebSocket.OPEN) {
      if (this._ws.bufferedAmount > WS_BACKPRESSURE_LIMIT_BYTES) {
        this.droppedOut++;
        return false;
      }
      this._ws.send(packet);
    } else if (this.mode === 'ws-json' && this._ws && this._ws.readyState === WebSocket.OPEN) {
      if (this._ws.bufferedAmount > WS_BACKPRESSURE_LIMIT_BYTES) {
        this.droppedOut++;
        return false;
      }
      this._ws.send(JSON.stringify({ type: 'kgm1', payload: bytesToBase64(new Uint8Array(packet)) }));
    } else if (this.mode === 'wt' && this._wtWriter) {
      if (this._wtNewestDatagram) this.droppedOut++;
      this._wtNewestDatagram = new Uint8Array(packet);
      this._flushNewestDatagram();
    }
    return true;
  }

  _flushNewestDatagram() {
    if (this._wtWriteInFlight || !this._wtWriter || !this._wtNewestDatagram) return;
    const frame = this._wtNewestDatagram;
    this._wtNewestDatagram = null;
    this._wtWriteInFlight = true;
    this._wtWriter.write(frame)
      .catch(() => { this.droppedOut++; })
      .finally(() => {
        this._wtWriteInFlight = false;
        if (this._wtNewestDatagram) this._flushNewestDatagram();
      });
  }

  async close() {
    if (this._bc) { this._bc.close(); this._bc = null; }
    if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
    if (this._wt) { try { this._wt.close(); } catch {} this._wt = null; this._wtWriter = null; }
    this._wtNewestDatagram = null;
    this._wtWriteInFlight = false;
    this.mode = null;
    this.participantId = null;
  }
}

export class NewestOnlyMailbox {
  constructor() {
    this.frame = null;
    this.replaced = 0;
    this.delivered = 0;
  }

  push(frame) {
    if (this.frame !== null) this.replaced++;
    this.frame = frame;
  }

  take() {
    const frame = this.frame;
    this.frame = null;
    if (frame !== null) this.delivered++;
    return frame;
  }

  lagFrames() {
    return this.frame === null ? 0 : 1;
  }
}

export function detectTransportCapabilities(scope = globalThis) {
  return {
    local: typeof scope.BroadcastChannel !== 'undefined',
    ws: typeof scope.WebSocket !== 'undefined',
    wt: typeof scope.WebTransport !== 'undefined',
  };
}

/**
 * @param {string} mode
 * @param {{ local?: boolean, ws?: boolean, wt?: boolean }} capabilities
 */
export function transportFallbackPlan(mode, capabilities = detectTransportCapabilities()) {
  const requested = normalizeMode(mode);
  return (TRANSPORT_FALLBACKS[requested] || TRANSPORT_FALLBACKS.local)
    .filter((candidate) => {
      if (candidate === 'local') return capabilities.local !== false;
      if (candidate === 'ws' || candidate === 'ws-json') return capabilities.ws !== false;
      if (candidate === 'wt') return capabilities.wt !== false;
      return false;
    });
}

export function computeTransportLatencyMs(sourceTimestampMs, receiveTimestampMs, clockOffsetMs = 0) {
  const sent = Number(sourceTimestampMs);
  const received = Number(receiveTimestampMs);
  const offset = Number(clockOffsetMs) || 0;
  if (!Number.isFinite(sent) || !Number.isFinite(received)) return null;
  const latency = received + offset - sent;
  if (latency < -1000 || latency > 60_000) return null;
  return latency;
}

export function classifyCongestion({ bufferedBytes = 0, droppedFrames = 0, latencyMs = 0, targetLatencyMs = 80 } = {}) {
  if (bufferedBytes > WS_BACKPRESSURE_LIMIT_BYTES || droppedFrames > 30 || latencyMs > targetLatencyMs * 3) {
    return { state: 'severe', newestOnly: true, reduceDetail: true };
  }
  if (bufferedBytes > WS_BACKPRESSURE_LIMIT_BYTES / 4 || droppedFrames > 0 || latencyMs > targetLatencyMs) {
    return { state: 'congested', newestOnly: true, reduceDetail: false };
  }
  return { state: 'clear', newestOnly: false, reduceDetail: false };
}

export function transportSecurityNote({ token = '', origin = '', rawVideo = false } = {}) {
  const notes = ['motion frames only; raw camera video is not sent'];
  notes.push(token ? 'room token enabled' : 'room token optional but recommended');
  notes.push(origin ? `origin restricted to ${origin}` : 'configure MINAMO_ALLOWED_ORIGINS on public relays');
  if (rawVideo) notes.push('raw video must stay disabled for remote transport');
  return notes.join('; ');
}

function normalizeMode(mode) {
  return mode === 'wt' || mode === 'ws' || mode === 'ws-json' || mode === 'local' ? mode : 'local';
}

function extractKgm1LatencyMs(bytes, receivedAtMs, clockOffsetMs = 0) {
  if (!bytes || bytes.byteLength < 10) return null;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  if (dv.getUint16(0, true) !== 0x4b47 || dv.getUint8(2) !== 1) return null;
  return computeTransportLatencyMs(dv.getUint32(4, true), receivedAtMs, clockOffsetMs);
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

async function promiseWithTimeout(promise, timeoutMs, message) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function redactToken(url) {
  const safe = new URL(url);
  if (safe.searchParams.has('token')) safe.searchParams.set('token', '***');
  return safe.toString();
}

function base64ToBytes(value) {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}
