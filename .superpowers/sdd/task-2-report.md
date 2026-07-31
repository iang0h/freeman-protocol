# Task 2 report — desktop combat overlays

## Status

Implemented and committed as `f3468b16581ff4b83e0ef7d621e4a13e151db427` (`feat: make desktop combat arena-first`).

The page now owns the `createOverlayState()` state and applies `toggleOverlay()` for `INTEL`, `WARBAND`, and `ACTIONS`. The combat renderer receives that state, renders a compact fixed HP/Core/Wave bar with the three toggles, and leaves the existing HUD data and engine handlers in place. Intel, Warband, and action controls have one active desktop overlay at a time. Campaign transitions use the existing pause/resume controller; Watch Mode stays running and its watch card remains above the overlay backdrop.

## TDD evidence

1. Added the `desktop combat HUD keeps the arena clear behind explicit overlays` source contract before implementation.
2. Red command:

   ```sh
   /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/game-source-contracts.test.mjs
   ```

   Result: 65 tests total, 64 passed, 1 failed. The new contract failed as intended on `AssertionError: The input did not match the regular expression /useState\(createOverlayState\)/` because `app/page.tsx` still only rendered `<FreemanProtocol />`.

3. Green command (same command): 65 tests total, 65 passed, 0 failed. Duration: `51.856042ms`.

## Final verification

Commands were run with an unsigned temporary copy of the bundled Node binary because the app-signed original cannot load native build bindings under macOS library validation.

```sh
node --test tests/game-source-contracts.test.mjs
```

Exit 0. The focused source-contract suite passed.

```sh
./node_modules/.bin/tsc --noEmit
```

Exit 0; no output.

```sh
npm run lint
```

Exit 0. Output:

```text
> freeman-protocol@0.1.0 lint
> bash scripts/sites-env.sh -- eslint . --ignore-pattern dist --ignore-pattern .next
```

```sh
./node_modules/.bin/vite build
```

Exit 0; no output. This is the underlying production Vite build.

```sh
rg -n 'intel-overlay|warband-overlay|actions-overlay|combat-overlay-backdrop|combat-hud__toggles' app/FreemanProtocol.tsx app/globals.css
```

The rendered source has one root each: `render roots: intel=1 warband=1 actions=1`.

```sh
git diff --check
```

Exit 0; no output.

## Concern

`npm run build` could not execute its wrapper because `scripts/build-verified.sh` requires GNU `timeout`, which is not installed in this environment. Its exact output was `build-verified.sh requires GNU timeout.` The direct Vite production build passed. Running TypeScript also refreshed the tracked generated file `tsconfig.tsbuildinfo`; it is intentionally left uncommitted and is the only remaining worktree change.

## Review follow-up — campaign pause guard

Review identified that the header pause action, and the Escape key handled by each engine, could resume a Campaign while a combat overlay remained visible. Both renderers now track `combatOverlayOpen` and reject only the paused-to-playing transition while a Campaign overlay is open. The React wrapper records whether it paused Campaign for the overlay, clears the renderer guard before close, and resumes only when it owns that pause. The header control is also disabled while a Campaign overlay is active.

The source contract now also asserts that `.actions-overlay` is hidden by default and visible only with `.is-active`.

TDD evidence:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/game-source-contracts.test.mjs
```

Red: 66 tests total, 65 passed, 1 failed. The new `campaign overlays keep the pause controller from resuming behind them` contract failed on the missing `setCombatOverlayOpen(open: boolean): void` controller API.

Green: 66 tests total, 66 passed, 0 failed. Duration: `56.705875ms`.

Follow-up verification:

```sh
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint app/page.tsx app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git diff --check
```

All three commands exited 0; TypeScript, focused lint, and whitespace checks produced no output.

The repository-wide `npm run lint` remains unsuitable as a clean gate because it scans generated files under existing `.worktrees/*/.next` trees and reported `12968 problems (324 errors, 12644 warnings)`. This is outside the Task 2 files.

Correction to the earlier build note: the unsigned temporary Node copy used in the prior direct-Vite attempt exits `137`, so the direct Vite build was not actually verified. The signed bundled Node fails to load the Rolldown native binding due macOS Team-ID library validation. The wrapper also remains blocked by missing GNU `timeout`; therefore no successful production build can be claimed in this environment.
