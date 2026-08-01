import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [worker, room, roomRules, vite] = await Promise.all([
  readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/multiplayer-room.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/game/co-op-room.mjs", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
]);

test("Worker exposes a co-op room WebSocket upgrade route", () => {
  assert.match(worker, /api\\\/co-op\\\/rooms/);
  assert.match(worker, /CO_OP_ROOMS/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /426/);
  assert.match(worker, /idFromName/);
});

test("co-op room requires a versioned no-auth hello before gameplay", () => {
  assert.match(room, /export class MultiplayerRoom/);
  assert.match(room, /WebSocketPair|acceptWebSocket/);
  assert.match(room, /CO_OP_PROTOCOL_VERSION/);
  assert.match(room, /displayName/);
  assert.match(room, /HELLO_REQUIRED/);
  assert.match(room, /parseClientMessage/);
});

test("co-op room broadcasts on a bounded cadence and cleans up sockets", () => {
  assert.match(room, /BROADCAST_INTERVAL_MS/);
  assert.match(room, /setTimeout/);
  assert.match(room, /disconnectPlayer/);
  assert.match(room, /webSocketClose/);
  assert.match(room, /close\(/);
  assert.match(room, /getEndedMessage/);
  assert.match(room, /close\(1000, "ROOM_ENDED"\)/);
  assert.match(room, /getExpiredDisconnectedPlayerIds/);
  assert.match(room, /getNextDisconnectDeadline/);
});

test("co-op starts only from the host start intent and ends through one terminal path", () => {
  assert.match(roomRules, /parsed\.type === "start"/);
  assert.doesNotMatch(room, /phase === "ready"[\s\S]{0,160}startRoom/);
  assert.match(room, /private async receive[\s\S]{0,1200}finishExpiredDisconnects[\s\S]{0,500}parseClientMessage/);
  assert.match(room, /finishRoom/);
  assert.match(room, /ROOM_ENDED/);
});

test("co-op room restores hibernated sockets and room state before processing messages", () => {
  assert.match(room, /getWebSockets/);
  assert.match(room, /socketAttachments/);
  assert.match(room, /setAlarm/);
  assert.match(room, /async alarm\(\)/);
  assert.match(room, /await this\.ensureRoom\(attachment\.roomCode\)/);
  assert.match(room, /acceptHello[\s\S]*this\.scheduleTick\(\)/);
});

test("co-op route stays safely gated when the production binding is absent", () => {
  assert.match(worker, /if \(!env\.CO_OP_ROOMS\)/);
  assert.match(worker, /status: 503/);
});

test("local Worker preview declares the co-op Durable Object binding and migration", () => {
  assert.match(vite, /CO_OP_ROOMS/);
  assert.match(vite, /MultiplayerRoom/);
  assert.match(vite, /durable_objects/);
  assert.match(vite, /migrations/);
});

test("expired reconnect grace broadcasts an abandoned ending and terminal closes cannot recreate the room", async () => {
  const [{ MultiplayerRoom }, roomState] = await Promise.all([
    import("../worker/multiplayer-room.ts"),
    import("../app/game/co-op-room.mjs"),
  ]);
  const records = new Map();
  const sent = [];
  const closes = [];
  const attachment = { roomCode: "ABC123", socketId: "socket-host", playerId: "p1", greeted: true };
  const socket = {
    readyState: WebSocket.OPEN,
    deserializeAttachment: () => attachment,
    send: (value) => sent.push(JSON.parse(value)),
    close: (code, reason) => closes.push({ code, reason }),
  };
  const storage = {
    get: async (key) => records.get(key),
    put: async (key, value) => records.set(key, value),
    delete: async (key) => records.delete(key),
    setAlarm: async () => {},
    deleteAlarm: async () => {},
  };
  const state = { storage, getWebSockets: () => [socket] };
  let authoritativeRoom = roomState.createRoom({ roomCode: "ABC123", seed: "test-seed" });
  authoritativeRoom = roomState.joinRoom(authoritativeRoom, { id: "p1", name: "Host" });
  authoritativeRoom = roomState.joinRoom(authoritativeRoom, { id: "p2", name: "Guest" });
  authoritativeRoom = roomState.disconnectPlayer(authoritativeRoom, "p2", Date.now() - roomState.RECONNECT_GRACE_MS - 1);
  records.set("co-op:room", authoritativeRoom);
  const adapter = new MultiplayerRoom(state);

  await adapter.alarm();

  assert.equal(sent.at(-1).type, "ended");
  assert.equal(sent.at(-1).result, "abandoned");
  assert.deepEqual(closes, [{ code: 1000, reason: "ROOM_ENDED" }]);
  assert.equal(records.has("co-op:room"), false);

  await adapter.webSocketClose(socket);
  await adapter.webSocketError(socket);
  assert.equal(records.has("co-op:room"), false);
  assert.equal(adapter.room, null);
});
