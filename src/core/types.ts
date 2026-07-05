export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export type Handedness = 'Left' | 'Right';
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface JointState {
  position: Vec3;
  rotation?: Quat;
  flexion?: number;
  abduction?: number;
  confidence: number;
}

export interface ContactState {
  touching: boolean;
  target?: string;
  distance?: number;
  confidence: number;
}

export interface FingerState {
  name: FingerName;
  mcp: JointState;
  pip?: JointState;
  dip?: JointState;
  tip: JointState;
  curl: number;
  spread: number;
  pinchToThumb?: number;
  contact: ContactState;
  tipVelocity: Vec3;
  confidence: number;
  occluded: boolean;
}

export interface HandState {
  handedness: Handedness;
  detected: boolean;
  confidence: number;
  fingers: Record<FingerName, FingerState>;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  warnings: string[];
}

export interface EyeState {
  blink: number;
  openness: number;
  squint: number;
  gaze: Vec3;
  irisCenter?: Vec2;
  confidence: number;
}

export interface MouthState {
  open: number;
  wide: number;
  pucker: number;
  smileLeft: number;
  smileRight: number;
  frownLeft: number;
  frownRight: number;
  jawForward: number;
  vowel?: 'A' | 'I' | 'U' | 'E' | 'O' | 'neutral';
  confidence: number;
}

export interface FaceState {
  detected: boolean;
  confidence: number;
  headRotation?: Quat;
  leftEye: EyeState;
  rightEye: EyeState;
  mouth: MouthState;
  blendshapes: Record<string, number>;
  landmarks?: Landmark[];
  warnings: string[];
}

export interface DrumHitEvent {
  eventId: string;
  timeNs: number;
  hand?: Handedness;
  stickId?: string;
  zoneId: string;
  zoneType: 'snare' | 'hihat' | 'ride' | 'crash' | 'tom' | 'floorTom' | 'kick' | 'pedal' | 'unknown';
  position: Vec3;
  velocity: Vec3;
  speed: number;
  confidence: number;
  audioAligned: boolean;
}

export interface DrumState {
  kitCalibrated: boolean;
  hits: DrumHitEvent[];
  warnings: string[];
}

export interface QualityState {
  fps: number;
  captureLatencyMs: number;
  inferenceLatencyMs: number;
  stabilizationLatencyMs: number;
  transportLatencyMs?: number;
  overallConfidence: number;
  perSignalConfidence: Record<string, number>;
  droppedFrames: number;
  warnings: string[];
}

export interface KGM1Frame {
  magic: 'KGM1';
  version: string;
  frameId: number;
  clock: {
    sourceTimeNs: string;
    monotonicTimeNs: string;
    estimatedLatencyMs: number;
  };
  tracking: {
    face?: FaceState;
    hands?: HandState[];
    drums?: DrumState;
  };
  quality: QualityState;
}
