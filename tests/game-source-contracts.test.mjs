import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const game = await readFile(
  new URL("../app/FreemanProtocol.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const catalog = await readFile(
  new URL("../app/asset-catalog/AssetCatalog.tsx", import.meta.url),
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
  game.indexOf("export default function FreemanProtocol"),
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

test("repair caches grant one field kit while restoring their HP value", () => {
  for (const engine of [webglGame, canvasGame]) {
    const loot = engine.slice(
      engine.indexOf("private updateLootPickups"),
      engine.indexOf("private clearLootPickups"),
    );
    assert.match(loot, /repairKits: this\.loot\.repairs/);
    assert.match(loot, /this\.loot\.repairs = next\.repairKits \?\? 0/);
    assert.doesNotMatch(loot, /this\.loot\.repairs \+= pickup\.value/);
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
  assert.match(canvasGame, /getLootPresentation\(pickup\.type, pickup\.value\)/);
  assert.match(canvasGame, /presentation\.worldLabel/);
  assert.match(game, /radius: TOUCH_SAFE_PICKUP_RADIUS/);
  assert.match(game, /aria-live="polite"/);
  assert.match(game, /presentation\.toastText/);
});

test("both renderers clear uncollected loot before every wave transition", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /private completeWave\(\) \{[\s\S]*?this\.clearLootPickups\(\);[\s\S]*?if \(this\.wave >= TOTAL_WAVES(?: && !isWatchMode\(this\.sessionMode\))?/,
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
    const evolveStart = engine.indexOf("evolveAgent(");
    const evolveEnd = engine.indexOf("purchaseComponentUpgrade", evolveStart + 20);
    const evolve = engine.slice(evolveStart, evolveEnd > evolveStart ? evolveEnd : evolveStart + 900);
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

test("all eight agents can buy the shared temporary-unit lifetime upgrade", () => {
  assert.match(
    game,
    /purchaseComponentUpgrade\(target: "player" \| AgentId, upgradeId: string\)/,
  );
  assert.match(
    game,
    /AGENTS\.map\(\(agent\) => \[\s*agent\.id,\s*this\.agents\.some/,
  );
  assert.ok(
    (game.match(/AGENT_COMPONENT_UPGRADES\[agent\.id\]/g) ?? []).length >= 2,
  );
  assert.match(game, /"sub-agent-lifetime":/);
});

test("late recruitment labels announce every required resource", () => {
  assert.match(
    game,
    /Recruit \$\{agent\.name\} for \$\{cost\?\.compute \?\? agent\.cost\} Compute, \$\{cost\?\.components \?\? 0\} Components, and \$\{cost\?\.shards \?\? 0\} Shards/,
  );
  assert.match(game, /CLICK A CARD OR PRESS 1–8/);
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
  assert.match(game, /normalizeStickInput/);
});

test("both engines support direct touch-drag movement and tap-to-fire", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /pointerType === "touch"/);
    assert.match(engine, /tapToFire\(/);
    assert.match(engine, /else this\.attack\(\)/);
    assert.match(engine, /touchMovePointer/);
    assert.match(engine, /touchStartX/);
    assert.match(engine, /normalizeStickInput\(/);
    assert.match(engine, /setPointerCapture\(event\.pointerId\)/);
    assert.match(engine, /this\.setTouchMovement\(/);
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

test("both renderers retry from a complete first-wave state snapshot", () => {
  assert.match(game, /type FirstWaveCheckpoint = \{[\s\S]*empState: EmpState;[\s\S]*loot: LootCounters;[\s\S]*repairBayHp: number;/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private captureFirstWaveCheckpoint\(\) \{[\s\S]*empState: \{ \.\.\.this\.empState \}[\s\S]*loot: \{ \.\.\.this\.loot \}[\s\S]*repairBayHp: this\.repairBay\.hp/);
    assert.match(engine, /retryWave\(\) \{[\s\S]*this\.empState = \{ \.\.\.checkpoint\.empState \}[\s\S]*this\.loot = \{ \.\.\.checkpoint\.loot \}[\s\S]*this\.repairBay\.hp = checkpoint\.repairBayHp/);
  }
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

test("both engines retain workshop recruitment through wave seven before wave eight", () => {
  assert.match(
    game,
    /advanceWarbandWorkshopMode,[\s\S]*?canRecruitPersistentWarband,[\s\S]*?from "\.\/game\/warband-rules\.mjs"/,
  );
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /private completeWave\(\) \{[\s\S]*?this\.intermissionClock = WAVE_INTERMISSION_MS;[\s\S]*?callbacks\.onMode\("playing"\)/,
    );
    assert.match(
      engine,
      /recruit\(id: AgentId\) \{\s*if \(!canPerformTutorialAction\(this\.tutorialStep, `recruit-\$\{id\}`\)\) return;\s*if \(!canRecruitPersistentWarband\(this\.mode\)\) return;[\s\S]*?this\.addAgent/,
    );
    assert.match(
      engine,
      /private startNextWave\(\) \{[\s\S]*?this\.mode = advanceWarbandWorkshopMode\(this\.mode, "start-next-wave"\);[\s\S]*?callbacks\.onMode\("playing"\)/,
    );
    assert.doesNotMatch(engine, /canPerformTutorialAction\(this\.tutorialStep, "guard-core"\)/);
  }
  assert.match(game, /const canRecruitWarband = canRecruitPersistentWarband\(mode\);/);
  assert.match(game, /disabled=\{recruited \|\| !canRecruitWarband\}/);
  assert.match(
    game,
    /useAgentSkill\(id: EvolutionAgentId\) \{\s*if \(this\.mode !== "playing"\) return;/,
  );
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
  assert.match(game, /const MAX_TEMPORARY_SUB_AGENTS_PER_PARENT = 4/);
  assert.match(game, /spawnTemporarySubAgent/);
  assert.match(game, /tickTemporarySubAgent/);
  assert.match(game, /clearSubAgents/);
  assert.match(webglGame, /temporary-sub-agent/);
  assert.match(canvasGame, /private drawTemporarySubAgent/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /maxSubAgents: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT/);
    assert.match(engine, /getSpendableWarbandMaterials\(/);
    assert.match(engine, /materials: spendableMaterials/);
    assert.doesNotMatch(engine, /materials: this\.loot/);
    assert.match(
      engine,
      /if \(!spawned\) return;[\s\S]*?this\.loot\.components -= SUB_AGENT_MATERIAL_COST\.components;[\s\S]*?this\.loot\.shards -= SUB_AGENT_MATERIAL_COST\.shards;/,
    );
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

test("both renderers credit pending material drops before wave cleanup", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /private completeWave\(\) \{[\s\S]*?this\.loot = creditPendingMaterialLoot\(\s*this\.loot,\s*this\.pickups,\s*\) as LootCounters;\s*this\.clearLootPickups\(\);/,
    );
  }
});

test("both renderers explain why boss caches include autonomous field reserves", () => {
  assert.match(
    game,
    /BOSS_REWARD_RATIONALE[\s\S]*?from "\.\/game\/boss-rules\.mjs"/,
  );
  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /WARBOSS CONTAINED[\s\S]*?BOSS_REWARD_RATIONALE/,
    );
  }
});

test("boss telegraphs stay fixed and resolve strict kind-aware area damage", () => {
  assert.match(
    game,
    /getNearestBossTarget,[\s\S]*?getPendingBossTarget,[\s\S]*?from "\.\/game\/boss-rules\.mjs"/,
  );
  assert.match(game, /pendingTargetX: number \| null/);
  assert.match(game, /pendingTargetZ: number \| null/);
  assert.match(
    webglGame,
    /event\.type === "telegraph"[\s\S]*?position\.set\(event\.x, 0\.04, event\.z\)/,
  );
  assert.match(
    canvasGame,
    /bossState\.pendingTargetX[\s\S]*?bossState\.pendingTargetZ/,
  );
  assert.match(canvasGame, /private traceProjectedRing\([\s\S]*?this\.project\([\s\S]*?Math\.cos\([\s\S]*?Math\.sin/);
  const canvasEnemyDrawing = canvasGame.slice(canvasGame.indexOf("private drawEnemy("));
  assert.doesNotMatch(canvasEnemyDrawing, /context\.arc\(center\.x, center\.y/);
  assert.match(canvasEnemyDrawing, /this\.traceProjectedRing\(targetX, targetZ, bossState\.attackRadius\)/);
  assert.match(canvasEnemyDrawing, /this\.traceProjectedRing\(enemy\.x, enemy\.z, JAMMER_ZONE_RADIUS\)/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /getPendingBossTarget\(result\.boss, bossTargets\)/);
    assert.match(
      engine,
      /getNearestBossTarget\(\s*bossTargets,\s*enemy\.(?:group\.position\.)?x,\s*enemy\.(?:group\.position\.)?z/,
    );
    assert.match(
      engine,
      /bossX: enemy\.(?:group\.position\.)?x[\s\S]*?bossZ: enemy\.(?:group\.position\.)?z/,
    );
  }
});

test("skill HUD distinguishes unavailable agent states", () => {
  assert.match(game, /type AgentSkillAvailability = "ready" \| "disabled" \| "repair" \| "retreat" \| "offline"/);
  assert.match(game, /status: AgentSkillAvailability/);
  assert.match(game, /disabledLeftMs: agent\.disabledLeft \* 1_000/);
  assert.match(game, /skill\.status === "disabled"\s*\?\s*"DISABLED"/);
  assert.match(game, /skill\.status === "repair"\s*\?\s*"REPAIR"/);
  assert.match(game, /skill\.status === "retreat"\s*\?\s*"RETREAT"/);
});

test("both renderers emit pooled visual feedback when a temporary sub-agent spawns", () => {
  for (const engine of [webglGame, canvasGame]) {
    const spawn = engine.slice(
      engine.indexOf("private maybeSpawnTemporarySubAgent("),
      engine.indexOf("private clearTemporarySubAgents("),
    );
    assert.match(
      spawn,
      /if \(!spawned\) return;[\s\S]*?this\.addRing\([\s\S]*?this\.addBurst\(/,
    );
  }
  assert.match(webglGame, /this\.temporarySubAgentPool\.acquire/);
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
    assert.match(engine, /lifetimeRatio/);
  }
  assert.match(webglGame, /this\.temporarySubAgentPool\.clear/);
});

test("Canvas fallback owns the same repair-bay, retreat, and hostile-target contracts as WebGL", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /repairBay/);
    assert.match(engine, /getRepairDecision/);
    assert.match(engine, /tickRepairBay/);
    assert.match(engine, /repairDecision === "repair" \|\| agent\.repairDecision === "retreat"/);
    assert.match(engine, /damageAgent/);
    assert.match(engine, /damageDefense/);
    assert.match(engine, /damageRepairBay/);
    assert.match(engine, /findHostileProjectileHit/);
  }
  assert.match(canvasGame, /private drawRepairBay/);
  assert.match(canvasGame, /this\.drawWorldHealthBar\([\s\S]*?agent\.hp \/ agent\.maxHp/);
  assert.match(canvasGame, /this\.drawWorldHealthBar\([\s\S]*?defense\.hp \/ defense\.maxHp/);
});

test("both field-kit actions explain unaffordable repairs without mutating inventory", () => {
  for (const engine of [webglGame, canvasGame]) {
    const fieldKit = engine.slice(
      engine.indexOf("useFieldKit()"),
      engine.indexOf("setMuted(", engine.indexOf("useFieldKit()")),
    );
    assert.match(
      fieldKit,
      /repaired\.components !== this\.loot\.components/,
    );
    assert.match(fieldKit, /FIELD KIT UNAVAILABLE/);
  }
});

test("destroyed repair bays truthfully remain offline for the mission", () => {
  assert.doesNotMatch(game, /until it is rebuilt/i);
  assert.equal(
    (game.match(/for the rest of this mission/g) ?? []).length,
    2,
  );
});

test("withdrawing agents converge on the repair bay before repair ticks in both renderers", () => {
  for (const engine of [webglGame, canvasGame]) {
    const updateAgents = engine.slice(
      engine.indexOf("private updateAgents(delta: number)"),
      engine.indexOf("private updateDefenses(delta: number)"),
    );
    assert.match(
      updateAgents,
      /const withdrawing\s*=\s*agent\.repairDecision === "repair" \|\| agent\.repairDecision === "retreat"/,
    );
    assert.match(updateAgents, /const radius = withdrawing \|\| gatheringPickup\s*\? 0/);
    assert.match(updateAgents, /atRepairBay[\s\S]*?<= 1\.35/);
  }
});

test("the Core remains protect-only across upgrades, Covenant, support sub-agents, and repair loot", () => {
  for (const engine of [webglGame, canvasGame]) {
    const upgrade = engine.slice(
      engine.indexOf("applyUpgrade(id: UpgradeId)"),
      engine.indexOf("evolveAgent(", engine.indexOf("applyUpgrade(id: UpgradeId)")),
    );
    const subAgents = engine.slice(
      engine.indexOf("private updateTemporarySubAgents"),
      engine.indexOf("private maybeSpawnTemporarySubAgent"),
    );
    const loot = engine.slice(
      engine.indexOf("private updateLootPickups"),
      engine.indexOf("private clearLootPickups"),
    );
    assert.doesNotMatch(upgrade, /this\.core\.(?:hp|maxHp)\s*[+\-*/]?=/);
    assert.doesNotMatch(subAgents, /this\.core\.hp/);
    assert.doesNotMatch(loot, /this\.core\.hp/);
  }
  assert.doesNotMatch(game, /coreHealing|coreNeedsRepair|coreRepair/);
});

test("Forge armor break uses magnitude, skills honor action state, and loot labels use values", () => {
  assert.match(game, /resolveArmoredDamage/);
  assert.match(game, /armorBreakReduction/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /useAgentSkill\(id: EvolutionAgentId\) \{[\s\S]*const actionState = getAgentActionState\(agent\);[\s\S]*if \(!actionState\.canAct\) return;/);
    assert.match(engine, /getLootPresentation\(pickup\.type, pickup\.value\)/);
    assert.match(engine, /armorBreakReduction: 0/);
    assert.match(engine, /armorBreakReduction = effect\.armorReduction/);
  }
  assert.match(game, /available: boolean/);
  assert.match(game, /disabled=\{[\s\S]*!skill\.available/);
  assert.doesNotMatch(game, /<kbd>1–4<\/kbd>[\s\S]*Recruit an AI agent/);
  assert.match(game, /<kbd>1–8<\/kbd>[\s\S]*Recruit an AI agent/);
  assert.match(catalog, /Protocol Shards fund late warband recruits and the one-shard cost of temporary children/);
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

test("both live engines own, tick, fire, and visibly report the shared EMP state", () => {
  assert.match(
    game,
    /EMP_BASE_DAMAGE,[\s\S]*?canFireEmp,[\s\S]*?createEmpState,[\s\S]*?fireEmp,[\s\S]*?getEmpRuntimeProfile,[\s\S]*?tickEmp,[\s\S]*?updateEmpCooldown,[\s\S]*?from "\.\/game\/emp-rules\.mjs"/,
  );
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private empState: EmpState = createEmpState\(\)/);
    assert.match(
      engine,
      /private updateGame\(delta: number\) \{[\s\S]*?this\.empState = tickEmp\(this\.empState, delta \* 1_000\) as EmpState;/,
    );
    assert.match(
      engine,
      /activateEmp\(\) \{[\s\S]*?canFireEmp\(this\.empState\)[\s\S]*?fireEmp\(this\.empState, \{ baseDamage: EMP_BASE_DAMAGE \}\)[\s\S]*?this\.empState = pulse\.state as EmpState;/,
    );
    assert.match(engine, /empCharge: this\.empState\.charge \/ this\.empState\.maxCharge/);
    assert.match(engine, /empCooldownLeftMs: this\.empState\.cooldownLeftMs/);
    assert.match(engine, /empCooldownMs: this\.empState\.cooldownMs/);
    assert.doesNotMatch(engine, /player\.ultimate/);
    assert.doesNotMatch(engine, /this\.agents\.length \* 8/);
    assert.doesNotMatch(engine, /this\.player\.ultimate \+/);
    assert.doesNotMatch(engine, /private empMultiplier|this\.empMultiplier/);
  }
  assert.match(game, /EMP COOLDOWN/);
  assert.match(game, /hud\.empCooldownLeftMs/);
});

test("both renderer agent loops share action ordering across repair, children, and Covenant", () => {
  assert.match(
    game,
    /getAgentActionState,[\s\S]*?from "\.\/game\/repair-rules\.mjs"/,
  );
  for (const engine of [webglGame, canvasGame]) {
    const temporary = engine.slice(
      engine.indexOf("private updateTemporarySubAgents(delta: number)"),
      engine.indexOf("private maybeSpawnTemporarySubAgent("),
    );
    const agents = engine.slice(
      engine.indexOf("private updateAgents(delta: number)"),
      engine.indexOf("private updateDefenses(delta: number)"),
    );
    assert.match(
      temporary,
      /canAct: parentCanAct[\s\S]*?getAgentActionState\([\s\S]*?attackTargetInRange: parentCanAct && Boolean\(attackTarget\)/,
    );
    const actionGate = agents.indexOf("const actionState = getAgentActionState(");
    const spawn = agents.indexOf("this.maybeSpawnTemporarySubAgent(");
    const covenant = agents.indexOf('agent.id === "covenant"');
    assert.ok(actionGate >= 0, "missing shared action gate");
    assert.ok(spawn > actionGate, "child spawn must follow the action gate");
    assert.ok(covenant > actionGate, "Covenant support must follow the action gate");
    assert.match(
      agents,
      /const actionState = getAgentActionState\([\s\S]*?if \(!actionState\.canAct\) return;[\s\S]*?this\.maybeSpawnTemporarySubAgent/,
    );
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

test("intro screen owns a muted autoplay trailer with a reduced-motion fallback", () => {
  const intro = game.slice(game.indexOf('{mode === "intro" && ('), game.indexOf('{mode === "upgrade" && ('));
  assert.match(intro, /className="hero-trailer"/);
  assert.match(intro, /autoPlay/);
  assert.match(intro, /muted/);
  assert.match(intro, /loop/);
  assert.match(intro, /playsInline/);
  assert.match(intro, /poster="\/video\/freeman-protocol-trailer-poster\.jpg"/);
  assert.match(intro, /src="\/video\/freeman-protocol-trailer\.mp4"/);
  assert.match(intro, /mode === "intro"/);
  assert.match(game, /prefers-reduced-motion: reduce/);
  assert.match(game, /hero-trailer/);
});

test("documents the complete warband and EMP discipline catalog", () => {
  for (const label of [
    "EMP Discipline",
    "Eight Warband Slots",
    "Repair Bay",
    "Field Kits",
    "Temporary Children",
    "Skill Portraits",
    "Boss Telegraphs",
    "Rare Loot",
  ]) {
    assert.match(catalog, new RegExp(label));
  }
});

test("catalog copy matches all eight agents and live EMP, repair, and lifetime rules", () => {
  for (const id of ["relay", "scout", "warden", "nova"]) {
    assert.match(catalog, new RegExp(`id: "${id}"`));
  }
  assert.match(catalog, /<dt>08<\/dt><dd>LIVE AGENTS<\/dd>/);
  assert.match(catalog, /name: "Lifetime Matrix"/);
  assert.match(catalog, /quantity: "\+25 HP · \+1 KIT"/);
  assert.match(catalog, /cooldown recovers over time/i);
  assert.match(catalog, /EMP radius/i);
  assert.match(catalog, /rest of the mission/i);
  assert.doesNotMatch(catalog, /visible EMP charge through combat/i);
  assert.doesNotMatch(catalog, /reinforces the Covenant Core/i);
});

test("Repair Cache documents operator and field-kit recovery without restoring the Core", () => {
  const repairCache = catalog.slice(
    catalog.indexOf('id: "repair"'),
    catalog.indexOf('id: "component"'),
  );
  assert.match(repairCache, /type: "OPERATOR \/ FIELD-KIT RECOVERY"/);
  assert.match(repairCache, /operator health/);
  assert.match(repairCache, /field-kit supplies/);
  assert.match(repairCache, /Covenant Core remains protect-only/);
  assert.doesNotMatch(repairCache, /CORE RESTORE|[Rr]estores? (?:a )?(?:damaged )?Covenant Core|[Ss]tabilis(?:es|zes) (?:a )?(?:damaged )?Covenant Core/);
});

test("the player-facing HUD preserves EMP, Core, roster, touch, and pooled-cleanup contracts", () => {
  assert.match(game, /EMP COOLDOWN/);
  assert.match(game, /CORE HEALTH · PROTECT-ONLY/);
  assert.match(game, /WARBAND <b>\{hud\.warbandCount\}\/\{hud\.maxWarband\}<\/b>/);
  assert.match(game, /className=\{`skill-actions mobile-action-tray mobile-panel--skills/);
  assert.match(game, /className=\{`repair-field-kit mobile-action-tray mobile-panel--defend/);

  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private clearLootPickups\(\)/);
    assert.match(engine, /private clearDynamic\(\)[\s\S]*?this\.enemies\.length = 0;/);
  }
  assert.match(webglGame, /private readonly lootPool = new BoundedPool<THREE\.Group>\(48\)/);
  assert.match(webglGame, /this\.lootPool\.release\(/);
});

test("both renderers expose a presentation-only macro camera mode", () => {
  assert.match(game, /setCameraPresentation\(presentation: CameraPresentation\)/);
  assert.match(webglGame, /setCameraPresentation\(presentation: CameraPresentation\)/);
  assert.match(canvasGame, /setCameraPresentation\(presentation: CameraPresentation\)/);
  assert.match(game, /const \[cameraPresentation, setCameraPresentation\] = useState<CameraPresentation>\("macro"\)/);
});

test("desktop starts in macro map presentation", () => {
  assert.match(game, /isMobile \? cameraPresentation : "macro"/);
});

test("both renderers give agents autonomous network management", () => {
  assert.equal((game.match(/runAutonomousNetwork\(delta\)/g) ?? []).length, 2);
  assert.match(game, /chooseAutonomousNetworkAction/);
  assert.match(game, /repairCore\(this\.core, this\.loot\.components\)/);
  assert.match(game, /this\.buildDefense\(\)/);
  assert.equal((game.match(/getUpgradeChoices\(this\.wave, this\.upgradeStacks\)\[0\]/g) ?? []).length, 2);
});

test("both renderers expose a player reserve army and three-second wave break", () => {
  assert.match(game, /WAVE_INTERMISSION_MS/);
  assert.match(game, /tickWaveIntermission/);
  assert.ok((game.match(/deployReserve\(\)/g) ?? []).length >= 4);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /deployReserve\(\)/);
    assert.match(engine, /PLAYER_RESERVE_BATCH_SIZE/);
    assert.match(engine, /spawnTemporarySubAgent/);
  }
  assert.match(game, /DEPLOY TEMP ARMY/);
  assert.match(game, /DEPLOY RESERVE/);
  assert.match(game, /wave-intermission-banner/);
});

test("desktop HUD uses a high-contrast readable hierarchy", () => {
  assert.match(game, /vitals-panel/);
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*\.vitals-panel \{[\s\S]*width:\s*300px/);
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*\.vitals-panel \.vital-row strong[\s\S]*font-size:\s*18px/);
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*\.agent-card__copy strong[\s\S]*font-size:\s*16px/);
});

test("WebGL renderer includes a controlled toon shading pass", () => {
  assert.match(game, /MeshToonMaterial/);
  assert.match(game, /flatShading\s*=\s*true/);
  assert.match(game, /toonGradient/);
  assert.match(game, /applyToonMaterialPass/);
});
test("both renderers expose the shared watch-mode contract", async () => {
  const game = await readFile(
    new URL("../app/FreemanProtocol.tsx", import.meta.url),
    "utf8",
  );
  for (const field of [
    "sessionMode",
    "watchPaused",
    "watchSpeed",
    "watchPriority",
    "survivalMs",
    "sessionIncome",
    "lastAutonomyEvent",
  ]) {
    assert.ok((game.match(new RegExp(field + ":", "g")) ?? []).length >= 3);
  }
  for (const method of [
    "setWatchSpeed",
    "setWatchPriority",
    "endWatchRun",
    "setVisibilityPaused",
  ]) {
    assert.ok((game.match(new RegExp(method + "\\(", "g")) ?? []).length >= 3);
  }
  assert.match(game, /mode: "watch"/);
  assert.match(game, /isWatchMode\(this\.sessionMode\)/);
  assert.match(game, /WATCH_INCOMING_DAMAGE_MULTIPLIER/);
  assert.match(game, /WATCH_INTERMISSION_CORE_REPAIR/);
  assert.match(game, /RECRUITED BY THE NETWORK/);
});
