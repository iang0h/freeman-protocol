# Core Repair Role Fix Report

Date: 2026-08-07
Scope: prevent war squads from spending Components on an untargetable damaged Core.

## Fix

- Added `selectWarSquadRole` to the shared war-layer rules.
- Its repair-needed predicate excludes the protected `core`; only non-Core nodes
  that are not online select a paid repair squad.
- Both WebGL and Canvas war-squad decision loops now use that shared selector
  before calling `spawnWarSquad`.
- The existing autonomous Core-recovery path remains responsible for repairing
  the Core.

## Regression coverage

- Pure regression: synchronizes the runtime Core to `135/180` while every
  non-Core strategic node remains online, then asserts the selector returns
  `null` (no paid repair squad role).
- Source regression: asserts both renderer decision loops use the shared
  protected-Core-safe selector and return before spawning when no role exists.

## TDD evidence

Focused RED runs failed as intended before implementation:

```text
war squad selection leaves Core recovery to the protected-Core path
Expected: typeof selectWarSquadRole === "function"
Actual: "undefined"

both war-squad decisions use the protected-Core-safe role selector
Expected source to contain selectWarSquadRole
```

Focused GREEN run after implementation:

```text
2 passed, 0 failed
```

## Verification

- Full Node suite: `342 passed, 0 failed`.
- TypeScript: `tsc --noEmit --incremental false` passed.
- Scoped ESLint passed for the two source and two test files. Babel printed only
  its informational large-file note for `FreemanProtocol.tsx`.
- `vinext build` completed all five stages successfully.
- `git diff --check` passed before commit.

## Environment note

The ChatGPT-bundled Node runtime cannot load Rolldown's native macOS binding
because their signing Team IDs differ. The build passed with the workspace's
Node 22.13.1 runtime instead. No dependencies were changed.

## Scope note

`tsconfig.tsbuildinfo` was already modified when this task began and is not
included in the commit. No push or deployment was performed.
