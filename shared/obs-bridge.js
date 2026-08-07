// obs-websocket v5 bridge: hand the compositing job to OBS instead of rebuilding
// it in a WebGL canvas.
//
// Minamo owns tracking and the avatar. Scene layout, backgrounds, transitions,
// alerts, audio mixing and recording are OBS's job, and OBS already does them
// better than we could. So rather than growing per-situation chrome inside the
// viewer, switching situations here creates (or updates) an OBS scene, points a
// browser source at the situation's viewer URL, positions it, and makes that
// scene current. Everything else in the scene stays the streamer's own.
//
// Only scene names, source names and viewer URLs cross this socket — never
// media, never a tracking frame. It is reviewed as such in
// scripts/check-privacy-invariants.mjs.
//
// Protocol reference: obs-websocket 5.x, opcodes Hello(0) / Identify(1) /
// Identified(2) / Request(6) / RequestResponse(7).

export const OBS_WEBSOCKET_DEFAULT_URL = 'ws://127.0.0.1:4455';
export const OBS_WEBSOCKET_RPC_VERSION = 1;

export const OBS_OPCODE = Object.freeze({
  hello: 0,
  identify: 1,
  identified: 2,
  event: 5,
  request: 6,
  requestResponse: 7,
});

/**
 * One situation resolved into the sources Minamo owns, as produced by
 * `situationObsPlan` in shared/situation-presets.js.
 *
 * @typedef {{
 *   situation?: string,
 *   sources: Array<{
 *     id: string,
 *     name: string,
 *     kind: string,
 *     url: string,
 *     bounds: {x: number, y: number, width: number, height: number},
 *   }>,
 * }} ObsPlan
 */

/** OBS_ALIGN_LEFT | OBS_ALIGN_TOP — bounds are given as a top-left box. */
const OBS_ALIGN_TOP_LEFT = 5;

/** Fit the source inside the bounds box without distorting its aspect ratio. */
const OBS_BOUNDS_SCALE_INNER = 'OBS_BOUNDS_SCALE_INNER';

function toBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256Base64(text, subtle) {
  return toBase64(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * Compute the obs-websocket v5 authentication string.
 *
 * `base64(sha256(base64(sha256(password + salt)) + challenge))` — the password
 * itself never leaves the page.
 *
 * @param {string} password
 * @param {{challenge: string, salt: string}} authentication
 * @param {SubtleCrypto} [subtle]
 */
export async function buildObsAuthResponse(password, authentication, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('WebCrypto SubtleCrypto is required to authenticate with OBS.');
  const secret = await sha256Base64(`${password}${authentication.salt}`, subtle);
  return sha256Base64(`${secret}${authentication.challenge}`, subtle);
}

/**
 * Build the Identify payload for a received Hello.
 *
 * An OBS with authentication disabled sends no `authentication` block; sending a
 * password anyway is not an error, it is simply unused, so the caller does not
 * have to know which mode OBS is in.
 *
 * @param {{op: number, d: {rpcVersion: number, authentication?: {challenge: string, salt: string}}}} hello
 * @param {string} [password]
 * @param {SubtleCrypto} [subtle]
 */
export async function buildIdentifyPayload(hello, password = '', subtle = globalThis.crypto?.subtle) {
  const challenge = hello?.d?.authentication;
  const payload = { rpcVersion: OBS_WEBSOCKET_RPC_VERSION };
  if (challenge) {
    if (!password) throw new Error('This OBS requires a WebSocket password.');
    payload.authentication = await buildObsAuthResponse(password, challenge, subtle);
  }
  return { op: OBS_OPCODE.identify, d: payload };
}

/**
 * Parse one socket message, rejecting anything that is not a v5 envelope.
 *
 * @param {string} raw
 */
export function parseObsMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.op !== 'number') return null;
  return parsed;
}

/**
 * Requests that make a situation's scene and its Minamo-owned sources exist.
 *
 * Idempotent by construction: the caller passes what OBS already has, and an
 * existing scene is reused rather than recreated, an existing browser source is
 * re-pointed rather than duplicated. That matters because a streamer switches
 * situations mid-stream, and a duplicated source would stack a second avatar on
 * top of the first.
 *
 * @param {ObsPlan} plan
 * @param {{sceneName: string, existingScenes?: string[], existingInputs?: string[]}} options
 */
export function buildObsSourceRequests(plan, options) {
  const { sceneName } = options;
  const existingScenes = options.existingScenes || [];
  const existingInputs = options.existingInputs || [];
  const requests = [];

  if (!existingScenes.includes(sceneName)) {
    requests.push({ requestType: 'CreateScene', requestData: { sceneName } });
  }

  for (const source of plan.sources) {
    const inputSettings = {
      url: source.url,
      width: source.bounds.width,
      height: source.bounds.height,
      // The avatar page clears to alpha itself; OBS must not paint one under it.
      css: 'body { background-color: rgba(0, 0, 0, 0); margin: 0; overflow: hidden; }',
      // Keeping the source alive across scene switches avoids a reconnect (and a
      // visible pop) every time the streamer changes situation.
      shutdown: false,
      restart_when_active: false,
    };
    if (existingInputs.includes(source.name)) {
      requests.push({ requestType: 'SetInputSettings', requestData: { inputName: source.name, inputSettings, overlay: true } });
    } else {
      requests.push({
        requestType: 'CreateInput',
        requestData: {
          sceneName,
          inputName: source.name,
          inputKind: 'browser_source',
          inputSettings,
          sceneItemEnabled: true,
        },
      });
    }
  }

  return requests;
}

