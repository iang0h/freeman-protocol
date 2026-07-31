# Recruitment Advisor Task 2 Report

## Delivered

- Added immutable `recruitmentAdvice` to both WebGL and Canvas HUD snapshots.
- Built advisor input from live operator/Core health, the next authoritative
  Warband slot, current resources, and enemies within 4.5 arena units of the
  Core.
- Added the compact desktop/mobile advisor card with decision, reason, current
  resources, cost, missing resources, and Watch Mode AI-priority rationale.
- `RECRUIT NOW` opens Warband through the existing overlay controller, expands
  the mobile command tray, and marks the recommended agent with
  `aria-current`/`is-advised`.
- Repair, defend, and save states render guidance only; the page has no engine
  mutation access.

## Test evidence

### Red phase

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

Expected failures:

```text
tests 101
pass 98
fail 3
cancelled 0
skipped 0
todo 0
duration_ms 117.21575
```

The failures were the new HUD exposure, advisor presentation/action, and
mobile layout contracts.

### Green phase

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

Exact final output summary:

```text
tests 101
pass 101
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 64.014916
```

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit --incremental false
```

Output: no output; exit 0.

```sh
PATH=$PWD/node_modules/.bin:/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH bash scripts/sites-env.sh -- eslint app/FreemanProtocol.tsx app/page.tsx tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

Output: no output; exit 0.

```sh
git diff --check
```

Output: no output; exit 0.

## Concerns

- The repository-wide lint script traverses committed/generated content under
  `.worktrees/`; the attempted full lint reported 12,968 pre-existing
  generated-file problems (324 errors, 12,644 warnings). The four changed
  TypeScript/test files lint clean when checked directly.
- The recruitment system enforces fixed Warband slot order, so the advisor
  evaluates the next slot rather than recommending a later agent that cannot
  yet be recruited.
- The rule's `threatCount >= 4` branch represents immediate breach pressure.
  Passing the whole queued wave would pin the card to `DEFEND CORE`, so both
  renderers pass only enemies within 4.5 units of the Core.

## Review follow-up

- Removed the click-only advisor-agent latch. `advisorAgentId` is now derived
  from the latest HUD advice and becomes `null` whenever advice leaves the
  `recruit` state, so `is-advised` and `aria-current` cannot remain stale after
  recruitment or a priority change.
- Raised mobile CURRENT/COST/MISSING labels to 12px and their values to 16px.
  Resource cells now wrap safely, and camera, Watch panel, and combat notices
  were moved down to preserve separation.

### Follow-up red phase

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

```text
tests 101
pass 98
fail 3
cancelled 0
skipped 0
todo 0
duration_ms 102.460166
```

The failures covered the stale click latch, mobile advisor typography, and the
new notice offset.

### Follow-up green phase

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

```text
tests 101
pass 101
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 87.026417
```

```sh
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc --noEmit
```

Output: no output; exit 0. `tsconfig.tsbuildinfo` was restored afterward.

```sh
PATH=$PWD/node_modules/.bin:/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH bash scripts/sites-env.sh -- eslint app/page.tsx tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
```

Output: no output; exit 0.
