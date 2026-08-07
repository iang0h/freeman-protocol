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

- Superseded by the review-finding fix below: all non-Core strategic nodes now participate in hostile targeting, projectile collisions, damage, and war-squad repair synchronization.
- `tsconfig.tsbuildinfo` was already modified when this task began and is intentionally excluded from this task’s commit.

## Review-finding fix — war-layer integration

### Fixed

- `spawnWarSquad` now requires one Component, rejects unaffordable requests with `reason: "components"`, and returns the deducted material state. Both renderer paths pass live loot Components into the request and keep the returned balance.
- Every non-Core battlefield node is now eligible for hostile proximity targeting and hostile-projectile collision in WebGL and Canvas. Node damage uses the shared battlefield rule; the Core remains on its existing protect-only loss path.
- War-layer repair results now synchronize every returned non-Core node snapshot into live battlefield state, rather than copying back only the Repair Bay.
- Added an active convoy/air-strike marker at the Assembly Pad in the command map, and increased the shared WebGL temporary-marker pool to the valid maximum of temporary sub-agents plus war squads (16 + 24).
- Added focused pure and source-contract regression tests for squad Component spending, material handoff in both renderers, and full non-Core node targeting/damage/repair routing.

### Verification

1. `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node node_modules/typescript/bin/tsc --noEmit`

   Output: exit 0.

2. `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`

   Output: 214 tests passed, 0 failed.

3. `git diff --check`

   Output: exit 0; no whitespace errors.

### Remaining concern

- `tsconfig.tsbuildinfo` remains an unrelated pre-existing modification and is intentionally excluded from the commit.
