# Task 2 report — authoritative co-op room state

## Delivered

- Added a transport-neutral, deeply immutable two-player room state machine in
  `app/game/co-op-room.mjs`.
- Added `app/game/co-op-simulation.mjs`, a deterministic reducer with shared
  operator cooldowns, enemy damage/loot, Core pressure, autonomous Core repair,
  sentry placement, warband recruitment, reserve deployment, boss ticking, and
  the three-second wave intermission.
- Reused the existing protocol parser/canonical snapshot, progression,
  combat, EMP, loot, repair, sentry, wave, warband, boss, and autonomy rules;
  no DOM or renderer module is imported.
- Added lifecycle and shared-authority coverage for ready/start, room capacity,
  atomic shared spending, duplicate action sequences, immutable snapshots,
  reconnect grace, enemy defeat, loot pickup, and wave transition.

## TDD evidence

### RED

Command:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-rules.test.mjs
```

Result before the two production modules existed:

```text
tests 12
pass 6
fail 6
```

Each new test failed with `ERR_MODULE_NOT_FOUND` for
`app/game/co-op-room.mjs`, which was the expected missing-feature failure.

### GREEN

Same focused command after implementation:

```text
tests 12
pass 12
fail 0
cancelled 0
skipped 0
todo 0
```

## Final verification

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/*.mjs
```

```text
tests 226
pass 226
fail 0
cancelled 0
skipped 0
todo 0
```

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit --incremental false
```

Exit 0; no output.

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/vite build
```

Exit 0. Vite emitted its existing chunk-size and ineffective-dynamic-import
warnings, but completed all five build phases.

```sh
git diff --check
```

Exit 0; no output.

Focused ESLint could not run because the configured environment has no
`eslint` executable (`scripts/sites-env.sh: exec: eslint: not found`).

## Commit

- `df5ef4e feat: add authoritative co-op room state`

The commit contains only:

- `app/game/co-op-room.mjs`
- `app/game/co-op-simulation.mjs`
- `tests/co-op-rules.test.mjs`

## Concerns

- The Task 1 canonical snapshot schema deliberately contains shared player,
  Core, economy, warband, and wave state but no enemy/loot/sentry runtime
  arrays. The room maintains those authoritative runtime fields and the tests
  prove their shared reducer behavior, but a later protocol/schema expansion
  is required before a network client can render those entities directly from
  `getSnapshot`.
- Reconnect expiry is exposed as the deterministic `RECONNECT_EXPIRED` error;
  closing/cleaning up an expired room belongs to the WebSocket adapter in Task
  3.

## Review-fix update

### Fixes delivered

- Normal rooms now deterministically spawn their initial wave on `startRoom`
  and a fresh deterministic wave after every three-second intermission.
- The protocol snapshot canonicalizer now carries immutable `enemies`, `loot`,
  `sentries`, `boss`, and `subAgents` fields; `getSnapshot` projects each
  authoritative runtime collection into that schema.
- The autonomous reducer now executes selected sentry repair and sentry build
  work instead of discarding those decisions. Co-op `focus` priority maps to
  the autonomous expansion strategy for this purpose.
- Reserve deployment requires an explicit recruited shared-warband parent and
  funds the entire three-unit batch atomically.
- Input messages are rejected before play, track per-player watermarks, and
  reject stale/replayed sequences.

### Review RED

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/co-op-rules.test.mjs
```

```text
tests 16
pass 11
fail 5
```

The failures respectively showed absent next-wave spawning, no initial wave,
runtime arrays omitted from snapshots, discarded autonomous sentry building,
and accepted pre-game input.

### Review GREEN and final verification

Focused room/protocol suite:

```text
tests 16
pass 16
fail 0
```

Full suite:

```text
tests 230
pass 230
fail 0
cancelled 0
skipped 0
todo 0
```

`tsc --noEmit --incremental false`, `vite build`, and `git diff --check` all
exited 0. The Vite build retains its pre-existing chunk-size and
ineffective-dynamic-import warnings.
