export function normalizeStickInput(x, y, deadZone = 0.12) {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

export function tapToFire(x, y) {
  return {
    x: Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0)),
    y: Math.min(1, Math.max(0, Number.isFinite(y) ? y : 0)),
  };
}
