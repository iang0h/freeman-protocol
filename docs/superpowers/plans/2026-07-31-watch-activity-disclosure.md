# Watch Activity Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Watch Mode live activity collapsed by default while retaining an accessible four-event expanded log.

**Architecture:** Keep renderer telemetry unchanged and add presentation-only disclosure state in `FreemanProtocol`. Conditionally render either a latest-event summary or the existing ordered log, controlled by an ARIA-wired button and reset whenever Watch Mode exits.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner source contracts, ESLint, vinext, Vercel

## Global Constraints

- `watchActivityExpanded` initializes to `false`.
- The toggle uses `aria-expanded` and `aria-controls`.
- The collapsed branch shows `hud.autonomyLog[0]` with `hud.lastAutonomyEvent` as fallback.
- The expanded branch shows up to four existing log events.
- Leaving Watch Mode resets the disclosure to collapsed.
- The mobile toggle has a minimum 44px touch target.
- Renderer telemetry, Watch Mode controls, and mobile behavior remain unchanged.

---

### Task 1: Accessible Watch Mode activity disclosure

**Files:**
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `hud.sessionMode`, `hud.autonomyLog`, and `hud.lastAutonomyEvent`
- Produces: local `watchActivityExpanded: boolean` UI state and `watch-activity-log` disclosure region

- [ ] **Step 1: Write the failing source/UI contract**

Add a test that asserts:

```js
assert.match(game, /const \[watchActivityExpanded, setWatchActivityExpanded\] = useState\(false\)/);
assert.match(game, /aria-expanded=\{watchActivityExpanded\}/);
assert.match(game, /aria-controls="watch-activity-log"/);
assert.match(game, /watchActivityExpanded \?/);
assert.match(game, /hud\.autonomyLog\[0\] \?\? hud\.lastAutonomyEvent/);
assert.match(game, /hud\.autonomyLog\.slice\(0, 4\)/);
assert.match(game, /if \(hud\.sessionMode !== "watch"\) setWatchActivityExpanded\(false\)/);
assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.watch-panel__activity-toggle[\s\S]*min-height:\s*44px/);
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs
```

Expected: the new Watch activity disclosure contract fails because the local
state and accessible toggle do not exist.

- [ ] **Step 3: Implement the minimal disclosure**

Add:

```tsx
const [watchActivityExpanded, setWatchActivityExpanded] = useState(false);

useEffect(() => {
  if (hud.sessionMode !== "watch") setWatchActivityExpanded(false);
}, [hud.sessionMode]);
```

Render an activity header containing a button whose `aria-expanded` value is the
state and whose `aria-controls` target is `watch-activity-log`. When expanded,
render the existing four-row ordered list; when collapsed, render a one-row
latest-event summary using `hud.autonomyLog[0] ?? hud.lastAutonomyEvent`.

Add focused heading, toggle, and summary styles, including:

```css
@media (max-width: 820px) {
  .watch-panel__activity-toggle {
    min-height: 44px;
  }
}
```

- [ ] **Step 4: Run the focused contract to verify GREEN**

Run the Step 2 command.

Expected: all source contracts pass.

- [ ] **Step 5: Run related Watch Mode rule and rendered-source tests**

Run:

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs tests/rendered-html.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 6: Commit the implementation**

```text
git add tests/game-source-contracts.test.mjs app/FreemanProtocol.tsx app/globals.css
git commit -m "fix: collapse watch activity by default"
```

### Task 2: Integrate, document, and deploy

**Files:**
- Modify: `.superpowers/sdd/task-6-report.md`
- Restore: `tsconfig.tsbuildinfo`

**Interfaces:**
- Consumes: Task 1 committed UI and source contract
- Produces: verified production deployment and appended Task 6 evidence

- [ ] **Step 1: Run the full test suite**

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run lint, type-check, and production build**

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint app tests
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc --noEmit
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vinext build
```

Expected: lint and type-check exit 0; build reports `Build complete`.

- [ ] **Step 3: Restore and inspect generated state**

```text
git restore -- tsconfig.tsbuildinfo
git diff --check
git status --short
```

Expected: no generated state or unrelated product changes remain.

- [ ] **Step 4: Append exact RED/GREEN/full verification evidence**

Append the commands, relevant outputs, commit, deployment URL/status, warnings,
and custom-domain response to `.superpowers/sdd/task-6-report.md`.

- [ ] **Step 5: Commit and push**

```text
git add .superpowers/sdd/task-6-report.md
git commit -m "docs: record watch disclosure verification"
git push origin main
```

- [ ] **Step 6: Deploy and verify**

```text
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm dlx vercel --prod --yes --archive=tgz
PATH=/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm dlx vercel ls freeman-protocol --yes
curl -sS -I -L "https://freeman.skillrivals.com/?v=$(git rev-parse --short HEAD)"
```

Expected: deployment is Ready / Production and the custom domain returns HTTP
200.
