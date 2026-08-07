import { TEMPORARY_UNIT_GLOBAL_CAP } from "./autonomy-rules.mjs";
import { repairBattlefieldNode } from "./battlefield-rules.mjs";

export const WAR_LAYER_GLOBAL_CAP = TEMPORARY_UNIT_GLOBAL_CAP;
export const WAR_SQUAD_PARENT_CAP = 4;
export const WAR_SQUAD_COMPONENT_COST = 1;
export const WAR_SQUAD_ACTION_COOLDOWN_MS = 1_500;
export const WAR_SUPPORT_COMPONENT_COST = 2;
export const WAR_SUPPORT_COOLDOWN_MS = 6_000;

const SQUAD_LIFETIME_MS = Object.freeze({
  screen: 10_000,
  repair: 15_000,
  raider: 20_000,
});
const SQUAD_DAMAGE = Object.freeze({ screen: 6, repair: 4, raider: 9 });
const SQUAD_SPEED_PER_SECOND = 3.2;
const SQUAD_ATTACK_RANGE = 1.5;
const SQUAD_HEALTH = 30;
const SQUAD_HIT_FLASH_MS = 180;
const SUPPORT_EVENT_LIFETIME_MS = 4_000;
const SUPPORT_TELEGRAPH_MS = 1_000;
const SUPPORT_ACTION_MS = 1_500;
const SUPPORT_EGRESS_MS = 3_000;

function finiteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedCap(value, fallback, maximum) {
  return Math.min(maximum, Math.max(0, Math.floor(finiteNonNegative(value, fallback))));
}

function squadRole(value) {
  return Object.hasOwn(SQUAD_LIFETIME_MS, value) ? value : "screen";
}

function squadId(state) {
  return `war-squad-${state.nextSquadId}`;
}

function nearestTarget(squad, records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && typeof record.id === "string")
    .filter((record) => Number.isFinite(record.x) && Number.isFinite(record.z))
    .filter((record) => record.repairable === true || !Number.isFinite(record.hp) || record.hp > 0)
    .map((record) => ({
      record,
      distance: Math.hypot(record.x - squad.x, record.z - squad.z),
    }))
    .sort((left, right) =>
      left.distance - right.distance || left.record.id.localeCompare(right.record.id),
    )[0] ?? null;
}

function cloneTargets(records) {
  return (Array.isArray(records) ? records : []).map((record) => ({ ...record }));
}

function cloneBattlefieldState(state) {
  return state && Array.isArray(state.nodes)
    ? { ...state, nodes: state.nodes.map((node) => ({ ...node })) }
    : null;
}

function battlefieldTargets(state) {
  return state?.nodes
    ?.filter((node) => node.id !== "core")
    .map((node) => ({
      ...node,
      hp: node.health,
      maxHp: node.maxHealth,
      online: node.status === "online",
      repairable: true,
    })) ?? [];
}

function supportPhase(elapsedMs) {
  if (elapsedMs < SUPPORT_TELEGRAPH_MS) return "telegraph";
  if (elapsedMs < SUPPORT_EGRESS_MS) return "acting";
  return "egress";
}

function tickSupportEvent(event, elapsed) {
  if (!event) return { event: null, actions: [] };
  const previousElapsedMs = finiteNonNegative(event.elapsedMs);
  const elapsedMs = Math.min(
    SUPPORT_EVENT_LIFETIME_MS,
    previousElapsedMs + elapsed,
  );
  const progress = elapsedMs / SUPPORT_EVENT_LIFETIME_MS;
  const originX = Number.isFinite(event.originX) ? event.originX : 0;
  const originZ = Number.isFinite(event.originZ) ? event.originZ : 0;
  const targetX = Number.isFinite(event.targetX) ? event.targetX : originX;
  const targetZ = Number.isFinite(event.targetZ) ? event.targetZ : originZ;
  const x = event.type === "air-strike"
    ? targetX - 4 + progress * 8
    : originX + (targetX - originX) * progress;
  const z = event.type === "air-strike"
    ? targetZ
    : originZ + (targetZ - originZ) * progress;
  const shouldAct =
    !event.actionApplied &&
    previousElapsedMs < SUPPORT_ACTION_MS &&
    elapsedMs >= SUPPORT_ACTION_MS;
  const actions = shouldAct
    ? event.targetIds.map((targetId) => ({
        type: "damage",
        targetId,
        amount: event.type === "air-strike" ? 12 : 8,
      }))
    : [];
  const next = {
    ...event,
    elapsedMs,
    remainingMs: Math.max(0, SUPPORT_EVENT_LIFETIME_MS - elapsedMs),
    progress,
    phase: supportPhase(elapsedMs),
    status: supportPhase(elapsedMs),
    x,
    z,
    actionApplied: event.actionApplied || shouldAct,
  };
  return {
    event: next.remainingMs > 0 ? next : null,
    actions,
  };
}

