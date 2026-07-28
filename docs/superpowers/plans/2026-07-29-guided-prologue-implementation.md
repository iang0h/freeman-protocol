# Freeman Protocol Guided Prologue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix latched movement and add a safe, mobile-friendly guided prologue that teaches players to turn Compute into an effective AI army before the first real wave.

**Architecture:** Put tutorial progression, first-wave balance, retry eligibility, and joystick normalization in small pure modules. Both the WebGL and Canvas engines consume those rules and expose the same controller interface; React owns persistence and presentation but does not duplicate combat rules.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Three.js 0.181, Canvas 2D fallback, CSS, Node.js built-in test runner.

## Global Constraints

- The guided prologue contains the exact ordered states `move`, `shoot`, `recruit`, `command`, `observe`, `complete`, and `skipped`.
- The prologue must advance only from required player actions or game events, never elapsed time.
- Tutorial enemies and the player cannot reduce the operator or Core below one health before tutorial completion.
- The first real wave contains eight viruses and one phisher, followed by one delayed reinforcement group of three viruses.
- A wave-one retry restores the checkpoint captured immediately before the first real wave and cannot duplicate score.
- Returning players can skip directly to the reduced first real wave.
- Both WebGL and Canvas renderers must use the same rules and expose identical behavior.
- Do not add a dependency; use the existing Node test runner and source-contract tests.

---

## File Structure

- Create `app/game/tutorial-rules.mjs`: pure tutorial transitions, balance constants, protection, and retry rules.
- Create `app/game/input-rules.mjs`: pure joystick dead-zone and clamping logic.
- Modify `app/FreemanProtocol.tsx`: controller interfaces, both engine implementations, checkpointing, input resets, persistence callbacks, tutorial UI, and retry actions.
- Modify `app/globals.css`: tutorial card, highlights, skip action, and mobile layouts.
- Modify `tests/game-systems.test.mjs`: behavioral tests for pure tutorial and input rules.
- Modify `tests/game-source-contracts.test.mjs`: renderer-parity and input-lifecycle contracts.
- Modify `tests/mobile-layout.test.mjs`: mobile tutorial visibility and control-clearance contracts.

### Task 1: Shared Tutorial and Input Rules

**Files:**
- Create: `app/game/tutorial-rules.mjs`
- Create: `app/game/input-rules.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- Produces: `TUTORIAL_STEPS`, `FIRST_WAVE`, `advanceTutorial(step, event)`, `isTutorialProtected(step)`, `canRetryFirstWave(state)`, and `normalizeStickInput(x, y, deadZone?)`.
- Consumes: no game engine or DOM state.

- [ ] **Step 1: Write failing tutorial-rule tests**

Append to `tests/game-systems.test.mjs`:

```js
import {
  FIRST_WAVE,
  TUTORIAL_STEPS,
  advanceTutorial,
  canRetryFirstWave,
  isTutorialProtected,
} from "../app/game/tutorial-rules.mjs";
import { normalizeStickInput } from "../app/game/input-rules.mjs";

test("tutorial advances only from the expected event", () => {
  assert.deepEqual(TUTORIAL_STEPS, [
    "move",
    "shoot",
    "recruit",
    "command",
    "observe",
    "complete",
    "skipped",
  ]);
  assert.equal(advanceTutorial("move", "enemy-defeated"), "move");
  assert.equal(advanceTutorial("move", "movement-complete"), "shoot");
  assert.equal(advanceTutorial("shoot", "training-cleared"), "recruit");
  assert.equal(advanceTutorial("recruit", "kairos-recruited"), "command");
  assert.equal(advanceTutorial("command", "guard-selected"), "observe");
  assert.equal(advanceTutorial("observe", "breach-cleared"), "complete");
  assert.equal(advanceTutorial("complete", "movement-complete"), "complete");
});

