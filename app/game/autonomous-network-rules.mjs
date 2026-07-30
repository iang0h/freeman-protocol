export const CORE_REPAIR_COMPONENT_COST = 2;
export const CORE_REPAIR_AMOUNT = 25;
export const AUTONOMOUS_ACTION_INTERVAL_MS = 3_500;

export function repairCore(core, components) {
  const available = Math.max(0, Math.floor(Number(components) || 0));
  const hp = Math.max(0, Number(core?.hp) || 0);
  const maxHp = Math.max(hp, Number(core?.maxHp) || hp);
  if (available < CORE_REPAIR_COMPONENT_COST || hp >= maxHp) {
    return { core: { ...core }, components: available, repaired: false };
  }
  return {
    core: {
      ...core,
      hp: Math.min(maxHp, hp + CORE_REPAIR_AMOUNT),
    },
    components: available - CORE_REPAIR_COMPONENT_COST,
    repaired: true,
  };
}

export function chooseAutonomousNetworkAction(state = {}) {
  const priority = ["survive", "farm", "expand"].includes(state.watchPriority)
    ? state.watchPriority
    : "survive";
  if (state.mode === "playing" && state.coreDamaged && state.components >= CORE_REPAIR_COMPONENT_COST) {
    return "repair-core";
  }
  if (state.mode === "playing" && priority !== "expand" && state.damagedAgent && state.repairKits > 0) {
    return "repair-agent";
  }
  if (state.mode === "playing" && state.damagedTurret && state.components > 0) {
    return "repair-sentry";
  }
  if (
    state.mode === "playing" &&
    state.defenses < state.maxDefenses &&
    state.compute >= state.defenseCost
  ) {
    if (priority === "expand" || !state.damagedAgent || state.repairKits <= 0) return "build-sentry";
  }
  if (state.mode === "playing" && state.damagedAgent && state.repairKits > 0) {
    return "repair-agent";
  }
  if (state.mode === "upgrade" && state.upgradeAvailable) return "upgrade";
  return null;
}
