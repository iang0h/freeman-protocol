export const EVOLUTIONS = Object.freeze({
  kairos: Object.freeze([
    Object.freeze({
      id: "cryo-mesh",
      name: "CRYO MESH",
      price: 70,
      chainTargets: 2,
      chainRadius: 2.5,
      slowDurationMultiplier: 0.7,
    }),
    Object.freeze({
      id: "stasis-lock",
      name: "STASIS LOCK",
      price: 70,
      hitsRequired: 3,
      hitWindow: 5,
      freezeDuration: 1.2,
      bossSlow: 0.45,
      targetCooldown: 5,
    }),
  ]),
  kira: Object.freeze([
    Object.freeze({
      id: "execution-protocol",
      name: "EXECUTION PROTOCOL",
      price: 90,
      executeThreshold: 0.4,
      executeDamageMultiplier: 1.35,
    }),
    Object.freeze({
      id: "rail-pierce",
      name: "RAIL PIERCE",
      price: 90,
      pierceMultipliers: Object.freeze([0.7, 0.45]),
    }),
  ]),
  forge: Object.freeze([
    Object.freeze({
      id: "cluster-burst",
      name: "CLUSTER BURST",
      price: 110,
      splashRadius: 1.8,
      splashDamageMultiplier: 0.45,
    }),
    Object.freeze({
      id: "suppression-loop",
      name: "SUPPRESSION LOOP",
      price: 110,
      intervalReductionPerHit: 0.08,
      maxStacks: 4,
      attackIntervalPenalty: 1.2,
      penaltyDuration: 2,
    }),
  ]),
  covenant: Object.freeze([
    Object.freeze({
      id: "aegis-relay",
      name: "AEGIS RELAY",
      price: 130,
      interval: 8,
      playerShield: 20,
      coreShield: 30,
    }),
    Object.freeze({
      id: "nanite-repair",
      name: "NANITE REPAIR",
      price: 130,
      playerRepair: 18,
      coreRepair: 16,
      disabledReduction: 1.5,
    }),
  ]),
});

export const UPGRADE_ORDER = Object.freeze([
  "overclock",
  "bastion",
  "bandwidth",
  "voltage",
  "repair",
  "command",
]);

export const UPGRADE_CAPS = Object.freeze({
  overclock: 2,
  bastion: 2,
  bandwidth: 2,
  voltage: 2,
  repair: Infinity,
  command: 2,
});

export function purchaseEvolution(state, agentId, evolutionId) {
  if (!state.recruited[agentId]) {
    throw new Error(`${agentId} is not recruited`);
  }
  if (state.evolutions[agentId]) {
    throw new Error(`${agentId} already evolved`);
  }
  const definition = EVOLUTIONS[agentId]?.find(
    (item) => item.id === evolutionId,
  );
  if (!definition) throw new Error(`Unknown evolution ${evolutionId}`);
  if (state.compute < definition.price) {
    throw new Error(`Not enough Compute for ${definition.name}`);
  }
  return {
    ...state,
    compute: state.compute - definition.price,
    evolutions: {
      ...state.evolutions,
      [agentId]: evolutionId,
    },
  };
}

export function applyUpgradeStack(state, upgradeId) {
  if (!(upgradeId in UPGRADE_CAPS)) {
    throw new Error(`Unknown upgrade ${upgradeId}`);
  }
  const current = state.stacks[upgradeId] ?? 0;
  if (current >= UPGRADE_CAPS[upgradeId]) {
    throw new Error(`${upgradeId} is capped`);
  }
  return {
    ...state,
    stacks: {
      ...state.stacks,
      [upgradeId]: current + 1,
    },
  };
}

export function getUpgradeDraft(wave, stacks) {
  const offset = ((wave - 1) * 2) % UPGRADE_ORDER.length;
  const draft = [];
  for (let step = 0; step < UPGRADE_ORDER.length * 2; step += 1) {
    const id = UPGRADE_ORDER[(offset + step) % UPGRADE_ORDER.length];
    if (draft.includes(id)) continue;
    if ((stacks[id] ?? 0) >= UPGRADE_CAPS[id]) continue;
    draft.push(id);
    if (draft.length === 3) break;
  }
  return draft.map((id) => ({ id, stacks: stacks[id] ?? 0 }));
}
