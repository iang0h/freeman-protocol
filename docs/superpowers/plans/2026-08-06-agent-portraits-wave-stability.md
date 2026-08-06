# Visual Warband and Wave Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace numeric recruit identities with generated low-poly portraits and visual controls, while preventing late-wave boss orbit stalls and adding bounded cinematic sub-agent bursts.

**Architecture:** Keep the existing eight-agent and warband rule data authoritative. Add renderer-independent presentation, movement-watchdog, and sub-agent-cadence helpers in `app/game/`; React consumes a shared portrait component; WebGL and Canvas consume the same movement/spawn decisions while retaining their own rendering and object pools. Generated portraits live in the asset catalog only and are never required for game boot.

**Tech Stack:** React 19, TypeScript, Three.js, Canvas fallback, Node `node:test`, WebP UI assets generated with ImageGen, existing Vite/Vinext production build.

## Global Constraints

- Preserve all eight `AgentId` values, recruitment costs, keyboard shortcuts, order callbacks, combat roles, and wave/intermission rules.
- Generated portraits are UI/catalog-only and must not be a runtime combat dependency.
- Both WebGL and Canvas must consume identical pure movement and sub-agent decisions.
- Keep at least four active sub-agents per parent as the local cap, plus a finite global cinematic cap.
- Keep every visible action target at least 44px on touch layouts and keep full meaning available through accessible labels/tooltips.
- Portraits must provide meaningful alt text when standalone, `aria-hidden` when the surrounding control already names the agent, visible focus states, and an accent-colored fallback glyph when an image fails.
- Do not add an online model-conversion service or runtime GLB/image fetch.
- Use test-first steps and commit each independently testable task.

---

### Task 1: Add the renderer-independent agent visual catalog

**Files:**
- Create: `app/game/agent-presentation-rules.mjs`
- Create: `tests/agent-visuals.test.mjs`

**Interfaces:**
- Produces `AGENT_VISUALS`, `AGENT_VISUAL_IDS`, and `getAgentVisual(agentId)` for the React UI.
- `getAgentVisual("unknown")` returns `null` without throwing.

- [ ] **Step 1: Write the failing test**

Add a Node test that imports the catalog and asserts the complete, ordered set and metadata:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_VISUAL_IDS, AGENT_VISUALS, getAgentVisual } from "../app/game/agent-presentation-rules.mjs";

