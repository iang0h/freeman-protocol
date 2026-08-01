# Co-op Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a feature-flagged two-player co-op mode with room codes, an authoritative room protocol, autonomous shared warband state, reconnect handling, and a focused lobby without changing Campaign or Watch Mode.

**Architecture:** Keep deterministic rules in `app/game/` and introduce a transport-neutral co-op room state machine. Use the same in-memory room implementation for tests/local development and a Cloudflare Durable Object adapter for production WebSockets. The React client renders a co-op lobby and projects authoritative snapshots; it sends only validated input/action intents.

**Tech Stack:** TypeScript/TSX, renderer-independent `.mjs` rules, React state, native WebSocket, Cloudflare Workers Durable Objects, Node’s built-in test runner, ESLint, TypeScript, and vinext.

## Global Constraints

- Campaign and Watch Mode must work with no WebSocket endpoint and no network permission.
- Multiplayer rooms are two-player co-op only; no PvP, accounts, matchmaking, chat, trading, or persistent multiplayer progression.
- The Core and warband are shared; operator HP and movement are per player.
- The server validates movement, actions, cooldowns, resources, targets, loot, waves, and room membership.
- Mobile co-op UI must add no permanently open combat panel and must preserve the existing 48px touch-target contract.
- Production co-op remains disabled until a Durable Object binding and public WebSocket URL are configured.
- Every implementation task follows TDD: write a failing test, run it red, implement the smallest behavior, run it green, then commit.

## File map

- Create `app/game/co-op-protocol.mjs`: serializable message/state shapes, constants, code/name validation, and protocol guards.
- Create `app/game/co-op-room.mjs`: transport-neutral authoritative two-player room state machine used by tests and the Worker adapter.
- Create `app/game/co-op-simulation.mjs`: transport-neutral deterministic shared battle reducer.
- Create `app/game/co-op-client.mjs`: browser WebSocket client with connection state, sequence numbers, snapshot resume, and event callbacks.
- Create `app/CoOpLobby.tsx`: intro/lobby UI for create, join, ready, start, reconnect, and end states.
- Modify `app/FreemanProtocol.tsx`: accept co-op session state and project remote-player/snapshot data without affecting local engines.
- Modify `app/page.tsx`: add the feature flag, co-op session lifecycle, and lobby wiring.
- Modify `app/globals.css`: focused lobby, connection strip, remote-player status, and touch-safe mobile rules.
- Create `worker/multiplayer-room.ts`: Cloudflare Durable Object WebSocket adapter around the room state machine.
- Modify `worker/index.ts`: route WebSocket upgrade requests to the room Durable Object.
- Modify `vite.config.ts`: add the local Durable Object binding used by the Worker preview.
- Create `tests/co-op-rules.test.mjs`: protocol and room state tests.
- Create `tests/co-op-client.test.mjs`: client sequence, reconnect, and snapshot projection tests.
- Create `tests/co-op-source-contracts.test.mjs`: lobby, feature-flag, Worker, and mobile source contracts.

### Task 1: Define the versioned co-op protocol

**Files:**
- Create: `app/game/co-op-protocol.mjs`
- Test: `tests/co-op-rules.test.mjs`

**Interfaces:**
- Produces `CO_OP_PROTOCOL_VERSION`, `ROOM_CODE_LENGTH`, `createRoomCode(random)`, `normalizeDisplayName(value)`, `parseClientMessage(value)`, `isClientMessage(value)`, `createEmptyCoOpSnapshot(seed)`, and `createMatchSummary(state)`.
- `ClientMessage` accepts `hello`, `ready`, `input`, `action`, `priority`, and `resume` messages exactly as defined in the design spec.
- `ServerMessage` accepts `room`, `snapshot`, `event`, `error`, and `ended` messages exactly as defined in the design spec.

- [ ] **Step 1: Write the failing tests.** Add tests for six-character uppercase codes, display-name trimming/length clamping, rejection of unknown message types, finite input clamping, and a fresh snapshot containing two player slots plus a shared Core/resource/warband state.

