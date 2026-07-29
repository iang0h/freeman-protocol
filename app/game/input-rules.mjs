export function normalizeStickInput(x, y, deadZone = 0.12) {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

export function tapToFire(x, y) {
  const normalizedX = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  const normalizedY = Math.min(1, Math.max(0, Number.isFinite(y) ? y : 0));
  return {
    x: (normalizedX - 0.5) * 20,
    z: (normalizedY - 0.5) * 14,
  };
}
