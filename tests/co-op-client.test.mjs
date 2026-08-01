import assert from "node:assert/strict";
import test from "node:test";

function createSocketFactory() {
  const sockets = [];
  class TestSocket {
    static OPEN = 1;
    static CONNECTING = 0;

    constructor(url) {
      this.url = url;
      this.readyState = TestSocket.CONNECTING;
      this.sent = [];
      this.listeners = new Map();
      sockets.push(this);
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    send(value) {
      this.sent.push(JSON.parse(value));
    }

    close() {
      this.readyState = 3;
      this.listeners.get("close")?.({ code: 1000 });
    }

    open() {
      this.readyState = TestSocket.OPEN;
      this.listeners.get("open")?.();
    }

    receive(message) {
      this.listeners.get("message")?.({ data: JSON.stringify(message) });
    }

    drop() {
      this.readyState = 3;
      this.listeners.get("close")?.({ code: 1006 });
    }
  }
  return { TestSocket, sockets };
}

test("sends a versioned hello and numbers input and action intents", async () => {
  const { TestSocket, sockets } = createSocketFactory();
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const client = new CoOpClient({ WebSocket: TestSocket });

  client.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[0].open();
  client.sendInput({ moveX: 1, moveY: 0, aimX: 0, aimY: 1 });
  client.sendInput({ moveX: 0, moveY: 1, aimX: 0, aimY: 1 });
  client.sendAction({ action: "emp" });
  client.sendAction({ action: "shoot", targetId: "enemy-1" });

  assert.deepEqual(sockets[0].sent.slice(0, 5), [
    { type: "hello", protocolVersion: 1, displayName: "Ian" },
    { type: "input", sequence: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 1 },
    { type: "input", sequence: 2, moveX: 0, moveY: 1, aimX: 0, aimY: 1 },
    { type: "action", sequence: 1, action: "emp" },
    { type: "action", sequence: 2, action: "shoot", targetId: "enemy-1" },
  ]);
});

test("sends the host start intent after the room is ready", async () => {
  const { TestSocket, sockets } = createSocketFactory();
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const client = new CoOpClient({ WebSocket: TestSocket });

  client.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[0].open();
  assert.equal(client.sendStart(), true);

  assert.deepEqual(sockets[0].sent.at(-1), { type: "start" });
});

test("deduplicates snapshots and resumes from the latest snapshot", async () => {
  const { TestSocket, sockets } = createSocketFactory();
  const { createEmptyCoOpSnapshot } = await import("../app/game/co-op-protocol.mjs");
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const received = [];
  const client = new CoOpClient({ WebSocket: TestSocket, onSnapshot: (snapshot) => received.push(snapshot) });

  client.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[0].open();
  client.handleMessage({ type: "snapshot", snapshotId: 9, serverTick: 12, state: createEmptyCoOpSnapshot("seed") });
  client.handleMessage({ type: "snapshot", snapshotId: 9, serverTick: 13, state: createEmptyCoOpSnapshot("seed") });
  client.resume();

  assert.equal(received.length, 1);
  assert.equal(client.lastSnapshot.snapshotId, 9);
  assert.ok(Object.isFrozen(client.lastSnapshot));
  assert.deepEqual(sockets[0].sent.at(-1), { type: "resume", lastSnapshotId: 9 });
});

test("reconnects with bounded backoff and resumes the authoritative snapshot", async () => {
  const { TestSocket, sockets } = createSocketFactory();
  const { createEmptyCoOpSnapshot } = await import("../app/game/co-op-protocol.mjs");
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const scheduled = [];
  const client = new CoOpClient({
    WebSocket: TestSocket,
    reconnectDelays: [5, 10, 20],
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
  });

  client.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[0].open();
  client.handleMessage({ type: "snapshot", snapshotId: 4, serverTick: 4, state: createEmptyCoOpSnapshot("seed") });
  sockets[0].drop();
  assert.equal(client.connectionState, "reconnecting");
  assert.equal(scheduled[0].delay, 5);
  scheduled[0].callback();
  sockets[1].open();
  assert.deepEqual(sockets[1].sent.slice(-2), [
    { type: "hello", protocolVersion: 1, displayName: "Ian" },
    { type: "resume", lastSnapshotId: 4 },
  ]);

  // A successfully reopened socket resets the failure budget. Subsequent
  // failed connection attempts are capped at the three configured delays.
  sockets[1].drop();
  scheduled[1].callback();
  sockets[2].drop();
  scheduled[2].callback();
  sockets[3].drop();
  scheduled[3].callback();
  sockets[4].drop();

  assert.equal(client.connectionState, "error");
  assert.deepEqual(scheduled.slice(-3).map((timer) => timer.delay), [5, 10, 20]);
});

test("ignores stale socket messages after a newer connection opens", async () => {
  const { TestSocket, sockets } = createSocketFactory();
  const { createEmptyCoOpSnapshot, createMatchSummary } = await import("../app/game/co-op-protocol.mjs");
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const scheduled = [];
  const receivedEvents = [];
  const ended = [];
  const client = new CoOpClient({
    WebSocket: TestSocket,
    setTimeout(callback) {
      const timer = { callback, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
    onEvent: (event) => receivedEvents.push(event),
    onEnded: (message) => ended.push(message),
  });

  client.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[0].open();
  sockets[0].drop();
  scheduled[0].callback();
  sockets[1].open();
  const liveState = { ...createEmptyCoOpSnapshot("seed"), wave: { number: 1, status: "playing", elapsedMs: 0 } };
  sockets[1].receive({ type: "snapshot", snapshotId: 10, serverTick: 10, state: liveState });

  sockets[0].receive({ type: "snapshot", snapshotId: 11, serverTick: 11, state: liveState });
  sockets[0].receive({ type: "event", eventId: 1, kind: "hit", payload: { targetId: "enemy-1" } });
  sockets[0].receive({ type: "ended", result: "defeat", summary: createMatchSummary() });

  assert.equal(client.lastSnapshotId, 10);
  assert.equal(client.lastEventId, 0);
  assert.equal(client.connectionState, "playing");
  assert.deepEqual(receivedEvents, []);
  assert.deepEqual(ended, []);
});

test("does not retry permanent protocol errors and clears scheduled reconnects on disconnect", async () => {
  const { TestSocket, sockets } = createSocketFactory();
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const scheduled = [];
  const client = new CoOpClient({
    WebSocket: TestSocket,
    setTimeout(callback) {
      const timer = { callback, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
  });

  client.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[0].open();
  client.handleMessage({ type: "error", code: "HELLO_REQUIRED", message: "Version mismatch" });
  assert.equal(client.connectionState, "error");
  assert.equal(scheduled.length, 0);

  const secondClient = new CoOpClient({
    WebSocket: TestSocket,
    setTimeout(callback) {
      const timer = { callback, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
  });
  secondClient.connect("wss://example.test/rooms/ABC123", "Ian");
  sockets[1].open();
  sockets[1].drop();
  secondClient.disconnect();
  assert.equal(scheduled.at(-1).cleared, true);
  assert.equal(secondClient.connectionState, "idle");
});
