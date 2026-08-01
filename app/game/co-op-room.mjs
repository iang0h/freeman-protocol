import {
  createMatchSummary,
  createEmptyCoOpSnapshot,
  normalizeDisplayName,
  parseClientMessage,
  parseServerMessage,
} from "./co-op-protocol.mjs";
import { applyCoOpAction, startCoOpSimulation, tickCoOpSimulation } from "./co-op-simulation.mjs";

export const RECONNECT_GRACE_MS = 30_000;
export const ROOM_EVENT_LIMIT = 64;

const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
const clone = (value) => Array.isArray(value)
  ? value.map(clone)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
    : value;
const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freeze(item);
  return value;
};
const error = (code, message) => freeze({ code, message });
const result = (room, failure = null) => freeze({ room, error: failure });

function normalizedResources(resources = {}) {
  const source = resources && typeof resources === "object" ? resources : {};
  return Object.fromEntries(["compute", "components", "shards", "repairKits", "modules"].map((key) => [
    key,
    Math.max(0, Number.isFinite(source[key]) ? source[key] : 0),
  ]));
}

function playerSlot(player, slot) {
  return {
    slot,
    id: null,
    name: null,
    connected: false,
    ready: false,
    operator: { health: 100, maxHealth: 100, x: 0, y: 0, aimX: 0, aimY: 1 },
    contribution: {},
    input: { moveX: 0, moveY: 0, aimX: 0, aimY: 1 },
    shootCooldownLeftMs: 0,
  };
}

function playerIndex(room, playerId) {
  return room.players.findIndex((player) => player.id === playerId);
}

function cloneRoom(room) {
  return clone(room);
}

function assertRoom(room) {
  if (!room || typeof room !== "object") throw new Error("INVALID_ROOM");
}

function eventSequence(room) {
  if (Number.isSafeInteger(room.nextEventId) && room.nextEventId >= 1) return room.nextEventId;
  return Math.max(0, ...(room.events ?? []).map((event) => Number.isSafeInteger(event?.eventId) ? event.eventId : 0)) + 1;
}

function runtimeHealth(entity) {
  return Math.max(0, Number.isFinite(entity?.health) ? entity.health : Number.isFinite(entity?.hp) ? entity.hp : 0);
}

function bossHealth(boss) {
  return Math.max(0, Number.isFinite(boss?.hp) ? boss.hp : Number.isFinite(boss?.health) ? boss.health : 0);
}

export function appendRoomEvent(room, kind, payload = {}) {
  assertRoom(room);
  const eventId = eventSequence(room);
  const event = parseServerMessage({ type: "event", eventId, kind, payload });
  if (!event) throw new Error("INVALID_ROOM_EVENT");
  const next = cloneRoom(room);
  next.events = [...(next.events ?? []), event].slice(-ROOM_EVENT_LIMIT);
  next.nextEventId = eventId + 1;
  return freeze(next);
}

export function getEventMessages(room, afterEventId = 0) {
  assertRoom(room);
  if (!Number.isSafeInteger(afterEventId) || afterEventId < 0) throw new Error("INVALID_EVENT_ID");
  return freeze((room.events ?? []).filter((event) => event.eventId > afterEventId).map(clone));
}

function appendCombatEvents(before, after, sourceId, action = "simulation") {
  const afterById = new Map((after.enemies ?? []).map((enemy) => [enemy.id, enemy]));
  let next = after;
  for (const enemy of before.enemies ?? []) {
    const current = afterById.get(enemy.id);
    if (!current) {
      next = appendRoomEvent(next, "kill", { sourceId, targetId: enemy.id, action });
    } else if (runtimeHealth(current) < runtimeHealth(enemy)) {
      next = appendRoomEvent(next, "hit", { sourceId, targetId: enemy.id, action });
    }
  }
  return next;
}

