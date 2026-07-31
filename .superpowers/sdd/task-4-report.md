# Task 4 report: meaningful arena zones

## Commit

`bcab10d feat: mark meaningful arena zones`

## Delivered

- Added presentation-only Core, north/south breach, Compute Node, Repair Bay, and Boss Portal floor markers to both WebGL and Canvas renderers. The Core remains strongest; breach lanes use distinct warm/cool tints; the Boss Portal is a restrained dashed edge marker for telegraphs.
- Added static world labels sourced from `getArenaZone()` metadata.
- Added `currentZone` to both renderer HUD payloads. It is resolved only during the existing 0.1-second HUD emission cadence, not every render frame, and displayed as a compact HUD label.
- Updated the final-wave urgent alert to identify the Boss Portal.
- Added deterministic six-zone system assertions and renderer/source contracts.
- No simulation, damage, spawn, loot, or routing rules were modified.

## Test evidence

Red (before production changes):

```text
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
tests 162; pass 161; fail 1
Failure: both renderers mark the shared arena zones and throttle the live zone HUD
Missing import contract for getArenaZone.
```

Green (after implementation):

```text
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
tests 162; pass 162; fail 0
```

TypeScript:

```text
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node node_modules/typescript/bin/tsc --noEmit
exit 0
```

Lint of the changed TypeScript/tests had no errors. ESLint reported one existing configuration warning that `app/globals.css` is ignored because no matching configuration is supplied.

Full suite:

```text
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/*.test.mjs
tests 196; pass 195; fail 1
```

The sole failure is the pre-existing `tests/mobile-layout.test.mjs` source contract `keeps the recruitment dock interactive above workshop overlays`. It expects an `agent-dock` class prefix that does not match the unchanged class string in `HEAD`; this task does not alter that area.

## Concerns / limitations

- Desktop macro-camera visual inspection could not be performed locally: `scripts/build-verified.sh` requires GNU `timeout`, which is unavailable; direct `vinext build` is blocked by macOS rejecting the installed Rolldown native binding's code signature (`ERR_DLOPEN_FAILED`).
- The same native binding prevents starting the local renderer for browser inspection. The renderer contract tests and TypeScript check passed, but a visual wave-one check remains for an environment with a valid build runtime.
