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

$('refreshStatus')?.addEventListener('click', refreshStatus);
bindLaunchButtons();
drawSignal();
refreshStatus();
