import {
  buildPhoneTrackerUrl,
  buildViewerPairingUrl,
  pairingTokenApiUrl,
  pairingTokenState,
  parsePairingRoom,
  redactPairingUrl,
} from '../shared/pairing.js';

const invoke = window.__TAURI__?.core?.invoke;

const fallbackStatus = {
  runtime: 'web preview',
  pages: [
    { name: 'Tracker', route: 'tracker/index.html', bundled: true },
    { name: 'Viewer', route: 'viewer/index.html', bundled: true },
    { name: 'Replay', route: 'replay/index.html', bundled: true },
  ],
  virtualCamera: {
    os: navigator.platform || 'browser',
    backend: 'Tauri command unavailable',
    device: 'browser preview',
    state: 'desktop runtime not attached',
  },
};

const $ = (id) => document.getElementById(id);

const phonePairing = {
  token: '',
  room: '',
  expiresAt: 0,
  trackerUrl: '',
  viewerUrl: '',
  relayUrl: '',
  timer: null,
  generating: false,
};

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

async function command(name, payload) {
  if (!invoke) throw new Error('Tauri runtime is not available');
  return invoke(name, payload);
}

async function readStatus() {
  if (!invoke) return fallbackStatus;
  return command('desktop_status');
}

function renderPages(pages) {
  const list = $('pageList');
  if (!list) return;
  list.replaceChildren();
  for (const page of pages) {
    const row = document.createElement('div');
    row.className = 'page-row';
    row.innerHTML = `<span>${page.name}</span><span>${page.bundled ? 'bundled' : 'missing'}</span>`;
    list.append(row);
  }
}

function renderStatus(status) {
  setText('runtimeStatus', status.runtime);
  renderPages(status.pages || []);

  const camera = status.virtualCamera || fallbackStatus.virtualCamera;
  setText('vcOs', camera.os);
  setText('vcBackend', camera.backend);
  setText('vcDevice', camera.device);
  setText('vcState', camera.state);

  const cameraStatus = $('cameraStatus');
  if (cameraStatus) {
    cameraStatus.textContent = camera.state;
    cameraStatus.classList.toggle('ok', /loaded|ready|visible/i.test(camera.state));
    cameraStatus.classList.toggle('err', /not installed|unavailable/i.test(camera.state));
  }
}

async function refreshStatus() {
  try {
    renderStatus(await readStatus());
  } catch (error) {
    renderStatus({
      ...fallbackStatus,
      virtualCamera: {
        ...fallbackStatus.virtualCamera,
        state: error instanceof Error ? error.message : 'status error',
      },
    });
  }
}

