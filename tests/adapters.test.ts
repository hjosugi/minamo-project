import { describe, expect, it } from 'vitest';
import { mapKGM1HandsToLive2D, mapKGM1ToLive2D } from '../src/adapters/live2d_mapper';
import { mapKGM1HandsToVrmFingers, mapKGM1ToVrmExpressions, mapKGM1ToVrmLookAt } from '../src/adapters/vrm_mapper';
import { mapKGM1ToInochi2D } from '../src/adapters/inochi2d_mapper';
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
    expect(mapKGM1HandsToVrmFingers(frame.tracking.hands).length).toBe(5);
  });

  it('maps Live2D and Inochi2D parameters', () => {
    const frame = frameWithFaceAndHand();
    expect(mapKGM1ToLive2D(frame).map((p) => p.id)).toContain('ParamEyeBallX');
    expect(mapKGM1HandsToLive2D(frame).some((p) => p.id === 'ParamHandRIndexCurl')).toBe(true);
    expect(mapKGM1ToInochi2D(frame).map((p) => p.name)).toContain('mouth_pucker');
  });
});
