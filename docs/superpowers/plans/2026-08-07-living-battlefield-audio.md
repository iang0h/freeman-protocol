# Living Battlefield and Audio Recovery Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Restore reliable mission music and turn late-wave combat into a readable, bounded autonomous war around fixed destructible base nodes.

Architecture: Put new simulation behavior in small pure .mjs rule modules first, then call those rules from both FreemanEngine (WebGL) and FreemanCanvasEngine (Canvas). Keep runtime entities pooled/capped, reuse existing combat feedback and camera-focus systems, and expose only compact state in the existing HUD/watch panel.

Tech Stack: React/TypeScript, Three.js WebGL, Canvas 2D fallback, Node test runner, Vinext/Vercel.

## Global Constraints

- Use fixed strategic nodes: Core, Command Uplink, Repair Bay, Barracks/Assembly Pad, and Compute Relay.
- No free-form building placement, persistent closed-tab simulation, vehicle physics, or unbounded entity creation.
- Parent agents may maintain at most four temporary sub-agents; the global temporary-unit cap and bounded pools remain authoritative.
- Both renderers consume the same pure node, lane, and autonomous-war rules.
- Music must never display “AUDIO ON” while muted or playback-blocked.
- Run tests first for every new behavior, then type-check, build, artifact validation, and browser smoke tests.

---

### Task 1: Make soundtrack state and playback recoverable

Files:
- Modify: app/game/AudioManager.ts
- Modify: app/FreemanProtocol.tsx around the audio state, engine interface, and audio button
- Create: tests/audio-manager.test.mjs
- Modify: tests/game-source-contracts.test.mjs

Interfaces:
- Produce AudioSettingsSnapshot = { muted: boolean; musicVolume: number; sfxVolume: number; playback: "idle" | "playing" | "blocked" }.
- Produce AudioManager.getSettings(): AudioSettingsSnapshot, AudioManager.startMusic(): void, and AudioManager.enableAudio(): void.
- Extend GameController with getAudioSettings(): AudioSettingsSnapshot and enableAudio(): void.

- [ ] Step 1: Write failing tests for persisted state and playback transitions.

    test("audio settings snapshot reflects persisted mute and volume values", () => {
      writeStoredValue("freeman-audio-muted", "true");
      writeStoredValue("freeman-music-volume", "0.25");
      const manager = createAudioTestManager();
      assert.deepEqual(manager.getSettings(), {
        muted: true,
        musicVolume: 0.25,
        sfxVolume: 0.72,
        playback: "idle",
      });
    });

    test("blocked playback is observable and enableAudio retries the loaded player", async () => {
      const manager = createAudioTestManager({ playRejects: true });
      manager.startMusic();
      assert.equal(manager.getSettings().playback, "blocked");
      manager.setPlayRejects(false);
      manager.enableAudio();
      assert.equal(manager.getSettings().playback, "playing");
    });

  Use a fake Audio with src, load, play, pause, and event listeners; do not inspect browser localStorage directly in the test.

- [ ] Step 2: Run the focused test and verify it fails.

    node --test tests/audio-manager.test.mjs

    Expected: FAIL because the snapshot, playback state, and retry methods do not exist.

- [ ] Step 3: Implement the minimal audio state machine.

  Add a playback field initialized to "idle", update it to "playing" after a resolved play(), and to "blocked" after a rejected promise. Add getSettings(). Change loadNext() to set src, call load(), and attach a one-shot canplay retry. Make startMusic() create/resume the graph, load the active player, and call play() only when not muted, paused, or hidden. Make enableAudio() clear the muted flag, persist it, and call startMusic(). Keep unlock() as a compatibility wrapper that calls startMusic().

- [ ] Step 4: Hydrate React audio controls and add the retry affordance.

  Add audioSettings state initialized to manager defaults. After engine construction, call engine.getAudioSettings() in a zero-delay effect and update it on HUD callbacks. Render AUDIO OFF for muted, TAP TO ENABLE AUDIO for blocked, and AUDIO ON otherwise. Make the button call enableAudio() when blocked and setMuted(!muted) otherwise. Keep volume sliders wired to the manager.

- [ ] Step 5: Add source-contract assertions and rerun focused tests.

    node --test tests/audio-manager.test.mjs tests/game-source-contracts.test.mjs

    Expected: PASS. Assert AudioManager.ts contains load(), canplay, getSettings, startMusic, an observable "blocked" state, and the UI calls enableAudio.

- [ ] Step 6: Commit.

    git add app/game/AudioManager.ts app/FreemanProtocol.tsx tests/audio-manager.test.mjs tests/game-source-contracts.test.mjs
    git commit -m "fix: recover mission music after blocked playback"

### Task 2: Add deterministic strategic-node rules