function appendSimulationEvents(before, after) {
  let next = appendCombatEvents(before, after, "network");
  const remainingLoot = new Set((after.loot ?? []).map((loot) => loot.id));
  for (const loot of before.loot ?? []) {
    if (!remainingLoot.has(loot.id)) next = appendRoomEvent(next, "loot", { lootId: loot.id, lootType: loot.type });
  }
  if (before.wave?.number !== after.wave?.number || before.wave?.status !== after.wave?.status) {
    next = appendRoomEvent(next, "wave", { number: after.wave?.number, status: after.wave?.status });
  }
  if (!before.boss && after.boss?.scheduled) {
    next = appendRoomEvent(next, "boss", { bossId: after.boss.id, state: "arrived", wave: after.wave?.number });
  } else if (before.boss && (
    !after.boss
    || (bossHealth(before.boss) > 0 && bossHealth(after.boss) <= 0)
    || (before.boss.rewardClaimed !== true && after.boss?.rewardClaimed === true)
  )) {
    next = appendRoomEvent(next, "boss", { bossId: before.boss.id, state: "defeated", wave: after.wave?.number });
  }
  return next;
}

export function createRoom(options = {}) {
  const roomCode = typeof options.roomCode === "string" ? options.roomCode.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) throw new Error("INVALID_ROOM_CODE");
  const snapshot = createEmptyCoOpSnapshot(options.seed);
  return freeze({
    phase: "waiting",
    roomCode,
    hostPlayerId: null,
    seed: snapshot.seed,
    players: snapshot.players.map((player) => playerSlot(player, player.slot)),
    core: clone(snapshot.core),
    resources: normalizedResources({ ...snapshot.resources, ...options.resources }),
    warband: clone(snapshot.warband),
    wave: clone(snapshot.wave),
    priority: "follow",
    snapshotId: 0,
    serverTick: 0,
    lastActionByPlayer: {},
    lastInputByPlayer: {},
    disconnectDeadlines: {},
    enemies: Array.isArray(options.enemies) ? clone(options.enemies) : [],
    loot: [],
    sentries: [],
    blockers: Array.isArray(options.blockers) ? clone(options.blockers) : [],
    subAgents: [],
    autonomousElapsedMs: 0,
    boss: null,
    result: null,
    events: [],
    nextEventId: 1,
  });
}

export function joinRoom(room, player) {
  assertRoom(room);
  const id = identifier(player?.id);
  if (!id) throw new Error("INVALID_PLAYER_ID");
  if (playerIndex(room, id) >= 0) throw new Error("DUPLICATE_PLAYER");
  const slot = room.players.findIndex((entry) => entry.id === null);
  if (slot < 0) throw new Error("ROOM_FULL");
  if (room.phase === "playing" || room.phase === "ended") throw new Error("ROOM_CLOSED");
  const next = cloneRoom(room);
  next.players[slot] = {
    ...next.players[slot],
    id,
    name: normalizeDisplayName(player?.name),
    connected: true,
    ready: false,
  };
  if (!next.hostPlayerId) next.hostPlayerId = id;
  if (next.players.every((entry) => entry.id !== null)) next.phase = "ready";
  return freeze(next);
}

export function setPlayerReady(room, playerId, ready) {
  assertRoom(room);
  const index = playerIndex(room, playerId);
  if (index < 0) throw new Error("UNKNOWN_PLAYER");
  if (typeof ready !== "boolean") throw new Error("INVALID_READY_STATE");
  if (room.phase === "playing" || room.phase === "ended") throw new Error("ROOM_CLOSED");
  const next = cloneRoom(room);
  next.players[index].ready = ready;
  next.phase = next.players.every((entry) => entry.id !== null) ? "ready" : "waiting";
  return freeze(next);
}

export function startRoom(room) {
  assertRoom(room);
  if (room.phase !== "ready" || !room.players.every((player) => player.id && player.ready && player.connected)) {
    throw new Error("ROOM_NOT_READY");
  }
  const next = cloneRoom(room);
  next.phase = "playing";
  next.wave = { ...next.wave, status: "playing", elapsedMs: 0 };
  return appendRoomEvent(startCoOpSimulation(next), "wave", { number: next.wave.number, status: "playing" });
}

