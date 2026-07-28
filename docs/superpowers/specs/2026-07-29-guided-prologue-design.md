# Freeman Protocol Guided Prologue Design

## Goal

Make the first session welcoming on desktop and mobile while preserving the
game's strategic identity: earn Compute, invest it in an AI army and automated
defenses, issue useful orders, and compound those advantages across waves.

The design also fixes the input-state bug that can make the operator continue
running after the player releases a key or touch control.

## Current Problems

- Movement input can remain active after focus loss, pause and resume, a new
  mission, or an interrupted touch gesture.
- Wave one starts immediately with fourteen initial enemies and scheduled
  reinforcements.
- Players must learn movement, attacks, recruitment, sentries, squad orders,
  and Compute allocation while already taking damage.
- Mobile players have less screen space and less precise controls, making an
  early defeat especially discouraging.
- The opening presents the game as direct action before demonstrating that
  resource allocation and the AI army are the primary source of power.

## Experience Overview

The first mission starts with a short guided prologue. Only one objective is
active at a time, and each objective is completed through normal gameplay
controls rather than a separate tutorial scene.

The sequence is:

1. Move the operator into a marked training zone.
2. Shoot three slow, non-lethal training viruses.
3. Receive enough Compute to recruit KAIROS.
4. Recruit KAIROS.
5. Set the squad order to `GUARD CORE`.
6. Let KAIROS help contain a small breach.
7. Begin the reduced first real wave.

The prologue should take approximately 60–90 seconds for a new player and much
less for an experienced player. A visible `SKIP TUTORIAL` action starts the
normal mission immediately.

## Tutorial State

Add an explicit tutorial state machine shared by the WebGL and Canvas
renderers. The React interface owns tutorial presentation, while each engine
reports gameplay events required to advance the sequence.

The states are:

- `move`
- `shoot`
- `recruit`
- `command`
- `observe`
- `complete`
- `skipped`

Starting a first-time mission enters `move`. Completing a step advances to the
next state and updates the objective banner. Tutorial completion is stored in
local storage. Returning players still see a tutorial option on the intro or
controls screen, but `START MISSION` may begin regular play directly.

The state machine must not depend on elapsed time for completion. It advances
only when the required player action or game event occurs. Finishing the three
training enemies ends `shoot`, awards the KAIROS recruitment budget, and
advances directly to `recruit`.

## Protection and Failure Recovery

During tutorial states before `complete`:

- The operator and Core cannot fall below one health.
- Training enemies deal low damage and cannot create reinforcements.
- The tutorial pauses enemy pressure while recruitment or squad-order panels
  require attention.

The first real wave is reduced and forgiving:

- Eight viruses and one phisher.
- One delayed reinforcement group of three viruses.
- Enemy damage is reduced for wave one only.
- Reinforcements do not begin until the tutorial is complete.

If a player who completed the tutorial loses the first real wave, `RETRY WAVE`
restarts wave one while retaining their recruited agents, Compute spending,
sentries, and tutorial completion. Health and Core health are restored. Score
earned during the failed attempt is not duplicated. The checkpoint is captured
immediately before the first real wave begins and restored atomically.

Later defeats continue to restart the whole mission as they do now.

## Resource-Led Teaching

Tutorial language consistently explains the resource loop:

> Destroy threats to earn Compute. Spend it on AI agents and sentries. Give
> your squad the right order, then upgrade the army between breaches.

KAIROS is the first guided recruit because it is the cheapest agent and its
slow effect is easy to understand. The recruitment step grants only the
additional Compute needed to afford KAIROS, so existing balances remain
explicit and testable.

The `observe` step creates a small breach near the Core and asks the player to
watch KAIROS operate under `GUARD CORE`. The player may still shoot. Completion
requires the breach to be cleared, demonstrating that the AI army is useful
without making the player passive.

## Input-State Fix

Create one input-reset operation in each engine. It clears:

- Held keyboard keys.
- Touch movement.
- Active drag or pointer identifiers.
- Any visible virtual-stick displacement.

Invoke it when:

- Starting or restarting a mission.
- Pausing or leaving active play.
- The window loses focus.
- The document becomes hidden.
- A pointer is cancelled or capture is lost.
- The virtual stick unmounts.

The virtual stick uses a small dead zone before emitting movement and resets on
`pointerup`, `pointercancel`, and `lostpointercapture`. Movement remains
camera-relative, so up on the stick and `W` both move toward the top of the
current camera view.

## Mobile Presentation

- Show one compact tutorial card above the bottom controls.
- Highlight only the control or panel needed for the current step.
- Use short action labels such as `MOVE INTO THE RING` and `RECRUIT KAIROS`.
- Keep the virtual stick and primary attack button fully visible.
- Automatically open the AI team panel for the recruitment and command steps,
  then close it after completion.
- Preserve touch auto-targeting so the player can focus on movement and
  resource decisions.
- Make the skip action reachable without covering combat controls.

Desktop uses the same state machine and copy, with keyboard and mouse hints
substituted for touch hints.

## Component Boundaries

### Tutorial Rules Module

A small pure module defines state transitions, first-wave composition,
protection rules, and first-wave retry eligibility. It has no rendering or DOM
dependencies and is covered by unit tests.

### Game Engines

Both engines emit tutorial events and consume the same tutorial rules. They
remain responsible for spawning enemies, applying protection, resetting input,
and restoring a wave-one checkpoint.

### React Interface

The interface renders tutorial objectives, skip and retry actions, highlights,
and responsive instructions. It does not duplicate combat rules.

## Error Handling

- If local storage is unavailable, the tutorial runs and completion is simply
  not persisted.
- If WebGL is unavailable, the Canvas fallback follows the identical tutorial
  state sequence.
- Repeated or out-of-order tutorial events are ignored.
- Skipping the tutorial clears tutorial enemies and input before spawning the
  normal first wave.
- A retry clears active enemies, projectiles, effects, and latched input before
  restoring the checkpoint.

## Testing

Use test-driven development for each behavior:

- Input resets on start, pause, blur, visibility change, pointer cancellation,
  lost pointer capture, and stick unmount.
- Dead-zone input emits zero movement.
- Tutorial steps accept only the expected event and advance in order.
- Tutorial enemies cannot defeat the operator or Core.
- Skipping clears tutorial state and starts normal play.
- First-wave composition and reinforcement timing match the design.
- First-wave retry restores the strategic checkpoint without duplicating score.
- Tutorial completion persists when storage is available.
- WebGL and Canvas source contracts consume the shared rules.
- Mobile layout keeps the tutorial card, stick, attack button, and AI panel
  usable at representative portrait and landscape sizes.

Manual verification covers desktop keyboard and mouse, mobile emulation, focus
loss while moving, interrupted touch input, tutorial completion, tutorial
skipping, first-wave defeat and retry, and the Canvas fallback.

## Success Criteria

- Releasing or interrupting movement never leaves the operator moving.
- A first-time player encounters no lethal pressure before learning movement,
  shooting, recruitment, and a squad order.
- The tutorial communicates that Compute allocation and AI-army management are
  the main strategy.
- New players can retry a failed first wave without repeating the tutorial or
  losing their strategic setup.
- Returning players can reach normal wave one immediately.
- Desktop and mobile use the same gameplay rules and progression.
