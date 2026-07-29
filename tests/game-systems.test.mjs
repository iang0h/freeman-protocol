import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as autonomyRules from "../app/game/autonomy-rules.mjs";

import {
  canCompleteWave,
  getActiveEnemyLimit,
  releaseSpawnBatch,
  remainingThreats,
} from "../app/game/combat-rules.mjs";
import {
  isValidSentryPosition,
  selectAutoSentryPosition,
} from "../app/game/sentry-placement.mjs";
import {
  AGENT_COMPONENT_UPGRADES,
  EVOLUTIONS,
  PLAYER_ARMORS,
  applyUpgradeStack,
  getUpgradeDraft,
  purchaseComponentUpgrade,
  purchaseEvolution,
} from "../app/game/progression.mjs";
import { takeNextTrack } from "../app/game/playlist.mjs";
import {
  FIRST_WAVE,
  OBSERVE_BREACH,
  TUTORIAL_STEPS,
  advanceTutorial,
  canPerformTutorialAction,
  canRetryFirstWave,
  isTutorialProtected,
} from "../app/game/tutorial-rules.mjs";
import { normalizeStickInput, tapToFire } from "../app/game/input-rules.mjs";
import {
  LOOT_TYPES,
  applyLootPickup,
  canCollectLoot,
  creditPendingMaterialLoot,
  rollLootDrop,
} from "../app/game/loot-rules.mjs";
import {
  AGENT_ROLES,
  SUB_AGENT_MATERIAL_COST,
  clearSubAgents,
  decideAgentIntent,
  shouldImprovise,
  spawnTemporarySubAgent,
  tickTemporarySubAgent,
  tickSubAgents,
} from "../app/game/autonomy-rules.mjs";
import {
  applyTerrainRouteBias,
  getEffectiveResistanceFlags,
  getMaxEmpResistancePercent,
  getPhisherDecoyOffsets,
  getRootkitRebootUpdates,
  getTerrainModifier,
  getWaveModifiers,
  resolveEmpDamage,
} from "../app/game/encounter-rules.mjs";
import {
  EMP_BASE_DAMAGE,
  EMP_BASE_RADIUS,
  canFireEmp,
  createEmpState,
  fireEmp,
  getEmpRuntimeProfile,
  getEmpUpgrade,
  tickEmp,
  updateEmpCooldown,
} from "../app/game/emp-rules.mjs";
import {
  WARBAND_SLOTS,
  advanceWarbandWorkshopMode,
  canRecruitWarbandSlot,
  canRecruitPersistentWarband,
  collectMaterials,
  getRecruitCost,
  getReservedWarbandMaterials,
  getSpendableWarbandMaterials,
  recruitWarbandSlot,
  tickAgentGathering,
} from "../app/game/warband-rules.mjs";
import {
  AGENT_SKILLS,
  canUseSkill,
  getSlowMovementMultiplier,
  useSkill as activateAgentSkill,
} from "../app/game/skill-rules.mjs";
import {
  BOSS_CAPS,
  BOSS_REWARD_RATIONALE,
  getBossArmorMultiplier,
  getBossEncounter,
  getNearestBossTarget,
  getPendingBossTarget,
  tickBoss,
} from "../app/game/boss-rules.mjs";

async function loadRepairRules() {
  return import("../app/game/repair-rules.mjs");
}

test("repair lifecycle persists at the bay until the configured return ratio", async () => {
  const { getRepairDecision, tickRepairBay } = await loadRepairRules();
  const agent = {
    id: "relay",
    hp: 28,
    maxHp: 100,
    repairThreshold: 0.4,
    returnHealthRatio: 0.75,
    repairDecision: "repair",
    disabledLeftMs: 0,
  };
  const destroyedBay = { hp: 0, maxHp: 70, isSeparate: true, repairPerSecond: 20 };
  const sharedCore = { hp: 70, maxHp: 70, isSeparate: false, repairPerSecond: 20 };
  const functioningBay = { hp: 70, maxHp: 70, isSeparate: true, repairPerSecond: 20 };

  assert.equal(getRepairDecision(agent, { repairBay: destroyedBay }), "retreat");
  assert.equal(getRepairDecision(agent, { repairBay: sharedCore }), "retreat");
  assert.equal(getRepairDecision(agent, { repairBay: functioningBay }), "repair");

  const firstTick = tickRepairBay(functioningBay, [agent], 1_000).units[0];
  assert.equal(firstTick.hp, 48);
  assert.equal(
    getRepairDecision(firstTick, { repairBay: functioningBay }),
    "repair",
  );

  const secondTick = tickRepairBay(
    functioningBay,
    [{ ...firstTick, repairDecision: getRepairDecision(firstTick, { repairBay: functioningBay }) }],
    1_000,
  ).units[0];
  assert.equal(secondTick.hp, 68);
  assert.equal(
    getRepairDecision(secondTick, { repairBay: functioningBay }),
    "repair",
  );

  const returnTick = tickRepairBay(
    functioningBay,
    [{ ...secondTick, repairDecision: getRepairDecision(secondTick, { repairBay: functioningBay }) }],
    1_000,
  ).units[0];
  assert.equal(returnTick.hp, 88);
  assert.equal(
    getRepairDecision(returnTick, { repairBay: functioningBay }),
    "return",
  );
});

test("unit damage and repair timers clamp without mutating Core health", async () => {
  const { applyUnitDamage, tickRepairBay } = await loadRepairRules();
  const damaged = applyUnitDamage(
    { id: "warden", hp: 12, maxHp: 100, disabledLeftMs: 300, coreHealth: 137 },
    99,
  );
  assert.deepEqual(damaged, {
    id: "warden",
    hp: 0,
    maxHp: 100,
    disabledLeftMs: 3_000,
    coreHealth: 137,
  });

  const repaired = tickRepairBay(
    { hp: 60, maxHp: 60, isSeparate: true, repairPerSecond: 50 },
    [{ ...damaged, repairDecision: "repair" }],
    1_000,
  );
  assert.equal(repaired.units[0].disabledLeftMs, 2_000);
  assert.equal(repaired.units[0].hp, 0);
  assert.equal(repaired.units[0].coreHealth, 137);
  assert.equal(damaged.coreHealth, 137);
});

test("destroyed bays remain a withdrawal fallback while turrets repair with Components", async () => {
  const { applyUnitDamage, getRepairDecision, repairTurret, tickRepairBay } = await loadRepairRules();
  const turret = applyUnitDamage({ id: "sentry-1", hp: 55, maxHp: 100 }, 80);
  assert.equal(turret.hp, 0);

  const repairedTurret = repairTurret(
    { ...turret, repairCost: 2, repairAmount: 45 },
    3,
  );
  assert.equal(repairedTurret.turret.hp, 45);
  assert.equal(repairedTurret.components, 1);

  const fieldKit = repairTurret({ hp: 25, maxHp: 100, repairAmount: 20 }, 1);
  assert.equal(fieldKit.turret.hp, 45);
  const destroyedBay = applyUnitDamage(
    { hp: 60, maxHp: 60, isSeparate: true, repairPerSecond: 40 },
    60,
  );
  assert.equal(destroyedBay.hp, 0);
  const withdrawnUnit = { hp: 25, maxHp: 100, repairThreshold: 0.4, repairDecision: "repair" };
  const noBayRepair = tickRepairBay(
    destroyedBay,
    [withdrawnUnit],
    5_000,
  );
  assert.equal(noBayRepair.units[0].hp, 25);
  assert.equal(
    getRepairDecision(
      withdrawnUnit,
      { repairBay: destroyedBay, fieldKits: 0 },
    ),
    "retreat",
  );
});

test("hostile projectile collisions cover agents, turrets, and repair bays", async () => {
  const { findHostileProjectileHit } = await loadRepairRules();
  const projectile = { x: 0, z: 0, radius: 0.2 };
  const targets = [
    { id: "kairos", kind: "agent", x: 0.35, z: 0, radius: 0.3, hp: 75 },
    { id: "sentry-1", kind: "turret", x: 1.1, z: 0, radius: 0.35, hp: 100 },
    { id: "repair-bay", kind: "repair-bay", x: 1.9, z: 0, radius: 0.55, hp: 70 },
  ];

  assert.deepEqual(findHostileProjectileHit(projectile, targets), targets[0]);
  assert.deepEqual(
    findHostileProjectileHit({ ...projectile, x: 1.1 }, targets.slice(1)),
    targets[1],
  );
  assert.deepEqual(
    findHostileProjectileHit({ ...projectile, x: 1.9 }, targets.slice(2)),
    targets[2],
  );
});

