# Commander Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make late waves responsive, auto-deploy sentries, add one of two evolutions for each existing agent, clarify player upgrades, and play the three supplied MP3 tracks in a persistent shuffled mix.

**Architecture:** Extract deterministic rules from the 6,800-line game component into small JavaScript modules that both the Three.js and Canvas engines can consume and Node can test directly. Keep renderer-specific pooling and cleanup in focused TypeScript helpers, then integrate each system into the existing engines and React HUD in independently verifiable milestones.

**Tech Stack:** React 19, TypeScript 5.9, Three.js 0.181, Canvas 2D fallback, Web Audio/HTMLMediaElement, Node's built-in test runner, Vinext/Vite, Sites hosting.

## Global Constraints

- Keep the existing four-agent roster, eight encounters, enemy totals, rewards, art direction, and desktop/touch support.
- WebGL permits at most 36 ordinary active enemies; Canvas permits at most 28; boss and boss-phase summons are exempt.
- Release at most four queued enemies every 0.75 seconds.
- `B` auto-deploys; `Shift+B` enters or cancels manual sentry placement.
- Agent evolutions are mutually exclusive and use the exact prices and values in the approved design.
- Power Shots, Stronger Defense, Faster AI Team, EMP Overdrive, and Squad Command cap at two stacks; Field Repair remains uncapped.
- Music uses the supplied MP3 audio without re-encoding, strips attached artwork/metadata, crossfades for four seconds, and prevents shuffle-boundary repeats.
- Use failing tests before each production change and commit each task separately.
- Preserve the `.openai/hosting.json` project ID and deploy only a saved version built from the pushed commit.

## File Map

- Create `app/game/combat-rules.mjs`: spawn-budget and wave-completion rules shared by both engines.
- Create `app/game/sentry-placement.mjs`: deterministic placement validation and candidate scoring.
- Create `app/game/progression.mjs`: evolution definitions, purchase rules, upgrade caps, and draft selection.
- Create `app/game/playlist.mjs`: non-repeating Fisher-Yates shuffle bags.
- Create `app/game/spatial-grid.ts`: reusable broad-phase index for WebGL enemies.
- Create `app/game/three-resources.ts`: shared Three.js cleanup and bounded object-pool helpers.
- Create `app/game/AudioManager.ts`: streamed music, procedural cues, buses, persistence, and lifecycle.
- Create `tests/game-systems.test.mjs`: pure shared-rule regression tests.
- Create `tests/game-source-contracts.test.mjs`: renderer/HUD/audio integration contracts not exposed as pure rules.
- Create `public/audio/freeman-protocol.mp3`, `public/audio/freeman-core-2.mp3`, `public/audio/freeman-core-3.mp3`: stripped copies of the supplied tracks.
- Modify `app/FreemanProtocol.tsx`: integrate the extracted systems into both engines and the React HUD.
- Modify `app/globals.css`: sentry controls, evolution planning, stack badges, audio controls, focus, and mobile layout.
- Modify `tests/mobile-layout.test.mjs`: cover the new compact mobile controls.

---

### Task 1: Deterministic Shared Game Rules

**Files:**
- Create: `app/game/combat-rules.mjs`
- Create: `app/game/sentry-placement.mjs`
- Create: `app/game/progression.mjs`
- Create: `app/game/playlist.mjs`
- Create: `tests/game-systems.test.mjs`

**Interfaces:**
- Produces: `getActiveEnemyLimit(renderer)`, `releaseSpawnBatch(queue, capacity, now, nextReleaseAt)`, `remainingThreats(state)`, and `canCompleteWave(state)`.
- Produces: `isValidSentryPosition(position, existing, blockers)`, `scoreSentryPosition(position, existing, blockers)`, and `selectAutoSentryPosition(existing, blockers)`.
- Produces: `EVOLUTIONS`, `purchaseEvolution(state, agentId, evolutionId)`, `UPGRADE_CAPS`, `applyUpgradeStack(state, upgradeId)`, and `getUpgradeDraft(wave, stacks)`.
- Produces: `refillShuffleBag(trackIds, previousTrackId, random)` and `takeNextTrack(state, random)`.

- [ ] **Step 1: Write failing spawn and completion tests**

Add tests that assert the exact active limits, release size/cooldown, total remaining count, and completion gate:

