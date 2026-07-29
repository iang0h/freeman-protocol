# Task 3 report: damage, repair bay, retreat, and turret survivability

## Scope delivered

- Added `app/game/repair-rules.mjs` with pure, immutable repair interfaces:
  `applyUnitDamage`, `getRepairDecision`, `tickRepairBay`, and `repairTurret`.
- Added regression tests for repair thresholds, distinct functioning repair bays,
  destroyed-bay withdrawal, clamped disabled timers, Core-health isolation, and
  Component-funded turret repairs.
- Added a separate in-world repair bay, autonomous agent retreat/return behavior,
  agent and turret health bars, enemy selection of vulnerable agents/turrets, and
  a disabled-turret firing guard in the WebGL engine.
- Added the shared `REPAIR / FIELD KIT` action. It uses repair supplies for agents
  and Components for sentries, and is rendered as a 48px touch-safe control.
- Kept the Core outside every repair-rule mutation path; the repair bay is a
  separate runtime object.

## TDD evidence

1. Added repair-rule tests before implementation and ran them. The focused game
   suite reported three expected failures because `repair-rules.mjs` did not yet
   exist (`ERR_MODULE_NOT_FOUND`).
2. Implemented the smallest rule module to satisfy that contract, then integrated
   it with the engines and touch UI.

## Verification

- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs`
  - Passed: 104 tests, 0 failures.
- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/iangoh/Documents/Codex/2026-07-28/iang0h-freeman-protocol-https-github-com/work/freeman-protocol/node_modules/typescript/bin/tsc --noEmit --project tsconfig.json`
  - Passed: exit 0.
- `git diff --check`
  - Passed: no whitespace errors.
- `npm run build`
  - Could not run in this supplied worktree: its `node_modules` directory is not
    present and the bundled Node runtime does not include `npm`. The TypeScript
    verification above used the repository's existing dependency tree directly.