```js
test("normalizes room codes and display names", async () => {
  const rules = await import("../app/game/co-op-protocol.mjs");
  assert.equal(rules.createRoomCode(() => 0), "AAAAAA");
  assert.equal(rules.normalizeDisplayName("  Ian  "), "Ian");
  assert.equal(rules.normalizeDisplayName("x".repeat(40)).length, 20);
});

test("rejects malformed client actions without mutating input", async () => {
  const { parseClientMessage } = await import("../app/game/co-op-protocol.mjs");
  assert.equal(parseClientMessage({ type: "action", action: "hack" }), null);
  assert.equal(parseClientMessage({ type: "input", sequence: 1, moveX: Infinity, moveY: 0, aimX: 0, aimY: 0 }), null);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-rules.test.mjs`

Expected: FAIL because `app/game/co-op-protocol.mjs` does not exist.

- [ ] **Step 3: Implement the protocol helpers.** Use explicit allow-lists, finite-number checks, immutable return objects, and `Math.max/Math.min` clamps. Do not use `JSON.parse` without a catch in `parseClientMessage`.

```js
export const CO_OP_PROTOCOL_VERSION = 1;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_MAX_PLAYERS = 2;

export function normalizeDisplayName(value) {
  return String(value ?? "Guest").trim().replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 20) || "Guest";
}

export function parseClientMessage(value) {
  if (!value || typeof value !== "object" || typeof value.type !== "string") return null;
  if (value.type === "ready" && typeof value.ready === "boolean") return { type: "ready", ready: value.ready };
  if (value.type === "priority" && ["follow", "guard", "focus"].includes(value.priority)) return { type: "priority", priority: value.priority };
  return null;
}
```

- [ ] **Step 4: Run the focused test to verify it passes.**

Run the same command; expected: all protocol tests pass.

- [ ] **Step 5: Commit.**

```bash
git add app/game/co-op-protocol.mjs tests/co-op-rules.test.mjs
git commit -m "feat: add versioned co-op protocol"
```

### Task 2: Build the authoritative in-memory room state machine

**Files:**
- Create: `app/game/co-op-room.mjs`
- Create: `app/game/co-op-simulation.mjs`
- Modify: `tests/co-op-rules.test.mjs`

**Interfaces:**
- Produces `createRoom(options)`, `joinRoom(room, player)`, `setPlayerReady(room, playerId, ready)`, `startRoom(room)`, `applyClientMessage(room, playerId, message)`, `tickRoom(room, elapsedMs)`, `disconnectPlayer(room, playerId, now)`, `reconnectPlayer(room, playerId, now)`, `getRoomMessage(room)`, and `getSnapshot(room)`.
- `tickRoom` delegates battle progression to `app/game/co-op-simulation.mjs`, whose `tickCoOpSimulation(state, elapsedMs)` advances the shared wave, enemies, loot, Core damage, autonomous agents, and three-second intermission without any DOM or renderer dependency.
- A room state includes `phase: "waiting" | "ready" | "playing" | "ended"`, `roomCode`, `seed`, two player records, `core`, `resources`, `warband`, `wave`, `priority`, `snapshotId`, `lastActionByPlayer`, and disconnect deadlines.

- [ ] **Step 1: Write failing lifecycle tests** for create → join → ready → start, rejection of a third player, shared resource atomicity, duplicate action sequence rejection, snapshot IDs, and 30-second reconnect grace.

```js
test("starts only a two-player ready room", async () => {
  const { createRoom, joinRoom, setPlayerReady, startRoom } = await import("../app/game/co-op-room.mjs");
  let room = createRoom({ roomCode: "ABC123", seed: "test-seed" });
  room = joinRoom(room, { id: "p1", name: "Host" });
  room = joinRoom(room, { id: "p2", name: "Guest" });
  room = setPlayerReady(setPlayerReady(room, "p1", true), "p2", true);
  assert.equal(startRoom(room).phase, "playing");
});
```

