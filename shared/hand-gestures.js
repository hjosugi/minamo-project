// Hand gesture classification.
//
// Sits below the hand calibration and drum kit modules, both of which ask the
// same question — "is this hand doing something?" — and would otherwise import
// each other to find out.

import { clamp } from './math.js';

export const HAND_FINGER_NAMES = Object.freeze(['thumb', 'index', 'middle', 'ring', 'pinky']);

export function classifyHandGesture(target = {}) {
  const curls = HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.curls?.[i] || 0)));
  const extended = curls.map((curl) => curl < 0.35);
  const curled = curls.map((curl) => curl > 0.65);
  const fingerCount = extended.filter(Boolean).length;
  const point = extended[1] && curled[2] && curled[3] && curled[4];
  const peace = extended[1] && extended[2] && curled[3] && curled[4];
  const openPalm = fingerCount >= 4;
  const fist = curled.filter(Boolean).length >= 4;
  const drumGrip = curls[1] > 0.35 && curls[1] < 0.82
    && curls[2] > 0.42 && curls[2] < 0.92
    && curls[3] > 0.42 && curls[3] < 0.95
    && curls[0] < 0.75;
  return {
    fingerCount,
    openPalm,
    fist,
    point,
    peace,
    drumGrip,
    label: point ? 'point' : peace ? 'peace' : drumGrip ? 'drum grip' : openPalm ? 'open' : fist ? 'fist' : `${fingerCount}`,
  };
}

export function handTargetDebugRows(targets = []) {
  return targets.flatMap((target) => {
    const gesture = target.gesture || classifyHandGesture(target);
    return HAND_FINGER_NAMES.map((name, i) => ({
      handedness: target.handedness,
      finger: name,
      curl: clamp(Number(target.curls?.[i] || 0)),
      spread: clamp(Number(target.spreads?.[i] || 0), -1.5, 1.5),
      confidence: clamp(Number(target.confidence ?? 1)),
      gesture: gesture.label,
      recovered: Boolean((target.flags || 0) & 0x02),
    }));
  });
}

/**
 * @param {string} [name]
 * @param {string} [kitId] percussion kit id; defaults to the five-piece stick kit
 */
