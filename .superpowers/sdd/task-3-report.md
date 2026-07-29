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

## Review follow-up fixes

- Made repair decisions stateful: agents that have begun withdrawing/repairing
  remain in that lifecycle until `returnHealthRatio`, then resume combat.
- Brought the Canvas fallback to repair parity: it now has a destructible,
  separately rendered repair bay; retreat movement; bay healing; agent/turret
  damage; agent/turret health bars; and hostile projectile collisions for all
  vulnerable targets.
- Made the Core protect-only. Upgrade, Covenant, temporary support-agent, and
  repair-loot paths no longer restore Core health; player, agent, and turret
  repair paths remain available.
- Added behavioral lifecycle, destroyed-bay fallback, Core-isolation, and
  projectile-target tests, plus renderer parity source contracts.

## Follow-up TDD and verification evidence

1. Wrote the new lifecycle/projectile/Core/Canvas tests, then ran:

   `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`

   Initial output: 92 tests, 86 passed, 6 expected failures. The failures
   identified the stateless repair transition, absent hostile-projectile helper,
   repair-loot Core healing, support-sub-agent Core healing, and missing Canvas
   parity implementation.

2. After implementation, ran:

   `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs`

   Output: 107 tests passed, 0 failures.

3. Ran:

   `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/iangoh/Documents/Codex/2026-07-28/iang0h-freeman-protocol-https-github-com/work/freeman-protocol/node_modules/typescript/bin/tsc --noEmit --project tsconfig.json`

   Output: exit 0.

4. Ran `git diff --check`.

   Output: no whitespace errors.

## Review follow-up: WebGL repair-bay convergence

### Root cause and fix

- The Canvas fallback gives agents with a `repair` or `retreat` decision a zero
  movement radius around the repair bay. WebGL anchored those agents to the same
  bay but retained its normal 1.45–1.83 orbit radius, which is outside the
  1.35-unit repair gate and could leave agents permanently unable to heal.
- WebGL now derives the same `withdrawing` state and uses a zero-radius bay
  target, allowing agents to reach the existing repair threshold.
- Added a source-contract regression test requiring both renderers to define
  withdrawal, select a zero-radius target, and preserve the 1.35 repair gate.

### TDD and verification

1. Added the renderer-parity source test and ran the focused source suite.
   It failed as expected because WebGL had no withdrawal movement branch.
2. Applied the minimal WebGL zero-radius withdrawal fix and reran:

   `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs`

   Output: 102 tests passed, 0 failures.
3. Ran TypeScript no-emit with the bundled Node runtime: exit 0.
4. Ran `git diff --check`: no whitespace errors.
