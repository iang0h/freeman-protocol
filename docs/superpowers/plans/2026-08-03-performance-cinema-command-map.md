# Performance, Cinema Watch, Command Map, and Battlegrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Keep Freeman Protocol readable and responsive as waves scale while adding a lightweight cinematic Watch presentation, a useful Command Map, deterministic battleground themes, bounded combat feedback, and one serializable simulation view consumed by both renderers.

**Architecture:** Pure, renderer-independent rule modules will own quality selection, cinema state, battleground data, command-map marker projection, and normalized simulation snapshots. FreemanEngine and FreemanCanvasEngine will continue owning their native objects, but they will call the same pure helpers and use the same HUD-facing values. React will expose the controls through existing overlays and CSS will make the new controls safe on desktop, portrait mobile, keyboard, reduced-motion, and co-op screens.

**Tech Stack:** TypeScript/React 19, Three.js 0.181, Canvas 2D fallback, ECMAScript modules, Node node:test, Next/Vinext production builds, existing CSS custom properties.

## Global Constraints

- Profiles are low, medium, and high; quality never changes simulation ticks, wave pacing, damage, resource costs, or loot values.
- Cinema Watch layers on the existing Watch Mode and never creates offline progression or changes campaign resources.
- Command Map is read-only presentation; existing co-op protocol semantics and controls remain authoritative.
- Battleground themes reuse existing terrain modifiers and geometry; no remote runtime models, audio, or heavy post-processing dependency is added.
- Combat effects remain pooled and bounded; reduced-motion removes camera punch, orbit drift, and hit-stop but keeps color/label feedback.
- No Worker migration is introduced in this pass.
- Every new behavior follows red-green-refactor: write a failing test, run it, implement the minimum, run the focused test, then run the relevant regression suite.

---

### Task 1: Add adaptive quality rules

**Files:**
- Create: app/game/quality-rules.mjs
- Modify: tests/game-systems.test.mjs (imports and quality tests)

**Interfaces:**
- Consumes: optional device hints { touch?: boolean, deviceMemory?: number, hardwareConcurrency?: number, renderer?: "webgl" | "canvas" } and frame samples in milliseconds.
- Produces: QUALITY_PRESETS, QUALITY_ORDER, selectQualityPreset(hints), getQualitySettings(profile), createQualityMonitor(profile?), and tickQualityMonitor(state, frameMs).

- [ ] **Step 1: Write failing tests for profile selection and one-way downgrade.**

~~~js
import {
  QUALITY_PRESETS,
  QUALITY_ORDER,
  createQualityMonitor,
  getQualitySettings,
  selectQualityPreset,
  tickQualityMonitor,
} from "../app/game/quality-rules.mjs";

test("quality selection favors touch devices and never raises quality during combat", () => {
  assert.equal(selectQualityPreset({ touch: true, deviceMemory: 2, hardwareConcurrency: 2 }), "low");
  assert.equal(selectQualityPreset({ touch: false, deviceMemory: 16, hardwareConcurrency: 12 }), "high");
  const monitor = createQualityMonitor("high");
  const degraded = Array.from({ length: 45 }, () => tickQualityMonitor(monitor, 45));
  assert.equal(degraded.at(-1).profile, "medium");
  assert.equal(tickQualityMonitor(degraded.at(-1), 8).profile, "medium");
  assert.equal(QUALITY_ORDER.includes("low"), true);
  assert.equal(QUALITY_PRESETS.high.pixelRatioCap > QUALITY_PRESETS.low.pixelRatioCap, true);
});

test("quality settings expose bounded presentation budgets", () => {
  const settings = getQualitySettings("low");
  assert.equal(settings.maxCombatEffects < getQualitySettings("high").maxCombatEffects, true);
  assert.equal(settings.pixelRatioCap >= 0.75, true);
  assert.equal(settings.simulationScale, 1);
});
~~~

- [ ] **Step 2: Run the focused test and confirm a missing-module failure.**

Run:
/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs

Expected: FAIL with ERR_MODULE_NOT_FOUND for app/game/quality-rules.mjs.

- [ ] **Step 3: Implement the minimal immutable rules module.**