```js
test("paces queued enemies without changing the remaining threat total", () => {
  assert.equal(getActiveEnemyLimit("webgl"), 36);
  assert.equal(getActiveEnemyLimit("canvas"), 28);
  const queue = Array.from({ length: 10 }, (_, index) => `virus-${index}`);
  const result = releaseSpawnBatch(queue, 6, 10, 0);
  assert.deepEqual(result.released, queue.slice(0, 4));
  assert.deepEqual(result.queue, queue.slice(4));
  assert.equal(result.nextReleaseAt, 10.75);
  assert.equal(remainingThreats({
    active: 6,
    queued: result.queue.length,
    scheduled: 8,
  }), 20);
  assert.equal(canCompleteWave({ active: 0, queued: 1, scheduled: 0 }), false);
  assert.equal(canCompleteWave({ active: 0, queued: 0, scheduled: 0 }), true);
});
```

- [ ] **Step 2: Run the test and confirm the import fails**

Run: `node --test tests/game-systems.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `app/game/combat-rules.mjs`.

- [ ] **Step 3: Implement the combat-rule functions**

Use immutable return objects so tests cannot mutate engine queues accidentally:

```js
export const ACTIVE_ENEMY_LIMITS = Object.freeze({ webgl: 36, canvas: 28 });

export function getActiveEnemyLimit(renderer) {
  return ACTIVE_ENEMY_LIMITS[renderer] ?? ACTIVE_ENEMY_LIMITS.canvas;
}

export function releaseSpawnBatch(queue, capacity, now, nextReleaseAt) {
  if (capacity <= 0 || queue.length === 0 || now < nextReleaseAt) {
    return { released: [], queue: [...queue], nextReleaseAt };
  }
  const count = Math.min(4, capacity, queue.length);
  return {
    released: queue.slice(0, count),
    queue: queue.slice(count),
    nextReleaseAt: now + 0.75,
  };
}

export function remainingThreats({ active, queued, scheduled }) {
  return active + queued + scheduled;
}

export function canCompleteWave(state) {
  return remainingThreats(state) === 0;
}
```

- [ ] **Step 4: Add failing sentry-placement tests**

Cover valid annulus boundaries, blocker rejection, deterministic selection, equal spacing, and no valid result:

```js
test("auto placement is deterministic and spreads sentries around the core", () => {
  const first = selectAutoSentryPosition([], []);
  const second = selectAutoSentryPosition([first], []);
  const repeated = selectAutoSentryPosition([], []);
  assert.deepEqual(first, repeated);
  assert.ok(Math.hypot(first.x, first.z) >= 2.35);
  assert.ok(Math.hypot(first.x, first.z) <= 7.2);
  assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= 1.8);
});

test("auto placement returns null when every candidate is blocked", () => {
  const blockers = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    return { x: Math.cos(angle) * 5.1, z: Math.sin(angle) * 5.1, radius: 1.2 };
  });
  assert.equal(selectAutoSentryPosition([], blockers), null);
});
```

- [ ] **Step 5: Implement deterministic sentry candidates**

Generate 48 candidates across radii `4.8` and `5.4`, validate against the Core annulus, `1.8` sentry spacing, and blocker radii, then sort by score descending and stable candidate index ascending:

```js
const RADII = [4.8, 5.4];
const ANGLES_PER_RING = 24;

export function isValidSentryPosition(position, existing, blockers) {
  const radius = Math.hypot(position.x, position.z);
  if (radius < 2.35 || radius > 7.2) return false;
  if (existing.some((item) => distance(item, position) < 1.8)) return false;
  return !blockers.some(
    (item) => distance(item, position) < (item.radius ?? 0.5) + 0.7,
  );
}

