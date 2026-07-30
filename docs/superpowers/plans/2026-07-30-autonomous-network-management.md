# Autonomous Network Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start desktop missions in Macro Map view and give AI agents deterministic resource-management duties.

**Architecture:** Add a pure autonomous policy module for Core repair and action priority. Both renderers call the policy on the same cadence, apply actions through existing build/repair/upgrade paths, and collect all loot types through the shared warband rules. The React camera effect assigns Macro Map on desktop while preserving mobile presentation state.

**Tech Stack:** React/TSX, Three.js, Canvas fallback, ESM game rules, Node test runner, TypeScript, ESLint, Vinext/Vercel.

## Global Constraints

- Core repair costs exactly 2 Components and restores exactly 25 HP.
- Autonomous actions run every 3,500 ms and never exceed resource balances.
- WebGL and Canvas behavior must remain equivalent.
- Desktop defaults to Macro Map; mobile presentation selection remains unchanged.

---

### Task 1: Add shared autonomous policy and tests

**Files:** `app/game/autonomous-network-rules.mjs`, `app/game/warband-rules.mjs`, `tests/game-systems.test.mjs`

- [ ] Add `repairCore`, `chooseAutonomousNetworkAction`, and constants.
- [ ] Include repair loot in `collectMaterials` and its returned wallet delta.
- [ ] Test Core repair, priority ordering, build/upgrade selection, and repair-loot collection.

### Task 2: Integrate both renderers and desktop camera

**Files:** `app/FreemanProtocol.tsx`, `tests/game-source-contracts.test.mjs`

- [ ] Call the autonomous policy from both update loops and apply Core repair, field kits, sentry builds, and workshop upgrades.
- [ ] Feed repair loot into both renderer wallets.
- [ ] Set desktop camera presentation to `macro` and retain mobile toggle behavior.
- [ ] Add source contracts for both renderer integrations and the desktop default.

### Task 3: Verify and deploy

**Files:** all files above plus the spec and plan

- [ ] Run all tests, typecheck, lint, and production build.
- [ ] Commit and push `main`.
- [ ] Deploy to Vercel and verify the custom domain returns HTTP 200 with a fresh response.
