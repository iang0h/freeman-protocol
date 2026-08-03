# Recruit, EMP, Watch Director, and War-Robot Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contextual recruit and EMP prompts, prevent Watch Mode stalls, and replace abstract enemy silhouettes with readable low-poly war robots in both renderers.

**Architecture:** Keep decisions in renderer-independent `app/game/*.mjs` modules. Extend the existing `HudState` callback with transient prompt state, render the prompts in `app/page.tsx`/`FreemanProtocol.tsx`, and keep the current engine controller methods as the only actions. Build robot visuals from reusable Three.js primitives for WebGL and matching canvas silhouettes for fallback; ImageGen supplies a non-critical asset-catalog concept image.

**Tech Stack:** Next.js 16, React, TypeScript, Three.js, Canvas 2D fallback, Node test runner, ImageGen built-in tool.

## Global Constraints

- Prompts must be transient and must not add another persistent dashboard or eight-card roster summary.
- Mobile action targets are at least 44px and secondary resource breakdowns stay hidden on narrow layouts.
- The EMP prompt must work through its button, the existing action button, keyboard `R`, and touch taps.
- Watch Mode must move the operator and agents and recover from negligible movement after roughly two seconds.
- WebGL robot geometry must be lightweight and reuse resources; the generated image must not be required for boot.
- The 2D canvas fallback must show robot silhouettes instead of abstract circles/diamonds.
- No runtime `img2threejs` service or new currency/mechanic is introduced.

---

### Task 1: Add pure transition rules for prompts and Watch Mode movement

**Files:**
- Create: `app/game/watch-director-rules.mjs`
- Modify: `app/game/recruitment-advisor-rules.mjs`
- Modify: `app/game/emp-rules.mjs`
- Test: `tests/game-systems.test.mjs`

**Interfaces:**
- `getWatchDirectorIntent(input, state)` returns `{ state, target, reason, reset }` with `state` equal to `engage`, `collect`, `repair`, `patrol`, or `unstick`; `target` is `{ x, z }`.
- `createWatchDirectorState()` returns `{ mode: "patrol", targetIndex: 0, idleMs: 0, lastX: 0, lastZ: 0 }`.
- `tickWatchDirector(state, input, deltaMs)` returns `{ state, intent }` and increments `idleMs` when movement is below `0.02` units.
- `shouldShowRecruitPrompt(previousAdvice, nextAdvice, dismissedAgentId)` returns a boolean and only returns true for a new affordable `state: "recruit"` candidate.
- `shouldShowEmpReadyPrompt(previousReady, nextReady, dismissed)` returns a boolean for a false-to-true ready transition that has not been dismissed.

- [ ] **Step 1: Write failing tests for watch intent and prompt transitions**

Add tests with the existing `node:test` style:

```js
test("watch director selects loot before patrolling when a safe pickup exists", () => {
  const result = getWatchDirectorIntent({
    operator: { x: 0, z: 0, hpRatio: 1 },
    core: { x: 0, z: 0, hpRatio: 1 },
    threat: null,
    pickup: { x: 3, z: -2, useful: true },
    zones: [{ x: 0, z: 0 }, { x: 6, z: 0 }],
    priority: "farm",
  }, createWatchDirectorState());
  assert.equal(result.intent.state, "collect");
  assert.deepEqual(result.intent.target, { x: 3, z: -2 });
});

test("watch director forces an unstick route after two seconds of no movement", () => {
  const state = { ...createWatchDirectorState(), mode: "engage", idleMs: 1_950, lastX: 0, lastZ: 0 };
  const result = tickWatchDirector(state, {
    operator: { x: 0, z: 0, hpRatio: 1 },
    core: { x: 0, z: 0, hpRatio: 1 },
    threat: { x: 0, z: 0, distance: 0.2 },
    pickup: null,
    zones: [{ x: 0, z: 0 }, { x: 6, z: 0 }],
    priority: "survive",
  }, 100);
  assert.equal(result.intent.state, "unstick");
  assert.equal(result.intent.reset, true);
});

test("recruit prompt only appears when the affordable candidate changes into recruit-ready", () => {
  const affordable = { state: "recruit", agentId: "kairos" };
  assert.equal(shouldShowRecruitPrompt({ state: "save", agentId: "kairos" }, affordable, null), true);
  assert.equal(shouldShowRecruitPrompt(affordable, affordable, null), false);
  assert.equal(shouldShowRecruitPrompt({ state: "save", agentId: "kairos" }, affordable, "kairos"), false);
});

test("EMP prompt only appears on a fresh ready transition", () => {
  assert.equal(shouldShowEmpReadyPrompt(false, true, false), true);
  assert.equal(shouldShowEmpReadyPrompt(true, true, false), false);
  assert.equal(shouldShowEmpReadyPrompt(false, true, true), false);
});
```

Run: `node --test tests/game-systems.test.mjs`

Expected: FAIL because the new module exports and transition helpers do not exist.

- [ ] **Step 2: Implement the minimal pure rules**

