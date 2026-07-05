import {
  createEmptyFrame,
  createSyntheticHandLandmarks,
  defaultEye,
  defaultMouth,
  solveHandState,
} from '../src/core/index.ts';
import {
  mapKGM1HandsToVrmFingers,
  mapKGM1ToVrmExpressions,
  mapKGM1ToVrmLookAt,
} from '../src/adapters/vrm_mapper.ts';
import {
  mapKGM1HandsToLive2D,
  mapKGM1ToLive2D,
} from '../src/adapters/live2d_mapper.ts';
import { mapKGM1ToInochi2D } from '../src/adapters/inochi2d_mapper.ts';

const $ = (id) => document.getElementById(id);

function diagnosticFrame() {
  const frame = createEmptyFrame(100, performance.now());
  const mouth = defaultMouth();
  mouth.open = 0.82;
  mouth.wide = 0.44;
  mouth.pucker = 0.1;
  mouth.smileLeft = 0.62;
  mouth.smileRight = 0.58;
  mouth.vowel = 'A';
  frame.tracking.face = {
    detected: true,
    confidence: 0.97,
    leftEye: { ...defaultEye(), blink: 0.22, gaze: { x: 0.32, y: -0.18, z: 1 }, confidence: 1 },
    rightEye: { ...defaultEye(), blink: 0.18, gaze: { x: 0.18, y: -0.12, z: 1 }, confidence: 1 },
    mouth,
    blendshapes: { browInnerUp: 0.4 },
    warnings: [],
  };
  frame.tracking.hands = [
    solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(1, 'Right') }),
  ];
  return frame;
}

function render() {
  const frame = diagnosticFrame();
  $('vrmExpressions').textContent = JSON.stringify(mapKGM1ToVrmExpressions(frame), null, 2);
  $('vrmRig').textContent = JSON.stringify({
    lookAt: mapKGM1ToVrmLookAt(frame),
    fingers: mapKGM1HandsToVrmFingers(frame.tracking.hands),
  }, null, 2);
  $('live2d').textContent = JSON.stringify([
    ...mapKGM1ToLive2D(frame),
    ...mapKGM1HandsToLive2D(frame),
  ], null, 2);
  $('inochi2d').textContent = JSON.stringify(mapKGM1ToInochi2D(frame), null, 2);
}

render();
