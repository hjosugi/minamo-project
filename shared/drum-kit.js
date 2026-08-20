// Drum kit configuration and the live hand-to-zone overlay.
//
// Sits next to ./percussion.js, which owns the kit catalogue and decides what
// counts as a strike. This module owns the *calibrated* side: where the player
// actually put each zone on their own camera framing, and which zone a hand is
// currently over.
//
// Split out of runtime.js because it is one self-contained concern that nothing
// else in that module used, and because it is the part a percussionist edits.

import { clamp } from './math.js';
import { classifyHandGesture } from './hand-gestures.js';
import {
  DEFAULT_PERCUSSION_KIT_ID,
  getPercussionKit,
  isPercussionKitId,
  strikeMatches,
} from './percussion.js';

export const DRUM_KIT_STORAGE_KEY = 'minamo.drum-kit.calibration.v1';

export const DRUM_KIT_SCHEMA = 'minamo.drum-kit-calibration.v1';
// The five-piece stick kit, kept as its own export because it is the default and
// several call sites name it directly. The full catalogue — cajon, congas,
// bongos, hand percussion, hybrid — lives in shared/percussion.js.

// The five-piece stick kit, kept as its own export because it is the default and
// several call sites name it directly. The full catalogue — cajon, congas,
// bongos, hand percussion, hybrid — lives in shared/percussion.js.
export const DRUM_ZONE_DEFS = getPercussionKit(DEFAULT_PERCUSSION_KIT_ID).zones;

export function createDefaultDrumKitConfig(name = 'default', kitId = DEFAULT_PERCUSSION_KIT_ID) {
  const kit = getPercussionKit(kitId);
  return {
    schema: DRUM_KIT_SCHEMA,
    name,
    kit: kit.id,
    createdAt: new Date().toISOString(),
    zones: kit.zones.map((zone) => ({
      id: zone.id,
      label: zone.label,
      type: zone.type,
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      calibrated: false,
    })),
  };
}

export function normalizeDrumKitConfig(config) {
  // The kit decides the zone set, so it has to be resolved before the base is
  // built — otherwise a stored cajon config comes back with drum-kit zones.
  const kitId = isPercussionKitId(config?.kit) ? config.kit : DEFAULT_PERCUSSION_KIT_ID;
  const base = /** @type {any} */ (createDefaultDrumKitConfig(config?.name || 'default', kitId));
  if (!config || typeof config !== 'object' || (config.schema && config.schema !== DRUM_KIT_SCHEMA)) return base;
  base.createdAt = typeof config.createdAt === 'string' ? config.createdAt : base.createdAt;
  const incoming = new Map(Array.isArray(config.zones) ? config.zones.map((zone) => [String(zone.id || ''), zone]) : []);
  base.zones = base.zones.map((zone) => {
    const raw = incoming.get(zone.id) || {};
    return {
      ...zone,
      x: clamp(Number(raw.x ?? zone.x), 0, 1),
      y: clamp(Number(raw.y ?? zone.y), 0, 1),
      radius: clamp(Number(raw.radius ?? zone.radius), 0.03, 0.18),
      calibrated: Boolean(raw.calibrated),
    };
  });
  return base;
}

export function drumKitCalibrationSummary(config) {
  const kit = normalizeDrumKitConfig(config);
  const missing = kit.zones.filter((zone) => !zone.calibrated).map((zone) => zone.id);
  return {
    total: kit.zones.length,
    calibrated: kit.zones.length - missing.length,
    ready: missing.length === 0,
    missing,
  };
}

export function handWristToDrumStage(hand = {}) {
  const wrist = hand.wrist || [0, 0, 0];
  return {
    x: clamp(0.5 + Number(wrist[0] || 0), 0, 1),
    y: clamp(0.5 - Number(wrist[1] || 0), 0, 1),
  };
}

export function deriveDrumOverlayState(hands = [], config = createDefaultDrumKitConfig()) {
  const kit = normalizeDrumKitConfig(config);
  const zones = kit.zones.filter((zone) => zone.calibrated);
  const handStates = hands.map((hand) => {
    const point = handWristToDrumStage(hand);
    const gesture = hand.gesture || classifyHandGesture(hand);
    const nearest = zones
      .map((zone) => ({
        zone,
        distance: Math.hypot(point.x - zone.x, point.y - zone.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const inZone = nearest && nearest.distance <= nearest.zone.radius * 1.35;
    return {
      handedness: hand.handedness || 'Right',
      confidence: clamp(Number(hand.confidence ?? 1)),
      point,
      gesture,
      zoneId: inZone ? nearest.zone.id : null,
      zoneType: inZone ? nearest.zone.type : null,
      // Per hand, and per kit. This used to be a bare `gesture.drumGrip`, which
      // silently made hand percussion untrackable: a slap is an open palm, and
      // open palm and stick grip are mutually exclusive by finger curl, so a
      // cajon player's hand could sit in a calibrated zone and never register.
      // Evaluating per hand is also what lets a stick and a bare hand work at
      // once on a hybrid rig.
      active: Boolean(inZone && strikeMatches(kit.kit, gesture)),
    };
  });
  return {
    kit: kit.kit,
    zones: kit.zones,
    hands: handStates,
    activeZoneIds: [...new Set(handStates.filter((hand) => hand.active && hand.zoneId).map((hand) => hand.zoneId))],
    summary: drumKitCalibrationSummary(kit),
  };
}
