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
  EVOLUTIONS,
  applyUpgradeStack,
  getUpgradeDraft,
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
import { normalizeStickInput } from "../app/game/input-rules.mjs";
import {
  LOOT_TYPES,
  applyLootPickup,
  canCollectLoot,
  rollLootDrop,
} from "../app/game/loot-rules.mjs";

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
    recruited: { kairos: true },
    evolutions: {},
  };
  const purchased = purchaseEvolution(state, "kairos", "cryo-mesh");
  assert.equal(purchased.compute, 130);
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
    "command",
    "observe",
    "complete",
    "skipped",
  ]);
  assert.equal(advanceTutorial("move", "enemy-defeated"), "move");
  assert.equal(advanceTutorial("move", "movement-complete"), "shoot");
  assert.equal(advanceTutorial("shoot", "training-cleared"), "recruit");
  assert.equal(advanceTutorial("recruit", "kairos-recruited"), "command");
  assert.equal(advanceTutorial("command", "guard-selected"), "observe");
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
  assert.equal(advanceTutorial(step, "kairos-recruited"), "command");
  assert.equal(advanceTutorial("command", "guard-selected"), "observe");
});

test("tutorial action gates only allow the required recruitment and let GUARD CORE be restored during observe", () => {
  assert.equal(canPerformTutorialAction("move", "recruit-kairos"), false);
  assert.equal(canPerformTutorialAction("recruit", "recruit-kairos"), true);
  assert.equal(canPerformTutorialAction("recruit", "recruit-other"), false);
  assert.equal(canPerformTutorialAction("observe", "recruit-kairos"), false);
  assert.equal(canPerformTutorialAction("shoot", "guard-core"), false);
  assert.equal(canPerformTutorialAction("command", "guard-core"), true);
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
    type: LOOT_TYPES.component,
    x: -0.5,
    y: 0.5,
    value: 2,
  });
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
    applyLootPickup(state, { type: LOOT_TYPES.repair, value: 25 }),
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
    type: LOOT_TYPES.component,
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

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