Implement immutable, renderer-independent functions. Use the existing arena zones as patrol input; choose `engage` for a threat within 8 units, `repair` below 0.45 operator health or when Core is below 0.55, `collect` for a useful pickup within 12 units when priority is `farm`/`expand`, and `patrol` otherwise. Set `reset: true` and `mode: "unstick"` when `idleMs + deltaMs >= 2_000`.

Add the two transition helpers to the existing rules modules and export them. Compare candidate IDs, not object identity, so HUD snapshots do not spam.

- [ ] **Step 3: Run the focused tests**

Run: `node --test tests/game-systems.test.mjs`

Expected: all existing game-system tests plus the four new tests pass.

- [ ] **Step 4: Commit the rules**

```bash
git add app/game/watch-director-rules.mjs app/game/recruitment-advisor-rules.mjs app/game/emp-rules.mjs tests/game-systems.test.mjs
git commit -m "feat: add watch director and prompt transition rules"
```

### Task 2: Wire transient recruit and EMP prompts into the React HUD

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/mobile-layout.test.mjs`
- Test: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Extend `HudState` with `recruitPrompt: RecruitmentAdvice | null` and `empReadyPrompt: boolean`.
- Keep `GameController.recruit`, `GameController.activateEmp`, and existing co-op action dispatch as the action paths.
- Add `onPromptDismiss(kind: "recruit" | "emp")` state handling in the React layer.

- [ ] **Step 1: Add failing source/layout assertions**

Assert that the rendered page contains `RECRUIT NOW`, `EMP READY`, a dismiss button with an accessible label, `role="status"`, and both campaign/co-op EMP action paths. Assert that mobile prompt CSS defines `min-height: 44px` and a safe-area-aware position.

Run: `node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs`

Expected: FAIL because the prompt markup and state fields are missing.

- [ ] **Step 2: Add transition-aware HUD state in both engines**

Track the previous recruitment advice/candidate and previous EMP-ready boolean on each engine. On a new ready transition, set the corresponding HUD field. Reset dismissals when the candidate changes or after EMP fires. Emit `onToast` activity only once per transition; do not derive prompt visibility directly from every `emitHud` call.

Ensure the WebGL and canvas initial HUD objects include `recruitPrompt: null` and `empReadyPrompt: false`, and that `activateEmp()` clears the ready state before emitting the next HUD snapshot.

- [ ] **Step 3: Render one compact prompt surface**

Render the recruit prompt and EMP prompt in the existing HUD shell, not inside the Warband card grid. The recruit action increments `advisorRequestKey` and focuses/highlights the advised card. The EMP action invokes `activateEmp()` or sends `{ action: "emp" }` in co-op. Dismiss buttons update local state and call the engine dismiss method.

Use `role="status"`, `aria-live="polite"`, keyboard-focusable buttons, and a single-line mobile copy. Keep current full resource/agent detail behind the existing Warband overlay.

- [ ] **Step 4: Add responsive styling**

Add `.combat-prompt`, `.combat-prompt--recruit`, `.combat-prompt--emp`, and `.combat-prompt__dismiss` styles. Desktop uses a small top-left anchored surface; mobile uses `position: fixed`, safe-area insets, `max-width: calc(100vw - 24px)`, and 44px controls. Use the signal/ice palette and a pulsing border only when `prefers-reduced-motion` is not active.

- [ ] **Step 5: Run focused UI/source tests**

Run: `node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs`

Expected: PASS with no existing mobile source-contract regressions.

- [ ] **Step 6: Commit the prompt UI**

```bash
git add app/FreemanProtocol.tsx app/page.tsx app/globals.css tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
git commit -m "feat: add contextual recruit and emp prompts"
```

### Task 3: Integrate the Watch Director into both game engines

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Test: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Both engines own a `WatchDirectorState` and call `tickWatchDirector` only while `sessionMode === "watch"` and `mode === "playing"`.
- The director target is applied to the operator movement layer; existing agent autonomy remains responsible for individual agents.

- [ ] **Step 1: Add the failing integration contract**

Add assertions for `tickWatchDirector`, `createWatchDirectorState`, `unstick`, `WATCH DIRECTOR`, and an activity event when the director resets a route.

Run: `node --test tests/game-source-contracts.test.mjs`

Expected: FAIL until both engines import and use the director.

- [ ] **Step 2: Apply director intents to WebGL Watch Mode**

Replace the current no-target orbit-only fallback in `FreemanEngine.updateWatchOperator` with a director tick. Move toward `intent.target`, attack when the target is a threat in range, and set `recordWatchEvent("WATCH DIRECTOR: ...")` when `intent.reset` is true. Keep the existing pickup collection and player invulnerability rules.

- [ ] **Step 3: Apply director intents to canvas Watch Mode**

Use the same normalized input and target calculation in `FreemanCanvasEngine.updateWatchOperator`. Preserve canvas projection and collision clamping, but use the same `unstick` threshold and activity message so fallback behavior is not a different game.

- [ ] **Step 4: Add an activity-safe wave guard**

When Watch Mode has a playing wave and the director reports `unstick`, release queued enemies immediately if capacity exists and rotate to the next patrol zone. This keeps wave 3 visually active without altering campaign wave completion rules.

- [ ] **Step 5: Run source and game tests**

Run: `node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Watch Mode integration**

