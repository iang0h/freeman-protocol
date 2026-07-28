export function normalizeStickInput(x, y, deadZone = 0.12) {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}
