import type { KGM1Frame } from './types';

export interface KGM1RoomEnvelope {
  schema: 'minamo.room-envelope.v1';
  room: string;
  participantId: string;
  sentAtMs: number;
  frame: KGM1Frame;
}

export function encodeKGM1Json(frame: KGM1Frame): string {
  validateFrame(frame);
  return JSON.stringify(frame);
}

export function decodeKGM1Json(json: string): KGM1Frame {
  const frame = JSON.parse(json) as KGM1Frame;
  validateFrame(frame);
  return frame;
}

export function validateFrame(frame: KGM1Frame): void {
  if (frame.magic !== 'KGM1') throw new Error('Invalid KGM1 magic');
  if (!frame.version) throw new Error('Missing KGM1 version');
  if (!Number.isInteger(frame.frameId) || frame.frameId < 0) throw new Error('Invalid frameId');
  if (!frame.clock?.sourceTimeNs || !frame.clock?.monotonicTimeNs) throw new Error('Missing clock');
  if (!frame.quality) throw new Error('Missing quality');
}

export function createEmptyFrame(frameId: number, nowMs = performance.now()): KGM1Frame {
  const ns = BigInt(Math.round(nowMs * 1_000_000)).toString();
  return {
    magic: 'KGM1',
    version: '0.1.0',
    frameId,
    clock: {
      sourceTimeNs: ns,
      monotonicTimeNs: ns,
      estimatedLatencyMs: 0,
    },
    tracking: {},
    quality: {
      fps: 0,
      captureLatencyMs: 0,
      inferenceLatencyMs: 0,
      stabilizationLatencyMs: 0,
      overallConfidence: 0,
      perSignalConfidence: {},
      droppedFrames: 0,
      warnings: [],
    },
  };
}

export function wrapKGM1FrameForRoom(
  room: string,
  participantId: string,
  frame: KGM1Frame,
  sentAtMs = performance.now(),
): KGM1RoomEnvelope {
  validateFrame(frame);
  return {
    schema: 'minamo.room-envelope.v1',
    room,
    participantId,
    sentAtMs,
    frame,
  };
}

export function latestFrameByParticipant(envelopes: readonly KGM1RoomEnvelope[]): Map<string, KGM1RoomEnvelope> {
  const latest = new Map<string, KGM1RoomEnvelope>();
  for (const envelope of envelopes) {
    const previous = latest.get(envelope.participantId);
    if (!previous || envelope.sentAtMs >= previous.sentAtMs) {
      latest.set(envelope.participantId, envelope);
    }
  }
  return latest;
}
