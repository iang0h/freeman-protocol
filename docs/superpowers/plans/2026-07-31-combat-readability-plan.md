# Combat Readability and Arena Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the arena the readable default surface, move deep management into focused overlays, add immediate combat feedback, and give the existing arena meaningful zones without changing the autonomous simulation contract.

**Architecture:** Keep `FreemanProtocol.tsx` as the renderer/controller boundary and add small pure presentation helpers under `app/game/` for overlay state, arena-zone selection, and combat feedback classification. Reuse existing WebGL/Canvas effect pools and HUD state; React owns only the visible overlay and tray state. All new behavior is mirrored in both renderers or expressed through shared rules.

**Tech Stack:** Next/Vite, React, TypeScript, Three.js, Canvas 2D fallback, CSS, Node built-in test runner, ESLint, TypeScript compiler, vinext.

## Global Constraints

- Desktop opens with a compact combat HUD; `INTEL`, `WARBAND`, and `ACTIONS` are explicit overlays.
- Only one management overlay is open at a time; campaign pauses while an overlay is open.
- Mobile shows only HP, Core, wave, current zone, and one urgent alert during live combat.
- Existing autonomous rules, watch mode, wave timing, loot, repair, and progression remain authoritative.
- WebGL and Canvas fallback paths must expose equivalent feedback and HUD behavior.
- Combat feedback must use pooled/capped effects and preserve reduced-motion behavior.
- Do not enlarge the playable arena or add server accounts/offline simulation.

---

### Task 1: Add pure presentation contracts for overlays, arena zones, and feedback events

**Files:**
- Create: `app/game/combat-presentation-rules.mjs`
- Modify: `tests/game-systems.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- `createOverlayState()` returns `{ active: "closed" | "intel" | "warband" | "actions" }`.
- `toggleOverlay(state, next)` returns a new state and closes the current overlay when `next` is already active.
- `getArenaZone(position)` returns `{ id, label, shortLabel, kind }` for `core`, `north-breach`, `south-breach`, `compute`, `repair`, or `boss-portal`.
- `classifyCombatFeedback(event)` returns `{ kind: "hit" | "critical" | "kill" | "core-warning", emphasis, label }`.

- [ ] **Step 1: Write failing unit tests** for one-overlay toggling, deterministic zone boundaries, and hit/critical/kill/Core-warning classification.
- [ ] **Step 2: Run the focused tests** with `node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`; confirm failure because the module/functions are missing.
- [ ] **Step 3: Implement the smallest pure module** with explicit constants for the current compact arena coordinate system. Use immutable return values and no renderer imports.

```js
export const OVERLAYS = ["closed", "intel", "warband", "actions"];
export function createOverlayState() { return { active: "closed" }; }
export function toggleOverlay(state, next) {
  return { active: state.active === next ? "closed" : next };
}
```
- [ ] **Step 4: Re-run focused tests** and confirm all new assertions pass.
- [ ] **Step 5: Commit** `feat: add combat presentation rules`.

### Task 2: Collapse desktop combat UI into explicit overlays

**Files:**
- Modify: `app/page.tsx` (game overlay state and HUD composition)
- Modify: `app/FreemanProtocol.tsx` (HUD fields/actions exposed to React)
- Modify: `app/globals.css` (desktop compact HUD and overlay layers)
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- React owns `overlayState` from `createOverlayState()` and calls `toggleOverlay` for `INTEL`, `WARBAND`, and `ACTIONS`.
- The existing HUD payload remains the source for all values shown inside overlays.

- [ ] **Step 1: Add failing source contracts** asserting compact top-bar labels, the three toggles, one active overlay state, and hidden-by-default desktop dashboard/dock classes.
- [ ] **Step 2: Run the source contract test** and confirm it fails on the missing compact structure.
- [ ] **Step 3: Refactor the desktop JSX** so the live surface renders only HP/Core/Wave, urgent alert, action cluster, and overlay toggles. Wrap the existing dashboard in `.intel-overlay` and existing warband dock in `.warband-overlay`; keep their controls and handlers unchanged.

```tsx
<div className="combat-hud__toggles">
  {(["intel", "warband", "actions"] as const).map((panel) => (
    <button key={panel} onClick={() => setOverlayState(toggleOverlay(overlayState, panel))}>
      {panel.toUpperCase()}
    </button>
  ))}
