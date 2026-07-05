import { encodeFrame } from '../shared/codec.js';
import { parseMotionJsonl } from '../shared/runtime.js';

const $ = (id) => document.getElementById(id);
const chip = $('statusChip');

let frames = [];
let cursor = 0;
let playing = false;
let timer = null;
let startedAt = 0;
let baseT = 0;

$('fileReplay').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    frames = parseMotionJsonl(await file.text()).sort((a, b) => a.t - b.t);
  } catch (error) {
    frames = [];
    cursor = 0;
    $('statFrames').textContent = '0';
    $('statCursor').textContent = '0';
    $('statDuration').textContent = '0.0';
    $('btnPlay').disabled = true;
    $('btnReset').disabled = true;
    chip.textContent = `error: ${error.message}`;
    chip.dataset.state = 'error';
    return;
  }
  cursor = 0;
  baseT = frames[0]?.t ?? 0;
  $('statFrames').textContent = String(frames.length);
  $('statCursor').textContent = '0';
  $('statDuration').textContent = frames.length ? (((frames.at(-1)?.t ?? baseT) - baseT) / 1000).toFixed(1) : '0.0';
  $('btnPlay').disabled = frames.length === 0;
  $('btnReset').disabled = frames.length === 0;
  chip.textContent = frames.length ? 'loaded' : 'empty';
  chip.dataset.state = frames.length ? 'open' : 'error';
});

$('btnPlay').addEventListener('click', () => {
  if (!frames.length || playing) return;
  playing = true;
  startedAt = performance.now() - ((frames[cursor]?.t ?? baseT) - baseT);
  $('btnPlay').disabled = true;
  $('btnPause').disabled = false;
  chip.textContent = 'playing';
  chip.dataset.state = 'open';
  tick();
});

$('btnPause').addEventListener('click', () => pause('paused'));
$('btnReset').addEventListener('click', () => {
  pause('reset');
  cursor = 0;
  $('statCursor').textContent = '0';
});

$('inpRoom').addEventListener('input', updateViewerLink);
$('inpToken').addEventListener('input', updateViewerLink);
updateViewerLink();

function tick() {
  if (!playing) return;
  const elapsed = performance.now() - startedAt;
  while (cursor < frames.length && frames[cursor].t - baseT <= elapsed) {
    publish(frames[cursor]);
    cursor++;
  }
  $('statCursor').textContent = String(cursor);
  if (cursor >= frames.length) {
    pause('finished');
    return;
  }
  timer = setTimeout(tick, 4);
}

function pause(label) {
  playing = false;
  if (timer) clearTimeout(timer);
  timer = null;
  $('btnPlay').disabled = frames.length === 0;
  $('btnPause').disabled = true;
  chip.textContent = label;
  chip.dataset.state = label === 'finished' ? 'closed' : 'idle';
}

function publish(record) {
  const room = $('inpRoom').value || 'demo';
  const token = $('inpToken').value || 'open';
  const channel = new BroadcastChannel(`minamo:${room}:${token}`);
  const frame = {
    t: Math.round(record.t),
    seq: record.seq,
    face: record.face ? {
      quat: record.face.quat,
      pos: record.face.pos,
      weights: record.face.weights,
    } : null,
    pose: record.pose?.points ? { points: record.pose.points } : null,
    hands: record.hands ?? null,
  };
  channel.postMessage(encodeFrame(frame));
  channel.close();
}

function updateViewerLink() {
  const params = new URLSearchParams({ room: $('inpRoom').value || 'demo' });
  if ($('inpToken').value) params.set('token', $('inpToken').value);
  $('lnkViewer').href = `../viewer/?${params.toString()}`;
}
