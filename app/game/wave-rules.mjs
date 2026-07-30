export const WAVE_INTERMISSION_MS = 3_000;

export function tickWaveIntermission(remainingMs, elapsedMs) {
  return Math.max(0, (Number(remainingMs) || 0) - Math.max(0, Number(elapsedMs) || 0));
}
