# Campaign and Watch Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add a campaign/watch-mode selector where campaign remains finite and player-led, while Watch Mode runs the existing autonomous network endlessly while the game is open.

**Architecture:** Keep one simulation contract shared by the WebGL and Canvas engines. Add a small pure watch-mode-rules.mjs module for mode state, speed/priority bounds, visibility pause, and reward/session calculations; let each renderer call it from its existing update loop. Extend the React HUD only with mode selection and watch controls, keeping combat, loot, repair, wave, and autonomy primitives reused rather than duplicated.

**Tech Stack:** Next.js/React, TypeScript, Three.js WebGL renderer, Canvas fallback renderer, pure ESM game rule modules, Node test runner, ESLint, TypeScript, Vinext/Vercel.

## Global Constraints

- Watch Mode runs only while the page is open and visible; no offline simulation or server account work in this iteration.
- Campaign remains finite and retains existing controls, objectives, intermissions, upgrades, and victory behavior.
- Watch Mode reuses existing autonomy, wave, loot, repair, progression, and reserve/sub-agent systems.
- Rewards are credited after completed waves and are bounded by explicit session caps.
- Hidden tabs pause deterministically and must not accrue rewards.
- Desktop and Canvas fallback behavior must remain equivalent.

---

### Task 1: Add pure Watch Mode rules and tests

**Files:**
- Create: app/game/watch-mode-rules.mjs
- Modify: tests/game-systems.test.mjs

**Interfaces:**
- Produces WATCH_PRIORITIES, WATCH_SPEEDS, WATCH_REWARD_CAPS, createWatchState(), setWatchSpeed(), setWatchPriority(), tickWatchState(), pauseForVisibility(), creditWatchWaveReward(), and isWatchMode().

- [ ] Step 1: Write failing tests for default state, speed bounds, priority changes, visible ticking, hidden-tab pause, completed-wave reward crediting, and session cap clamping.
- [ ] Step 2: Run node --test tests/game-systems.test.mjs and confirm the new imports/functions fail.
- [ ] Step 3: Implement the pure module with explicit constants: speeds 1, 2, 4; priorities survive, farm, expand; reward cap per session; and deterministic clamping for negative/invalid values.
- [ ] Step 4: Run the focused tests and confirm they pass.
- [ ] Step 5: Commit test: define watch mode simulation rules.

### Task 2: Add mode/session state to both game engines

**Files:**
- Modify: app/FreemanProtocol.tsx in GameMode, HudState, GameCallbacks, GameController, FreemanEngine, and FreemanCanvasEngine sections.
- Modify: tests/game-source-contracts.test.mjs

**Interfaces:**
- GameMode gains watch only as a session mode indicator; existing render modes remain intact.
- GameController.start(options) accepts { tutorial: boolean; mode?: campaign | watch }.
- GameController produces setWatchSpeed(speed), setWatchPriority(priority), endWatchRun(), and setVisibilityPaused(hidden).
- HudState gains sessionMode, watchPaused, watchSpeed, watchPriority, survivalMs, sessionIncome, and lastAutonomyEvent.

- [ ] Step 1: Add source-contract tests requiring both renderer classes to expose the new controller methods and emit watch HUD fields.
- [ ] Step 2: Run the focused source-contract test and confirm failure.
- [ ] Step 3: Add a shared per-engine watch state initialized with createWatchState(), reset it in start(), and pass the selected mode from React into both engines.
- [ ] Step 4: In each engine’s existing animate/updateGame path, call tickWatchState() only when sessionMode is watch and the page is visible; scale simulation delta by selected speed while keeping reward amounts unscaled.
- [ ] Step 5: Implement endWatchRun() to stop wave spawning, preserve completed-wave resources, and return to the intro selector; implement visibility pause without triggering defeat/victory.
- [ ] Step 6: Emit a typed last-event string from existing autonomy actions (collect, repair, recruit, build, upgrade, reserve) so both renderers expose the same watch telemetry.
- [ ] Step 7: Run focused tests and TypeScript.
- [ ] Step 8: Commit feat: add shared campaign and watch session state.

### Task 3: Make autonomy drive endless Watch Mode

**Files:**
- Modify: app/game/autonomous-network-rules.mjs
- Modify: app/FreemanProtocol.tsx in both engine autonomy/action, wave completion, and visibility handlers.
- Modify: tests/game-systems.test.mjs