- [ ] **Step 2: Run the focused test red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-rules.test.mjs`

Expected: FAIL because `app/game/co-op-room.mjs` does not exist.

- [ ] **Step 3: Implement immutable room transitions and the shared simulation reducer.** Keep room helpers pure: clone the room on each transition, cap players at two, validate player IDs, maintain per-player action sequence watermarks, and make resource spending atomic. Add `tickCoOpSimulation(state, elapsedMs)` in `app/game/co-op-simulation.mjs`; it consumes the existing renderer-independent wave, combat, loot, warband, repair, boss, and autonomous-network rules and returns a new state. `tickRoom` advances the reducer and increments `snapshotId`; it must not mutate the existing room argument.

- [ ] **Step 4: Add shared-game action validation.** Accept `shoot`, `emp`, `repair`, `recruit`, `build-sentry`, and `deploy-reserve` as intent records. Validate action ownership, cooldowns, target IDs, and resource costs through existing rules such as `app/game/progression.mjs`, `app/game/warband-rules.mjs`, `app/game/sentry-placement.mjs`, and `app/game/loot-rules.mjs`; return an error result without changing state when invalid. Add tests proving both clients observe the same enemy defeat, loot pickup, wave transition, and shared resource spend.

- [ ] **Step 5: Run focused room tests green and commit.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-rules.test.mjs`

```bash
git add app/game/co-op-room.mjs tests/co-op-rules.test.mjs
git commit -m "feat: add authoritative co-op room state"
```

### Task 3: Add the production WebSocket room adapter

**Files:**
- Create: `worker/multiplayer-room.ts`
- Modify: `worker/index.ts`
- Modify: `vite.config.ts`
- Modify: `tests/co-op-source-contracts.test.mjs`

**Interfaces:**
- Produces a `MultiplayerRoom` Durable Object with `fetch(request)`, WebSocket upgrade handling, per-socket player identity, a fixed tick loop, reconnect grace, and room expiry.
- Worker route: `GET /api/co-op/rooms/:roomCode` upgrades to WebSocket and forwards to the Durable Object named by the normalized room code.
- Environment binding: `CO_OP_ROOMS: DurableObjectNamespace`.

- [ ] **Step 1: Write source contracts** for the route, binding, protocol-version check, no-auth display-name handshake, bounded broadcast cadence, and close/error handling.

```js
test("Worker exposes the co-op room upgrade route", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const room = await readFile(new URL("../worker/multiplayer-room.ts", import.meta.url), "utf8");
  assert.match(worker, /\/api\/co-op\/rooms/);
  assert.match(worker, /CO_OP_ROOMS/);
  assert.match(room, /acceptWebSocket|WebSocketPair/);
  assert.match(room, /CO_OP_PROTOCOL_VERSION/);
});
```

- [ ] **Step 2: Run source contracts red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-source-contracts.test.mjs`

Expected: FAIL because the Worker adapter and route are absent.

- [ ] **Step 3: Implement the Durable Object adapter.** Upgrade only `GET` requests, reject non-WebSocket requests with `426`, parse a `hello` message before accepting gameplay messages, map the room code to the Durable Object name, and broadcast serialized `ServerMessage` records. Use the hibernation WebSocket API when the deployment runtime supports it; otherwise use a bounded `setTimeout` tick loop and close it when the room ends.

- [ ] **Step 4: Add local binding configuration.** Extend the local Cloudflare config in `vite.config.ts` with a named Durable Object migration/binding while leaving `.openai/hosting.json` unchanged until the production binding exists.

- [ ] **Step 5: Run source contracts, typecheck, and commit.**

```bash
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-source-contracts.test.mjs
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc --noEmit
git add worker/multiplayer-room.ts worker/index.ts vite.config.ts tests/co-op-source-contracts.test.mjs
git commit -m "feat: add co-op WebSocket room adapter"
```

### Task 4: Add the browser co-op client transport

**Files:**
- Create: `app/game/co-op-client.mjs`
- Create: `tests/co-op-client.test.mjs`

**Interfaces:**
- Produces `CoOpClient` with `connect(url, displayName)`, `sendReady(ready)`, `sendInput(input)`, `sendAction(action)`, `sendPriority(priority)`, `resume(snapshotId)`, `disconnect()`, `handleMessage(message)`, and callbacks for `onRoom`, `onSnapshot`, `onEvent`, `onEnded`, `onError`, and `onConnectionChange`.
- Client connection states are `idle`, `connecting`, `waiting`, `ready`, `playing`, `reconnecting`, `ended`, and `error`.

- [ ] **Step 1: Write failing client tests** using a small injected WebSocket factory. Verify monotonic input/action sequences, JSON protocol version, reconnect backoff capped at three attempts, and resume message using the last snapshot ID.

```js
test("numbers actions and resumes from the latest snapshot", async () => {
  const sent = [];
  const { CoOpClient } = await import("../app/game/co-op-client.mjs");
  const client = new CoOpClient({ WebSocket: class { send(value) { sent.push(JSON.parse(value)); } close() {} } });
  client.connect("wss://example.test/rooms/ABC123", "Ian");
  client.sendAction({ action: "emp" });
  client.handleMessage({ type: "snapshot", snapshotId: 9, serverTick: 12, state: {} });
  client.resume();
  assert.equal(sent.find((message) => message.type === "action").sequence, 1);
  assert.deepEqual(sent.at(-1), { type: "resume", lastSnapshotId: 9 });
});
```

- [ ] **Step 2: Run client tests red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-client.test.mjs`

