import { encodeFrame } from '../shared/codec.js';
import { parseKgmRecording } from '../shared/kgm-recording.js';
import { parseRecordingJsonl } from '../shared/recording.js';
import { VRMA_MIME, exportVrmaFromFrames } from '../shared/vrma-export.js';
import { setupPageI18n } from '../shared/i18n.js';

// Runtime EN/JA localization (#267). `bootDone` must be declared above
// setupPageI18n, which renders synchronously: reading it from the temporal
// dead zone would abort the module.
let bootDone = false;
const { t } = setupPageI18n({
  onRender: () => {
    if (!bootDone) return;
    if (lastStatus) setStatus(lastStatus.key, lastStatus.params, lastStatus.chipState);
    renderReplayValidation(validationErrors, frames.length);
  },
});

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id);
const chip = $('statusChip');

// The status chip renders from a key so a language toggle can replay the
// message currently on screen instead of resetting it.
let lastStatus = null;
function setStatus(key, params, chipState) {
  lastStatus = { key, params, chipState };
  chip.textContent = t(key, params);
  chip.dataset.state = chipState;
}

let frames = [];
let cursor = 0;
let playing = false;
let timer = null;
let startedAt = 0;
let baseT = 0;
let validationErrors = [];
// Until a file is parsed the validation panel shows its neutral "no recording"
// copy; a language toggle must re-render that, not the empty-recording result.
let loadedOnce = false;

$('fileReplay').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  playing = false;
  if (timer) clearTimeout(timer);
  timer = null;
  closePublishChannel();
  const parsed = await parseReplayFile(file);
  frames = parsed.frames.sort((a, b) => a.t - b.t);
  validationErrors = parsed.errors;
  loadedOnce = true;
  cursor = 0;
  baseT = frames[0]?.t ?? 0;
  $('statFrames').textContent = String(frames.length);
  $('statCursor').textContent = '0';
  const durationSec = frames.length ? (((frames.at(-1)?.t ?? baseT) - baseT) / 1000) : 0;
  $('statDuration').textContent = durationSec.toFixed(1);
  $('inpTrimStart').value = '0';
  $('inpTrimEnd').value = Math.max(durationSec, 1 / 30).toFixed(2);
  $('btnPlay').disabled = !canReplay();
  $('btnPause').disabled = true;
  $('btnReset').disabled = !canReplay();
  $('btnExportVrma').disabled = !canReplay();
  renderReplayValidation(validationErrors, frames.length);
  const loadedState = validationErrors.length || !frames.length ? 'error' : 'open';
  if (validationErrors.length) setStatus('replay.status.blocked', { n: validationErrors.length }, loadedState);
  else setStatus(frames.length ? 'replay.status.loaded' : 'replay.status.empty', undefined, loadedState);
});

$('btnPlay').addEventListener('click', () => {
  if (!frames.length || playing) return;
  playing = true;
  startedAt = performance.now() - ((frames[cursor]?.t ?? baseT) - baseT);
  $('btnPlay').disabled = true;
  $('btnPause').disabled = false;
  setStatus('replay.status.playing', undefined, 'open');
  tick();
});

$('btnPause').addEventListener('click', () => pause('paused'));
$('btnReset').addEventListener('click', () => {
  pause('reset');
  cursor = 0;
  $('statCursor').textContent = '0';
});
$('btnExportVrma').addEventListener('click', () => {
  if (!canReplay()) return;
  try {
    const startMs = Math.max(0, Number($('inpTrimStart').value) || 0) * 1000;
    const endMs = Math.max(0, Number($('inpTrimEnd').value) || 0) * 1000;
    const bytes = exportVrmaFromFrames(frames, {
      trimStartMs: startMs,
      trimEndMs: endMs,
      loop: $('chkVrmaLoop').checked,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBytes(`minamo-motion-${stamp}.vrma`, bytes, VRMA_MIME);
    setStatus('replay.status.vrmaExported', undefined, 'open');
  } catch (error) {
    setStatus('replay.error.vrmaExport', { detail: error.message }, 'error');
  }
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
  closePublishChannel();
  $('btnPlay').disabled = !canReplay();
  $('btnPause').disabled = true;
  setStatus(`replay.status.${label}`, undefined, label === 'finished' ? 'closed' : 'idle');
}

function canReplay() {
  return frames.length > 0 && validationErrors.length === 0;
}

function downloadBytes(filename, bytes, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
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
    if (!frameCount && !loadedOnce) {
      panel.dataset.state = 'idle';
      summary.textContent = t('replay.validation.noRecording');
      return;
    }
    panel.dataset.state = frameCount ? 'open' : 'empty';
    summary.textContent = frameCount
      ? t('replay.validation.ready', { n: frameCount })
      : t('replay.validation.none');
    return;
  }

  panel.dataset.state = 'error';
  summary.textContent = t('replay.validation.disabled', { n: errors.length });
  for (const error of errors.slice(0, 20)) {
    const li = document.createElement('li');
    li.textContent = t('replay.validation.line', { line: error.line ?? '?', detail: (error.errors ?? []).join('; ') });
    list.appendChild(li);
  }
  if (errors.length > 20) {
    const li = document.createElement('li');
    li.textContent = t('replay.validation.more', { n: errors.length - 20 });
    list.appendChild(li);
  }
}

// Reuse one BroadcastChannel across the whole playback session instead of
// opening and closing a fresh one for every frame (#259). It is recreated only
// when the room/token changes and closed when playback stops.
let publishChannel = null;
let publishChannelKey = '';

function currentPublishChannel() {
  const room = $('inpRoom').value || 'demo';
  const token = $('inpToken').value || 'open';
  const key = `minamo:${room}:${token}`;
  if (publishChannelKey !== key) {
    if (publishChannel) publishChannel.close();
    publishChannel = new BroadcastChannel(key);
    publishChannelKey = key;
  }
  return publishChannel;
}

function closePublishChannel() {
  if (publishChannel) publishChannel.close();
  publishChannel = null;
  publishChannelKey = '';
}

function publish(record) {
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
  currentPublishChannel().postMessage(encodeFrame(frame));
}

function updateViewerLink() {
  const params = new URLSearchParams({ room: $('inpRoom').value || 'demo' });
  if ($('inpToken').value) params.set('token', $('inpToken').value);
  $('lnkViewer').href = `../viewer/?${params.toString()}`;
}

setStatus('replay.status.idle', undefined, 'idle');
bootDone = true;