~~~js
export const QUALITY_ORDER = Object.freeze(["low", "medium", "high"]);
export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ pixelRatioCap: 1, robotAnimationStride: 3, maxCombatEffects: 36, shadowMapSize: 0, bloom: false, grade: "neutral", distantDressing: false, simulationScale: 1 }),
  medium: Object.freeze({ pixelRatioCap: 1.5, robotAnimationStride: 2, maxCombatEffects: 64, shadowMapSize: 512, bloom: false, grade: "balanced", distantDressing: true, simulationScale: 1 }),
  high: Object.freeze({ pixelRatioCap: 2, robotAnimationStride: 1, maxCombatEffects: 96, shadowMapSize: 1024, bloom: true, grade: "cinematic", distantDressing: true, simulationScale: 1 }),
});

const clampIndex = (index) => Math.max(0, Math.min(QUALITY_ORDER.length - 1, index));
const normalizeProfile = (profile) => QUALITY_ORDER.includes(profile) ? profile : "medium";

export function selectQualityPreset({ touch = false, deviceMemory = 4, hardwareConcurrency = 4 } = {}) {
  if (touch || deviceMemory <= 2 || hardwareConcurrency <= 2) return "low";
  if (deviceMemory >= 8 && hardwareConcurrency >= 8) return "high";
  return "medium";
}

export function getQualitySettings(profile) {
  return QUALITY_PRESETS[normalizeProfile(profile)];
}

export function createQualityMonitor(profile = "medium") {
  return Object.freeze({ profile: normalizeProfile(profile), overBudgetFrames: 0 });
}

export function tickQualityMonitor(state, frameMs) {
  const current = normalizeProfile(state?.profile);
  const overBudget = Number(frameMs) > 33.34;
  const overBudgetFrames = overBudget ? (state?.overBudgetFrames ?? 0) + 1 : 0;
  const index = QUALITY_ORDER.indexOf(current);
  const shouldDowngrade = overBudgetFrames >= 30 && index > 0;
  return Object.freeze({
    profile: shouldDowngrade ? QUALITY_ORDER[clampIndex(index - 1)] : current,
    overBudgetFrames: shouldDowngrade ? 0 : overBudgetFrames,
  });
}
~~~

- [ ] **Step 4: Run the focused tests and commit the green slice.**

Run the command from Step 2; expected: the two quality tests and the pre-existing tests pass.

~~~
git add app/game/quality-rules.mjs tests/game-systems.test.mjs
git commit -m "feat: add adaptive quality rules"
~~~

### Task 2: Add cinema, battleground, command-map, and snapshot rules

**Files:**
- Create: app/game/cinema-rules.mjs
- Create: app/game/battleground-rules.mjs
- Create: app/game/simulation-view.mjs
- Modify: app/game/combat-presentation-rules.mjs
- Modify: tests/game-systems.test.mjs

**Interfaces:**
- createCinemaState(), setCinemaSpeed(state, speed), toggleCinemaPaused(state), toggleCinemaCleanView(state), tickCinemaState(state, deltaMs).
- BATTLEGROUNDS, getBattleground(id), getBattlegroundForWave(wave).
- createSimulationView(input) returns a frozen serializable { wave, resources, core, operator, agents, enemies, pickups, sentries, subAgents, boss } with numeric positions normalized to { x, z }.
- getCommandMapMarkers(snapshot) returns frozen markers { id, kind, label, x, z, status, priority } for core, bays, agents, enemies, loot, sentries, boss, and terrain lanes.
- getCombatEffectBudget(profile, reducedMotion) returns bounded { maxEffects, hitStopMs, cameraPunch, orbitDrift }.
- canSpawnCombatEffect(effectCount, budget, priority) admits urgent events when the pooled presentation budget is full.

- [ ] **Step 1: Write failing tests for cinema transitions, deterministic themes, snapshots, markers, and motion budgets.**

~~~js
import { createCinemaState, setCinemaSpeed, tickCinemaState, toggleCinemaCleanView, toggleCinemaPaused } from "../app/game/cinema-rules.mjs";
import { BATTLEGROUNDS, getBattlegroundForWave } from "../app/game/battleground-rules.mjs";
import { createSimulationView } from "../app/game/simulation-view.mjs";
import { canSpawnCombatEffect, getCommandMapMarkers, getCombatEffectBudget } from "../app/game/combat-presentation-rules.mjs";

test("cinema watch clamps speeds, pauses time, and exposes clean capture state", () => {
  const initial = createCinemaState();
  assert.equal(setCinemaSpeed(initial, 3).speed, 2);
  assert.equal(toggleCinemaPaused(initial).paused, true);
  assert.equal(toggleCinemaCleanView(initial).cleanView, true);
  assert.equal(tickCinemaState(initial, 1_000).elapsedMs, 1_000);
  assert.equal(tickCinemaState(toggleCinemaPaused(initial), 1_000).elapsedMs, 0);
});

