# Direct Touch Movement and Objective UI Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove non-actionable objective overlays and replace the mobile joystick with direct touch-drag movement.

**Architecture:** Keep the shared game objective and tutorial state intact, but remove objective-only presentation from `FreemanProtocol.tsx`. Move touch movement into each renderer’s existing pointer lifecycle, reusing `normalizeStickInput` and the existing `setTouchMovement` path; remove only the joystick component and CSS.

**Tech Stack:** React/TSX, Three.js renderer, Canvas fallback renderer, CSS, Node test runner, TypeScript, ESLint, Vinext/Vercel.

## Global Constraints

- Desktop keyboard/mouse behavior must remain unchanged.
- Touch HUD buttons must remain usable and must not initiate canvas movement.
- Touch release, cancellation, blur, and visibility changes must always clear movement.
- The tutorial remains available; only the redundant objective banner/card are removed.

---

### Task 1: Lock the new UI and touch contracts in tests

**Files:**
- Modify: `tests/mobile-layout.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

- [ ] **Step 1: Add failing assertions**

Assert that gameplay source no longer contains `objective-banner`, `mobile-objective-card`, `VirtualStick`, or `virtual-stick`, and assert that both renderer sections contain touch drag pointer state, `normalizeStickInput`, pointer capture, and movement reset behavior.

- [ ] **Step 2: Run focused tests**

Run `node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs`.
Expected: FAIL because the old objective and joystick markup are still present.

### Task 2: Implement direct touch-drag movement and remove objective presentation

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Remove objective-only presentation**

Delete the gameplay `objective-banner` and `mobile-objective-card` JSX, the unused commander-objective presentation calculations/handler, the `VirtualStick` component, and its JSX mount. Leave tutorial rendering and the game objective director module untouched.

- [ ] **Step 2: Add touch-drag state to both renderers**

Add a touch pointer ID and origin coordinates beside each renderer’s existing `touchMove` state. On touch down, capture the pointer, record the origin, aim/fire as today, and preserve placement confirmation. On touch move, normalize displacement from the origin through `normalizeStickInput` and call the renderer’s existing movement setter. On touch up/cancel/reset, release capture and clear movement and touch aim.

- [ ] **Step 3: Remove joystick styles and obsolete layout offsets**

Delete `.virtual-stick` and knob rules and remove the `.mobile-stick` positioning block. Preserve touch-action rules on the canvas and action buttons.

- [ ] **Step 4: Run focused tests**

Run `node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs`.
Expected: PASS.

### Task 3: Verify, commit, and deploy

**Files:**
- Modify: `tests/mobile-layout.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Run the full verification suite**

Run `node --test tests/*.test.mjs`, `tsc --noEmit`, ESLint for `app tests`, and `vinext build` with the bundled Node runtime.
Expected: all tests pass, typecheck/lint exit 0, and build completes.

- [ ] **Step 2: Commit and push**

Commit with `feat: simplify touch movement and remove objectives`, then push `main` to `origin`.

- [ ] **Step 3: Deploy and verify production**

Deploy with `pnpm dlx vercel --prod --yes --archive=tgz`, wait for `Ready`, then request `https://freeman.skillrivals.com/?v=<commit>` and verify HTTP 200 with `age: 0`.