test("warband recruitment keeps starter costs and escalates material costs after slot four", () => {
  assert.equal(WARBAND_SLOTS.length, 8);
  assert.deepEqual(
    WARBAND_SLOTS.slice(0, 4).map((slot) => getRecruitCost(slot)),
    [
      { compute: 45, components: 0, shards: 0 },
      { compute: 75, components: 0, shards: 0 },
      { compute: 105, components: 0, shards: 0 },
      { compute: 135, components: 0, shards: 0 },
    ],
  );
  const lateCosts = WARBAND_SLOTS.slice(4).map((slot) => getRecruitCost(slot));
  for (let index = 1; index < lateCosts.length; index += 1) {
    assert.ok(lateCosts[index].compute > lateCosts[index - 1].compute);
    assert.ok(lateCosts[index].components > lateCosts[index - 1].components);
    assert.ok(lateCosts[index].shards > lateCosts[index - 1].shards);
  }
});

test("renderer workshop lifecycle recruits slots five through eight before wave eight", () => {
  assert.equal(canRecruitPersistentWarband("upgrade"), true);
  assert.equal(canRecruitPersistentWarband("evolution"), true);
  assert.equal(advanceWarbandWorkshopMode("playing", "wave-complete"), "upgrade");
  assert.equal(advanceWarbandWorkshopMode("upgrade", "start-next-wave"), "playing");
  assert.equal(advanceWarbandWorkshopMode("evolution", "start-next-wave"), "playing");
  for (const mode of ["intro", "paused", "defeat", "victory"]) {
    assert.equal(canRecruitPersistentWarband(mode), false);
  }

  const rendererCampaigns = {
    webgl: {
      mode: "playing",
      compute: 10_000,
      components: 21,
      shards: 13,
      warband: WARBAND_SLOTS.slice(0, 4).map((slot) => slot.id),
    },
    canvas: {
      mode: "playing",
      compute: 10_000,
      components: 21,
      shards: 13,
      warband: WARBAND_SLOTS.slice(0, 4).map((slot) => slot.id),
    },
  };

  for (const campaign of Object.values(rendererCampaigns)) {
    campaign.mode = advanceWarbandWorkshopMode(campaign.mode, "wave-complete");
    assert.equal(campaign.mode, "upgrade");
    for (const slot of WARBAND_SLOTS.slice(4)) {
      assert.equal(campaign.mode, "upgrade");
      assert.equal(canRecruitPersistentWarband(campaign.mode), true);
      assert.equal(canRecruitWarbandSlot(campaign, slot), true);
      Object.assign(campaign, recruitWarbandSlot(campaign, slot));
    }
    assert.deepEqual(campaign.warband, WARBAND_SLOTS.map((slot) => slot.id));
    campaign.mode = advanceWarbandWorkshopMode(campaign.mode, "start-next-wave");
    assert.equal(canRecruitPersistentWarband(campaign.mode), true);
  }

  assert.deepEqual(rendererCampaigns.canvas, rendererCampaigns.webgl);
});

test("warband recruitment is atomic and rejects an unavailable ninth slot", () => {
  const state = {
    compute: 500,
    components: 10,
    shards: 5,
    warband: WARBAND_SLOTS.slice(0, 4).map((slot) => slot.id),
    untouched: { keep: true },
  };
  const insufficient = { ...state, components: 1 };
  assert.equal(canRecruitWarbandSlot(insufficient, WARBAND_SLOTS[4]), false);
  assert.strictEqual(recruitWarbandSlot(insufficient, WARBAND_SLOTS[4]), insufficient);

  const recruited = recruitWarbandSlot(state, WARBAND_SLOTS[4]);
  assert.deepEqual(recruited.warband, [
    "kairos", "kira", "forge", "covenant", "relay",
  ]);
  assert.deepEqual(recruited.untouched, { keep: true });
  assert.equal(recruited.compute, 325);
  assert.equal(recruited.components, 8);
  assert.equal(recruited.shards, 4);

  const full = { ...state, warband: WARBAND_SLOTS.map((slot) => slot.id) };
  assert.equal(canRecruitWarbandSlot(full, 9), false);
  assert.strictEqual(recruitWarbandSlot(full, 9), full);
});

test("agents deterministically collect visible materials and respect gathering cooldown", () => {
  const agent = { id: "relay", x: 0, y: 0, gatheringCooldownMs: 0 };
  const nearbyLoot = [
    { id: "shard-b", type: "upgrade-shard", x: 0.1, y: 0, value: 2 },
    { id: "component-a", type: "component", x: 0.1, y: 0, value: 3 },
    { id: "repair-c", type: "repair", x: 0, y: 0, value: 25 },
  ];
  const collection = collectMaterials(agent, nearbyLoot);
  assert.deepEqual(collection.collected, { components: 3, shards: 0 });
  assert.equal(collection.agent.gatheringCooldownMs, 750);
  assert.equal(collection.agent.gatheredLootId, "component-a");

  const cooling = collectMaterials(collection.agent, nearbyLoot);
  assert.deepEqual(cooling.collected, { components: 0, shards: 0 });
  assert.equal(cooling.agent.gatheringCooldownMs, 750);

  const ready = tickAgentGathering(collection.agent, {
    hostileTargetInRange: false,
    retreating: false,
    nearbyLoot,
  }, 750);
  assert.equal(ready.gatheringCooldownMs, 0);
  assert.equal(ready.gatheringTargetId, "component-a");
  assert.equal(
    tickAgentGathering(ready, { hostileTargetInRange: true, nearbyLoot }, 0)
      .gatheringTargetId,
    null,
  );
});

test("EMP starts charged, fires once, and completes its deterministic cooldown", () => {
  const fresh = createEmpState({ cooldownMs: 12000, maxCharge: 100 });

  assert.deepEqual(fresh, {
    charge: 100,
    maxCharge: 100,
    cooldownLeftMs: 0,
    cooldownMs: 12000,
  });
  assert.equal(canFireEmp(fresh), true);

  const fired = fireEmp(fresh, {
    baseDamage: EMP_BASE_DAMAGE,
    damageMultiplier: 1.5,
    terrainMultiplier: 0.9,
  });
  assert.equal(
    fired.damage,
    EMP_BASE_DAMAGE,
    "legacy damage and terrain multipliers must be ignored",
  );
  assert.deepEqual(fired.state, {
    charge: 0,
    maxCharge: 100,
    cooldownLeftMs: 12000,
    cooldownMs: 12000,
  });

  const ticking = tickEmp(fired.state, 4500);
  assert.deepEqual(ticking, {
    charge: 37.5,
    maxCharge: 100,
    cooldownLeftMs: 7500,
    cooldownMs: 12000,
  });
  assert.deepEqual(tickEmp(ticking, 7500), fresh);
});

test("EMP rejects a second pulse until its cooldown completes", () => {
  const fired = fireEmp(createEmpState({ cooldownMs: 6000, maxCharge: 1 }), {
    baseDamage: EMP_BASE_DAMAGE,
    damageMultiplier: 1,
    terrainMultiplier: 1,
  });

  const rejected = fireEmp(fired.state, {
    baseDamage: EMP_BASE_DAMAGE,
    damageMultiplier: 1,
    terrainMultiplier: 1,
  });
  assert.equal(canFireEmp(fired.state), false);
  assert.equal(rejected.damage, 0);
  assert.deepEqual(rejected.state, fired.state);
});

test("EMP damage is restrained and upgrades change only their documented dimension", () => {
  assert.ok(EMP_BASE_DAMAGE < 44);
  assert.equal(EMP_BASE_RADIUS, 10.5);
  assert.deepEqual(getEmpUpgrade("efficiency"), {
    id: "efficiency",
    label: "PULSE EFFICIENCY",
    cost: 90,
    cooldownMultiplier: 0.75,
  });
  assert.deepEqual(getEmpUpgrade("radius"), {
    id: "radius",
    label: "PULSE RADIUS",
    cost: 80,
    radiusMultiplier: 1.25,
  });
  assert.deepEqual(getEmpUpgrade("bypass"), {
    id: "bypass",
    label: "RESISTANCE BYPASS",
    cost: 110,
    resistanceBypass: 0.25,
  });
  assert.equal(getEmpUpgrade("missing"), null);

  assert.equal(
    resolveEmpDamage(
      100,
      { resistanceFlags: ["shield", "decoy", "armor", "jammer"] },
      getWaveModifiers(1),
    ),
    100,
  );
});

