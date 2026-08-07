# Task 3 report — engagement lanes

## Implementation

- Added renderer-neutral `ENGAGEMENT_LANES`, `createEngagementState`, `assignEngagementLane`, `tickEngagement`, and `resolveEngagementAdvance` to `app/game/enemy-movement-rules.mjs`.
- Lane assignment is deterministic and side-effect free. Renderer state owns its per-enemy records.
- Both renderer loops now reset engagement state per wave, register a record at enemy creation, tick it once per frame, remove records with enemies, retain the nearby-player and boss paths, and use lane staging/tangent movement only for late-wave engagement fallback.
- Existing damage endpoints remain unchanged: the engagement fallback still resolves through the Core path; bosses remain on their existing boss update path.

## TDD evidence

1. Added the requested game-system tests and ran:

   ```sh
   /Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs --test-name-pattern="engagement"
   ```

   Result: exit 1. Expected ESM failure: `enemy-movement-rules.mjs` did not provide `assignEngagementLane`.

2. Added the renderer source-contract test and ran:

   ```sh
   /Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-name-pattern="engagement lanes" tests/game-source-contracts.test.mjs
   ```

   Result: exit 1. Expected assertion failure: `FreemanProtocol.tsx` did not contain `createEngagementState`.

3. After the minimal helper implementation:

   ```sh
   /Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/game-systems.test.mjs --test-name-pattern="engagement"
   ```

   Result: exit 0; 120 game-system tests passed (the name-pattern argument was placed after the file, so Node ran the file's complete suite).

## Final verification

```sh
node_runtime=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$node_runtime" --test --test-name-pattern="engagement" tests/game-systems.test.mjs
"$node_runtime" --test --test-name-pattern="engagement lanes" tests/game-source-contracts.test.mjs
"$node_runtime" ./node_modules/typescript/bin/tsc --noEmit --incremental false
"$node_runtime" ./node_modules/eslint/bin/eslint.js app/FreemanProtocol.tsx app/game/enemy-movement-rules.mjs tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
git diff --check
```

Result: exit 0. Focused game tests: 2/2 passed; renderer source contract: 1/1 passed; TypeScript: no output/errors; scoped ESLint: no lint findings (only Babel's existing >500 KB formatting note); whitespace check: clean.

```sh
node_runtime=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$node_runtime" --test --test-reporter=dot tests/*.test.mjs
"$node_runtime" ./node_modules/vinext/dist/cli.js build
```

Result: exit 0. Full suite produced only passing dot output. `vinext build` completed all five stages and emitted the existing chunk-size (>500 KB) and dynamic-route-classification warnings.

## Concerns

- The broad repository ESLint command (`eslint . --ignore-pattern dist --ignore-pattern .next`) exits non-zero with 324 errors and 12,645 warnings in existing large source files. The four task files lint clean in isolation.
- The initial `tsc --noEmit` invocation changed generated `tsconfig.tsbuildinfo`; it is intentionally not staged or included in the task commit.
- The build's large-chunk and route-classification messages are non-blocking existing build warnings.

## Commit

`1e38523 fix: keep late-wave enemies advancing and engaging`

## Review follow-up — engagement renderer integration

### Findings addressed

- Both renderer loops now use a late-wave record's staging point while its
  action is `advance` or `reposition`; after reaching staging, the record enters
  its attack phase and resumes the existing Core damage path. Nearby-player,
  agent, turret, repair-bay, and boss branches are unchanged.
- `tickEngagement` now turns an expired per-record reposition into `advance`.
  A due repath preserves the prior action in `repathAction`; each renderer
  consumes that action to refresh the current lane staging and attack-target
  metadata before continuing the same approach or attack phase.
- Reposition movement now bypasses the Core arrival-distance gate in both
  renderers, so an enemy that completed an attack inside that radius still
  takes its lane-tangent reposition step before returning to staging.

### Regression coverage

- Added a pure engagement-state regression asserting an expired reposition
  returns to lane approach.
- Added renderer-contract coverage asserting both WebGL and Canvas consume
  repath, choose staging outside the attack phase, pass the staging movement
  target to the advance resolver, and bypass the Core gate while repositioning.

### Verification

```sh
node_runtime=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$node_runtime" --test --test-name-pattern="engagement returns|approach lane staging" tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
"$node_runtime" ./node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

Result: all focused regressions passed, TypeScript emitted no errors, and the
working-tree diff has no whitespace errors.
