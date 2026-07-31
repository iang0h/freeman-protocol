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