export function createWarLayerState(options = {}) {
  return {
    globalCap: boundedCap(options.globalCap, WAR_LAYER_GLOBAL_CAP, WAR_LAYER_GLOBAL_CAP),
    parentCap: boundedCap(options.parentCap, WAR_SQUAD_PARENT_CAP, WAR_SQUAD_PARENT_CAP),
    components: finiteNonNegative(options.components),
    squads: [],
    enemies: [],
    nodes: [],
    battlefieldState: null,
    materials: { components: finiteNonNegative(options.components) },
    supportEvent: null,
    supportActions: [],
    supportCooldownMs: 0,
    nextSquadId: 1,
    nextSupportId: 1,
  };
}

export function spawnWarSquad(state = createWarLayerState(), request = {}) {
  const squads = Array.isArray(state.squads) ? state.squads : [];
  const parentId = typeof request.parentId === "string" ? request.parentId : "";
  const components = finiteNonNegative(request.components, state.components);
  const externalParentChildren = Math.floor(finiteNonNegative(request.externalParentChildren));
  const externalTemporaryUnits = Math.floor(finiteNonNegative(request.externalTemporaryUnits));
  const parentCount =
    squads.filter((squad) => squad.parentId === parentId).length +
    externalParentChildren;
  if (!parentId) return { accepted: false, reason: "parent", state };
  if (components < WAR_SQUAD_COMPONENT_COST) return { accepted: false, reason: "components", state };
  if (parentCount >= boundedCap(state.parentCap, WAR_SQUAD_PARENT_CAP, WAR_SQUAD_PARENT_CAP)) {
    return { accepted: false, reason: "parent-cap", state };
  }
  if (
    squads.length + externalTemporaryUnits >=
    boundedCap(state.globalCap, WAR_LAYER_GLOBAL_CAP, WAR_LAYER_GLOBAL_CAP)
  ) {
    return { accepted: false, reason: "global-cap", state };
  }
  const role = squadRole(request.role);
  const squad = {
    id: squadId(state),
    parentId,
    role,
    x: Number.isFinite(request.x) ? request.x : 0,
    z: Number.isFinite(request.z) ? request.z : 0,
    targetId: null,
    remainingMs: SQUAD_LIFETIME_MS[role],
    health: SQUAD_HEALTH,
    hitFlashMs: 0,
    cooldownMs: 0,
    status: "active",
  };
  return {
    accepted: true,
    reason: "ready",
    squad,
    state: {
      ...state,
      components: components - WAR_SQUAD_COMPONENT_COST,
      materials: { ...state.materials, components: components - WAR_SQUAD_COMPONENT_COST },
      squads: [...squads, squad],
      nextSquadId: finiteNonNegative(state.nextSquadId, 1) + 1,
    },
  };
}

export function damageWarSquad(state = createWarLayerState(), id, amount = 0) {
  const damage = finiteNonNegative(amount);
  const squads = (Array.isArray(state.squads) ? state.squads : [])
    .map((squad) => squad.id === id
      ? {
          ...squad,
          health: Math.max(0, finiteNonNegative(squad.health) - damage),
          hitFlashMs: damage > 0 ? SQUAD_HIT_FLASH_MS : finiteNonNegative(squad.hitFlashMs),
        }
      : squad)
    .filter((squad) => squad.health > 0 && squad.remainingMs > 0);
  return { ...state, squads };
}

