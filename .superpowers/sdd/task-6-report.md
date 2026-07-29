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
