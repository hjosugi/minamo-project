// Situation presets: one streaming situation, one set of tracker/viewer defaults.
//
// Minamo grew up around a single situation — drum performance — and the drummer
// panel, the drum overlay and the OBS URL button all assumed it. A talk stream,
// a game stream and a karaoke stream want very different tracking budgets, so a
// situation is now first-class data instead of a checkbox.
//
// The division of labour with OBS is deliberate and is encoded in `obs.sources`
// below: every source carries `owner`, and only `owner: 'minamo'` sources are
// ours to create. Backgrounds, game capture, cameras, transitions, alerts and
// recording stay `owner: 'obs'` — OBS already does them better than a WebGL
// canvas can, so we describe the slot and let OBS fill it.
//
// Pure and JSON-serializable: the same tables drive the tracker UI, the viewer
// UI, the OBS bridge and the tests.

export const SITUATION_PRESET_SCHEMA = 'minamo.situation-preset.v1';
export const DEFAULT_SITUATION_ID = 'talk';

/** Sources OBS owns. Minamo never renders these; it only reserves the slot. */
const OBS_OWNED = Object.freeze({
  background: Object.freeze({ id: 'background', kind: 'media', owner: 'obs', hintKey: 'situation.obs.hint.background' }),
  gameCapture: Object.freeze({ id: 'game', kind: 'game_capture', owner: 'obs', hintKey: 'situation.obs.hint.gameCapture' }),
  mic: Object.freeze({ id: 'mic', kind: 'audio_input', owner: 'obs', hintKey: 'situation.obs.hint.mic' }),
  music: Object.freeze({ id: 'music', kind: 'audio_output', owner: 'obs', hintKey: 'situation.obs.hint.music' }),
  chat: Object.freeze({ id: 'chat', kind: 'browser', owner: 'obs', hintKey: 'situation.obs.hint.chat' }),
  alerts: Object.freeze({ id: 'alerts', kind: 'browser', owner: 'obs', hintKey: 'situation.obs.hint.alerts' }),
});

/**
 * Avatar browser source, positioned for one situation.
 *
 * `bounds` is in 1920x1080 canvas pixels; the OBS bridge scales it to whatever
 * canvas the connected OBS actually uses, so a 1080p layout still lands on a
 * 720p or 1440p canvas.
 */
function avatarSource(bounds) {
  return Object.freeze({
    id: 'avatar',
    kind: 'browser',
    owner: 'minamo',
    hintKey: 'situation.obs.hint.avatar',
    bounds: Object.freeze(bounds),
  });
}

