export const ENEMY_MOVEMENT_STALL_LIMIT_MS = 1_500;
export const ENGAGEMENT_REPATH_INTERVAL_MS = 1_200;
export const ENGAGEMENT_REPOSITION_DELAY_MS = 2_000;
export const ENGAGEMENT_REPOSITION_DURATION_MS = 650;

export const ENGAGEMENT_LANES = Object.freeze([
  Object.freeze({
    id: "north-breach",
    staging: Object.freeze({ x: -2.8, z: -4.8 }),
    attackTargetId: "core",
    tangent: Object.freeze({ x: 1, z: 0 }),
  }),
  Object.freeze({
    id: "south-breach",
    staging: Object.freeze({ x: 2.8, z: 4.8 }),
    attackTargetId: "core",
    tangent: Object.freeze({ x: -1, z: 0 }),
  }),
  Object.freeze({
    id: "compute-relay",
    staging: Object.freeze({ x: -5.2, z: 1.7 }),
    attackTargetId: "compute-relay",
    tangent: Object.freeze({ x: 0, z: 1 }),
  }),
  Object.freeze({
    id: "boss-portal",
    staging: Object.freeze({ x: 0, z: -6.45 }),
    attackTargetId: "core",
    tangent: Object.freeze({ x: -1, z: 0 }),
  }),
]);
const MIN_PROGRESS_DISTANCE = 0.01;
const MAX_TERRAIN_TANGENT = 0.35;

/** @typedef {{ targetId: string | number | null, lastDistance: number | null, stalledMs: number }} MovementWatchdogState */

const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

const hashEngagementId = (value) => {
  const source = String(value);
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash;
};

/**
 * @param {number} [wave]
 */
export function createEngagementState(wave = 1) {
  return {
    wave: Math.max(1, Math.floor(finite(wave, 1))),
    records: {},
  };
}

/**
 * @param {string | number} enemyId
 * @param {{ records?: Record<string, EngagementRecord> }} state
 * @param {string} [preferredNode]
 * @returns {EngagementRecord}
 */
export function assignEngagementLane(enemyId, state, preferredNode = "core") {
  const recordId = String(enemyId);
  const existing = state?.records?.[recordId];
  if (existing) return existing;
  const lane = ENGAGEMENT_LANES[
    positiveModulo(hashEngagementId(`${enemyId}:${preferredNode}`), ENGAGEMENT_LANES.length)
  ];
  const record = {
    laneId: lane.id,
    staging: { ...lane.staging },
    attackTargetId: lane.attackTargetId,
    repathLeftMs: ENGAGEMENT_REPATH_INTERVAL_MS,
    repositionLeftMs: 0,
    lastAction: "advance",
    stationaryMs: 0,
    repositionReady: false,
  };
  return record;
}

/**
 * @param {{ wave: number, records: Record<string, EngagementRecord> }} state
 * @param {number} [elapsedMs]
 */
export function tickEngagement(state, elapsedMs = 0) {
  const elapsed = Math.max(0, finite(elapsedMs));
  const records = {};

  for (const [enemyId, record] of Object.entries(state?.records ?? {})) {
    const stationaryMs = Math.max(0, finite(record.stationaryMs)) + elapsed;
    const repositionReady = stationaryMs >= ENGAGEMENT_REPOSITION_DELAY_MS;
    const repositionLeftMs = Math.max(0, finite(record.repositionLeftMs) - elapsed);
    const repathLeftMs = Math.max(0, finite(record.repathLeftMs) - elapsed);
    const repositioning = repositionReady || repositionLeftMs > 0;
    const repathDue = repathLeftMs <= 0;
    records[enemyId] = {
      ...record,
      repathLeftMs: repathLeftMs > 0
        ? repathLeftMs
        : ENGAGEMENT_REPATH_INTERVAL_MS,
      repositionLeftMs: repositionReady
        ? ENGAGEMENT_REPOSITION_DURATION_MS
        : repositionLeftMs,
      stationaryMs: repositionReady ? 0 : stationaryMs,
      repositionReady,
      lastAction: repositioning
        ? "reposition"
        : repathDue
          ? "repath"
          : record.repositionLeftMs > 0
            ? "advance"
          : record.lastAction,
      repathAction: repathDue ? record.lastAction : record.repathAction,
    };
  }

  return {
    ...state,
    records,
  };
}

export function markEngagementAttack(state, enemyId) {
  const recordId = String(enemyId);
  const record = state?.records?.[recordId];
  if (!record) return state;
  return {
    ...state,
    records: {
      ...state.records,
      [recordId]: {
        ...record,
        stationaryMs: 0,
        repositionReady: false,
        repositionLeftMs: ENGAGEMENT_REPOSITION_DURATION_MS,
        lastAction: "attack",
      },
    },
  };
}

