export const WAR_LAYER_GLOBAL_CAP = 24;
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
const SUPPORT_EVENT_LIFETIME_MS = 4_000;

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
    .filter((record) => !Number.isFinite(record.hp) || record.hp > 0)
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

export function createWarLayerState(options = {}) {
  return {
    globalCap: boundedCap(options.globalCap, WAR_LAYER_GLOBAL_CAP, WAR_LAYER_GLOBAL_CAP),
    parentCap: boundedCap(options.parentCap, WAR_SQUAD_PARENT_CAP, WAR_SQUAD_PARENT_CAP),
    components: finiteNonNegative(options.components),
    squads: [],
    enemies: [],
    nodes: [],
    supportEvent: null,
    supportCooldownMs: 0,
    nextSquadId: 1,
    nextSupportId: 1,
  };
}

export function spawnWarSquad(state = createWarLayerState(), request = {}) {
  const squads = Array.isArray(state.squads) ? state.squads : [];
  const parentId = typeof request.parentId === "string" ? request.parentId : "";
  const components = finiteNonNegative(request.components, state.components);
  const parentCount = squads.filter((squad) => squad.parentId === parentId).length;
  if (!parentId) return { accepted: false, reason: "parent", state };
  if (components < WAR_SQUAD_COMPONENT_COST) return { accepted: false, reason: "components", state };
  if (parentCount >= boundedCap(state.parentCap, WAR_SQUAD_PARENT_CAP, WAR_SQUAD_PARENT_CAP)) {
    return { accepted: false, reason: "parent-cap", state };
  }
  if (squads.length >= boundedCap(state.globalCap, WAR_LAYER_GLOBAL_CAP, WAR_LAYER_GLOBAL_CAP)) {
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
      squads: [...squads, squad],
      nextSquadId: finiteNonNegative(state.nextSquadId, 1) + 1,
    },
  };
}

export function damageWarSquad(state = createWarLayerState(), id, amount = 0) {
  const damage = finiteNonNegative(amount);
  const squads = (Array.isArray(state.squads) ? state.squads : [])
    .map((squad) => squad.id === id
      ? { ...squad, health: Math.max(0, finiteNonNegative(squad.health) - damage) }
      : squad)
    .filter((squad) => squad.health > 0 && squad.remainingMs > 0);
  return { ...state, squads };
}

export function tickWarSquads(state = createWarLayerState(), context = {}, elapsedMs = 0) {
  const elapsed = finiteNonNegative(elapsedMs);
  const enemies = cloneTargets(context.enemies);
  const nodes = cloneTargets(context.nodes);
  const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
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
        if (squad.role === "repair") {
          const node = nodeById.get(target.record.id);
          if (node) {
            node.hp = Math.min(node.maxHp ?? node.hp, finiteNonNegative(node.hp) + SQUAD_DAMAGE.repair);
            if (node.maxHp && node.hp >= node.maxHp) node.online = true;
          }
        } else {
          const enemy = enemyById.get(target.record.id);
          if (enemy) enemy.hp = Math.max(0, finiteNonNegative(enemy.hp) - SQUAD_DAMAGE[squad.role]);
        }
      }
    }
    nextSquads.push(squad);
  }

  const supportCooldownMs = Math.max(0, finiteNonNegative(state.supportCooldownMs) - elapsed);
  const supportEvent = state.supportEvent
    ? {
        ...state.supportEvent,
        remainingMs: Math.max(0, finiteNonNegative(state.supportEvent.remainingMs) - elapsed),
      }
    : null;
  return {
    ...state,
    squads: nextSquads,
    enemies,
    nodes,
    supportCooldownMs,
    supportEvent: supportEvent?.remainingMs ? supportEvent : null,
  };
}

export function requestSupportEvent(state = createWarLayerState(), request = {}) {
  const components = finiteNonNegative(request.components, state.components);
  const type = request.type === "air-strike" ? "air-strike" : request.type === "convoy" ? "convoy" : null;
  if (!type) return { accepted: false, reason: "type", state };
  if (state.supportEvent) return { accepted: false, reason: "active-event", state };
  if (finiteNonNegative(state.supportCooldownMs) > 0) return { accepted: false, reason: "cooldown", state };
  if (components < WAR_SUPPORT_COMPONENT_COST) return { accepted: false, reason: "components", state };
  const event = {
    id: `support-${finiteNonNegative(state.nextSupportId, 1)}`,
    type,
    remainingMs: SUPPORT_EVENT_LIFETIME_MS,
    status: "active",
  };
  return {
    accepted: true,
    reason: "ready",
    event,
    state: {
      ...state,
      components: components - WAR_SUPPORT_COMPONENT_COST,
      supportEvent: event,
      supportCooldownMs: WAR_SUPPORT_COOLDOWN_MS,
      nextSupportId: finiteNonNegative(state.nextSupportId, 1) + 1,
    },
  };
}