Files:
- Create: app/game/battlefield-rules.mjs
- Modify: tests/game-systems.test.mjs
- Modify: tests/game-source-contracts.test.mjs

Interfaces:
- Produce BATTLEFIELD_NODES, createBattlefieldState(), damageBattlefieldNode(state, id, amount), repairBattlefieldNode(state, id, amount, materials), getBattlefieldEffects(state), getNodeRepairCost(node), and getNodeById(state, id).
- Node ids are core, command-uplink, repair-bay, assembly-pad, and compute-relay; kinds are core, command, repair, assembly, and compute.

- [ ] Step 1: Write failing tests for node transitions, effects, and repair costs.

    test("battlefield nodes transition online, damaged, and offline", () => {
      let state = createBattlefieldState();
      state = damageBattlefieldNode(state, "assembly-pad", 60);
      assert.equal(getNodeById(state, "assembly-pad").status, "damaged");
      state = damageBattlefieldNode(state, "assembly-pad", 100);
      assert.equal(getNodeById(state, "assembly-pad").status, "offline");
    });

    test("repair consumes components and restores an offline node", () => {
      let state = damageBattlefieldNode(createBattlefieldState(), "repair-bay", 999);
      const repaired = repairBattlefieldNode(state, "repair-bay", 45, { components: 3 });
      assert.equal(repaired.materials.components, 1);
      assert.equal(getNodeById(repaired.state, "repair-bay").status, "damaged");
      assert.equal(getBattlefieldEffects(repaired.state).repairMultiplier, 0);
    });

    test("online command and compute nodes expose bounded strategic effects", () => {
      const effects = getBattlefieldEffects(createBattlefieldState());
      assert.equal(effects.commandRadius, 8);
      assert.equal(effects.computePerSecond, 1);
      assert.equal(effects.repairMultiplier, 1);
    });

- [ ] Step 2: Run the focused test and verify it fails.

    node --test tests/game-systems.test.mjs --test-name-pattern="battlefield"

    Expected: FAIL because the module and exports are absent.

- [ ] Step 3: Implement the pure node model.

  Define immutable node metadata with positions matching existing camera markers: Core (0,0), Command Uplink (-4,-2.5), Repair Bay (-3,2.6), Assembly Pad (3.2,-2.4), and Compute Relay (3.4,2.2). createBattlefieldState() returns cloned runtime nodes with max health, health, status, and repair progress. Clamp damage and repair, deduct only available materials, and compute effects from online nodes.

- [ ] Step 4: Add source-contract coverage for shared use.

  Assert FreemanProtocol.tsx imports battlefield-rules.mjs, calls createBattlefieldState, and both renderer class sections call damageBattlefieldNode and repairBattlefieldNode.

- [ ] Step 5: Run tests and commit.

    node --test tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
    git add app/game/battlefield-rules.mjs tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
    git commit -m "feat: add destructible strategic battlefield nodes"

### Task 3: Replace late-wave radial stalls with lane engagement rules

Files:
- Modify: app/game/enemy-movement-rules.mjs
- Modify: tests/game-systems.test.mjs
- Modify: tests/game-source-contracts.test.mjs
- Modify: app/FreemanProtocol.tsx in both updateEnemies implementations

Interfaces:
- Produce ENGAGEMENT_LANES, createEngagementState(wave), assignEngagementLane(enemyId, state, preferredNode), tickEngagement(state, elapsedMs), and resolveEngagementAdvance(options, deltaMs).
- An engagement record contains laneId, staging, attackTargetId, repathLeftMs, repositionLeftMs, and lastAction.

- [ ] Step 1: Write failing tests for lane selection, repath, and attack/reposition cadence.

    test("late waves distribute threats across breach lanes", () => {
      const state = createEngagementState(4);
      const assignments = ["a", "b", "c", "d"].map((id) =>
        assignEngagementLane(id, state, id === "a" ? "core" : "compute-relay"),
      );
      assert.ok(new Set(assignments.map((entry) => entry.laneId)).size >= 2);
    });

    test("engagement watchdog forces a reposition after a stationary attack radius", () => {
      let state = createEngagementState(4);
      state = tickEngagement(state, 2_100);
      assert.equal(state.repositionReady, true);
      const advance = resolveEngagementAdvance({
        position: { x: 1, z: 0 },
        target: { x: 0, z: 0 },
        arrivalDistance: 1,
        lane: { x: 0, z: 1 },
        reposition: true,
      }, 100);
      assert.ok(advance.vector.z > 0);
    });

- [ ] Step 2: Run the focused test and verify it fails.

    node --test tests/game-systems.test.mjs --test-name-pattern="engagement"

    Expected: FAIL because the engagement exports are absent.

