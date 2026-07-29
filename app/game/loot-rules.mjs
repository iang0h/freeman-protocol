export const LOOT_TYPES = Object.freeze({
  repair: Object.freeze({
    id: "repair",
    label: "Repair Cache",
    color: "#78d6a5",
    dropChance: 0.2,
    value: 25,
    eliteOnly: false,
  }),
  component: Object.freeze({
    id: "component",
    label: "AI Component",
    color: "#f0a65a",
    dropChance: 0.35,
    value: 2,
    eliteOnly: false,
  }),
  upgradeShard: Object.freeze({
    id: "upgrade-shard",
    label: "Upgrade Shard",
    color: "#b9a4ff",
    dropChance: 0.8,
    value: 1,
    eliteOnly: true,
  }),
});

const LOOT_BY_ID = Object.freeze(
  Object.fromEntries(Object.values(LOOT_TYPES).map((loot) => [loot.id, loot])),
);

const DROP_TABLE = Object.freeze({
  virus: Object.freeze({ chance: 0.2, types: [LOOT_TYPES.repair.id] }),
  phisher: Object.freeze({
    chance: 0.35,
    types: [LOOT_TYPES.repair.id, LOOT_TYPES.component.id],
  }),
  trojan: Object.freeze({
    chance: 0.6,
    types: [
      LOOT_TYPES.repair.id,
      LOOT_TYPES.component.id,
      LOOT_TYPES.upgradeShard.id,
    ],
  }),
  rootkit: Object.freeze({
    chance: 0.8,
    types: [LOOT_TYPES.component.id, LOOT_TYPES.upgradeShard.id],
  }),
});

const PLAYER_PICKUP_RADIUS = 0.5;
const LOOT_PICKUP_RADIUS = 0.4;

export function rollLootDrop(enemyKind, rng) {
  const drop = DROP_TABLE[enemyKind];
  if (!drop || rng() >= drop.chance) return null;

  const types = drop.types.filter(
    (type) => !LOOT_BY_ID[type].eliteOnly || enemyKind === "rootkit",
  );
  if (types.length === 0) return null;
  const type = types[Math.floor(rng() * types.length)];
  const xRoll = rng();
  const yRoll = rng();
  const x = xRoll * 2 - 1;
  const y = yRoll * 2 - 1;

  return {
    id: `loot-${enemyKind}-${type}-${Math.floor(xRoll * 1000)}-${Math.floor(yRoll * 1000)}`,
    type,
    x,
    y,
    value: LOOT_BY_ID[type].value,
  };
}

export function getLootPresentation(type, value) {
  const loot = LOOT_BY_ID[type];
  if (!loot) throw new Error(`Unknown loot type ${type}`);
  const quantity = Number.isFinite(value) ? value : loot.value;
  return {
    ...loot,
    worldLabel:
      type === LOOT_TYPES.repair.id
        ? `${loot.label.toUpperCase()} +${quantity} HP · +1 KIT`
        : `${loot.label.toUpperCase()} +${quantity}`,
    beamHeight: loot.eliteOnly ? 1.5 : 1.2,
    toastText:
      type === LOOT_TYPES.repair.id
        ? `${loot.label} +${quantity} HP · +1 KIT`
        : `${loot.label} +${quantity}`,
  };
}

export function canCollectLoot(player, loot) {
  if (!hasPosition(player) || !hasPosition(loot)) return false;
  const pickupRadius =
    (player.radius ?? PLAYER_PICKUP_RADIUS) +
    (loot.radius ?? LOOT_PICKUP_RADIUS);
  return Math.hypot(player.x - loot.x, player.y - loot.y) <= pickupRadius;
}

export function applyLootPickup(state, loot) {
  if (!LOOT_BY_ID[loot?.type]) {
    throw new Error(`Unknown loot type ${loot?.type}`);
  }

  const value = loot.value ?? LOOT_BY_ID[loot.type].value;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Loot value must be a non-negative number");
  }

  if (loot.type === LOOT_TYPES.repair.id) {
    return {
      ...state,
      health: clampRepair(state.health, state.maxHealth, value),
      repairKits: (state.repairKits ?? 0) + 1,
    };
  }

  if (loot.type === LOOT_TYPES.component.id) {
    return { ...state, components: (state.components ?? 0) + value };
  }

  return {
    ...state,
    upgradeShards: (state.upgradeShards ?? 0) + value,
  };
}

export function creditPendingMaterialLoot(state = {}, pendingLoot = []) {
  const usesShards = Object.prototype.hasOwnProperty.call(state, "shards");
  const usesUpgradeShards = Object.prototype.hasOwnProperty.call(
    state,
    "upgradeShards",
  );
  let credited = {
    components: state.components ?? 0,
    upgradeShards: usesShards
      ? state.shards
      : state.upgradeShards ?? 0,
  };
  let creditedShard = false;
  for (const loot of Array.isArray(pendingLoot) ? pendingLoot : []) {
    if (
      loot?.type !== LOOT_TYPES.component.id &&
      loot?.type !== LOOT_TYPES.upgradeShard.id
    ) {
      continue;
    }
    credited = applyLootPickup(credited, loot);
    if (loot.type === LOOT_TYPES.upgradeShard.id) creditedShard = true;
  }
  const result = {
    ...state,
    components: credited.components,
  };
  if (usesShards) result.shards = credited.upgradeShards;
  if (usesUpgradeShards || (!usesShards && creditedShard)) {
    result.upgradeShards = credited.upgradeShards;
  }
  return result;
}

function clampRepair(health, maximum, value) {
  if (!Number.isFinite(health) || !Number.isFinite(maximum)) return health;
  return Math.min(maximum, health + value);
}

function hasPosition(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y);
}