export function resolveEngagementAttackTarget(record, targets, fallback) {
  const target = (Array.isArray(targets) ? targets : []).find(
    (candidate) =>
      candidate?.id === record?.attackTargetId &&
      candidate?.status !== "offline" &&
      (!Number.isFinite(candidate?.health) || candidate.health > 0),
  ) ?? fallback;
  return {
    id: target?.id ?? "core",
    x: finite(target?.x),
    z: finite(target?.z),
  };
}

/**
 * @param {{
 *   wave?: number,
 *   engagement?: EngagementRecord | null,
 *   battlefieldNodes?: Array<{ id?: string, x?: number, z?: number, health?: number, status?: string }>,
 *   fallbackTarget?: { id?: string, x?: number, z?: number } | null,
 *   playerDistance?: number,
 *   warSquadDistance?: number,
 *   agentDistance?: number,
 *   turretDistance?: number,
 *   repairBayDistance?: number,
 *   repairBayTarget?: { id?: string, x?: number, z?: number } | null,
 *   genericNodeDistance?: number,
 *   genericNodeTarget?: { id?: string, x?: number, z?: number } | null,
 * }} options
 */
export function selectEnemyTarget({
  wave = 1,
  engagement,
  battlefieldNodes,
  fallbackTarget,
  playerDistance = Infinity,
  warSquadDistance = Infinity,
  agentDistance = Infinity,
  turretDistance = Infinity,
  repairBayDistance = Infinity,
  repairBayTarget = null,
  genericNodeDistance = Infinity,
  genericNodeTarget = null,
} = {}) {
  if (playerDistance < 4.2) return { kind: "player", target: null };
  if (warSquadDistance < 6.5) return { kind: "war-squad", target: null };
  if (agentDistance < 6.5) return { kind: "agent", target: null };
  if (turretDistance < 6.5) return { kind: "turret", target: null };

  if (wave >= 4 && engagement) {
    const assigned = resolveEngagementAttackTarget(
      engagement,
      battlefieldNodes,
      null,
    );
    if (assigned.id === engagement.attackTargetId) {
      return { kind: "engagement", target: assigned };
    }
  }

  if (repairBayDistance < 6.5 && repairBayTarget) {
    return { kind: "repair-bay", target: repairBayTarget };
  }
  if (genericNodeDistance < 6.5 && genericNodeTarget) {
    return {
      kind: "battlefield-node",
      target: {
        id: genericNodeTarget.id,
        x: finite(genericNodeTarget.x),
        z: finite(genericNodeTarget.z),
      },
    };
  }
  return {
    kind: "core",
    target: {
      id: fallbackTarget?.id ?? "core",
      x: finite(fallbackTarget?.x),
      z: finite(fallbackTarget?.z),
    },
  };
}

/**
 * @param {{
 *   position?: { x?: number, z?: number },
 *   target?: { x?: number, z?: number },
 *   arrivalDistance?: number,
 *   lane?: { x?: number, z?: number },
 *   reposition?: boolean,
 * }} options
 * @param {number} [deltaMs]
 */
export function resolveEngagementAdvance(
  { position, target, arrivalDistance = 1, lane, reposition = false },
  deltaMs = 0,
) {
  const fromX = finite(position?.x);
  const fromZ = finite(position?.z);
  const targetX = finite(target?.x);
  const targetZ = finite(target?.z);
  const deltaX = targetX - fromX;
  const deltaZ = targetZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  const laneX = finite(lane?.x);
  const laneZ = finite(lane?.z);
  const laneLength = Math.hypot(laneX, laneZ);

  if (reposition && laneLength > Number.EPSILON) {
    return {
      vector: { x: laneX / laneLength, z: laneZ / laneLength },
      distance,
      repositioning: true,
      elapsedMs: Math.max(0, finite(deltaMs)),
    };
  }

  if (distance <= Math.max(0, finite(arrivalDistance))) {
    return {
      vector: { x: 0, z: 0 },
      distance,
      repositioning: false,
      elapsedMs: Math.max(0, finite(deltaMs)),
    };
  }

  return {
    vector: { x: deltaX / distance, z: deltaZ / distance },
    distance,
    repositioning: false,
    elapsedMs: Math.max(0, finite(deltaMs)),
  };
}

/** @typedef {{ laneId: string, staging: { x: number, z: number }, attackTargetId: string, repathLeftMs: number, repositionLeftMs: number, lastAction: string, stationaryMs: number, repositionReady: boolean, repathAction?: string }} EngagementRecord */

/** @param {string | number | null} [targetId] @returns {MovementWatchdogState} */
export function createMovementWatchdogState(targetId = null) {
  return {
    targetId,
    lastDistance: null,
    stalledMs: 0,
  };
}

/**
 * @param {{
 *   position?: { x?: number, z?: number },
 *   target?: { id?: string | number | null, x?: number, z?: number },
 *   routeBias?: number,
 *   arrivalDistance?: number,
 *   watchdog?: MovementWatchdogState,
 * }} options
 * @param {number} [deltaMs]
 */
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
