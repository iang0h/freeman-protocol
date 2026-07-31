# Task 5 report: simplify mobile combat HUD

## Status

Implemented and verified. The live mobile HUD now shows HP, Core, Wave, current zone, and one threat alert; Compute and EMP no longer appear in the live strip. Secondary Intel and warband details are marked for mobile-only hiding, while the existing `MobilePanel = "command" | "defend" | "skills"` behavior, collapsed roster, direct touch movement, combat handlers, and no-joystick presentation remain intact.

The mobile composition is rendered by `app/FreemanProtocol.tsx` in this codebase rather than the thin `app/page.tsx` wrapper named in the plan, so the JSX change was made there.

## TDD evidence

1. Added source-layout tests for the five-field live status, removal of Compute/EMP, 12px labels, 16px status values, hidden secondary telemetry, full-width active trays, and portrait/landscape notice clearance.
2. `node --test tests/mobile-layout.test.mjs` could not start because `node` is not on the default shell `PATH` (`zsh: command not found: node`).
3. Using the bundled runtime, the first red run produced `20 pass, 4 fail`. The expected new failures were missing Wave/Zone/Alert, missing typography/telemetry rules, and no full-width active-tray rule. A pre-existing class-order source contract also failed after the upstream Task 4 markup change; preserving the same class set in the expected order fixed it without changing behavior.
4. Added a further red test after static portrait/landscape inspection: `23 pass, 2 fail`, confirming that the first implementation incorrectly limited readable typography, secondary-field hiding, and notice clearance to 760px while this application’s mobile breakpoint is 820px.
5. Extended the final rules through `max-width: 820px` and re-ran the focused suite successfully.

## Verification

Commands were run with:

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

- `node --test tests/mobile-layout.test.mjs` — `25 pass, 0 fail`.
- `node_modules/.bin/vinext build` — exit 0; output ended with `Build complete. Run \`vinext start\` to start the production server.`
- `git diff --check` — exit 0.

The production build emitted only its existing chunk-size advisory for chunks over 500 kB; it did not fail the build.

## Review and layout inspection

A focused review found that the initial 760px-only rules missed the project’s 761–820px mobile range. The final CSS now uses a three-column/two-row portrait status strip with notices shifted below it, and a five-column single-row landscape strip with notices moved back up. The focused tests assert both breakpoint layouts and their alert positioning.

## Concerns

- The visual layout review was performed through the authored responsive DOM/CSS contracts and breakpoint calculations; no interactive browser viewport was available in this worker environment.
- The larger status strip intentionally consumes more vertical space in portrait to keep 12px labels and 16px values readable. Portrait notices move below it; landscape restores one status row to preserve arena space.

## Commit

`feat: simplify mobile combat HUD`

## Follow-up review fix: mobile Intel availability

- Replaced the broad mobile `.vitals-panel { display: none; }` rule with an inactive-overlay selector. Mobile Intel is hidden only while inactive and becomes a scrollable, pointer-enabled overlay when `.intel-overlay.is-active` is set.
- Kept the compact live status and its hidden secondary telemetry intact; opening Intel still exposes the primary panel rather than leaving the user without a management surface.
- Added a mobile source-layout contract for the active Intel selector and updated the rendered HTML source contract to expect `progression-telemetry secondary-telemetry`.

### Follow-up verification

- Bundled Node `node --test tests/mobile-layout.test.mjs`: `27 pass, 0 fail`.
- Bundled Node `node --test tests/rendered-html.test.mjs`: `5 pass, 0 fail`.
- Bundled Node `node --test tests/*.test.mjs`: `202 pass, 0 fail`.
- `git diff --check`: passed after restoring generated TypeScript state.