test("live EMP profile converts progression into cadence, radius, and bypass only", () => {
  assert.deepEqual(getEmpRuntimeProfile(), {
    cooldownMs: 16_000,
    radius: 10.5,
    resistanceBypass: 0,
  });
  assert.deepEqual(getEmpRuntimeProfile({ voltageRank: 1 }), {
    cooldownMs: 12_000,
    radius: 10.5,
    resistanceBypass: 0,
  });
  assert.deepEqual(
    getEmpRuntimeProfile({
      voltageRank: 2,
      radiusMultiplier: 1.25,
      terrainRadiusMultiplier: 0.9,
    }),
    {
      cooldownMs: 12_000,
      radius: 11.813,
      resistanceBypass: 0.25,
    },
  );

  const fired = fireEmp(createEmpState(), { baseDamage: EMP_BASE_DAMAGE });
  assert.equal(fired.damage, EMP_BASE_DAMAGE);
  assert.deepEqual(
    updateEmpCooldown(tickEmp(fired.state, 4_000), 12_000),
    {
      charge: 25,
      maxCharge: 100,
      cooldownLeftMs: 9_000,
      cooldownMs: 12_000,
    },
  );
});

test("renderer parity gate suppresses retreat, disabled-parent children, and Covenant support", async () => {
  const { getAgentActionState } = await loadRepairRules();
  const scenarios = [
    {
      name: "repairing Covenant",
      unit: {
        hp: 32,
        maxHp: 100,
        disabledLeftMs: 0,
        repairDecision: "repair",
      },
      expected: { withdrawing: true, canAct: false },
    },
    {
      name: "disabled Forge",
      unit: {
        hp: 70,
        maxHp: 100,
        disabledLeftMs: 500,
        repairDecision: "fight",
      },
      expected: { withdrawing: false, canAct: false },
    },
    {
      name: "active Kairos",
      unit: {
        hp: 70,
        maxHp: 100,
        disabledLeftMs: 0,
        repairDecision: "fight",
      },
      expected: { withdrawing: false, canAct: true },
    },
  ];

  for (const scenario of scenarios) {
    const webgl = getAgentActionState({ ...scenario.unit });
    const canvas = getAgentActionState({ ...scenario.unit });
    assert.deepEqual(webgl, scenario.expected, scenario.name);
    assert.deepEqual(canvas, webgl, scenario.name);
  }
});

test("wave one preserves the unmodified encounter and EMP", () => {
  const modifiers = getWaveModifiers(1);

  assert.deepEqual(modifiers.resistance, {
    shieldReduction: 0,
    decoyReduction: 0,
    armorReduction: 0,
    jammerReduction: 0,
  });
  assert.deepEqual(modifiers.flagsByType, {
    virus: [],
    phisher: [],
    trojan: [],
    rootkit: [],
  });
  assert.equal(
    resolveEmpDamage(
      100,
      { resistanceFlags: ["shield", "decoy", "armor", "jammer"] },
      modifiers,
    ),
    100,
  );
  assert.equal(getTerrainModifier(1).id, "none");
});

test("later waves add bounded visible hacker counter-play", () => {
  const waveTwo = getWaveModifiers(2);
  const waveFour = getWaveModifiers(4);
  const finalWave = getWaveModifiers(8);

  assert.deepEqual(waveTwo.flagsByType.virus, ["shield"]);
  assert.deepEqual(waveFour.flagsByType.phisher, ["decoy"]);
  assert.deepEqual(waveFour.flagsByType.trojan, ["shield", "armor"]);
  assert.deepEqual(finalWave.flagsByType.rootkit, ["shield", "jammer"]);
  assert.ok(finalWave.resistance.shieldReduction <= 0.35);
  assert.ok(finalWave.resistance.decoyReduction <= 0.7);
  assert.ok(finalWave.resistance.armorReduction <= 0.45);
  assert.ok(finalWave.resistance.jammerReduction <= 0.3);
  assert.deepEqual(getWaveModifiers(99), finalWave);
});

test("EMP resolution composes only resistance flags visible on the target", () => {
  const modifiers = getWaveModifiers(8);
  const shielded = resolveEmpDamage(
    100,
    { resistanceFlags: ["shield"] },
    modifiers,
  );
  const layered = resolveEmpDamage(
    100,
    { resistanceFlags: ["shield", "armor", "jammer"] },
    modifiers,
  );

  assert.equal(shielded, 65);
  assert.equal(layered, 25);
  assert.equal(
    resolveEmpDamage(100, { resistanceFlags: [] }, modifiers),
    100,
  );
});

test("HUD resistance reports the strongest combined hostile EMP reduction", () => {
  assert.equal(getMaxEmpResistancePercent(getWaveModifiers(1)), 0);
  assert.equal(getMaxEmpResistancePercent(getWaveModifiers(4)), 39);
  assert.equal(getMaxEmpResistancePercent(getWaveModifiers(8)), 79);
});

test("terrain modifiers are deterministic, serializable, and cycle after wave one", () => {
  const expected = [
    "none",
    "relay-storm",
    "firewall-lanes",
    "data-fog",
    "split-breach",
    "relay-storm",
    "firewall-lanes",
    "data-fog",
  ];

  assert.deepEqual(
    expected.map((_, index) => getTerrainModifier(index + 1).id),
    expected,
  );
  for (let wave = 1; wave <= 8; wave += 1) {
    const first = getTerrainModifier(wave);
    const repeated = getTerrainModifier(wave);
    assert.deepEqual(first, repeated);
    assert.doesNotThrow(() => JSON.stringify(first));
    assert.ok(first.empMultiplier >= 0.75 && first.empMultiplier <= 1.15);
    assert.ok(first.targetingRangeMultiplier >= 0.7);
    assert.ok(Math.abs(first.routeBias) <= 0.35);
  }
});

test("terrain route bias stays normalized for renderer parity", () => {
  const direction = applyTerrainRouteBias(0.6, 0.8, 0.3);

  assert.ok(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-12);
  assert.deepEqual(direction, applyTerrainRouteBias(0.6, 0.8, 0.3));
  assert.deepEqual(applyTerrainRouteBias(0, 0, 0.3), { x: 0, z: 0 });
});

test("Phisher decoys are deterministic and absent from wave one", () => {
  assert.deepEqual(getPhisherDecoyOffsets(1, 7), []);
  const offsets = getPhisherDecoyOffsets(3, 7);

  assert.equal(offsets.length, 2);
  assert.deepEqual(offsets, getPhisherDecoyOffsets(3, 7));
  assert.notDeepEqual(offsets[0], offsets[1]);
});

test("jammer zones add EMP resistance to nearby threats only", () => {
  const jammer = {
    id: 1,
    x: 0,
    z: 0,
    resistanceFlags: ["jammer"],
  };

  assert.deepEqual(
    getEffectiveResistanceFlags(
      { id: 2, x: 3, z: 0, resistanceFlags: ["shield"] },
      [jammer],
    ),
    ["shield", "jammer"],
  );
  assert.deepEqual(
    getEffectiveResistanceFlags(
      { id: 3, x: 6, z: 0, resistanceFlags: ["shield"] },
      [jammer],
    ),
    ["shield"],
  );
});

test("Rootkits reboot nearby damaged or slowed threats deterministically", () => {
  const source = {
    id: 1,
    x: 0,
    z: 0,
    resistanceFlags: ["jammer"],
  };
  const updates = getRootkitRebootUpdates(source, [
    { id: 1, x: 0, z: 0, hp: 100, maxHp: 100, slow: 0 },
    { id: 2, x: 3, z: 0, hp: 40, maxHp: 100, slow: 2.8 },
    { id: 3, x: 6, z: 0, hp: 40, maxHp: 100, slow: 2.8 },
  ]);

  assert.deepEqual(updates, [{ id: 2, hp: 58, slow: 0 }]);
});

test("paces queued enemies without changing the remaining threat total", () => {
  assert.equal(getActiveEnemyLimit("webgl"), 36);
  assert.equal(getActiveEnemyLimit("canvas"), 28);
  const queue = Array.from({ length: 10 }, (_, index) => `virus-${index}`);
  const result = releaseSpawnBatch(queue, 6, 10, 0);
  assert.deepEqual(result.released, queue.slice(0, 4));
  assert.deepEqual(result.queue, queue.slice(4));
  assert.equal(result.nextReleaseAt, 10.75);
  assert.equal(
    remainingThreats({
      active: 6,
      queued: result.queue.length,
      scheduled: 8,
    }),
    20,
  );
  assert.equal(
    canCompleteWave({ active: 0, queued: 1, scheduled: 0 }),
    false,
  );
  assert.equal(
    canCompleteWave({ active: 0, queued: 0, scheduled: 0 }),
    true,
  );
});

test("spawn pacing waits for capacity and release time", () => {
  const queue = ["virus", "phisher"];
  assert.deepEqual(releaseSpawnBatch(queue, 0, 2, 0), {
    released: [],
    queue,
    nextReleaseAt: 0,
  });
  assert.deepEqual(releaseSpawnBatch(queue, 2, 0.5, 1), {
    released: [],
    queue,
    nextReleaseAt: 1,
  });
});

