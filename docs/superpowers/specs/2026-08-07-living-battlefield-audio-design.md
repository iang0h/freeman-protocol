# Living Battlefield, Reliable Audio, and Strategic Base Nodes

## Status

Approved direction: fixed strategic nodes with one clear job each.

## Problem

The soundtrack can be silent after a previous audio preference is restored: the
audio manager reads the persisted mute flag while the React HUD starts with an
independent `AUDIO ON` value. Media playback failures are also swallowed, so a
blocked or unloaded track gives no recovery path.

Late waves technically continue to tick, but the battle reads as frozen. Threats
stop at their attack radius and agents orbit a shared Core anchor, so wave four
and later become a cluster of hovering figures instead of a readable battle.

The game also needs more strategic work for the player and more visible
autonomous activity without creating an unbounded swarm or a crowded HUD.

## Goals

1. Make music start reliably from the start gesture, keep the HUD state honest,
   and provide a visible retry affordance if the browser blocks playback.
2. Keep every late-wave threat engaged: threats must advance through a lane,
   periodically re-path, and visibly attack, retreat, or reposition rather than
   orbiting indefinitely at a shared radius.
3. Add five fixed, meaningful battlefield nodes:
   - **Core**: mission-loss target and protected repair priority.
   - **Command Uplink**: increases autonomous decision quality and agent rally
     range while online.
   - **Repair Bay**: heals damaged agents and friendly structures over time.
   - **Barracks / Assembly Pad**: converts collected Components into bounded
     temporary sub-minion squads and occasional support units.
   - **Compute Relay**: produces Compute when held and attracts enemy raids.
4. Make nodes destructible and repairable. Enemy attacks can disable a node;
   agents can repair it by spending the appropriate materials and returning to
   the node.
5. Make agents and their sub-agents look alive: each parent can maintain at
   most four temporary minions, with a global cap, finite lifetimes, attack
   assignments, and automatic retirement. Minions use pooled runtime objects.
6. Add bounded cinematic support units (ground convoy/tank and short-lived air
   strike) as events driven by the Assembly Pad, not as permanent entities.
7. Preserve a readable tactical view: nodes are visually distinct, secondary
   telemetry stays in existing panels, and no new full-screen combat overlay is
   added.

## Non-goals

- Free-form building placement.
- Persistent online simulation while the tab is closed.
- A complete vehicle physics or multiplayer combat system.
- Increasing the active enemy/minion count without a hard pool or cap.

## Design

### Audio

`AudioManager` exposes a read-only settings snapshot (`muted`, music volume,
SFX volume) so the component hydrates the controls from the same persisted
source. Starting a mission calls an idempotent `startMusic()` flow that creates
the graph, calls `load()` after changing a source, and tries playback from the
user gesture. A failed promise is recorded as `blocked` and retried on
`canplay`, visibility return, or an explicit `ENABLE AUDIO` action. The HUD
shows `AUDIO ON`, `AUDIO OFF`, or `TAP TO ENABLE AUDIO` based on the snapshot;
it never claims music is on while the active player is blocked or muted.

### Engagement lanes

Each wave gets a small set of approach lanes terminating at a strategic node.
Normal threats receive a lane target and an attack target separately. They
advance to a staging point, commit to an attack telegraph, then either strike,
reposition to the next staging point, or retarget a damaged node. A movement
watchdog forces a direct advance and a fresh lane assignment after a short
stall. The existing arrival radius remains the attack boundary, but being inside
that boundary no longer means “do nothing”: attack cooldowns and reposition
timers guarantee visible action.

Agents use node priorities based on watch-mode priority and node health:
repair disabled nodes first, defend the Core second, gather from the Compute
Relay third, and assault the current breach when the base is stable. A parent
agent’s sub-minions inherit the parent assignment with a small spread so the
group reads as a squad instead of a stack.

### Strategic nodes

Node state is pure data: `id`, `kind`, position, health/max health, online
state, repair cost, and effect. A node transitions `online -> damaged ->
offline`; offline nodes stop producing/boosting but remain repairable. Damage
and repair are deterministic and capped. The node rules module owns effects so
both WebGL and Canvas use identical behavior.

### Autonomous war layer

The Assembly Pad emits a temporary squad only when Components are available and
the global temporary-unit budget has room. A squad has a parent id, faction,
role, lifetime, target id, and cooldown. Roles are `screen` (intercepts mobs),
`repair` (returns to a damaged node), and `raider` (pressures an enemy lane).
Parent agents can spawn no more than four at once; the global cap and existing
bounded pools remain authoritative. Squads attack, take damage, flash on hit,
and expire after 10–20 seconds depending on upgrades.

The Assembly Pad may also trigger one support event at a time: a ground convoy
that crosses a lane and fires at threats, or a brief air strike telegraph that
damages a marked cluster. Both are pooled visual/effect events with fixed
cooldowns and no permanent pathfinding entities.

### Presentation

Nodes get distinct low-poly silhouettes and rings: cyan Repair Bay, amber
Command Uplink, violet Compute Relay, and orange Assembly Pad. Node health is
shown only when damaged. New war events use existing hit/kill/burst feedback,
short labels, and camera focus hooks so the cinematic view can follow a breach,
repair, or support strike without adding another dashboard.

## Acceptance criteria

- A fresh start with a persisted muted value displays the correct audio state;
  an unmuted start either plays a track or shows the explicit enable affordance.
- Pressing `ENABLE AUDIO` after a blocked start begins the current track without
  restarting the mission.
- A watch-mode run at 4x reaches wave 4 and wave 5 with changing enemy/agent
  positions and at least one attack, repair, or reposition event every few
  seconds; it does not remain a static Core cluster.
- At least three distinct strategic nodes can be damaged, repaired, and shown
  offline in a deterministic simulation test.
- Parent/global minion caps, expiry, damage, and repair behavior pass pure-rule
  tests; no per-frame unbounded allocations are introduced.
- Both WebGL and Canvas use the same node, lane, and autonomous-war rules.
- Existing campaign, watch, co-op, mobile touch, and asset-catalog tests remain
  green.

## Test strategy

- Add pure tests first for audio state transitions, lane assignment/forced
  repath, node damage/repair/effects, and bounded squad lifecycle.
- Add source-contract assertions that both renderers call the shared rules and
  that the UI exposes the audio retry state.
- Run the full Node test suite, TypeScript check, direct Vinext build, artifact
  validation, and desktop/mobile browser smoke tests including watch mode.
