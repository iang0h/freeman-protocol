const DEFAULT_MAX_HEALTH = 100;
const DEFAULT_REPAIR_COST = 2;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function statusForHealth(health, maxHealth) {
  if (health <= 0) return "offline";
  if (health >= maxHealth) return "online";
  return "damaged";
}

function runtimeNode(node) {
  const maxHealth = Math.max(1, finite(node.maxHealth, DEFAULT_MAX_HEALTH));
  return {
    ...node,
    maxHealth,
    health: maxHealth,
    status: "online",
    repairProgress: 0,
  };
}

function runtimeNodes(state) {
  return Array.isArray(state?.nodes) ? state.nodes : [];
}

function normalizedComponents(materials) {
  return Math.max(0, Math.floor(finite(materials?.components)));
}

export const BATTLEFIELD_NODES = Object.freeze([
  Object.freeze({
    id: "core",
    kind: "core",
    x: 0,
    z: 0,
    maxHealth: DEFAULT_MAX_HEALTH,
    repairCost: DEFAULT_REPAIR_COST,
  }),
  Object.freeze({
    id: "command-uplink",
    kind: "command",
    x: -4,
    z: -2.5,
    maxHealth: DEFAULT_MAX_HEALTH,
    repairCost: DEFAULT_REPAIR_COST,
  }),
  Object.freeze({
    id: "repair-bay",
    kind: "repair",
    x: -3,
    z: 2.6,
    maxHealth: DEFAULT_MAX_HEALTH,
    repairCost: DEFAULT_REPAIR_COST,
  }),
  Object.freeze({
    id: "assembly-pad",
    kind: "assembly",
    x: 3.2,
    z: -2.4,
    maxHealth: DEFAULT_MAX_HEALTH,
    repairCost: DEFAULT_REPAIR_COST,
  }),
  Object.freeze({
    id: "compute-relay",
    kind: "compute",
    x: 3.4,
    z: 2.2,
    maxHealth: DEFAULT_MAX_HEALTH,
    repairCost: DEFAULT_REPAIR_COST,
  }),
]);

export function getBattlefieldNodePosition(id) {
  const node = BATTLEFIELD_NODES.find((candidate) => candidate.id === id);
  return node ? Object.freeze({ x: node.x, z: node.z }) : null;
}

export const BATTLEFIELD_NODE_PRESENTATIONS = Object.freeze({
  core: Object.freeze({ color: 0xfff0e2, cssColor: "#fff0e2", silhouette: "diamond" }),
  command: Object.freeze({ color: 0xffc857, cssColor: "#ffc857", silhouette: "uplink" }),
  repair: Object.freeze({ color: 0x7fd8ff, cssColor: "#7fd8ff", silhouette: "cross" }),
  assembly: Object.freeze({ color: 0xff8f4c, cssColor: "#ff8f4c", silhouette: "hex-pad" }),
  compute: Object.freeze({ color: 0xb38cff, cssColor: "#b38cff", silhouette: "crystal" }),
});

export function getBattlefieldNodePresentation(node) {
  const presentation = BATTLEFIELD_NODE_PRESENTATIONS[node?.kind] ??
    BATTLEFIELD_NODE_PRESENTATIONS.core;
  const maxHealth = Math.max(1, finite(node?.maxHealth, DEFAULT_MAX_HEALTH));
  const health = clamp(finite(node?.health, maxHealth), 0, maxHealth);
  const status = node?.status ?? statusForHealth(health, maxHealth);
  return {
    ...presentation,
    healthRatio: health / maxHealth,
    showHealthCue: status !== "online",
    offline: status === "offline",
  };
}

export function createBattlefieldState() {
  return { nodes: BATTLEFIELD_NODES.map(runtimeNode) };
}

export function getNodeById(state, id) {
  return runtimeNodes(state).find((node) => node?.id === id) ?? null;
}

export function syncBattlefieldRuntimeCore(state, runtimeCore = {}) {
  const core = getNodeById(state, "core");
  if (!core) return state;

  const maxHealth = Math.max(1, finite(runtimeCore.maxHealth, core.maxHealth));
  const health = clamp(finite(runtimeCore.health, core.health), 0, maxHealth);
  return {
    ...state,
    nodes: runtimeNodes(state).map((node) => node?.id === "core"
      ? {
          ...node,
          health,
          maxHealth,
          status: statusForHealth(health, maxHealth),
        }
      : node),
  };
}

export function getNodeRepairCost(node) {
  return Math.max(0, Math.floor(finite(node?.repairCost, DEFAULT_REPAIR_COST)));
}

export function damageBattlefieldNode(state, id, amount) {
  const damage = Math.max(0, finite(amount));
  return {
    ...state,
    nodes: runtimeNodes(state).map((node) => {
      if (node?.id !== id) return { ...node };
      const maxHealth = Math.max(1, finite(node.maxHealth, DEFAULT_MAX_HEALTH));
      const health = clamp(finite(node.health, maxHealth) - damage, 0, maxHealth);
      return {
        ...node,
        maxHealth,
        health,
        status: statusForHealth(health, maxHealth),
        repairProgress: 0,
      };
    }),
  };
}

export function repairBattlefieldNode(state, id, amount, materials = {}) {
  const components = normalizedComponents(materials);
  const node = getNodeById(state, id);
  const maxHealth = Math.max(1, finite(node?.maxHealth, DEFAULT_MAX_HEALTH));
  const health = clamp(finite(node?.health, maxHealth), 0, maxHealth);
  const repair = Math.max(0, finite(amount));
  const repairCost = getNodeRepairCost(node);
  const canRepair = Boolean(
    node && repair > 0 && health < maxHealth && components >= repairCost,
  );
  const repairedHealth = canRepair
    ? clamp(health + repair, 0, maxHealth)
    : health;
  const actualRepair = repairedHealth - health;

  return {
    state: {
      ...state,
      nodes: runtimeNodes(state).map((candidate) => {
        if (candidate?.id !== id) return { ...candidate };
        return {
          ...candidate,
          maxHealth,
          health: repairedHealth,
          status: statusForHealth(repairedHealth, maxHealth),
          repairProgress: canRepair
            ? clamp(finite(candidate.repairProgress) + actualRepair, 0, maxHealth)
            : finite(candidate.repairProgress),
        };
      }),
    },
    materials: {
      ...materials,
      components: components - (canRepair ? repairCost : 0),
    },
  };
}

export function getBattlefieldEffects(state) {
  const isOnline = (id) => getNodeById(state, id)?.status === "online";
  return {
    coreOnline: isOnline("core"),
    commandRadius: isOnline("command-uplink") ? 8 : 0,
    repairMultiplier: isOnline("repair-bay") ? 1 : 0,
    assemblyEnabled: isOnline("assembly-pad"),
    computePerSecond: isOnline("compute-relay") ? 1 : 0,
  };
}

export function tickBattlefieldResources(state, resources = {}, elapsedMs = 0) {
  const elapsedSeconds = Math.max(0, finite(elapsedMs)) / 1_000;
  const compute = Math.max(0, finite(resources.compute));
  return {
    ...resources,
    compute: compute + getBattlefieldEffects(state).computePerSecond * elapsedSeconds,
  };
}