</div>
```
- [ ] **Step 4: Add CSS** for a fixed compact top bar, overlay backdrop, one visible overlay, and readable desktop spacing. Campaign overlay open/close must call the existing pause/resume controller; Watch Mode remains active but keeps its watch card visible.
- [ ] **Step 5: Run focused source/UI tests** and inspect a production build locally for duplicate overlay rendering.
- [ ] **Step 6: Commit** `feat: make desktop combat arena-first`.

### Task 3: Add aim reticle and readable combat feedback in both renderers

**Files:**
- Modify: `app/FreemanProtocol.tsx` (WebGL and Canvas targeting, damage, melee, and effect loops)
- Modify: `app/game/combat-presentation-rules.mjs` only if event payload needs a shared type
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- Renderer event calls use `classifyCombatFeedback({ kind, damage, critical, target })`.
- Existing pooled effect methods remain the allocation boundary; no per-hit unbounded arrays or lights.

- [ ] **Step 1: Add failing contracts** for reticle rendering, aim-line rendering, pooled hit/critical/kill feedback, slash arc, Core warning, and combo text in both renderer paths.
- [ ] **Step 2: Run the focused tests** and confirm the contracts fail.
- [ ] **Step 3: Implement WebGL feedback** using existing `effects`, `damageNumbers`, burst, and audio helpers: draw a ring reticle at the current aim point, add a short line to the selected target, flash/knock back the target, and emit distinct hit/critical/kill/Core-warning events. Reuse existing pools and cap combo lifetime.

```ts
const feedback = classifyCombatFeedback({ kind: target === "core" ? "core-warning" : "hit", damage, critical, target });
this.addDamageNumber(worldPosition, feedback.label, feedback.emphasis);
this.addBurst(worldPosition, feedback.emphasis, feedback.kind === "kill" ? 14 : 6);
```
- [ ] **Step 4: Implement equivalent Canvas feedback** using the current draw/effect arrays and the same shared classification rules.
- [ ] **Step 5: Add reduced-motion branches** that keep contrast, text, and sound while reducing camera shake/large animation.
- [ ] **Step 6: Run focused tests and a type-check**; confirm no new allocation or unknown-field errors.
- [ ] **Step 7: Commit** `feat: add readable combat feedback`.

### Task 4: Give the arena meaningful zones and location telemetry

**Files:**
- Modify: `app/FreemanProtocol.tsx` (zone markers, world labels, routing hints)
- Modify: `app/page.tsx` (current-zone compact label)
- Modify: `app/globals.css` (landmark/zone marker styles)
- Modify: `tests/game-systems.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- `getArenaZone({ x, z })` is the single source for the current zone label in both renderers.
- Zone labels are presentation-only and do not change enemy, loot, or damage rules.

- [ ] **Step 1: Add failing tests** for all six zone IDs and source contracts for `CORE CHAMBER`, `NORTH BREACH`, `SOUTH BREACH`, `COMPUTE NODE`, `REPAIR BAY`, and `BOSS PORTAL`.
- [ ] **Step 2: Run the focused tests** and confirm the missing labels fail.
- [ ] **Step 3: Add subtle floor/landmark markers** around the existing arena coordinates in WebGL and Canvas. Keep the Core visually dominant, tint the two breach lanes differently, mark the Compute Node and Repair Bay, and reserve the Boss Portal edge for telegraphs.

