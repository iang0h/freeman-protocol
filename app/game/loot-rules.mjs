export const LOOT_TYPES = Object.freeze({
  repair: "repair",
  component: "component",
  upgradeShard: "upgrade-shard",
});

const DROP_TABLE = Object.freeze({
  virus: Object.freeze({ chance: 0.2, types: [LOOT_TYPES.repair] }),
  phisher: Object.freeze({
    chance: 0.35,
    types: [LOOT_TYPES.repair, LOOT_TYPES.component],
  }),
  trojan: Object.freeze({
    chance: 0.6,
    types: [
      LOOT_TYPES.repair,
      LOOT_TYPES.component,
      LOOT_TYPES.upgradeShard,
    ],
  }),
  rootkit: Object.freeze({
    chance: 0.8,
    types: [LOOT_TYPES.component, LOOT_TYPES.upgradeShard],
  }),
});

const LOOT_VALUES = Object.freeze({
  [LOOT_TYPES.repair]: 25,
  [LOOT_TYPES.component]: 2,
  [LOOT_TYPES.upgradeShard]: 1,
});

const PLAYER_PICKUP_RADIUS = 0.5;
const LOOT_PICKUP_RADIUS = 0.4;

export function rollLootDrop(enemyKind, rng) {
  const drop = DROP_TABLE[enemyKind];
  if (!drop || rng() >= drop.chance) return null;

  const type = drop.types[Math.floor(rng() * drop.types.length)];
  const xRoll = rng();
  const yRoll = rng();
  const x = xRoll * 2 - 1;
  const y = yRoll * 2 - 1;

  return {
    id: `loot-${enemyKind}-${type}-${Math.floor(xRoll * 1000)}-${Math.floor(yRoll * 1000)}`,
    type,
    x,
    y,
    value: LOOT_VALUES[type],
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
  if (!Object.values(LOOT_TYPES).includes(loot?.type)) {
    throw new Error(`Unknown loot type ${loot?.type}`);
  }

  const value = loot.value ?? LOOT_VALUES[loot.type];
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Loot value must be a non-negative number");
  }

  if (loot.type === LOOT_TYPES.repair) {
    return {
      ...state,
      health: clampRepair(state.health, state.maxHealth, value),
      coreHealth: clampRepair(state.coreHealth, state.maxCoreHealth, value),
    };
  }

  if (loot.type === LOOT_TYPES.component) {
    return { ...state, components: (state.components ?? 0) + value };
  }

  return {
    ...state,
    upgradeShards: (state.upgradeShards ?? 0) + value,
  };
}

function clampRepair(health, maximum, value) {
  if (!Number.isFinite(health) || !Number.isFinite(maximum)) return health;
  return Math.min(maximum, health + value);
}

function hasPosition(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y);
}
