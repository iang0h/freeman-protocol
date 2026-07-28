export const ACTIVE_ENEMY_LIMITS = Object.freeze({
  webgl: 36,
  canvas: 28,
});

export function getActiveEnemyLimit(renderer) {
  return ACTIVE_ENEMY_LIMITS[renderer] ?? ACTIVE_ENEMY_LIMITS.canvas;
}

export function releaseSpawnBatch(queue, capacity, now, nextReleaseAt) {
  if (capacity <= 0 || queue.length === 0 || now < nextReleaseAt) {
    return {
      released: [],
      queue: [...queue],
      nextReleaseAt,
    };
  }

  const count = Math.min(4, capacity, queue.length);
  return {
    released: queue.slice(0, count),
    queue: queue.slice(count),
    nextReleaseAt: now + 0.75,
  };
}

export function remainingThreats({ active, queued, scheduled }) {
  return active + queued + scheduled;
}

export function canCompleteWave(state) {
  return remainingThreats(state) === 0;
}
