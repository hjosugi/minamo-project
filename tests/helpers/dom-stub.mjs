// A DOM stub just rich enough to import the shipped page entry modules (#263).
//
// The point is not to simulate a browser — it is to prove that loading
// tracker.js / replay.js / desktop.js does not throw at module scope. That class
// of bug is invisible to every other check we run: the bundle builds, types pass,
// and the page silently does nothing. landing/app.js shipped exactly that in
// v0.1.11/v0.1.12 (a temporal-dead-zone ReferenceError, fixed in #302), so these
// modules get loaded here for real rather than mocked away.
//
// Elements are memoized per id, so a module that captures `$('statusChip')` once
// and writes to it later is observable from the test.

/** A permissive canvas context: every property is a no-op function. */
const stubContext = () => new Proxy({}, {
  get: (target, prop) => {
    if (prop in target) return target[prop];
    // Canvas code reads back a few values; hand out a benign object/function.
    if (prop === 'canvas') return { width: 1280, height: 720 };
    if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (prop === 'measureText') return () => ({ width: 0 });
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop() {} });
    }
    return () => {};
  },
  set: () => true,
});

export function createStubElement(tagName = 'div', id = '') {
  const attributes = Object.create(null);
  const children = [];
  const listeners = new Map();
  const element = {
    tagName: String(tagName).toUpperCase(),
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    checked: false,
    disabled: false,
    hidden: false,
    href: '',
    max: 0,
    selected: false,
    className: '',
    style: {},
    dataset: {},
    files: [],
    options: [],
    children,
    listeners,
    // Recorded rather than ignored: styling that keys off class toggles is easy
    // to break silently (see the desktop virtual-camera tone), so tests can
    // assert on it.
    appliedClasses: new Set(),
    classList: {
      add(name) { element.appliedClasses.add(name); },
      remove(name) { element.appliedClasses.delete(name); },
      toggle(name, force) {
        const on = force === undefined ? !element.appliedClasses.has(name) : Boolean(force);
        if (on) element.appliedClasses.add(name);
        else element.appliedClasses.delete(name);
        return on;
      },
      contains: (name) => element.appliedClasses.has(name),
    },
    getContext: () => stubContext(),
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    setAttribute: (name, value) => { attributes[name] = String(value); },
    removeAttribute: (name) => { delete attributes[name]; },
    hasAttribute: (name) => name in attributes,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: () => true,
    append: (...nodes) => children.push(...nodes),
    appendChild: (node) => { children.push(node); return node; },
    replaceChildren: (...nodes) => { children.length = 0; children.push(...nodes); },
    remove: () => {},
    querySelector: () => createStubElement('div'),
    querySelectorAll: () => [],
    closest: () => null,
    focus: () => {},
    click: () => {},
    select: () => {},
    setSelectionRange: () => {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 1280, height: 720, top: 0, left: 0, right: 1280, bottom: 720 }),
    play: () => Promise.resolve(),
    pause: () => {},
    toDataURL: () => 'data:image/png;base64,',
    width: 1280,
    height: 720,
    videoWidth: 1280,
    videoHeight: 720,
  };
  return element;
}

// A page can start async work during import (pairing requests, camera
// enumeration) that outlives the stubbed window. When such a continuation
// touches a global after it is restored it rejects with "document is not
// defined", and Node kills the entire suite with a bare stack that names no
// page — an unexplained crash rather than a test failure.
//
// Installing a process-level listener stops Node from aborting and records the
// reason instead. The listener is intentionally never removed: a late rejection
// can surface long after the call that caused it, which is exactly the case
// that used to be untraceable. Callers assert on takeLateFailures().
const lateFailures = [];
let lateFailureCaptureArmed = false;

function armLateFailureCapture() {
  if (lateFailureCaptureArmed) return;
  lateFailureCaptureArmed = true;
  process.on('unhandledRejection', (reason) => {
    lateFailures.push(reason instanceof Error ? (reason.stack ?? reason.message) : String(reason));
  });
}

/** Return and clear everything that escaped a stubbed page load so far. */
export function takeLateFailures() {
  return lateFailures.splice(0, lateFailures.length);
}

/**
 * Install stub browser globals, run `body`, then restore the originals.
 * Returns whatever `body` resolves to, plus the element registry for assertions.
 */
export async function withStubbedDom(body, options = {}) {
  const { language = 'en', stored = null, extraGlobals = {} } = options;
  const elements = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, createStubElement('div', id));
    return elements.get(id);
  };
  const documentElement = { lang: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } };
  const doc = {
    documentElement,
    body: createStubElement('body'),
    head: createStubElement('head'),
    title: '',
    hidden: false,
    visibilityState: 'visible',
    getElementById: byId,
    createElement: (tag) => createStubElement(tag),
    createElementNS: (_ns, tag) => createStubElement(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    querySelector: () => createStubElement('div'),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    execCommand: () => true,
  };

  const store = new Map();
  if (stored) for (const [key, value] of Object.entries(stored)) store.set(key, value);

  const globals = {
    document: doc,
    navigator: {
      language,
      languages: [language],
      clipboard: { writeText: () => Promise.resolve() },
      mediaDevices: {
        getUserMedia: () => Promise.reject(new Error('no camera in tests')),
        enumerateDevices: () => Promise.resolve([]),
        addEventListener: () => {},
      },
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    location: new URL('http://localhost/'),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    // Tests must never reach the network: a page that fetches on load would
    // otherwise hit a real socket and make the suite depend on the environment.
    fetch: () => Promise.reject(new Error('network is disabled in tests')),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => new Proxy({}, {
      get: (_target, prop) => (prop === 'getPropertyValue' ? () => '' : ''),
    }),
    // A no-op BroadcastChannel keeps local-mode transports inert.
    BroadcastChannel: class {
      constructor(name) { this.name = name; }
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
    Option: class {
      constructor(text = '', value = '') {
        Object.assign(this, createStubElement('option'), { textContent: text, value, text });
      }
    },
    ...extraGlobals,
  };
  globals.window = globals;
  globals.self = globals;

  const restore = [];
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restore.push(() => (previous
      ? Object.defineProperty(globalThis, name, previous)
      : Reflect.deleteProperty(globalThis, name)));
  }

  armLateFailureCapture();
  try {
    const result = await body({ document: doc, documentElement, elements, byId });
    // Let async work started during import settle while the stubs are still
    // installed, so a continuation sees the stub rather than a restored global.
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
    return { result, elements, documentElement };
  } finally {
    for (const undo of restore.reverse()) undo();
  }
}
