import { HandTargetStabilizer, handTargetDebugRows } from '../shared/runtime.js';

const clip = {
  frames: [
    { t: 0, handedness: 'Right', confidence: 1, curls: [0.05, 0.05, 0.05, 0.05, 0.05], spreads: [0, 0.12, 0, -0.08, -0.12] },
    { t: 33, handedness: 'Right', confidence: 1, curls: [0.08, 0.05, 0.06, 0.06, 0.08], spreads: [0, 0.11, 0, -0.08, -0.11] },
    { t: 66, handedness: 'Right', confidence: 0.95, curls: [0.7, 0.08, 0.85, 0.86, 0.84], spreads: [0, 0.08, 0, -0.05, -0.08] },
    { t: 99, handedness: 'Right', confidence: 0.9, curls: [0.88, 0.95, 0.96, 0.94, 0.9], spreads: [0, 0.03, 0, -0.03, -0.04] },
    { t: 132, handedness: 'Right', confidence: 0.4, curls: [0.02, 1, 0, 1, 0], spreads: [0, 1.2, 0, -1.2, 1.2] },
    { t: 198, hands: [] },
    { t: 330, hands: [] },
  ],
};

const $ = (id) => document.getElementById(id);
const canvas = $('fingerCanvas');
const ctx = canvas.getContext('2d');
const stabilizer = new HandTargetStabilizer({ holdMs: 250, maxCurlDelta: 0.24, maxSpreadDelta: 0.36 });
const CLAMP_WARNING_PREFIX = 'HAND_CURL_CLAMPED';
const rows = [];
const warnings = [];
let maxStep = 0;
let previousCurl = null;

for (const frame of clip.frames) {
  const targets = Array.isArray(frame.hands) && frame.hands.length === 0
    ? []
    : [{
        handedness: frame.handedness,
        confidence: frame.confidence,
        curls: frame.curls,
        spreads: frame.spreads,
        wrist: [0, 0, 0],
      }];
  const out = stabilizer.update(targets, frame.t);
  warnings.push(...out.warnings);
  const debugRows = handTargetDebugRows(out.targets);
  rows.push({ t: frame.t, debugRows });
  const curl = out.targets[0]?.curls?.[1];
  if (previousCurl !== null && curl !== undefined) maxStep = Math.max(maxStep, Math.abs(curl - previousCurl));
  if (curl !== undefined) previousCurl = curl;
}

draw();
$('statFrames').textContent = String(clip.frames.length);
$('statClamps').textContent = String(warnings.filter((warning) => warning.startsWith(CLAMP_WARNING_PREFIX) || warning.includes('CLAMPED')).length);
$('statMaxStep').textContent = maxStep.toFixed(2);
$('statFinal').textContent = rows.at(-1)?.debugRows.length ? 'held' : 'omitted';
$('warningList').replaceChildren(...[...new Set(warnings)].slice(0, 8).map((warning) => {
  const item = document.createElement('li');
  item.textContent = warning;
  return item;
}));

function draw() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '14px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#8a90b8';
  ctx.fillText('synthetic golden clip: index curl after stabilizer', 18, 28);

  const chartX = 60;
  const chartY = 56;
  const chartW = width - 100;
  const chartH = height - 96;
  ctx.strokeStyle = '#272e4e';
  ctx.strokeRect(chartX, chartY, chartW, chartH);
  ctx.strokeStyle = '#6fe3ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  rows.forEach((row, i) => {
    const x = chartX + (chartW * i) / Math.max(1, rows.length - 1);
    const curl = row.debugRows.find((debug) => debug.finger === 'index')?.curl ?? 0;
    const y = chartY + chartH - curl * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#e9ebf8';
  rows.forEach((row, i) => {
    const x = chartX + (chartW * i) / Math.max(1, rows.length - 1);
    const recovered = row.debugRows.some((debug) => debug.recovered);
    ctx.fillStyle = recovered ? '#ffc46b' : '#ff7aa2';
    ctx.beginPath();
    const curl = row.debugRows.find((debug) => debug.finger === 'index')?.curl ?? 0;
    ctx.arc(x, chartY + chartH - curl * chartH, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}
