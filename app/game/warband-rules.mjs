import {
  canAffordMaterialCost,
  scaleMaterialCost,
  spendMaterialCost,
} from "./progression.mjs";

export const GATHERING_COOLDOWN_MS = 750;

export const WARBAND_SLOTS = Object.freeze([
  Object.freeze({
    slot: 1,
    id: "kairos",
    code: "01",
    name: "KAIROS",
    role: "defend",
    cost: Object.freeze({ compute: 45, components: 0, shards: 0 }),
  }),
  Object.freeze({
    slot: 2,
    id: "kira",
    code: "02",
    name: "KIRA",
    role: "assault",
    cost: Object.freeze({ compute: 75, components: 0, shards: 0 }),
  }),
  Object.freeze({
    slot: 3,
    id: "forge",
    code: "03",
    name: "FORGE",
    role: "assault",
    cost: Object.freeze({ compute: 105, components: 0, shards: 0 }),
  }),
  Object.freeze({
    slot: 4,
    id: "covenant",
    code: "04",
    name: "COVENANT",
    role: "support",
    cost: Object.freeze({ compute: 135, components: 0, shards: 0 }),
  }),
  Object.freeze({
    slot: 5,
    id: "relay",
    code: "05",
    name: "RELAY",
    role: "support",
    cost: Object.freeze({ compute: 175, components: 2, shards: 1 }),
  }),
  Object.freeze({
    slot: 6,
    id: "scout",
    code: "06",
    name: "SCOUT",
    role: "assault",
    cost: Object.freeze({ compute: 225, components: 4, shards: 2 }),
  }),
  Object.freeze({
    slot: 7,
    id: "warden",
    code: "07",
    name: "WARDEN",
    role: "defend",
    cost: Object.freeze({ compute: 285, components: 6, shards: 4 }),
  }),
  Object.freeze({
    slot: 8,
    id: "nova",
    code: "08",
    name: "NOVA",
    role: "assault",
    cost: Object.freeze({ compute: 355, components: 9, shards: 6 }),
  }),
]);

export function canRecruitPersistentWarband(mode) {
  return mode === "playing" || mode === "upgrade" || mode === "evolution";
}

export function advanceWarbandWorkshopMode(mode, event) {
  if (event === "wave-complete" && mode === "playing") return "upgrade";
  if (
    event === "start-next-wave" &&
    (mode === "upgrade" || mode === "evolution")
  ) {
    return "playing";
  }
  return mode;
}

function resolveSlot(slot) {
  if (typeof slot === "number") {
    return WARBAND_SLOTS.find((definition) => definition.slot === slot) ?? null;
  }
  if (typeof slot === "string") {
    return WARBAND_SLOTS.find((definition) => definition.id === slot) ?? null;
  }
  if (slot && typeof slot === "object") {
    return WARBAND_SLOTS.find((definition) => definition.id === slot.id) ?? null;
  }
  return null;
}

function recruitedIds(state) {
  if (Array.isArray(state?.warband)) return state.warband;
  if (Array.isArray(state?.recruited)) return state.recruited;
  if (state?.recruited && typeof state.recruited === "object") {
    return Object.keys(state.recruited).filter((id) => state.recruited[id]);
  }
  return [];
}

function materialWallet(state) {
  return {
    compute: state?.compute ?? 0,
    components: state?.components ?? 0,
    shards: state?.shards ?? state?.upgradeShards ?? 0,
  };
}

export function getRecruitCost(slot, progression = {}) {
  const definition = resolveSlot(slot);
  if (!definition) return null;
  return scaleMaterialCost(definition.cost, progression);
}

export function getReservedWarbandMaterials(state = {}) {
  const ids = new Set(recruitedIds(state));
  return WARBAND_SLOTS.slice(4)
    .filter((definition) => !ids.has(definition.id))
    .map((definition) => getRecruitCost(definition, state.progression))
    .reduce(
      (reserved, cost) => ({
        components: reserved.components + cost.components,
        shards: reserved.shards + cost.shards,
      }),
      { components: 0, shards: 0 },
    );
}

