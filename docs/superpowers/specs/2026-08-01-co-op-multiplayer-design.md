# Freeman Protocol Co-op Multiplayer Design

**Date:** 2026-08-01  
**Status:** Approved direction; implementation not started

## Goal

Add a two-player cooperative mode where two defenders share one live breach, Core, wave schedule, resource pool, and autonomous AI warband. Players join with a short room code and display name; campaign and Watch Mode remain available exactly as they are today.

## Product boundaries

### In scope for the first release

- A `CO-OP` entry point from the intro screen.
- Host-created rooms with six-character join codes.
- A display name per connected player; no account is required.
- A maximum of two connected players per room.
- Two independent operators with independent HP and movement.
- One shared protected Core, wave clock, enemy roster, loot field, Compute wallet, Components, Shards, sentry grid, and eight-slot autonomous warband.
- Server-authoritative validation for movement intent, shooting, EMP, recruitment, sentry deployment, repair, reserve deployment, and upgrades.
- Reconnection grace for a temporarily disconnected player; the disconnected operator becomes AI-controlled/defensive until the grace period expires.
- A clear room status UI: creating, waiting, ready, reconnecting, and match ended.
- A co-op end-of-match summary showing waves survived, Core health, agents recruited, resources gathered, and each player’s contribution.

### Explicitly out of scope

- Player-versus-player combat.
- Matchmaking or public lobbies.
- Account creation, social graph, friends, chat, or moderation tools.
- Persistent multiplayer inventory or achievements.
- Trading or player-owned agents.
- More than two players in the first release.
- Cross-region ranking or a permanent online economy.

## Recommended architecture

Use an authoritative WebSocket room server. One room owns one match simulation. Clients send intent and receive snapshots; clients never decide authoritative damage, loot, wave completion, or resource changes.

The existing single-player engines remain the local source of truth for campaign and Watch Mode. Multiplayer-specific simulation should reuse renderer-independent rules from `app/game/` wherever possible, but it should not make the client’s current campaign loop depend on a network connection.

The intended production transport is a Cloudflare Durable Object per room, exposed through a Worker WebSocket upgrade route. Durable Objects provide one consistent owner for room state and connected sockets. The deployment must provide a Durable Object binding and a public WebSocket URL before the client’s co-op button is enabled.

### Alternatives rejected

1. **Peer-to-peer WebRTC:** lower server cost, but host migration, cheating, reconnects, and deterministic authority are too fragile for resource and loot progression.
2. **Full account-backed backend:** useful later, but authentication and persistence would delay validating whether the co-op loop is fun.

## Match lifecycle

1. The intro screen offers `CAMPAIGN`, `WATCH`, and `CO-OP`.
2. The host chooses `CREATE ROOM`; the server returns a six-character code.
3. The guest chooses `JOIN ROOM`, enters the code and a display name, and connects.
4. The room displays both names and a `READY` state. The host starts the match once both clients are ready.
5. The server creates a fresh match seed and sends the initial snapshot. Both players spawn at separate safe positions inside the Core chamber.
6. The server advances the fixed simulation tick, broadcasts snapshots, and emits compact event messages for combat feedback.
7. A disconnect enters a 30-second reconnect grace period. The server keeps the operator and inventory in the room and assigns a defensive AI intent while disconnected.
8. If the room ends or the grace period expires, the server closes the room and clients return to the co-op lobby with a readable reason.

## Shared gameplay rules

### Players

- Each player owns one operator HP pool, position, aim, cooldowns, armor, and player upgrades.
- Operators can damage the same enemy and can collect the same visible loot; the server awards each pickup exactly once.
- Player movement is sent as normalized directional intent. The server applies speed, collision, and bounds.
- Shooting and EMP are requests with client timestamps; the server applies cooldown and target validation.

### Core and economy

- The Core is shared and remains protect-only.
- Compute, Components, Shards, Repairs, and Modules are shared room resources.
- Any player may spend shared resources, but the server performs an atomic affordability check.
- The resource update includes the acting player ID so the summary can show contribution without creating separate economies.

### Autonomous warband

- Recruited agents belong to the shared warband and continue using autonomous role intents.
- Players do not issue per-agent micro-orders in the first version.
- A player may set the broad squad priority (`FOLLOW`, `GUARD CORE`, or `FOCUS BOSS`); the latest valid priority is shared and visible to both players.
- Agents can gather materials, return to repair, build/upgrade defenses, and spawn temporary sub-agents through the same server simulation.
- The server owns agent decisions and sub-agent lifetimes so both clients see the same behavior.

