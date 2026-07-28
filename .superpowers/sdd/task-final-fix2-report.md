# Final Fix Wave 2 Report: Guided Prologue

## Scope

Addressed the remaining final-review findings without modifying the approved
specification.

- Tutorial recruitment is now fully protected in both engines. While a tutorial
  is active, only KAIROS is accepted during the `recruit` step; KIRA, FORGE,
  COVENANT, KAIROS out of step, and all other recruit attempts return before
  `addAgent`, so they cannot spend Compute or mutate the squad. The behavioral
  rule tests cover the recruitment gate, and source contracts cover the same
  early-return shape in both WebGL and Canvas engines for the reported
  79-Compute/KIRA path.
- `GUARD CORE` is accepted in both `command` and `observe`, so a player who
  selects FOLLOW or FOCUS during the breach can restore the demonstrated order.
- Safe storage now prefers the current session's in-memory value for any key
  written during that session. A failed browser `setItem` therefore cannot be
  hidden by a stale value returned from browser storage.

## TDD Evidence

### RED

After adding the regressions and before changing production code, this focused
command produced the expected three failures:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/storage.test.mjs
```

The failures were:

1. Both engine source contracts lacked an all-recruit guard ahead of mutation.
2. `canPerformTutorialAction("observe", "guard-core")` returned `false`.
3. A failed storage write read the stale browser value instead of the
   in-session fallback.

### GREEN / Verification

Focused tests:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/storage.test.mjs
```

Result: 32 passing, 0 failing.

Full source tests:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/*.test.mjs
```

Result: 39 passing, 0 failing.

Typecheck:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  ./node_modules/.bin/tsc --noEmit --incremental false
```

Result: exit 0.

Direct production build:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  ./node_modules/.bin/vinext build
```

Result: exit 0. The existing client chunk-size advisory was emitted; no build
errors occurred.

`git diff --check` also completed with exit 0.