export function getSpendableWarbandMaterials(state = {}) {
  const reserved = getReservedWarbandMaterials(state);
  const wallet = materialWallet(state);
  return {
    components: Math.max(0, wallet.components - reserved.components),
    shards: Math.max(0, wallet.shards - reserved.shards),
  };
}

export function canRecruitWarbandSlot(state, slot) {
  const definition = resolveSlot(slot);
  const ids = recruitedIds(state);
  if (!definition || ids.length >= WARBAND_SLOTS.length) return false;
  if (ids.includes(definition.id)) return false;
  if (definition.slot !== ids.length + 1) return false;
  return canAffordMaterialCost(materialWallet(state), getRecruitCost(definition, state?.progression));
}

export function recruitWarbandSlot(state, slot) {
  if (!canRecruitWarbandSlot(state, slot)) return state;
  const definition = resolveSlot(slot);
  const wallet = spendMaterialCost(
    materialWallet(state),
    getRecruitCost(definition, state?.progression),
  );
  const ids = recruitedIds(state);
  const next = {
    ...state,
    compute: wallet.compute,
    components: wallet.components,
    shards: wallet.shards,
  };
  if (Array.isArray(state.warband) || (!state.recruited && !state.warband)) {
    next.warband = [...ids, definition.id];
  } else if (Array.isArray(state.recruited)) {
    next.recruited = [...ids, definition.id];
  } else {
    next.recruited = { ...state.recruited, [definition.id]: true };
  }
  if ("upgradeShards" in state) next.upgradeShards = wallet.shards;
  return next;
}

function gatheringCooldown(agent) {
  return Number.isFinite(agent?.gatheringCooldownMs)
    ? Math.max(0, agent.gatheringCooldownMs)
    : 0;
}

function materialLoot(loot) {
  return loot?.type === "component" || loot?.type === "upgrade-shard";
}

function hasPosition(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y ?? value?.z);
}

function distanceTo(agent, loot) {
  const agentY = agent.y ?? agent.z;
  const lootY = loot.y ?? loot.z;
  return Math.hypot(agent.x - loot.x, agentY - lootY);
}

function visibleMaterials(agent, nearbyLoot) {
  const range = Number.isFinite(agent?.gatherRange) ? agent.gatherRange : 1.35;
  return (Array.isArray(nearbyLoot) ? nearbyLoot : [])
    .filter((loot) => materialLoot(loot) && loot.visible !== false)
    .filter((loot) => hasPosition(agent) && hasPosition(loot))
    .filter((loot) => distanceTo(agent, loot) <= range)
    .sort((left, right) => {
      const distanceDifference = distanceTo(agent, left) - distanceTo(agent, right);
      return distanceDifference || String(left.id).localeCompare(String(right.id));
    });
}

export function collectMaterials(agent, nearbyLoot) {
  const empty = { components: 0, shards: 0 };
  if (gatheringCooldown(agent) > 0) return { agent, collected: empty };
  const loot = visibleMaterials(agent, nearbyLoot)[0];
  if (!loot) return { agent, collected: empty };
  const value = Number.isFinite(loot.value) && loot.value > 0 ? loot.value : 0;
  const collected = loot.type === "component"
    ? { components: value, shards: 0 }
    : { components: 0, shards: value };
  return {
    agent: {
      ...agent,
      gatheringCooldownMs: GATHERING_COOLDOWN_MS,
      gatheredLootId: loot.id,
      gatheringTargetId: null,
    },
    collected,
  };
}

export function tickAgentGathering(agent, context = {}, elapsedMs = 0) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const cooldownLeft = Math.max(0, gatheringCooldown(agent) - elapsed);
  const unsafe = context.hostileTargetInRange || context.hasPriorityHostile || context.retreating;
  const loot = !unsafe && cooldownLeft === 0
    ? visibleMaterials(agent, context.nearbyLoot)[0]
    : null;
  return {
    ...agent,
    gatheringCooldownMs: cooldownLeft,
    gatheringTargetId: loot?.id ?? null,
  };
}
