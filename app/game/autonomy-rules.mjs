export const AGENT_ROLES = Object.freeze({
  assault: Object.freeze({
    priority: "assault",
    improviseAt: Object.freeze({ enemyDensity: 6 }),
  }),
  support: Object.freeze({
    priority: "support",
    improviseAt: Object.freeze({ playerHealthRatio: 0.45 }),
  }),
  defend: Object.freeze({
    priority: "defend",
    improviseAt: Object.freeze({ wavePressure: 0.75 }),
  }),
});

const DEFAULT_MAX_SUB_AGENTS = 4;
export const SUB_AGENT_GLOBAL_CAP = 16;
export const SUB_AGENT_SPAWN_COOLDOWN_MS = 2_800;
const MAX_SUB_AGENT_LIFETIME_TIER = 2;
const SUB_AGENT_LIFETIME_MS = Object.freeze([10_000, 15_000, 20_000]);
const SUB_AGENT_ACTION_COOLDOWN_MS = 1_400;
export const SUB_AGENT_MATERIAL_COST = Object.freeze({
  components: 1,
  shards: 1,
});
export const PLAYER_RESERVE_BATCH_SIZE = 3;

export function createSubAgentSpawnState() {
  return { cooldownLeftMs: 0 };
}

export function tickSubAgentSpawnState(state = createSubAgentSpawnState(), elapsedMs = 0) {
  return {
    ...state,
    cooldownLeftMs: Math.max(
      0,
      (Number.isFinite(state?.cooldownLeftMs) ? state.cooldownLeftMs : 0) -
        Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0),
    ),
  };
}

export function getSubAgentSpawnDecision({
  pressure = 0,
  activeChildren = 0,
  totalActive = 0,
  materials,
  cooldownLeftMs = 0,
  maxPerParent = DEFAULT_MAX_SUB_AGENTS,
  globalCap = SUB_AGENT_GLOBAL_CAP,
} = {}) {
  if (!(Number.isFinite(pressure) && pressure >= 0.6)) {
    return { allowed: false, reason: "low-pressure" };
  }
  if (Number.isFinite(cooldownLeftMs) && cooldownLeftMs > 0) {
    return { allowed: false, reason: "cooldown" };
  }
  if (
    validNonNegativeInteger(activeChildren, 0) >=
    Math.min(DEFAULT_MAX_SUB_AGENTS, validNonNegativeInteger(maxPerParent, DEFAULT_MAX_SUB_AGENTS))
  ) {
    return { allowed: false, reason: "parent-cap" };
  }
  if (
    validNonNegativeInteger(totalActive, 0) >=
    Math.min(SUB_AGENT_GLOBAL_CAP, validNonNegativeInteger(globalCap, SUB_AGENT_GLOBAL_CAP))
  ) {
    return { allowed: false, reason: "global-cap" };
  }
  if (!canSpendTemporarySubAgent(materials)) {
    return { allowed: false, reason: "materials" };
  }
  return { allowed: true, reason: "ready" };
}

function getRole(agent) {
  return AGENT_ROLES[agent.role] ? agent.role : "defend";
}

function activeSubAgentCount(agent, context) {
  if (Array.isArray(context.subAgents)) {
    return context.subAgents.filter(
      (subAgent) => subAgent.parentId === agent.id,
    ).length;
  }
  return validNonNegativeInteger(context.activeSubAgents, 0);
}

function validNonNegativeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function getLifetimeUpgradeRank(agent, upgrades) {
  const agentUpgrades = upgrades?.[agent?.id];
  const candidates = [
    upgrades?.subAgentLifetime,
    upgrades?.subAgentLifetimeRank,
    upgrades?.subAgents?.lifetime,
    upgrades?.componentUpgradeRanks?.[`${agent?.id}:sub-agent-lifetime`],
    agentUpgrades?.subAgentLifetime,
    agentUpgrades?.subAgentLifetimeRank,
  ];
  const rank = candidates.find((value) => Number.isFinite(value));
  return Math.min(
    MAX_SUB_AGENT_LIFETIME_TIER,
    Math.max(0, Math.floor(rank ?? 0)),
  );
}

export function getSubAgentLifetime(agent, upgrades = {}) {
  return SUB_AGENT_LIFETIME_MS[getLifetimeUpgradeRank(agent, upgrades)];
}

export function canSpendTemporarySubAgent(materials) {
  return Boolean(
    materials &&
    Number.isFinite(materials.components) &&
    Number.isFinite(materials.shards) &&
    materials.components >= SUB_AGENT_MATERIAL_COST.components &&
    materials.shards >= SUB_AGENT_MATERIAL_COST.shards
  );
}

