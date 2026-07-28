const RADII = [4.8, 5.4];
const ANGLES_PER_RING = 24;
const MIN_RADIUS = 2.35;
const MAX_RADIUS = 7.2;
const MIN_SPACING = 1.8;
const SENTRY_RANGE = 8.5;

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

export function isValidSentryPosition(position, existing, blockers) {
  const coreDistance = Math.hypot(position.x, position.z);
  if (coreDistance < MIN_RADIUS || coreDistance > MAX_RADIUS) return false;
  if (existing.some((item) => distance(item, position) < MIN_SPACING)) {
    return false;
  }
  return !blockers.some(
    (item) => distance(item, position) < (item.radius ?? 0.5) + 0.7,
  );
}

export function scoreSentryPosition(position, existing, blockers) {
  const coreDistance = Math.hypot(position.x, position.z);
  const preferredRadiusScore = 12 - Math.abs(coreDistance - 5.1) * 3;
  const separation =
    existing.length === 0
      ? 9
      : Math.min(...existing.map((item) => distance(item, position)));
  const overlapPenalty = existing.reduce((penalty, item) => {
    const overlap = Math.max(0, SENTRY_RANGE * 1.35 - distance(item, position));
    return penalty + overlap * 0.18;
  }, 0);
  const blockerClearance =
    blockers.length === 0
      ? 3
      : Math.min(
          3,
          Math.min(
            ...blockers.map(
              (item) =>
                distance(item, position) - (item.radius ?? 0.5),
            ),
          ),
        );
  return preferredRadiusScore + separation * 2 + blockerClearance - overlapPenalty;
}

export function selectAutoSentryPosition(existing, blockers) {
  const candidates = RADII.flatMap((radius, ring) =>
    Array.from({ length: ANGLES_PER_RING }, (_, index) => {
      const angle = (index / ANGLES_PER_RING) * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        candidateIndex: ring * ANGLES_PER_RING + index,
      };
    }),
  ).filter((position) =>
    isValidSentryPosition(position, existing, blockers),
  );

  candidates.sort(
    (left, right) =>
      scoreSentryPosition(right, existing, blockers) -
        scoreSentryPosition(left, existing, blockers) ||
      left.candidateIndex - right.candidateIndex,
  );

  const selected = candidates[0];
  return selected ? { x: selected.x, z: selected.z } : null;
}
