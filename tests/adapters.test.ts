import { describe, expect, it } from 'vitest';
import { mapKGM1HandsToLive2D, mapKGM1ToLive2D } from '../src/adapters/live2d_mapper';
import { mapKGM1HandsToVrmFingers, mapKGM1ToVrmExpressions, mapKGM1ToVrmLookAt } from '../src/adapters/vrm_mapper';
import { mapKGM1ToInochi2D } from '../src/adapters/inochi2d_mapper';
import {
  applyRigLimit,
  createAvatarPresetProfile,
  mapFrameWithAvatarPreset,
  parseAvatarPreset,
  serializeAvatarPreset,
} from '../src/adapters/avatar_profile';
import { createEmptyFrame, createSyntheticHandLandmarks, defaultEye, defaultMouth, solveHandState } from '../src/core';

function frameWithFaceAndHand() {
  const frame = createEmptyFrame(1, 0);
  const mouth = defaultMouth();
  mouth.open = 0.8;
  mouth.vowel = 'A';
  mouth.smileLeft = 0.4;
  const leftEye = { ...defaultEye(), blink: 0.2, gaze: { x: 0.3, y: -0.2, z: 1 }, confidence: 1 };
  const rightEye = { ...defaultEye(), blink: 0.1, gaze: { x: 0.1, y: -0.1, z: 1 }, confidence: 1 };
  frame.tracking.face = {
    detected: true,
    confidence: 1,
    leftEye,
    rightEye,
    mouth,
    blendshapes: { browInnerUp: 0.5 },
    warnings: [],
  };
  frame.tracking.hands = [solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(1, 'Right') })];
  return frame;
}

describe('avatar mapper snapshots', () => {
  it('maps VRM expressions, look-at, and fingers', () => {
    const frame = frameWithFaceAndHand();
    expect(mapKGM1ToVrmExpressions(frame)).toMatchInlineSnapshot(`
      [
        {
          "name": "aa",
          "value": 0.8,
        },
        {
          "name": "ee",
          "value": 0,
        },
        {
          "name": "ih",
          "value": 0,
        },
        {
          "name": "oh",
          "value": 0,
        },
        {
          "name": "ou",
          "value": 0,
        },
        {
          "name": "blinkLeft",
          "value": 0.2,
        },
        {
          "name": "blinkRight",
          "value": 0.1,
        },
        {
          "name": "happy",
          "value": 0.4,
        },
        {
          "name": "angry",
          "value": 0,
        },
        {
          "name": "surprised",
          "value": 0.315,
        },
      ]
    `);
    expect(mapKGM1ToVrmLookAt(frame)).toEqual({ yaw: 0.2, pitch: -0.15000000000000002 });
    const fingers = mapKGM1HandsToVrmFingers(frame.tracking.hands);
    expect(fingers.length).toBe(5);
    const index = fingers.find((finger) => finger.finger === 'index');
    expect(index?.proximal).toBeGreaterThanOrEqual(index?.intermediate ?? 0);
    expect(index?.intermediate).toBeGreaterThanOrEqual(index?.distal ?? 0);
    for (const output of mapKGM1ToVrmExpressions(frame)) {
      expect(output.value).toBeGreaterThanOrEqual(0);
      expect(output.value).toBeLessThanOrEqual(1);
    }
    for (const output of fingers) {
      expect(output.proximal).toBeGreaterThanOrEqual(0);
      expect(output.proximal).toBeLessThanOrEqual(1);
      expect(output.spread).toBeGreaterThanOrEqual(-1);
      expect(output.spread).toBeLessThanOrEqual(1);
    }
  });

  it('maps Live2D and Inochi2D parameters', () => {
    const frame = frameWithFaceAndHand();
    const live2d = [...mapKGM1ToLive2D(frame), ...mapKGM1HandsToLive2D(frame)];
    const inochi = mapKGM1ToInochi2D(frame);
    expect(live2d.map((p) => p.id)).toContain('ParamEyeBallX');
    expect(live2d.some((p) => p.id === 'ParamHandRIndexCurl')).toBe(true);
    expect(inochi.map((p) => p.name)).toContain('mouth_pucker');
    for (const output of [...live2d.map((p) => p.value), ...inochi.map((p) => p.value)]) {
      expect(output).toBeGreaterThanOrEqual(-1);
      expect(output).toBeLessThanOrEqual(1);
    }
  });

  it('round-trips avatar preset profile JSON and enforces rig limits', () => {
    const frame = frameWithFaceAndHand();
    const profile = createAvatarPresetProfile('vrm', 'streaming rig');
    profile.rigLimits['lookAt:yaw'] = { min: -0.1, max: 0.1 };
    profile.rigLimits['ParamCustomSmile'] = { min: 0, max: 0.25 };
    profile.mappings.push({
      source: 'expression:happy',
      target: 'ParamCustomSmile',
      weight: 0.8,
      curve: 'linear',
    });

    const parsed = parseAvatarPreset(serializeAvatarPreset(profile));
    expect(parsed.schema).toBe('minamo.avatar-preset.v1');
    expect(parsed.name).toBe('streaming rig');
    expect(parsed.rigLimits['lookAt:pitch']).toEqual({ min: -1, max: 1 });
    const targets = mapFrameWithAvatarPreset(frame, parsed);
    expect(targets.find((target) => target.target === 'lookAt:yaw')?.value).toBe(0.1);
    expect(targets.find((target) => target.target === 'ParamCustomSmile')?.value).toBe(0.25);
    expect(applyRigLimit('ParamCustomSmile', Number.NaN, parsed.rigLimits.ParamCustomSmile)).toBe(0);
  });
});