export function applyClientMessage(room, playerId, message) {
  assertRoom(room);
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return result(room, error("UNKNOWN_PLAYER", "Player is not in this room"));
  if (!player.connected) return result(room, error("PLAYER_DISCONNECTED", "Player must reconnect first"));
  const parsed = parseClientMessage(message);
  if (!parsed) return result(room, error("INVALID_MESSAGE", "Client message failed protocol validation"));

  if (parsed.type === "ready") {
    try {
      return result(setPlayerReady(room, playerId, parsed.ready));
    } catch (failure) {
      return result(room, error("ROOM_CLOSED", failure.message));
    }
  }
  if (parsed.type === "start") {
    if (room.hostPlayerId !== playerId) return result(room, error("HOST_ONLY", "Only the host can start the room"));
    try {
      return result(startRoom(room));
    } catch (failure) {
      return result(room, error("ROOM_NOT_READY", failure.message));
    }
  }
  if (parsed.type === "input") {
    if (room.phase !== "playing") return result(room, error("ROOM_NOT_PLAYING", "The room has not started"));
    const watermark = room.lastInputByPlayer[playerId] ?? -1;
    if (parsed.sequence <= watermark) return result(room, error("STALE_SEQUENCE", "Input sequence was already processed"));
    const next = cloneRoom(room);
    const index = playerIndex(next, playerId);
    next.players[index].input = { moveX: parsed.moveX, moveY: parsed.moveY, aimX: parsed.aimX, aimY: parsed.aimY };
    next.lastInputByPlayer[playerId] = parsed.sequence;
    return result(freeze(next));
  }
  if (parsed.type === "priority") {
    if (room.phase !== "playing") return result(room, error("ROOM_NOT_PLAYING", "The room has not started"));
    const next = cloneRoom(room);
    next.priority = parsed.priority;
    next.warband.priority = parsed.priority;
    return result(freeze(next));
  }
  if (parsed.type !== "action") return result(room, error("UNSUPPORTED_MESSAGE", "Message is not valid in a room"));
  const watermark = room.lastActionByPlayer[playerId] ?? -1;
  if (parsed.sequence <= watermark) return result(room, error("DUPLICATE_SEQUENCE", "Action sequence was already processed"));
  const applied = applyCoOpAction(room, playerId, parsed);
  if (applied.error) return result(room, freeze(applied.error));
  let next = cloneRoom(applied.state);
  next.lastActionByPlayer[playerId] = parsed.sequence;
  if (["shoot", "emp"].includes(parsed.action)) {
    next = appendCombatEvents(room, next, playerId, parsed.action);
  } else {
    next = appendRoomEvent(next, "agent-task", {
      playerId,
      task: parsed.action,
      ...(parsed.targetId ? { targetId: parsed.targetId } : {}),
      ...(parsed.agentId ? { agentId: parsed.agentId } : {}),
    });
  }
  return result(freeze(next));
}

export function tickRoom(room, elapsedMs) {
  assertRoom(room);
  let next = tickCoOpSimulation(room, elapsedMs);
  next.snapshotId = room.snapshotId + 1;
  next.serverTick = room.serverTick + 1;
  next = appendSimulationEvents(room, next);
  return freeze(next);
}

export function disconnectPlayer(room, playerId, now = Date.now()) {
  assertRoom(room);
  const index = playerIndex(room, playerId);
  if (index < 0) throw new Error("UNKNOWN_PLAYER");
  if (!Number.isFinite(now)) throw new Error("INVALID_TIME");
  const next = cloneRoom(room);
  next.players[index].connected = false;
  next.players[index].input = {
    moveX: 0,
    moveY: 0,
    aimX: next.players[index].input?.aimX ?? next.players[index].operator?.aimX ?? 0,
    aimY: next.players[index].input?.aimY ?? next.players[index].operator?.aimY ?? 1,
  };
  next.disconnectDeadlines[playerId] = now + RECONNECT_GRACE_MS;
  return freeze(next);
}