### Waves and victory

- Wave timing, queued spawns, terrain, bosses, loot, and three-second intermissions are server-owned.
- The room wins or loses together.
- If one operator dies, that player enters a short recovery state while the other player and warband continue defending the Core.
- If the Core reaches zero, the match ends for both players.

## Network protocol

Messages are versioned with a top-level `type` and `protocolVersion`.

### Client to server

```ts
type ClientMessage =
  | { type: "hello"; protocolVersion: 1; displayName: string }
  | { type: "ready"; ready: boolean }
  | { type: "input"; sequence: number; moveX: number; moveY: number; aimX: number; aimY: number }
  | { type: "action"; sequence: number; action: "shoot" | "emp" | "repair" | "recruit" | "build-sentry" | "deploy-reserve"; targetId?: string; agentId?: string }
  | { type: "priority"; priority: "follow" | "guard" | "focus" }
  | { type: "resume"; lastSnapshotId: number };
```

### Server to client

```ts
type ServerMessage =
  | { type: "room"; roomCode: string; players: Array<{ id: string; name: string; ready: boolean; connected: boolean }> }
  | { type: "snapshot"; snapshotId: number; serverTick: number; state: CoOpSnapshot }
  | { type: "event"; eventId: number; kind: "hit" | "critical" | "kill" | "loot" | "agent-task" | "wave" | "boss"; payload: Record<string, unknown> }
  | { type: "error"; code: string; message: string }
  | { type: "ended"; result: "victory" | "defeat" | "abandoned"; summary: MatchSummary };
```

The server broadcasts snapshots at a bounded cadence (target 10–15 Hz). The client interpolates remote operators, enemies, and agents between snapshots; it does not run a second authoritative simulation. Event messages are presentation-only and may be dropped without changing state.

## Client UI

- The co-op lobby is a focused screen, not another combat overlay.
- The host sees `ROOM CODE`, `COPY`, connected player names, and `START MATCH`.
- The guest sees the room code field, connection status, and `READY`.
- During play, a compact top status shows the other player’s name, connection state, and operator HP. It does not expose the full management dashboard.
- A small connection indicator changes to reconnecting before any large modal appears.
- The existing mobile command trays remain collapsed by default. Co-op adds no always-open panel.
- The end screen returns to the lobby and offers `PLAY AGAIN` with the same room or `LEAVE ROOM`.

## Failure handling and security

- Room codes are unguessable enough for a short-lived casual room but are not treated as authentication.
- The server clamps all coordinates, input magnitudes, action rates, resource spends, and target IDs.
- A malformed or unsupported protocol message produces an error response and does not mutate state.
- A client may reconnect only to the room code it already joined during the grace period.
- Rooms have a hard idle/lifetime expiry so abandoned rooms cannot run forever.
- No multiplayer progression is persisted until accounts and anti-abuse rules are designed.

## Testing strategy

### Renderer-independent tests

- Room creation and six-character code validation.
- Two-player join/ready/start lifecycle.
- Snapshot sequencing and resume from the last acknowledged snapshot.
- Shared resource atomicity under simultaneous spend requests.
- Duplicate action rejection by sequence number.
- Server-side cooldown, bounds, target, loot, and wave validation.
- Disconnect grace and reconnect state restoration.
- Room expiry and match-end summary.

### Client/source contracts

- Co-op entry point and lobby accessibility labels.
- No campaign/watch render path requires a WebSocket.
- Mobile co-op lobby and combat status remain touch-safe.
- Multiplayer overlays do not reintroduce the menu stacking regression.

### Verification

Run the existing test suite, the new room/simulation tests, lint, typecheck, and production build. Before enabling the button in production, run two browser sessions against the deployed WebSocket endpoint and verify join, shared loot, wave transition, disconnect/reconnect, and victory/defeat.

## Rollout

1. Implement the room protocol and server simulation behind a feature flag.
2. Add a local in-memory room adapter for tests and local development.
3. Add the co-op lobby and a disabled-state explanation when the WebSocket endpoint is unavailable.
4. Deploy the Worker/Durable Object and set the public endpoint.
5. Enable two-player rooms for a small playtest.
6. Only after the loop is stable, design accounts and persistent co-op achievements.

## Open implementation prerequisite

The live site currently deploys the game, but the repository does not yet expose a multiplayer WebSocket/Durable Object binding. Implementation can build the adapter, protocol, lobby, and feature flag without credentials; production co-op activation requires a provisioned Durable Object binding and public WebSocket endpoint.