test("auto placement is deterministic and spreads sentries", () => {
  const first = selectAutoSentryPosition([], []);
  assert.ok(first);
  const second = selectAutoSentryPosition([first], []);
  const repeated = selectAutoSentryPosition([], []);
  assert.deepEqual(first, repeated);
  assert.ok(Math.hypot(first.x, first.z) >= 2.35);
  assert.ok(Math.hypot(first.x, first.z) <= 7.2);
  assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= 1.8);
  assert.equal(isValidSentryPosition(first, [], []), true);
});

test("auto placement rejects blockers and returns null when covered", () => {
  const blockers = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    const radius = index < 24 ? 4.8 : 5.4;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      radius: 1.2,
    };
  });
  assert.equal(selectAutoSentryPosition([], blockers), null);
  assert.equal(
    isValidSentryPosition({ x: 1, z: 0 }, [], []),
    false,
  );
});

test("an agent can buy exactly one evolution", () => {
  const state = {
    compute: 200,
    components: 6,
    recruited: { kairos: true },
    evolutions: {},
  };
  const purchased = purchaseEvolution(state, "kairos", "cryo-mesh");
  assert.equal(purchased.compute, 130);
  assert.equal(purchased.components, 6);
  assert.equal(purchased.evolutions.kairos, "cryo-mesh");
  assert.throws(
    () => purchaseEvolution(purchased, "kairos", "stasis-lock"),
    /already evolved/,
  );
  assert.equal(EVOLUTIONS.kairos[0].chainTargets, 2);
  assert.equal(EVOLUTIONS.kira[1].pierceMultipliers[1], 0.45);
  assert.equal(EVOLUTIONS.forge[0].splashDamageMultiplier, 0.45);
  assert.equal(EVOLUTIONS.covenant[0].playerShield, 20);
});

test("evolution purchase validates recruitment and Compute", () => {
  assert.throws(
    () =>
      purchaseEvolution(
        { compute: 200, recruited: {}, evolutions: {} },
        "kira",
        "execution-protocol",
      ),
    /not recruited/,
  );
  assert.throws(
    () =>
      purchaseEvolution(
        {
          compute: 10,
          recruited: { kira: true },
          evolutions: {},
        },
        "kira",
        "execution-protocol",
      ),
    /Compute/,
  );
});

test("permanent upgrades cap at two stacks and leave drafts", () => {
  const cappedState = { stacks: { overclock: 2 } };
  assert.throws(
    () => applyUpgradeStack(cappedState, "overclock"),
    /capped/,
  );
  assert.ok(
    getUpgradeDraft(4, cappedState.stacks).every(
      (item) => item.id !== "overclock",
    ),
  );
  const repair = applyUpgradeStack(
    { stacks: { repair: 8 } },
    "repair",
  );
  assert.equal(repair.stacks.repair, 9);
});

test("wave drafts offer one player, agent, and defense choice", () => {
  assert.deepEqual(
    getUpgradeDraft(1, {}).map((item) => item.category),
    ["player", "agent", "defense"],
  );
});

test("wave drafts keep every category selectable after category upgrades cap", () => {
  const cappedStacks = {
    overclock: 2,
    bastion: 2,
    bandwidth: 2,
    command: 2,
    voltage: 2,
  };
  const draft = getUpgradeDraft(6, cappedStacks);

  assert.deepEqual(
    draft.map((item) => item.category),
    ["player", "agent", "defense"],
  );
  for (const choice of draft) {
    assert.doesNotThrow(() =>
      applyUpgradeStack({ stacks: cappedStacks }, choice.id),
    );
  }
});

test("armor profiles expose mutually exclusive concrete player bonuses", () => {
  assert.deepEqual(Object.keys(PLAYER_ARMORS), ["vanguard", "striker", "relay"]);
  assert.equal(PLAYER_ARMORS.vanguard.bonuses.maxHealth, 35);
  assert.equal(PLAYER_ARMORS.striker.bonuses.damageMultiplier, 1.2);
  assert.equal(PLAYER_ARMORS.relay.bonuses.empRadiusMultiplier, 1.25);
  assert.equal(PLAYER_ARMORS.relay.bonuses.healingMultiplier, 1.25);
});

test("each agent has a component-funded identity and lifetime upgrade", () => {
  assert.equal(AGENT_COMPONENT_UPGRADES.kairos[0].id, "stasis-array");
  assert.equal(AGENT_COMPONENT_UPGRADES.kira[0].id, "hunter-core");
  assert.equal(AGENT_COMPONENT_UPGRADES.forge[0].id, "breach-ammo");
  assert.equal(AGENT_COMPONENT_UPGRADES.covenant[0].id, "nanite-reserve");
  assert.deepEqual(
    Object.keys(AGENT_COMPONENT_UPGRADES),
    ["kairos", "kira", "forge", "covenant", "relay", "scout", "warden", "nova"],
  );
  for (const upgrades of Object.values(AGENT_COMPONENT_UPGRADES)) {
    assert.ok(upgrades[0].cost > 0);
    assert.ok(Object.keys(upgrades[0].bonuses).length > 0);
    assert.equal(
      upgrades.find((upgrade) => upgrade.id === "sub-agent-lifetime")?.maxRank,
      2,
    );
  }
});

test("component purchases deduct inventory only after valid validation", () => {
  const state = {
    components: 3,
    armorId: null,
    recruited: { kairos: true },
    componentUpgradeRanks: {},
  };
  const purchased = purchaseComponentUpgrade(state, "kairos", "stasis-array");
  assert.equal(purchased.components, 1);
  assert.equal(purchased.componentUpgradeRanks["kairos:stasis-array"], 1);
  assert.equal(state.components, 3);
  assert.throws(
    () => purchaseComponentUpgrade(state, "kairos", "not-real"),
    /Unknown component upgrade/,
  );
  assert.deepEqual(state, {
    components: 3,
    armorId: null,
    recruited: { kairos: true },
    componentUpgradeRanks: {},
  });
  assert.throws(
    () =>
      purchaseComponentUpgrade(
        { ...state, components: 1 },
        "kairos",
        "stasis-array",
      ),
    /Not enough Components/,
  );
});

test("component upgrades cap ranks and armor selection stays exclusive", () => {
  const base = {
    components: 10,
    armorId: null,
    recruited: { kairos: true },
    componentUpgradeRanks: { "kairos:stasis-array": 1 },
  };
  const rankTwo = purchaseComponentUpgrade(base, "kairos", "stasis-array");
  assert.equal(rankTwo.componentUpgradeRanks["kairos:stasis-array"], 2);
  assert.throws(
    () => purchaseComponentUpgrade(rankTwo, "kairos", "stasis-array"),
    /capped/,
  );
  const armored = purchaseComponentUpgrade(
    { ...base, componentUpgradeRanks: {} },
    "player",
    "vanguard",
  );
  assert.equal(armored.armorId, "vanguard");
  assert.throws(
    () => purchaseComponentUpgrade(armored, "player", "relay"),
    /already selected/,
  );
});

test("shuffle bag plays every track and avoids boundary repeats", () => {
  const tracks = ["protocol", "core-2", "core-3"];
  let state = { tracks, bag: [], previous: null };
  const played = [];
  for (let index = 0; index < 7; index += 1) {
    const result = takeNextTrack(state, () => 0);
    played.push(result.track);
    state = result.state;
  }
  assert.deepEqual(new Set(played.slice(0, 3)), new Set(tracks));
  assert.notEqual(played[2], played[3]);
  assert.notEqual(played[5], played[6]);
});

test("tutorial advances only from the expected event", () => {
  assert.deepEqual(TUTORIAL_STEPS, [
    "move",
    "shoot",
    "recruit",
    "observe",
    "complete",
    "skipped",
  ]);
  assert.equal(advanceTutorial("move", "enemy-defeated"), "move");
  assert.equal(advanceTutorial("move", "movement-complete"), "shoot");
  assert.equal(advanceTutorial("shoot", "training-cleared"), "recruit");
  assert.equal(advanceTutorial("recruit", "kairos-recruited"), "observe");
  assert.equal(advanceTutorial("observe", "breach-cleared"), "complete");
  assert.equal(advanceTutorial("complete", "movement-complete"), "complete");
});

test("tutorial milestones are phase-gated and never replayed later", () => {
  let step = "move";
  step = advanceTutorial(step, "kairos-recruited");
  step = advanceTutorial(step, "guard-selected");
  assert.equal(step, "move");

  step = advanceTutorial(step, "movement-complete");
  step = advanceTutorial(step, "training-cleared");
  assert.equal(step, "recruit");
  assert.equal(advanceTutorial(step, "guard-selected"), "recruit");
  assert.equal(advanceTutorial(step, "kairos-recruited"), "observe");
});

