# Warbands and EMP Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Freeman Protocol into a resource-driven warband game with a disciplined EMP pulse, eight persistent agents, bounded temporary sub-agents, repair/retreat behavior, skills, and escalating boss encounters.

**Architecture:** Keep game rules deterministic and renderer-independent in small `.mjs` modules, then make `FreemanProtocol.tsx` the single state integrator for WebGL and Canvas presentation. Store Core, agent, turret, material, cooldown, and child-agent state in one atomic runtime snapshot so gameplay cannot diverge between renderers or mobile input paths.

**Tech Stack:** Next.js/React, TypeScript, Three.js, existing `.mjs` pure-rule modules, Node’s built-in test runner, pnpm, Vercel.

## Global Constraints

- Core is a protect-only objective and is never a healing station; agents use the separate repair bay or field kits.
- Persistent warband capacity is exactly 8; slots 1–4 are approachable and slots 5–8 have escalating Compute, Components, and Shards costs.
- Each persistent agent can field at most 4 temporary sub-agents; children cannot recurse and live for 10 seconds by default, scaling only to 15 or 20 seconds through upgrades.
- EMP must expose its charge/cooldown, fire less frequently, and deal lower base damage; later-wave resistance and counterplay remain visible.
- Agents and turrets can take damage, retreat/repair, and return; player and Core health rules remain separate.
- Wave-one readability/tutorial protection and existing loot, progression, terrain, mobile, and audio behavior must remain intact.
- All rules must be deterministic, serializable, covered by unit tests, and shared by WebGL and Canvas.

---

## File Map

- Create `app/game/emp-rules.mjs`: EMP charge, cooldown, damage, and upgrade calculations.
- Create `app/game/warband-rules.mjs`: eight-slot recruitment, escalating costs, material collection, and agent state transitions.
- Create `app/game/repair-rules.mjs`: damage, repair bay/field-kit decisions, retreat, and return rules for agents and turrets.
- Create `app/game/skill-rules.mjs`: four agent skill definitions, cooldown/target validation, and deterministic effects.
- Create `app/game/boss-rules.mjs`: slow armored boss schedules, telegraphs, rewards, and wave scaling.
- Modify `app/game/autonomy-rules.mjs`: four-child cap, material-funded spawning, parent role inheritance, and child lifetime upgrades.
- Modify `app/FreemanProtocol.tsx`: integrate the pure rules into the atomic game loop, render charge/health/repair/skills/boss/warband state, and expose mobile-safe tap actions.
- Modify `app/asset-catalog/AssetCatalog.tsx` and `app/asset-catalog/AssetCatalog.module.css`: add the living-warband, repair, loot, and boss assets to the catalog UI.
- Modify `tests/game-systems.test.mjs`: rule-level tests for every new module and regression coverage for EMP wave-one behavior.
- Modify `tests/game-source-contracts.test.mjs` and `tests/mobile-layout.test.mjs`: source/UI contracts for shared state and touch-safe controls.
- Modify `README.md`: document the warband loop, EMP discipline, repair bay, and boss progression.

### Task 1: Add disciplined EMP rules

**Files:** Create `app/game/emp-rules.mjs`; modify `app/game/encounter-rules.mjs` only if a shared resistance helper is needed; test `tests/game-systems.test.mjs`.

**Interfaces:** `createEmpState({ cooldownMs, maxCharge }) -> { charge, maxCharge, cooldownLeftMs, cooldownMs }`; `tickEmp(state, elapsedMs) -> state`; `canFireEmp(state) -> boolean`; `fireEmp(state, { baseDamage, damageMultiplier, terrainMultiplier }) -> { state, damage }`; `getEmpUpgrade(upgradeId) -> { id, label, cost, ... }`.

