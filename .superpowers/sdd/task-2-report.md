# Task 2 report — deterministic strategic battlefield nodes

## Delivered

- Added `app/game/battlefield-rules.mjs`, a renderer-independent state model
  for exactly five fixed nodes: Core, Command Uplink, Repair Bay, Assembly
  Pad, and Compute Relay.
- Exposed immutable `BATTLEFIELD_NODES` metadata at the existing camera-marker
  positions, plus state creation, lookup, bounded damage/repair, repair-cost,
  and online-effect helpers.
- Added game-system coverage for fixed metadata, repair cost, node lifecycle,
  Component spending, recovery from offline, and the bounded command/repair/
  compute effects.
- Preserved the pure-module boundary: this task does not change either
  renderer or `FreemanProtocol.tsx`.

## TDD evidence

### RED

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-systems.test.mjs --test-name-pattern="battlefield"
```

Before the module existed, Node reported:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../app/game/battlefield-rules.mjs'
tests 1
pass 0
fail 1
```

### GREEN

The same focused command after implementation completed with all 117
`game-systems` tests passing and no failures.

## Final verification

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
```

```text
tests 201
pass 201
fail 0
cancelled 0
skipped 0
todo 0
```

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --check app/game/battlefield-rules.mjs
git diff --check
```

Both commands exited 0 with no output.

## Self-review

- State transitions return new state and node objects; no caller-owned
  runtime state is mutated.
- Damage and repair are finite, non-negative, and capped to each node's
  maximum health. Repairs cannot spend Components below zero and do not charge
  a full-health or unknown node.
- Effects are derived only from `online` nodes. Offline nodes remain
  repairable, but their effect is zero/disabled until fully restored.
- The fixed metadata collection and each metadata record are frozen; runtime
  nodes are cloned when state is created.

## Deferred integration

The Task 2 brief originally mentioned renderer source-contract assertions.
The parent explicitly deferred those assertions to the renderer integration
task because this task is intentionally pure and no renderer calls exist yet.
No source-contract test was added that would fail before that integration.

## Concerns

- `repairProgress` is accumulated restored health since the most recent
  damage, and resets on damage. The renderer integration should use that
  documented runtime field if it needs a repair-progress display.
- The next integration task must import these helpers in both renderers and
  add the deferred source-contract assertions.
