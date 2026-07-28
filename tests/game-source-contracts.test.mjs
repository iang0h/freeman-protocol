import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const game = await readFile(
  new URL("../app/FreemanProtocol.tsx", import.meta.url),
  "utf8",
);
const webglGame = game.slice(
  game.indexOf("class FreemanEngine"),
  game.indexOf("type FlatEnemy"),
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