test("battleground theme selection is deterministic and reuses the terrain id", () => {
  assert.equal(getBattlegroundForWave(1).id, "clear-grid");
  assert.equal(getBattlegroundForWave(2).id, "relay-storm");
  assert.equal(getBattlegroundForWave(4).terrainId, "data-fog");
  assert.equal(getBattlegroundForWave(8).id, getBattlegroundForWave(4).id);
  assert.equal(BATTLEGROUNDS.length, 3);
});

test("simulation view normalizes render-neutral state and projects command markers", () => {
  const view = createSimulationView({
    wave: 3,
    resources: { compute: 55, components: 2, shards: 1 },
    core: { hp: 100, maxHp: 180, x: 0, z: 0 },
    operator: { hp: 80, maxHp: 100, x: 1, z: -1 },
    agents: [{ id: "kairos", hp: 40, maxHp: 50, x: 2, z: 2, state: "gathering" }],
    enemies: [{ id: "virus-1", kind: "virus", hp: 10, maxHp: 20, x: -2, z: 1, state: "alive" }],
    pickups: [{ id: "loot-1", type: "component", value: 1, x: 3, z: 0 }],
    sentries: [],
    subAgents: [],
    boss: null,
  });
  assert.deepEqual(view.resources, { compute: 55, components: 2, shards: 1 });
  assert.equal(view.agents[0].state, "gathering");
  const markers = getCommandMapMarkers(view);
  assert.equal(markers.some((marker) => marker.kind === "loot"), true);
  assert.equal(markers.some((marker) => marker.kind === "agent" && marker.status === "gathering"), true);
  assert.equal(getCombatEffectBudget("low", true).hitStopMs, 0);
});
~~~

- [ ] **Step 2: Run the focused test and confirm it fails for the new modules/API.**

Run:
/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs

Expected: FAIL with missing module or missing export errors for the new rules.

- [ ] **Step 3: Implement the pure state and data modules.**

Use frozen records and explicit clamps. Cinema speeds are [0.5, 1, 2, 4]; tickCinemaState advances only when not paused. Battleground wave mapping is 1 to clear-grid, 2-3 to relay-storm, and 4-8 to data-fog, with terrainId matching the existing getTerrainModifier ids where available. createSimulationView must coerce invalid numeric fields to zero and copy arrays so neither renderer can mutate the source state.

- [ ] **Step 4: Extend combat-presentation-rules with marker projection and budget helpers.**

Keep getArenaZone and classifyCombatFeedback behavior unchanged. getCommandMapMarkers must always include fixed markers for the Core, repair bay, compute node, and boss portal, then append living entities from the snapshot. getCombatEffectBudget must use the quality profile budgets and return zero motion for reduced-motion.

- [ ] **Step 5: Run all rule tests, inspect immutability, and commit.**

Run:
/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs

Expected: all focused tests pass. Then run git diff --check and commit:

~~~
git add app/game/cinema-rules.mjs app/game/battleground-rules.mjs app/game/simulation-view.mjs app/game/combat-presentation-rules.mjs tests/game-systems.test.mjs
git commit -m "feat: add cinema themes and simulation view rules"
~~~

### Task 3: Wire quality, battlegrounds, and shared snapshots into both renderers

**Files:**
- Modify: app/FreemanProtocol.tsx in the shared imports/types and both FreemanEngine/FreemanCanvasEngine classes.
- Modify: tests/game-source-contracts.test.mjs.

**Interfaces:**
- Both engines import selectQualityPreset, getQualitySettings, createQualityMonitor, tickQualityMonitor, getBattlegroundForWave, and createSimulationView from the same modules.
- HudState gains cinemaPaused, cinemaSpeed, cinemaCleanView, battlegroundId, and qualityPreset.

- [ ] **Step 1: Write source-contract tests before editing the engine.**

