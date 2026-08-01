import {
  createEmptyCoOpSnapshot,
  normalizeDisplayName,
  parseClientMessage,
  parseServerMessage,
} from "./co-op-protocol.mjs";
import { applyCoOpAction, startCoOpSimulation, tickCoOpSimulation } from "./co-op-simulation.mjs";

export const RECONNECT_GRACE_MS = 30_000;

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

export function createRoom(options = {}) {
  const roomCode = typeof options.roomCode === "string" ? options.roomCode.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) throw new Error("INVALID_ROOM_CODE");
  const snapshot = createEmptyCoOpSnapshot(options.seed);
  return freeze({
    phase: "waiting",
    roomCode,
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
  return freeze(startCoOpSimulation(next));
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
  const next = cloneRoom(applied.state);
  next.lastActionByPlayer[playerId] = parsed.sequence;
  return result(freeze(next));
}

export function tickRoom(room, elapsedMs) {
  assertRoom(room);
  const next = tickCoOpSimulation(room, elapsedMs);
  next.snapshotId = room.snapshotId + 1;
  next.serverTick = room.serverTick + 1;
  return freeze(next);
}

export function disconnectPlayer(room, playerId, now = Date.now()) {
  assertRoom(room);
  const index = playerIndex(room, playerId);
  if (index < 0) throw new Error("UNKNOWN_PLAYER");
  if (!Number.isFinite(now)) throw new Error("INVALID_TIME");
  const next = cloneRoom(room);
  next.players[index].connected = false;
  next.disconnectDeadlines[playerId] = now + RECONNECT_GRACE_MS;
  return freeze(next);
}

export function reconnectPlayer(room, playerId, now = Date.now()) {
  assertRoom(room);
  const index = playerIndex(room, playerId);
  if (index < 0) throw new Error("UNKNOWN_PLAYER");
  const deadline = room.disconnectDeadlines[playerId];
  if (!Number.isFinite(deadline) || !Number.isFinite(now) || now > deadline) throw new Error("RECONNECT_EXPIRED");
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