export const SITUATION_PRESETS = Object.freeze([
  Object.freeze({
    id: 'talk',
    labelKey: 'situation.talk.label',
    descriptionKey: 'situation.talk.description',
    // Bust-up framing: the face carries the stream, so spend the budget on a
    // smooth head and a lipsync that survives a mic-only moment. Hands are off
    // because they leave frame constantly in a seated talk shot, and a hand
    // that keeps appearing and vanishing reads worse than no hands at all.
    tracking: Object.freeze({
      pose: true,
      hands: false,
      audioLipsync: true,
      faceLock: true,
      drummerMode: false,
      bodyMode: 'seated',
      filterPreset: 'smooth',
      resolution: '720p',
      fps: '60',
    }),
    viewer: Object.freeze({
      scenePreset: 'soft',
      transparent: true,
      armSolver: true,
      drumOverlay: false,
      bloom: false,
      vignette: false,
    }),
    obs: Object.freeze({
      sceneNameKey: 'situation.talk.obsScene',
      sources: Object.freeze([
        avatarSource({ x: 1180, y: 300, width: 740, height: 780 }),
        OBS_OWNED.background,
        OBS_OWNED.chat,
        OBS_OWNED.mic,
        OBS_OWNED.alerts,
      ]),
    }),
  }),
  Object.freeze({
    id: 'game',
    labelKey: 'situation.game.label',
    descriptionKey: 'situation.game.description',
    // The game owns the machine. Everything here is chosen to give inference the
    // smallest slice it can live on: 480p at 30fps, face only, no pose or hand
    // model loaded at all.
    tracking: Object.freeze({
      pose: false,
      hands: false,
      audioLipsync: true,
      faceLock: true,
      drummerMode: false,
      bodyMode: 'seated',
      filterPreset: 'balanced',
      resolution: '480p',
      fps: '30',
    }),
    viewer: Object.freeze({
      // Rim light, no vignette: at corner-wipe size the avatar has to separate
      // from whatever is behind it, and a vignette on a transparent cutout just
      // dirties its edges.
      scenePreset: 'anime',
      transparent: true,
      armSolver: false,
      drumOverlay: false,
      bloom: false,
      vignette: false,
    }),
    obs: Object.freeze({
      sceneNameKey: 'situation.game.obsScene',
      sources: Object.freeze([
        avatarSource({ x: 1470, y: 620, width: 450, height: 460 }),
        OBS_OWNED.gameCapture,
        OBS_OWNED.mic,
        OBS_OWNED.alerts,
      ]),
    }),
  }),
  Object.freeze({
    id: 'sing',
    labelKey: 'situation.sing.label',
    descriptionKey: 'situation.sing.description',
    // Standing, full body, and responsive filtering: a karaoke stream is judged
    // on whether the mouth lands on the beat, and smoothing that flatters a talk
    // stream reads as lag here.
    tracking: Object.freeze({
      pose: true,
      hands: true,
      audioLipsync: true,
      faceLock: false,
      drummerMode: false,
      bodyMode: 'standing',
      filterPreset: 'responsive',
      resolution: '720p',
      fps: '60',
    }),
    viewer: Object.freeze({
      scenePreset: 'anime',
      transparent: true,
      armSolver: true,
      drumOverlay: false,
      bloom: true,
      vignette: false,
    }),
    obs: Object.freeze({
      sceneNameKey: 'situation.sing.obsScene',
      sources: Object.freeze([
        avatarSource({ x: 660, y: 60, width: 600, height: 1020 }),
        OBS_OWNED.background,
        OBS_OWNED.music,
        OBS_OWNED.mic,
        OBS_OWNED.alerts,
      ]),
    }),
  }),
  Object.freeze({
    id: 'collab',
    labelKey: 'situation.collab.label',
    descriptionKey: 'situation.collab.description',
    // Several avatars share one canvas, so the per-participant budget shrinks:
    // 30fps and no hand model, which is also what keeps the relay payload small
    // when everyone is publishing at once.
    tracking: Object.freeze({
      pose: true,
      hands: false,
      audioLipsync: true,
      faceLock: true,
      drummerMode: false,
      bodyMode: 'seated',
      filterPreset: 'balanced',
      resolution: '720p',
      fps: '30',
    }),
    viewer: Object.freeze({
      scenePreset: 'soft',
      transparent: true,
      armSolver: true,
      drumOverlay: false,
      bloom: false,
      vignette: false,
    }),
    obs: Object.freeze({
      sceneNameKey: 'situation.collab.obsScene',
      sources: Object.freeze([
        // Full width: the viewer lays participants out in room slots itself, so
        // OBS gets one wide source rather than one source per participant.
        avatarSource({ x: 0, y: 240, width: 1920, height: 840 }),
        OBS_OWNED.background,
        OBS_OWNED.chat,
        OBS_OWNED.mic,
        OBS_OWNED.alerts,
      ]),
    }),
  }),
  Object.freeze({
    id: 'drum',
    labelKey: 'situation.drum.label',
    descriptionKey: 'situation.drum.description',
    // The original situation, unchanged in behaviour: hands and drummer mode on,
    // responsive filtering, and the kit overlay as its own OBS source so it can
    // be placed over a real drum camera.
    tracking: Object.freeze({
      pose: true,
      hands: true,
      audioLipsync: false,
      faceLock: false,
      drummerMode: true,
      bodyMode: 'seated',
      filterPreset: 'responsive',
      resolution: '720p',
      fps: '60',
    }),
    viewer: Object.freeze({
      scenePreset: 'soft',
      transparent: true,
      armSolver: true,
      drumOverlay: true,
      bloom: false,
      vignette: false,
    }),
    obs: Object.freeze({
      sceneNameKey: 'situation.drum.obsScene',
      sources: Object.freeze([
        avatarSource({ x: 1180, y: 240, width: 740, height: 840 }),
        Object.freeze({
          id: 'drum-overlay',
          kind: 'browser',
          owner: 'minamo',
          hintKey: 'situation.obs.hint.drumOverlay',
          bounds: Object.freeze({ x: 0, y: 0, width: 1180, height: 1080 }),
        }),
        OBS_OWNED.background,
        OBS_OWNED.mic,
      ]),
    }),
  }),
]);

/** OBS's own default canvas; `obs.sources[].bounds` are expressed against it. */
export const SITUATION_REFERENCE_CANVAS = Object.freeze({ width: 1920, height: 1080 });

export function situationIds() {
  return SITUATION_PRESETS.map((preset) => preset.id);
}

/**
 * Look up a preset, falling back to the default rather than throwing: the id can
 * come from a stored setting or a query string, and an unknown one should start
 * the app rather than break it.
 *
 * @param {string} id
 */
