import { encodeFrame } from '../shared/codec.js';
import { parseKgmRecording } from '../shared/kgm-recording.js';
import { parseRecordingJsonl } from '../shared/recording.js';

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id);
const chip = $('statusChip');

let frames = [];
let cursor = 0;
let playing = false;
let timer = null;
let startedAt = 0;
let baseT = 0;
let validationErrors = [];

$('fileReplay').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  playing = false;
  if (timer) clearTimeout(timer);
  timer = null;
  const parsed = await parseReplayFile(file);
  frames = parsed.frames.sort((a, b) => a.t - b.t);
  validationErrors = parsed.errors;
  cursor = 0;
  baseT = frames[0]?.t ?? 0;
  $('statFrames').textContent = String(frames.length);
  $('statCursor').textContent = '0';
  $('statDuration').textContent = frames.length ? (((frames.at(-1)?.t ?? baseT) - baseT) / 1000).toFixed(1) : '0.0';
  $('btnPlay').disabled = !canReplay();
  $('btnPause').disabled = true;
  $('btnReset').disabled = !canReplay();
  renderReplayValidation(validationErrors, frames.length);
  chip.textContent = validationErrors.length ? `blocked: ${validationErrors.length} error(s)` : (frames.length ? 'loaded' : 'empty');
  chip.dataset.state = validationErrors.length || !frames.length ? 'error' : 'open';
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
  $('btnPlay').disabled = !canReplay();
  $('btnPause').disabled = true;
  chip.textContent = label;
  chip.dataset.state = label === 'finished' ? 'closed' : 'idle';
}

function canReplay() {
  return frames.length > 0 && validationErrors.length === 0;
}

async function parseReplayFile(file) {
  if (file.name.toLowerCase().endsWith('.kgm')) {
    try {
      return { frames: parseKgmRecording(await file.arrayBuffer()).frames, errors: [] };
    } catch (error) {
      return { frames: [], errors: [{ line: 1, errors: [error.message] }] };
    }
  }
  const parsed = parseRecordingJsonl(await file.text());
  return { frames: parsed.frames, errors: parsed.errors };
}

function renderReplayValidation(errors, frameCount) {
  const panel = $('replayValidation');
  const summary = $('replayValidationSummary');
  const list = $('replayErrors');
  list.replaceChildren();

  if (!errors.length) {
    panel.dataset.state = frameCount ? 'open' : 'empty';
    summary.textContent = frameCount
      ? `ready: ${frameCount} frame(s), no validation errors`
      : 'no playable motion frames found';
    return;
  }

  panel.dataset.state = 'error';
  summary.textContent = `${errors.length} validation error(s); playback disabled`;
  for (const error of errors.slice(0, 20)) {
    const li = document.createElement('li');
    li.textContent = `line ${error.line ?? '?'}: ${(error.errors ?? []).join('; ')}`;
    list.appendChild(li);
  }
  if (errors.length > 20) {
    const li = document.createElement('li');
    li.textContent = `and ${errors.length - 20} more error(s)`;
    list.appendChild(li);
  }
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