function spendSubAgentMaterials(materials) {
  materials.components -= SUB_AGENT_MATERIAL_COST.components;
  materials.shards -= SUB_AGENT_MATERIAL_COST.shards;
}

function nextSubAgentId(parentId, subAgents, active) {
  const prefix = `subagent-${parentId}-`;
  const highestSequence = subAgents.reduce((highest, subAgent) => {
    if (!subAgent.id?.startsWith(prefix)) return highest;
    const sequence = Number(subAgent.id.slice(prefix.length));
    return Number.isSafeInteger(sequence) && sequence > highest
      ? sequence
      : highest;
  }, active);
  return `${prefix}${highestSequence + 1}`;
}

export function shouldImprovise(agent, context = {}) {
  const role = getRole(agent);
  const threshold = AGENT_ROLES[role].improviseAt;

  if (threshold.enemyDensity !== undefined) {
    return (context.enemyDensity ?? 0) >= threshold.enemyDensity;
  }
  if (threshold.playerHealthRatio !== undefined) {
    return Math.min(
      context.playerHealthRatio ?? context.healthRatio ?? 1,
      context.coreHealthRatio ?? 1,
    ) <= threshold.playerHealthRatio;
  }
  return (context.wavePressure ?? 0) >= threshold.wavePressure;
}

export function decideAgentIntent(agent, context = {}) {
  return shouldImprovise(agent, context)
    ? "improvise"
    : AGENT_ROLES[getRole(agent)].priority;
}

export function spawnTemporarySubAgent(agent, context = {}) {
  const requestedMaximum = validNonNegativeInteger(
    context.maxSubAgents,
    DEFAULT_MAX_SUB_AGENTS,
  );
  const maximum = Math.min(DEFAULT_MAX_SUB_AGENTS, requestedMaximum);
  const active = activeSubAgentCount(agent, context);
  if (
    agent.canSpawn === false ||
    agent.parentId ||
    !shouldImprovise(agent, context) ||
    active >= maximum ||
    !canSpendTemporarySubAgent(context.materials)
  ) {
    return null;
  }

  const subAgent = {
    id: nextSubAgentId(agent.id, context.subAgents ?? [], active),
    parentId: agent.id,
    role: getRole(agent),
    remainingMs: getSubAgentLifetime(agent, context.upgrades),
    canSpawn: false,
  };
  spendSubAgentMaterials(context.materials);
  return subAgent;
}

export function tickSubAgents(subAgents, elapsedMs) {
  const elapsed = Math.max(0, elapsedMs);
  return subAgents.reduce((active, subAgent) => {
    const remainingMs = subAgent.remainingMs - elapsed;
    if (remainingMs > 0) active.push({ ...subAgent, remainingMs });
    return active;
  }, []);
}

export function tickTemporarySubAgent(state, context = {}, elapsedMs = 0) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const remainingMs = Math.max(0, state.remainingMs - elapsed);
  const maxLifetimeMs =
    Number.isFinite(state.maxLifetimeMs) && state.maxLifetimeMs > 0
      ? state.maxLifetimeMs
      : Math.max(1, state.remainingMs);
  const cooldownLeftMs = Math.max(
    0,
    (Number.isFinite(state.cooldownLeftMs) ? state.cooldownLeftMs : 0) -
      elapsed,
  );
  const nextState = {
    ...state,
    remainingMs,
    maxLifetimeMs,
    cooldownLeftMs,
    healthRatio: Math.min(1, remainingMs / maxLifetimeMs),
    lifetimeRatio: Math.min(1, remainingMs / maxLifetimeMs),
  };

  if (remainingMs <= 0) {
    return { state: nextState, action: { type: "idle" }, expired: true };
  }
  if (cooldownLeftMs > 0) {
    return { state: nextState, action: { type: "idle" }, expired: false };
  }

  let action = { type: "idle" };
  if (getRole(state) === "assault" && context.attackTargetInRange) {
    action = { type: "attack", damage: 8 };
  } else if (
    getRole(state) === "support" &&
    context.playerNeedsRepair
  ) {
    action = {
      type: "repair",
      playerHealing: 2,
      allyCooldownReductionMs: 250,
    };
  } else if (getRole(state) === "defend" && context.coreThreatInRange) {
    action = { type: "guard", damage: 6, slowMs: 350 };
  }

  if (action.type !== "idle") {
    nextState.cooldownLeftMs = SUB_AGENT_ACTION_COOLDOWN_MS;
  }
  return { state: nextState, action, expired: false };
}

export function clearSubAgents() {
  return [];
}
