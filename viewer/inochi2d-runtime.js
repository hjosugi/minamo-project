const INOCHI_MAGIC = new Uint8Array([0x54, 0x52, 0x4e, 0x53, 0x52, 0x54, 0x53, 0x00]);
const MAX_JSON_PAYLOAD_BYTES = 64 * 1024 * 1024;
const DEFAULT_CANVAS_SIZE = 1024;

export const INOX2D_UPSTREAM_REVISION = 'df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba';
export const INOCHI2D_SUPPORTED_EXTENSIONS = Object.freeze(['.inp', '.inx']);

let runtimeSequence = 0;

/**
 * Parse only the length-prefixed JSON header shared by .inp and .inx files.
 * Texture bytes never pass through JSON.parse.
 *
 * @param {ArrayBuffer | ArrayBufferView} input
 */
export function inspectInochi2DFile(input) {
  const bytes = asUint8Array(input);
  if (bytes.byteLength < 12) throw new Error('Inochi2D file is truncated before its JSON payload.');
  for (let i = 0; i < INOCHI_MAGIC.length; i++) {
    if (bytes[i] !== INOCHI_MAGIC[i]) throw new Error('Inochi2D magic is invalid; expected an .inp or .inx puppet.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadLength = view.getUint32(8, false);
  if (payloadLength > MAX_JSON_PAYLOAD_BYTES) throw new Error('Inochi2D JSON payload exceeds the 64 MiB safety limit.');
  if (payloadLength > bytes.byteLength - 12) throw new Error('Inochi2D JSON payload length exceeds the file size.');

  let payload;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + payloadLength));
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Inochi2D puppet JSON is invalid. (${errorMessage(error)})`);
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.param)) {
    throw new Error('Inochi2D puppet JSON does not contain a parameter list.');
  }

  const parameters = payload.param
    .filter((parameter) => parameter && typeof parameter.name === 'string' && parameter.name.trim())
    .map((parameter) => Object.freeze({
      name: parameter.name,
      isVec2: Boolean(parameter.is_vec2),
      min: finitePair(parameter.min, [-1, -1]),
      max: finitePair(parameter.max, [1, 1]),
      defaults: finitePair(parameter.defaults, [0, 0]),
    }));

  return Object.freeze({
    name: stringOrEmpty(payload.meta?.name),
    artist: stringOrEmpty(payload.meta?.artist),
    version: stringOrEmpty(payload.meta?.version),
    parameters: Object.freeze(parameters),
  });
}

/** @param {string} filename */
export function isInochi2DFile(filename) {
  return INOCHI2D_SUPPORTED_EXTENSIONS.some((extension) => String(filename || '').toLowerCase().endsWith(extension));
}

/** @param {unknown} error */
export function formatInochi2DError(error) {
  const message = errorMessage(error);
  if (/BC7/i.test(message)) {
    return `Inochi2D load failed: BC7 puppet textures are not supported by the pinned Inox2D WebGL backend. Re-export with PNG or TGA textures. (${message})`;
  }
  if (/WebGL2|context/i.test(message)) {
    return `Inochi2D load failed: WebGL2 with a stencil buffer is required. Check browser GPU diagnostics. (${message})`;
  }
  if (/magic|truncated|payload|JSON|parse/i.test(message)) {
    return `Inochi2D load failed: the puppet is corrupt or not a supported .inp/.inx file. (${message})`;
  }
  return `Inochi2D load failed. The pinned Inox2D backend may not support a feature used by this puppet. (${message})`;
}

export class Inochi2DRuntime {
  /**
   * @param {{
   *   documentRef?: Document,
   *   moduleLoader?: () => Promise<any>,
   *   canvasSize?: number,
   * }} [options]
   */
  constructor(options = {}) {
    this.documentRef = options.documentRef || globalThis.document;
    this.moduleLoader = options.moduleLoader || (() => import('./vendor/inochi2d/minamo_inochi2d.js'));
    this.canvasSize = Math.max(256, Math.min(2048, Number(options.canvasSize) || DEFAULT_CANVAS_SIZE));
    this.canvas = null;
    this.model = null;
    this.metadata = null;
    this.parameterNames = [];
    this.disposed = false;
  }

  /** @param {ArrayBuffer | ArrayBufferView} bytes */
  async load(bytes) {
    if (this.model) throw new Error('Inochi2D runtime is already loaded.');
    if (this.disposed) throw new Error('Inochi2D runtime has been disposed.');
    if (!this.documentRef?.createElement || !this.documentRef.body) {
      throw new Error('Inochi2D runtime requires a browser document.');
    }
    this.metadata = inspectInochi2DFile(bytes);
    this.parameterNames = this.metadata.parameters.map((parameter) => parameter.name);

    const canvas = this.documentRef.createElement('canvas');
    canvas.id = `minamo-inochi2d-${++runtimeSequence}`;
    canvas.width = this.canvasSize;
    canvas.height = this.canvasSize;
    canvas.className = 'inochi2d-render-target';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;pointer-events:none;';
    this.documentRef.body.appendChild(canvas);
    this.canvas = canvas;

    try {
      const module = await this.moduleLoader();
      if (typeof module.default !== 'function' || typeof module.InoxModel !== 'function') {
        throw new Error('Inochi2D WASM module has an invalid export shape.');
      }
      await module.default();
      this.model = new module.InoxModel(asUint8Array(bytes), canvas.id);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** @param {string} name @param {number | readonly number[]} value */
  setParam(name, value) {
    this.assertLoaded();
    if (Array.isArray(value)) {
      this.model.set_parameter_2d(name, finite(value[0]), finite(value[1]));
    } else {
      this.model.set_parameter(name, finite(value));
    }
  }

  /** @param {number} dtSec */
  update(dtSec) {
    this.assertLoaded();
    this.model.update(Math.max(0, Math.min(0.1, finite(dtSec))));
  }

  /** @param {{needsUpdate?: boolean} | HTMLCanvasElement | OffscreenCanvas} [target] */
  render(target = this.canvas) {
    this.assertLoaded();
    this.model.draw();
    if (target && 'needsUpdate' in target) target.needsUpdate = true;
    if (target && target !== this.canvas && 'getContext' in target && typeof target.getContext === 'function') {
      const context = target.getContext('2d');
      context?.clearRect(0, 0, target.width, target.height);
      context?.drawImage(this.canvas, 0, 0, target.width, target.height);
    }
  }

  listParams() {
    return Object.freeze([...this.parameterNames]);
  }

  listParameterMetadata() {
    return this.metadata?.parameters || Object.freeze([]);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { this.model?.free?.(); } catch {}
    try { this.canvas?.getContext?.('webgl2')?.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch {}
    this.canvas?.remove?.();
    this.model = null;
    this.canvas = null;
    this.metadata = null;
    this.parameterNames = [];
  }

  assertLoaded() {
    if (this.disposed) throw new Error('Inochi2D runtime has been disposed.');
    if (!this.model) throw new Error('Inochi2D runtime is not loaded.');
  }
}

function asUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('Inochi2D input must be an ArrayBuffer or typed array.');
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finitePair(value, fallback) {
  if (!Array.isArray(value) || value.length < 2) return Object.freeze([...fallback]);
  return Object.freeze([finite(value[0]), finite(value[1])]);
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}