- [ ] Step 3: Implement bounded lane and cadence helpers.

  Define lanes for north breach, south breach, Compute Relay, and boss portal. Use a deterministic enemy-id hash for distribution. Repath every 1.2 seconds and expose repositionReady after 2 seconds without a completed attack. resolveEngagementAdvance uses the existing direct vector when advancing, but uses the lane tangent during reposition so a threat visibly leaves the shared Core ring.

- [ ] Step 4: Integrate normal and boss enemy updates in both renderers.

  Create one engagement record per enemy at spawn and remove it when the enemy dies. In updateEnemies/updateFlatEnemies, select the record staging target and attack target separately. While telegraphing, preserve existing damage rules. After a completed attack, set a reposition timer and advance to the next staging point before retargeting. Replace the shared targetKind fallback for wave >= 4 with the engagement target while preserving player priority within 4.2 units and existing boss rules. Call tickEngagement once per frame and reset records on spawnWave/completeWave.

- [ ] Step 5: Add a watch-mode movement regression test and source assertions.

  Run a pure 12-second sequence with wave-4 lane records and assert that at least one action is attack or reposition every 2 seconds. Assert both renderer sections call createEngagementState, assignEngagementLane, and tickEngagement.

- [ ] Step 6: Run tests and commit.

    git add app/game/enemy-movement-rules.mjs app/FreemanProtocol.tsx tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
    git commit -m "fix: keep late-wave enemies advancing and engaging"

### Task 4: Add bounded autonomous squads and support events

Files:
- Modify: app/game/autonomy-rules.mjs
- Create: app/game/war-layer-rules.mjs
- Modify: app/FreemanProtocol.tsx
- Modify: app/game/three-resources.ts
- Modify: tests/game-systems.test.mjs
- Modify: tests/game-source-contracts.test.mjs

Interfaces:
- Produce WAR_LAYER_GLOBAL_CAP, createWarLayerState(), spawnWarSquad(state, request), tickWarSquads(state, context, elapsedMs), damageWarSquad(state, id, amount), and requestSupportEvent(state, request).
- A squad has id, parentId, role, x, z, targetId, remainingMs, health, cooldownMs, and status.
- Support events are convoy or air-strike, with a fixed lifetime and cooldown.

- [ ] Step 1: Write failing tests for squad caps, combat, expiry, and support cooldown.

    test("war squads honor parent and global caps", () => {
      let state = createWarLayerState({ globalCap: 4 });
      for (let i = 0; i < 4; i += 1) {
        state = spawnWarSquad(state, { parentId: "agent-1", role: "screen", x: 0, z: 0 }).state;
      }
      assert.equal(
        spawnWarSquad(state, { parentId: "agent-1", role: "screen", x: 0, z: 0 }).reason,
        "parent-cap",
      );
    });

    test("war squads move toward threats, deal damage, and expire", () => {
      let state = spawnWarSquad(createWarLayerState(), { parentId: "agent-1", role: "screen", x: 0, z: 0 }).state;
      state = tickWarSquads(state, { enemies: [{ id: "e1", x: 1, z: 0, hp: 20 }] }, 1_500);
      assert.ok(state.enemies?.[0]?.hp < 20 || state.squads[0].x !== 0);
      state = tickWarSquads(state, { enemies: [] }, 20_000);
      assert.equal(state.squads.length, 0);
    });

    test("assembly support has one active event and a cooldown", () => {
      const first = requestSupportEvent(createWarLayerState(), { type: "convoy", components: 2 });
      assert.equal(first.accepted, true);
      const second = requestSupportEvent(first.state, { type: "air-strike", components: 2 });
      assert.equal(second.accepted, false);
    });

- [ ] Step 2: Run the focused test and verify it fails.

    node --test tests/game-systems.test.mjs --test-name-pattern="war squad|support"

    Expected: FAIL because the module and exports are absent.

- [ ] Step 3: Implement the pure bounded war layer.

  Use a global default cap of 24, parent cap of 4, squad lifetime tiers of 10/15/20 seconds, and a 1.5 second action cooldown. tickWarSquads moves each squad toward its assigned enemy or damaged node, applies one deterministic hit at range, and removes dead or expired squads. requestSupportEvent requires two Components, one active event maximum, a 6-second cooldown, and returns a fixed event record; no function creates more than the cap.

- [ ] Step 4: Integrate parent spawning and node/support priorities.

  In both renderer updateAgents loops, use the Assembly Pad online effect and the existing parent spawn decision to call spawnWarSquad. Give roles screen when enemy density is high, repair when a node is offline, and raider when the Compute Relay is online. Spend Components through the pure state result, render each squad with the existing temporary-sub-agent marker pool, and route squad damage through existing enemy damage and feedback helpers. Trigger a convoy or air-strike event only from the Assembly Pad cooldown and existing watch priority.