test("tutorial gates recruitment but never requires a squad-command click", () => {
  assert.equal(canPerformTutorialAction("move", "recruit-kairos"), false);
  assert.equal(canPerformTutorialAction("recruit", "recruit-kairos"), true);
  assert.equal(canPerformTutorialAction("recruit", "recruit-other"), false);
  assert.equal(canPerformTutorialAction("observe", "recruit-kairos"), false);
  assert.equal(canPerformTutorialAction("shoot", "guard-core"), true);
  assert.equal(canPerformTutorialAction("observe", "guard-core"), true);
  assert.equal(canPerformTutorialAction(null, "recruit-kairos"), true);
});

test("observe breach uses one shared five-virus roster", () => {
  assert.deepEqual(OBSERVE_BREACH, [
    { type: "virus", x: -3, z: -3.2, speed: 0.85, damage: 3, reward: 8 },
    { type: "virus", x: 0, z: -4.2, speed: 0.85, damage: 3, reward: 8 },
    { type: "virus", x: 3, z: -3.2, speed: 0.85, damage: 3, reward: 8 },
    { type: "virus", x: -1.4, z: -5.1, speed: 0.85, damage: 3, reward: 8 },
    { type: "virus", x: 1.4, z: -5.1, speed: 0.85, damage: 3, reward: 8 },
  ]);
});

test("tutorial protection and first-wave retry are explicit", () => {
  assert.equal(isTutorialProtected("move"), true);
  assert.equal(isTutorialProtected("observe"), true);
  assert.equal(isTutorialProtected("complete"), false);
  assert.equal(isTutorialProtected("skipped"), false);
  assert.equal(
    canRetryFirstWave({ wave: 1, tutorialResolved: true, checkpoint: true }),
    true,
  );
  assert.equal(
    canRetryFirstWave({ wave: 2, tutorialResolved: true, checkpoint: true }),
    false,
  );
  assert.deepEqual(FIRST_WAVE.initial, [
    "virus", "virus", "virus", "virus",
    "virus", "virus", "virus", "virus",
    "phisher",
  ]);
  assert.deepEqual(FIRST_WAVE.reinforcement, ["virus", "virus", "virus"]);
  assert.equal(FIRST_WAVE.damageMultiplier, 0.72);
});

test("virtual stick applies a dead zone and preserves direction", () => {
  assert.deepEqual(normalizeStickInput(0.05, -0.04), { x: 0, y: 0 });
  assert.deepEqual(normalizeStickInput(2, 0), { x: 1, y: 0 });
  const diagonal = normalizeStickInput(0.6, 0.8);
  assert.equal(diagonal.x, 0.6);
  assert.equal(diagonal.y, 0.8);
});

test("mobile tap-to-fire clamps normalized arena coordinates", () => {
  assert.deepEqual(tapToFire(-0.2, 1.4), { x: -10, z: 7 });
  const tap = tapToFire(0.4, 0.6);
  assert.ok(Math.abs(tap.x + 2) < 1e-9);
  assert.ok(Math.abs(tap.z - 1.4) < 1e-9);
});

test("loot drops are deterministic and respect each enemy drop chance", () => {
  const noDrop = rollLootDrop("virus", () => 0.99);
  assert.equal(noDrop, null);

  const first = rollLootDrop("trojan", sequence([0.1, 0.6, 0.25, 0.75]));
  const repeated = rollLootDrop(
    "trojan",
    sequence([0.1, 0.6, 0.25, 0.75]),
  );
  assert.deepEqual(first, repeated);
  assert.deepEqual(first, {
    id: "loot-trojan-component-250-750",
    type: LOOT_TYPES.component.id,
    x: -0.5,
    y: 0.5,
    value: 2,
  });
});

test("common loot types publish readable presentation metadata", () => {
  for (const loot of [
    LOOT_TYPES.repair,
    LOOT_TYPES.component,
  ]) {
    assert.equal(typeof loot.id, "string");
    assert.ok(loot.label.length >= 4);
    assert.match(loot.color, /^#[0-9a-f]{6}$/i);
    assert.ok(loot.dropChance > 0 && loot.dropChance <= 1);
    assert.ok(loot.value > 0);
    assert.equal(loot.eliteOnly, false);
  }
});

test("elite-only loot is never selected from common enemies", () => {
  assert.equal(LOOT_TYPES.upgradeShard.eliteOnly, true);
  const commonDrop = rollLootDrop(
    "trojan",
    sequence([0.1, 0.99, 0.25, 0.75]),
  );
  assert.notEqual(commonDrop?.type, LOOT_TYPES.upgradeShard.id);

  const eliteDrop = rollLootDrop(
    "rootkit",
    sequence([0.1, 0.99, 0.25, 0.75]),
  );
  assert.equal(eliteDrop?.type, LOOT_TYPES.upgradeShard.id);
});

test("loot requires player overlap before it can be collected", () => {
  const loot = { x: 2, y: 0, radius: 0.4 };
  assert.equal(canCollectLoot({ x: 0, y: 0, radius: 0.5 }, loot), false);
  assert.equal(canCollectLoot({ x: 1.2, y: 0, radius: 0.5 }, loot), true);
});

test("repair loot restores the player without healing the protected Core", () => {
  const state = {
    health: 92,
    maxHealth: 100,
    coreHealth: 174,
    maxCoreHealth: 180,
    repairKits: 0,
    components: 0,
    upgradeShards: 0,
  };
  assert.deepEqual(
    applyLootPickup(state, { type: LOOT_TYPES.repair.id, value: 25 }),
    { ...state, health: 100, repairKits: 1 },
  );
  assert.deepEqual(state, {
    health: 92,
    maxHealth: 100,
    coreHealth: 174,
    maxCoreHealth: 180,
    repairKits: 0,
    components: 0,
    upgradeShards: 0,
  });
});

test("component loot increments the component inventory", () => {
  const state = {
    health: 60,
    maxHealth: 100,
    coreHealth: 120,
    maxCoreHealth: 180,
    components: 3,
    upgradeShards: 0,
  };
  const result = applyLootPickup(state, {
    type: LOOT_TYPES.component.id,
    value: 2,
  });
  assert.equal(result.components, 5);
  assert.equal(state.components, 3);
});

test("pending material credit preserves shard wallet aliases", () => {
  const pending = [
    { type: LOOT_TYPES.component.id, value: 2 },
    { type: LOOT_TYPES.upgradeShard.id, value: 1 },
  ];
  assert.deepEqual(
    creditPendingMaterialLoot(
      { repairs: 0, components: 3, shards: 2 },
      pending,
    ),
    { repairs: 0, components: 5, shards: 3 },
  );
  assert.deepEqual(
    creditPendingMaterialLoot(
      { components: 3, upgradeShards: 2 },
      pending,
    ),
    { components: 5, upgradeShards: 3 },
  );
  assert.deepEqual(
    creditPendingMaterialLoot(
      { components: 3, shards: 2, upgradeShards: 2 },
      pending,
    ),
    { components: 5, shards: 3, upgradeShards: 3 },
  );
});

test("invalid loot is rejected", () => {
  assert.throws(
    () => applyLootPickup({}, { type: "malware", value: 1 }),
    /Unknown loot type/,
  );
});

test("autonomous agents use their role priorities when not improvising", () => {
  assert.equal(AGENT_ROLES.assault.priority, "assault");
  assert.equal(AGENT_ROLES.support.priority, "support");
  assert.equal(AGENT_ROLES.defend.priority, "defend");
  assert.equal(decideAgentIntent({ role: "assault" }, {}), "assault");
  assert.equal(decideAgentIntent({ role: "support" }, {}), "support");
  assert.equal(decideAgentIntent({ role: "defend" }, {}), "defend");
});

test("each role has a deterministic improvisation threshold", () => {
  assert.equal(
    shouldImprovise({ role: "assault" }, { enemyDensity: 6 }),
    true,
  );
  assert.equal(
    shouldImprovise({ role: "assault" }, { enemyDensity: 5 }),
    false,
  );
  assert.equal(
    shouldImprovise({ role: "support" }, { playerHealthRatio: 0.45 }),
    true,
  );
  assert.equal(
    shouldImprovise({ role: "support" }, { playerHealthRatio: 0.46 }),
    false,
  );
  assert.equal(
    shouldImprovise({ role: "defend" }, { wavePressure: 0.75 }),
    true,
  );
  assert.equal(
    shouldImprovise({ role: "defend" }, { wavePressure: 0.74 }),
    false,
  );
  assert.equal(
    decideAgentIntent({ role: "defend" }, { wavePressure: 0.75 }),
    "improvise",
  );
});

test("temporary sub-agents are capped at four children per parent and inherit the parent role", () => {
  const agent = { id: "kairos", role: "assault" };
  const context = {
    enemyDensity: 6,
    subAgents: [
      { id: "subagent-kairos-1", parentId: "kairos" },
      { id: "subagent-kairos-2", parentId: "kairos" },
      { id: "subagent-kira-1", parentId: "kira" },
    ],
    maxSubAgents: 4,
    materials: { components: 5, shards: 5 },
  };
  const spawned = spawnTemporarySubAgent(agent, context);
  assert.deepEqual(spawned, {
    id: "subagent-kairos-3",
    parentId: "kairos",
    role: "assault",
    remainingMs: 10_000,
    canSpawn: false,
  });
  assert.deepEqual(context.materials, { components: 4, shards: 4 });
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...context,
      subAgents: [...context.subAgents, spawned, { id: "subagent-kairos-4", parentId: "kairos" }],
    }),
    null,
  );
  assert.equal(
    spawnTemporarySubAgent({ ...agent, canSpawn: false }, context),
    null,
  );
  assert.equal(autonomyRules.canSpendTemporarySubAgent(), false);
  assert.equal(autonomyRules.canSpendTemporarySubAgent(null), false);
});

