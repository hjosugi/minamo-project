const TARGET_POST_INTERVAL_MS = 20;

class MinamoAudioLipsyncProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.lowState = 0;
    this.previousSample = 0;
    this.previousFrame = createSilentFrame();
    this.lastPostTimeMs = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    let sum = 0;
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      this.lowState += (sample - this.lowState) * 0.06;
      const mid = sample - this.lowState;
      const high = sample - this.previousSample;
      this.previousSample = sample;
      sum += sample * sample;
      lowEnergy += this.lowState * this.lowState;
      midEnergy += mid * mid;
      highEnergy += high * high;
    }

    const rms = Math.sqrt(sum / channel.length);
    const frame = estimateFrame({
      rms,
      low: Math.sqrt(lowEnergy / channel.length),
      mid: Math.sqrt(midEnergy / channel.length),
      high: Math.sqrt(highEnergy / channel.length),
      contextTimeMs: currentTime * 1000,
    });
    const dtMs = Math.max(0, frame.contextTimeMs - this.previousFrame.contextTimeMs);
    this.previousFrame = smoothFrame(this.previousFrame, frame, dtMs);

    if (frame.contextTimeMs - this.lastPostTimeMs >= TARGET_POST_INTERVAL_MS) {
      this.lastPostTimeMs = frame.contextTimeMs;
      this.port.postMessage(this.previousFrame);
    }
    return true;
  }
}

function createSilentFrame(overrides = {}) {
  return {
    type: 'viseme',
    contextTimeMs: 0,
    rms: 0,
    speech: 0,
    openness: 0,
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
    funnel: 0,
    pucker: 0,
    wide: 0,
    close: 0,
    ...overrides,
  };
}

function estimateFrame({ rms, low, mid, high, contextTimeMs }) {
  const speech = levelFromRms(rms);
  const total = Math.max(1e-9, Math.abs(low) + Math.abs(mid) + Math.abs(high));
  const lowRatio = clamp01(Math.abs(low) / total);
  const midRatio = clamp01(Math.abs(mid) / total);
  const highRatio = clamp01(Math.abs(high) / total);
  const round = clamp01((lowRatio * 1.25 + midRatio * 0.25 - highRatio * 0.45) * speech);
  const wide = clamp01((highRatio * 1.15 + midRatio * 0.45 - lowRatio * 0.25) * speech);
  const open = clamp01(speech * (0.58 + midRatio * 0.35 + lowRatio * 0.15));
  const close = clamp01((1 - speech) * 0.18);
  return createSilentFrame({
    contextTimeMs,
    rms,
    speech,
    openness: open,
    aa: clamp01(open * (1 - round * 0.55) * (1 - wide * 0.35)),
    ih: clamp01(wide * (0.55 + speech * 0.35)),
    ou: clamp01(round * (0.65 + speech * 0.25)),
    ee: clamp01(wide * (0.75 + highRatio * 0.2)),
    oh: clamp01(round * open),
    funnel: clamp01(round * 0.9),
    pucker: clamp01(round * 0.72),
    wide,
    close,
  });
}

function smoothFrame(previous, next, dtMs) {
  const out = createSilentFrame({ ...next });
  for (const key of ['speech', 'openness', 'aa', 'ih', 'ou', 'ee', 'oh', 'funnel', 'pucker', 'wide', 'close']) {
    const target = Number(next[key] || 0);
    const current = Number(previous[key] || 0);
    const timeConstant = target > current ? 30 : 120;
    const amount = clamp01(dtMs / Math.max(1, timeConstant));
    out[key] = current + (target - current) * amount;
  }
  return out;
}

function levelFromRms(rms) {
  return clamp01((Number(rms) - 0.015) / Math.max(1e-6, 0.12 - 0.015));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

registerProcessor('minamo-audio-lipsync', MinamoAudioLipsyncProcessor);