/**
 * Position each Minamo-owned source, given the scene item ids OBS returned.
 *
 * A source with no known id is skipped rather than guessed: an unpositioned
 * source is a visible, fixable problem, while a transform aimed at the wrong id
 * silently moves something the streamer put there.
 *
 * @param {ObsPlan} plan
 * @param {{sceneName: string, sceneItemIds: Record<string, number>}} options
 */
export function buildObsTransformRequests(plan, options) {
  const { sceneName, sceneItemIds } = options;
  return plan.sources
    .filter((source) => Number.isInteger(sceneItemIds?.[source.name]))
    .map((source) => ({
      requestType: 'SetSceneItemTransform',
      requestData: {
        sceneName,
        sceneItemId: sceneItemIds[source.name],
        sceneItemTransform: {
          positionX: source.bounds.x,
          positionY: source.bounds.y,
          alignment: OBS_ALIGN_TOP_LEFT,
          boundsType: OBS_BOUNDS_SCALE_INNER,
          boundsAlignment: OBS_ALIGN_TOP_LEFT,
          boundsWidth: source.bounds.width,
          boundsHeight: source.bounds.height,
        },
      },
    }));
}

/**
 * Live connection to OBS.
 *
 * `WebSocket` and `send` are injectable so the request/response plumbing can be
 * tested without an OBS running.
 *
 * @param {{url?: string, password?: string, socketFactory?: (url: string) => WebSocket, timeoutMs?: number}} [options]
 */
export function createObsBridge(options = {}) {
  const url = options.url || OBS_WEBSOCKET_DEFAULT_URL;
  const password = options.password || '';
  const timeoutMs = options.timeoutMs ?? 8000;
  const socketFactory = options.socketFactory || ((target) => new WebSocket(target));

  let socket = null;
  let identified = false;
  let nextRequestId = 1;
  const pending = new Map();

  // Every outbound frame goes through here: one place to serialize, one place
  // for the privacy inventory to point at.
  function dispatch(message) {
    if (!socket) throw new Error('Not connected to OBS.');
    socket.send(JSON.stringify(message));
  }

  function settleAll(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  function handleRequestResponse(payload) {
    const entry = pending.get(payload.requestId);
    if (!entry) return;
    pending.delete(payload.requestId);
    clearTimeout(entry.timer);
    if (payload.requestStatus?.result) entry.resolve(payload.responseData || {});
    else {
      entry.reject(new Error(
        `OBS rejected ${payload.requestType}: ${payload.requestStatus?.comment || payload.requestStatus?.code || 'unknown error'}`,
      ));
    }
  }

  /** @returns {Promise<void>} */
  function connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      socket = socketFactory(url);
      const timer = setTimeout(() => finish(new Error('Timed out connecting to OBS.')), timeoutMs);

      socket.addEventListener('message', async (event) => {
        const message = parseObsMessage(typeof event.data === 'string' ? event.data : '');
        if (!message) return;
        if (message.op === OBS_OPCODE.hello) {
          try {
            dispatch(await buildIdentifyPayload(message, password));
          } catch (error) {
            clearTimeout(timer);
            finish(error instanceof Error ? error : new Error(String(error)));
          }
          return;
        }
        if (message.op === OBS_OPCODE.identified) {
          identified = true;
          clearTimeout(timer);
          finish();
          return;
        }
        if (message.op === OBS_OPCODE.requestResponse) handleRequestResponse(message.d || {});
      });

      socket.addEventListener('error', () => {
        clearTimeout(timer);
        finish(new Error(`Could not reach OBS at ${url}. Is obs-websocket enabled?`));
      });

      socket.addEventListener('close', () => {
        identified = false;
        clearTimeout(timer);
        settleAll(new Error('OBS connection closed.'));
        finish(new Error('OBS connection closed before identifying.'));
      });
    });
  }

  function call(requestType, requestData = {}) {
    const requestId = String(nextRequestId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`OBS request ${requestType} timed out.`));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try {
        dispatch({ op: OBS_OPCODE.request, d: { requestType, requestId, requestData } });
      } catch (error) {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /** OBS's real canvas, so a 1080p layout can be scaled onto it. */
  async function videoCanvas() {
    const settings = await call('GetVideoSettings');
    return { width: settings.baseWidth, height: settings.baseHeight };
  }

  /**
   * Realize one situation plan in OBS and make its scene current.
   *
   * @param {ObsPlan} plan
   * @param {string} sceneName
   */
  async function applyPlan(plan, sceneName) {
    const [scenes, inputs] = await Promise.all([call('GetSceneList'), call('GetInputList')]);
    const existingScenes = (scenes.scenes || []).map((scene) => scene.sceneName);
    const existingInputs = (inputs.inputs || []).map((input) => input.inputName);

    for (const request of buildObsSourceRequests(plan, { sceneName, existingScenes, existingInputs })) {
      await call(request.requestType, request.requestData);
    }

    // A source that already existed in another scene has no item in this one
    // until it is added, so resolve ids after the create/update pass.
    const sceneItemIds = {};
    for (const source of plan.sources) {
      try {
        const found = await call('GetSceneItemId', { sceneName, sourceName: source.name });
        sceneItemIds[source.name] = found.sceneItemId;
      } catch {
        // Left unpositioned on purpose; see buildObsTransformRequests.
      }
    }

    for (const request of buildObsTransformRequests(plan, { sceneName, sceneItemIds })) {
      await call(request.requestType, request.requestData);
    }

    await call('SetCurrentProgramScene', { sceneName });
    return { sceneName, positioned: Object.keys(sceneItemIds).length };
  }

  function close() {
    settleAll(new Error('OBS bridge closed.'));
    identified = false;
    socket?.close();
    socket = null;
  }

  return {
    connect,
    call,
    videoCanvas,
    applyPlan,
    close,
    get identified() {
      return identified;
    },
  };
}
