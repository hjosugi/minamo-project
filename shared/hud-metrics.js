export function computeLossPercent(lost, accepted) {
  const total = Math.max(0, Number(lost) || 0) + Math.max(0, Number(accepted) || 0);
  if (total === 0) return 0;
  return (Math.max(0, Number(lost) || 0) / total) * 100;
}

export function latencyWithinTolerance(measuredMs, expectedMs, tolerancePercent = 10) {
  if (!Number.isFinite(measuredMs) || !Number.isFinite(expectedMs) || expectedMs <= 0) return false;
  return Math.abs(measuredMs - expectedMs) <= expectedMs * (tolerancePercent / 100);
}

export function percentileSample(values, q) {
  const finite = Array.from(values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const index = Math.min(finite.length - 1, Math.max(0, Math.round((finite.length - 1) * q)));
  return finite[index];
}

export function controlledNetemHudCheck({ expectedLossPercent, measuredLost, measuredAccepted, expectedLatencyMs, measuredLatencyMs }) {
  const measuredLossPercent = computeLossPercent(measuredLost, measuredAccepted);
  const lossOk = Math.abs(measuredLossPercent - expectedLossPercent) <= Math.max(1, expectedLossPercent * 0.1);
  return {
    measuredLossPercent,
    lossOk,
    latencyOk: latencyWithinTolerance(measuredLatencyMs, expectedLatencyMs, 10),
  };
}