~~~js
const source = readFileSync("app/FreemanProtocol.tsx", "utf8");
for (const helper of ["quality-rules.mjs", "battleground-rules.mjs", "simulation-view.mjs"]) {
  assert.equal(source.includes("./game/" + helper), true, "shared helper import missing: " + helper);
}
assert.equal((source.match(/createSimulationView\\(/g) ?? []).length >= 2, true);
assert.equal(source.includes("setCinemaSpeed"), true);
~~~

- [ ] **Step 2: Run the source-contract test and confirm the expected missing imports fail.**

Run:
/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-source-contracts.test.mjs

Expected: FAIL because the existing engine does not import the new helpers yet.

- [ ] **Step 3: Add shared engine state and quality sampling.**

At construction, derive the initial profile from window.matchMedia("(pointer: coarse)"), navigator.deviceMemory, and navigator.hardwareConcurrency with safe fallbacks. In each renderer animation loop, sample raw frame duration and call tickQualityMonitor; only when the profile changes, update renderer pixel ratio/effect ceilings and emit a short HUD activity event. Do not multiply simulation delta by quality. For WebGL, register webglcontextlost/webglcontextrestored listeners that pause the loop and show the existing Canvas fallback path; never reset campaign state.

- [ ] **Step 4: Apply battleground records to existing background/grid presentation.**

When start, retryWave, and startNextWave set this.wave, assign this.battleground = getBattlegroundForWave(this.wave). Use its palette for the existing grid/ground/fog materials in WebGL and the existing background/grid strokes in Canvas. Keep enemy spawn, terrain resistance, route bias, and costs from getTerrainModifier unchanged.

- [ ] **Step 5: Build the same serializable snapshot before HUD emission in both classes.**

Map native fields into createSimulationView with the same property names and use its normalized counts for HUD enemies, warbandCount, temporarySubAgents, and map markers. Keep the native objects as the simulation authority; the snapshot is a read-only boundary. Add a unit-level assertion that mutating a returned snapshot does not mutate the input arrays.

- [ ] **Step 6: Run type/build and source-contract checks, then commit.**

Run the focused source tests, scoped ESLint on app/FreemanProtocol.tsx, and git diff --check. Expected: no source-contract failures and no new lint errors.

~~~
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "feat: share quality themes and snapshots across renderers"
~~~

### Task 4: Add Cinema Watch and Command Map controls

**Files:**
- Modify: app/FreemanProtocol.tsx (GameController, HUD merge, keyboard actions, watch panel, camera presentation state).
- Modify: app/globals.css (cinema mode, command-map legend/markers, safe-area touch targets).
- Modify: tests/game-systems.test.mjs, tests/game-source-contracts.test.mjs, and tests/mobile-layout.test.mjs.

**Interfaces:**
- GameController.setCinemaSpeed(speed: number), toggleCinemaPause(), toggleCinemaCleanView(), and existing setCameraPresentation accept macro, tactical, or command.
- React renders buttons labelled 0.5X, 1X, 2X, 4X, PAUSE/RESUME, CINEMA/EXIT CINEMA, and COMMAND MAP with aria-pressed state.

- [ ] **Step 1: Write failing controller/source tests for the new controls and three camera states.**

~~~js
const source = readFileSync("app/FreemanProtocol.tsx", "utf8");
for (const label of ["COMMAND MAP", "CINEMA", "0.5X", "PAUSE"]) {
  assert.equal(source.includes(label), true, "missing control label: " + label);
}
assert.equal(source.includes('"macro" | "tactical" | "command"'), true);
~~~

- [ ] **Step 2: Run the source tests and confirm labels/API are absent.**

Run:
/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-source-contracts.test.mjs

Expected: FAIL on the first absent control.

- [ ] **Step 3: Add controller methods and merge cinema state into HUD.**

Each engine owns a cinema state, exposes the four methods, and uses cinema speed only while sessionMode is watch; a paused cinema state pauses watch simulation and visibility timers together. toggleCinemaCleanView changes presentation only. On watch terminal/recovery events, reset the watch state through the existing start/createWatchState path when cinema is active and emit WATCH RUN RESTARTED.

- [ ] **Step 4: Add the compact watch controls and command-map toggle.**

Render the controls in the existing .watch-panel without opening Warband/Intel/Actions. On mobile, put them in the existing mobile panel tray so only one tray is visible. Use the same callbacks for pointer and keyboard (C toggles Command Map, P toggles cinema pause, V toggles clean view). Keep a visible EXIT CINEMA control in clean view.

- [ ] **Step 5: Add command-map markers and focus behavior.**

Project getCommandMapMarkers(hudSnapshot) into a small overlay layer. Clicking/tapping a marker sets camera focus; it must not issue a gameplay command. The legend shows only CORE, REPAIR, COMPUTE, BREACH, LOOT, and AGENT on mobile; desktop may include SENTRY, BOSS, and THREAT.

- [ ] **Step 6: Add the cinema follow/orbit camera.**

While cinema clean view is active, choose the current target in priority order boss, breach, loot, then core from the shared markers. Interpolate the existing camera target toward that marker and apply a slow orbit only when reduced-motion is not active. On pause or exit, hold the last target and restore the previous camera presentation without changing any entity position.

- [ ] **Step 7: Add responsive CSS and run source tests.**

Use min-height: 44px, safe-area offsets, :focus-visible, and prefers-reduced-motion. .game-shell.is-cinema hides management panels but leaves .cinema-status and .cinema-exit. The command-map legend uses readable text sizes rather than shrinking telemetry below the existing mobile minimum.

- [ ] **Step 8: Commit the UI slice.**

Run source tests, git diff --check, and scoped ESLint before:

~~~
git add app/FreemanProtocol.tsx app/globals.css tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
git commit -m "feat: add cinema watch and command map controls"
~~~

### Task 5: Improve bounded combat feedback in both renderers

**Files:**
- Modify: app/FreemanProtocol.tsx effect creation/update paths in WebGL and Canvas.
- Modify: app/game/combat-presentation-rules.mjs if the budget helper needs a final adjustment.
- Modify: tests/game-systems.test.mjs and tests/game-source-contracts.test.mjs.

**Interfaces:**
- Existing classifyCombatFeedback remains the event classifier.
- New renderer helper canSpawnCombatEffect(effectCount, profile, priority) uses getCombatEffectBudget; low-priority effects are dropped first when the pool is full.

- [ ] **Step 1: Write a failing budget test for hit/critical/kill priority.**

~~~js
test("combat feedback keeps critical and kill cues when the low-quality pool is full", () => {
  const budget = getCombatEffectBudget("low", false);
  assert.equal(budget.maxEffects, 36);
  assert.equal(canSpawnCombatEffect(36, budget, "ambient"), false);
  assert.equal(canSpawnCombatEffect(36, budget, "critical"), true);
});
~~~

- [ ] **Step 2: Run the focused test and confirm the missing helper failure.**

Run the full tests/game-systems.test.mjs; expected: FAIL because canSpawnCombatEffect is not exported.

- [ ] **Step 3: Implement priority admission and wire existing effect calls.**

Use the existing MAX_COMBAT_EFFECTS pool and release paths. Make hit flash/number standard, flinch/knockback strong, critical/armor-break urgent, and kill/boss shockwave urgent. If the pool is full, reject ambient/standard first, but always allow urgent events by reusing the oldest low-priority slot. Respect prefers-reduced-motion by skipping hit-stop and camera punch while retaining flash, label, and kill-color differences.

- [ ] **Step 4: Verify renderer parity and commit.**

Run the focused tests, scoped ESLint, and git diff --check, then:

~~~
git add app/FreemanProtocol.tsx app/game/combat-presentation-rules.mjs tests/game-systems.test.mjs
git commit -m "feat: prioritize readable combat feedback"
~~~

### Task 6: Full verification, browser smoke, and review handoff

**Files:**
- Modify only files needed to resolve verified failures from the checks below.
- Test: tests/*.test.mjs, source-contract tests, local browser routes / and /asset-catalog.

- [ ] **Step 1: Run the complete Node suite with the bundled runtime.**

Run:
/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and both production builds.**

Run:
~~~
PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run lint
PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run build
PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node_modules/.bin/next build
PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node_modules/.bin/vinext build
git diff --check
~~~

- [ ] **Step 3: Perform the local runtime smoke check.**

Start the existing dev server with the bundled runtime, open / and /asset-catalog, and verify: WebGL or Canvas fallback loads, watch mode starts, cinema controls change speed/pause/clean view, Command Map markers appear, and portrait mobile retains one readable tray with 44px controls. Repeat with reduced-motion enabled and confirm no camera shake/orbit.

- [ ] **Step 4: Request code review and address actionable findings.**

Use the requesting-code-review skill against the final diff. Fix any correctness, accessibility, or renderer-parity finding, rerun the failed verification command, then commit the review fix.

- [ ] **Step 5: Report evidence and integration status.**

Include the final commit(s), test/build commands and outcomes, routes manually checked, and any remaining deployment action. Do not claim Vercel or Google indexing changes unless a deployment check confirms them.
