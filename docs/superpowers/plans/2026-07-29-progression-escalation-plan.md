# Progression and Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make loot unmistakable, deepen hybrid RPG progression, give temporary sub-agents real roles, and scale hacker counter-play and terrain modifiers across later waves.

**Architecture:** Add pure deterministic rule modules first, then consume them from the shared WebGL/Canvas game loop. Keep pooled rendering and safe storage boundaries intact; UI reads the same HUD state as gameplay. Each task ends with focused tests before the next integration task.

**Tech Stack:** React/Next, TypeScript, Three.js, Canvas 2D, vanilla CSS modules, Node test runner, existing Vinext/Next build.

## Global Constraints

- Wave one remains forgiving and unchanged except for clearer loot presentation.
- WebGL and Canvas consume identical rule outputs.
- Temporary children cannot recursively spawn and must clear on wave/reset/dispose.
- Mission inventory writes use safe storage helpers; failed writes cannot break play.
- Mobile touch controls remain camera-aware and accessible.

---

### Task 1: Model visible loot and elite drops

**Files:**
- Modify: `app/game/loot-rules.mjs`
- Modify: `app/game/three-resources.ts`
- Modify: `app/FreemanProtocol.tsx`
- Test: `tests/game-systems.test.mjs`, `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Produce `LootType` entries with `label`, `color`, `dropChance`, `value`, and `eliteOnly` metadata.
- Produce pooled pickup visuals with a world label/beam contract shared by both renderers.

- [ ] Write failing tests asserting every common loot type has readable metadata, elite-only drops are gated, and pickup cleanup returns pooled meshes.
- [ ] Run `PATH=".../node/bin:$PATH" node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`; confirm the new assertions fail.
- [ ] Implement metadata, elite drop selection, larger emissive pooled meshes, landing/pulse animation, and explicit pickup label/toast text.
- [ ] Consume the metadata in Canvas drawing and the WebGL pickup pool; add touch-safe pickup radius and `aria-live` HUD feedback.
- [ ] Rerun focused tests and `git diff --check`; commit `feat: make loot visible and varied`.

### Task 2: Add hybrid player/agent progression

**Files:**
- Modify: `app/game/progression.mjs`
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`
- Test: `tests/game-systems.test.mjs`, `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Add `PLAYER_ARMORS`, `AGENT_COMPONENT_UPGRADES`, and `purchaseComponentUpgrade(state, target, upgradeId)` pure functions.
- Extend HUD state with armor id/bonuses and component upgrade ranks.

- [ ] Add failing tests for the three armor profiles, one identity upgrade per agent, component cost atomicity, and capped ranks.
- [ ] Run focused tests and verify failure.
- [ ] Implement pure purchase rules; component cost is deducted only after validation, and upgrades affect concrete stats (health, damage, cooldown, EMP efficiency, or healing).
- [ ] Add the post-wave draft card categories (player/agent/defense) and an armor selection panel; preserve existing upgrade cards as the draft layer.
- [ ] Render inventory costs, ranks, armor bonuses, and disabled reasons on mobile and desktop.
- [ ] Run focused tests, lint, and commit `feat: add hybrid rpg progression`.

### Task 3: Make temporary sub-agents real role units

**Files:**
- Modify: `app/game/autonomy-rules.mjs`
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/game/three-resources.ts`
- Test: `tests/game-systems.test.mjs`, `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Add `tickTemporarySubAgent(state, context, delta)` returning deterministic `attack`, `repair`, `guard`, or `idle` actions.
- Keep `spawnTemporarySubAgent` bounded and non-recursive.

- [ ] Add failing tests for assault damage, support recovery/buff, defense interception, lifetime expiry, health cue state, and no recursive spawn.
- [ ] Run focused tests and verify failure.
- [ ] Implement role action selection and cooldowns in the pure module.
- [ ] Give WebGL children pooled marker/health visuals and Canvas children equivalent draw state; apply returned actions through existing damage/heal/guard paths.
- [ ] Clear child resources and state on wave transition, defeat, retry, and disposal.
- [ ] Run focused tests and commit `feat: make temporary sub-agents combat capable`.

### Task 4: Scale hacker counter-play and terrain modifiers

**Files:**
- Create: `app/game/encounter-rules.mjs`
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`
- Test: `tests/game-systems.test.mjs`, `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Export `getWaveModifiers(wave)`, `getTerrainModifier(wave)`, and `resolveEmpDamage(baseDamage, target, modifiers)`.
- Modifier outputs are serializable and renderer-neutral.

- [ ] Add failing tests proving wave one has no resistance, later waves gain shield/decoy/armor/jammer behavior, and terrain modifiers are deterministic.
- [ ] Run focused tests and verify failure.
- [ ] Implement encounter rules with bounded scaling; expose visible resistance flags on enemies before EMP resolution.
- [ ] Apply modifiers to both engines’ spawn, EMP, targeting, and route logic; add lightweight terrain overlays for Relay Storm, Firewall Lanes, Data Fog, and Split Breach.
- [ ] Run focused tests and commit `feat: escalate hacker encounters and terrain`.

### Task 5: Integrate HUD, catalog, and regression coverage

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/asset-catalog/AssetCatalog.tsx`
- Modify: `app/asset-catalog/AssetCatalog.module.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- HUD exposes loot inventory, armor profile, agent ranks, temporary child count, terrain modifier, and EMP resistance.
- Catalog documents new armor, elite loot, agent upgrades, and terrain signals.

- [ ] Add failing source/render assertions for the new HUD and catalog sections.
- [ ] Implement compact responsive HUD cards and catalog entries with reduced-motion support.
- [ ] Run full `node --test tests/*.test.mjs`, ESLint, `vinext build`, and `bash scripts/validate-artifact.sh` with the bundled Node path.
- [ ] Run `git diff --check`; commit `feat: surface progression and encounter telemetry`.

### Task 6: Review, merge, and deploy

**Files:**
- Modify: documentation only if review requires corrections.

- [ ] Generate the review package from the merge base and dispatch a fresh reviewer for Critical/Important findings.
- [ ] Fix all Important findings in one wave, rerun the full suite/build, and obtain rereview approval.
- [ ] Merge the feature branch into `main`, push GitHub, and deploy with `pnpm dlx vercel --prod --yes`.
- [ ] Verify `https://freeman-protocol.vercel.app/`, `/asset-catalog`, and the audio route return HTTP 200.