test("temporary sub-agent bounds normalize invalid context values", () => {
  const agent = { id: "kairos", role: "assault" };
  const improvisingContext = {
    enemyDensity: 6,
    materials: { components: 10, shards: 10 },
  };
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      activeSubAgents: 4,
      maxSubAgents: Infinity,
    }),
    null,
  );
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      maxSubAgents: NaN,
      subAgentLifetimeMs: Infinity,
    }).remainingMs,
    10_000,
  );
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      maxSubAgents: -1,
      subAgentLifetimeMs: 0,
    }).remainingMs,
    10_000,
  );
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      maxSubAgents: 1.5,
    }).remainingMs,
    10_000,
  );
});

test("temporary sub-agent IDs remain unique after prior agents expire", () => {
  const agent = { id: "kairos", role: "assault" };
  const context = {
    enemyDensity: 6,
    maxSubAgents: 4,
    materials: { components: 3, shards: 3 },
    subAgents: [
      { id: "subagent-kairos-1", remainingMs: 4_000 },
      { id: "subagent-kairos-3", remainingMs: 4_000 },
    ],
  };
  assert.equal(
    spawnTemporarySubAgent(agent, context).id,
    "subagent-kairos-4",
  );
});

test("temporary sub-agent lifetimes advance only through the documented upgrade tiers", () => {
  const agent = { id: "relay", role: "support" };
  assert.equal(typeof autonomyRules.getSubAgentLifetime, "function");
  if (typeof autonomyRules.getSubAgentLifetime !== "function") return;
  assert.equal(autonomyRules.getSubAgentLifetime(agent, {}), 10_000);
  assert.equal(autonomyRules.getSubAgentLifetime(agent, { subAgentLifetime: 1 }), 15_000);
  assert.equal(autonomyRules.getSubAgentLifetime(agent, { subAgentLifetime: 2 }), 20_000);
  assert.equal(autonomyRules.getSubAgentLifetime(agent, { subAgentLifetime: 99 }), 20_000);

  for (const [upgrades, lifetime] of [
    [{}, 10_000],
    [{ subAgentLifetime: 1 }, 15_000],
    [{ subAgentLifetime: 2 }, 20_000],
  ]) {
    const spawned = spawnTemporarySubAgent(agent, {
      playerHealthRatio: 0.45,
      upgrades,
      materials: { components: 1, shards: 1 },
    });
    assert.equal(spawned.remainingMs, lifetime);
    assert.deepEqual(
      tickSubAgents([{ ...spawned }], lifetime),
      [],
    );
  }
});

test("purchased lifetime matrix ranks drive 10, 15, and 20 second children in both renderer paths", () => {
  const agent = { id: "relay", role: "support" };
  let progression = {
    components: 4,
    armorId: null,
    recruited: { relay: true },
    componentUpgradeRanks: {},
  };

  for (const [renderer, expectedLifetime] of [
    ["WebGL", 10_000],
    ["Canvas", 10_000],
  ]) {
    const spawned = spawnTemporarySubAgent(agent, {
      playerHealthRatio: 0.45,
      upgrades: {
        componentUpgradeRanks: progression.componentUpgradeRanks,
      },
      materials: { components: 1, shards: 1 },
    });
    assert.equal(spawned.remainingMs, expectedLifetime, renderer);
  }

  for (const expectedLifetime of [15_000, 20_000]) {
    progression = purchaseComponentUpgrade(
      progression,
      "relay",
      "sub-agent-lifetime",
    );
    for (const renderer of ["WebGL", "Canvas"]) {
      const spawned = spawnTemporarySubAgent(agent, {
        playerHealthRatio: 0.45,
        upgrades: {
          componentUpgradeRanks: progression.componentUpgradeRanks,
        },
        materials: { components: 1, shards: 1 },
      });
      assert.equal(spawned.remainingMs, expectedLifetime, renderer);
    }
  }
});

test("sub-agent construction spends gathered Components and Shards atomically", () => {
  const componentCollection = collectMaterials(
    { id: "forge", x: 0, y: 0, gatheringCooldownMs: 0 },
    [{ id: "component", type: "component", x: 0, y: 0, value: 1 }],
  );
  const shardCollection = collectMaterials(
    { ...componentCollection.agent, gatheringCooldownMs: 0 },
    [{ id: "shard", type: "upgrade-shard", x: 0, y: 0, value: 1 }],
  );
  const materials = {
    components: componentCollection.collected.components,
    shards: shardCollection.collected.shards,
  };
  const spawned = spawnTemporarySubAgent(
    { id: "forge", role: "assault" },
    { enemyDensity: 6, materials },
  );
  assert.equal(spawned.parentId, "forge");
  assert.deepEqual(materials, { components: 0, shards: 0 });

  const insufficient = { components: 0, shards: 1 };
  assert.equal(
    spawnTemporarySubAgent(
      { id: "forge", role: "assault" },
      { enemyDensity: 6, materials: insufficient },
    ),
    null,
  );
  assert.deepEqual(insufficient, { components: 0, shards: 1 });
});

test("temporary sub-agents expire and are cleared between waves", () => {
  const subAgents = [
    {
      parentId: "kairos",
      role: "assault",
      remainingMs: 1_000,
      canSpawn: false,
    },
    {
      parentId: "kira",
      role: "support",
      remainingMs: 250,
      canSpawn: false,
    },
  ];
  assert.deepEqual(tickSubAgents(subAgents, 250), [
    {
      parentId: "kairos",
      role: "assault",
      remainingMs: 750,
      canSpawn: false,
    },
  ]);
  assert.deepEqual(clearSubAgents(subAgents), []);
  assert.equal(subAgents.length, 2);
});

test("assault sub-agents deterministically damage nearby threats", () => {
  const result = tickTemporarySubAgent(
    {
      id: "subagent-kira-1",
      parentId: "kira",
      role: "assault",
      remainingMs: 10_000,
      maxLifetimeMs: 10_000,
      cooldownLeftMs: 0,
      canSpawn: false,
    },
    { attackTargetInRange: true },
    100,
  );

  assert.deepEqual(result.action, { type: "attack", damage: 8 });
  assert.equal(result.state.remainingMs, 9_900);
  assert.equal(result.state.cooldownLeftMs, 1_400);
  assert.equal(result.state.healthRatio, 0.99);
  assert.equal(result.expired, false);
});

test("support sub-agents recover the player without healing the protected Core", () => {
  const result = tickTemporarySubAgent(
    {
      role: "support",
      remainingMs: 4_000,
      maxLifetimeMs: 10_000,
      cooldownLeftMs: 0,
      canSpawn: false,
    },
    { playerNeedsRepair: true, coreNeedsRepair: true },
    0,
  );

  assert.deepEqual(result.action, {
    type: "repair",
    playerHealing: 2,
    allyCooldownReductionMs: 250,
  });
});

test("defense sub-agents intercept threats near the Core", () => {
  const result = tickTemporarySubAgent(
    {
      role: "defend",
      remainingMs: 3_000,
      maxLifetimeMs: 10_000,
      cooldownLeftMs: 0,
      canSpawn: false,
    },
    { coreThreatInRange: true },
    0,
  );

  assert.deepEqual(result.action, {
    type: "guard",
    damage: 6,
    slowMs: 350,
  });
});

test("temporary sub-agent ticks expose expiry and health cue state", () => {
  const result = tickTemporarySubAgent(
    {
      role: "assault",
      remainingMs: 250,
      maxLifetimeMs: 1_000,
      cooldownLeftMs: 800,
      canSpawn: false,
    },
    { attackTargetInRange: true },
    250,
  );

  assert.deepEqual(result.action, { type: "idle" });
  assert.equal(result.state.remainingMs, 0);
  assert.equal(result.state.cooldownLeftMs, 550);
  assert.equal(result.state.healthRatio, 0);
  assert.equal(result.expired, true);
});

