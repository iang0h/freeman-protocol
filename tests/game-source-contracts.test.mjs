import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const game = await readFile(
  new URL("../app/FreemanProtocol.tsx", import.meta.url),
  "utf8",
);
const audioManager = await readFile(
  new URL("../app/game/AudioManager.ts", import.meta.url),
  "utf8",
).catch(() => "");
const storage = await readFile(
  new URL("../app/game/storage.mjs", import.meta.url),
  "utf8",
).catch(() => "");
const threeResources = await readFile(
  new URL("../app/game/three-resources.ts", import.meta.url),
  "utf8",
);
const webglGame = game.slice(
  game.indexOf("class FreemanEngine"),
  game.indexOf("type FlatEnemy"),
);
const canvasGame = game.slice(
  game.indexOf("class FreemanCanvasEngine"),
  game.indexOf("function VirtualStick"),
);

test("enemy rendering does not allocate a point light per enemy", () => {
  const createEnemy = game.slice(
    game.indexOf("private createEnemy("),
    game.indexOf("private spawnWave("),
  );
  assert.doesNotMatch(createEnemy, /new THREE\.PointLight/);
  assert.match(createEnemy, /body\.castShadow = type === "rootkit"/);
});

test("dynamic WebGL objects use centralized cleanup and pooling", () => {
  assert.match(webglGame, /disposeObject3D/);
  assert.match(webglGame, /projectilePool/);
  assert.match(webglGame, /this\.disposeDynamicObject\(enemy\.group\)/);
  assert.match(webglGame, /this\.disposeDynamicObject\(effect\.object\)/);
  assert.match(webglGame, /this\.projectilePool\.release/);
  assert.doesNotMatch(
    webglGame,
    /for \(const projectile of \[\.\.\.this\.projectiles\]\)/,
  );
});

test("WebGL targeting uses a spatial grid", () => {
  assert.match(game, /new SpatialGrid<EnemyRuntime>/);
  assert.match(game, /this\.enemyGrid\.rebuild\(this\.enemies\)/);
  assert.match(game, /this\.enemyGrid\.query\(position, targetingRange\)/);
});