export function getNextDisconnectDeadline(room) {
  assertRoom(room);
  const deadlines = room.players
    .filter((player) => player.id && !player.connected)
    .map((player) => room.disconnectDeadlines[player.id])
    .filter(Number.isFinite);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

export function getExpiredDisconnectedPlayerIds(room, now = Date.now()) {
  assertRoom(room);
  if (!Number.isFinite(now)) throw new Error("INVALID_TIME");
  return freeze(room.players
    .filter((player) => player.id && !player.connected && Number.isFinite(room.disconnectDeadlines[player.id]) && now >= room.disconnectDeadlines[player.id])
    .map((player) => player.id));
}

export function endRoom(room, matchResult = "abandoned") {
  assertRoom(room);
  if (!["victory", "defeat", "abandoned"].includes(matchResult)) throw new Error("INVALID_MATCH_RESULT");
  const next = cloneRoom(room);
  next.phase = "ended";
  next.result = matchResult;
  next.wave = { ...next.wave, status: "ended" };
  next.players = next.players.map((player) => ({
    ...player,
    input: { moveX: 0, moveY: 0, aimX: player.input?.aimX ?? 0, aimY: player.input?.aimY ?? 1 },
  }));
  return freeze(next);
}

export function getEndedMessage(room) {
  assertRoom(room);
  if (room.phase !== "ended") throw new Error("ROOM_NOT_ENDED");
  const message = parseServerMessage({
    type: "ended",
    result: room.result,
    summary: createMatchSummary(room),
  });
  if (!message) throw new Error("INVALID_MATCH_SUMMARY");
  return message;
}

export function reconnectPlayer(room, playerId, now = Date.now()) {
  assertRoom(room);
  const index = playerIndex(room, playerId);
  if (index < 0) throw new Error("UNKNOWN_PLAYER");
  const deadline = room.disconnectDeadlines[playerId];
  if (!Number.isFinite(deadline) || !Number.isFinite(now) || now >= deadline) throw new Error("RECONNECT_EXPIRED");
  const next = cloneRoom(room);
  next.players[index].connected = true;
  delete next.disconnectDeadlines[playerId];
  return freeze(next);
}

export function getRoomMessage(room) {
  assertRoom(room);
  return parseServerMessage({
    type: "room",
    roomCode: room.roomCode,
    ...(room.hostPlayerId ? { hostPlayerId: room.hostPlayerId } : {}),
    players: room.players.filter((player) => player.id).map((player) => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
    })),
  });
}

export function getSnapshot(room) {
  assertRoom(room);
  return parseServerMessage({
    type: "snapshot",
    snapshotId: room.snapshotId,
    serverTick: room.serverTick,
    state: {
      seed: room.seed,
      players: room.players.map((player, slot) => ({
        slot,
        id: player.id,
        name: player.name,
        connected: player.connected,
        ready: player.ready,
        operator: player.operator,
      })),
      core: room.core,
      resources: room.resources,
      warband: { agents: room.warband.agents, maxAgents: room.warband.maxAgents, priority: room.priority },
      wave: { number: room.wave.number, status: room.wave.status, elapsedMs: room.wave.elapsedMs },
      enemies: room.enemies.map((enemy) => ({
        id: enemy.id,
        kind: enemy.kind ?? enemy.type ?? "virus",
        health: enemy.health ?? enemy.hp,
        maxHealth: enemy.maxHealth ?? enemy.maxHp ?? enemy.health ?? enemy.hp,
        x: enemy.x,
        y: enemy.y ?? enemy.z,
        armored: enemy.armored === true,
      })),
      loot: room.loot,
      sentries: room.sentries.map((sentry) => ({ ...sentry, y: sentry.y ?? sentry.z })),
      boss: room.boss ? {
        id: room.boss.id,
        kind: room.boss.kind,
        health: room.boss.health ?? room.boss.hp,
        maxHealth: room.boss.maxHealth ?? room.boss.maxHp,
        x: room.boss.x ?? 0,
        y: room.boss.y ?? room.boss.z ?? 0,
        scheduled: room.boss.scheduled === true,
      } : null,
      subAgents: room.subAgents,
    },
  });
}
