# Final Whole-Branch Review Fix Report

Date: 2026-08-07
Implementer: `/root/fix_final_review_findings`
Base commit: `38f9abb`

## Scope

Resolved every actionable issue in the final whole-branch review for the Living Battlefield and audio-settings work. No deploy or push was performed.

## Findings resolved

1. **Battlefield effects now affect gameplay in both renderers.**
   - Compute Relay produces compute only while online.
   - Repair Bay raises repair throughput only while online.
   - Command Uplink extends autonomous decision, acquisition, and attack ranges only while online.
   - Both the WebGL and Canvas update loops derive and consume the same live battlefield-effect snapshot.

2. **Repair squads use the canonical, priced node-repair path.**
   - War-layer repair actions call `repairBattlefieldNode` rather than mutating copied node records.
   - Repair costs are deducted from live components and the updated battlefield/material state is synchronized back into both engines.
   - Offline or destroyed non-core nodes remain valid repair targets, preventing a repair deadlock.

3. **Temporary autonomy units and war squads share one global cap.**
   - Both spawn APIs account for the other population through explicit external counts.
   - Both renderer call sites pass cross-population counts.
   - The shared WebGL marker pool is bounded to the combined cap plus one dedicated support marker.

4. **War squads can be damaged and removed by real combat paths.**
   - Enemy target selection and hostile projectile collision include war squads.
   - Damage is immutable, applies a timed hit flash, and removes squads at zero health.
   - Both renderers expose damage feedback and health cues; WebGL markers are released back to the pool on removal.

5. **Support events are time-based sequences rather than instant labels.**
   - Convoy and air-strike events move through telegraph, acting, and egress phases over four seconds.
   - The configured action is emitted exactly once when the event crosses its action time.
   - Only one support event may be active and the existing six-second cooldown remains enforced.
   - Both renderers consume support actions and draw/move the active effect.

6. **Engagement attacks honor their assigned strategic target.**
   - A shared resolver maps engagement records to the assigned live node position.
   - Both renderers damage and aim projectiles at that node while retaining nearby-player priority and separate boss behavior.

7. **The stuck-enemy watchdog is per engagement record.**
   - Stationary and reposition state lives on each enemy record.
   - `markEngagementAttack` resets only the attacking enemy.
   - Regression coverage proves one enemy's attack does not reset another enemy's watchdog.

8. **Coverage was expanded across rules and both renderer integrations.**
   - Tests cover combined caps, squad damage/removal/feedback, priced repair, online/offline effects, support phase/action timing, assigned engagement targets, and per-record watchdog isolation.
   - Source contracts cover the WebGL and Canvas wiring for every shared mechanic.

9. **Audio settings are available synchronously at initial React render.**
   - `getStoredAudioSettings` reads and sanitizes the persisted snapshot.
   - `AudioManager` and React initialize from that same snapshot, avoiding a default-state flash before engine setup.

10. **Additional self-review fix: WebGL support markers remain attached during animation.**
    - The pooled marker is reset before it is added to the scene.
    - Per-frame updates now update the health/phase cue without invoking the reset helper that detaches pooled objects.

## TDD evidence

Initial focused RED run:

```text
node --test tests/game-systems.test.mjs tests/audio-manager.test.mjs tests/game-source-contracts.test.mjs
96 tests: 91 passed, 5 failed
```

The failures demonstrated the missing shared cap export, missing synchronous audio-settings API, and missing renderer/effect integrations. A subsequent run exposed two stale source-contract assumptions plus the offline-node repair-target bug; those were corrected without weakening the intended behavior assertions.

The self-review support-marker regression was also driven red first:

```text
node --test --test-name-pattern="price node repairs" tests/game-source-contracts.test.mjs
1 test: 0 passed, 1 failed
```

It passed after moving pooled-marker reset to acquisition and using an in-place update during active animation.

## Verification

Before the final self-review adjustment, the following completed successfully:

- Focused game/audio/source-contract suite: 226 passed, 0 failed.
- Full Node suite: 324 passed, 0 failed.
- TypeScript: `tsc --noEmit --incremental false` passed.
- Scoped ESLint on all touched source and test files passed.
- Production `vinext build` passed all five stages.
- `git diff --check` passed.

A fresh complete verification run after the support-marker regression fix is recorded below before commit.

### Fresh final verification

- `node --test tests/*.test.mjs`: **324 passed, 0 failed**.
- `tsc --noEmit --incremental false`: **passed**.
- Scoped ESLint across all nine touched source/test files: **passed** (Babel emitted only its informational large-file note for `FreemanProtocol.tsx`).
- `vinext build`: **passed all five build stages** using the standalone Codex runtime.
- `git diff --check`: **passed**.

The first fresh build invocation accidentally used the ChatGPT app-bundled Node binary and macOS rejected Rolldown's native binding because their code-signing Team IDs differ. Rerunning the identical build with the standalone Codex Node runtime succeeded; no dependency or source change was needed.

## Notes

- `tsconfig.tsbuildinfo` was already modified when this task began. It is intentionally excluded from the commit.
- The production build's existing large-chunk advisory and route-classification warning are non-blocking and unrelated to these fixes.
- No deploy, push, or browser smoke test was performed in this task.
