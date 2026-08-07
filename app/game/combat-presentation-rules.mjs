export const OVERLAYS = Object.freeze(["closed", "intel", "warband", "actions"]);

import { getQualitySettings } from "./quality-rules.mjs";
import { BATTLEFIELD_NODES } from "./battlefield-rules.mjs";

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

const OPEN_FLOOR_ZONES = Object.freeze({
  repair: Object.freeze({
    id: "repair",
    label: "WEST APPROACH",
    shortLabel: "WEST",
    kind: "open-floor",
  }),
  compute: Object.freeze({
    id: "compute",
    label: "EAST APPROACH",
    shortLabel: "EAST",
    kind: "open-floor",
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
  return Object.freeze({ active: "closed" });
}

export function toggleOverlay(state, next) {
  const active = OVERLAYS.includes(next) ? next : "closed";
  return Object.freeze({ active: state?.active === active ? "closed" : active });
}

export function getArenaZone(position) {
  const point = {
    x: Number.isFinite(position?.x) ? position.x : 0,
    z: Number.isFinite(position?.z) ? position.z : 0,
  };

  if (distanceTo(point, REPAIR_BAY) <= REPAIR_BAY.radius) return Object.freeze({ ...ARENA_ZONES.repair });
  if (distanceTo(point, COMPUTE_NODE) <= COMPUTE_NODE.radius) return Object.freeze({ ...ARENA_ZONES.compute });
  if (Math.hypot(point.x, point.z) <= CORE_RADIUS) return Object.freeze({ ...ARENA_ZONES.core });
  if (point.z <= BOSS_PORTAL_Z) return Object.freeze({ ...ARENA_ZONES["boss-portal"] });
  if (point.z <= NORTH_BREACH_Z) return Object.freeze({ ...ARENA_ZONES["north-breach"] });
  if (point.z >= SOUTH_BREACH_Z) return Object.freeze({ ...ARENA_ZONES["south-breach"] });
  return Object.freeze({
    ...(point.x < 0 ? OPEN_FLOOR_ZONES.repair : OPEN_FLOOR_ZONES.compute),
  });
}

export function classifyCombatFeedback(event = {}) {
  const label = damageLabel(event.damage);
  if (event.kind === "core-warning" || event.target === "core") {
    return Object.freeze({ kind: "core-warning", emphasis: "urgent", label: `CORE HIT ${label}` });
  }
  if (event.kind === "kill" || event.killed) {
    return Object.freeze({ kind: "kill", emphasis: "strong", label: `KILL ${label}` });
  }
  if (event.kind === "critical" || event.critical) {
    return Object.freeze({ kind: "critical", emphasis: "strong", label: `CRITICAL ${label}` });
  }
  return Object.freeze({ kind: "hit", emphasis: "standard", label });
}

const BATTLEFIELD_MARKER_LABELS = Object.freeze({
  core: "CORE",
  "command-uplink": "UPLINK",
  "repair-bay": "REPAIR",
  "assembly-pad": "ASSEMBLY",
  "compute-relay": "COMPUTE",
});

const COMMAND_MAP_FIXED_MARKERS = Object.freeze([
  ...BATTLEFIELD_NODES.map((node) => Object.freeze({
    id: node.id,
    kind: node.kind,
    label: BATTLEFIELD_MARKER_LABELS[node.id] ?? node.id.toUpperCase(),
    x: node.x,
    z: node.z,
    status: node.id === "core" ? "protected" : "online",
    priority: node.id === "core" ? 4 : 3,
  })),
  Object.freeze({ id: "north-breach", kind: "breach", label: "NORTH BREACH", x: 0, z: -4, status: "active", priority: 2 }),
  Object.freeze({ id: "south-breach", kind: "breach", label: "SOUTH BREACH", x: 0, z: 4, status: "active", priority: 2 }),
  Object.freeze({ id: "boss-portal", kind: "portal", label: "PORTAL", x: 0, z: -6.45, status: "dormant", priority: 1 }),
]);

const markerForEntity = (entity, index, kind, label, priority) =>
  Object.freeze({
    id: `${kind}-${entity.id ?? index}`,
    kind,
    label,
    x: Number(entity.x) || 0,
    z: Number(entity.z) || 0,
    status: entity.state ?? "active",
    priority,
  });

/**
 * @param {any} snapshot
 * @param {{ nodes?: any[] } | null} battlefieldState
 */
export function getCommandMapMarkers(snapshot = {}, battlefieldState = null) {
  const nodes = Array.isArray(battlefieldState?.nodes) ? battlefieldState.nodes : [];
  const markers = COMMAND_MAP_FIXED_MARKERS.map((marker) => {
    const node = nodes.find((candidate) => candidate?.id === marker.id);
    if (!node) return marker;
    const maxHealth = Math.max(1, Number(node.maxHealth) || 1);
    const health = Math.min(maxHealth, Math.max(0, Number(node.health) || 0));
    return Object.freeze({
      ...marker,
      status: `${String(node.status ?? "online").toUpperCase()} ${Math.round(health)}/${Math.round(maxHealth)}`,
    });
  });
  for (const [index, agent] of (snapshot.agents ?? []).entries()) {
    markers.push(markerForEntity(agent, index, "agent", String(agent.id ?? "AGENT").toUpperCase(), 3));
  }
  for (const [index, subAgent] of (snapshot.subAgents ?? []).entries()) {
    markers.push(markerForEntity(subAgent, index, "sub-agent", "SUB-AGENT", 2));
  }
  for (const [index, enemy] of (snapshot.enemies ?? []).entries()) {
    markers.push(markerForEntity(enemy, index, "threat", String(enemy.kind ?? "THREAT").toUpperCase(), 1));
  }
  for (const [index, pickup] of (snapshot.pickups ?? []).entries()) {
    markers.push(markerForEntity(pickup, index, "loot", String(pickup.type ?? "LOOT").toUpperCase(), 3));
  }
  for (const [index, sentry] of (snapshot.sentries ?? []).entries()) {
    markers.push(markerForEntity(sentry, index, "sentry", "SENTRY", 2));
  }
  if (snapshot.boss) {
    markers.push(markerForEntity(snapshot.boss, 0, "boss", "BOSS", 5));
  }
  return Object.freeze(markers);
}

export function getCombatEffectBudget(profile = "medium", reducedMotion = false) {
  const settings = getQualitySettings(profile);
  return Object.freeze({
    maxEffects: settings.maxCombatEffects,
    hitStopMs: reducedMotion ? 0 : settings.grade === "cinematic" ? 90 : 55,
    cameraPunch: reducedMotion ? 0 : settings.grade === "cinematic" ? 0.16 : 0.08,
    orbitDrift: reducedMotion ? 0 : settings.grade === "cinematic" ? 0.12 : 0.04,
  });
}

export function canSpawnCombatEffect(effectCount, budget, priority = "standard") {
  if (Number(effectCount) < Number(budget?.maxEffects)) return true;
  return ["critical", "urgent", "boss"].includes(priority);
}