export function selectAutoSentryPosition(existing, blockers) {
  const candidates = RADII.flatMap((radius, ring) =>
    Array.from({ length: ANGLES_PER_RING }, (_, index) => {
      const angle = (index / ANGLES_PER_RING) * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        candidateIndex: ring * ANGLES_PER_RING + index,
      };
    }),
  ).filter((position) =>
    isValidSentryPosition(position, existing, blockers),
  );
  candidates.sort((a, b) =>
    scoreSentryPosition(b, existing, blockers) -
      scoreSentryPosition(a, existing, blockers) ||
    a.candidateIndex - b.candidateIndex,
  );
  return candidates[0]
    ? { x: candidates[0].x, z: candidates[0].z }
    : null;
}
```

`scoreSentryPosition` must reward minimum existing-sentry distance, penalize range overlap beyond one shared sector, and prefer radius `5.1`.

- [ ] **Step 6: Add failing progression tests**

Test exact prices, mutually exclusive purchases, insufficient Compute, exact evolution constants, upgrade caps, and capped draft replacement:

```js
test("an agent can buy exactly one evolution", () => {
  const state = {
    compute: 200,
    recruited: { kairos: true },
    evolutions: {},
  };
  const purchased = purchaseEvolution(state, "kairos", "cryo-mesh");
  assert.equal(purchased.compute, 130);
  assert.equal(purchased.evolutions.kairos, "cryo-mesh");
  assert.throws(
    () => purchaseEvolution(purchased, "kairos", "stasis-lock"),
    /already evolved/,
  );
});