- [ ] Write failing tests asserting a fresh pulse starts charged, firing consumes charge and starts a longer cooldown, cooldown ticks deterministically, and a second pulse is rejected while cooling down.
- [ ] Add tests asserting base damage is reduced from the current overdrive behavior, upgrades affect only their documented dimension (efficiency, radius, resistance bypass), and wave-one resistance still returns full unmodified target damage.
- [ ] Run `node --test tests/game-systems.test.mjs` and verify the new tests fail before implementation.
- [ ] Implement the pure state machine with finite-number clamping and no renderer imports.
- [ ] Run the focused tests again; expected result is PASS with existing encounter tests unchanged.
- [ ] Commit `feat: discipline emp pulse cadence and damage`.

### Task 2: Build the eight-slot warband and material economy

**Files:** Create `app/game/warband-rules.mjs`; modify `app/game/progression.mjs` for shared material names/cost helpers; modify `app/FreemanProtocol.tsx`; test `tests/game-systems.test.mjs`.

**Interfaces:** `WARBAND_SLOTS` (eight serializable definitions); `getRecruitCost(slot, progression) -> { compute, components, shards }`; `canRecruitWarbandSlot(state, slot) -> boolean`; `recruitWarbandSlot(state, slot) -> state`; `collectMaterials(agent, nearbyLoot) -> { agent, collected }`; `tickAgentGathering(agent, context, elapsedMs) -> agent`.

- [ ] Write failing tests for atomic recruitment: slots 1–4 use starter costs, slots 5–8 cost progressively more, insufficient resources leave every field unchanged, and a ninth slot is rejected.
- [ ] Add tests for deterministic agent collection of visible loot, collection cooldown, and material totals being awarded to the shared resource wallet.
- [ ] Run the focused tests and confirm failure.
- [ ] Implement slot definitions, cost validation, and pure gathering updates; keep the existing four named agents compatible with their current IDs and roles.
- [ ] Integrate the roster into `FreemanProtocol.tsx` so autonomous agents gather when no hostile target is in priority range, while combat/retreat takes precedence.
- [ ] Add HUD copy showing `WARband 3/8`, next-slot costs, and collected Components/Shards without requiring a command click.
- [ ] Run `node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs` and commit `feat: expand autonomous warband to eight agents`.

### Task 3: Add damage, repair bay, retreat, and turret survivability

**Files:** Create `app/game/repair-rules.mjs`; modify `app/FreemanProtocol.tsx`; test `tests/game-systems.test.mjs` and `tests/mobile-layout.test.mjs`.

**Interfaces:** `applyUnitDamage(unit, amount) -> unit`; `getRepairDecision(unit, context) -> "fight" | "retreat" | "repair" | "return"`; `tickRepairBay(bay, units, elapsedMs) -> { bay, units }`; `repairTurret(turret, components) -> { turret, components }`.

- [ ] Write failing tests proving agents retreat below their repair threshold, repair only at a functioning separate bay, return after reaching the configured health ratio, and never mutate Core health as a side effect.
- [ ] Add tests that turrets receive enemy damage, can be repaired with Components, and a destroyed repair bay forces field-kit/withdrawal behavior rather than silently healing.
- [ ] Run focused tests and verify they fail.
- [ ] Implement clamped health/disabled timers and deterministic repair decisions.
- [ ] Integrate enemy targeting so mobs can select agents and turrets, render health bars/status, and give agents autonomous repair/gather priorities.
- [ ] Add a large touch-safe `REPAIR / FIELD KIT` action with pointer/tap parity and a mobile layout assertion.
- [ ] Run focused plus mobile tests and commit `feat: make agents and turrets vulnerable with repair behavior`.

### Task 4: Bound temporary sub-agents and make them material-funded

**Files:** Modify `app/game/autonomy-rules.mjs` and `app/FreemanProtocol.tsx`; test `tests/game-systems.test.mjs`.

**Interfaces:** Extend `spawnTemporarySubAgent(agent, context)` to consume `context.materials` and enforce `maxSubAgents: 4`; `getSubAgentLifetime(agent, upgrades) -> 10000 | 15000 | 20000`; preserve `tickSubAgents` and `tickTemporarySubAgent` return shapes.

