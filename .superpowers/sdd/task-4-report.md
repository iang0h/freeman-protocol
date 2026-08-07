# Task 4 report — bounded war layer

## Implemented

- Added `app/game/war-layer-rules.mjs`: pure capped squad spawning, deterministic movement/combat/repair ticks, damage removal, and one-active support events with a six-second cooldown.
- Added TDD coverage for parent/global caps, combat/movement/expiry, immutable squad damage, and support event cooldown.
- Integrated squad spawning, ticks, pooled WebGL markers, Canvas drawing, command-map markers, support priority, and concise feedback into both renderers.
- Added low-poly strategic-node marker creation/reset helpers and Canvas equivalents.

## Verification commands and output

1. `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test --test-name-pattern='war squad|support' tests/game-systems.test.mjs`

   Output:

   Output: 6 tests passed, 0 failed.

2. `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node node_modules/typescript/bin/tsc --noEmit`

   Output: exit 0.

3. `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`

   Output: 212 tests passed, 0 failed.

4. `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/*.test.mjs`

   Output: 311 tests passed, 0 failed.

5. `git diff --check`

   Output: exit 0; no whitespace errors.

6. `rg -n "war squads honor|war squads move|assembly support|war-layer-rules|maybeSpawnWarSquad|updateWarLayer|REPAIR BAY: NODE RESTORED|AIR STRIKE INBOUND" tests app`

   Output: confirmed pure tests plus WebGL and Canvas integration references, support feedback, and both update paths.

7. Static code review

   Output: the review found and this task addressed per-frame deployment/toast flooding with a per-parent bounded cooldown plus a shared toast cooldown, and changed air-strike targeting to a deterministic Assembly-Pad-distance sort. Repair Bay damage now also updates the shared battlefield node state.

## Concerns

- The current gameplay exposes direct hostile damage only for the Core, sentries, Repair Bay, and agents. Assembly Pad and Compute Relay now render from the shared battlefield state and drive war-layer eligibility, but need a future node-targeting combat pass before they can become hostile-damage targets.
- `tsconfig.tsbuildinfo` was already modified when this task began and is intentionally excluded from this task’s commit.