Expected: FAIL because `app/game/co-op-client.mjs` does not exist.

- [ ] **Step 3: Implement the transport.** Keep WebSocket access injectable, never retry a permanent protocol error, clear timers on `disconnect`, and expose immutable last snapshot state for the React layer. Keep the file `.mjs` so Node’s built-in tests can import the same transport module used by the browser.

- [ ] **Step 4: Run client tests green and commit.**

```bash
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-client.test.mjs
git add app/game/co-op-client.mjs tests/co-op-client.test.mjs
git commit -m "feat: add browser co-op transport"
```

### Task 5: Build the focused co-op lobby

**Files:**
- Create: `app/CoOpLobby.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/co-op-source-contracts.test.mjs`

**Interfaces:**
- `CoOpLobby` props: `client`, `featureEnabled`, `onStartSession`, and `onLeave`.
- Lobby states: `landing`, `creating`, `joining`, `waiting`, `ready`, `connecting`, `reconnecting`, and `ended`.

- [ ] **Step 1: Write source contracts** for the `CO-OP` entry point, create/join controls, room-code input, display-name input, copy button, ready/start controls, accessible status text, and a disabled explanation when the endpoint is missing.

- [ ] **Step 2: Run contracts red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-source-contracts.test.mjs`

Expected: FAIL because `CoOpLobby` and the page wiring are absent.

- [ ] **Step 3: Implement the lobby UI.** Keep it outside the combat HUD. Use a six-character uppercase input, `aria-live="polite"` for connection changes, and clipboard copy with a visible fallback when clipboard access is unavailable. Store only the display name locally; do not persist room state or rewards.

- [ ] **Step 4: Add mobile styles.** Keep the lobby within the safe viewport, use a single-column layout under 820px, use at least 48px controls, and ensure no lobby panel is rendered over the arena before a match begins.

- [ ] **Step 5: Run contracts, lint, and commit.**

```bash
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-source-contracts.test.mjs
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint app tests
git add app/CoOpLobby.tsx app/page.tsx app/globals.css tests/co-op-source-contracts.test.mjs
git commit -m "feat: add co-op room lobby"
```

### Task 6: Project authoritative co-op snapshots into combat

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/co-op-source-contracts.test.mjs`

**Interfaces:**
- `FreemanProtocol` receives optional `coOpSnapshot`, `coOpPlayerId`, `coOpConnectionState`, and `onCoOpAction` props.
- The combat presentation exposes only a compact remote-player status and uses `onCoOpAction` for player actions.

- [ ] **Step 1: Write source contracts** proving campaign/watch mode still creates local engines, co-op renders the remote operator status, co-op actions route through the client, and no co-op snapshot is treated as authoritative in local mode.

