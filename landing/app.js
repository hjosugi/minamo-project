const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startDemo');
const fpsEl = document.getElementById('fps');
const confidenceEl = document.getElementById('confidence');
const hitsEl = document.getElementById('hits');

let running = false;
let frames = 0;
let lastFpsTime = performance.now();
let fps = 0;
let hits = 0;
let lastHitBucket = -1;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
      audio: false,
    });
    video.srcObject = stream;
  } catch (error) {
    console.warn('Camera unavailable, using mock visualization only.', error);
  }
}

function drawPoint(x, y, r = 4) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawLine(points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function hand(cx, cy, scale, side, t) {
  const mirror = side === 'L' ? -1 : 1;
  const wrist = [cx, cy + scale * 0.45];
  const fingers = [
    { name: 'thumb', base: [-0.22, 0.18], len: .72, curl: .25 + .12 * Math.sin(t * 2.0) },
    { name: 'index', base: [-0.18, -0.05], len: 1.0, curl: .18 + .16 * Math.sin(t * 1.7) },
    { name: 'middle', base: [0, -0.08], len: 1.12, curl: .12 + .14 * Math.sin(t * 1.4 + 1) },
    { name: 'ring', base: [0.18, -0.04], len: .98, curl: .22 + .12 * Math.sin(t * 1.6 + 2) },
    { name: 'pinky', base: [0.34, 0.04], len: .78, curl: .28 + .11 * Math.sin(t * 1.8 + 3) },
  ];
  ctx.strokeStyle = 'rgba(113,225,255,.9)';
  ctx.fillStyle = 'rgba(205,161,255,.95)';
  ctx.lineWidth = 3;
  drawPoint(wrist[0], wrist[1], 5);
  for (const f of fingers) {
    let x = cx + f.base[0] * scale * mirror;
    let y = cy + f.base[1] * scale;
    const chain = [[wrist[0], wrist[1]], [x, y]];
    let angle = -Math.PI / 2 + f.base[0] * 1.2 * mirror;
    for (let i = 0; i < 3; i++) {
      angle += f.curl * (i + 1) * 0.28 * mirror;
      const seg = scale * f.len * (0.30 - i * 0.045);
      x += Math.cos(angle) * seg * mirror;
      y += Math.sin(angle) * seg;
      chain.push([x, y]);
    }
    drawLine(chain);
    chain.forEach(([px, py]) => drawPoint(px, py, 4));
  }
}

function face(cx, cy, scale, t) {
  ctx.strokeStyle = 'rgba(255,255,255,.65)';
  ctx.fillStyle = 'rgba(113,225,255,.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scale * .42, scale * .55, Math.sin(t * .7) * .05, 0, Math.PI * 2);
  ctx.stroke();

  const blink = Math.max(0.08, Math.abs(Math.sin(t * 1.2)));
  const eyeY = cy - scale * .1;
  const eyeOpen = scale * .035 * blink;
  for (const ex of [cx - scale * .16, cx + scale * .16]) {
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, scale * .07, eyeOpen, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawPoint(ex + Math.sin(t) * scale * .025, eyeY, 3);
  }

  const mouthOpen = scale * (.03 + .06 * (0.5 + 0.5 * Math.sin(t * 3.0)));
  const mouthWide = scale * (.14 + .03 * Math.sin(t * 1.7));
  ctx.beginPath();
  ctx.ellipse(cx, cy + scale * .18, mouthWide, mouthOpen, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drums(w, h, t) {
  const zones = [
    ['snare', w * .50, h * .74, 60],
    ['hihat', w * .34, h * .63, 46],
    ['tom', w * .60, h * .58, 50],
    ['ride', w * .72, h * .55, 62],
    ['kick', w * .50, h * .90, 70],
  ];
  ctx.lineWidth = 2;
  for (const [name, x, y, r] of zones) {
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * .38, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.48)';
    ctx.fillText(name, x - 18, y + 4);
  }

  const bucket = Math.floor(t * 2.4);
  if (bucket !== lastHitBucket && Math.sin(t * 2.4) > 0.92) {
    hits += 1;
    lastHitBucket = bucket;
  }
  const hitPulse = Math.max(0, Math.sin(t * 2.4) - .75) * 4;
  ctx.strokeStyle = `rgba(255,122,144,${Math.min(1, hitPulse)})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(w * .50, h * .74, 60 + hitPulse * 10, 23 + hitPulse * 4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function loop(now) {
  if (!running) return;
  const w = canvas.width;
  const h = canvas.height;
  const t = now / 1000;
  ctx.clearRect(0, 0, w, h);
  ctx.font = '14px ui-sans-serif, system-ui';

  // The overlay is mirrored by CSS with the video. Use drawing coordinates as camera space.
  face(w * .50 + Math.sin(t * .8) * 20, h * .27, 190, t);
  hand(w * .28, h * .54 + Math.sin(t * 2) * 12, 120, 'L', t);
  hand(w * .72, h * .54 + Math.cos(t * 2) * 12, 120, 'R', t + .8);
  drums(w, h, t);

  frames += 1;
  if (now - lastFpsTime > 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsTime));
    frames = 0;
    lastFpsTime = now;
  }
  const confidence = 0.88 + 0.08 * Math.sin(t * .9);
  fpsEl.textContent = String(fps);
  confidenceEl.textContent = confidence.toFixed(2);
  hitsEl.textContent = String(hits);

  requestAnimationFrame(loop);
}

startButton.addEventListener('click', async () => {
  running = true;
  startButton.textContent = 'Running';
  await startCamera();
  requestAnimationFrame(loop);
});
