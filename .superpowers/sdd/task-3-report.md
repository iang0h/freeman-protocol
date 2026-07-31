# Task 3 report: readable combat feedback

## Status

Complete and committed.

- Commit: `4ca1155dbb58695d23d58fb4dfe72c86d1719805`
- Commit message: `feat: add readable combat feedback`
- Changed tracked files:
  - `app/FreemanProtocol.tsx`
  - `tests/game-source-contracts.test.mjs`
  - `tests/game-systems.test.mjs`

## Scope delivered

- Added renderer-parity targeting presentation:
  - WebGL uses one persistent ring reticle and one persistent line whose geometry
    is updated in place.
  - Canvas draws the equivalent ring reticle and short terminal aim line.
- Routed enemy and Core combat events through
  `classifyCombatFeedback({ kind, damage, critical, target })`.
- Added readable standard-hit, critical, kill, Core-warning, and capped combo
  labels with distinct emphasis colors.
- Reused the existing effect/damage-number/burst boundaries and hard-capped each
  renderer's active effect collection at 96 entries.
- Replaced the melee full-ring cue with a directional slash arc in both
  renderers.
- Preserved WebGL hit flash/knockback and added equivalent Canvas flinch and
  knockback presentation.
- Added reduced-motion branches that keep reticles, labels, bursts, and sound
  while removing reticle pulse and reducing slash lifetime, burst count,
  knockback, and camera shake.
- Did not alter damage resolution, health, rewards, wave logic, or existing
  object pools.

## TDD evidence

### Baseline

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
tests 159
pass 159
fail 0
duration_ms 94.958334
```

### Red

The combat-feedback source contract and shared-payload cases were added before
production changes.

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
not ok 7 - both renderers keep targeting and combat feedback readable and bounded
AssertionError: The input did not match the regular expression /classifyCombatFeedback/.
tests 160
pass 159
fail 1
duration_ms 101.870208
```

The failure was expected: `FreemanProtocol.tsx` had not yet imported or consumed
the shared classifier.

### Green / final verification

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
ok 7 - both renderers keep targeting and combat feedback readable and bounded
tests 160
pass 160
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 95.825333
```

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit
```

Output:

```text
exit 0
(no stdout/stderr)
```

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/eslint app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
exit 0
(no stdout/stderr)
```

Command:

```text
git diff --check
```

Output:

```text
exit 0
(no stdout/stderr)
```

Post-commit state:

```text
## main...origin/main [ahead 10]
```

## Concerns

- Critical presentation is deterministic and presentation-only: a hit is
  critical when the target is marked or applied damage is at least the greater
  of 18 and 24% of target maximum health. This does not change applied damage.
- Verification is automated (source contracts, systems tests, type-check, and
  scoped lint). No interactive visual-browser pass was part of this task.
- The shell did not expose Node on its default `PATH`; all verification used the
  bundled Codex Node runtime shown in the exact commands above.

## Important-review follow-up: presentation isolation and allocation reuse

### Status

Complete and committed.

- Follow-up commit: `c2b7853626642efc473140d2fc899035c5da152c`
- Commit message: `fix: pool combat feedback without simulation recoil`

### Review findings and fixes

- Canvas recoil had been applied directly to authoritative `enemy.x/z`, changing
  collision, targeting, loot-drop, and pathing state. Recoil is now stored in
  `hitRecoilX/hitRecoilZ`, decays with the existing hit flash, and is applied
  only to `displayX/displayZ` inside `drawEnemy`.
- WebGL damage labels created a canvas, texture, sprite, and material for every
  label. A bounded 32-entry `BoundedPool<THREE.Sprite>` now retains those
  canvases/textures/materials, redraws the retained canvas, and releases sprites
  on expiry, cap eviction, reset, and disposal.
- Canvas bursts created a new effect record, particle array, and particle
  objects on every burst. A bounded 48-entry `BoundedPool<FlatEffect>` now
  reacquires burst records and their particle arrays/objects, with releases on
  expiry, cap eviction, reset, and disposal.
- The existing 96-active-effect cap remains in both renderers, so active and
  retained feedback allocations are both bounded.

### TDD red evidence

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
not ok 8 - combat flinch stays presentation-only and feedback allocations are pooled
AssertionError: The input was expected to not match /enemy\.x\s*\+=/.
tests 161
pass 160
fail 1
duration_ms 70.609625
```

### Final verification

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
ok 8 - combat flinch stays presentation-only and feedback allocations are pooled
tests 161
pass 161
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 63.151417
```

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit
```

Output:

```text
exit 0
(no stdout/stderr)
```

Command:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/eslint app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
```

Output:

```text
exit 0
(no stdout/stderr)
```

Command:

```text
git diff --check
```

Output:

```text
exit 0
(no stdout/stderr)
```

### Remaining concern

- Verification remains automated; no interactive visual-browser pass was
  requested for this follow-up.