- [ ] Write failing tests for a four-child maximum per parent, material cost deduction, inherited role, no recursive spawning, and expiry at exactly 10/15/20 seconds.
- [ ] Add tests that parent agents can gather Components/Shards before spawning and that failed purchases do not create phantom children.
- [ ] Run the focused tests and verify failure.
- [ ] Implement the smallest compatible extension to existing autonomy APIs; retain existing action cooldowns and deterministic IDs.
- [ ] Integrate child spawn/despawn visuals, lifetime bars, and a material-cost toast; children must participate in combat but never become persistent roster slots.
- [ ] Run `node --test tests/game-systems.test.mjs` and commit `feat: fund bounded temporary sub-agents with materials`.

### Task 5: Add agent skills and slow epic boss encounters

**Files:** Create `app/game/skill-rules.mjs` and `app/game/boss-rules.mjs`; modify `app/FreemanProtocol.tsx`; test `tests/game-systems.test.mjs`.

**Interfaces:** `AGENT_SKILLS` with Kairos/Kira/Forge/Covenant definitions; `canUseSkill(agent, skillId, context) -> boolean`; `useSkill(agent, skillId, context) -> { agent, effects }`; `getBossEncounter(wave, seed) -> BossDefinition`; `tickBoss(boss, elapsedMs, context) -> { boss, events }`.

- [ ] Write failing tests for four distinct skills (time fracture, mark/execution, armor break/suppressive burst, repair/barrier), cooldown/target constraints, and deterministic effects.
- [ ] Add tests that waves 3+ can schedule one slow armored boss with telegraphed attacks, bosses damage agents/turrets, and boss rewards include rare Shards for slots 5–8 without spawning unbounded enemies.
- [ ] Run focused tests and verify failure.
- [ ] Implement pure skill and boss rules with explicit caps for attack rate, health, movement speed, and reward quantity.
- [ ] Integrate skill buttons, cooldown rings, boss telegraph markers, boss health bars, and reward drops into both renderers; reuse pooled display objects to avoid wave-time lag.
- [ ] Run full game tests and commit `feat: add agent skills and escalating warboss encounters`.

### Task 6: Refresh catalog, documentation, verification, and deployment

**Files:** Modify `app/asset-catalog/AssetCatalog.tsx`, `app/asset-catalog/AssetCatalog.module.css`, `tests/game-source-contracts.test.mjs`, `tests/mobile-layout.test.mjs`, and `README.md`.

- [ ] Add catalog cards for EMP discipline, eight warband slots, repair bay, field kits, temporary children, skill portraits, boss telegraphs, and rare loot; ensure every referenced asset path exists under `public/`.
- [ ] Add source contracts for the visible EMP cooldown, Core protect-only label, eight-slot roster, touch actions, and pooled enemy/loot cleanup.
- [ ] Update README with the player loop: gather → recruit/upgrade → repair → deploy skills → survive boss waves.
- [ ] Run `node --test tests/*.test.mjs` and `pnpm exec tsc --noEmit`.
- [ ] Run `pnpm exec next build` (or `pnpm exec vinext build` when the repository’s Sites wrapper is active), then run `scripts/validate-artifact.sh` against the produced artifact.
- [ ] Inspect the production routes `/`, `/asset-catalog`, and `/audio/freeman-protocol.mp3`; deploy with `pnpm dlx vercel --prod --yes --archive=tgz` only after the working tree is clean.
- [ ] Commit `docs: document warband and emp discipline systems` and report test/build/deployment evidence.

## Self-review checklist

- Spec coverage: EMP cadence/damage (Task 1), eight agents/material gathering (Task 2), damage/repair/Core protection (Task 3), four temporary children and 10–20 second lifetimes (Task 4), skills/bosses (Task 5), catalog/mobile/docs/deploy (Task 6).
- Placeholder scan: no TODO/TBD/“implement later” instructions; every task names exact files, interfaces, tests, commands, and commit messages.
- Type consistency: Task 2 owns the material wallet and roster state consumed by Tasks 3–5; Task 4 preserves the existing autonomy tick return shapes; Task 5 consumes the same agent IDs and resource wallet; Task 6 validates the integrated surface.
