# Final Fix Wave Report: Guided Prologue

## Scope

Addressed every finding from the final review package without modifying the approved specification.

- Tutorial events are phase-gated in both engines. Out-of-order events are ignored rather than retained, and early KAIROS / GUARD CORE actions are rejected before they can spend Compute or mutate squad state.
- Added the shared `OBSERVE_BREACH` roster in `app/game/tutorial-rules.mjs`. WebGL and Canvas now spawn the same five viruses with identical positions, speed (`0.85`), damage (`3`), and reward (`8`).
- WebGL first-wave retry now uses `cancelDefensePlacement(false)` after clearing dynamic gameplay objects, removing any live placement ghost as well as placement state.
- Added safe storage helpers with an in-memory fallback. Best-score reads/writes, tutorial completion persistence, and audio preferences no longer access `localStorage` directly, so storage exceptions cannot prevent construction or gameplay.
- Reset input at all relevant active-play / overlay boundaries: tutorial resolution, pause resume, upgrade/evolution entry, next wave, wave completion, defeat, and retry.

## TDD Evidence

### RED

Before production changes, the focused command failed as intended:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/storage.test.mjs
```

It reported the missing `OBSERVE_BREACH` export and storage helper module, plus source-contract failures for queued tutorial events, retry placement cleanup, direct storage access, and missing input resets.

A second focused RED pass added the action-gate regression. It failed because `canPerformTutorialAction` and the engine guards did not exist.

### GREEN / Final Verification

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/storage.test.mjs
```

Result: 31 passing, 0 failing.

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  ./node_modules/.bin/tsc --noEmit --incremental false
```

Result: exit 0.

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  ./node_modules/.bin/vinext build
```

Result: exit 0. The existing chunk-size advisory was emitted; no build errors occurred.

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/*.test.mjs
```

Result: 38 passing, 0 failing.

`git diff --check` also completed with exit 0.