test("temporary sub-agent cooldowns prevent repeated role actions", () => {
  const result = tickTemporarySubAgent(
    {
      role: "assault",
      remainingMs: 10_000,
      maxLifetimeMs: 10_000,
      cooldownLeftMs: 900,
      canSpawn: false,
    },
    { attackTargetInRange: true },
    100,
  );

  assert.deepEqual(result.action, { type: "idle" });
  assert.equal(result.state.cooldownLeftMs, 800);
});

test("four named agents expose distinct deterministic role skills", () => {
  assert.deepEqual(Object.keys(AGENT_SKILLS), [
    "kairos",
    "kira",
    "forge",
    "covenant",
  ]);

  const fixtures = [
    {
      agent: { id: "kairos", hp: 75, maxHp: 75, skillCooldowns: {} },
      target: { id: "warboss", kind: "enemy", hp: 800, maxHp: 800, armored: true },
      skillId: "time-fracture",
      effects: [
        {
          type: "time-fracture",
          targetId: "warboss",
          radius: 3.5,
          slowMultiplier: 0.35,
          durationMs: 4_000,
        },
      ],
    },
    {
      agent: { id: "kira", hp: 75, maxHp: 75, skillCooldowns: {} },
      target: { id: "warboss", kind: "enemy", hp: 160, maxHp: 800, armored: true },
      skillId: "mark-execution",
      effects: [
        {
          type: "mark",
          targetId: "warboss",
          durationMs: 5_000,
          damageMultiplier: 1.5,
        },
        {
          type: "damage",
          targetId: "warboss",
          amount: 96,
          executes: true,
        },
      ],
    },
    {
      agent: { id: "forge", hp: 75, maxHp: 75, skillCooldowns: {} },
      target: { id: "warboss", kind: "enemy", hp: 800, maxHp: 800, armored: true },
      skillId: "armor-break-burst",
      effects: [
        {
          type: "armor-break",
          targetId: "warboss",
          armorReduction: 0.55,
          durationMs: 6_000,
        },
        {
          type: "suppressive-burst",
          targetId: "warboss",
          radius: 2.75,
          damage: 24,
          slowMs: 2_000,
          slowMultiplier: 0.62,
        },
      ],
    },
    {
      agent: { id: "covenant", hp: 75, maxHp: 75, skillCooldowns: {} },
      target: { id: "sentry-1", kind: "turret", hp: 30, maxHp: 100 },
      skillId: "repair-barrier",
      effects: [
        { type: "repair", targetId: "sentry-1", amount: 30 },
        {
          type: "barrier",
          targetId: "sentry-1",
          amount: 36,
          durationMs: 5_000,
        },
      ],
    },
  ];

  for (const fixture of fixtures) {
    const context = { target: fixture.target };
    const snapshot = structuredClone({ agent: fixture.agent, context });
    assert.equal(canUseSkill(fixture.agent, fixture.skillId, context), true);
    const first = activateAgentSkill(fixture.agent, fixture.skillId, context);
    const second = activateAgentSkill(fixture.agent, fixture.skillId, context);
    assert.deepEqual(first.effects, fixture.effects);
    assert.deepEqual(second, first);
    assert.deepEqual({ agent: fixture.agent, context }, snapshot);
    assert.equal(
      first.agent.skillCooldowns[fixture.skillId],
      AGENT_SKILLS[fixture.agent.id].cooldownMs,
    );
  }
});

test("skill slow strength stays deterministic for normal threats and warbosses", () => {
  assert.equal(getSlowMovementMultiplier(4_000, 0.35), 0.35);
  assert.equal(getSlowMovementMultiplier(2_000, 0.62), 0.62);
  assert.equal(getSlowMovementMultiplier(0, 0.35), 1);
  assert.equal(getSlowMovementMultiplier(1_000, Number.NaN), 0.48);
});

test("agent skills enforce ownership, cooldown, live-agent, and target constraints", () => {
  const target = { id: "trojan", kind: "enemy", hp: 100, maxHp: 100 };
  assert.equal(
    canUseSkill(
      { id: "kairos", hp: 75, skillCooldowns: { "time-fracture": 1 } },
      "time-fracture",
      { target },
    ),
    false,
  );
  assert.equal(
    canUseSkill(
      { id: "kairos", hp: 0, skillCooldowns: {} },
      "time-fracture",
      { target },
    ),
    false,
  );
  assert.equal(
    canUseSkill(
      { id: "kairos", hp: 75, disabledLeftMs: 1, skillCooldowns: {} },
      "time-fracture",
      { target },
    ),
    false,
  );
  assert.equal(
    canUseSkill(
      { id: "kira", hp: 75, skillCooldowns: {} },
      "time-fracture",
      { target },
    ),
    false,
  );
  assert.equal(
    canUseSkill(
      { id: "covenant", hp: 75, skillCooldowns: {} },
      "repair-barrier",
      { target: { id: "core", kind: "core", hp: 90, maxHp: 180 } },
    ),
    false,
  );
  assert.equal(
    canUseSkill(
      { id: "forge", hp: 75, skillCooldowns: {} },
      "armor-break-burst",
      { target: { ...target, hp: 0 } },
    ),
    false,
  );

  const agent = { id: "kairos", hp: 75, skillCooldowns: {} };
  assert.deepEqual(activateAgentSkill(agent, "repair-barrier", { target }), {
    agent,
    effects: [],
  });
});

test("waves three and later schedule exactly one bounded slow armored warboss", () => {
  const early = getBossEncounter(2, "alpha");
  assert.equal(early.scheduled, false);
  assert.equal(early.count, 0);

  const first = getBossEncounter(3, "alpha");
  const repeated = getBossEncounter(3, "alpha");
  assert.deepEqual(repeated, first);
  assert.equal(first.scheduled, true);
  assert.equal(first.count, 1);
  assert.equal(first.maxActive, 1);
  assert.equal(first.armored, true);
  assert.ok(first.maxHp <= BOSS_CAPS.maxHealth);
  assert.ok(first.movementSpeed <= BOSS_CAPS.maxMovementSpeed);
  assert.ok(first.attacksPerSecond <= BOSS_CAPS.maxAttacksPerSecond);
  assert.ok(first.rewardQuantity <= BOSS_CAPS.maxRewardQuantity);
  assert.ok(first.reinforcementCap <= BOSS_CAPS.maxReinforcements);
  assert.ok(first.rewards.shards >= 1);

  const escalated = getBossEncounter(99, Number.MAX_SAFE_INTEGER);
  assert.equal(escalated.count, 1);
  assert.ok(escalated.maxHp <= BOSS_CAPS.maxHealth);
  assert.ok(escalated.movementSpeed <= BOSS_CAPS.maxMovementSpeed);
  assert.ok(escalated.attacksPerSecond <= BOSS_CAPS.maxAttacksPerSecond);
  assert.ok(escalated.rewardQuantity <= BOSS_CAPS.maxRewardQuantity);
});

test("warboss armor scaling and guaranteed rewards cover warband slots five through eight", () => {
  const waveThree = getBossEncounter(3, "armor");
  const waveEight = getBossEncounter(8, "armor");
  assert.equal(
    getBossArmorMultiplier(waveThree),
    1 - waveThree.armorReduction,
  );
  assert.equal(getBossArmorMultiplier(waveEight, true), 1);

  const required = WARBAND_SLOTS.slice(4)
    .map((slot) => getRecruitCost(slot))
    .reduce(
      (total, cost) => ({
        components: total.components + cost.components,
        shards: total.shards + cost.shards,
      }),
      { components: 0, shards: 0 },
    );
  const guaranteed = Array.from(
    { length: 6 },
    (_, index) => getBossEncounter(index + 3, `mission-wave-${index + 3}`),
  ).reduce(
    (total, boss) => ({
      components: total.components + boss.rewards.components,
      shards: total.shards + boss.rewards.shards,
    }),
    { components: 0, shards: 0 },
  );
  assert.ok(guaranteed.components >= required.components);
  assert.ok(guaranteed.shards >= required.shards);
});