function bindLaunchButtons() {
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', async () => {
      const commandName = button.getAttribute('data-command');
      const fallback = button.getAttribute('data-fallback');
      try {
        await command(commandName);
      } catch {
        if (fallback) window.open(fallback, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

function drawSignal() {
  const canvas = $('signalCanvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  let t = 0;

  function frame() {
    t += 0.018;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f9fbfa';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#d9e1dd';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    drawWave(ctx, width, height, t, '#3158a4', 0.92, 0);
    drawWave(ctx, width, height, t * 1.31, '#0f8f6f', 0.58, 1.4);
    drawWave(ctx, width, height, t * 0.86, '#b46a12', 0.34, 2.2);
    requestAnimationFrame(frame);
  }

  frame();
}

function drawWave(ctx, width, height, time, color, amplitude, phase) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let x = 0; x < width; x += 4) {
    const n = x / width;
    const y =
      height * 0.5 +
      Math.sin(n * 8 + time + phase) * height * 0.11 * amplitude +
      Math.sin(n * 23 + time * 1.8 + phase) * height * 0.035;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function initializePhonePairing() {
  $('pairingRoom').value = defaultPairingRoom();
  $('pairingTrackerBase').value = defaultTrackerBaseUrl();
  $('pairingRelayUrl').value = defaultRelayUrl();
  $('pairingForm')?.addEventListener('submit', generatePhonePairing);
  $('btnExpirePairing')?.addEventListener('click', expirePhonePairing);
  $('btnCopyTrackerUrl')?.addEventListener('click', () => copyPairingUrl('tracker'));
  $('btnCopyViewerUrl')?.addEventListener('click', () => copyPairingUrl('viewer'));
  $('pairingForm')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    generatePhonePairing(event);
  });
  $('pairingForm')?.addEventListener('input', () => {
    if (pairingIsActive()) setPairingStatus('Settings changed. Regenerate the QR to apply them.');
  });
  window.addEventListener('beforeunload', stopPairingTimer, { once: true });
  queueMicrotask(() => generatePhonePairing());
}

async function generatePhonePairing(event) {
  event?.preventDefault?.();
  if (phonePairing.generating) return;
  phonePairing.generating = true;
  setPairingBusy(true);
  setPairingStatus(phonePairing.token ? 'Regenerating a short-lived token…' : 'Requesting a short-lived token…');
  try {
    const room = parsePairingRoom($('pairingRoom').value);
    const trackerBase = normalizeTrackerBaseUrl($('pairingTrackerBase').value);
    const relayUrl = normalizeRelayUrl($('pairingRelayUrl').value);
    const ttlSeconds = Number($('pairingTtl').value);
    const canRotateOnRelay = phonePairing.relayUrl === relayUrl && phonePairing.room === room;
    if (phonePairing.token && !canRotateOnRelay && phonePairing.relayUrl) {
      const revoked = await pairingTokenRequest('DELETE', phonePairing.relayUrl, {
        room: phonePairing.room,
        token: phonePairing.token,
      });
      if (!revoked.revoked && pairingIsActive()) {
        throw new Error('The previous relay did not confirm token expiry.');
      }
      clearPairingSecrets();
      renderInactivePairing('expired', 'Previous pairing expired');
    }
    const response = await pairingTokenRequest('POST', relayUrl, {
      room,
      ttlSeconds,
      previousToken: canRotateOnRelay ? phonePairing.token || undefined : undefined,
    });
    if (response.room !== room || !/^[a-zA-Z0-9_-]{24,128}$/.test(String(response.token || ''))) {
      throw new Error('Relay returned an invalid pairing token.');
    }
    const expiresAt = Number(response.expiresAt);
    if (pairingTokenState(expiresAt).state !== 'active') {
      throw new Error('Relay returned an already-expired pairing token.');
    }
    const options = {
      mode: 'ws',
      room,
      token: response.token,
      wsUrl: relayUrl,
    };
    const trackerUrl = buildPhoneTrackerUrl({
      ...options,
      base: trackerBase,
      camera: $('pairingCamera').value,
      resolution: $('pairingResolution').value,
      fps: Number($('pairingFps').value),
      mirror: $('pairingMirror').checked,
    });
    const viewerUrl = buildViewerPairingUrl({
      ...options,
      base: viewerBaseFromTracker(trackerBase),
    });
    Object.assign(phonePairing, {
      token: response.token,
      room,
      expiresAt,
      trackerUrl,
      viewerUrl,
      relayUrl,
    });
    try {
      await renderPairingQr($('pairingQr'), trackerUrl, relayUrl);
    } catch {
      renderActivePairing();
      $('pairingQrShell').dataset.state = 'error';
      $('pairingQrEmpty').textContent = 'QR rendering failed; use the tracker link';
      setPairingStatus('The token is active, but QR rendering failed. Use the accessible tracker link.');
      startPairingTimer();
      return;
    }
    renderActivePairing();
    startPairingTimer();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate pairing QR.';
    if (!pairingIsActive()) renderInactivePairing('error', 'QR unavailable');
    setPairingStatus(message);
    $('pairingCountdown').dataset.state = 'error';
  } finally {
    phonePairing.generating = false;
    setPairingBusy(false);
  }
}

async function expirePhonePairing() {
  if (!phonePairing.token) return;
  setPairingBusy(true);
  setPairingStatus('Expiring the current pairing token…');
  try {
    const response = await pairingTokenRequest('DELETE', phonePairing.relayUrl, {
      room: phonePairing.room,
      token: phonePairing.token,
    });
    if (!response.revoked && pairingIsActive()) throw new Error('Relay did not confirm token expiry.');
    clearPairingSecrets();
    renderInactivePairing('expired', 'Pairing token expired');
    setPairingStatus('The token was invalidated. Generate a new QR to pair again.');
  } catch (error) {
    setPairingStatus(error instanceof Error ? error.message : 'Unable to expire pairing token.');
  } finally {
    setPairingBusy(false);
  }
}

async function pairingTokenRequest(method, relayUrl, body) {
  const response = await fetch(pairingTokenApiUrl(relayUrl), {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  let data = {};
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Relay token request failed (${response.status}).`);
  }
  return data;
}

async function renderPairingQr(canvas, payload, relayUrl) {
  try {
    const module = await import('qrcode');
    await module.default.toCanvas(canvas, payload, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 300,
      color: { dark: '#15201dff', light: '#ffffffff' },
    });
    return;
  } catch {}

  const apiUrl = new URL(pairingTokenApiUrl(relayUrl));
  apiUrl.pathname = '/api/pairing-qr';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.svg !== 'string') {
    throw new Error(typeof data.error === 'string' ? data.error : 'QR renderer is unavailable.');
  }
  await drawSvgOnCanvas(canvas, data.svg);
}

async function drawSvgOnCanvas(canvas, svg) {
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Unable to draw the pairing QR.'));
      image.src = objectUrl;
    });
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    canvas.width = 300;
    canvas.height = 300;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderActivePairing() {
  const qrShell = $('pairingQrShell');
  qrShell.dataset.state = 'active';
  $('pairingQrEmpty').textContent = '';
  $('pairingQr').setAttribute(
    'aria-label',
    `Phone tracker pairing QR for room ${phonePairing.room}. Token expires at ${new Date(phonePairing.expiresAt).toLocaleTimeString()}.`,
  );
  renderPairingLink('tracker', phonePairing.trackerUrl);
  renderPairingLink('viewer', phonePairing.viewerUrl);
  $('btnCopyTrackerUrl').disabled = false;
  $('btnCopyViewerUrl').disabled = false;
  $('btnExpirePairing').disabled = false;
  $('btnGeneratePairing').textContent = 'Regenerate QR';
  setPairingStatus('QR ready. Scan it on the phone or use the token-redacted fallback link.');
  updatePairingCountdown();
}

function renderInactivePairing(state, label) {
  stopPairingTimer();
  $('pairingQrShell').dataset.state = state;
  $('pairingQrEmpty').textContent = label;
  $('pairingQr').setAttribute('aria-label', label);
  $('trackerUrlPreview').textContent = 'not available';
  $('viewerUrlPreview').textContent = 'not available';
  disablePairingLink('tracker');
  disablePairingLink('viewer');
  $('btnCopyTrackerUrl').disabled = true;
  $('btnCopyViewerUrl').disabled = true;
  $('btnExpirePairing').disabled = true;
  $('btnGeneratePairing').textContent = 'Generate QR';
  $('pairingCountdown').textContent = state === 'expired' ? 'expired' : 'not generated';
  $('pairingCountdown').dataset.state = state;
}

function renderPairingLink(kind, url) {
  $(`${kind}UrlPreview`).textContent = redactPairingUrl(url);
  const link = $(`open${capitalize(kind)}Pairing`);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-disabled', 'false');
  link.setAttribute('aria-label', `Open ${kind} pairing URL; secret token hidden from visible text`);
}

function disablePairingLink(kind) {
  const link = $(`open${capitalize(kind)}Pairing`);
  link.removeAttribute('href');
  link.setAttribute('aria-disabled', 'true');
}

function startPairingTimer() {
  stopPairingTimer();
  phonePairing.timer = window.setInterval(updatePairingCountdown, 1000);
  updatePairingCountdown();
}

function stopPairingTimer() {
  if (phonePairing.timer !== null) window.clearInterval(phonePairing.timer);
  phonePairing.timer = null;
}

function updatePairingCountdown() {
  const token = pairingTokenState(phonePairing.expiresAt);
  if (token.state !== 'active') {
    if (phonePairing.token) {
      renderInactivePairing('expired', 'Pairing token expired');
      setPairingStatus('This QR has expired. Regenerate it before pairing another device.');
    }
    return;
  }
  const totalSeconds = Math.ceil(token.remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  $('pairingCountdown').textContent = `expires in ${minutes}:${String(seconds).padStart(2, '0')}`;
  $('pairingCountdown').dataset.state = 'active';
}

function pairingIsActive() {
  return Boolean(phonePairing.token) && pairingTokenState(phonePairing.expiresAt).state === 'active';
}

function clearPairingSecrets() {
  stopPairingTimer();
  Object.assign(phonePairing, {
    token: '',
    room: '',
    expiresAt: 0,
    trackerUrl: '',
    viewerUrl: '',
    relayUrl: '',
  });
}

async function copyPairingUrl(kind) {
  if (!pairingIsActive()) {
    setPairingStatus('The pairing token has expired. Regenerate the QR first.');
    return;
  }
  const value = kind === 'viewer' ? phonePairing.viewerUrl : phonePairing.trackerUrl;
  try {
    await copyText(value);
    setPairingStatus(`${capitalize(kind)} URL copied. It contains the live token; share it privately.`);
  } catch {
    setPairingStatus('Clipboard access failed. Use the accessible open link instead.');
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {}
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

function setPairingBusy(busy) {
  $('btnGeneratePairing').disabled = busy;
  $('btnExpirePairing').disabled = busy || !pairingIsActive();
}

function setPairingStatus(message) {
  $('pairingStatus').textContent = message;
}

function normalizeTrackerBaseUrl(value) {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Phone tracker URL must use http:// or https://.');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function normalizeRelayUrl(value) {
  const url = new URL(String(value));
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Relay URL must use ws:// or wss://.');
  if (!url.pathname || url.pathname === '/') url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function viewerBaseFromTracker(trackerBase) {
  return new URL('../viewer/', trackerBase).toString();
}

function defaultTrackerBaseUrl() {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return new URL('../tracker/', location.href).toString();
  }
  return 'http://localhost:8787/tracker/';
}

function defaultRelayUrl() {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const relay = new URL(location.href);
    relay.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (relay.port === '5173') relay.port = '8787';
    relay.pathname = '/ws';
    relay.search = '';
    relay.hash = '';
    return relay.toString();
  }
  return 'ws://localhost:8787/ws';
}

function defaultPairingRoom() {
  const bytes = new Uint8Array(3);
  globalThis.crypto?.getRandomValues?.(bytes);
  const suffix = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `phone-${suffix || 'stage'}`;
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

$('refreshStatus')?.addEventListener('click', refreshStatus);
bindLaunchButtons();
drawSignal();
refreshStatus();
initializePhonePairing();