```bash
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "fix: keep watch mode moving through every wave"
```

### Task 4: Build low-poly war robots and update the canvas fallback

**Files:**
- Modify: `app/game/three-resources.ts`
- Modify: `app/FreemanProtocol.tsx`
- Test: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Add `createLowPolyWarRobot(type, color, scale)` returning `{ group: THREE.Group, body: THREE.Mesh, animate(delta, moving, hitFlash): void }`.
- The central torso mesh is returned as `body` and is used by `EnemyRuntime` for emissive hit feedback.
- Add `drawRobotEnemy(enemy)` to the canvas engine and call it from `drawEnemy` without changing combat rules.

- [ ] **Step 1: Add failing visual/source contracts**

Assert that the source defines `createLowPolyWarRobot`, robot parts named `robot-head`, `robot-leg-left`, `robot-leg-right`, and `robot-weapon`, and that both `FreemanEngine.createEnemy` and the canvas `drawEnemy` use robot presentation.

Run: `node --test tests/game-source-contracts.test.mjs`

Expected: FAIL before the visual factory is added.

- [ ] **Step 2: Implement the shared Three.js robot factory**

Create low-poly torso/head/legs/weapon/sensor meshes with shared primitive geometries and per-type colors. Use a flat/shaded `MeshStandardMaterial`, keep transparent labels/rings separate, and return the torso as `body`. Animate legs/weapon/head rotation with a small deterministic phase based on the enemy ID; freeze animation when reduced motion is active.

- [ ] **Step 3: Replace WebGL abstract enemy construction**

In `FreemanEngine.createEnemy`, call the factory instead of the single icosahedron/box body. Keep the health bar, resistance rings, jammer zone, boss telegraph, speed, and damage fields unchanged. Update `updateEnemies` to animate the robot and continue using `body.material.emissiveIntensity` for hit flash.

- [ ] **Step 4: Replace canvas abstract enemy drawing**

Implement a projected isometric robot silhouette with a torso, head sensor, two legs, and a weapon/antenna. Use the existing enemy type color and hit flash; preserve health bars, telegraphs, resistance cues, and death bursts. Make rootkit/boss substantially larger and plated.

- [ ] **Step 5: Run visual/source tests**

Run: `node --test tests/game-source-contracts.test.mjs tests/rendered-html.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit robot visuals**

```bash
git add app/game/three-resources.ts app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "feat: replace enemy blobs with low poly war robots"
```

### Task 5: Generate and publish the concept asset

**Files:**
- Create: `public/asset-catalog/war-robot-threat.webp`
- Modify: `app/asset-catalog/AssetCatalog.tsx`
- Modify: `app/asset-catalog/AssetCatalog.module.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- The catalog lists the image with descriptive alt text and a short note that it is a low-poly threat concept.
- No game boot path imports the image.

- [ ] **Step 1: Generate the image with built-in ImageGen**

Use the `image_gen.imagegen` tool with a structured `stylized-concept` prompt: a single low-poly 3D armored cyber war robot, angular torso, red sensor core, weapon arm, dark isometric network arena, orange/ice rim lighting, no text, no watermark, square composition. Save/copy the selected result into `public/asset-catalog/war-robot-threat.webp` as required by the ImageGen skill.

- [ ] **Step 2: Add the catalog card**

Add a card that references `/asset-catalog/war-robot-threat.webp`, includes the title `WAR ROBOT THREAT`, and explains that the runtime uses a lightweight procedural mesh while this render is the art direction reference.

- [ ] **Step 3: Add the catalog contract**

Assert the new image path, title, and alt text appear in rendered catalog source.

Run: `node --test tests/rendered-html.test.mjs`

Expected: PASS.

- [ ] **Step 4: Commit the asset and catalog entry**

```bash
git add public/asset-catalog/war-robot-threat.webp app/asset-catalog/AssetCatalog.tsx app/asset-catalog/AssetCatalog.module.css tests/rendered-html.test.mjs
git commit -m "feat: add war robot concept to asset catalog"
```

### Task 6: Full verification and handoff

**Files:**
- Modify: none unless verification exposes a defect.

- [ ] **Step 1: Run the complete test suite**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Next.js compiles, type-checks, generates all routes, and exits 0.

- [ ] **Step 3: Run a browser smoke check**

Open the game and verify campaign start, recruit prompt action, EMP prompt action, Watch Mode movement through wave 3, mobile prompt sizing, and the asset catalog card. Confirm the custom-domain deployment note remains separate from this feature work.

- [ ] **Step 4: Inspect the final diff and commit history**

Run:

```bash
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors, only intended files changed, and each task commit is visible.

- [ ] **Step 5: Request code review before merging**

Use the requesting-code-review skill with the base SHA before Task 1 and the final HEAD SHA. Address all Critical/Important findings before reporting completion.