test("clean WebGL and Canvas campaigns fund one automatic child and recruit Nova before final victory", () => {
  assert.match(BOSS_REWARD_RATIONALE, /autonomous agents can improvise/i);
  assert.match(BOSS_REWARD_RATIONALE, /warband keeps growing/i);
  const cleanCampaign = {
    compute: 10_000,
    components: 0,
    shards: 0,
    warband: [],
  };

  let starterCampaign = cleanCampaign;
  for (const slot of WARBAND_SLOTS.slice(0, 4)) {
    starterCampaign = recruitWarbandSlot(starterCampaign, slot);
  }
  assert.deepEqual(
    starterCampaign.warband,
    WARBAND_SLOTS.slice(0, 4).map((slot) => slot.id),
  );
  assert.equal(starterCampaign.components, 0);
  assert.equal(starterCampaign.shards, 0);
  assert.deepEqual(
    getReservedWarbandMaterials(starterCampaign),
    { components: 21, shards: 13 },
  );

  const applyRendererTransition = (state, wave, children) => {
    const boss = getBossEncounter(wave, `mission-wave-${wave}`);
    assert.ok(
      boss.rewards.components + boss.rewards.shards <=
        BOSS_CAPS.maxRewardQuantity,
    );
    let next = creditPendingMaterialLoot(state, [
      { type: LOOT_TYPES.component.id, value: boss.rewards.components },
      { type: LOOT_TYPES.upgradeShard.id, value: boss.rewards.shards },
    ]);
    const parent = { id: "forge", role: "assault" };
    const context = {
      enemyDensity: 6,
      materials: getSpendableWarbandMaterials(next),
      subAgents: children,
    };
    assert.equal(decideAgentIntent(parent, context), "improvise");
    const child = spawnTemporarySubAgent(parent, context);
    if (child) {
      children.push(child);
      next = {
        ...next,
        components: next.components - SUB_AGENT_MATERIAL_COST.components,
        shards: next.shards - SUB_AGENT_MATERIAL_COST.shards,
      };
    }
    let nextSlot = WARBAND_SLOTS[state.warband.length];
    while (nextSlot && canRecruitWarbandSlot(next, nextSlot)) {
      next = recruitWarbandSlot(next, nextSlot);
      nextSlot = WARBAND_SLOTS[next.warband.length];
    }
    return next;
  };

  const children = { webgl: [], canvas: [] };
  let webglCampaign = structuredClone(starterCampaign);
  let canvasCampaign = structuredClone(starterCampaign);
  for (let wave = 3; wave <= 7; wave += 1) {
    webglCampaign = applyRendererTransition(
      webglCampaign,
      wave,
      children.webgl,
    );
    canvasCampaign = applyRendererTransition(
      canvasCampaign,
      wave,
      children.canvas,
    );
    assert.deepEqual(canvasCampaign, webglCampaign);
  }

  assert.equal(children.webgl.length, 1);
  assert.deepEqual(children.canvas, children.webgl);
  assert.deepEqual(
    webglCampaign.warband,
    WARBAND_SLOTS.map((slot) => slot.id),
  );
  assert.deepEqual(getReservedWarbandMaterials(webglCampaign), {
    components: 0,
    shards: 0,
  });
  assert.deepEqual(
    {
      components: webglCampaign.components,
      shards: webglCampaign.shards,
    },
    { components: 0, shards: 1 },
  );
});

test("both renderers consume skill slow strength, boss armor, and accurate final-wave copy", () => {
  const source = readFileSync(
    new URL("../app/FreemanProtocol.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.match(/getSlowMovementMultiplier\(/g).length >= 4);
  assert.ok(source.match(/effect\.slowMultiplier/g).length >= 4);
  assert.equal(source.match(/getBossArmorMultiplier\(/g).length, 2);
  assert.equal(
    source.match(
      /Break its armor, evade telegraphed strikes, and protect the Core\./g,
    ).length,
    2,
  );
  assert.doesNotMatch(source, /all three boss phases/);
});

test("warboss telegraphs a fixed evadable area and damages its current occupants", () => {
  const targets = [
    { id: "kairos", kind: "agent", hp: 75, maxHp: 75, x: 1, z: 0 },
    { id: "sentry-1", kind: "turret", hp: 100, maxHp: 100, x: 10, z: 0 },
  ];
  const encounter = getBossEncounter(3, "attacks");
  const telegraph = tickBoss(
    { ...encounter, attackCooldownLeftMs: 0 },
    0,
    { targets },
  );
  assert.deepEqual(telegraph.events, [
    {
      type: "telegraph",
      bossId: encounter.id,
      targetId: "kairos",
      targetKind: "agent",
      x: 1,
      z: 0,
      durationMs: encounter.telegraphMs,
      radius: encounter.attackRadius,
    },
  ]);
  assert.equal(telegraph.boss.pendingTargetX, 1);
  assert.equal(telegraph.boss.pendingTargetZ, 0);

  const movedTargets = [
    { ...targets[0], x: 10 },
    { ...targets[1], x: 1.5 },
  ];
  const firstAttack = tickBoss(
    telegraph.boss,
    encounter.telegraphMs,
    { targets: movedTargets },
  );
  assert.deepEqual(firstAttack.events, [
    {
      type: "damage",
      bossId: encounter.id,
      targetId: "sentry-1",
      targetKind: "turret",
      amount: encounter.attackDamage,
    },
  ]);
  assert.equal(firstAttack.boss.pendingTargetX, null);
  assert.equal(firstAttack.boss.pendingTargetZ, null);
});

test("pending boss targets match both kind and ID", () => {
  const collision = [
    { id: "1", kind: "agent", hp: 75, x: 1, z: 0 },
    { id: "1", kind: "turret", hp: 100, x: 4, z: 0 },
  ];
  assert.deepEqual(
    getPendingBossTarget(
      { pendingTargetId: "1", pendingTargetKind: "turret" },
      collision,
    ),
    collision[1],
  );
});

test("warboss target priority is measured from the boss instead of arena origin", () => {
  const targets = [
    { id: "origin-near", kind: "agent", hp: 75, x: 1, z: 0 },
    { id: "boss-near", kind: "turret", hp: 100, x: 9, z: 0 },
  ];
  assert.equal(getNearestBossTarget(targets, 10, 0).id, "boss-near");

  const encounter = getBossEncounter(3, "boss-position");
  const telegraph = tickBoss(
    { ...encounter, attackCooldownLeftMs: 0 },
    0,
    { targets, bossX: 10, bossZ: 0 },
  );
  assert.equal(telegraph.events[0].targetId, "boss-near");
  assert.equal(telegraph.events[0].targetKind, "turret");
});

test("warboss timing is invariant across equivalent timestep partitions", () => {
  const targets = [
    { id: "kairos", kind: "agent", hp: 75, x: 1, z: 0 },
    { id: "sentry-1", kind: "turret", hp: 100, x: 2, z: 0 },
  ];
  const encounter = getBossEncounter(3, "timing");
  const started = tickBoss(
    { ...encounter, attackCooldownLeftMs: 0 },
    0,
    { targets, bossX: 0, bossZ: 0 },
  );
  const extraTelegraphTime = 250;
  const combined = tickBoss(
    started.boss,
    encounter.telegraphMs + encounter.attackIntervalMs + extraTelegraphTime,
    { targets, bossX: 0, bossZ: 0 },
  );
  const afterStrike = tickBoss(
    started.boss,
    encounter.telegraphMs,
    { targets, bossX: 0, bossZ: 0 },
  );
  const afterCooldown = tickBoss(
    afterStrike.boss,
    encounter.attackIntervalMs,
    { targets, bossX: 0, bossZ: 0 },
  );
  const partitioned = tickBoss(
    afterCooldown.boss,
    extraTelegraphTime,
    { targets, bossX: 0, bossZ: 0 },
  );

  assert.deepEqual(combined.boss, partitioned.boss);
  assert.deepEqual(
    combined.events,
    [
      ...afterStrike.events,
      ...afterCooldown.events,
      ...partitioned.events,
    ],
  );
});

test("warboss rewards include bounded rare Shards and reinforcements cannot grow unbounded", () => {
  const encounter = getBossEncounter(8, "rewards");
  const death = tickBoss(
    { ...encounter, hp: 0 },
    16,
    { targets: [] },
  );
  assert.equal(death.events[0].type, "reward-drop");
  assert.ok(death.events[0].rewards.shards >= 1);
  assert.ok(death.events[0].quantity <= BOSS_CAPS.maxRewardQuantity);
  assert.equal(death.boss.rewardClaimed, true);
  assert.deepEqual(
    tickBoss(death.boss, 16, { targets: [] }).events,
    [],
  );

  let boss = {
    ...getBossEncounter(8, "reinforcements"),
    hp: getBossEncounter(8, "reinforcements").maxHp * 0.45,
  };
  let spawned = 0;
  for (let tick = 0; tick < 100; tick += 1) {
    const result = tickBoss(boss, 1_000, {
      targets: [],
      enemyCapacity: 100,
    });
    boss = result.boss;
    spawned += result.events
      .filter((event) => event.type === "reinforcement")
      .reduce((total, event) => total + event.count, 0);
  }
  assert.ok(spawned <= encounter.reinforcementCap);
  assert.ok(spawned <= BOSS_CAPS.maxReinforcements);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