- [ ] **Step 2: Run contracts red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-source-contracts.test.mjs`

Expected: FAIL because the props and status projection are absent.

- [ ] **Step 3: Implement the bridge.** Add a `sessionMode: "coop"` branch at the React orchestration layer rather than duplicating the Three.js and Canvas engines. Render remote-player data from the latest snapshot, map local movement/aim/action events to `CoOpClient`, and keep the existing mobile command trays collapsed by default.

- [ ] **Step 4: Add remote interpolation and connection feedback.** Interpolate remote position between the last two snapshots, display a small `CONNECTED`/`RECONNECTING` state, and keep stale snapshots visible for no more than two seconds before showing a clear network warning.

- [ ] **Step 5: Run full tests/lint/typecheck and commit.**

```bash
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/*.test.mjs
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint app tests worker
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc --noEmit
git add app/FreemanProtocol.tsx app/page.tsx app/globals.css tests/co-op-source-contracts.test.mjs
git commit -m "feat: project co-op snapshots into combat"
```

### Task 7: Add match end, reconnect, and summary states

**Files:**
- Modify: `app/CoOpLobby.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/co-op-client.test.mjs`

**Interfaces:**
- Consumes `ended`, `room`, and connection callbacks from `CoOpClient`.
- Produces `MatchSummary` rendering for victory, defeat, abandoned, and manual leave.

- [ ] **Step 1: Write failing tests** for reconnecting after a dropped socket, returning to the lobby after `ended`, and rendering contribution fields without exposing a persistent economy.

- [ ] **Step 2: Run focused tests red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-client.test.mjs`

Expected: FAIL because the UI does not handle `ended` or reconnect state.

- [ ] **Step 3: Implement reconnect and end states.** Preserve the last room code only in memory, disable duplicate action buttons while reconnecting, allow `PLAY AGAIN` to create a fresh seed, and clear the client on `LEAVE ROOM`.

- [ ] **Step 4: Run focused tests and commit.**

```bash
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-client.test.mjs
git add app/CoOpLobby.tsx app/page.tsx app/globals.css tests/co-op-client.test.mjs
git commit -m "feat: handle co-op reconnect and match summary"
```

### Task 8: Add production binding and deployment gate

**Files:**
- Modify: `worker/index.ts`
- Modify: `vite.config.ts`
- Modify: `README.md`
- Modify: `.openai/hosting.json` only when the real binding is provisioned
- Test: `tests/co-op-source-contracts.test.mjs`

**Interfaces:**
- Environment variable `CO_OP_WS_URL` controls client activation.
- Worker environment binding `CO_OP_ROOMS` maps to the Durable Object namespace.
- The UI displays `CO-OP COMING SOON` when `CO_OP_WS_URL` is absent instead of attempting a broken connection.

- [ ] **Step 1: Write the deployment-gate test.** Assert that missing `CO_OP_WS_URL` disables the button and that the Worker rejects a room upgrade when the Durable Object binding is unavailable.

- [ ] **Step 2: Run it red.**

Run: `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-source-contracts.test.mjs`

Expected: FAIL because the feature flag and binding guard are absent.

- [ ] **Step 3: Implement the gate and documentation.** Add the binding to local configuration, document the required production secret/binding setup, and do not put credentials in `.env`, Git, or source code.

- [ ] **Step 4: Run the complete verification suite.**

```bash
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/*.test.mjs
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint app tests worker
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc --noEmit
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vinext build
```

- [ ] **Step 5: Commit the deployment gate.**

```bash
git add worker/index.ts vite.config.ts README.md tests/co-op-source-contracts.test.mjs
git commit -m "feat: gate co-op behind production room binding"
```

### Task 9: Two-session production verification

**Files:**
- No source changes unless verification finds a defect.
- Evidence: `docs/superpowers/verification/2026-08-01-co-op-multiplayer-verification.md`

- [ ] **Step 1: Deploy the validated source** with `CO_OP_WS_URL` and the Durable Object binding configured.
- [ ] **Step 2: Open two browser sessions** against the live site, create/join a room, and verify the ready/start lifecycle.
- [ ] **Step 3: Verify shared behavior:** both clients see the same wave, Core health, enemy death, loot pickup, recruitment, sentry, and three-second intermission.
- [ ] **Step 4: Verify resilience:** disconnect one session, confirm defensive AI takeover, reconnect within 30 seconds, then complete victory and inspect the summary.
- [ ] **Step 5: Record the deployed URL, commit SHA, test results, and any known limitations** in the verification evidence file; do not claim co-op is live until both sessions pass.

## Final verification checklist

- [ ] Existing Campaign and Watch Mode tests pass unchanged.
- [ ] Room rules and protocol tests pass.
- [ ] Client reconnect and snapshot tests pass.
- [ ] Lobby and mobile source contracts pass.
- [ ] ESLint, TypeScript, and vinext build pass.
- [ ] Co-op remains visibly disabled when the production WebSocket endpoint is unavailable.
- [ ] Two real browser sessions pass the live co-op smoke test before enabling production access.
