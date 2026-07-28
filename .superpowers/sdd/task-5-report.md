# Task 5 — First-Time Persistence and Tutorial Interface

## Scope

Implemented the Task 5 React presentation, browser persistence, tutorial controls, and responsive styling in the prescribed files. The WebGL and Canvas renderer behavior was not changed.

## RED evidence

After appending the required UI/source contracts, ran:

```sh
node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
```

Result: 15 passing, 2 failing, exit 1.

- `persists completion and offers a first-wave retry` failed because `freeman-tutorial-complete` was absent.
- `keeps the guided tutorial clear of mobile combat controls` failed because `tutorial-card` was absent.

## GREEN evidence

After implementation, the focused command passed: 17 passing, 0 failing, exit 0.

```sh
node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
```

The full source test suite also passed: 29 passing, 0 failing, exit 0.

```sh
node --test tests/*.test.mjs
```

The direct production build passed with exit 0:

```sh
./node_modules/.bin/vinext build
```

Lint passed with 0 errors. It retains two pre-existing `@next/next/no-img-element` warnings in `app/asset-catalog/AssetCatalog.tsx`.

```sh
bash scripts/sites-env.sh -- ./node_modules/.bin/eslint . --ignore-pattern dist --ignore-pattern .next
```

## Review checklist

- Mobile portrait tutorial card clears the touch controls with `bottom: calc(env(safe-area-inset-bottom) + 112px)`.
- Landscape uses a smaller but still clear 90px offset above its 72px virtual stick and 45px combat controls.
- Local storage reads and writes are guarded by `try/catch` and occur only after mount or tutorial resolution.
- Returning players receive `PLAY TUTORIAL`; the primary start action routes according to persisted completion.
- The existing controller's guarded `skipTutorial()` remains idempotent; the skip action is shown only for active steps.
- `RETRY WAVE` is shown only for a defeat with `hud.canRetryWave` and calls the controller retry method; `RESTART MISSION` remains available as the secondary action.

## Review fix — mobile squad/tutorial stacking

The review found that the tutorial card and the opened mobile AI squad used
nearly identical bottom offsets (`+112px` and `+106px`), causing the card to
intercept the KAIROS and GUARD CORE controls during the recruit and command
tutorial steps. The tutorial card now receives `tutorial-card--above-squad`
whenever the mobile squad is open. Its mobile clearance is `+278px` in
portrait and `+230px` in landscape, above the expanded squad while remaining
clear of the bottom joystick and combat actions.

### Fix RED/GREEN evidence

Added `reflows the tutorial above an expanded mobile AI squad` to
`tests/mobile-layout.test.mjs` before the layout change. It failed because the
dedicated state and CSS rules were absent (5 passing, 1 failing). After the
change, the focused contracts passed with the bundled Node runtime:

```sh
node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
```

Result: 18 passing, 0 failing, exit 0.

Type checking also passed:

```sh
./node_modules/.bin/tsc --noEmit
```

## Review fix — closed mobile squad toggle remains reachable

The prior stacking condition applied `tutorial-card--above-squad` only while
`mobileSquadOpen` was true. Closing the panel during the recruit or command
steps then returned the tutorial card to its normal offset, where it covered
the collapsed AI TEAM MANAGE toggle. The tutorial card now retains the elevated
class whenever its target is `agents`, as well as while the panel is open. The
existing portrait (`+278px`) and landscape (`+230px`) elevated clearances are
unchanged.

### Fix RED/GREEN evidence

Extended `reflows the tutorial above an expanded mobile AI squad` before the
production change to require the agents-target condition. With bundled Node
v24.14.0 it failed as expected: 5 passing, 1 failing, exit 1, because the
source condition only referenced `mobileSquadOpen`.

After the change, focused contracts passed with bundled Node:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
```

Result: 18 passing, 0 failing, exit 0.

Type checking passed with the bundled Node runtime prepended to `PATH`:

```sh
PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH ./node_modules/.bin/tsc --noEmit
```

The full source suite also passed:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test tests/*.test.mjs
```

Result: 30 passing, 0 failing, exit 0.
