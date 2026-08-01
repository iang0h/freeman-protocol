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

test("rejects unsafe client action identifiers at the protocol boundary", async () => {
  const { parseClientMessage } = await import("../app/game/co-op-protocol.mjs");

  assert.equal(parseClientMessage({
    type: "action",
    sequence: 1,
    action: "shoot",
    targetId: "target!",
  }), null);
  assert.equal(parseClientMessage({
    type: "action",
    sequence: 1,
    action: "recruit",
    agentId: "a".repeat(65),
  }), null);
  assert.deepEqual(parseClientMessage({
    type: "action",
    sequence: 1,
    action: "shoot",
    targetId: "enemy_01",
    agentId: "agent-01",
  }), {
    type: "action",
    sequence: 1,
    action: "shoot",
    targetId: "enemy_01",
    agentId: "agent-01",
  });
});

test("parses all defined server messages and rejects malformed variants", async () => {
  const {
    createEmptyCoOpSnapshot,
    createMatchSummary,
    isServerMessage,
    parseServerMessage,
  } = await import("../app/game/co-op-protocol.mjs");
  const state = createEmptyCoOpSnapshot("test-seed");
  const summary = createMatchSummary({
    wave: { number: 4 },
    core: { health: 91 },
    warband: { agents: ["ion", "cipher"] },
    resourcesGathered: { compute: 12, components: 3, shards: 1 },
    players: [{ id: "p1", name: "Ian", contribution: { kills: 7 } }],
  });

  assert.deepEqual(parseServerMessage({
    type: "room",
    roomCode: "ABC123",
    players: [{ id: "p1", name: "Ian", ready: true, connected: true }],
  }), {
    type: "room",
    roomCode: "ABC123",
    players: [{ id: "p1", name: "Ian", ready: true, connected: true }],
  });
  assert.deepEqual(parseServerMessage({ type: "snapshot", snapshotId: 1, serverTick: 2, state }), {
    type: "snapshot",
    snapshotId: 1,
    serverTick: 2,
    state,
  });
  assert.deepEqual(parseServerMessage({ type: "event", eventId: 1, kind: "hit", payload: { target: "enemy_01" } }), {
    type: "event",
    eventId: 1,
    kind: "hit",
    payload: { target: "enemy_01" },
  });
  assert.deepEqual(parseServerMessage({ type: "error", code: "ROOM_FULL", message: "Room is full" }), {
    type: "error",
    code: "ROOM_FULL",
    message: "Room is full",
  });
  assert.deepEqual(parseServerMessage({ type: "ended", result: "victory", summary }), {
    type: "ended",
    result: "victory",
    summary,
  });
  assert.equal(parseServerMessage({ type: "event", eventId: 1, kind: "hack", payload: {} }), null);
  assert.equal(parseServerMessage({ type: "room", roomCode: "bad", players: [] }), null);
  assert.equal(parseServerMessage({ type: "snapshot", snapshotId: 1, serverTick: 2, state: {} }), null);
  assert.equal(parseServerMessage({ type: "ended", result: "abandoned", summary: {} }), null);
  assert.equal(isServerMessage({ type: "ended", result: "abandoned", summary }), true);
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

test("canonicalizes nested identifiers and keeps constructor output server-valid", async () => {
  const {
    createEmptyCoOpSnapshot,
    createMatchSummary,
    isServerMessage,
    parseServerMessage,
  } = await import("../app/game/co-op-protocol.mjs");
  const snapshot = JSON.parse(JSON.stringify(createEmptyCoOpSnapshot("x".repeat(80))));
  snapshot.players[0] = {
    ...snapshot.players[0],
    id: " p1 ",
    name: "Ian",
    connected: true,
  };
  snapshot.warband.agents = [" agent-01 "];
  const parsedSnapshot = parseServerMessage({ type: "snapshot", snapshotId: 1, serverTick: 2, state: snapshot });

  assert.equal(parsedSnapshot.state.seed.length, 64);
  assert.equal(parsedSnapshot.state.players[0].id, "p1");
  assert.deepEqual(parsedSnapshot.state.warband.agents, ["agent-01"]);
  assert.equal(isServerMessage({ type: "snapshot", snapshotId: 1, serverTick: 2, state: createEmptyCoOpSnapshot("x".repeat(80)) }), true);

  const summary = createMatchSummary({
    wave: { number: Number.MAX_VALUE },
    core: { health: Number.MAX_VALUE },
    warband: { agents: Array.from({ length: 12 }, (_, index) => `agent-${index}`) },
    resourcesGathered: { compute: Number.MAX_VALUE, components: 1, shards: 2 },
    players: [{ id: " p1 ", name: " Ian ", contribution: { kills: Number.MAX_VALUE, "bad key": 3 } }],
  });

  assert.equal(summary.players[0].id, "p1");
  assert.equal(summary.players[0].name, "Ian");
  assert.equal(summary.agentsRecruited, 8);
  assert.equal(isServerMessage({ type: "ended", result: "victory", summary }), true);
});

test("starts only a two-player ready room without mutating earlier states", async () => {
  const { createRoom, joinRoom, setPlayerReady, startRoom } = await import("../app/game/co-op-room.mjs");
  const created = createRoom({ roomCode: "ABC123", seed: "test-seed" });
  const withHost = joinRoom(created, { id: "p1", name: "Host" });
  const withGuest = joinRoom(withHost, { id: "p2", name: "Guest" });
  const ready = setPlayerReady(setPlayerReady(withGuest, "p1", true), "p2", true);
  const started = startRoom(ready);

  assert.equal(created.phase, "waiting");
  assert.equal(withHost.players.filter((player) => player.id).length, 1);
  assert.equal(started.phase, "playing");
  assert.equal(started.wave.status, "playing");
});

test("caps rooms at two players and reports lifecycle validation errors", async () => {
  const { createRoom, joinRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed" });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });

  assert.throws(() => joinRoom(room, { id: "p3", name: "Extra" }), /ROOM_FULL/);
  assert.equal(room.players.filter((player) => player.id).length, 2);
});

test("applies shared spending atomically and rejects duplicate action sequences", async () => {
  const { applyClientMessage, createRoom, joinRoom, setPlayerReady, startRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed", resources: { compute: 80 } });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  room = startRoom(setPlayerReady(setPlayerReady(room, "p1", true), "p2", true));

  const first = applyClientMessage(room, "p1", { type: "action", sequence: 1, action: "build-sentry" });
  assert.equal(first.error, null);
  assert.equal(first.room.resources.compute, 0);
  assert.equal(first.room.sentries.length, 1);

  const duplicate = applyClientMessage(first.room, "p1", { type: "action", sequence: 1, action: "build-sentry" });
  assert.equal(duplicate.error.code, "DUPLICATE_SEQUENCE");
  assert.strictEqual(duplicate.room, first.room);

  const unaffordable = applyClientMessage(first.room, "p2", { type: "action", sequence: 2, action: "build-sentry" });
  assert.equal(unaffordable.error.code, "INSUFFICIENT_RESOURCES");
  assert.equal(unaffordable.room.resources.compute, 0);
  assert.equal(unaffordable.room.sentries.length, 1);
});

test("produces monotonically numbered immutable snapshots", async () => {
  const { createRoom, getSnapshot, joinRoom, setPlayerReady, startRoom, tickRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed" });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  room = startRoom(setPlayerReady(setPlayerReady(room, "p1", true), "p2", true));
  const before = getSnapshot(room);
  const ticked = tickRoom(room, 50);
  const after = getSnapshot(ticked);

  assert.equal(before.snapshotId, 0);
  assert.equal(after.snapshotId, 1);
  assert.ok(Object.isFrozen(after));
  assert.equal(room.snapshotId, 0);
});

test("preserves a disconnected player for a thirty-second reconnect grace period", async () => {
  const { createRoom, disconnectPlayer, joinRoom, reconnectPlayer } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed" });
  room = joinRoom(room, { id: "p1", name: "Host" });
  const disconnected = disconnectPlayer(room, "p1", 1_000);

  assert.equal(disconnected.players[0].connected, false);
  assert.equal(disconnected.disconnectDeadlines.p1, 31_000);
  assert.equal(reconnectPlayer(disconnected, "p1", 31_000).players[0].connected, true);
  assert.throws(() => reconnectPlayer(disconnected, "p1", 31_001), /RECONNECT_EXPIRED/);
});

test("keeps enemy defeat, loot, wave transitions, and shared resources authoritative", async () => {
  const { applyClientMessage, createRoom, getSnapshot, joinRoom, setPlayerReady, startRoom, tickRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({
    roomCode: "ABC123",
    seed: "test-seed",
    enemies: [{ id: "enemy-1", kind: "virus", health: 10, maxHealth: 10, x: 0, y: 0, loot: { type: "component", value: 2 } }],
  });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  room = startRoom(setPlayerReady(setPlayerReady(room, "p1", true), "p2", true));
  const shot = applyClientMessage(room, "p1", { type: "action", sequence: 1, action: "shoot", targetId: "enemy-1" });
  const afterLoot = tickRoom(shot.room, 1);
  const snapshot = getSnapshot(afterLoot);

  assert.equal(shot.room.enemies.length, 0);
  assert.equal(afterLoot.resources.components, 2);
  assert.equal(snapshot.state.resources.components, 2);
  assert.equal(afterLoot.wave.status, "intermission");

  const nextWave = tickRoom(afterLoot, 3_000);
  assert.equal(nextWave.wave.number, 2);
  assert.equal(nextWave.wave.status, "playing");
  assert.ok(nextWave.enemies.length > 0);
});

test("starts and advances deterministic waves without injected enemies", async () => {
  const { createRoom, joinRoom, setPlayerReady, startRoom, tickRoom } = await import("../app/game/co-op-room.mjs");
  const readyRoom = (seed) => {
    let room = createRoom({ roomCode: "ABC123", seed });
    room = joinRoom(room, { id: "p1", name: "Host" });
    room = joinRoom(room, { id: "p2", name: "Guest" });
    return setPlayerReady(setPlayerReady(room, "p1", true), "p2", true);
  };
  const started = startRoom(readyRoom("test-seed"));
  const repeated = startRoom(readyRoom("test-seed"));

  assert.ok(started.enemies.length > 0);
  assert.deepEqual(started.enemies, repeated.enemies);
  const cleared = { ...started, enemies: [], wave: { ...started.wave, status: "intermission", intermissionRemainingMs: 1 } };
  const nextWave = tickRoom(cleared, 1);
  assert.equal(nextWave.wave.number, 2);
  assert.ok(nextWave.enemies.length > 0);
});

test("serializes immutable authoritative world runtime in snapshots", async () => {
  const { createRoom, getSnapshot, joinRoom, setPlayerReady, startRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed" });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  room = startRoom(setPlayerReady(setPlayerReady(room, "p1", true), "p2", true));
  const snapshot = getSnapshot({
    ...room,
    loot: [{ id: "loot-1", type: "component", value: 2, x: 0, y: 0 }],
    sentries: [{ id: "sentry-1", x: 4.8, y: 0, health: 100, maxHealth: 100 }],
    boss: { id: "boss-1", kind: "warboss", hp: 100, maxHp: 100, x: 0, y: 0, scheduled: true },
    subAgents: [{ id: "subagent-kairos-1", parentId: "kairos", role: "defend", remainingMs: 1_000 }],
  });

  assert.equal(snapshot.state.enemies.length, room.enemies.length);
  assert.deepEqual(snapshot.state.loot, [{ id: "loot-1", type: "component", value: 2, x: 0, y: 0 }]);
  assert.equal(snapshot.state.sentries[0].id, "sentry-1");
  assert.equal(snapshot.state.boss.id, "boss-1");
  assert.equal(snapshot.state.subAgents[0].id, "subagent-kairos-1");
  assert.ok(Object.isFrozen(snapshot.state.enemies));
});

test("autonomous network executes a selected sentry build action", async () => {
  const { applyClientMessage, createRoom, joinRoom, setPlayerReady, startRoom, tickRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed", resources: { compute: 80 } });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  room = startRoom(setPlayerReady(setPlayerReady(room, "p1", true), "p2", true));
  room = applyClientMessage(room, "p1", { type: "priority", priority: "focus" }).room;
  const ticked = tickRoom(room, 3_500);

  assert.equal(ticked.sentries.length, 1);
  assert.equal(ticked.resources.compute, 0);
});

test("rejects unowned reserve agents and stale or pre-game input", async () => {
  const { applyClientMessage, createRoom, joinRoom, setPlayerReady, startRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed", resources: { components: 3, shards: 3 } });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  const input = { type: "input", sequence: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 1 };

  assert.equal(applyClientMessage(room, "p1", input).error.code, "ROOM_NOT_PLAYING");
  room = startRoom(setPlayerReady(setPlayerReady(room, "p1", true), "p2", true));
  const accepted = applyClientMessage(room, "p1", input);
  assert.equal(accepted.error, null);
  assert.equal(applyClientMessage(accepted.room, "p1", input).error.code, "STALE_SEQUENCE");
  const reserve = applyClientMessage(accepted.room, "p1", { type: "action", sequence: 2, action: "deploy-reserve", agentId: "kairos" });
  assert.equal(reserve.error.code, "UNOWNED_AGENT");
  assert.strictEqual(reserve.room, accepted.room);
});
