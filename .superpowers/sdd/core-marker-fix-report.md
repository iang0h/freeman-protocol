# Core Marker Synchronization Fix Report

Date: 2026-08-07
Base commit: `19c4c58`
Scope: final-review Core command-map/HUD mismatch

## Outcome

- Added `syncBattlefieldRuntimeCore`, an immutable shared rule that copies the
  live Core health, maximum health, and derived status into battlefield state
  without replacing or changing any other strategic-node record.
- Both WebGL and Canvas synchronize their `180`-HP runtime Core immediately
  before creating strategic HUD state and command-map markers.
- Canonical command-map marker projection now accepts live battlefield state,
  so the Core marker reports the synchronized value rather than its static
  `100/100` metadata default.
- Existing non-Core kinds, coordinates, and node-specific health remain intact.

## Root cause

Both renderers passed the live Core into `createSimulationView`, but their
strategic HUD and canonical marker decoration used the independently created
`battlefieldState`. Its Core retained the rule metadata default of `100/100`,
even after the runtime Core took damage.

## TDD evidence

The focused red run failed in the two intended places:

```text
node --test --test-name-pattern="damaged runtime Core state|both renderer command-map builders" tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
2 tests: 0 passed, 2 failed
```

The behavioral failure showed that `syncBattlefieldRuntimeCore` did not exist;
the adapter failure showed neither renderer performed the sync before marker
publication. After the implementation, the same focused run passed `2/2`.

The regression synchronizes a damaged runtime Core at `135/180`, verifies its
canonical marker reports `DAMAGED 135/180`, verifies a previously damaged
Repair Bay remains `DAMAGED 75/100`, and verifies all five canonical marker
kinds remain unchanged.

## Verification

- Focused game-system and source-contract suites: **238 passed, 0 failed**.
- Full Node suite: **340 passed, 0 failed**.
- TypeScript: `tsc --noEmit --incremental false` passed.
- Scoped ESLint on the five changed source/test files passed. Babel emitted only
  its informational large-file note for `FreemanProtocol.tsx`.
- Production `vinext build` passed all five stages.
- `git diff --check` passed before this report was added and is rerun before
  commit.

## Notes

- The build retains its existing large-client-chunk and route-classification
  advisories; neither fails the build.
- `tsconfig.tsbuildinfo` was already modified when this task began and remains
  excluded from the commit.
- No push or deployment was performed.
