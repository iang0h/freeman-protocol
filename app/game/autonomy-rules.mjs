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

const DEFAULT_MAX_SUB_AGENTS = 3;
const DEFAULT_SUB_AGENT_LIFETIME_MS = 5_000;

function getRole(agent) {
  return AGENT_ROLES[agent.role] ? agent.role : "defend";
}

function activeSubAgentCount(context) {
  return Array.isArray(context.subAgents)
    ? context.subAgents.length
    : (context.activeSubAgents ?? 0);
}

function validNonNegativeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function validLifetime(value) {
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SUB_AGENT_LIFETIME_MS;
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
  const maximum = validNonNegativeInteger(
    context.maxSubAgents,
    DEFAULT_MAX_SUB_AGENTS,
  );
  const active = activeSubAgentCount(context);
  if (
    agent.canSpawn === false ||
    !shouldImprovise(agent, context) ||
    active >= maximum
  ) {
    return null;
  }

  return {
    id: nextSubAgentId(agent.id, context.subAgents ?? [], active),
    parentId: agent.id,
    role: getRole(agent),
    remainingMs: validLifetime(context.subAgentLifetimeMs),
    canSpawn: false,
  };
}

export function tickSubAgents(subAgents, elapsedMs) {
  const elapsed = Math.max(0, elapsedMs);
  return subAgents.reduce((active, subAgent) => {
    const remainingMs = subAgent.remainingMs - elapsed;
    if (remainingMs > 0) active.push({ ...subAgent, remainingMs });
    return active;
  }, []);
}

export function clearSubAgents() {
  return [];
}
