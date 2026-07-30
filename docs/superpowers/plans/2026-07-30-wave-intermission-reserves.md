# Wave Intermission and Player Reserve Army Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-second automatic wave break and a resource-gated player reserve army while retaining autonomous agent sub-agents.

**Architecture:** Extend the shared temporary-unit rules with a player reserve action and a shared intermission duration. Both renderers expose the same controller method, countdown HUD state, and pooled reserve markers. Wave completion enters an intermission mode/timer instead of opening a blocking workshop; the existing upgrade actions remain available through the HUD.

**Tech Stack:** React/TSX, Three.js, Canvas fallback, ESM game rules, Node test runner, TypeScript, ESLint, Vinext/Vercel.

## Global Constraints

- Non-final wave intermissions last exactly 3,000 ms.
- Reserve deployments consume shared Components and Shards atomically.
- Temporary units share the existing global cap and lifetime upgrade tiers.
- WebGL and Canvas must expose equivalent gameplay and HUD contracts.

---

### Task 1: Add shared intermission and reserve rules

**Files:** `app/game/autonomy-rules.mjs`, `app/game/wave-rules.mjs`, `tests/game-systems.test.mjs`

- [ ] Add reserve cost, duration, cap-aware spawn decision, and 3-second intermission constants/functions.
- [ ] Test affordable/una affordable reserve deployment, cap enforcement, and exact intermission timing.

### Task 2: Integrate both renderers and HUD action

**Files:** `app/FreemanProtocol.tsx`, `app/globals.css`, `tests/game-source-contracts.test.mjs`, `tests/mobile-layout.test.mjs`

- [ ] Add the intermission countdown state and automatic next-wave transition to WebGL and Canvas.
- [ ] Add a `DEPLOY RESERVE` controller action that spends resources and spawns pooled temporary units around the Core.
- [ ] Keep agent autonomous sub-agent spawning unchanged and share the cap with player reserves.
- [ ] Add a touch-safe reserve action to the management tray and desktop commander actions.
- [ ] Test both renderer contracts and responsive action placement.

### Task 3: Verify and deploy

**Files:** all files above

- [ ] Run all tests, typecheck, lint, and production build.
- [ ] Commit and push `main`.
- [ ] Deploy to Vercel and verify the custom domain returns HTTP 200 with a fresh response.
