# Living Battlefield Presentation Consistency Fix Report

Date: 2026-08-07
Base commit: `7226b2d`
Scope: final presentation-consistency review findings

## Outcome

All four requested review areas are resolved without a push or deployment.

## Findings resolved

1. **Repair Bay coordinates are canonical.**
   - Added `getBattlefieldNodePosition` as the read-only coordinate lookup over `BATTLEFIELD_NODES`.
   - WebGL and Canvas construct the visible Repair Bay from that canonical lookup.
   - Enemy repair-bay targets continue to use the rendered Repair Bay runtime position, while war-layer repair squads consume the same canonical battlefield node.
   - Executable coverage proves a repair squad at the rendered coordinate repairs the canonical target without coordinate drift; source contracts prove both render adapters consume the same value.

2. **Command-map battlefield markers are canonical and kind-correct.**
   - Replaced the legacy `compute-node` fixed marker with markers derived directly from all five `BATTLEFIELD_NODES` records.
   - Both renderer HUD adapters now decorate those shared markers with live health/support status instead of appending Command Uplink and Compute Relay as generic Compute markers.
   - Added canonical command-map colors for Core, Command Uplink, Repair Bay, Assembly Pad, and Compute Relay.
   - Executable coverage proves exactly one canonical id is emitted for each node and that every id retains its canonical kind and coordinate.

3. **Canvas reset now performs shared dynamic cleanup.**
   - Canvas `resetMissionState()` calls `clearTemporarySubAgents()` before resetting collections, matching the WebGL lifecycle and clearing temporary children, war squads, support state, cooldowns, and autonomy state through one path.

4. **Unnecessary support and target-selection work is removed.**
   - Both support adapters reject active-event, cooldown, insufficient-Component, and empty-enemy states before copying or sorting enemy collections.
   - `requestSupportEvent` rejects an empty target list before filtering/slicing it.
   - WebGL war-squad and battlefield-node comparators now use scalar squared distances, and their selected-target distances use `Math.hypot`, eliminating per-comparison `Vector3` allocations.

## TDD evidence

Baseline:

```text
node --test tests/*.test.mjs
335 passed, 0 failed
```

Focused RED run after adding regressions:

```text
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
7 intended failures
```

The failures covered the missing canonical position API, 3/5 canonical fixed markers, the legacy Compute marker/kind adapter, missing Canvas reset cleanup, support sorting before rejection, and WebGL comparator allocations.

Focused GREEN run:

```text
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
237 passed, 0 failed
```

## Verification

- Full Node suite: `node --test tests/*.test.mjs` — **339 passed, 0 failed**.
- TypeScript: `tsc --noEmit --incremental false` — **passed**.
- Scoped ESLint across all changed TypeScript/JavaScript/test files — **passed**. Babel emitted only its informational large-file note for `FreemanProtocol.tsx`.
- Production build: `vinext build` — **passed all five stages**.
- Build advisories: the existing large-chunk and route-classification notices remain non-blocking.
- `git diff --check` is run after this report is added and before commit.

## Scope notes

- The pre-existing `tsconfig.tsbuildinfo` modification is intentionally excluded from the commit.
- No push, deployment, or unrelated support work was performed.
