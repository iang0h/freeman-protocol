# Second Final Review Fix Report

Date: 2026-08-07

Reviewed range: `33c65e4..8798029`

Scope: Living Battlefield and Audio implementation

## Outcome

All six findings from the second whole-branch review are resolved. The implementation now routes the two renderer paths through shared, executable rules for reserve deployment, enemy targeting, and war-layer ticking; rejects support events without live targets; initializes audio with an SSR-safe placeholder before client hydration; and gives each strategic node a distinct, stateful battlefield presentation.

## Findings resolved

1. **Manual reserve deployments bypassed external war-squad counts**
   - Added `deployTemporaryReserve` as a shared orchestration rule.
   - Both renderer adapters pass the current parent squad count and total temporary war-squad count into the existing spawn-cap rule.
   - Added behavioral coverage for parent-cap and global-cap rejection plus source-contract coverage for both adapters.

2. **Assigned engagement nodes lost to generic strategic-node selection**
   - Added `selectEnemyTarget` as the shared late-wave target ladder.
   - Player, war squad, agent, and turret targets retain priority; an assigned live engagement node is then selected ahead of generic strategic nodes.
   - Offline or destroyed assigned nodes deliberately fall through to the repair/generic fallback ladder.
   - Boss handling and Core-loss behavior remain on their existing dedicated paths.

3. **Critical integration was protected only by regex/source checks**
   - Added executable orchestration tests for reserve caps, enemy-target selection, inventory synchronization, priced repair, and exact-once support action delivery.
   - Added `orchestrateWarLayerTick` and routed both renderers through it so tests exercise the production decision rules rather than restating their source text.
   - Source-contract checks remain as adapter guardrails, not as the sole behavioral evidence.

4. **Audio settings read browser storage during the initial React render**
   - Added a stable, storage-free `getServerAudioSettings` placeholder.
   - Initial React state now uses the server-safe placeholder; the client engine effect hydrates persisted settings and marks the control hydrated.
   - Added `getAudioControlLabel` so the pre-hydration label is deterministic while blocked/muted/playing states still render correctly after hydration.
   - Added executable tests proving the server placeholder is independent of persisted storage and that client hydration restores the persisted state.

5. **Strategic-node visuals collapsed into similar markers**
   - Added an explicit presentation map for all five node kinds:
     - Core: white diamond
     - Command Uplink: amber mast
     - Repair Bay: cyan cross
     - Assembly Bay: orange hex pad
     - Compute Relay: violet crystal
   - WebGL and Canvas paths now use distinct silhouettes and colors.
   - Damaged nodes expose health cues and offline nodes expose red failure cues.
   - Added behavior and adapter tests for presentation identity, health cues, and the concrete Core/Repair silhouettes.

6. **Support requests accepted empty target lists**
   - `requestSupportEvent` now rejects requests with no valid target IDs before spending Components or creating an event.
   - Both renderer callers now skip requests when no live primary target exists instead of substituting Core.
   - Added executable no-target coverage verifying rejection, unchanged inventory, and no queued support event.

## Test-driven development evidence

The initial focused RED run contained 12 intended failures covering the missing server-audio behavior, reserve caps, war-layer orchestration, no-target support rejection, assigned-node priority, node presentations, and both renderer adapter paths. After implementation, the focused suites passed. A later self-review added a concrete Repair Bay cross-silhouette contract, observed it fail, and then implemented the missing WebGL and Canvas cross geometry before rerunning it green.

## Final verification

- `node --test tests/*.test.mjs`: **335 passed, 0 failed**
- `tsc --noEmit --incremental false`: **passed**
- Scoped ESLint across all changed source and test files: **passed**
- `vinext build`: **passed**
- Build advisory: the client bundle retains the existing warning for a chunk larger than 500 kB; it does not fail the build.
- `git diff --check`: run after this report is added and recorded in the commit handoff.

## Scope notes

- No deployment or push was performed.
- The pre-existing `tsconfig.tsbuildinfo` working-tree modification is intentionally excluded from the fix commit.
