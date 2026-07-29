# Task 2 report: hybrid player and agent progression

## Status

DONE

## Implementation

- Added immutable player armor and agent component definitions plus atomic, capped component purchase rules.
- Made wave drafts produce one player, one agent, and one defense choice.
- Added mission armor/rank state, reset and HUD serialization to both WebGL and Canvas engines.
- Applied armor and agent component bonuses to health, weapon output, attack cadence, EMP output, and healing in both renderers.
- Added a post-wave component workshop with armor profiles, agent ranks, explicit costs, bonuses, and disabled reasons.
- Preserved the existing Compute-funded evolution choices after component purchases.

## Verification

- RED: focused tests reported 58 passed / 1 failed before the workshop UI integration.
- GREEN: `node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs` — 60 passed / 0 failed.
- `git diff --check` — passed with no output.
- Lint/typecheck could not run in this worktree because dependencies are not installed (`node_modules` is absent).

## Concerns

- Run repository lint and typecheck after installing dependencies.

## Review fixes (2026-07-29)

### Implementation

- Kept draft slots selectable after all upgrades in a category cap by falling
  back to the uncapped Field Repair upgrade while preserving player, agent, and
  defense category labels.
- Made repeated fallback cards use category-qualified React keys.
- Restored mobile draft category labels and component/armor bonus copy with
  compact type and 136px workshop cards.
- Aligned the desktop evolution workshop to `flex-start` so overflowing content
  begins at the top.
- Added regression coverage for capped-category drafts, mobile progression
  visibility, and desktop workshop alignment.

### Verification

The host shell did not include Node on `PATH`, so the checks used a checksum-
verified temporary Node v22.23.1 runtime. Repository dependencies were available
at `../../node_modules`, superseding the earlier concern above.

RED (production changes temporarily reversed):

```text
PATH="/tmp/freeman-node.0atkIO/node-v22.23.1-darwin-arm64/bin:$PWD/../../node_modules/.bin:$PATH" node --test tests/game-systems.test.mjs tests/mobile-layout.test.mjs
...
# tests 42
# pass 39
# fail 3
EXPECTED_RED_EXIT=1
```

Focused GREEN:

```text
PATH="/tmp/freeman-node.0atkIO/node-v22.23.1-darwin-arm64/bin:$PWD/../../node_modules/.bin:$PATH" node --test tests/game-systems.test.mjs tests/mobile-layout.test.mjs
...
# tests 42
# pass 42
# fail 0
EXIT_CODE=0
```

Full Node tests:

```text
PATH="/tmp/freeman-node.0atkIO/node-v22.23.1-darwin-arm64/bin:$PWD/../../node_modules/.bin:$PATH" node --test tests/*.test.mjs
...
# tests 74
# pass 74
# fail 0
EXIT_CODE=0
```

ESLint:

```text
PATH="/tmp/freeman-node.0atkIO/node-v22.23.1-darwin-arm64/bin:$PWD/../../node_modules/.bin:$PATH" bash scripts/sites-env.sh -- eslint . --ignore-pattern dist --ignore-pattern .next
EXIT_CODE=0
```

TypeScript:

```text
PATH="/tmp/freeman-node.0atkIO/node-v22.23.1-darwin-arm64/bin:$PWD/../../node_modules/.bin:$PATH" tsc --noEmit
EXIT_CODE=0
```

Diff check:

```text
git diff --check
EXIT_CODE=0
```
