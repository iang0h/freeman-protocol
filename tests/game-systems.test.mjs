import assert from "node:assert/strict";
import test from "node:test";

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
  rollLootDrop,
} from "../app/game/loot-rules.mjs";
import {
  AGENT_ROLES,
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
  canFireEmp,
  createEmpState,
  fireEmp,
  getEmpUpgrade,
  tickEmp,
} from "../app/game/emp-rules.mjs";

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
  assert.equal(fired.damage, 43);
  assert.deepEqual(fired.state, {
    charge: 0,
    maxCharge: 100,
    cooldownLeftMs: 12000,
    cooldownMs: 12000,
  });

  const ticking = tickEmp(fired.state, 4500);
  assert.deepEqual(ticking, {
    charge: 0,
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
  assert.equal(EVOLUTIONS.covenant[0].coreShield, 30);
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
  assert.equal(PLAYER_ARMORS.relay.bonuses.empMultiplier, 1.4);
  assert.equal(PLAYER_ARMORS.relay.bonuses.healingMultiplier, 1.25);
});

test("each agent has a component-funded identity upgrade", () => {
  assert.equal(AGENT_COMPONENT_UPGRADES.kairos[0].id, "stasis-array");
  assert.equal(AGENT_COMPONENT_UPGRADES.kira[0].id, "hunter-core");
  assert.equal(AGENT_COMPONENT_UPGRADES.forge[0].id, "breach-ammo");
  assert.equal(AGENT_COMPONENT_UPGRADES.covenant[0].id, "nanite-reserve");
  for (const upgrades of Object.values(AGENT_COMPONENT_UPGRADES)) {
    assert.ok(upgrades[0].cost > 0);
    assert.ok(Object.keys(upgrades[0].bonuses).length > 0);
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

test("repair loot clamps player and core health at their maxima", () => {
  const state = {
    health: 92,
    maxHealth: 100,
    coreHealth: 174,
    maxCoreHealth: 180,
    components: 0,
    upgradeShards: 0,
  };
  assert.deepEqual(
    applyLootPickup(state, { type: LOOT_TYPES.repair.id, value: 25 }),
    { ...state, health: 100, coreHealth: 180 },
  );
  assert.deepEqual(state, {
    health: 92,
    maxHealth: 100,
    coreHealth: 174,
    maxCoreHealth: 180,
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

test("temporary sub-agents are capped and cannot spawn recursively", () => {
  const agent = { id: "kairos", role: "assault" };
  const context = {
    enemyDensity: 6,
    activeSubAgents: 2,
    maxSubAgents: 3,
    subAgentLifetimeMs: 5_000,
  };
  assert.deepEqual(spawnTemporarySubAgent(agent, context), {
    id: "subagent-kairos-3",
    parentId: "kairos",
    role: "assault",
    remainingMs: 5_000,
    canSpawn: false,
  });
  assert.equal(
    spawnTemporarySubAgent(agent, { ...context, activeSubAgents: 3 }),
    null,
  );
  assert.equal(
    spawnTemporarySubAgent({ ...agent, canSpawn: false }, context),
    null,
  );
});

test("temporary sub-agent bounds normalize invalid context values", () => {
  const agent = { id: "kairos", role: "assault" };
  const improvisingContext = { enemyDensity: 6 };
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      activeSubAgents: 3,
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
    5_000,
  );
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      maxSubAgents: -1,
      subAgentLifetimeMs: 0,
    }).remainingMs,
    5_000,
  );
  assert.equal(
    spawnTemporarySubAgent(agent, {
      ...improvisingContext,
      maxSubAgents: 1.5,
    }).remainingMs,
    5_000,
  );
});

test("temporary sub-agent IDs remain unique after prior agents expire", () => {
  const agent = { id: "kairos", role: "assault" };
  const context = {
    enemyDensity: 6,
    maxSubAgents: 3,
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
      remainingMs: 5_000,
      maxLifetimeMs: 5_000,
      cooldownLeftMs: 0,
      canSpawn: false,
    },
    { attackTargetInRange: true },
    100,
  );

  assert.deepEqual(result.action, { type: "attack", damage: 8 });
  assert.equal(result.state.remainingMs, 4_900);
  assert.equal(result.state.cooldownLeftMs, 1_400);
  assert.equal(result.state.healthRatio, 0.98);
  assert.equal(result.expired, false);
});

test("support sub-agents recover the player and Core while buffing allies", () => {
  const result = tickTemporarySubAgent(
    {
      role: "support",
      remainingMs: 4_000,
      maxLifetimeMs: 5_000,
      cooldownLeftMs: 0,
      canSpawn: false,
    },
    { playerNeedsRepair: true, coreNeedsRepair: true },
    0,
  );

  assert.deepEqual(result.action, {
    type: "repair",
    playerHealing: 2,
    coreHealing: 2,
    allyCooldownReductionMs: 250,
  });
});

test("defense sub-agents intercept threats near the Core", () => {
  const result = tickTemporarySubAgent(
    {
      role: "defend",
      remainingMs: 3_000,
      maxLifetimeMs: 5_000,
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
      remainingMs: 5_000,
      maxLifetimeMs: 5_000,
      cooldownLeftMs: 900,
      canSpawn: false,
    },
    { attackTargetInRange: true },
    100,
  );

  assert.deepEqual(result.action, { type: "idle" });
  assert.equal(result.state.cooldownLeftMs, 800);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
