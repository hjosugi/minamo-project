// KAGAMI canonical blendshape channel list.
// The wire protocol (KGM1) always carries these 52 channels in this exact order.
// The list follows the ARKit 52 naming. MediaPipe Face Landmarker outputs the
// same names (it adds "_neutral" and omits "tongueOut"; both cases are handled
// by name-based mapping, so the protocol stays model-agnostic).

export const ARKIT_52 = [
  'browDownLeft', 'browDownRight', 'browInnerUp',
  'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight',
  'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel',
  'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper',
  'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight',
  'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight',
  'tongueOut',
];

export const NUM_CHANNELS = ARKIT_52.length; // 52

// name -> canonical index
export const CHANNEL_INDEX = Object.fromEntries(ARKIT_52.map((n, i) => [n, i]));

// Mirror table: index -> index with Left/Right swapped.
// Used when the tracker runs in selfie (mirrored) mode.
export const MIRROR_INDEX = ARKIT_52.map((name) => {
  let swapped = null;
  if (name.endsWith('Left')) swapped = name.slice(0, -4) + 'Right';
  else if (name.endsWith('Right')) swapped = name.slice(0, -5) + 'Left';
  if (swapped && swapped in CHANNEL_INDEX) return CHANNEL_INDEX[swapped];
  return CHANNEL_INDEX[name];
});

// Pose points carried by the POSE block, in MediaPipe Pose Landmarker
// world-landmark index order. Positions are meters, hip-centered.
export const POSE_POINTS = [
  { name: 'nose', mp: 0 },
  { name: 'leftShoulder', mp: 11 },
  { name: 'rightShoulder', mp: 12 },
  { name: 'leftElbow', mp: 13 },
  { name: 'rightElbow', mp: 14 },
  { name: 'leftWrist', mp: 15 },
  { name: 'rightWrist', mp: 16 },
];
export const NUM_POSE_POINTS = POSE_POINTS.length; // 7
