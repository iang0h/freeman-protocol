const WATCH_DIRECTOR_STATES = Object.freeze([
  "engage",
  "collect",
  "repair",
  "patrol",
  "unstick",
]);

const DEFAULT_ZONES = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 0, z: -4.75 }),
  Object.freeze({ x: 3.1, z: 1.15 }),
  Object.freeze({ x: -3.1, z: 1.15 }),
  Object.freeze({ x: 0, z: 4.75 }),
  Object.freeze({ x: 0, z: -6.45 }),
]);

const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const clamp01 = (value) => Math.min(1, Math.max(0, finite(value, 1)));

const distance = (left, right) =>
  Math.hypot(finite(left?.x) - finite(right?.x), finite(left?.z) - finite(right?.z));

const normalizePoint = (point, fallback = { x: 0, z: 0 }) => ({
  x: finite(point?.x, fallback.x),
  z: finite(point?.z, fallback.z),
});

const normalizeZones = (zones) => {
  const normalized = Array.isArray(zones)
    ? zones
        .map((zone) => normalizePoint(zone))
        .filter((zone) => Number.isFinite(zone.x) && Number.isFinite(zone.z))
    : [];
  return normalized.length > 0 ? normalized : DEFAULT_ZONES.map(normalizePoint);
};

export function createWatchDirectorState() {
  return {
    mode: "patrol",
    targetIndex: 0,
    idleMs: 0,
    lastX: 0,
    lastZ: 0,
  };
}

export function getWatchDirectorIntent(input = {}, state = createWatchDirectorState()) {
  const operator = normalizePoint(input.operator);
  const core = normalizePoint(input.core);
  const zones = normalizeZones(input.zones);
  const priority = input.priority === "survive" || input.priority === "farm" || input.priority === "expand"
    ? input.priority
    : "survive";
  const threat = input.threat && typeof input.threat === "object"
    ? {
        ...input.threat,
        x: finite(input.threat.x),
        z: finite(input.threat.z),
        distance: finite(input.threat.distance, distance(operator, input.threat)),
      }
    : null;
  const pickup = input.pickup && typeof input.pickup === "object"
    ? {
        ...input.pickup,
        x: finite(input.pickup.x),
        z: finite(input.pickup.z),
        useful: input.pickup.useful !== false,
      }
    : null;
  const hpRatio = clamp01(input.operator?.hpRatio);
  const coreRatio = clamp01(input.core?.hpRatio);
  const currentIndex = Math.abs(Math.floor(finite(state.targetIndex))) % zones.length;
  const nextIndex = (currentIndex + 1) % zones.length;

  if (finite(state.idleMs) >= 2_000) {
    return {
      state: "unstick",
      target: zones[nextIndex],
      reason: "WATCH DIRECTOR RESET ROUTE",
      reset: true,
    };
  }

  if (hpRatio <= 0.45 || coreRatio <= 0.55) {
    return {
      state: "repair",
      target: core,
      reason: hpRatio <= 0.45 ? "OPERATOR RETURNING TO REPAIR" : "CORE NEEDS SUPPORT",
      reset: false,
    };
  }

  if (threat && threat.distance <= 8) {
    return {
      state: "engage",
      target: { x: threat.x, z: threat.z },
      reason: "WATCH DIRECTOR ENGAGING THREAT",
      reset: false,
    };
  }

  if (
    pickup?.useful &&
    distance(operator, pickup) <= 12 &&
    (priority === "farm" || priority === "expand" || !threat)
  ) {
    return {
      state: "collect",
      target: { x: pickup.x, z: pickup.z },
      reason: "WATCH DIRECTOR COLLECTING MATERIALS",
      reset: false,
    };
  }

  if (threat) {
    return {
      state: "engage",
      target: { x: threat.x, z: threat.z },
      reason: "WATCH DIRECTOR CLOSING ON THREAT",
      reset: false,
    };
  }

  return {
    state: "patrol",
    target: zones[currentIndex],
    reason: "WATCH DIRECTOR PATROLLING THE NETWORK",
    reset: false,
  };
}

export function tickWatchDirector(
  state = createWatchDirectorState(),
  input = {},
  deltaMs = 0,
) {
  const operator = normalizePoint(input.operator);
  const moved = Math.hypot(operator.x - finite(state.lastX), operator.z - finite(state.lastZ));
  const idleMs = moved >= 0.02
    ? 0
    : Math.max(0, finite(state.idleMs) + Math.max(0, finite(deltaMs)));
  const nextState = {
    ...createWatchDirectorState(),
    ...state,
    idleMs,
    lastX: operator.x,
    lastZ: operator.z,
  };
  const intent = getWatchDirectorIntent(input, nextState);
  const zones = normalizeZones(input.zones);
  const targetIndex = zones.findIndex(
    (zone) => zone.x === intent.target.x && zone.z === intent.target.z,
  );
  nextState.mode = intent.state;
  nextState.targetIndex = targetIndex >= 0
    ? targetIndex
    : intent.reset
      ? (nextState.targetIndex + 1) % zones.length
      : nextState.targetIndex;
  if (intent.reset) nextState.idleMs = 0;
  return { state: nextState, intent };
}

export { WATCH_DIRECTOR_STATES };
