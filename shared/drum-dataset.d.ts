export const DRUM_DATASET_SCHEMA: 'minamo.drum-dataset.v1';
export const TRACKER_SAMPLE_SCHEMA: 'minamo.dataset.tracker-sample.v1';

export type DrumDatasetZoneType =
  | 'snare'
  | 'hihat'
  | 'ride'
  | 'crash'
  | 'tom'
  | 'floorTom'
  | 'kick'
  | 'bass'
  | 'slap'
  | 'tap'
  | 'head'
  | 'edge'
  | 'percussion';

export interface DrumDatasetPoint {
  x: number;
  y: number;
  z: number;
}

export type DrumDatasetLabel =
  | {
      kind: 'stick';
      id: string;
      representation: 'keypoint-only';
      points: [DrumDatasetPoint];
      hand: 'Left' | 'Right';
    }
  | {
      kind: 'stick';
      id: string;
      representation: 'tip-tail-padded';
      points: [DrumDatasetPoint, DrumDatasetPoint];
      hand: 'Left' | 'Right';
    }
  | {
      kind: 'drumZone';
      id: string;
      points: [DrumDatasetPoint, DrumDatasetPoint, DrumDatasetPoint, ...DrumDatasetPoint[]];
      zoneType: DrumDatasetZoneType;
    }
  | {
      kind: 'hit';
      id: string;
      points: [DrumDatasetPoint];
      zoneType: DrumDatasetZoneType;
      hand?: 'Left' | 'Right';
      timeMs: number;
    };

export interface DrumDatasetAnnotation {
  schema: typeof DRUM_DATASET_SCHEMA;
  frameId: string;
  labels: DrumDatasetLabel[];
  consent: {
    localOnly: boolean;
    license: string;
  };
}

export const DRUM_DATASET_ZONE_TYPES: readonly DrumDatasetZoneType[];
export const DRUM_STICK_BOX_PADDING: 0.01;

export function validateDrumDatasetAnnotation(value: unknown): { ok: boolean; errors: string[] };
export function parseDrumDatasetAnnotation(input: string | unknown): DrumDatasetAnnotation;

export function createDrumDatasetAnnotation(input: {
  frameId: string;
  labels?: DrumDatasetLabel[];
  license?: string;
  localOnly?: boolean;
}): DrumDatasetAnnotation;
export function createDrumDatasetAnnotation(
  frameId: string,
  labels: DrumDatasetLabel[],
  license?: string,
): DrumDatasetAnnotation;

export function createDrumDatasetAnnotationFromTrackerSample(
  sample: unknown,
  labels: DrumDatasetLabel[],
  options?: { frameId?: string },
): DrumDatasetAnnotation;

export function deriveStickLabelBox(label: DrumDatasetLabel): {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
} | null;