export function getSituationPreset(id) {
  return SITUATION_PRESETS.find((preset) => preset.id === id)
    || SITUATION_PRESETS.find((preset) => preset.id === DEFAULT_SITUATION_ID);
}

export function isSituationId(id) {
  return SITUATION_PRESETS.some((preset) => preset.id === id);
}

/**
 * Merge a situation's tracking defaults onto tracker settings.
 *
 * Returns a new object; transport, camera choice, calibration and privacy
 * settings are left alone, because those belong to the machine and the room, not
 * to what the streamer is doing today.
 *
 * @param {Record<string, unknown>} settings
 * @param {string} id
 */
export function applySituationToTrackerSettings(settings, id) {
  const preset = getSituationPreset(id);
  return { ...settings, ...preset.tracking, situation: preset.id };
}

/**
 * Merge a situation's viewer defaults onto viewer settings.
 *
 * `backgroundColor` is deliberately preserved: every situation streams
 * transparent, so the colour only matters in the windowed preview, where the
 * streamer's own choice should survive a situation switch.
 *
 * @param {Record<string, unknown>} settings
 * @param {string} id
 */
export function applySituationToViewerSettings(settings, id) {
  const preset = getSituationPreset(id);
  return { ...settings, ...preset.viewer, situation: preset.id };
}

/**
 * Build the OBS-ready viewer URL for a situation.
 *
 * `preset=obs` strips the HUD and locks the camera; `bg=transparent` clears to
 * alpha so OBS composites onto whatever is underneath.
 *
 * @param {string} id
 * @param {{baseUrl?: string, room?: string, mode?: string, token?: string, wsUrl?: string, wtUrl?: string, wtHash?: string}} [options]
 */
export function situationViewerUrl(id, options = {}) {
  const preset = getSituationPreset(id);
  const url = new URL(options.baseUrl || 'http://localhost:8000/viewer/');
  const set = (key, value) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  };
  set('preset', 'obs');
  set('situation', preset.id);
  set('mode', options.mode || 'local');
  set('room', options.room || 'demo');
  set('token', options.token);
  set('wsUrl', options.wsUrl);
  if (options.mode === 'wt') {
    set('wtUrl', options.wtUrl);
    set('wtHash', options.wtHash);
  }
  set('scene', preset.viewer.scenePreset);
  set('bg', 'transparent');
  set('bloom', preset.viewer.bloom ? '1' : '0');
  set('vignette', preset.viewer.vignette ? '1' : '0');
  set('drum', preset.viewer.drumOverlay ? '1' : '0');
  set('hud', '0');
  set('camera', 'locked');
  return url.toString();
}

/**
 * Resolve every `owner: 'minamo'` source in a situation to a concrete browser
 * source description, scaled from the 1920x1080 reference layout onto the
 * canvas OBS reports.
 *
 * The `owner: 'obs'` entries are returned untouched in `delegated` so the UI can
 * tell the streamer what OBS still has to supply.
 *
 * @param {string} id
 * @param {{baseUrl?: string, canvas?: {width: number, height: number}, room?: string, mode?: string, token?: string, wsUrl?: string, wtUrl?: string, wtHash?: string}} [options]
 */
export function situationObsPlan(id, options = {}) {
  const preset = getSituationPreset(id);
  const canvas = options.canvas || SITUATION_REFERENCE_CANVAS;
  const scaleX = canvas.width / SITUATION_REFERENCE_CANVAS.width;
  const scaleY = canvas.height / SITUATION_REFERENCE_CANVAS.height;
  const viewerUrl = situationViewerUrl(id, options);

  const owned = preset.obs.sources
    .filter((source) => source.owner === 'minamo')
    .map((source) => ({
      id: source.id,
      name: `Minamo ${preset.id} ${source.id}`,
      kind: source.kind,
      // The drum kit overlay is a separate page so it can sit over a real drum
      // camera instead of over the avatar.
      url: source.id === 'drum-overlay'
        ? new URL('drum-overlay.html', new URL(viewerUrl)).toString()
        : viewerUrl,
      bounds: {
        x: Math.round(source.bounds.x * scaleX),
        y: Math.round(source.bounds.y * scaleY),
        width: Math.round(source.bounds.width * scaleX),
        height: Math.round(source.bounds.height * scaleY),
      },
    }));

  return {
    schema: SITUATION_PRESET_SCHEMA,
    situation: preset.id,
    sceneNameKey: preset.obs.sceneNameKey,
    canvas: { width: canvas.width, height: canvas.height },
    sources: owned,
    delegated: preset.obs.sources
      .filter((source) => source.owner === 'obs')
      .map((source) => ({ id: source.id, kind: source.kind, hintKey: source.hintKey })),
  };
}
