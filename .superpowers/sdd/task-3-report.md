# Task 3 Report: WebGL Guided Prologue and Wave-One Checkpoint

## Scope

Implemented the Task 3 WebGL-only guided prologue in `app/FreemanProtocol.tsx` and added its specified source contract. Shared controller and HUD types were extended so both renderers compile; the Canvas engine only supplies inert interface/HUD placeholders and does not implement tutorial behavior (reserved for Task 4).

## RED evidence

After appending the required contract and before production changes:

```text
node --test tests/game-source-contracts.test.mjs
...
✖ WebGL engine runs the shared tutorial and checkpoints wave one
AssertionError: The input did not match the regular expression /advanceTutorial/
tests 9; pass 8; fail 1
```

## Implementation

- Added the tutorial rule imports, `TutorialStep`, `TutorialEvent`, `StartOptions`, checkpoint type, controller methods, callback, and HUD fields.
- Added the WebGL movement ring, displacement/ring-entry transition, three fixed training threats, recruit/guard/breach transitions, and tutorial health floor.
- Added `resetMissionState`, tutorial-threat cleanup, first-wave checkpoint capture, retry restoration, and shared construction helpers for agents and sentries.
- Changed wave one to the defined initial roster, one delayed defined reinforcement roster, and its defined enemy damage multiplier.
- Preserved input reset handling from Task 2.

## GREEN evidence

```text
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
tests 20; pass 20; fail 0
```

```text
node_modules/.bin/tsc --noEmit --incremental false
exit 0
```

```text
node_modules/.bin/vinext build
Build complete. Run `vinext start` to start the production server.
exit 0
```

The build emitted its existing chunk-size advisory but no build errors.

## Self-review

- Tutorial completion/skip clears only marked tutorial enemies before checkpoint capture and wave-one spawn; completion does not start the first wave twice.
- Retry restores checkpoint Compute and score before adding agents/sentries with `charge: false`, preventing score or Compute duplication.
- Tutorial events are gated by their current state, with training cleared only after the third confirmed tutorial death and breach completion only when no tutorial threats remain.
- Skip resolves directly to the real first wave; completion first clears its observe breach, then resolves once.

## Commit

`af383bf feat: add WebGL guided prologue`

## Review Fixes

- Queued tutorial events in the WebGL engine. An early `kairos-recruited` or
  `guard-selected` event remains pending and is consumed automatically when
  the tutorial reaches its matching phase.
- Added a per-mission `tutorialResolved` latch. Both `skipTutorial()` and
  `resolveTutorial()` now return after the first resolution, so callback,
  checkpoint, and wave-one spawn effects happen exactly once.
- Added a focused source-contract regression test covering the queued-event
  flow and the single-resolution latch.

### Review-fix test evidence

RED (before production change):

```text
node --test tests/game-source-contracts.test.mjs
tests 10; pass 9; fail 1
AssertionError: expected WebGL tutorial event queue implementation
```

GREEN:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
tests 21; pass 21; fail 0
```

```text
node_modules/.bin/tsc --noEmit --incremental false
exit 0
```
