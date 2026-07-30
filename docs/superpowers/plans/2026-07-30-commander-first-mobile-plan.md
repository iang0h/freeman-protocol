# Commander-First Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Make mobile play macro, objective-led, and AI-managed while preserving direct combat and the desktop HUD.

**Architecture:** Add a pure objective selector in `app/game/objective-director.mjs`, a `cameraPresentation` state that switches the existing engine between macro and tactical framing, and a mobile `command | defend | skills` tray model. The React HUD will render a persistent objective card and command center from the existing `HudState`; autonomous engine rules remain unchanged.

**Tech Stack:** React 19, TypeScript, Three.js/Canvas engines, ESM game-rule modules, CSS media queries, Node test runner, Vite/Vinext.

## Global Constraints

- The Core is the win condition and is always named as the primary objective.
- Agents remain autonomous; the new UI must not require constant micromanagement.
- Desktop keeps its current tactical HUD and controls.
- Objective selection is pure presentation logic and must not mutate engine state.
- Mobile touch targets remain at least 48px and respect safe-area insets.
- No new dependencies.

---

### Task 1: Add objective selection rules

**Files:**
- Create: `app/game/objective-director.mjs`
- Test: `tests/objective-director.test.mjs`

**Interfaces:**
- Produces `getCommanderObjective(input)` returning `{ id, label, detail, action }`.
- Input includes `core`, `maxCore`, `offlineAgents`, `repairBayOnline`, `canRecruit`, `canBuild`, `workshopActive`, and `placingDefense`.

- [ ] **Step 1: Write failing unit tests** for priority order: Core danger, offline repair, recruitment, sentry build, workshop upgrade, and defend fallback.
- [ ] **Step 2: Run `node --test tests/objective-director.test.mjs`** and confirm the module is missing.
- [ ] **Step 3:** Implement the pure selector with stable IDs `protect-core`, `repair-agent`, `recruit-agent`, `build-sentry`, `upgrade-network`, and `defend-core`.
- [ ] **Step 4:** Re-run the focused tests and confirm all objective cases pass.
- [ ] **Step 5:** Commit with `git add app/game/objective-director.mjs tests/objective-director.test.mjs && git commit -m "feat: add commander objective director"`.

### Task 2: Add macro/tactical camera presentation

**Files:**
- Modify: `app/FreemanProtocol.tsx` at the `GameController` interface and both engine camera methods.
- Test: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Adds `setCameraPresentation(presentation: "macro" | "tactical"): void` to both renderers.
- Macro uses the existing orthographic view height/scale with a wider bounded value; tactical restores the current pullback behavior.

- [ ] **Step 1: Write failing source assertions** that both engines expose `setCameraPresentation` and that mobile state includes `cameraPresentation` defaulting to `macro`.
- [ ] **Step 2:** Run the focused source test and confirm it fails.
- [ ] **Step 3: Implement the method in WebGL and Canvas by changing only camera framing/scale, preserving targeting and simulation coordinates.
- [ ] **Step 4: Wire a labelled `MACRO MAP` / `TACTICAL VIEW` mobile toggle to the controller.
- [ ] **Step 5: Run TypeScript and focused tests.
- [ ] **Step 6:** Commit with `git commit -am "feat: add macro mobile camera presentation"`.

### Task 3: Build the Commander mobile HUD

**Files:**
- Modify: `app/FreemanProtocol.tsx` around the mobile state and HUD render.
- Modify: `app/globals.css` in the mobile media-query section.
- Test: `tests/mobile-layout.test.mjs`

**Interfaces:**
- Mobile tray state is `command | defend | skills`.
- The objective card consumes `getCommanderObjective` and invokes existing engine methods for its recommended action.

- [ ] **Step 1: Write failing markup/style assertions** for the objective card, `COMMAND` tray, agent status labels, `DEFEND` tray, and camera toggle.
- [ ] **Step 2: Run `node --test tests/mobile-layout.test.mjs`** and confirm the new assertions fail.
- [ ] **Step 3: Add the command tray as the default mobile panel, showing warband state and readable agent statuses (`FIGHTING`, `GATHERING`, `REPAIRING`, `OFFLINE`).
- [ ] **Step 4: Add one-tap management actions that call existing recruit, build, repair, and upgrade methods and disable themselves when unavailable.
- [ ] **Step 5: Move direct combat controls under `DEFEND`; preserve the existing `SKILLS` tray and independent AI command preset.
- [ ] **Step 6: Add the persistent objective card and connect each recommended action ID to the correct engine action.
- [ ] **Step 7: Add macro/tactical toggle and compact mobile CSS with scroll containment and 48px targets.
- [ ] **Step 8: Run focused layout tests, TypeScript, and lint.
- [ ] **Step 9:** Commit with `git commit -am "feat: add commander-first mobile HUD"`.

### Task 4: Expand commander onboarding

**Files:**
- Modify: `app/FreemanProtocol.tsx` tutorial copy and tutorial presentation.
- Modify: `app/game/tutorial-rules.mjs` only if the six-step progression needs new events.
- Test: `tests/mobile-layout.test.mjs` and `tests/game-systems.test.mjs`.

- [ ] **Step 1: Write failing assertions** for Core, autonomous agents, gathering, recruitment, repair, and upgrade tutorial copy.
- [ ] **Step 2: Run focused tutorial tests and confirm the new copy/events are absent.
- [ ] **Step 3: Add six commander-readable steps while keeping skip and persisted completion behavior.
- [ ] **Step 4: Add target highlighting for the objective card, command action, and macro map without blocking the arena.
- [ ] **Step 5: Run focused tutorial tests and the full Node suite.
- [ ] **Step 6:** Commit with `git commit -am "feat: teach commander-first mobile flow"`.

### Task 5: Verify and deploy

**Files:**
- No new source files.

- [ ] **Step 1: Run `node --test tests/*.test.mjs` and confirm zero failures.
- [ ] **Step 2: Run TypeScript, ESLint, and the production Vinext build.
- [ ] **Step 3: Push `main` and deploy with the existing Vercel production project.
- [ ] **Step 4:** Run `commit=$(git rev-parse --short HEAD); curl -fsSI "https://freeman.skillrivals.com/?v=$commit"` and inspect deployment readiness.
- [ ] **Step 5:** Restore generated TypeScript metadata if it changed and confirm `git status --short --branch` is clean.