test("permanent upgrades cap at two stacks and disappear from drafts", () => {
  const stacks = { overclock: 2 };
  assert.throws(() => applyUpgradeStack({ stacks }, "overclock"), /capped/);
  assert.ok(getUpgradeDraft(4, stacks).every((item) => item.id !== "overclock"));
});
```

- [ ] **Step 7: Implement progression definitions and pure reducers**

Encode all eight evolution IDs, exact Compute prices, and exact numeric modifiers from the approved spec in frozen data. Reducers return new state and throw descriptive errors for unrecruited, already evolved, unaffordable, unknown, or capped requests.

- [ ] **Step 8: Add failing playlist tests**

Use an injected deterministic random function:

```js
test("shuffle bag plays all tracks and avoids boundary repeats", () => {
  const tracks = ["protocol", "core-2", "core-3"];
  let state = { tracks, bag: [], previous: null };
  const played = [];
  for (let index = 0; index < 7; index += 1) {
    const result = takeNextTrack(state, () => 0);
    played.push(result.track);
    state = result.state;
  }
  assert.deepEqual(new Set(played.slice(0, 3)), new Set(tracks));
  assert.notEqual(played[2], played[3]);
  assert.notEqual(played[5], played[6]);
});
```

- [ ] **Step 9: Implement Fisher-Yates bag refill**

Shuffle a copied track array, rotate or swap when the first entry equals `previousTrackId`, return the next item, and never mutate caller-owned arrays.

- [ ] **Step 10: Run shared-rule tests**

Run: `node --test tests/game-systems.test.mjs`

Expected: all shared-rule tests PASS.

- [ ] **Step 11: Commit**

```bash
git add app/game/*.mjs tests/game-systems.test.mjs
git commit -m "test: define commander clarity game rules"
```

---

### Task 2: Three.js Resource Ownership and Spatial Queries

**Files:**
- Create: `app/game/spatial-grid.ts`
- Create: `app/game/three-resources.ts`
- Create: `tests/game-source-contracts.test.mjs`
- Modify: `app/FreemanProtocol.tsx`

**Interfaces:**
- Consumes: existing `EnemyRuntime`, projectile, and effect objects.
- Produces: `SpatialGrid<T extends { group: THREE.Object3D }>` with `rebuild(items)` and `query(position, radius)`.
- Produces: `disposeObject3D(root, ownership)`, `BoundedPool<T>`, and shared enemy/projectile geometry caches.

- [ ] **Step 1: Write failing source-contract tests**

Read `FreemanProtocol.tsx` and assert that enemy construction no longer creates `new THREE.PointLight`, projectile removal invokes centralized cleanup/pooling, expired non-sprite effects invoke cleanup, and `clearDynamic` uses the same lifecycle helper.

- [ ] **Step 2: Run source-contract tests and verify failure**

Run: `node --test tests/game-source-contracts.test.mjs`

Expected: FAIL because per-enemy point lights and detach-only cleanup remain.

- [ ] **Step 3: Implement spatial grid**

Use a `3`-unit cell size and string keys `${cellX}:${cellZ}`. `rebuild` clears and repopulates buckets once per frame after enemy movement. `query` inspects only intersecting cells, deduplicates items with a reusable `Set`, and filters by squared distance.

- [ ] **Step 4: Implement centralized Three.js cleanup**

`disposeObject3D` traverses meshes, lines, points, and sprites; disposes owned geometry, material arrays, and owned texture maps once; and detaches the root. The ownership parameter contains `sharedGeometries`, `sharedMaterials`, and a `WeakSet` of already disposed resources.

`BoundedPool` exposes `acquire(create)`, `release(value, reset, dispose)`, and `clear(dispose)`. Projectiles cap at 128 pooled objects and each effect kind caps at 96.

- [ ] **Step 5: Remove enemy lights and reduce shadow cost**

Delete the per-enemy `PointLight`; retain emissive bodies and rings. Set ordinary enemy meshes to `castShadow = false`; allow the Rootkit body to cast a shadow. Cache repeated primitive geometries by enemy type and clone only materials whose emissive intensity changes per enemy.

- [ ] **Step 6: Pool projectiles and effects**

Replace per-shot geometry/material construction with shared geometry plus pooled meshes. Ensure removal resets position, rotation, scale, material opacity, and runtime fields before returning to the pool. Dispose overflow only when the bounded pool is full.

- [ ] **Step 7: Route all cleanup paths through the helper**

Update enemy death, projectile expiry/hit, effect expiry, `clearDynamic`, engine `dispose`, cancelled placement ghosts, and model-load failure. Stop animation mixers and uncache their roots before removing rigged agents.

- [ ] **Step 8: Replace full scans in targeting and collision**

Rebuild the spatial grid after `updateEnemies`. Use it for `getNearestEnemy`, melee, sentry targeting, agent targeting, aim assistance, and projectile collision. Iterate mutable arrays backward or queue removals instead of spreading arrays each frame. Reuse scratch `Vector2`/`Vector3` instances for distance math.

- [ ] **Step 9: Cache procedural noise and cap voices**

Create one cached buffer per `{duration, cutoff}` cue shape, reuse it for buffer sources, track active sources, and skip the oldest low-priority hit cue when the 24-voice SFX cap is reached.

- [ ] **Step 10: Run contract tests, lint, and build**

Run:

```bash
node --test tests/game-source-contracts.test.mjs
npm run lint
npm run build
```

Expected: tests PASS, lint exits `0`, build and artifact validation exit `0`.

- [ ] **Step 11: Commit**

```bash
git add app/game/spatial-grid.ts app/game/three-resources.ts app/FreemanProtocol.tsx tests/game-source-contracts.test.mjs
git commit -m "perf: bound combat rendering resources"
```

---

### Task 3: Spawn Pacing and Adaptive Quality in Both Engines

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `tests/game-source-contracts.test.mjs`
- Test: `tests/game-systems.test.mjs`

**Interfaces:**
- Consumes: combat functions from `app/game/combat-rules.mjs`.
- Produces: queued encounter state, total-threat HUD values, and quality telemetry in both engines.

- [ ] **Step 1: Add failing integration contracts**

Assert both engines import/use `getActiveEnemyLimit`, `releaseSpawnBatch`, `remainingThreats`, and `canCompleteWave`; both maintain `spawnQueue` and `nextQueueReleaseAt`; and both HUD emitters count active, queued, and scheduled threats.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`

Expected: source contracts FAIL because pacing is not integrated.

- [ ] **Step 3: Integrate WebGL spawn queue**

`spawnWave` enqueues encounter members above available capacity. `spawnFormation` accepts a maximum active capacity and queues the remainder. `updateGame` calls the pure release function after deaths and reinforcement scheduling. Boss and phase summons bypass the ordinary cap but remain counted in the HUD.

- [ ] **Step 4: Integrate Canvas spawn queue**

Mirror the same state transitions with the Canvas limit of 28. Do not duplicate the pure pacing math.

- [ ] **Step 5: Correct completion and HUD counts**

Wave completion requires no active enemies, queued enemies, or scheduled reinforcements. The visible enemy count is `remainingThreats(...)`; reinforcement packs contribute their exact future unit counts, not only the number of packs.

- [ ] **Step 6: Add adaptive cosmetic quality**

Track a rolling two-second frame-time window. Above 22 ms, halve future particle counts and reduce WebGL pixel ratio by `0.1` to a `1.0` floor. Below 17 ms for five seconds, restore one step. Apply a five-second quality-change cooldown. Canvas reduces particle counts and device-pixel-ratio ceiling using the same thresholds.

- [ ] **Step 7: Run tests, lint, and build**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
npm run lint
npm run build
```

Expected: PASS and exit `0`.

- [ ] **Step 8: Commit**

```bash
git add app/FreemanProtocol.tsx tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
git commit -m "perf: pace late wave enemy spawns"
```

---

### Task 4: Automatic and Manual Sentry Deployment

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`
- Modify: `tests/mobile-layout.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: `selectAutoSentryPosition` and `isValidSentryPosition` from `app/game/sentry-placement.mjs`.
- Produces: `autoDeployDefense()`, `beginManualDefensePlacement()`, shared `placeDefenseAt(position)`, visible placement/range guides, and updated input bindings.

- [ ] **Step 1: Write failing sentry UI/source tests**

Assert the source contains separate `AUTO-DEPLOY SENTRY` and `PLACE MANUALLY` controls, `KeyB` branches on `event.shiftKey`, auto-deploy calls the pure selector, both flows call one spending/placement function, and mobile CSS keeps the two actions visible without overlapping combat controls.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs`

Expected: FAIL because the current single button enters placement mode.

- [ ] **Step 3: Extract a single spending/placement method**

Move cost validation, Compute deduction, model creation, runtime insertion, effects, toast, and HUD emission into `placeDefenseAt(position)`. Validate again immediately before spending. Return `{ ok: true }` or `{ ok: false, reason }`.

- [ ] **Step 4: Implement auto deployment**

Build blocker records from player, Core, active enemies, and existing sentries. Call `selectAutoSentryPosition`, convert the result to a Three.js/Canvas position, briefly display the candidate and range, then call `placeDefenseAt`. If selection fails, show `NO VALID SENTRY POSITION` and spend nothing.

- [ ] **Step 5: Improve manual placement**

Rename the old method to `beginManualDefensePlacement`. Add a persistent legal-band guide and 8.5-unit range ring while placement is active. Multiply simulation delta by `0.25` during placement while using raw delta for pointer/UI/effects. Cancel and cleanup remain free.

- [ ] **Step 6: Update controls and responsive layout**

Make the primary base-panel button auto-deploy. Add a smaller secondary manual button. Bind `B` to auto and `Shift+B` to manual/cancel. Update help copy and focus styles. On narrow screens stack both actions inside the existing base panel.

- [ ] **Step 7: Run tests, lint, and build**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
npm run lint
npm run build
```

Expected: PASS and exit `0`.

- [ ] **Step 8: Commit**

```bash
git add app/FreemanProtocol.tsx app/globals.css tests/mobile-layout.test.mjs tests/game-source-contracts.test.mjs
git commit -m "feat: auto deploy sentry defenses"
```

---

### Task 5: Agent Evolutions and Clearer Player Upgrades

**Files:**
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`
- Modify: `tests/game-systems.test.mjs`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: `EVOLUTIONS`, `purchaseEvolution`, `UPGRADE_CAPS`, `applyUpgradeStack`, and `getUpgradeDraft`.
- Produces: evolution runtime effects, stack-aware HUD state, and the optional between-wave evolution step.

- [ ] **Step 1: Add failing UI and combat contracts**

Assert HUD state includes `upgradeStacks` and `evolutions`; agent cards show stats/rank/evolution; wave-clear mode distinguishes player draft from optional agent evolution; each evolution ID is referenced by its intended combat path; and capped upgrades cannot be applied.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`

Expected: source contracts FAIL because runtime progression is absent.

- [ ] **Step 3: Add progression state**

Reset `upgradeStacks` and `evolutions` on each run. Extend both engines' HUD emitters and React state types. Change wave-clear flow to `player-upgrade` followed by `agent-evolution`; continuing from the second step starts the next wave.

- [ ] **Step 4: Integrate exact player-upgrade rules**

Use the pure reducer before applying runtime multipliers. Apply two-stack caps, `0.85` agent attack-interval multipliers, `1.5` EMP multipliers, `1.25` squad-damage multipliers, and accurate Bastion copy. Show stack badges on draft cards and replace capped choices.

- [ ] **Step 5: Implement Kairos and Kira evolutions**

Cryo Mesh queries the spatial grid for two secondary targets within 2.5 units and applies 70% slow duration. Stasis Lock tracks per-target hit windows/cooldowns. Execution Protocol uses Kira-specific priority and adds 35% execute damage. Rail Pierce stores remaining pierces and damage multiplier on Kira projectiles.

- [ ] **Step 6: Implement Forge and Covenant evolutions**

Cluster Burst applies 45% impact damage within 1.8 units without recursively triggering another cluster. Suppression Loop tracks target ID and stacks, adjusts Forge's cooldown, and lengthens the target attack interval at four stacks. Aegis Relay adds bounded player/Core shields consumed before HP. Nanite Repair uses the exact repair values and subtracts 1.5 seconds from every agent disable timer.

- [ ] **Step 7: Build the optional evolution planning screen**

After the free player upgrade, show only recruited, unevolved agents. Each card presents both paths, exact price, and concise effect. Disable unaffordable choices, provide `CONTINUE WITHOUT EVOLVING`, and return to normal wave start after purchase or continue.

- [ ] **Step 8: Make agent cards truthful**

Display damage, attack interval, range, utility, rank, and chosen evolution. Update Kira/Forge/Kairos copy to match real targeting and area effects. Preserve the compact mobile collapsed state.

- [ ] **Step 9: Run tests, lint, and build**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
npm run lint
npm run build
```

Expected: PASS and exit `0`.

- [ ] **Step 10: Commit**

```bash
git add app/game/progression.mjs app/FreemanProtocol.tsx app/globals.css tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
git commit -m "feat: add agent evolution protocols"
```

---

### Task 6: Streamed Shuffled Soundtrack

**Files:**
- Create: `app/game/AudioManager.ts`
- Create: `public/audio/freeman-protocol.mp3`
- Create: `public/audio/freeman-core-2.mp3`
- Create: `public/audio/freeman-core-3.mp3`
- Modify: `app/FreemanProtocol.tsx`
- Modify: `app/globals.css`
- Modify: `tests/game-source-contracts.test.mjs`

**Interfaces:**
- Consumes: `takeNextTrack` from `app/game/playlist.mjs`.
- Produces: `AudioManager.unlock()`, `playCue(cue)`, `setMuted(value)`, `setMusicVolume(value)`, `setSfxVolume(value)`, `setPaused(value)`, and `dispose()`.

- [ ] **Step 1: Write failing audio source contracts**

Assert the audio manager defines two media players, separate music/SFX/master gains, four-second crossfade, preference keys, visibility handling, rejected-playback handling, and complete disposal. Assert the game uses `AudioManager` rather than `SynthAudio`.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs`

Expected: FAIL because the audio manager and public tracks do not exist.

- [ ] **Step 3: Create stripped audio assets**

Run:

```bash
mkdir -p public/audio
ffmpeg -i "/Users/iangoh/Downloads/Freeman Protocol.mp3" -map 0:a:0 -c:a copy -map_metadata -1 public/audio/freeman-protocol.mp3
ffmpeg -i "/Users/iangoh/Downloads/Freeman Core.mp3" -map 0:a:0 -c:a copy -map_metadata -1 public/audio/freeman-core-2.mp3
ffmpeg -i "/Users/iangoh/Downloads/Freeman Core (1).mp3" -map 0:a:0 -c:a copy -map_metadata -1 public/audio/freeman-core-3.mp3
```

Verify each output has exactly one MP3 audio stream, no MJPEG stream, 48 kHz stereo audio, and a size below 5 MiB:

```bash
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of json public/audio/*.mp3
```

- [ ] **Step 4: Implement audio graph and persisted preferences**

Create two `Audio` elements, route them through separate gains to `musicBus`, route procedural cues to `sfxBus`, then connect both to `master` and a conservative `DynamicsCompressorNode`. Load `freeman-audio-muted`, `freeman-music-volume`, and `freeman-sfx-volume`; clamp values to `0..1` and map sliders with `value ** 2`.

- [ ] **Step 5: Implement playlist and crossfade**

On `unlock`, synchronously resume context and call the active player's `play()`. Load only active and next URLs. Schedule a four-second equal-power crossfade near track end; use `ended` as fallback. Catch `play()` rejection and expose `needsGesture` through the HUD callback.

- [ ] **Step 6: Port procedural cues and lifecycle**

Move existing cue synthesis into `AudioManager`, use cached noise buffers and the SFX voice cap from Task 2, briefly duck music for ultimate/victory/defeat only, pause on game pause or hidden document, and resume only when previously playing. Disposal removes media listeners, pauses players, clears sources, disconnects nodes, and closes the context.

- [ ] **Step 7: Add UI controls**

Keep the header mute toggle. Add labelled Music and Effects range inputs to the controls dialog, display current track title, and show `ENABLE AUDIO` when playback needs another gesture. Ensure the dialog retains keyboard focus and mobile scrolling.

- [ ] **Step 8: Run tests, inspect assets, lint, and build**

Run:

```bash
node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs tests/mobile-layout.test.mjs
for file in public/audio/*.mp3; do ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of default=nw=1 "$file"; done
npm run lint
npm run build
```

Expected: all tests PASS; each audio file reports MP3/48000/2; lint and build exit `0`.

- [ ] **Step 9: Commit**

```bash
git add app/game/AudioManager.ts app/game/playlist.mjs app/FreemanProtocol.tsx app/globals.css public/audio tests/game-source-contracts.test.mjs
git commit -m "feat: add shuffled Freeman soundtrack"
```

---

### Task 7: Full Verification, Profiling, and Production Deployment

**Files:**
- Modify only if verification reveals a scoped defect in files already listed above.
- Update: `docs/superpowers/plans/2026-07-28-commander-clarity-implementation.md` checkbox state.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified build, profiling evidence, responsive play-test evidence, pushed commit, saved Sites version, and production deployment.

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm test
npm run lint
git diff --check
git status --short
```

Expected: tests/build/lint exit `0`, no whitespace errors, and only the intentional plan-checkbox update is uncommitted.

- [ ] **Step 2: Profile waves 1 and 7**

Use an accelerated local scenario with four agents and three sentries. Record average frame time, render calls, triangles, active lights, geometries, textures, active enemies, queued enemies, projectiles, and effects for 30 seconds in each wave.

Acceptance:

- no per-enemy point lights;
- active ordinary enemies never exceed renderer limit;
- WebGL wave 7 sustains at least 45 FPS at the standard desktop preview size;
- restarting three times returns renderer geometry/texture counts to within 10% of the post-load baseline;
- no unbounded growth in projectile/effect pool sizes.

- [ ] **Step 3: Play-test controls and progression**

Verify mouse, keyboard, and touch emulation:

- `B` auto-deploys and spends once;
- `Shift+B` manual placement slows simulation and cancel is free;
- no valid auto position shows an error and spends nothing;
- all eight evolution paths visibly and mechanically work;
- competing evolution purchase is rejected;
- upgrade stacks/caps/draft replacement are correct;
- Canvas fallback preserves counts and progression.

- [ ] **Step 4: Play-test audio**

Let playback cross two track boundaries and one reshuffle boundary. Verify no immediate repeat, four-second crossfade, mute, separate volume controls, pause/resume, hidden-tab handling, defeat/victory ducking, replay, and a simulated rejected `play()` promise.

- [ ] **Step 5: Verify responsive layouts**

Inspect desktop, tablet, and narrow mobile viewports. Confirm the base panel, evolution screen, squad dock, audio controls, action buttons, safe areas, focus indicators, and dialog scrolling do not overlap or clip.

- [ ] **Step 6: Commit verification-only fixes and plan completion**

If verification required fixes, apply TDD for each defect and commit them separately. Then mark completed checkboxes and commit:

```bash
git add docs/superpowers/plans/2026-07-28-commander-clarity-implementation.md
git commit -m "docs: record commander clarity verification"
```

- [ ] **Step 7: Push, save, and deploy with Sites**

Read `.openai/hosting.json`, preserve its exact project ID, obtain a short-lived source credential, push the exact verified commit, save a Sites version for that commit, deploy only that saved version, and inspect deployment status until terminal.

- [ ] **Step 8: Smoke-test production**

Open the production URL, verify the mission starts, music unlocks from the start gesture, auto-sentry works after enough Compute is available, and no console errors appear. Report the deployed URL and exact verification results.
