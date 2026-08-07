# Task 5 report — renderer parity and watch-mode readability

## Implemented

- Added a shared `StrategicHud` projection in `app/FreemanProtocol.tsx`. Both WebGL and Canvas now publish the same compact node (`id`, label, status, health), squad (`id`, role, status, lifetime), and support-event (`id`, type, status, remaining time) fields through `HudState`.
- Kept the presentation deliberately macro-first: strategic node and squad details are only added as concise, focusable Command Map markers; the default mobile command tray remains collapsed and no persistent dashboard was added.
- Made focus resolution generic for every strategic node and active war squad in both renderer implementations; the already-existing support-event focus remains at the Assembly Pad.
- Removed war squads from the generic temporary-sub-agent marker input so each squad has exactly one readable Command Map marker with its real role/status, rather than a duplicate generic marker.
- Added a source-contract parity test covering renderer initialization, engagement/war updates, compact HUD projection, strategic focus targets, and pooled/effect cleanup.

## TDD and verification

1. `node --test tests/game-source-contracts.test.mjs --test-name-pattern="parity|battlefield|engagement|war"`

   Output: the shell could not resolve `node` on PATH in this workspace.

2. `PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node --test tests/game-source-contracts.test.mjs --test-name-pattern="parity|battlefield|engagement|war"`

   RED output: 88 passed, 1 failed. The new parity contract failed exactly because `StrategicHud` did not exist.

3. Re-ran the same runtime-prefixed focused command after implementation.

   GREEN output: 89 passed, 0 failed.

4. `PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node --test tests/*.test.mjs`

   Output: 314 passed, 0 failed.

5. `PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/tsc --noEmit`

   Output: exit 0.

6. `git diff --check`

   Output: exit 0; no whitespace errors.

## Self-review

- Confirmed both emit paths call the same strategic projection helper and publish it in their HUD callbacks.
- Confirmed command-map squad markers use the authoritative war-layer role, status, and remaining lifetime, and removed the duplicate generic marker source.
- Confirmed strategic focus takes the current battlefield/war-layer positions in both renderer implementations before falling back to static landmarks.
- Confirmed no pure rule, enemy-pressure, repair-cost, loss-condition, audio, or mobile-panel logic changed.

## Concerns

- `tsconfig.tsbuildinfo` was already modified before this task and was refreshed by TypeScript verification; it is intentionally excluded from the Task 5 commit.
- The task brief names `app/styles.css`, but this repository uses `app/globals.css`; no stylesheet change was needed because the existing Command Map marker layout already keeps the added labels compact.

## Review fix — Assembly Pad command-map marker deduplication

- Root cause: both renderer HUD builders started with `getCommandMapMarkers`, which already supplies the fixed `assembly-pad` marker, then appended a strategic-node marker with the same ID. This produced duplicate React keys and overlapping map controls.
- Both builders now enrich the fixed Assembly Pad marker with strategic node health/status and, when present, the active support-event type and remaining time. They skip the Assembly Pad in the appended-node loop and no longer add a separate overlapping `support-event` marker.
- Added a focused source-contract regression test proving both builders map the fixed Assembly Pad marker, skip re-appending it, and emit no separate support-event marker.

### Verification

1. RED: `PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node --test tests/game-source-contracts.test.mjs --test-name-pattern="single Assembly Pad marker"` — failed before implementation because the builders did not map the fixed marker or skip re-appending Assembly Pad.
2. GREEN: same focused command — 90 passed, 0 failed.
3. `PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node --test tests/*.test.mjs` — 315 passed, 0 failed.
4. `PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/tsc --noEmit` — exit 0.
5. `git diff --check` — exit 0.
