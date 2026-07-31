export const OVERLAYS = Object.freeze(["closed", "intel", "warband", "actions"]);

const ARENA_ZONES = Object.freeze({
  core: Object.freeze({
    id: "core",
    label: "CORE CHAMBER",
    shortLabel: "CORE",
    kind: "core",
  }),
  "north-breach": Object.freeze({
    id: "north-breach",
    label: "NORTH BREACH",
    shortLabel: "NORTH",
    kind: "breach",
  }),
  "south-breach": Object.freeze({
    id: "south-breach",
    label: "SOUTH BREACH",
    shortLabel: "SOUTH",
    kind: "breach",
  }),
  compute: Object.freeze({
    id: "compute",
    label: "COMPUTE NODE",
    shortLabel: "COMPUTE",
    kind: "resource",
  }),
  repair: Object.freeze({
    id: "repair",
    label: "REPAIR BAY",
    shortLabel: "REPAIR",
    kind: "recovery",
  }),
  "boss-portal": Object.freeze({
    id: "boss-portal",
    label: "BOSS PORTAL",
    shortLabel: "PORTAL",
    kind: "danger",
  }),
});

const CORE_RADIUS = 1.75;
const REPAIR_BAY = Object.freeze({ x: -3.1, z: 1.15, radius: 1.25 });
const COMPUTE_NODE = Object.freeze({ x: 3.1, z: 1.15, radius: 1.25 });
const BOSS_PORTAL_Z = -6;
const NORTH_BREACH_Z = -4;
const SOUTH_BREACH_Z = 4;

function distanceTo(position, landmark) {
  return Math.hypot(position.x - landmark.x, position.z - landmark.z);
}

function damageLabel(damage) {
  return String(Math.max(0, Math.round(Number.isFinite(damage) ? damage : 0)));
}

export function createOverlayState() {
  return { active: "closed" };
}

export function toggleOverlay(state, next) {
  return { active: state.active === next ? "closed" : next };
}

export function getArenaZone(position) {
  const point = {
    x: Number.isFinite(position?.x) ? position.x : 0,
    z: Number.isFinite(position?.z) ? position.z : 0,
  };

  if (distanceTo(point, REPAIR_BAY) <= REPAIR_BAY.radius) return { ...ARENA_ZONES.repair };
  if (distanceTo(point, COMPUTE_NODE) <= COMPUTE_NODE.radius) return { ...ARENA_ZONES.compute };
  if (Math.hypot(point.x, point.z) <= CORE_RADIUS) return { ...ARENA_ZONES.core };
  if (point.z <= BOSS_PORTAL_Z) return { ...ARENA_ZONES["boss-portal"] };
  if (point.z <= NORTH_BREACH_Z) return { ...ARENA_ZONES["north-breach"] };
  if (point.z >= SOUTH_BREACH_Z) return { ...ARENA_ZONES["south-breach"] };
  return { ...ARENA_ZONES.core };
}

export function classifyCombatFeedback(event = {}) {
  const label = damageLabel(event.damage);
  if (event.kind === "core-warning" || event.target === "core") {
    return { kind: "core-warning", emphasis: "urgent", label: `CORE HIT ${label}` };
  }
  if (event.kind === "kill" || event.killed) {
    return { kind: "kill", emphasis: "strong", label: `KILL ${label}` };
  }
  if (event.kind === "critical" || event.critical) {
    return { kind: "critical", emphasis: "strong", label: `CRITICAL ${label}` };
  }
  return { kind: "hit", emphasis: "standard", label };
}
