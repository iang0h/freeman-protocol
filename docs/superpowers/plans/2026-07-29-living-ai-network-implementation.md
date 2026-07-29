# Living AI Network Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add walk-over loot, tap-to-fire mobile combat, autonomous recruits with bounded temporary sub-agents, and a cinematic living-network asset catalog while preserving the existing tutorial and performance constraints.

**Architecture:** Keep gameplay rules pure and shared by the Three.js and Canvas engines. Add small modules for loot and agent autonomy, then integrate them through existing enemy-death, player-input, wave-reset, and HUD paths. Refactor the catalog around data-driven agent/threat/loot entries and lightweight CSS animation layers.

**Tech Stack:** React 19, TypeScript, Three.js, CSS modules, ESM `.mjs` rule modules, Node test runner, ESLint, Next/Vinext builds, Vercel.

## Global Constraints

- Loot remains in the arena until player overlap; no auto-collection.
- Touch tap fires toward the tapped world position; the movement stick remains movement-only.
- Recruited agents act without required manual commands.
- Temporary sub-agents have a hard lifetime, population cap, wave-end cleanup, and no recursive spawning.
- Catalog animation uses CSS/composited layers and must remain mobile-friendly.
- Three.js and Canvas fallback consume the same gameplay rules and event vocabulary.
- All persistence uses existing safe storage helpers.

---

### Task 1: Add pure loot rules and tests

**Files:**
- Create: `app/game/loot-rules.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- Produce `LOOT_TYPES`, `rollLootDrop(enemyKind, rng)`, `canCollectLoot(player, loot)`, and `applyLootPickup(state, loot)`.
- `rollLootDrop` returns `null` or `{ id, type, x, y, value }`; RNG is injected for deterministic tests.
- `applyLootPickup` returns a new state and clamps health/core health to their configured maxima.

- [ ] Write tests for deterministic drop chance, no pickup before overlap, repair clamping, component inventory increments, and invalid loot rejection.
- [ ] Run `node --test tests/game-systems.test.mjs` and confirm the new tests fail because the module is absent.
- [ ] Implement the constants and pure functions with no Three.js dependency.
- [ ] Run the focused test file and confirm all tests pass.
- [ ] Commit `feat: add deterministic loot rules`.

### Task 2: Add autonomous agent and temporary sub-agent rules

**Files:**
- Create: `app/game/autonomy-rules.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- Produce `AGENT_ROLES`, `decideAgentIntent(agent, context)`, `shouldImprovise(agent, context)`, `spawnTemporarySubAgent(agent, context)`, `tickSubAgents(subAgents, elapsedMs)`, and `clearSubAgents(subAgents)`.
- Intent values are `assault`, `support`, `defend`, or `improvise`; sub-agents carry `parentId`, `role`, `remainingMs`, and `canSpawn: false`.

- [ ] Write tests for each role’s priority, improv thresholds, maximum active sub-agents, non-recursive spawn, expiry, and wave cleanup.
- [ ] Run focused tests and confirm failure.
- [ ] Implement bounded deterministic decisions using injected context values rather than randomness in the rule layer.
- [ ] Run the focused tests and confirm pass.
- [ ] Commit `feat: add autonomous agent rules`.

### Task 3: Integrate loot into both game engines

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/game/three-resources.ts`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Import loot rules from Task 1.
- Add engine-local pickup records/render objects with shared `{ id, type, x, y, value }` data.
- Enemy defeat calls `rollLootDrop`; update ticks call `canCollectLoot` and `applyLootPickup`.

- [ ] Add source-contract tests asserting enemy defeat creates a pickup and pickup collection is overlap-gated in WebGL and Canvas paths.
- [ ] Run source-contract tests and confirm failure.
- [ ] Add lightweight pickup visuals: emissive sprite/mesh in WebGL and colored Canvas marker in fallback, with pooling/cleanup at wave end.
- [ ] Add a compact HUD toast and counters for repair/components/shards.
- [ ] Run tests, lint, and inspect that pickup arrays are cleared on retry, defeat, and victory.
- [ ] Commit `feat: add walk-over enemy loot`.

### Task 4: Add mobile tap-to-fire targeting

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/game/input-rules.mjs`
- Modify: `tests/game-systems.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Add `tapToFire` to input rules, accepting normalized screen coordinates and returning a world aim point.
- Keep movement stick state isolated from tap aim state.

- [ ] Write tests that a touch tap produces an aim event, never movement deltas, and clears on cancel/focus loss.
- [ ] Run focused tests and confirm failure.
- [ ] Route `pointerdown` with `pointerType === "touch"` on the arena to the fire path unless the target is an existing HUD control.
- [ ] Preserve desktop pointer aiming and existing tutorial gating.
- [ ] Run mobile layout/source-contract tests and verify the fire target is reachable in portrait mode.
- [ ] Commit `feat: add tap-to-fire mobile combat`.

### Task 5: Integrate autonomous recruits and sub-agent lifecycle

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/game/tutorial-rules.mjs`
- Modify: `tests/game-systems.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consume Task 2 intent/lifecycle functions.
- Add `autonomyState` and `temporarySubAgents` to engine state; no tutorial objective may require a command click after recruitment.

- [ ] Add tests that recruited agents act on their role, improvise under threshold conditions, sub-agents expire, and wave reset clears them.
- [ ] Run focused tests and confirm failure.
- [ ] Replace mandatory command progression with passive status updates while retaining non-blocking advanced command affordances.
- [ ] Drive agent movement/target selection from `decideAgentIntent`; render sub-agent markers with a distinct temporary signal.
- [ ] Add a hard per-wave cap and cleanup on retry/defeat/victory.
- [ ] Run all game tests and verify no tutorial regression.
- [ ] Commit `feat: make recruited agents autonomous`.

### Task 6: Refresh asset catalog and logo screen styling

**Files:**
- Modify: `app/asset-catalog/AssetCatalog.tsx`
- Modify: `app/asset-catalog/AssetCatalog.module.css`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `public/asset-catalog/loot-repair.webp`
- Create: `public/asset-catalog/loot-component.webp`
- Create: `public/asset-catalog/loot-shard.webp`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Keep catalog data-driven with `agent`, `threat`, and `loot` entry arrays.
- Add reusable `SignalBadge`, `AgentPortraitCard`, and `LootCard` components.

- [ ] Add rendered/source tests for Live Agents, Threat Archive, Field Components, and loot color tokens.
- [ ] Run focused catalog tests and confirm failure.
- [ ] Add the new sections/cards, animated signal layers, and mobile-safe responsive layout.
- [ ] Add or derive lightweight loot art assets that match the approved cyan/amber/violet palette; keep existing assets intact.
- [ ] Add subtle animated network nodes behind the logo screen without blocking the start controls.
- [ ] Run catalog tests, lint, and build.
- [ ] Commit `feat: refresh living AI asset catalog`.

### Task 7: Full verification and production deployment

**Files:**
- Modify: none unless verification reveals a regression.

- [ ] Run `node --test tests/*.test.mjs` and require all tests to pass.
- [ ] Run ESLint on changed TS/JS files.
- [ ] Run `vinext build`, `next build`, and `bash scripts/validate-artifact.sh`.
- [ ] Run `git diff --check` and confirm clean working tree.
- [ ] Push `main` to `origin`.
- [ ] Deploy with the existing linked Vercel project using the bundled Node/pnpm runtime.
- [ ] Verify `https://freeman-protocol.vercel.app/`, `/asset-catalog`, and `/audio/freeman-protocol.mp3` return successfully; inspect deployment status as Ready.
- [ ] Commit any verification-only fixes separately and report the final commit/deployment URL.