- [ ] Step 5: Add visible node/support markers without adding a dashboard.

  Create/reset low-poly node meshes in the existing resource factory and draw Canvas equivalents. Add short onToast messages (ASSEMBLY PAD: SCREEN SQUAD DEPLOYED, REPAIR BAY: NODE RESTORED, AIR STRIKE INBOUND) and command-map markers. Keep the existing warband panel collapsed by default on mobile and show only the current action chip.

- [ ] Step 6: Run tests and commit.

    git add app/game/autonomy-rules.mjs app/game/war-layer-rules.mjs app/FreemanProtocol.tsx app/game/three-resources.ts tests/game-systems.test.mjs tests/game-source-contracts.test.mjs
    git commit -m "feat: add bounded autonomous war squads and support events"

### Task 5: Verify renderer parity and tune watch-mode balance

Files:
- Modify: app/FreemanProtocol.tsx (WebGL and Canvas integration/tuning only)
- Modify: app/styles.css (compact node/support chips if needed)
- Modify: tests/game-source-contracts.test.mjs

Interfaces:
- Both renderers expose identical HUD fields for node status, active squads, and current war event.

- [ ] Step 1: Add parity assertions before tuning.

  Assert WebGL and Canvas each initialize battlefield state, engagement state, and war-layer state; each updates nodes, lanes, squads, and support events; and each disposes pooled meshes or effects.

- [ ] Step 2: Run the parity test and verify missing calls are visible.

    node --test tests/game-source-contracts.test.mjs --test-name-pattern="parity|battlefield|engagement|war"

    Expected: FAIL until both renderers call every shared rule.

- [ ] Step 3: Complete parity integration and tuning.

  Use identical constants from the pure modules. Keep wave-4 enemy pressure below the active enemy limit, cap support events to one, make repair consume Components, and ensure the Core remains the only loss condition. Add camera focus targets for nodes and war events but leave macro presentation as the default.

- [ ] Step 4: Run the full automated suite and fix regressions.

    node --test tests/*.test.mjs
    PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/tsc --noEmit

    Expected: all tests pass and TypeScript exits 0.

- [ ] Step 5: Commit.

    git add app/FreemanProtocol.tsx app/styles.css tests/game-source-contracts.test.mjs
    git commit -m "feat: surface strategic nodes in both renderers"

### Task 6: Browser, build, and production verification

Files:
- Modify only if verification finds a concrete regression.

- [ ] Step 1: Run production build and artifact checks.

    PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vinext build
    PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" bash scripts/validate-artifact.sh
    git diff --check

    Expected: build succeeds, artifact validation succeeds, and git diff --check is clean.

- [ ] Step 2: Smoke test music recovery.

  Open the local app in the in-app browser, start a campaign from the visible user gesture, inspect that the button says AUDIO ON or TAP TO ENABLE AUDIO, click the latter if shown, and confirm it becomes AUDIO ON. Toggle mute and confirm AUDIO OFF, then reload and confirm the state remains honest.

- [ ] Step 3: Smoke test watch wave 4+.

  Start Watch Mode, select 4x simulation and cinema speed, wait in short intervals through wave 4 and wave 5, and record panel text plus a screenshot. Confirm positions/action feed change, nodes visibly take/restore damage, and at least one squad/support event appears. Check tab.dev.logs({levels:["error","warn"]}) returns no errors.

- [ ] Step 4: Smoke test mobile layout and touch.

  Use a mobile viewport, start a campaign, confirm node/action chips do not cover the canvas, confirm audio retry and EMP prompts are tappable, and confirm the warband panel remains collapsed until opened.

- [ ] Step 5: Commit any verification-only fixes, push, and deploy.

    git push origin main
    VERCEL_CLI=$(find /Users/iangoh/Library/pnpm/store/v11/links/@/vercel -type f -path '*/vercel/dist/vc.js' | sort -V | tail -1)
    PATH="/Users/iangoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node "$VERCEL_CLI" deploy --prod --yes
    curl -fsSL -I https://freeman.skillrivals.com/
    curl -fsSL -I https://freeman.skillrivals.com/og-image.jpg

    Expected: main contains the implementation, Vercel reports a production deployment, and both URLs return HTTP 200.

## Self-review checklist

- Audio goals map to Task 1; node state/effects to Task 2; late-wave movement to Task 3; sub-minions/support events to Task 4; renderer parity/readability to Task 5; acceptance verification to Task 6.
- Every task starts with a failing test and ends with an explicit command and commit.
- All names used by later tasks (createBattlefieldState, createEngagementState, createWarLayerState, getSettings, enableAudio) are defined in earlier task interfaces.
- No free-placement, infinite simulation, or unbounded allocations are introduced.

