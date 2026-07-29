# Task 6 report: warband and EMP discipline catalog

## Delivered

- Added an eight-card **Warband Discipline** catalog section for EMP discipline,
  eight persistent warband slots, the repair bay, field kits, temporary
  children, skill portraits, boss telegraphs, and rare loot. The catalog uses
  existing CSS-rendered card visuals and introduces no new public asset paths.
- Added a visible EMP charge status, a `CORE HEALTH · PROTECT-ONLY` HUD label,
  and a corrected eight-slot `WARBAND` roster label. These are presentation-only
  changes; game rules and combat values are unchanged.
- Added source contracts for the catalog, the EMP/Core/roster/touch surface,
  pooled enemy and loot cleanup, and mobile placement of the EMP, skill, and
  repair actions.
- Updated the README with the player loop: gather → recruit/upgrade → repair
  → deploy skills → survive boss waves.

## TDD evidence

1. Added the catalog and HUD source-contract tests before the matching catalog
   and HUD copy existed.
2. Ran the focused contracts with the bundled Node runtime. The initial run
   reported two expected failures: missing catalog entries and missing visible
   EMP/Core status labels.
3. Added the presentation and catalog copy, then reran the focused contracts:
   50 passed, 0 failed.

## Verification

- `node --test tests/*.test.mjs` using the bundled Node runtime: 127 passed,
  0 failed.
- `tsc --noEmit` using the worktree-installed TypeScript binary: passed.
- `eslint app tests` using the worktree-installed ESLint binary: passed.
- `vinext build` using the worktree-installed Vinext binary: passed. It emitted
  `/` and `/asset-catalog`; Vinext reported only its pre-existing chunk-size
  and route-classification notices.
- `bash scripts/validate-artifact.sh`: passed; confirmed the Sites manifest and
  ESM Worker `default.fetch` export.
- Production-worker route checks: `/`, `/asset-catalog`, and
  `/audio/freeman-protocol.mp3` each returned HTTP 200; the audio route returned
  `audio/mpeg`.
- `git diff --check`: passed.

## Environment and deployment note

The requested `pnpm exec` wrapper attempted the workspace's guarded install and
stopped because native dependency build scripts are deliberately unapproved in
this environment. Equivalent checks ran through the already installed project
binaries with the bundled Node runtime. No archive deployment was attempted:
this task has no final-workflow authorization to publish externally, and the
required commit must exist before any such deployment.

## Follow-up: Repair Cache protect-only correction

- Corrected the Repair Cache catalog card from Core restoration to operator and
  field-kit recovery. Its visible copy now explicitly states that the Covenant
  Core remains protect-only.
- Added a source-contract regression that requires the operator/field-kit copy
  and rejects Core-restore or Core-stabilization wording within that card.
- TDD evidence: the new contract failed against the former `CORE RESTORE` /
  “Stabilises a damaged Covenant Core” copy, then passed after the scoped copy
  correction.
- Verification: bundled `node --test tests/*.test.mjs` passed (128 tests);
  bundled TypeScript `tsc --noEmit` and ESLint passed; `git diff --check`
  passed. The `pnpm exec` wrapper remains unavailable because it triggers the
  workspace's guarded install and fails on unapproved native dependency builds.

## Final integration-review remediation (2026-07-29)

### Runtime-rule corrections

- Replaced renderer-local EMP behavior with one shared EMP state machine. EMP
  now starts charged, fires once, recharges deterministically, and uses a fixed
  restrained base damage that is unaffected by roster size, terrain, or Relay
  armor.
- Limited each EMP upgrade to its documented dimension: Voltage rank one
  changes cadence, Voltage rank two bypasses resistance, while Relay armor and
  terrain modify radius only. Both renderers expose the same charge/cooldown
  state and invoke the same activation path.
- Added one shared action-state gate for persistent agents and their temporary
  children. Retreating or disabled parents can no longer gather, spawn, fight,
  receive Covenant support, or continue acting through children. Child
  lifetimes still advance while inactive so suppression cannot make them
  permanent.
- Added `Lifetime Matrix` as a two-rank, Component-funded upgrade for all eight
  agents. Purchased ranks produce the documented 10, 15, and 20 second
  temporary-unit lifetimes in both renderer paths.

### Encounter, repair, and interface corrections