export function tickWarSquads(state = createWarLayerState(), context = {}, elapsedMs = 0) {
  const elapsed = finiteNonNegative(elapsedMs);
  const enemies = cloneTargets(context.enemies);
  const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  let battlefieldState = cloneBattlefieldState(
    context.battlefieldState ?? state.battlefieldState,
  );
  let nodes = battlefieldState
    ? battlefieldTargets(battlefieldState)
    : cloneTargets(context.nodes);
  let materials = {
    ...(state.materials ?? {}),
    ...(context.materials ?? {}),
    components: finiteNonNegative(
      context.materials?.components,
      finiteNonNegative(state.components),
    ),
  };
  const repairMultiplier = finiteNonNegative(context.repairMultiplier, 1);
  const nextSquads = [];

  for (const existing of Array.isArray(state.squads) ? state.squads : []) {
    const remainingMs = Math.max(0, finiteNonNegative(existing.remainingMs) - elapsed);
    if (remainingMs === 0 || finiteNonNegative(existing.health) === 0) continue;
    const targets = existing.role === "repair"
      ? nodes.filter((node) => node.online === false || (node.hp ?? 1) < (node.maxHp ?? 1))
      : enemies;
    const target = nearestTarget(existing, targets);
    const cooldownMs = Math.max(0, finiteNonNegative(existing.cooldownMs) - elapsed);
    const squad = {
      ...existing,
      remainingMs,
      hitFlashMs: Math.max(0, finiteNonNegative(existing.hitFlashMs) - elapsed),
      cooldownMs,
      targetId: target?.record.id ?? null,
      status: target ? "engaging" : "patrolling",
    };
    if (target) {
      const dx = target.record.x - squad.x;
      const dz = target.record.z - squad.z;
      const distance = Math.hypot(dx, dz);
      const travel = Math.min(distance, SQUAD_SPEED_PER_SECOND * elapsed / 1_000);
      if (distance > SQUAD_ATTACK_RANGE && distance > 0) {
        squad.x += dx / distance * travel;
        squad.z += dz / distance * travel;
      } else if (cooldownMs === 0) {
        squad.cooldownMs = WAR_SQUAD_ACTION_COOLDOWN_MS;
        if (squad.role === "repair" && battlefieldState) {
          const repaired = repairBattlefieldNode(
            battlefieldState,
            target.record.id,
            SQUAD_DAMAGE.repair * (1 + repairMultiplier),
            materials,
          );
          battlefieldState = repaired.state;
          materials = repaired.materials;
          nodes = battlefieldTargets(battlefieldState);
        } else if (squad.role !== "repair") {
          const enemy = enemyById.get(target.record.id);
          if (enemy) enemy.hp = Math.max(0, finiteNonNegative(enemy.hp) - SQUAD_DAMAGE[squad.role]);
        }
      }
    }
    nextSquads.push(squad);
  }

  const supportCooldownMs = Math.max(0, finiteNonNegative(state.supportCooldownMs) - elapsed);
  const support = tickSupportEvent(state.supportEvent, elapsed);
  return {
    ...state,
    components: materials.components,
    materials,
    battlefieldState,
    squads: nextSquads,
    enemies,
    nodes,
    supportCooldownMs,
    supportEvent: support.event,
    supportActions: support.actions,
  };
}

export function requestSupportEvent(state = createWarLayerState(), request = {}) {
  const components = finiteNonNegative(request.components, state.components);
  const type = request.type === "air-strike" ? "air-strike" : request.type === "convoy" ? "convoy" : null;
  if (!type) return { accepted: false, reason: "type", state };
  if (state.supportEvent) return { accepted: false, reason: "active-event", state };
  if (finiteNonNegative(state.supportCooldownMs) > 0) return { accepted: false, reason: "cooldown", state };
  if (components < WAR_SUPPORT_COMPONENT_COST) return { accepted: false, reason: "components", state };
  const originX = Number.isFinite(request.origin?.x) ? request.origin.x : 3.2;
  const originZ = Number.isFinite(request.origin?.z) ? request.origin.z : -2.4;
  const targetX = Number.isFinite(request.target?.x) ? request.target.x : originX;
  const targetZ = Number.isFinite(request.target?.z) ? request.target.z : originZ;
  const event = {
    id: `support-${finiteNonNegative(state.nextSupportId, 1)}`,
    type,
    remainingMs: SUPPORT_EVENT_LIFETIME_MS,
    elapsedMs: 0,
    phase: "telegraph",
    status: "telegraph",
    progress: 0,
    originX,
    originZ,
    targetX,
    targetZ,
    targetIds: (Array.isArray(request.targetIds) ? request.targetIds : [])
      .filter((targetId) => typeof targetId === "string")
      .slice(0, type === "air-strike" ? 3 : 1),
    x: originX,
    z: originZ,
    actionApplied: false,
  };
  return {
    accepted: true,
    reason: "ready",
    event,
    state: {
      ...state,
      components: components - WAR_SUPPORT_COMPONENT_COST,
      materials: { ...state.materials, components: components - WAR_SUPPORT_COMPONENT_COST },
      supportEvent: event,
      supportActions: [],
      supportCooldownMs: WAR_SUPPORT_COOLDOWN_MS,
      nextSupportId: finiteNonNegative(state.nextSupportId, 1) + 1,
    },
  };
}
