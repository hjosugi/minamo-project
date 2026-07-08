// OBS/viewer-side drum overlay reducer (issue #120).
//
// The tracker maps live hands to zones (`deriveDrumOverlayState` in runtime.js).
// This module is the render side: it folds a stream of DrumHitEvent packets into
// per-zone flash intensities that decay over time, suitable for a transparent
// OBS browser source. It is pure and JSON-serializable so the same reducer backs
// both the overlay page and the tests.

export const DRUM_OVERLAY_SCHEMA = 'minamo.drum-overlay.v1';
export const DEFAULT_FLASH_DECAY_MS = 220;

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function eventTimeMs(event) {
  if (Number.isFinite(event?.timeMs)) return event.timeMs;
  if (Number.isFinite(event?.timeNs)) return event.timeNs / 1_000_000;
  return 0;
}

export function createDrumOverlayState() {
  return { schema: DRUM_OVERLAY_SCHEMA, zones: {}, hitCount: 0, lastEventId: null };
}

// Fold one DrumHitEvent into the overlay state. Duplicate eventIds are ignored so
// re-delivered packets do not double-count. `nowMs` defaults to the event time.
export function reduceDrumOverlay(state, event, nowMs) {
  if (!event || (event.eventId && event.eventId === state.lastEventId)) return state;
  const at = Number.isFinite(nowMs) ? nowMs : eventTimeMs(event);
  const zoneId = String(event.zoneId || event.zoneType || 'unknown');
  const intensity = clamp01(
    Number.isFinite(event.confidence) ? event.confidence : Number.isFinite(event.speed) ? Math.min(1, event.speed / 4) : 0.6,
  );
  const zone = state.zones[zoneId] || {
    zoneId,
    zoneType: String(event.zoneType || zoneId),
    hits: 0,
    intensity: 0,
    lastHitMs: -Infinity,
  };
  zone.hits += 1;
  zone.intensity = intensity;
  zone.lastHitMs = at;
  if (event.hand) zone.lastHand = event.hand;
  state.zones[zoneId] = zone;
  state.hitCount += 1;
  state.lastEventId = event.eventId ?? null;
  return state;
}

// Compute renderable flash alpha per zone at `nowMs`. Flash decays linearly to 0
// over `decayMs` after the last hit.
export function deriveObsOverlayState(state, nowMs, { decayMs = DEFAULT_FLASH_DECAY_MS } = {}) {
  const zones = Object.values(state.zones).map((zone) => {
    const age = nowMs - zone.lastHitMs;
    const flash = age <= 0 ? zone.intensity : age >= decayMs ? 0 : zone.intensity * (1 - age / decayMs);
    const out = {
      zoneId: zone.zoneId,
      zoneType: zone.zoneType,
      hits: zone.hits,
      flash: clamp01(flash),
    };
    if (zone.lastHand) out.lastHand = zone.lastHand;
    return out;
  });
  return {
    schema: DRUM_OVERLAY_SCHEMA,
    tMs: nowMs,
    hitCount: state.hitCount,
    activeZoneIds: zones.filter((zone) => zone.flash > 0.01).map((zone) => zone.zoneId),
    zones,
  };
}
