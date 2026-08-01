export const CO_OP_PROTOCOL_VERSION = 1;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_MAX_PLAYERS = 2;
export const CO_OP_IDENTIFIER_MAX_LENGTH = 64;

const ROOM_CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CLIENT_ACTIONS = new Set([
  "shoot",
  "emp",
  "repair",
  "recruit",
  "build-sentry",
  "deploy-reserve",
]);
const PRIORITIES = new Set(["follow", "guard", "focus"]);
const SERVER_EVENT_KINDS = new Set(["hit", "critical", "kill", "loot", "agent-task", "wave", "boss"]);
const MATCH_RESULTS = new Set(["victory", "defeat", "abandoned"]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isSequence(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function optionalIdentifier(value) {
  if (typeof value !== "string") return null;
  const identifier = value.trim();
  return identifier.length > 0
    && identifier.length <= CO_OP_IDENTIFIER_MAX_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(identifier)
    ? identifier
    : null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

export function createRoomCode(random = Math.random) {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const candidate = typeof random === "function" ? random() : 0;
    const index = clamp(Number.isFinite(candidate) ? Math.floor(candidate * ROOM_CODE_CHARACTERS.length) : 0, 0, ROOM_CODE_CHARACTERS.length - 1);
    return ROOM_CODE_CHARACTERS[index];
  }).join("");
}

export function normalizeDisplayName(value) {
  return String(value ?? "Guest")
    .trim()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .slice(0, 20) || "Guest";
}

export function parseClientMessage(value) {
  let message = value;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") return null;

  switch (message.type) {
    case "hello":
      if (message.protocolVersion !== CO_OP_PROTOCOL_VERSION || typeof message.displayName !== "string") return null;
      return deepFreeze({
        type: "hello",
        protocolVersion: CO_OP_PROTOCOL_VERSION,
        displayName: normalizeDisplayName(message.displayName),
      });
    case "ready":
      return typeof message.ready === "boolean" ? deepFreeze({ type: "ready", ready: message.ready }) : null;
    case "input":
      if (!isSequence(message.sequence) || ![message.moveX, message.moveY, message.aimX, message.aimY].every(isFiniteNumber)) return null;
      return deepFreeze({
        type: "input",
        sequence: message.sequence,
        moveX: clamp(message.moveX, -1, 1),
        moveY: clamp(message.moveY, -1, 1),
        aimX: clamp(message.aimX, -1, 1),
        aimY: clamp(message.aimY, -1, 1),
      });
    case "action": {
      if (!isSequence(message.sequence) || !CLIENT_ACTIONS.has(message.action)) return null;
      const targetId = optionalIdentifier(message.targetId);
      const agentId = optionalIdentifier(message.agentId);
      if ((message.targetId !== undefined && !targetId) || (message.agentId !== undefined && !agentId)) return null;
      return deepFreeze({
        type: "action",
        sequence: message.sequence,
        action: message.action,
        ...(targetId ? { targetId } : {}),
        ...(agentId ? { agentId } : {}),
      });
    }
    case "priority":
      return PRIORITIES.has(message.priority) ? deepFreeze({ type: "priority", priority: message.priority }) : null;
    case "resume":
      return isSequence(message.lastSnapshotId)
        ? deepFreeze({ type: "resume", lastSnapshotId: message.lastSnapshotId })
        : null;
    default:
      return null;
  }
}

export function isClientMessage(value) {
  return parseClientMessage(value) !== null;
}

export function parseServerMessage(value) {
  let message = value;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") return null;

  switch (message.type) {
    case "room": {
      if (typeof message.roomCode !== "string" || !/^[A-Z0-9]{6}$/.test(message.roomCode) || !Array.isArray(message.players) || message.players.length > ROOM_MAX_PLAYERS) return null;
      const players = message.players.map((player) => {
        if (!player || typeof player !== "object" || Array.isArray(player)) return null;
        const id = optionalIdentifier(player.id);
        if (!id || typeof player.name !== "string" || typeof player.ready !== "boolean" || typeof player.connected !== "boolean") return null;
        return { id, name: normalizeDisplayName(player.name), ready: player.ready, connected: player.connected };
      });
      return players.every(Boolean) ? deepFreeze({ type: "room", roomCode: message.roomCode, players }) : null;
    }
    case "snapshot":
      return isSequence(message.snapshotId) && isSequence(message.serverTick) && message.state && typeof message.state === "object" && !Array.isArray(message.state)
        ? deepFreeze({ type: "snapshot", snapshotId: message.snapshotId, serverTick: message.serverTick, state: cloneValue(message.state) })
        : null;
    case "event":
      return isSequence(message.eventId) && SERVER_EVENT_KINDS.has(message.kind) && message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? deepFreeze({ type: "event", eventId: message.eventId, kind: message.kind, payload: cloneValue(message.payload) })
        : null;
    case "error":
      return typeof message.code === "string" && message.code.trim() && typeof message.message === "string" && message.message.trim()
        ? deepFreeze({ type: "error", code: message.code.trim(), message: message.message.trim() })
        : null;
    case "ended":
      return MATCH_RESULTS.has(message.result) && message.summary && typeof message.summary === "object" && !Array.isArray(message.summary)
        ? deepFreeze({ type: "ended", result: message.result, summary: cloneValue(message.summary) })
        : null;
    default:
      return null;
  }
}

export function isServerMessage(value) {
  return parseServerMessage(value) !== null;
}

export function createEmptyCoOpSnapshot(seed) {
  return deepFreeze({
    seed: String(seed ?? ""),
    players: Array.from({ length: ROOM_MAX_PLAYERS }, (_, slot) => ({
      slot,
      id: null,
      name: null,
      connected: false,
      ready: false,
      operator: { health: 100, maxHealth: 100, x: 0, y: 0, aimX: 0, aimY: 1 },
    })),
    core: { health: 180, maxHealth: 180 },
    resources: { compute: 0, components: 0, shards: 0, repairKits: 0, modules: 0 },
    warband: { agents: [], maxAgents: 8, priority: "follow" },
    wave: { number: 1, status: "waiting", elapsedMs: 0 },
  });
}

export function createMatchSummary(state = {}) {
  const waveNumber = Number.isFinite(state?.wave?.number) ? state.wave.number : 1;
  const resources = state?.resourcesGathered ?? state?.resources ?? {};
  const summary = {
    wavesSurvived: Math.max(0, Number.isFinite(state?.wavesSurvived) ? state.wavesSurvived : Math.floor(waveNumber) - 1),
    coreHealth: Math.max(0, Number.isFinite(state?.core?.health) ? state.core.health : 0),
    agentsRecruited: Array.isArray(state?.warband?.agents) ? state.warband.agents.length : 0,
    resourcesGathered: {
      compute: Math.max(0, Number.isFinite(resources.compute) ? resources.compute : 0),
      components: Math.max(0, Number.isFinite(resources.components) ? resources.components : 0),
      shards: Math.max(0, Number.isFinite(resources.shards) ? resources.shards : 0),
    },
    players: Array.isArray(state?.players)
      ? state.players.filter((player) => player && typeof player === "object").map((player) => ({
        id: typeof player.id === "string" ? player.id : "",
        name: normalizeDisplayName(player.name),
        contribution: cloneValue(player.contribution ?? {}),
      }))
      : [],
  };
  return deepFreeze(summary);
}
