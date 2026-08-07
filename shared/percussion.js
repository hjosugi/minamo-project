// Percussion kits: what is being struck, and what counts as striking it.
//
// The zone overlay was written for one instrument — a five-piece kit played with
// sticks — and it hard-coded that assumption in the place it hurts most: a zone
// only lit up when the hand held a stick grip. Hand percussion is played with an
// open palm or a flat hand, and `openPalm` is mutually exclusive with `drumGrip`
// (one needs finger curl below 0.35, the other above it), so a cajon or a conga
// could sit dead centre in a calibrated zone and never register a single strike.
//
// A kit therefore carries both its zone layout and its strike style. `mixed` is
// not a convenience: a percussionist with a stick in one hand and a bare hand on
// a cajon is an ordinary setup, and the styles are evaluated per hand.
//
// Pure and JSON-serializable; the tracker, the overlay and the tests share it.

export const PERCUSSION_KIT_SCHEMA = 'minamo.percussion-kit.v1';
export const DEFAULT_PERCUSSION_KIT_ID = 'drum-kit';

/**
 * How a strike is recognized, per instrument family.
 *
 * These read gesture flags rather than raw curls so they stay in step with
 * `classifyHandGesture`; a change to what "open palm" means lands here too.
 */
export const STRIKE_STYLES = Object.freeze({
  // Sticks, mallets, brushes: a partly closed hand wrapped around a shaft.
  stick: Object.freeze({
    id: 'stick',
    labelKey: 'percussion.strike.stick.label',
    matches: (gesture) => Boolean(gesture?.drumGrip),
  }),
  // Cajon, congas, bongos, djembe: open-palm slaps and flat-hand bass tones.
  // A fist counts because a closed hand is a real technique (a djembe bass, a
  // cajon heel) and because a hand seen edge-on reads as curled.
  hand: Object.freeze({
    id: 'hand',
    labelKey: 'percussion.strike.hand.label',
    matches: (gesture) => Boolean(gesture?.openPalm || gesture?.fist),
  }),
  // Hybrid rigs — stick in one hand, bare hand on the other. Evaluated per hand,
  // so each hand is judged by whichever technique it is actually using.
  mixed: Object.freeze({
    id: 'mixed',
    labelKey: 'percussion.strike.mixed.label',
    matches: (gesture) => Boolean(gesture?.drumGrip || gesture?.openPalm || gesture?.fist),
  }),
});

function zone(id, label, type, x, y, radius) {
  return Object.freeze({ id, label, type, x, y, radius });
}

/**
 * Kit catalogue. Positions are normalized stage coordinates (0..1) used as the
 * starting point for calibration, not as the truth — every zone is placed by the
 * player against their own camera framing.
 */
