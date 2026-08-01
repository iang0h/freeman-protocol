import assert from "node:assert/strict";
import test from "node:test";

test("normalizes room codes and display names", async () => {
  const rules = await import("../app/game/co-op-protocol.mjs");

  assert.equal(rules.createRoomCode(() => 0), "AAAAAA");
  assert.match(rules.createRoomCode(() => 0.999999), /^[A-Z0-9]{6}$/);
  assert.equal(rules.normalizeDisplayName("  Ian  "), "Ian");
  assert.equal(rules.normalizeDisplayName("x".repeat(40)).length, 20);
  assert.equal(rules.normalizeDisplayName("<>"), "Guest");
});

test("parses only valid client messages without mutating input", async () => {
  const { CO_OP_PROTOCOL_VERSION, isClientMessage, parseClientMessage } = await import(
    "../app/game/co-op-protocol.mjs"
  );
  const input = {
    type: "input",
    sequence: 1,
    moveX: 8,
    moveY: -8,
    aimX: 0.5,
    aimY: -0.5,
  };

  assert.equal(parseClientMessage({ type: "action", action: "hack" }), null);
  assert.equal(
    parseClientMessage({ type: "input", sequence: 1, moveX: Infinity, moveY: 0, aimX: 0, aimY: 0 }),
    null,
  );
  assert.deepEqual(parseClientMessage(input), {
    type: "input",
    sequence: 1,
    moveX: 1,
    moveY: -1,
    aimX: 0.5,
    aimY: -0.5,
  });
  assert.deepEqual(input, {
    type: "input",
    sequence: 1,
    moveX: 8,
    moveY: -8,
    aimX: 0.5,
    aimY: -0.5,
  });
  assert.deepEqual(parseClientMessage(JSON.stringify({
    type: "hello",
    protocolVersion: CO_OP_PROTOCOL_VERSION,
    displayName: "  Ian  ",
  })), {
    type: "hello",
    protocolVersion: CO_OP_PROTOCOL_VERSION,
    displayName: "Ian",
  });
  assert.equal(isClientMessage({ type: "unknown" }), false);
  assert.equal(isClientMessage({ type: "ready", ready: true }), true);
});

test("creates an immutable empty shared co-op snapshot and match summary", async () => {
  const { createEmptyCoOpSnapshot, createMatchSummary } = await import(
    "../app/game/co-op-protocol.mjs"
  );
  const snapshot = createEmptyCoOpSnapshot("test-seed");

  assert.equal(snapshot.seed, "test-seed");
  assert.equal(snapshot.players.length, 2);
  assert.deepEqual(snapshot.core, { health: 180, maxHealth: 180 });
  assert.deepEqual(snapshot.resources, {
    compute: 0,
    components: 0,
    shards: 0,
    repairKits: 0,
    modules: 0,
  });
  assert.deepEqual(snapshot.warband, { agents: [], maxAgents: 8, priority: "follow" });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.players));
  assert.deepEqual(createMatchSummary({
    wave: { number: 4 },
    core: { health: 91 },
    warband: { agents: ["ion", "cipher"] },
    resourcesGathered: { compute: 12, components: 3, shards: 1 },
    players: [{ id: "p1", name: "Ian", contribution: { kills: 7 } }],
  }), {
    wavesSurvived: 3,
    coreHealth: 91,
    agentsRecruited: 2,
    resourcesGathered: { compute: 12, components: 3, shards: 1 },
    players: [{ id: "p1", name: "Ian", contribution: { kills: 7 } }],
  });
});