**Interfaces:**
- chooseAutonomousNetworkAction(state) accepts watchPriority and prefers repair/build/farm/expand actions deterministically.
- Existing completeWave() remains finite for campaign but starts the next wave in Watch Mode after the existing three-second intermission instead of entering victory at TOTAL_WAVES.

- [ ] Step 1: Add failing tests for priority ordering, watch-mode wave continuation beyond wave 8, and no campaign regression at wave 8.
- [ ] Step 2: Run focused tests and confirm failure.
- [ ] Step 3: Extend autonomous action selection with three priority policies: survive repairs first, farm favors gathering/loot and combat, expand favors sentry/recruit/upgrade spending after repair safety checks.
- [ ] Step 4: Gate the existing victory branch: campaign still calls victory at TOTAL_WAVES; watch mode increments wave pressure and continues spawning indefinitely with a bounded difficulty ramp.
- [ ] Step 5: Credit resources and session income after each completed watch wave using creditWatchWaveReward(), then show the existing intermission toast with watch-specific copy.
- [ ] Step 6: Run game-system tests and the full test suite.
- [ ] Step 7: Commit feat: make autonomous network farm endless watch waves.

### Task 4: Build the mode selector and Watch HUD

**Files:**
- Modify: app/FreemanProtocol.tsx React component and intro/end overlays.
- Modify: app/globals.css
- Modify: tests/rendered-html.test.mjs
- Modify: tests/mobile-layout.test.mjs

**Interfaces:**
- Intro renders two explicit buttons/cards with accessible labels: START CAMPAIGN and START WATCH MODE.
- Watch HUD renders WATCH MODE, wave/survival/income metrics, 1X/2X/4X, SURVIVE/FARM/EXPAND, PAUSE, and END RUN.

- [ ] Step 1: Add rendered HTML/source tests for both mode buttons, watch labels, end-run confirmation, and mobile-safe control copy.
- [ ] Step 2: Run focused UI tests and confirm failure.
- [ ] Step 3: Add React state for selected session mode and wire each mode button to engine.start({ tutorial: false, mode }).
- [ ] Step 4: Render the watch HUD only for watch sessions, using HudState; wire speed, priority, pause/resume, and end-run actions to the controller.
- [ ] Step 5: Add visibilitychange handling through the controller and a visible pause banner when the tab is hidden.
- [ ] Step 6: Add responsive CSS: macro two-card selector on desktop, stacked touch targets on mobile, and a compact watch HUD that does not cover the arena.
- [ ] Step 7: Run UI tests, ESLint, and TypeScript.
- [ ] Step 8: Commit feat: add campaign and watch mode controls.

### Task 5: Persistence, regression coverage, and release verification

**Files:**
- Modify: app/game/storage.mjs only if a namespaced watch-session/achievement key is needed.
- Modify: app/FreemanProtocol.tsx for local completed-wave reward persistence.
- Modify: tests/storage.test.mjs, tests/game-source-contracts.test.mjs, and tests/rendered-html.test.mjs.

**Interfaces:**
- Store only completed-wave watch rewards and local achievement counters under namespaced keys; never store an active ticking simulation.

- [ ] Step 1: Add failing storage tests proving completed rewards survive reload and active watch timers do not.
- [ ] Step 2: Implement namespaced local persistence using existing readStoredValue/writeStoredValue helpers.
- [ ] Step 3: Add regression tests confirming campaign victory still occurs at the final wave, tutorial behavior is unchanged, and watch mode ends cleanly.
- [ ] Step 4: Run node --test tests/*.test.mjs, eslint app tests, tsc --noEmit, and vinext build; resolve all failures.
- [ ] Step 5: Inspect desktop and mobile layouts in the local app, then commit test: verify campaign and watch mode release.
- [ ] Step 6: Push main, deploy with the existing Vercel production command, verify https://freeman.skillrivals.com/ returns HTTP 200, and confirm the working tree is clean.

## Plan self-review

- Spec coverage: mode split, endless visible-only watch simulation, autonomous actions, speed/priority controls, reward caps, hidden-tab pause, local persistence, failure handling, and tests are each covered by Tasks 1–5.
- Placeholder scan: no TBD, TODO, or unspecified implementation step remains.
- Type consistency: sessionMode, watchState, controller methods, and rule-module names are defined once and reused across both renderers and React.