export const PERCUSSION_KITS = Object.freeze([
  Object.freeze({
    id: 'drum-kit',
    labelKey: 'percussion.kit.drumKit.label',
    strike: 'stick',
    zones: Object.freeze([
      zone('hihat', 'Hi-hat', 'hihat', 0.32, 0.58, 0.075),
      zone('snare', 'Snare', 'snare', 0.50, 0.66, 0.085),
      zone('tom', 'Tom', 'tom', 0.58, 0.52, 0.08),
      zone('ride', 'Ride', 'ride', 0.72, 0.50, 0.09),
      zone('crash', 'Crash', 'crash', 0.38, 0.42, 0.095),
      zone('kick', 'Kick', 'kick', 0.50, 0.82, 0.105),
    ]),
  }),
  Object.freeze({
    id: 'cajon',
    labelKey: 'percussion.kit.cajon.label',
    strike: 'hand',
    // One front plate, played seated: bass in the middle, slaps at the top
    // corners where the plate is least damped, and the lower edges for taps.
    zones: Object.freeze([
      zone('bass', 'Bass', 'bass', 0.50, 0.52, 0.11),
      zone('slap-left', 'Slap L', 'slap', 0.35, 0.34, 0.085),
      zone('slap-right', 'Slap R', 'slap', 0.65, 0.34, 0.085),
      zone('tap-left', 'Tap L', 'tap', 0.33, 0.70, 0.075),
      zone('tap-right', 'Tap R', 'tap', 0.67, 0.70, 0.075),
    ]),
  }),
  Object.freeze({
    id: 'congas',
    labelKey: 'percussion.kit.congas.label',
    strike: 'hand',
    // Three drums left to right, each with a head zone and a rim/edge zone for
    // the open-vs-slap distinction that matters most in conga playing.
    zones: Object.freeze([
      zone('quinto', 'Quinto', 'head', 0.28, 0.52, 0.095),
      zone('conga', 'Conga', 'head', 0.50, 0.50, 0.10),
      zone('tumba', 'Tumba', 'head', 0.72, 0.52, 0.105),
      zone('quinto-edge', 'Quinto edge', 'edge', 0.28, 0.36, 0.065),
      zone('tumba-edge', 'Tumba edge', 'edge', 0.72, 0.36, 0.07),
    ]),
  }),
  Object.freeze({
    id: 'bongos',
    labelKey: 'percussion.kit.bongos.label',
    strike: 'hand',
    // Small heads played with fingers, so the zones are tight and close
    // together; a loose radius here would make macho and hembra indistinguishable.
    zones: Object.freeze([
      zone('macho', 'Macho', 'head', 0.42, 0.52, 0.07),
      zone('hembra', 'Hembra', 'head', 0.58, 0.52, 0.08),
      zone('macho-edge', 'Macho edge', 'edge', 0.42, 0.38, 0.05),
      zone('hembra-edge', 'Hembra edge', 'edge', 0.58, 0.38, 0.055),
    ]),
  }),
  Object.freeze({
    id: 'hand-percussion',
    labelKey: 'percussion.kit.handPercussion.label',
    strike: 'hand',
    // Generic table setup: djembe, frame drum, shakers, blocks. Deliberately
    // few, large zones — this is the "my rig is not in the list" kit, and the
    // player renames nothing, they just place what they have.
    zones: Object.freeze([
      zone('left', 'Left', 'percussion', 0.28, 0.55, 0.11),
      zone('centre', 'Centre', 'percussion', 0.50, 0.55, 0.11),
      zone('right', 'Right', 'percussion', 0.72, 0.55, 0.11),
      zone('aux', 'Aux', 'percussion', 0.50, 0.32, 0.09),
    ]),
  }),
  Object.freeze({
    id: 'hybrid',
    labelKey: 'percussion.kit.hybrid.label',
    strike: 'mixed',
    // Cajon plus a stick-played auxiliary — the common one-person setup. Strike
    // style is per hand, so the stick hand and the bare hand both register.
    zones: Object.freeze([
      zone('bass', 'Bass', 'bass', 0.42, 0.56, 0.10),
      zone('slap', 'Slap', 'slap', 0.42, 0.36, 0.085),
      zone('aux-hat', 'Aux hat', 'hihat', 0.70, 0.44, 0.08),
      zone('aux-snare', 'Aux snare', 'snare', 0.68, 0.62, 0.085),
      zone('kick', 'Kick', 'kick', 0.45, 0.82, 0.10),
    ]),
  }),
]);

export function percussionKitIds() {
  return PERCUSSION_KITS.map((kit) => kit.id);
}

/**
 * Look up a kit, falling back to the drum kit rather than throwing: the id can
 * come from a stored setting, so an unknown one should start the app.
 *
 * @param {string} id
 */
export function getPercussionKit(id) {
  return PERCUSSION_KITS.find((kit) => kit.id === id)
    || PERCUSSION_KITS.find((kit) => kit.id === DEFAULT_PERCUSSION_KIT_ID);
}

export function isPercussionKitId(id) {
  return PERCUSSION_KITS.some((kit) => kit.id === id);
}

export function getStrikeStyle(id) {
  return STRIKE_STYLES[id] || STRIKE_STYLES.stick;
}

/**
 * Does this hand's gesture count as striking, for this kit?
 *
 * @param {string} kitId
 * @param {{drumGrip?: boolean, openPalm?: boolean, fist?: boolean}} gesture
 */
export function strikeMatches(kitId, gesture) {
  return getStrikeStyle(getPercussionKit(kitId).strike).matches(gesture);
}
