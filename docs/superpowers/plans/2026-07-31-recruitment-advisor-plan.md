# Recruitment Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain whether the player should recruit, repair, defend, or save Compute, with a concrete role/cost/reason shown in the compact combat HUD.

**Architecture:** Add a pure advisor rule module that consumes a serializable battlefield snapshot and returns immutable advice. Add the result to the existing HUD payload and render one compact advisor card; the full Warband overlay remains the purchase surface. Watch Mode uses the same advice and labels it as the AI’s current priority.

**Tech Stack:** TypeScript/React, existing HUD state, Node built-in tests, CSS, vinext.

## Global Constraints

- The advisor is pure presentation logic and never spends resources or mutates simulation state.
- Advice states are exactly `recruit`, `repair`, `defend`, and `save`.
- The full Warband overlay remains the detailed roster and purchase surface.
- Campaign and Watch Mode share the recommendation; Watch Mode may add AI-priority copy.
- Existing autonomous, loot, repair, wave, and progression rules remain authoritative.

---

### Task 1: Implement deterministic recruitment advice rules

**Files:**
- Create: `app/game/recruitment-advisor-rules.mjs`
- Modify: `tests/game-systems.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- `getRecruitmentAdvice(input)` returns a frozen object `{ state, eyebrow, title, detail, role, agentId, action, cost, missing }`.
- Input includes `coreHp`, `coreMaxHp`, `operatorHp`, `operatorMaxHp`, `threatCount`, `activeAgents`, `maxAgents`, `compute`, and affordable candidate metadata.

- [ ] **Step 1:** Add failing tests for Core danger, repair-first, affordable role match, unaffordable missing Compute, and save fallback.
- [ ] **Step 2:** Run focused tests and confirm the missing module failure.
- [ ] **Step 3:** Implement immutable priority rules: Core danger → repair → affordable recruit → save; calculate missing resources without mutation.
- [ ] **Step 4:** Re-run focused tests; expected all advisor cases pass.
- [ ] **Step 5:** Commit `feat: add recruitment advisor rules`.

### Task 2: Expose advice through HUD and render the compact advisor card

**Files:**
- Modify: `app/FreemanProtocol.tsx` (both renderer HUD snapshots)
- Modify: `app/page.tsx` (advisor state/card and Warband action)
- Modify: `app/globals.css` (desktop/mobile card styling)
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `tests/mobile-layout.test.mjs`

**Interfaces:**
- HUD includes `recruitmentAdvice` from `getRecruitmentAdvice`.
- The card renders `RECRUIT ADVISED`, `REPAIR FIRST`, `DEFEND CORE`, or `HOLD COMPUTE`, plus reason/cost/action.

- [ ] **Step 1:** Add failing source/layout contracts for the four labels, reason/cost copy, Watch Mode rationale, and touch-safe action.
- [ ] **Step 2:** Run focused source/mobile tests and confirm failure.
- [ ] **Step 3:** Build the battlefield input from existing HUD/engine state and add the frozen advice object to both renderer snapshots.
- [ ] **Step 4:** Render the card beside the Warband toggle; `RECRUIT NOW` opens the Warband overlay and selects the recommended agent when available, while repair/defend/save actions remain non-mutating guidance.
- [ ] **Step 5:** Add responsive CSS: compact desktop card, readable mobile card, no overlap with the status strip or trays.
- [ ] **Step 6:** Run focused tests, TypeScript, and lint; commit `feat: explain recruitment decisions`.

### Task 3: Integrate, verify, and deploy

**Files:**
- Modify only files required by Tasks 1–2.

- [ ] **Step 1:** Run `PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/*.test.mjs`; expected: all tests pass.
- [ ] **Step 2:** Run ESLint and `tsc --noEmit`; expected: exit 0.
- [ ] **Step 3:** Run `vinext build`; expected: `Build complete`.
- [ ] **Step 4:** Restore `tsconfig.tsbuildinfo`, run `git diff --check`, commit, and push `main`.
- [ ] **Step 5:** Deploy with `pnpm dlx vercel --prod --yes --archive=tgz` and verify `https://freeman.skillrivals.com/?v=<commit>` returns HTTP 200.

## Self-review

- Spec coverage: pure decision rules (Task 1), HUD/Watch/mobile presentation (Task 2), and release verification (Task 3).
- No placeholders or undefined interfaces remain; later tasks consume the exact `getRecruitmentAdvice` return shape defined in Task 1.
