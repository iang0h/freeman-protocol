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
