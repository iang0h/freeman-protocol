export const CINEMA_SPEEDS = Object.freeze([0.5, 1, 2, 4]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const nearestSpeed = (value) => {
  const numeric = Number(value);
  return CINEMA_SPEEDS.reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best,
  CINEMA_SPEEDS[0]);
};

export function createCinemaState() {
  return Object.freeze({
    active: true,
    paused: false,
    cleanView: false,
    speed: 1,
    elapsedMs: 0,
  });
}

export function setCinemaSpeed(state, speed) {
  return Object.freeze({
    ...createCinemaState(),
    ...(state ?? {}),
    speed: nearestSpeed(speed),
  });
}

export function toggleCinemaPaused(state) {
  return Object.freeze({
    ...createCinemaState(),
    ...(state ?? {}),
    paused: !Boolean(state?.paused),
  });
}

export function toggleCinemaCleanView(state) {
  return Object.freeze({
    ...createCinemaState(),
    ...(state ?? {}),
    cleanView: !Boolean(state?.cleanView),
  });
}

export function tickCinemaState(state, deltaMs) {
  const current = state ?? createCinemaState();
  if (current.paused) return Object.freeze({ ...current });
  const delta = clamp(Number(deltaMs) || 0, 0, 1_000);
  return Object.freeze({
    ...createCinemaState(),
    ...current,
    elapsedMs: Math.max(0, Number(current.elapsedMs) || 0) + delta * current.speed,
  });
}
