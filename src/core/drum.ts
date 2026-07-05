import { distance, length, sub } from './math';
import type { DrumHitEvent, Vec3 } from './types';

export interface DrumZone {
  id: string;
  type: DrumHitEvent['zoneType'];
  center: Vec3;
  radius: number;
  cooldownMs: number;
}

export interface StickTipSample {
  id: string;
  timeMs: number;
  position: Vec3;
  previousPosition: Vec3;
  hand?: 'Left' | 'Right';
}

export interface AudioOnset {
  timeMs: number;
  strength: number;
  frequencyHz?: number;
}

export class DrumHitDetector {
  private readonly lastHitMs = new Map<string, number>();

  constructor(private readonly zones: DrumZone[]) {}

  detect(sample: StickTipSample): DrumHitEvent[] {
    const hits: DrumHitEvent[] = [];
    const velocity = sub(sample.position, sample.previousPosition);
    const speed = length(velocity);
    const downstroke = velocity.y > 0.015;

    for (const zone of this.zones) {
      const dist = distance(sample.position, zone.center);
      const last = this.lastHitMs.get(zone.id) ?? -Infinity;
      const cooledDown = sample.timeMs - last >= zone.cooldownMs;
      if (dist <= zone.radius && downstroke && speed > 0.02 && cooledDown) {
        this.lastHitMs.set(zone.id, sample.timeMs);
        const hit: DrumHitEvent = {
          eventId: `${sample.id}:${zone.id}:${Math.round(sample.timeMs)}`,
          timeNs: Math.round(sample.timeMs * 1_000_000),
          stickId: sample.id,
          zoneId: zone.id,
          zoneType: zone.type,
          position: sample.position,
          velocity,
          speed,
          confidence: Math.min(1, 0.5 + speed * 10),
          audioAligned: false,
        };
        if (sample.hand) hit.hand = sample.hand;
        hits.push(hit);
      }
    }
    return hits;
  }
}

export function estimateHitVelocity(current: Vec3, previous: Vec3, dtSec: number): Vec3 {
  if (dtSec <= 0) return { x: 0, y: 0, z: 0 };
  return {
    x: (current.x - previous.x) / dtSec,
    y: (current.y - previous.y) / dtSec,
    z: (current.z - previous.z) / dtSec,
  };
}

export function fuseVisualHitWithAudio(hit: DrumHitEvent, onsets: AudioOnset[], windowMs = 35): DrumHitEvent {
  const nearest = onsets
    .filter((onset) => Math.abs(onset.timeMs - hit.timeNs / 1_000_000) <= windowMs)
    .sort((a, b) => Math.abs(a.timeMs - hit.timeNs / 1_000_000) - Math.abs(b.timeMs - hit.timeNs / 1_000_000))[0];
  if (!nearest) return hit;
  return {
    ...hit,
    timeNs: Math.round(nearest.timeMs * 1_000_000),
    confidence: Math.min(1, hit.confidence + nearest.strength * 0.25),
    audioAligned: true,
  };
}
