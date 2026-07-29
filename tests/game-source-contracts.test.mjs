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
  assert.match(game, /this\.enemyGrid\.query\(position, maxDistance\)/);
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

test("both engines keep 79 Compute unchanged when KIRA is attempted during the KAIROS step", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /recruit\(id: AgentId\) \{\s*if \(!canPerformTutorialAction\(this\.tutorialStep, `recruit-\$\{id\}`\)\) return;\s*if \(this\.mode !== "playing"\) return;[\s\S]*?this\.addAgent/,
    );
    assert.match(
      engine,
      /setSquadCommand\(command: SquadCommand\) \{\s*if \(!canPerformTutorialAction\(this\.tutorialStep, "guard-core"\) && command === "defend"\) return;/,
    );
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
