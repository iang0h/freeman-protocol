# Task 4 report: material-funded temporary sub-agents

## Scope delivered

- Extended `spawnTemporarySubAgent` to enforce a four-child cap per parent,
  inherit the parent role, reject recursive children, and atomically deduct one
  Component plus one Shard only after all spawn checks pass.
- Added `getSubAgentLifetime(agent, upgrades)`, with deterministic 10-, 15-,
  and 20-second lifetime tiers. Existing tick return fields remain available;
  `lifetimeRatio` supplements the existing health cue for renderer use.
- Added rule coverage for per-parent caps, exact tier expiry, role inheritance,
  recursive-spawn rejection, material gathering before construction, and failed
  purchases that leave the material wallet untouched.
- Updated both renderers to construct after a parent has gathered, consume the
  shared loot wallet, preserve combat actions, render lifetime bars, emit pooled
  spawn/despawn rings, and announce the exact material cost in a toast.
- Removed the old global per-wave cap. The HUD now labels the active count with
  the four-per-agent limit; temporary children remain separate from the roster.

## TDD evidence

1. Replaced the old three-child/five-second expectations before changing
   production code, then ran the focused game suite. It reported four expected
   assertion failures: the old global ID/lifetime behavior, absent lifetime
   helper, and no material deduction.
2. Implemented the rule extension, reran the focused tests, then integrated the
   renderer behavior and its source contracts.

## Verification

- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`
  - Passed: 95 tests, 0 failures.
- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs`
  - Passed: 110 tests, 0 failures.
- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/typescript/bin/tsc --noEmit`
  - Passed: exit 0.
- `git diff --check`
  - Passed: no whitespace errors.

## Compatibility notes

- Core health remains untouched by all temporary-child actions; support children
  still repair the player only.
- Lifetime upgrades are rule-driven through the supplied `upgrades` argument;
  no new upgrade purchase UI was introduced because Task 4 defines the lifetime
  interface but no additional purchasable upgrade definition.

## Review follow-up: spawn feedback

- Added immediate spawn feedback in both `maybeSpawnTemporarySubAgent` paths:
  a deployment ring and an eight-particle burst at the parent location after a
  child has been successfully created. The WebGL child marker continues to use
  `temporarySubAgentPool`; its existing expiry ring and pooled release remain
  unchanged.
- Added a source-contract regression test that scopes each renderer's spawn
  method and requires both ring and burst feedback, plus the WebGL marker pool
  acquisition contract.

### Follow-up verification

- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs`
  - Passed: 111 tests, 0 failures.
- `/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ../../node_modules/typescript/bin/tsc --noEmit`
  - Passed: exit 0.
- `git diff --check`
  - Passed: no whitespace errors.