```ts
const zone = getArenaZone({ x: worldX, z: worldZ });
this.currentZone = zone.shortLabel;
```
- [ ] **Step 4: Emit the current zone in HUD state** at a throttled cadence so React does not re-render every frame.
- [ ] **Step 5: Add compact current-zone label** to the live HUD and use the label in urgent alerts where useful.
- [ ] **Step 6: Run system/source tests and inspect desktop macro camera at wave one.**
- [ ] **Step 7: Commit** `feat: mark meaningful arena zones`.

### Task 5: Simplify mobile without shrinking typography

**Files:**
- Modify: `app/page.tsx` (mobile status and tray composition)
- Modify: `app/globals.css` (mobile breakpoints, typography, trays, overlay visibility)
- Modify: `tests/mobile-layout.test.mjs`

**Interfaces:**
- Mobile uses the existing `MobilePanel = "command" | "defend" | "skills"` contract.
- Mobile live status exposes only `HP`, `CORE`, `WAVE`, current zone, and urgent alert; full telemetry remains in `INTEL`.

- [ ] **Step 1: Add failing layout tests** for removal of low-value mobile telemetry, minimum readable font floors, one active tray, collapsed roster, and no joystick presentation.
- [ ] **Step 2: Run `node --test tests/mobile-layout.test.mjs`** and confirm the new expectations fail.
- [ ] **Step 3: Rewrite mobile CSS** to hide secondary dashboard/warband fields, set readable minimums (12px labels, 16px primary values), retain 48px controls, and keep only one full-width tray active.

```css
@media (max-width: 760px) {
  .mobile-status-strip small { font-size: 12px; }
  .mobile-status-strip strong { font-size: 16px; }
  .intel-overlay .secondary-telemetry,
  .warband-overlay .agent-metrics { display: none; }
  .mobile-action-tray button { min-height: 48px; }
}
```
- [ ] **Step 4: Update mobile JSX** to show the compact status strip and current-zone/urgent alert while keeping `COMMAND`, `DEFEND`, and `SKILLS` mutually exclusive.
- [ ] **Step 5: Run mobile layout tests and build**; inspect portrait and landscape DOM output for overlap.
- [ ] **Step 6: Commit** `feat: simplify mobile combat HUD`.

### Task 6: Integrate, verify, and deploy

**Files:**
- Modify only files required by preceding tasks; restore generated `tsconfig.tsbuildinfo` before commit.

- [ ] **Step 1: Run the complete suite:** `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/*.test.mjs`; expected: all tests pass.
- [ ] **Step 2: Run lint:** `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint app tests`; expected: exit 0 with no errors.
- [ ] **Step 3: Run type-check:** `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc --noEmit`; expected: exit 0.
- [ ] **Step 4: Run production build:** `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vinext build`; expected: `Build complete`.
- [ ] **Step 5: Restore generated state** with `git restore -- tsconfig.tsbuildinfo`, inspect `git diff --check`, and verify only intentional files remain.
- [ ] **Step 6: Commit the integrated result** with a focused message if prior task commits are not being merged individually.
- [ ] **Step 7: Push `main` and deploy** with `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm dlx vercel --prod --yes --archive=tgz`.
- [ ] **Step 8: Verify deployment** using `vercel ls freeman-protocol --yes` and `curl -sS -I -L 'https://freeman.skillrivals.com/?v=<commit>'`; expected: Ready deployment and HTTP 200.

## Self-review

- Spec coverage: compact desktop HUD (Task 2), feedback (Task 3), meaningful zones (Task 4), mobile readability (Task 5), preserved simulation/performance constraints (Tasks 2–6), and deployment verification (Task 6).
- Placeholder scan: no TBD/TODO or unspecified implementation steps; commands and expected outcomes are explicit.
- Type consistency: `createOverlayState`, `toggleOverlay`, `getArenaZone`, and `classifyCombatFeedback` are defined in Task 1 and consumed by later tasks with stable signatures.