- Boss telegraphs now snapshot a fixed world-space target and resolve damage
  against the occupants present when the telegraph expires. Players can evade
  after the warning, and entrants can be hit. Pending targets require both kind
  and ID, avoiding collisions between entities with matching numeric IDs.
- Boss target priority is measured from the boss rather than the arena origin.
  Boss cooldown and telegraph transitions now consume the complete elapsed
  timestep, producing the same state for equivalent large or partitioned
  updates.
- Repair Caches now restore their HP value and award exactly one field kit.
  Canvas field-kit behavior matches WebGL: an unavailable repair does not spend
  inventory or display success. Destroyed Repair Bay copy now truthfully states
  that the bay remains offline for the rest of the mission.
- Kept the mobile recruitment and upgrade dock interactive above its workshop
  overlay, retained large touch-safe controls, and updated the visible and
  accessible recruitment instructions for all slots 1–8 and their real
  resource costs.
- Synchronized the living catalog with runtime semantics for all eight agents,
  EMP cadence/resistance/radius, Lifetime Matrix, loot amounts, Repair Bay
  destruction, Relay armor, terrain, and fixed boss-area telegraphs.

### Regression coverage and review evidence

- Expanded system tests for EMP charge and cooldown, upgrade isolation,
  resistance composition, action-order parity, all eight Lifetime Matrix
  purchases, fixed and evadable boss areas, kind-aware pending targets,
  boss-relative target selection, timestep partition invariance, Repair Cache
  inventory, unavailable field kits, and mission-long Repair Bay destruction.
- Expanded source and mobile-layout contracts for shared renderer ownership,
  catalog truthfulness, all-eight-agent controls, overlay stacking, and
  touch-safe workshop interactions.
- The added tests were observed failing against the pre-fix implementation and
  passing after the scoped corrections. An independent final re-review found
  no remaining P0–P2 findings.

### Final verification

- Bundled Node test suite: 144 passed, 0 failed.
- TypeScript `tsc --noEmit --incremental false`: passed.
- ESLint for the repository, excluding generated output: passed.
- Production `vinext build`: passed and emitted `/` and `/asset-catalog`; only
  the existing chunk-size and route-classification notices remained.
- `scripts/validate-artifact.sh`: passed and confirmed the hosting manifest and
  ESM Worker `default.fetch` export.
- `git diff --check`: passed.

The production build required an ad-hoc-signed copy of the bundled Node binary
so macOS could load Rolldown's native module. Running the worktree-local Vinext
binary avoided loading two dependency trees. This was an environment-only
workaround; it did not change the repository. No external deployment was
performed because this work was explicitly local-only.

## V2 whole-branch review remediation (2026-07-29)

- First-wave checkpoints now snapshot and restore EMP charge/cooldown, all loot
  counters, and Repair Bay HP in both WebGL and Canvas. The retry regression
  proves a failed run cannot retain extra materials, a spent EMP, or a destroyed
  bay across retry.
- Forge's `armorReduction: 0.55` is now consumed by the live damage path. Armor
  break raises damage from the normal armored multiplier while preserving a
  non-bypass remainder; the shared `resolveArmoredDamage` result is covered by
  a live damage-result test.
- Manual agent skills now pass through `getAgentActionState`, so repairing,
  retreating, disabled, dead, or otherwise unavailable agents cannot activate
  skills. HUD skill controls expose the same availability state and disable
  unavailable actions.
- Removed Bastion's protected-Core `maxHp` mutation and strengthened the
  protect-only contract to reject both Core HP and max-HP writes.
- Durable help copy now documents recruitment shortcuts through slots 1–8.
- Shard catalog copy now matches the economy: Protocol Shards fund late
  persistent recruits and the one-shard temporary-child material cost. Boss
  pickup presentation receives the actual pickup value in both renderers, so
  cache labels/toasts announce variable quantities accurately.
- Removed `fieldKits` from repair-decision semantics. A decision can only become
  `repair` when a functioning Repair Bay exists; field-kit use remains an
  explicit atomic action.

### V2 verification

- Bundled Node suite: 149 passed, 0 failed.
- TypeScript `tsc --noEmit --incremental false`: passed.
- ESLint for the repository, excluding generated output: passed.
- Production `vinext build`: passed; routes `/` and `/asset-catalog` emitted.
- `scripts/validate-artifact.sh`: passed; ESM Worker `default.fetch` and the
  hosting manifest were present.
- `git diff --check`: passed.