test("tutorial protection and first-wave retry are explicit", () => {
  assert.equal(isTutorialProtected("move"), true);
  assert.equal(isTutorialProtected("observe"), true);
  assert.equal(isTutorialProtected("complete"), false);
  assert.equal(isTutorialProtected("skipped"), false);
  assert.equal(
    canRetryFirstWave({ wave: 1, tutorialResolved: true, checkpoint: true }),
    true,
  );
  assert.equal(
    canRetryFirstWave({ wave: 2, tutorialResolved: true, checkpoint: true }),
    false,
  );
  assert.deepEqual(FIRST_WAVE.initial, [
    "virus", "virus", "virus", "virus",
    "virus", "virus", "virus", "virus",
    "phisher",
  ]);
  assert.deepEqual(FIRST_WAVE.reinforcement, ["virus", "virus", "virus"]);
  assert.equal(FIRST_WAVE.damageMultiplier, 0.72);
});

test("virtual stick applies a dead zone and preserves direction", () => {
  assert.deepEqual(normalizeStickInput(0.05, -0.04), { x: 0, y: 0 });
  assert.deepEqual(normalizeStickInput(2, 0), { x: 1, y: 0 });
  const diagonal = normalizeStickInput(0.6, 0.8);
  assert.equal(diagonal.x, 0.6);
  assert.equal(diagonal.y, 0.8);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test tests/game-systems.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tutorial-rules.mjs`.

- [ ] **Step 3: Implement the pure rules**

Create `app/game/tutorial-rules.mjs`:

```js
export const TUTORIAL_STEPS = Object.freeze([
  "move",
  "shoot",
  "recruit",
  "command",
  "observe",
  "complete",
  "skipped",
]);

const TRANSITIONS = Object.freeze({
  move: { "movement-complete": "shoot" },
  shoot: { "training-cleared": "recruit" },
  recruit: { "kairos-recruited": "command" },
  command: { "guard-selected": "observe" },
  observe: { "breach-cleared": "complete" },
  complete: {},
  skipped: {},
});

export const FIRST_WAVE = Object.freeze({
  initial: Object.freeze([
    "virus", "virus", "virus", "virus",
    "virus", "virus", "virus", "virus",
    "phisher",
  ]),
  reinforcement: Object.freeze(["virus", "virus", "virus"]),
  reinforcementDelay: 9,
  damageMultiplier: 0.72,
});

export function advanceTutorial(step, event) {
  return TRANSITIONS[step]?.[event] ?? step;
}

export function isTutorialProtected(step) {
  return step !== null && step !== "complete" && step !== "skipped";
}

export function canRetryFirstWave({ wave, tutorialResolved, checkpoint }) {
  return wave === 1 && tutorialResolved && checkpoint;
}
```

Create `app/game/input-rules.mjs`:

```js
export function normalizeStickInput(x, y, deadZone = 0.12) {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
node --test tests/game-systems.test.mjs
```

Expected: all game-system tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/game/tutorial-rules.mjs app/game/input-rules.mjs tests/game-systems.test.mjs
git commit -m "test: define guided prologue rules"
```

### Task 2: Resilient Keyboard and Touch Input

**Files:**
- Modify: `app/FreemanProtocol.tsx:80-110`
- Modify: `app/FreemanProtocol.tsx:560-1160`
- Modify: `app/FreemanProtocol.tsx:3990-4520`
- Modify: `app/FreemanProtocol.tsx:6569-6624`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: `normalizeStickInput(x, y, deadZone?)`.
- Produces: `resetInput()` in both engines and a self-resetting `VirtualStick`.

- [ ] **Step 1: Write failing input lifecycle contracts**

Append to `tests/game-source-contracts.test.mjs`:

```js
test("both engines clear latched input across lifecycle boundaries", () => {
  assert.ok((game.match(/private resetInput\(\)/g) ?? []).length >= 2);
  assert.ok((game.match(/window\.addEventListener\("blur", this\.resetInput\)/g) ?? []).length >= 2);
  assert.ok((game.match(/document\.addEventListener\("visibilitychange", this\.onVisibilityChange\)/g) ?? []).length >= 2);
  assert.ok((game.match(/this\.resetInput\(\);/g) ?? []).length >= 8);
  assert.match(game, /onLostPointerCapture=\{reset\}/);
  assert.match(game, /normalizeStickInput/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test tests/game-source-contracts.test.mjs
```

Expected: FAIL at `both engines clear latched input`.

- [ ] **Step 3: Implement engine input resets**

Import `normalizeStickInput` and add this pattern to both engines, using
`this.touchMove.set(0, 0)` for WebGL and assignments for Canvas:

```ts
private resetInput = () => {
  this.keys.clear();
  this.touchMove.set(0, 0);
  if (
    this.dragPointer !== null &&
    this.canvas.hasPointerCapture(this.dragPointer)
  ) {
    this.canvas.releasePointerCapture(this.dragPointer);
  }
  this.dragPointer = null;
  this.playerMoving = false;
};

private onVisibilityChange = () => {
  if (document.hidden) this.resetInput();
};
```

Canvas uses:

```ts
private resetInput = () => {
  this.keys.clear();
  this.touchMove.x = 0;
  this.touchMove.y = 0;
  if (
    this.dragPointer !== null &&
    this.canvas.hasPointerCapture(this.dragPointer)
  ) {
    this.canvas.releasePointerCapture(this.dragPointer);
  }
  this.dragPointer = null;
};
```

Register and unregister `blur`, `visibilitychange`, and
`lostpointercapture`. Call `resetInput()` at the start of `start()`, before
entering pause, inside both pointer-cancel paths, and from `dispose()`.

- [ ] **Step 4: Make the virtual stick reset itself**

Replace the duplicated pointer-end code with:

```tsx
const reset = useCallback(() => {
  pointerRef.current = null;
  setPosition({ x: 0, y: 0 });
  onMove(0, 0);
}, [onMove]);

useEffect(() => {
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
  return () => {
    window.removeEventListener("blur", reset);
    document.removeEventListener("visibilitychange", reset);
    reset();
  };
}, [reset]);
```

In `update()`, normalize the stick values before emitting:

```tsx
const normalized = normalizeStickInput(
  x / (radius * 0.66),
  y / (radius * 0.66),
);
onMove(normalized.x, normalized.y);
```

Use `reset` for `onPointerUp`, `onPointerCancel`, and
`onLostPointerCapture`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "fix: clear latched movement input"
```

### Task 3: WebGL Guided Prologue and Wave-One Checkpoint

**Files:**
- Modify: `app/FreemanProtocol.tsx:35-110`
- Modify: `app/FreemanProtocol.tsx:560-1160`
- Modify: `app/FreemanProtocol.tsx:2160-3260`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: `advanceTutorial`, `FIRST_WAVE`, `isTutorialProtected`, and `canRetryFirstWave`.
- Produces: `start({ tutorial })`, `skipTutorial()`, `retryWave()`, `TutorialStep`, `TutorialEvent`, HUD fields `tutorialStep` and `canRetryWave`, and callback `onTutorialComplete`.

- [ ] **Step 1: Write failing WebGL contracts**

Append:

```js
test("WebGL engine runs the shared tutorial and checkpoints wave one", () => {
  assert.match(webglGame, /advanceTutorial/);
  assert.match(webglGame, /FIRST_WAVE\.initial/);
  assert.match(webglGame, /isTutorialProtected/);
  assert.match(webglGame, /private firstWaveCheckpoint/);
  assert.match(webglGame, /retryWave\(\)/);
  assert.match(webglGame, /onTutorialComplete/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test tests/game-source-contracts.test.mjs
```

Expected: FAIL at the new WebGL contract.

- [ ] **Step 3: Extend shared types and controller interfaces**

Add:

```ts
type TutorialStep =
  | "move" | "shoot" | "recruit" | "command"
  | "observe" | "complete" | "skipped";
type TutorialEvent =
  | "movement-complete" | "training-cleared" | "kairos-recruited"
  | "guard-selected" | "breach-cleared";
type StartOptions = { tutorial: boolean };

type FirstWaveCheckpoint = {
  data: number;
  score: number;
  agents: AgentId[];
  defenses: Array<{ x: number; z: number }>;
  command: SquadCommand;
};
```

Update `GameController`:

```ts
start(options?: StartOptions): void;
skipTutorial(): void;
retryWave(): void;
```

Add `tutorialStep: TutorialStep | null` and `canRetryWave: boolean` to
`HudState`, and `onTutorialComplete(): void` to `GameCallbacks`.

- [ ] **Step 4: Add WebGL tutorial transitions**

Add engine fields:

```ts
private tutorialStep: TutorialStep | null = null;
private tutorialMoveDistance = 0;
private tutorialKills = 0;
private firstWaveCheckpoint: FirstWaveCheckpoint | null = null;
```

Change `start()` to initialize either the tutorial or real wave:

```ts
start(options: StartOptions = { tutorial: false }) {
  this.resetInput();
  this.audio.unlock();
  this.resetMissionState();
  if (options.tutorial) {
    this.tutorialStep = "move";
    this.mode = "playing";
    this.callbacks.onMode("playing");
    this.emitHud(true);
    return;
  }
  this.resolveTutorial("skipped");
}
```

Extract the existing mission initialization into the defined helper used
above:

```ts
private resetMissionState() {
  this.clearDynamic();
  this.wave = 1;
  this.score = 0;
  this.data = 55;
  this.attackMultiplier = 1;
  this.agentRateMultiplier = 1;
  this.agentDamageMultiplier = 1;
  this.empMultiplier = 1;
  this.upgradeStacks = { ...EMPTY_UPGRADE_STACKS };
  this.evolutions = { ...EMPTY_EVOLUTIONS };
  this.squadCommand = "follow";
  this.firstWaveCheckpoint = null;
  this.tutorialMoveDistance = 0;
  this.tutorialKills = 0;
  this.reinforcementClock = 0;
  this.reinforcementsRemaining = 0;
  this.spawnQueue = [];
  this.nextQueueReleaseAt = 0;
  this.scheduledReinforcementThreats = 0;
  this.player.hp = this.player.maxHp = 100;
  this.player.damage = 25;
  this.player.attackCooldown = 0;
  this.player.meleeCooldown = 0;
  this.player.dashCooldown = 0;
  this.player.ultimate = 0;
  this.player.group.position.set(0, 0, 2.7);
  this.core.hp = this.core.maxHp = 180;
}
```

Implement ordered transitions:

```ts
private emitTutorialEvent(event: TutorialEvent) {
  if (!this.tutorialStep) return;
  const next = advanceTutorial(this.tutorialStep, event) as TutorialStep;
  if (next === this.tutorialStep) return;
  this.tutorialStep = next;
  if (next === "recruit") this.data = Math.max(this.data, AGENTS[0].cost);
  if (next === "observe") this.spawnTutorialBreach();
  if (next === "complete") this.resolveTutorial("complete");
  this.emitHud(true);
}
```

Define the tutorial entry and exit paths:

```ts
skipTutorial() {
  if (!this.tutorialStep || this.tutorialStep === "complete") return;
  this.resolveTutorial("skipped");
}

private resolveTutorial(result: "complete" | "skipped") {
  this.clearTutorialThreats();
  this.tutorialStep = result;
  this.callbacks.onTutorialComplete();
  this.captureFirstWaveCheckpoint();
  this.spawnWave(1);
  this.audio.play("wave");
  this.emitHud(true);
}
```

When `move` begins, place a visible training ring at `(0, 0, -0.5)`.
Accumulate actual operator displacement until `2.5` world units and require
the operator to enter within `1.25` units of the ring center. On entering
`shoot`, remove the marker and spawn exactly three tutorial viruses with
`speed = 0.65`, `damage = 2`, and no scheduled reinforcements. Mark them as
tutorial threats so three confirmed deaths emit `training-cleared`. Then
advance when KAIROS is recruited, advance when `GUARD CORE` is selected, and
complete when the observe breach is empty.

- [ ] **Step 5: Add wave-one protection, balance, and retry**

In `damageTarget()`:

```ts
const floor = isTutorialProtected(this.tutorialStep) ? 1 : 0;
this.player.hp = Math.max(floor, this.player.hp - damage);
```

Use the same floor for the Core. Change `spawnWave(1)` to use
`FIRST_WAVE.initial`, schedule exactly `FIRST_WAVE.reinforcement` after
`FIRST_WAVE.reinforcementDelay`, and multiply enemy damage by
`FIRST_WAVE.damageMultiplier` only at wave one.

Capture the checkpoint immediately before the real first wave. Implement
`retryWave()` by clearing dynamic objects and restoring Compute, score,
recruits, sentries, command, full health, and full Core health from that
checkpoint before respawning wave one.

Use explicit checkpoint helpers:

```ts
private captureFirstWaveCheckpoint() {
  this.firstWaveCheckpoint = {
    data: this.data,
    score: this.score,
    agents: this.agents.map((agent) => agent.id),
    defenses: this.defenses.map((defense) => ({
      x: defense.group.position.x,
      z: defense.group.position.z,
    })),
    command: this.squadCommand,
  };
}

retryWave() {
  if (!canRetryFirstWave({
    wave: this.wave,
    tutorialResolved:
      this.tutorialStep === "complete" || this.tutorialStep === "skipped",
    checkpoint: this.firstWaveCheckpoint !== null,
  })) return;
  const checkpoint = this.firstWaveCheckpoint!;
  this.resetInput();
  this.clearDynamic();
  this.data = checkpoint.data;
  this.score = checkpoint.score;
  this.squadCommand = checkpoint.command;
  this.player.hp = this.player.maxHp;
  this.core.hp = this.core.maxHp;
  for (const id of checkpoint.agents) this.restoreAgent(id);
  for (const position of checkpoint.defenses) this.restoreDefense(position);
  this.mode = "playing";
  this.callbacks.onMode("playing");
  this.spawnWave(1);
  this.emitHud(true);
}
```

Refactor normal construction behind these exact methods so purchase and restore
cannot drift:

```ts
private addAgent(
  id: AgentId,
  options: { charge: boolean; notify: boolean },
): boolean;

private addDefense(
  position: { x: number; z: number },
  options: { charge: boolean; notify: boolean },
): boolean;

private restoreAgent(id: AgentId) {
  this.addAgent(id, { charge: false, notify: false });
}

private restoreDefense(position: { x: number; z: number }) {
  this.addDefense(position, { charge: false, notify: false });
}
```

`recruit()` delegates to `addAgent(id, { charge: true, notify: true })`;
normal sentry placement delegates to
`addDefense(position, { charge: true, notify: true })`. The helpers return
`false` before mutation when the normal affordability, duplication, capacity,
or placement checks fail.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "feat: add WebGL guided prologue"
```

### Task 4: Canvas Renderer Parity

**Files:**
- Modify: `app/FreemanProtocol.tsx:3990-6556`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: all types and pure rules introduced in Tasks 1 and 3.
- Produces: Canvas behavior matching every `GameController` method and HUD field.

- [ ] **Step 1: Write failing Canvas parity contract**

Add:

```js
const canvasGame = game.slice(
  game.indexOf("class FreemanCanvasEngine"),
  game.indexOf("function VirtualStick"),
);

test("Canvas fallback matches tutorial and retry behavior", () => {
  for (const pattern of [
    /advanceTutorial/,
    /FIRST_WAVE\.initial/,
    /isTutorialProtected/,
    /private firstWaveCheckpoint/,
    /retryWave\(\)/,
    /onTutorialComplete/,
  ]) {
    assert.match(canvasGame, pattern);
  }
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test tests/game-source-contracts.test.mjs
```

Expected: FAIL at `Canvas fallback matches tutorial and retry behavior`.

- [ ] **Step 3: Port the state machine without renderer-specific duplication**

Mirror the WebGL tutorial fields and method names in `FreemanCanvasEngine`.
Represent checkpoints with primitive `{x, z}` positions. Use the same
transition events, exact movement threshold, exact training counts, protection
floor, first-wave composition, damage multiplier, and retry restoration.

Canvas-specific tutorial spawning must call existing flat helpers:

```ts
private spawnTutorialBreach() {
  this.clearTutorialThreats();
  this.createEnemy("virus", -2.2, -1.8);
  this.createEnemy("virus", 0, -2.6);
  this.createEnemy("virus", 2.2, -1.8);
}
```

Ensure `skipTutorial()` removes tutorial threats before calling the shared
first-wave start path. Define `clearTutorialThreats()` in each renderer to
remove only enemies marked `tutorial: true`; WebGL also disposes their groups,
while Canvas removes the matching array entries. Mirror the checkpoint helpers
with primitive `{x, z}` positions and restore agents and sentries without
charging Compute.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "feat: mirror tutorial in Canvas fallback"
```

### Task 5: First-Time Persistence and Tutorial Interface

**Files:**
- Modify: `app/FreemanProtocol.tsx:6626-7420`
- Modify: `app/globals.css:286-340`
- Modify: `app/globals.css:1018-1085`
- Modify: `app/globals.css:1653-2280`
- Modify: `tests/mobile-layout.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: HUD `tutorialStep`, HUD `canRetryWave`, controller `start`, `skipTutorial`, and `retryWave`.
- Produces: persisted key `freeman-tutorial-complete`, tutorial card, highlighted controls, skip action, and wave-one retry action.

- [ ] **Step 1: Write failing UI contracts**

Append to `tests/mobile-layout.test.mjs`:

```js
test("keeps the guided tutorial clear of mobile combat controls", () => {
  assert.match(game, /tutorial-card/);
  assert.match(game, /SKIP TUTORIAL/);
  assert.match(styles, /\.tutorial-card/);
  assert.match(styles, /bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 112px\)/);
  assert.match(styles, /\.tutorial-highlight/);
});
```

Append to `tests/game-source-contracts.test.mjs`:

```js
test("persists completion and offers a first-wave retry", () => {
  assert.match(game, /freeman-tutorial-complete/);
  assert.match(game, /RETRY WAVE/);
  assert.match(game, /engineRef\.current\?\.retryWave\(\)/);
});
```

- [ ] **Step 2: Run UI contracts and verify RED**

Run:

```bash
node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
```

Expected: both new tests FAIL.

- [ ] **Step 3: Add safe persistence and start routing**

Add:

```ts
const TUTORIAL_STORAGE_KEY = "freeman-tutorial-complete";

const readTutorialComplete = () => {
  try {
    return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};
```

Initialize `tutorialComplete` after mount, pass
`onTutorialComplete` through callbacks, and persist inside `try/catch`.
`START MISSION` calls:

```tsx
engineRef.current?.start({ tutorial: !tutorialComplete });
```

Add a secondary `PLAY TUTORIAL` action for returning players and a
`SKIP TUTORIAL` action while a tutorial step is active.

- [ ] **Step 4: Render one objective at a time**

Define complete copy:

```ts
const TUTORIAL_COPY: Record<
  Exclude<TutorialStep, "complete" | "skipped">,
  { title: string; detail: string; target: string }
> = {
  move: { title: "MOVE INTO THE RING", detail: "Use WASD or the left stick.", target: "move" },
  shoot: { title: "CLEAR 3 TRAINING THREATS", detail: "Shoot with left click, Space, or the attack button.", target: "attack" },
  recruit: { title: "RECRUIT KAIROS", detail: "Spend Compute to add your first AI agent.", target: "agents" },
  command: { title: "ORDER: GUARD CORE", detail: "Tell KAIROS where the army should fight.", target: "agents" },
  observe: { title: "FIGHT WITH YOUR AI ARMY", detail: "Help KAIROS contain the breach.", target: "arena" },
};
```

Render `.tutorial-card` only for active tutorial states. Add
`tutorial-highlight` to the virtual stick, attack button, or agent dock using
the copy target. Automatically open the mobile squad panel for `recruit` and
`command`, and close it on `observe`.

```tsx
useEffect(() => {
  if (hud.tutorialStep === "recruit" || hud.tutorialStep === "command") {
    setMobileSquadOpen(true);
  }
  if (hud.tutorialStep === "observe" || hud.tutorialStep === "complete") {
    setMobileSquadOpen(false);
  }
}, [hud.tutorialStep]);
```

- [ ] **Step 5: Add first-wave retry to defeat UI**

When `mode === "defeat" && hud.canRetryWave`, render:

```tsx
<button
  type="button"
  className="enter-button enter-button--compact"
  onClick={() => engineRef.current?.retryWave()}
>
  <span>RETRY WAVE</span>
  <i>→</i>
</button>
```

Keep `RESTART MISSION` as a secondary action.

- [ ] **Step 6: Add responsive CSS**

Use:

```css
.tutorial-card {
  position: absolute;
  z-index: 28;
  bottom: 120px;
  left: 50%;
  width: min(420px, calc(100vw - 32px));
  padding: 12px 16px;
  border: 1px solid rgba(220, 117, 64, 0.72);
  background: rgba(5, 10, 13, 0.94);
  color: var(--ivory);
  transform: translateX(-50%);
  pointer-events: auto;
}

.tutorial-highlight {
  outline: 2px solid var(--signal);
  outline-offset: 4px;
  animation: tutorial-pulse 1.2s ease-in-out infinite alternate;
}

@media (max-width: 820px) {
  .tutorial-card {
    bottom: calc(env(safe-area-inset-bottom) + 112px);
    width: min(310px, calc(100vw - 28px));
    padding: 8px 10px;
  }
}

@keyframes tutorial-pulse {
  to { filter: drop-shadow(0 0 10px rgba(220, 117, 64, 0.7)); }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-highlight { animation: none; }
}
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 8: Commit**

```bash
git add app/FreemanProtocol.tsx app/globals.css tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
git commit -m "feat: guide new commanders through wave one"
```

### Task 6: Full Verification and Production Readiness

**Files:**
- Modify only if verification reveals a defect in files already in scope.

**Interfaces:**
- Consumes: the completed guided prologue.
- Produces: evidence that both builds, all tests, lint, and mobile/desktop behavior are production-ready.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: verified Vinext build succeeds and all Node tests PASS.

- [ ] **Step 2: Verify the native Vercel build**

Run:

```bash
npx next build
```

Expected: Next.js production build succeeds with `/` and `/asset-catalog`.

- [ ] **Step 3: Run scoped lint**

Run:

```bash
npx eslint app/FreemanProtocol.tsx app/game/tutorial-rules.mjs app/game/input-rules.mjs tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

Expected: zero lint errors.

- [ ] **Step 4: Perform desktop browser verification**

Run the local production build and verify:

1. Hold movement, switch focus away, release, return: operator is stationary.
2. Start a first-time mission: `MOVE INTO THE RING` appears before enemies.
3. Complete all five action stages in order.
4. KAIROS is affordable at recruitment and responds to `GUARD CORE`.
5. The first real wave contains nine initial threats and one later group of three.
6. Lose wave one and choose `RETRY WAVE`: army, sentries, and Compute state persist.
7. Reload after completion: `START MISSION` skips the tutorial and `PLAY TUTORIAL` remains available.
8. Force WebGL context creation to fail and repeat completion and retry in the Canvas fallback.

- [ ] **Step 5: Perform mobile browser verification**

At representative `390×844` portrait and `844×390` landscape sizes, verify:

1. Interrupting the stick with pointer cancellation stops movement.
2. The tutorial card does not overlap the stick or attack button.
3. Recruitment and command steps open the AI panel automatically.
4. Auto-targeting allows all tutorial combat steps without precision aiming.
5. Skip and retry actions remain reachable inside safe areas.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required a correction:

```bash
git add app/FreemanProtocol.tsx app/globals.css app/game tests
git commit -m "fix: harden guided prologue verification"
```

If no correction was needed, do not create an empty commit.

- [ ] **Step 7: Request code review before merge and deployment**

Invoke `superpowers:requesting-code-review`, address any confirmed findings,
then invoke `superpowers:verification-before-completion` before pushing,
merging, or deploying.