test("both renderers pace spawns and include queued threats in the HUD", () => {
  assert.match(game, /getActiveEnemyLimit\("webgl"\)/);
  assert.match(game, /getActiveEnemyLimit\("canvas"\)/);
  assert.ok((game.match(/private spawnQueue: EnemyType\[\] = \[\]/g) ?? []).length >= 2);
  assert.ok((game.match(/releaseSpawnBatch\(/g) ?? []).length >= 2);
  assert.ok((game.match(/remainingThreats\(/g) ?? []).length >= 2);
  assert.ok((game.match(/canCompleteWave\(/g) ?? []).length >= 2);
});

test("enemy defeat creates a loot pickup in both renderers", () => {
  for (const engine of [webglGame, canvasGame]) {
    const damageEnemy = engine.slice(
      engine.indexOf("private damageEnemy("),
      engine.indexOf("private fireProjectile(") >= 0
        ? engine.indexOf("private fireProjectile(")
        : engine.indexOf("private removeProjectile("),
    );
    assert.match(damageEnemy, /rollLootDrop\(enemy\.type, Math\.random\)/);
    assert.match(damageEnemy, /this\.pickups\.push/);
  }
});

test("loot collection is overlap-gated in both renderers", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /private updateLootPickups\([\s\S]*?canCollectLoot\([\s\S]*?applyLootPickup\(/,
    );
    assert.match(engine, /private clearLootPickups\(\)/);
  }
});

test("loot presentation is shared, pooled, touch-safe, and announced", () => {
  assert.match(game, /getLootPresentation/);
  assert.match(webglGame, /new BoundedPool<THREE\.Group>/);
  assert.match(
    webglGame,
    /this\.lootPool\.release\(pickup\.mesh, \(mesh\) => resetLootPickupMesh/,
  );
  assert.match(webglGame, /mesh\.position\.y = 0\.62 \+ Math\.sin/);
  assert.match(canvasGame, /getLootPresentation\(pickup\.type\)/);
  assert.match(canvasGame, /presentation\.worldLabel/);
  assert.match(game, /radius: TOUCH_SAFE_PICKUP_RADIUS/);
  assert.match(game, /aria-live="polite"/);
  assert.match(game, /presentation\.toastText/);
});

test("both renderers clear uncollected loot before every wave transition", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /private completeWave\(\) \{[\s\S]*?this\.clearLootPickups\(\);[\s\S]*?if \(this\.wave >= TOTAL_WAVES\)/,
    );
  }
});

test("sentries support automatic deployment and optional manual placement", () => {
  assert.match(game, /AUTO-DEPLOY SENTRY/);
  assert.match(game, /PLACE MANUALLY/);
  assert.match(game, /event\.shiftKey/);
  assert.ok((game.match(/selectAutoSentryPosition\(/g) ?? []).length >= 2);
  assert.ok((game.match(/private placeDefenseAt\(/g) ?? []).length >= 2);
  assert.ok((game.match(/this\.placeDefenseAt\(/g) ?? []).length >= 4);
});

test("player upgrades are capped and recruited agents can evolve", () => {
  assert.match(game, /upgradeStacks: UpgradeStacks/);
  assert.match(game, /evolutions: Evolutions/);
  assert.ok((game.match(/applyUpgradeStack\(/g) ?? []).length >= 2);
  assert.ok((game.match(/purchaseEvolution\(/g) ?? []).length >= 2);
  assert.match(game, /CONTINUE WITHOUT EVOLVING/);
  for (const id of [
    "cryo-mesh",
    "stasis-lock",
    "execution-protocol",
    "rail-pierce",
    "cluster-burst",
    "suppression-loop",
    "aegis-relay",
    "nanite-repair",
  ]) {
    assert.match(game, new RegExp(id));
  }
});

test("both engines charge evolution Compute without changing component inventory", () => {
  for (const engine of [webglGame, canvasGame]) {
    const evolve = engine.slice(
      engine.indexOf("evolveAgent("),
      engine.indexOf("purchaseComponentUpgrade("),
    );
    assert.match(evolve, /compute: this\.data/);
    assert.doesNotMatch(evolve, /compute: this\.data \+ this\.loot\.components/);
    assert.doesNotMatch(evolve, /this\.loot\.components\s*=/);
    assert.doesNotMatch(
      engine,
      /pickup\.type === "upgrade-shard"\) this\.data \+=/,
    );
  }
  assert.match(game, /SHARD INVENTORY/);
});

test("hybrid progression exposes armor, component ranks, and categorized drafts", () => {
  assert.match(game, /PLAYER_ARMORS/);
  assert.match(game, /AGENT_COMPONENT_UPGRADES/);
  assert.ok((game.match(/purchaseComponentUpgrade\(/g) ?? []).length >= 3);
  assert.match(game, /armorId:/);
  assert.match(game, /armorBonuses:/);
  assert.match(game, /componentUpgradeRanks:/);
  assert.match(game, /PLAYER DRAFT/);
  assert.match(game, /AGENT DRAFT/);
  assert.match(game, /DEFENSE DRAFT/);
  assert.match(game, /ARMOR PROFILE/);
  assert.match(game, /COMPONENTS/);
  assert.match(game, /INSUFFICIENT COMPONENTS/);
});

test("streams a shuffled soundtrack through a crossfading audio manager", () => {
  assert.match(game, /new AudioManager/);
  assert.doesNotMatch(game, /new SynthAudio/);
  assert.match(audioManager, /takeNextTrack/);
  assert.match(audioManager, /new Audio\(/);
  assert.match(audioManager, /CROSSFADE_SECONDS = 4/);
  assert.match(audioManager, /freeman-audio-muted/);
  assert.match(audioManager, /freeman-music-volume/);
  assert.match(audioManager, /freeman-sfx-volume/);
  assert.match(audioManager, /\.play\(\)\.catch/);
});

test("both engines clear latched input across lifecycle boundaries", () => {
  assert.ok((game.match(/private resetInput\(\)/g) ?? []).length >= 2);
  assert.ok((game.match(/window\.addEventListener\("blur", this\.resetInput\)/g) ?? []).length >= 2);
  assert.ok((game.match(/document\.addEventListener\("visibilitychange", this\.onVisibilityChange\)/g) ?? []).length >= 2);
  assert.ok((game.match(/this\.resetInput\(\);/g) ?? []).length >= 8);
  assert.match(game, /onLostPointerCapture=\{reset\}/);
  assert.match(game, /normalizeStickInput/);
});

test("both engines support touch tap-to-fire without routing through movement", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /pointerType === "touch"/);
    assert.match(engine, /tapToFire\(/);
    assert.match(engine, /else this\.attack\(\)/);
  }
});

test("touch cancellation clears temporary touch aim in both engines", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /touchAimActive = false/);
    assert.match(engine, /if \(this\.touchAimActive\) this\.hasPointerAim = false/);
    assert.match(engine, /private onPointerCancel[\s\S]*?this\.resetInput\(\)/);
  }
});

test("WebGL engine runs the shared tutorial and checkpoints wave one", () => {
  assert.match(webglGame, /advanceTutorial/);
  assert.match(webglGame, /FIRST_WAVE\.initial/);
  assert.match(webglGame, /isTutorialProtected/);
  assert.match(webglGame, /private firstWaveCheckpoint/);
  assert.match(webglGame, /retryWave\(\)/);
  assert.match(webglGame, /onTutorialComplete/);
});

test("Canvas fallback matches tutorial and retry behavior", () => {
  for (const pattern of [
    /advanceTutorial/,
    /FIRST_WAVE\.initial/,
    /isTutorialProtected/,
    /private firstWaveCheckpoint/,
    /retryWave\(\)/,
    /onTutorialComplete/,
  ]) {
    assert.match(canvasGame, pattern);
  }
});

test("tutorial events are phase-gated instead of queued", () => {
  assert.doesNotMatch(webglGame, /tutorialEvents/);
  assert.doesNotMatch(canvasGame, /tutorialEvents/);
  assert.match(webglGame, /const next = advanceTutorial\(this\.tutorialStep, event\)/);
  assert.match(canvasGame, /const next = advanceTutorial\(this\.tutorialStep, event\)/);
  assert.match(webglGame, /private tutorialResolved = false/);
  assert.match(webglGame, /if \(this\.tutorialResolved\) return;/);
  assert.match(webglGame, /this\.tutorialResolved = true;/);
});

test("both engines gate tutorial recruitment without blocking optional squad commands", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /recruit\(id: AgentId\) \{\s*if \(!canPerformTutorialAction\(this\.tutorialStep, `recruit-\$\{id\}`\)\) return;\s*if \(this\.mode !== "playing"\) return;[\s\S]*?this\.addAgent/,
    );
    assert.doesNotMatch(engine, /canPerformTutorialAction\(this\.tutorialStep, "guard-core"\)/);
  }
});

test("both engines consume the shared observe breach and clear replay placement", () => {
  assert.match(webglGame, /for \(const threat of OBSERVE_BREACH\)/);
  assert.match(canvasGame, /for \(const threat of OBSERVE_BREACH\)/);
  assert.match(
    webglGame,
    /retryWave\(\) \{[\s\S]*?this\.resetInput\(\);[\s\S]*?this\.cancelDefensePlacement\(false\);/,
  );
});

test("both engines drive recruited agents from shared autonomous role intents", () => {
  assert.match(game, /decideAgentIntent/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private autonomyState/);
    assert.match(engine, /private temporarySubAgents/);
    assert.match(
      engine,
      /private updateAgents\([\s\S]*?decideAgentIntent\([\s\S]*?intent === "assault"[\s\S]*?intent === "support"[\s\S]*?intent === "defend"/,
    );
  }
});

test("temporary autonomous sub-agents are bounded, rendered, expired, and reset", () => {
  assert.match(game, /const MAX_TEMPORARY_SUB_AGENTS_PER_WAVE = 3/);
  assert.match(game, /spawnTemporarySubAgent/);
  assert.match(game, /tickTemporarySubAgent/);
  assert.match(game, /clearSubAgents/);
  assert.match(webglGame, /temporary-sub-agent/);
  assert.match(canvasGame, /private drawTemporarySubAgent/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /subAgentsSpawnedThisWave/);
    assert.match(engine, /private clearTemporarySubAgents\(\)/);
    assert.match(
      engine,
      /private startNextWave\(\) \{[\s\S]*?this\.clearTemporarySubAgents\(\);/,
    );
    assert.match(
      engine,
      /retryWave\(\) \{[\s\S]*?this\.clearTemporarySubAgents\(\);/,
    );
    assert.match(
      engine,
      /private completeWave\(\) \{[\s\S]*?this\.clearTemporarySubAgents\(\);/,
    );
    assert.match(
      engine,
      /private defeat\(\) \{[\s\S]*?this\.clearTemporarySubAgents\(\);/,
    );
  }
});

test("both engines consume shared temporary role actions and health cues", () => {
  assert.match(threeResources, /createTemporarySubAgentMarker/);
  assert.match(threeResources, /resetTemporarySubAgentMarker/);
  assert.match(threeResources, /updateTemporarySubAgentHealthCue/);
  assert.match(webglGame, /temporarySubAgentPool/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /private updateTemporarySubAgents\([\s\S]*?tickTemporarySubAgent\(/,
    );
    assert.match(engine, /action\.type === "attack"[\s\S]*?damageEnemy/);
    assert.match(engine, /action\.type === "repair"[\s\S]*?playerHealing/);
    assert.match(engine, /action\.type === "guard"[\s\S]*?slowMs/);
    assert.match(engine, /healthRatio/);
  }
  assert.match(webglGame, /this\.temporarySubAgentPool\.clear/);
});

test("follow command overrides autonomous roles and Canvas disposal clears sub-agents", () => {
  assert.match(game, /this\.squadCommand === "follow"[\s\S]*?intent/);
  const canvasDispose = canvasGame.slice(canvasGame.lastIndexOf("dispose()"));
  assert.match(canvasDispose, /clearTemporarySubAgents\(\)/);
});

test("recruitment advances directly to passive autonomous observation", () => {
  assert.doesNotMatch(game, /ORDER: GUARD CORE/);
  assert.match(game, /AUTONOMOUS ROLE ACTIVE/);
  for (const engine of [webglGame, canvasGame]) {
    assert.doesNotMatch(engine, /emitTutorialEvent\("guard-selected"\)/);
    assert.match(
      engine,
      /this\.emitTutorialEvent\("kairos-recruited"\)/,
    );
  }
});

test("both renderers consume shared hacker and terrain encounter rules", () => {
  assert.match(game, /getWaveModifiers/);
  assert.match(game, /getTerrainModifier/);
  assert.ok((game.match(/resolveEmpDamage\(/g) ?? []).length >= 2);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /resistanceFlags/);
    assert.match(engine, /applyTerrainRouteBias/);
    assert.match(engine, /getEffectiveResistanceFlags/);
    assert.match(engine, /getPhisherDecoyOffsets/);
    assert.match(engine, /getRootkitRebootUpdates/);
    assert.match(engine, /terrain\.spawnAngleOffset/);
    assert.match(engine, /terrain\.targetingRangeMultiplier/);
    assert.match(engine, /terrain\.routeBias/);
    assert.match(engine, /decoyOwnerId/);
    assert.match(engine, /enemy-jammer-zone/);
  }
});

test("both renderers show resistance cues and deterministic terrain overlays", () => {
  assert.match(webglGame, /enemy-resistance-cue/);
  assert.match(webglGame, /terrain-overlay/);
  assert.match(canvasGame, /private drawResistanceCues/);
  assert.match(canvasGame, /private drawTerrainOverlay/);
  for (const label of [
    "RELAY STORM",
    "FIREWALL LANES",
    "DATA FOG",
    "SPLIT BREACH",
  ]) {
    assert.match(game, new RegExp(label));
  }
});

test("both renderers emit complete encounter telemetry in their HUD payloads", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /temporarySubAgents: this\.temporarySubAgents\.length/,
    );
    assert.match(engine, /terrainLabel: this\.terrain\.label/);
    assert.match(
      engine,
      /empResistance: getMaxEmpResistancePercent\(this\.encounterModifiers\)/,
    );
  }
});

test("game persistence always goes through safe in-memory-backed helpers", () => {
  assert.match(storage, /const memoryStorage = new Map\(\)/);
  assert.match(storage, /export function readStoredNumber/);
  assert.match(storage, /export function writeStoredValue/);
  assert.doesNotMatch(game, /window\.localStorage/);
  assert.doesNotMatch(audioManager, /window\.localStorage/);
});

test("play transitions reset keyboard state before crossing overlays", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private startNextWave\(\) \{\s*this\.resetInput\(\);/);
    assert.match(engine, /private completeWave\(\) \{\s*this\.resetInput\(\);/);
    assert.match(engine, /private defeat\(\) \{[\s\S]*?this\.resetInput\(\);/);
  }
});

test("persists completion and offers a first-wave retry", () => {
  assert.match(game, /freeman-tutorial-complete/);
  assert.match(game, /RETRY WAVE/);
  assert.match(game, /engineRef\.current\?\.retryWave\(\)/);
});
