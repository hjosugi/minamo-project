// Transport layer with three modes, all carrying the same KGM1 packets:
//   local : BroadcastChannel. Same browser, zero setup. For instant demos.
//   ws    : WebSocket via relay-node. Reliable, ordered. Works everywhere.
//   wt    : WebTransport datagrams via relay-rs. Unreliable, unordered,
//           lowest latency. A dropped pose frame should be dropped, not
//           retransmitted late — that is why datagrams fit tracking data.

export class KagamiTransport extends EventTarget {
  constructor() {
    super();
    this.mode = null;
    this.room = null;
    this.role = null;
    this.bytesOut = 0;
    this.bytesIn = 0;
    this._bc = null;
    this._ws = null;
    this._wt = null;
    this._wtWriter = null;
  }

  _status(state, detail = '') {
    this.dispatchEvent(new CustomEvent('status', { detail: { state, detail } }));
  }

  _frame(bytes) {
    this.bytesIn += bytes.byteLength;
    this.dispatchEvent(new CustomEvent('frame', { detail: bytes }));
  }

  async connect({ mode, room, role, wsUrl, wtUrl, certHashHex, token = '' }) {
    await this.close();
    this.mode = mode;
    this.room = room;
    this.role = role;
    this.token = token;

    if (mode === 'local') {
      this._bc = new BroadcastChannel(`kagami:${room}:${token || 'open'}`);
      this._bc.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) this._frame(new Uint8Array(ev.data));
      };
      this._status('open', `local channel "${room}"${token ? ' with token' : ''}`);
      return;
    }

    if (mode === 'ws') {
      const url = new URL(wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      url.searchParams.set('room', room);
      url.searchParams.set('role', role);
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
      this._status('open', `ws relay "${room}" as ${role}${token ? ' with token' : ''}`);
      return;
    }

    if (mode === 'wt') {
      if (typeof WebTransport === 'undefined') {
        throw new Error('WebTransport is not supported in this browser.');
      }
      const base = (wtUrl || 'https://localhost:4433').replace(/\/+$/, '');
      const tokenPath = token ? `/${encodeURIComponent(token)}` : '';
      const url = `${base}/room/${encodeURIComponent(room)}${tokenPath}/${role}`;
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
    this.bytesOut += buf.byteLength;
    if (this.mode === 'local' && this._bc) {
      this._bc.postMessage(buf);
    } else if (this.mode === 'ws' && this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(buf);
    } else if (this.mode === 'wt' && this._wtWriter) {
      // Fire and forget. Datagrams may be dropped; that is the contract.
      this._wtWriter.write(new Uint8Array(buf)).catch(() => {});
    }
  }

  async close() {
    if (this._bc) { this._bc.close(); this._bc = null; }
    if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
    if (this._wt) { try { this._wt.close(); } catch {} this._wt = null; this._wtWriter = null; }
    this.mode = null;
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
