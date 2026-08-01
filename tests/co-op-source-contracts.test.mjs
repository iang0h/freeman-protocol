import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [worker, room, vite] = await Promise.all([
  readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/multiplayer-room.ts", import.meta.url), "utf8"),
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
});

test("co-op room restores hibernated sockets and room state before processing messages", () => {
  assert.match(room, /getWebSockets/);
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
