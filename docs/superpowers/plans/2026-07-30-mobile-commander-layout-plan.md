# Mobile Commander Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Reflow mobile gameplay into an arena-first screen with one active, touch-safe command tray while preserving the desktop HUD.

**Architecture:** Add a small React `mobilePanel` state (`fight`, `skills`, or `warband`) and a labelled switcher. Existing combat, skills, and warband markup stays in place and is conditionally visible on mobile through panel classes; desktop always renders all existing controls. Add a mode class to the root so upgrade/evolution overlays can suppress gameplay trays on mobile. CSS media queries provide compact status, safe-area spacing, scrollable trays, and 48px targets.

**Tech Stack:** React 19, TypeScript, CSS media queries, Node test runner, Vite/Vinext build.

## Global Constraints

- Desktop layout must remain unchanged.
- Mobile action targets must be at least 48px high where practical.
- Do not add dependencies.
- Preserve keyboard controls and existing game engine behavior.

---

### Task 1: Lock the mobile contract with tests

**Files:**
- Modify: `tests/mobile-layout.test.mjs`

- [x] **Step 1: Write failing assertions** for the mobile panel state, labelled switcher, root mode class, and overlay suppression selectors.
- [x] **Step 2: Run `node --test tests/mobile-layout.test.mjs`** and confirm the new assertions fail because the markup/state/styles are not present.

### Task 2: Add the mobile panel state and markup

**Files:**
- Modify: `app/FreemanProtocol.tsx:10580-11255`

- [x] **Step 1: Add `MobilePanel` and `mobilePanel` state defaulting to `fight`.
- [x] **Step 2: Reset the panel to `fight` whenever the game leaves playing mode.
- [x] **Step 3: Add `mode-${mode}` to the root class.
- [x] **Step 4: Add the compact mobile status strip.
- [x] **Step 5: Add the labelled Fight/Skills/Warband switcher and apply panel classes to existing trays.
- [x] **Step 6: Keep squad tutorial behavior synchronized with the Warband panel.

### Task 3: Reflow the mobile CSS

**Files:**
- Modify: `app/globals.css:2047-2775`

- [x] **Step 1: Hide detailed telemetry, base builder, camera, and inactive trays on mobile.
- [x] **Step 2: Lay out the status strip and switcher with safe-area offsets.
- [x] **Step 3: Make the active tray scroll within a bounded bottom region and enforce large touch targets.
- [x] **Step 4: Hide gameplay trays while `.mode-upgrade` or `.mode-evolution` is active, leaving workshop content unobscured.
- [x] **Step 5: Verify portrait and landscape rules do not reintroduce overlapping controls.

### Task 4: Verify and ship

**Files:**
- No new files.

- [x] **Step 1: Run `node --test tests/mobile-layout.test.mjs`.
- [x] **Step 2: Run the full test suite, TypeScript, lint, and the production build.
- [ ] **Step 3: Inspect the production URL after deployment.
- [ ] **Step 4: Commit with `feat: simplify mobile commander controls` and deploy the production build.
