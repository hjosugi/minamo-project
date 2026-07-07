import { clamp, lerp } from './math';

export interface AudioFrame {
  timeMs: number;
  samples: Float32Array;
  sampleRate: number;
}

export interface AudioOnsetEvent {
  timeMs: number;
  strength: number;
  rms: number;
}

export class AudioOnsetDetector {
  private previousEnergy = 0;
  private noiseFloor = 0.001;
  private lastOnsetMs = -Infinity;

  constructor(
    private readonly threshold = 2.8,
    private readonly cooldownMs = 45,
  ) {}

  process(frame: AudioFrame): AudioOnsetEvent | null {
    const rms = rootMeanSquare(frame.samples);
    this.noiseFloor = lerp(this.noiseFloor, rms, 0.02);
    const rise = rms / Math.max(this.previousEnergy, this.noiseFloor, 1e-5);
    this.previousEnergy = lerp(this.previousEnergy, rms, 0.35);
    if (rise >= this.threshold && frame.timeMs - this.lastOnsetMs >= this.cooldownMs) {
      this.lastOnsetMs = frame.timeMs;
      return { timeMs: frame.timeMs, strength: clamp((rise - this.threshold) / this.threshold, 0, 1), rms };
    }
    return null;
  }
}

export function rootMeanSquare(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function voiceActivityMouthAccent(visualOpen: number, audioRms: number, amount = 0.25): number {
  const audioOpen = clamp((audioRms - 0.015) / 0.12, 0, 1);
  return clamp(lerp(visualOpen, Math.max(visualOpen, audioOpen), amount), 0, 1);
}
