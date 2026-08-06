export const ENEMY_MOVEMENT_STALL_LIMIT_MS = 1_500;
const MIN_PROGRESS_DISTANCE = 0.01;
const MAX_TERRAIN_TANGENT = 0.35;

const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function createMovementWatchdogState(targetId = null) {
  return {
    targetId,
    lastDistance: null,
    stalledMs: 0,
  };
}

export function resolveEnemyAdvance(
  {
    position,
    target,
    routeBias = 0,
    arrivalDistance = 1,
    watchdog = createMovementWatchdogState(),
  },
  deltaMs = 0,
) {
  const fromX = finite(position?.x);
  const fromZ = finite(position?.z);
  const targetX = finite(target?.x);
  const targetZ = finite(target?.z);
  const deltaX = targetX - fromX;
  const deltaZ = targetZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  const targetId = target?.id ?? null;
  const elapsed = Math.max(0, finite(deltaMs));
  const previousDistance = Number.isFinite(watchdog?.lastDistance)
    ? watchdog.lastDistance
    : null;
  const targetChanged = watchdog?.targetId !== targetId;
  const progressed =
    previousDistance === null ||
    distance < previousDistance - MIN_PROGRESS_DISTANCE;
  const stalledMs =
    targetChanged || progressed
      ? 0
      : Math.min(
          ENEMY_MOVEMENT_STALL_LIMIT_MS,
          Math.max(0, finite(watchdog?.stalledMs)) + elapsed,
        );
  const nextWatchdog = {
    targetId,
    lastDistance: distance,
    stalledMs,
  };

  if (distance <= Number.EPSILON) {
    return {
      vector: { x: 0, z: 0 },
      distance,
      forcedDirect: false,
      watchdog: nextWatchdog,
    };
  }

  const directX = deltaX / distance;
  const directZ = deltaZ / distance;
  const forcedDirect = stalledMs >= ENEMY_MOVEMENT_STALL_LIMIT_MS;
  if (forcedDirect) {
    return {
      vector: { x: directX, z: directZ },
      distance,
      forcedDirect: true,
      watchdog: nextWatchdog,
    };
  }

  const arrival = Math.max(0, finite(arrivalDistance));
  const distanceFactor = clamp01((distance - arrival) / 6);
  const tangentStrength =
    finite(routeBias) * MAX_TERRAIN_TANGENT * distanceFactor;
  const steeredX = directX - directZ * tangentStrength;
  const steeredZ = directZ + directX * tangentStrength;
  const steeredLength = Math.hypot(steeredX, steeredZ);
  const vector =
    steeredLength <= Number.EPSILON
      ? { x: directX, z: directZ }
      : { x: steeredX / steeredLength, z: steeredZ / steeredLength };

  return {
    vector,
    distance,
    forcedDirect: false,
    watchdog: nextWatchdog,
  };
}