test("agent visual catalog covers every recruit slot without numeric identity", () => {
  assert.deepEqual(AGENT_VISUAL_IDS, ["kairos", "kira", "forge", "covenant", "relay", "scout", "warden", "nova"]);
  for (const id of AGENT_VISUAL_IDS) {
    const visual = AGENT_VISUALS[id];
    assert.match(visual.portraitSrc, new RegExp(`/asset-catalog/agents/${id}\\.webp$`));
    assert.ok(visual.roleLabel.length > 0);
    assert.ok(visual.fallbackClass.length > 0);
    assert.match(visual.accent, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(Object.values(AGENT_VISUALS).map((visual) => visual.fallbackClass)).size, 8);
  assert.equal(getAgentVisual("unknown"), null);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/agent-visuals.test.mjs`

Expected: FAIL because `app/game/agent-presentation-rules.mjs` does not exist.

- [ ] **Step 3: Implement the minimal catalog**

Create the pure module with exactly these exports and role metadata:

```js
export const AGENT_VISUAL_IDS = Object.freeze([
  "kairos", "kira", "forge", "covenant", "relay", "scout", "warden", "nova",
]);

const makeVisual = (id, roleLabel, fallbackClass, accent) => Object.freeze({
  portraitSrc: `/asset-catalog/agents/${id}.webp`,
  roleLabel,
  fallbackClass,
  accent,
});

export const AGENT_VISUALS = Object.freeze({
  kairos: makeVisual("kairos", "TIME CONTROL", "is-temporal", "#e86b3a"),
  kira: makeVisual("kira", "PRECISION", "is-precision", "#9ec4c9"),
  forge: makeVisual("forge", "ASSAULT", "is-assault", "#d7a640"),
  covenant: makeVisual("covenant", "REPAIR", "is-repair", "#f0eee8"),
  relay: makeVisual("relay", "RESOURCE", "is-resource", "#58bfc8"),
  scout: makeVisual("scout", "MOBILE", "is-mobile", "#9bd13b"),
  warden: makeVisual("warden", "CORE GUARD", "is-guard", "#a99ee8"),
  nova: makeVisual("nova", "BOSS ASSAULT", "is-boss", "#db4b83"),
});

export function getAgentVisual(agentId) {
  return AGENT_VISUALS[agentId] ?? null;
}
```

Do not import Three.js, React, or `FreemanProtocol` from this module.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/agent-visuals.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/game/agent-presentation-rules.mjs tests/agent-visuals.test.mjs
git commit -m "feat: add agent visual catalog"
```

### Task 2: Add a pure enemy convergence and stall watchdog

**Files:**
- Create: `app/game/enemy-movement-rules.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- `createMovementWatchdogState(targetId = null)` returns `{ targetId, lastDistance: null, stalledMs: 0 }`.
- `resolveEnemyAdvance({ position, target, routeBias, arrivalDistance, watchdog }, deltaMs)` returns `{ vector: { x, z }, distance, forcedDirect, watchdog }`.
- The returned vector is normalized or `{x: 0, z: 0}` at the target.

- [ ] **Step 1: Write failing movement tests**

Add tests covering lane steering, near-target radial convergence, target reset, and forced direct recovery:

```js
import {
  createMovementWatchdogState,
  resolveEnemyAdvance,
} from "../app/game/enemy-movement-rules.mjs";

test("enemy route bias retains inward progress and fades near arrival", () => {
  const far = resolveEnemyAdvance({
    position: { x: 0, z: 0 }, target: { id: "core", x: 10, z: 0 },
    routeBias: 0.3, arrivalDistance: 1, watchdog: createMovementWatchdogState(),
  }, 100);
  const near = resolveEnemyAdvance({
    position: { x: 8.9, z: 0 }, target: { id: "core", x: 10, z: 0 },
    routeBias: 0.3, arrivalDistance: 1, watchdog: createMovementWatchdogState(),
  }, 100);
  assert.ok(far.vector.x > 0);
  assert.ok(near.vector.x > 0.95);
});

test("enemy watchdog forces direct convergence after radial progress stalls", () => {
  let watchdog = createMovementWatchdogState();
  let result = resolveEnemyAdvance({
    position: { x: 0, z: 0 }, target: { id: "core", x: 10, z: 0 },
    routeBias: 0.3, arrivalDistance: 1, watchdog,
  }, 100);
  watchdog = result.watchdog;
  for (let index = 0; index < 16; index += 1) {
    result = resolveEnemyAdvance({
      position: { x: 0, z: 0 }, target: { id: "core", x: 10, z: 0 },
      routeBias: 0.3, arrivalDistance: 1, watchdog: result.watchdog,
    }, 100);
  }
  assert.equal(result.forcedDirect, true);
  assert.equal(result.vector.z, 0);
  assert.equal(result.vector.x, 1);
});

test("changing an enemy target resets the stall timer", () => {
  const result = resolveEnemyAdvance({
    position: { x: 0, z: 0 }, target: { id: "agent", x: 0, z: 10 },
    routeBias: 0.3, arrivalDistance: 1,
    watchdog: { targetId: "core", lastDistance: 10, stalledMs: 1400 },
  }, 100);
  assert.equal(result.forcedDirect, false);
  assert.equal(result.watchdog.targetId, "agent");
  assert.equal(result.watchdog.stalledMs, 0);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/game-systems.test.mjs`

Expected: FAIL with the new movement module missing.

- [ ] **Step 3: Implement the movement helper**

Use a 1,500ms stall threshold. Compute the direct unit vector and a tangent nudge whose strength is `routeBias * 0.35 * clamp((distance - arrivalDistance) / 6, 0, 1)`. Blend and normalize the result while the watchdog is healthy. Reset the target timer when `target.id` changes or distance improves by at least `0.01`; otherwise add `deltaMs`. When the timer reaches 1,500ms, return the direct vector and `forcedDirect: true`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/game-systems.test.mjs`

Expected: PASS for the new movement tests and all existing game-system tests.

- [ ] **Step 5: Commit**

```bash
git add app/game/enemy-movement-rules.mjs tests/game-systems.test.mjs
git commit -m "feat: add enemy convergence watchdog"
```

### Task 3: Add bounded sub-agent spawn cadence rules

**Files:**
- Modify: `app/game/autonomy-rules.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- Export `SUB_AGENT_GLOBAL_CAP = 16` and `SUB_AGENT_SPAWN_COOLDOWN_MS = 2800`.
- `createSubAgentSpawnState()` returns `{ cooldownLeftMs: 0 }`.
- `tickSubAgentSpawnState(state, elapsedMs)` returns the state with a non-negative cooldown.
- `getSubAgentSpawnDecision({ pressure, activeChildren, totalActive, materials, cooldownLeftMs, maxPerParent = 4, globalCap = SUB_AGENT_GLOBAL_CAP })` returns `{ allowed, reason }` without mutating `materials`.

- [ ] **Step 1: Write failing cadence tests**

Add tests asserting the cooldown, material, local-cap, global-cap, pressure, and expiry rules:

```js
import {
  SUB_AGENT_GLOBAL_CAP,
  SUB_AGENT_SPAWN_COOLDOWN_MS,
  createSubAgentSpawnState,
  getSubAgentSpawnDecision,
  tickSubAgentSpawnState,
} from "../app/game/autonomy-rules.mjs";

test("sub-agent cadence allows a pressure burst only when resources and caps permit", () => {
  assert.deepEqual(createSubAgentSpawnState(), { cooldownLeftMs: 0 });
  assert.deepEqual(getSubAgentSpawnDecision({
    pressure: 0.8, activeChildren: 1, totalActive: 3,
    materials: { components: 1, shards: 1 }, cooldownLeftMs: 0,
  }), { allowed: true, reason: "ready" });
  assert.equal(getSubAgentSpawnDecision({
    pressure: 0.8, activeChildren: 1, totalActive: 3,
    materials: { components: 1, shards: 1 }, cooldownLeftMs: 10,
  }).allowed, false);
  assert.equal(getSubAgentSpawnDecision({
    pressure: 0.8, activeChildren: 4, totalActive: 3,
    materials: { components: 1, shards: 1 }, cooldownLeftMs: 0,
  }).reason, "parent-cap");
  assert.equal(getSubAgentSpawnDecision({
    pressure: 0.8, activeChildren: 1, totalActive: SUB_AGENT_GLOBAL_CAP,
    materials: { components: 1, shards: 1 }, cooldownLeftMs: 0,
  }).reason, "global-cap");
  assert.equal(getSubAgentSpawnDecision({
    pressure: 0.4, activeChildren: 1, totalActive: 3,
    materials: { components: 1, shards: 1 }, cooldownLeftMs: 0,
  }).reason, "low-pressure");
  assert.equal(tickSubAgentSpawnState({ cooldownLeftMs: SUB_AGENT_SPAWN_COOLDOWN_MS }, 500).cooldownLeftMs, 2300);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/game-systems.test.mjs`

Expected: FAIL because the cadence exports do not exist.

- [ ] **Step 3: Implement the cadence helpers**

Return the first failing reason in this order: `low-pressure`, `cooldown`, `parent-cap`, `global-cap`, `materials`; otherwise return `{ allowed: true, reason: "ready" }`. Treat pressure `>= 0.6` as eligible, require at least one component and shard, and never mutate the passed wallet. Keep `spawnTemporarySubAgent` as the only function that spends materials.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/game-systems.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/game/autonomy-rules.mjs tests/game-systems.test.mjs
git commit -m "feat: add bounded sub-agent spawn cadence"
```

### Task 4: Generate the eight portrait assets

**Files:**
- Create: `public/asset-catalog/agents/kairos.webp`
- Create: `public/asset-catalog/agents/kira.webp`
- Create: `public/asset-catalog/agents/forge.webp`
- Create: `public/asset-catalog/agents/covenant.webp`
- Create: `public/asset-catalog/agents/relay.webp`
- Create: `public/asset-catalog/agents/scout.webp`
- Create: `public/asset-catalog/agents/warden.webp`
- Create: `public/asset-catalog/agents/nova.webp`

**Interfaces:**
- Each image is a square, readable at 384px, with the same low-poly chest-up crop and no embedded text or watermark.
- The UI must remain functional if any image is missing or fails to decode.

- [ ] **Step 1: Generate one image per agent with ImageGen**

Use the ImageGen tool once per requested asset. Use this shared prompt prefix:

`Square 1:1 UI portrait for a tactical science-fiction game called Freeman Protocol, stylized low-poly 3D chest-up cybernetic AI agent, centered bust, consistent three-quarter view, dark charcoal studio background, crisp silhouette, teal and amber rim lighting, high contrast, no text, no logo, no watermark, no border.`

Append the role cue for each image: temporal ring/ice visor; precision scope/heavy marksman armor; rotary assault armor/muzzle glow; luminous repair shield/halo; relay antenna/resource pack; lightweight scout visor/wing silhouette; broad core shield/defensive plating; magenta star-core boss-assault armor.

- [ ] **Step 2: Normalize the generated files**

Copy the generated outputs into `public/asset-catalog/agents/` with the exact lowercase filenames above. Use the existing workspace image tooling to convert to WebP when needed, preserve square dimensions, and verify each file begins with a valid WebP RIFF header. Do not remove existing catalog assets.

- [ ] **Step 3: Verify the asset set**

Run:

```bash
for agent in kairos kira forge covenant relay scout warden nova; do test -s "public/asset-catalog/agents/$agent.webp"; done
node --test tests/agent-visuals.test.mjs
```

Expected: all eight files are non-empty and the catalog test passes.

- [ ] **Step 4: Commit**

```bash
git add public/asset-catalog/agents
git commit -m "feat: add low-poly agent portraits"
```

### Task 5: Add the reusable portrait component and compact visual controls

**Files:**
- Create: `app/AgentPortrait.tsx`
- Modify: `app/FreemanProtocol.tsx:14500-14740`
- Modify: `app/page.tsx:115-180`
- Modify: `app/globals.css:2180-2385, 3830-3865, 4430-4455, 4960-5050`
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `tests/mobile-layout.test.mjs`

**Interfaces:**
- `AgentPortrait` accepts `{ agentId: string; size?: "sm" | "md" | "lg"; state?: string; decorative?: boolean; className?: string }`.
- It renders `.agent-portrait` with an image from `getAgentVisual`, `data-agent-id`, the accent CSS variable, and a fallback role glyph class.

- [ ] **Step 1: Write failing source and responsive tests**

Extend source contracts to require the shared catalog import, `.agent-card__portrait`, `.agent-portrait`, portrait usage in advisor/skills/co-op/command-map markup, and no visible numeric `.agent-card__node` identity. Extend mobile contracts to require portrait sizing, resource-chip collapse, and 44px controls.

- [ ] **Step 2: Run the focused contracts to verify they fail**

Run: `node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs`

Expected: FAIL because the existing JSX still renders numeric diamonds and text-heavy metrics.

- [ ] **Step 3: Implement `AgentPortrait`**

Render the image with `loading="lazy"` and `decoding="async"`; use an empty alt when the surrounding button already names the agent and the agent name when the portrait is standalone. The fallback span remains visible behind the image so a failed image still presents the role color and glyph.

- [ ] **Step 4: Simplify the roster and advisor markup**

Replace the numeric `.agent-card__node` span with `AgentPortrait`; keep the keyboard `<kbd>` in `.agent-card__slot`. Render only short name, `visual.roleLabel`, status, and three resource chips by default. Move damage/cooldown/range into `aria-describedby`/`title`. Add the portrait and compact state/reason chip to the recruitment advisor without duplicating Watch Mode detail.

- [ ] **Step 5: Reuse portraits in skills, co-op, and command map**

Use the same component for co-op agent markers and skill buttons while preserving health bars and cooldown rings. Hide persistent two-letter labels by default but keep `title` and ARIA names. Keep command-map marker labels available on focus/hover.

- [ ] **Step 6: Implement icon-first CSS**

Add portrait rings, role fallback glyphs, state dots, `.agent-resource-chip`, `.agent-action-icon`, and compact squad-command styles. Keep labels readable on desktop; at `max-width: 520px`, hide secondary metrics and long cost text rather than shrinking typography. Set every new action/order/card button to `min-height: 44px` and preserve safe-area spacing.

- [ ] **Step 7: Run the focused contracts to verify they pass**

Run: `node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/AgentPortrait.tsx app/FreemanProtocol.tsx app/page.tsx app/globals.css tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
git commit -m "feat: make warband controls visual"
```

### Task 6: Integrate boss convergence and the movement watchdog in both renderers

**Files:**
- Modify: `app/FreemanProtocol.tsx:5000-5080, 5494-5790, 9430-9465, 9788-10120`
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- `EnemyRuntime` and `FlatEnemy` each store a `movementWatchdog` state from `createMovementWatchdogState()`.
- Both renderers call `resolveEnemyAdvance(...)` for non-telegraph movement.

- [ ] **Step 1: Write failing integration contracts**

Require two renderer imports of `enemy-movement-rules.mjs`, two `movementWatchdog` fields/initializers, two `resolveEnemyAdvance` calls, and a boss-radius clamp in both assault-agent target calculations. Add a system assertion that the helper’s direct vector has positive dot product with the target vector after forced recovery.

- [ ] **Step 2: Run the focused contracts to verify they fail**

Run: `node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs`

Expected: FAIL because the renderers still call `applyTerrainRouteBias` directly and have no watchdog state.

- [ ] **Step 3: Clamp assault orbit radius**

When the priority target has `bossState.attackRadius`, calculate the existing role radius and replace it with `Math.min(existingRadius, Math.max(0.8, bossState.attackRadius * 0.75))`. Use the unchanged radius when the target is not a boss. Apply the same expression in WebGL and Canvas.

- [ ] **Step 4: Route enemy movement through the helper**

Pass `{ id: targetKind, x: targetPosition.x, z: targetPosition.z }`, the current enemy position, the signed terrain route bias, and `Math.max(0.75, enemy.range * 0.86)` into `resolveEnemyAdvance`. Store the returned watchdog on the enemy and advance with the returned vector only when outside attack range. Reset watchdog state when the enemy is disabled, telegraphing, decoy-owned, or changes target.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs && npm run build`

Expected: PASS and a successful production build.

- [ ] **Step 6: Commit**

```bash
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
git commit -m "fix: keep late-wave enemies converging"
```

### Task 7: Integrate recurring sub-agent bursts in WebGL and Canvas

**Files:**
- Modify: `app/FreemanProtocol.tsx:1370-1390, 4810-4965, 5170-5185, 7600-7630, 9220-9340, 9500-9510`
- Modify: `tests/game-source-contracts.test.mjs`
- Modify: `tests/game-systems.test.mjs`

**Interfaces:**
- Each renderer owns `subAgentSpawnState: Partial<Record<AgentId, SubAgentSpawnState>>`.
- Existing `spawnTemporarySubAgent` remains responsible for spending resources and constructing child state.

- [ ] **Step 1: Write failing source contracts**

Require both renderers to import the cadence helpers, tick per-parent cooldown, compute total active children, call `getSubAgentSpawnDecision`, and set cooldown after a successful spawn. Require `clearTemporarySubAgents` to reset cadence state.

- [ ] **Step 2: Run the contracts to verify they fail**

Run: `node --test tests/game-source-contracts.test.mjs`

Expected: FAIL because the current `previous === "improvise"` edge gate is still present.

- [ ] **Step 3: Replace the edge gate with the cadence decision**

At the start of `maybeSpawnTemporarySubAgent`, tick the agent’s state and compute `pressure` from current enemy density divided by active enemy limit. Count active children across the renderer and pass spendable materials to `getSubAgentSpawnDecision`. If disallowed, return. If allowed, call `spawnTemporarySubAgent` with the existing role context; only after it returns a child should the renderer subtract materials, set the cooldown to `SUB_AGENT_SPAWN_COOLDOWN_MS`, and emit the existing ring/burst/toast.

- [ ] **Step 4: Keep the burst cinematic but bounded**

Use the shared global cap of 16 active children, retain the four-per-parent argument, and leave `clearTemporarySubAgents` at wave transitions. Keep child action behavior unchanged. Add a concise activity entry such as `KAIROS DEPLOYED TEMPORAL SUPPORT` rather than a verbose resource paragraph.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test tests/game-source-contracts.test.mjs tests/game-systems.test.mjs && npm run build`

Expected: PASS and a successful production build.

- [ ] **Step 6: Commit**

```bash
git add app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs tests/game-systems.test.mjs
git commit -m "feat: animate bounded sub-agent bursts"
```

### Task 8: Full verification and visual smoke pass

**Files:**
- Modify only if verification exposes a regression: the files from Tasks 1–7.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: the production build completes, then every `tests/*.test.mjs` test passes.

- [ ] **Step 2: Run artifact and lint checks**

Run: `npm run validate:artifact && npm run lint`

Expected: both commands exit 0 with no missing generated assets, type errors, or lint violations.

- [ ] **Step 3: Smoke-test the important states in the browser**

Open the local production build and verify:

1. Desktop Warband shows portraits, short role/status chips, visual costs, and no numeric identity diamonds.
2. A 375px mobile viewport shows portrait identity, readable one-word actions, and 44px touch targets without overlaying the map.
3. Watch Mode advances through waves 4 and 5; bosses move into assault agents, die, and trigger intermission.
4. With enough components and shards, parents deploy multiple temporary children over time; the global cap is never exceeded and children disappear on expiry/wave transition.
5. Disabling WebGL leaves the same compact UI and movement/sub-agent behavior in Canvas.

- [ ] **Step 4: Commit any verification-only fixes**

```bash
git add app tests public/asset-catalog/agents
git commit -m "test: verify visual warband and wave stability"
```

- [ ] **Step 5: Report exact evidence**

Record the final commit, test command results, build result, and the browser states checked before claiming completion or deploying.
