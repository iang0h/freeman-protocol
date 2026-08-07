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
const page = await readFile(
  new URL("../app/page.tsx", import.meta.url),
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
const combatPresentationRules = await readFile(
  new URL("../app/game/combat-presentation-rules.mjs", import.meta.url),
  "utf8",
).catch(() => "");
const recruitmentAdvisorRules = await readFile(
  new URL("../app/game/recruitment-advisor-rules.mjs", import.meta.url),
  "utf8",
).catch(() => "");
const empRules = await readFile(
  new URL("../app/game/emp-rules.mjs", import.meta.url),
  "utf8",
).catch(() => "");
const watchDirectorRules = await readFile(
  new URL("../app/game/watch-director-rules.mjs", import.meta.url),
  "utf8",
).catch(() => "");
const webglGame = game.slice(
  game.indexOf("class FreemanEngine"),
  game.indexOf("type FlatEnemy"),
);
const canvasGame = game.slice(
  game.indexOf("class FreemanCanvasEngine"),
  game.indexOf("export default function FreemanProtocol"),
);

test("both renderers consume the shared quality, battleground, and snapshot helpers", () => {
  for (const helper of ["quality-rules.mjs", "battleground-rules.mjs", "simulation-view.mjs"]) {
    assert.match(game, new RegExp(`\\.\\/game\\/${helper}`));
  }
  assert.ok((game.match(/createSimulationView\(/g) ?? []).length >= 2);
  assert.match(game, /setCinemaSpeed/);
});

test("both renderers create, assign, and tick late-wave engagement lanes", () => {
  assert.match(game, /from "\.\/game\/enemy-movement-rules\.mjs"/);
  assert.match(game, /createEngagementState/);
  assert.match(game, /assignEngagementLane/);
  assert.match(game, /tickEngagement/);

  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private engagementState(?:\s*:\s*[^=]+)? = createEngagementState\(1\);/);
    assert.match(engine, /this\.engagementState = createEngagementState\(wave\);/);
    assert.match(engine, /assignEngagementLane\(/);
    assert.match(engine, /this\.engagementState = tickEngagement\(/);
  }
});

test("both renderers approach lane staging and reposition even inside Core arrival range", () => {
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /engagement\?\.lastAction === "repath"/);
    assert.match(engine, /const useStagingTarget\s*=\s*[\s\S]*?engagement\.lastAction !== "attack"/);
    assert.match(engine, /const shouldAdvance\s*=\s*[\s\S]*?engagement\?\.repositionLeftMs > 0/);
    assert.match(engine, /target:\s*[\s\S]{0,160}movementTarget/);
  }
});

test("WebGL battleground theme narrows the arena grid before reading its material", () => {
  assert.match(
    webglGame,
    /const grid = this\.scene\.getObjectByName\("arena-grid"\);[\s\S]*?if \(!\(grid instanceof THREE\.LineSegments\)\) return;[\s\S]*?grid\.material/,
  );
});

test("quality monitor state widens the frame counter returned by the shared JS helper", () => {
  assert.match(
    game,
    /type QualityMonitor = \{\s*profile: "low" \| "medium" \| "high";\s*overBudgetFrames: number;\s*\};/,
  );
  assert.equal((game.match(/private qualityMonitor: QualityMonitor = createQualityMonitor\("medium"\);/g) ?? []).length, 2);
});

test("cinema watch and command map controls stay explicit and keyboard reachable", () => {
  for (const label of ["COMMAND MAP", "CINEMA", "PAUSE", "EXIT CINEMA"]) {
    assert.match(game, new RegExp(label));
  }
  assert.match(game, /\[0\.5, 1, 2, 4\]/);
  assert.match(game, /\{speed\}X/);
  assert.match(game, /type CameraPresentation = "macro" \| "tactical" \| "command"/);
  assert.match(game, /event\.code === "KeyC"/);
  assert.match(game, /event\.code === "KeyP"/);
  assert.match(game, /event\.code === "KeyV"/);
  assert.match(styles, /\.command-map-marker[\s\S]*?min-width: 44px/);
  assert.match(styles, /\.game-shell\.is-cinema[\s\S]*?\.watch-panel/);
  assert.match(game, /focusCommandMarker\(id: string\)/);
  assert.ok((game.match(/private getCameraFocusPosition\(\)/g) ?? []).length >= 2);
  assert.ok((game.match(/this\.yaw \+= delta \* 0\.045/g) ?? []).length >= 2);
  assert.match(game, /commandMapFixedIds/);
  assert.match(game, /\.slice\(0, 64\)/);
  assert.match(game, /cinema-status__actions/);
});

test("combat presentation rules stay renderer-independent", () => {
  assert.match(combatPresentationRules, /export const OVERLAYS/);
  assert.match(combatPresentationRules, /export function createOverlayState/);
  assert.match(combatPresentationRules, /export function toggleOverlay/);
  assert.match(combatPresentationRules, /export function getArenaZone/);
  assert.match(combatPresentationRules, /export function classifyCombatFeedback/);
  assert.doesNotMatch(combatPresentationRules, /from\s+["'][^"']*(?:three|FreemanProtocol)/i);
});

test("recruitment advisor rules stay pure and renderer-independent", () => {
  assert.match(recruitmentAdvisorRules, /export function getRecruitmentAdvice/);
  assert.match(recruitmentAdvisorRules, /Object\.freeze/);
  assert.match(recruitmentAdvisorRules, /state: "defend"/);
  assert.match(recruitmentAdvisorRules, /state: "repair"/);
  assert.match(recruitmentAdvisorRules, /state: "recruit"/);
  assert.match(recruitmentAdvisorRules, /state: "save"/);
  assert.doesNotMatch(
    recruitmentAdvisorRules,
    /from\s+["'][^"']*(?:three|FreemanProtocol)/i,
  );
});

test("both renderers expose recruitment advice from authoritative battlefield state", () => {
  assert.match(
    game,
    /import\s+\{\s*getRecruitmentAdvice\s*\}\s+from "\.\/game\/recruitment-advisor-rules\.mjs"/,
  );
  assert.match(game, /type RecruitmentAdvice =/);
  assert.match(game, /recruitmentAdvice: RecruitmentAdvice/);
  assert.ok(
    (game.match(/const recruitmentAdvice = getRecruitmentAdvice\(\{/g) ?? []).length >= 2,
  );
  assert.ok(
    (game.match(/threatCount: breachThreatCount/g) ?? []).length >= 2,
  );
  assert.ok(
    (game.match(/candidates: getRecruitmentCandidates\(/g) ?? []).length >= 2,
  );
  assert.ok((game.match(/recruitmentAdvice,/g) ?? []).length >= 2);
});

test("compact recruitment advisor explains the decision and only recruits through Warband", () => {
  for (const label of [
    "RECRUIT ADVISED",
    "REPAIR FIRST",
    "DEFEND CORE",
    "HOLD COMPUTE",
  ]) {
    assert.match(page, new RegExp(label));
  }

  assert.match(page, /className="recruitment-advisor__reason"/);
  assert.match(page, /recruitmentAdvice\.detail/);
  assert.match(page, /CURRENT/);
  assert.match(page, /COST/);
  assert.match(page, /MISSING/);
  assert.match(page, /RECRUIT NOW/);
  assert.match(page, /WATCH MODE · AI PRIORITY/);
  assert.match(
    page,
    /const advisorAgentId =\s*recruitmentAdvice\?\.state === "recruit"\s*\?\s*recruitmentAdvice\.agentId\s*:\s*null;/,
  );
  assert.doesNotMatch(page, /setAdvisorAgentId|useState<AgentId/);
  assert.match(page, /setAdvisorRequestKey\(\(key\) => key \+ 1\)/);
  assert.doesNotMatch(page, /engineRef|\.recruit\(|repairCore|useFieldKit/);

  assert.match(game, /advisorAgentId === agent\.id \? "is-advised" : ""/);
  assert.match(game, /aria-current=\{advisorAgentId === agent\.id \? "true" : undefined\}/);
  assert.match(game, /toggleCombatOverlay\("warband"\)/);
});

test("warband identity is visual and resource controls are compact", () => {
  assert.match(game, /import AgentPortrait from "\.\/AgentPortrait"/);
  assert.match(game, /className="agent-card__portrait"/);
  assert.match(game, /className="agent-resource-chip"/);
  assert.match(game, /AgentPortrait[\s\S]*?co-op-world__agent-avatar/);
  assert.match(game, /AgentPortrait[\s\S]*?skill-action__portrait/);
  assert.doesNotMatch(
    game,
    /className="agent-card__node"[\s\S]*?\{agent\.code\}/,
  );
  assert.match(page, /import AgentPortrait from "\.\/AgentPortrait"/);
  assert.match(page, /recruitment-advisor__portrait/);
  assert.match(styles, /\.agent-portrait\s*\{/);
  assert.match(styles, /\.agent-resource-chip\s*\{/);
  assert.match(styles, /\.agent-action-icon\s*\{/);
});

test("combat prompts expose one-tap recruit and EMP actions", () => {
  assert.match(game, /recruitPrompt/);
  assert.match(game, /empReadyPrompt/);
  assert.match(game, /role="status"/);
  assert.match(game, /RECRUIT NOW/);
  assert.match(game, /EMP READY/);
  assert.match(game, /aria-label="Dismiss recruit prompt"/);
  assert.match(game, /aria-label="Dismiss EMP ready prompt"/);
  assert.match(game, /sendCoOpAction\(\{ action: "emp" \}\)/);
  assert.match(game, /engineRef\.current\?\.activateEmp\(\)/);
  assert.match(empRules, /export function shouldShowEmpReadyPrompt/);
  assert.match(game, /recruitPrompt\.cost/);
  assert.match(game, /toggleCombatOverlay\("warband"\)/);
  assert.match(game, /state\.players.*emp|localCoOpPlayer\?\.emp/);
  assert.match(game, /intermissionMs === 0|intermissionClock <= 0/);
});

test("co-op prompt dismissal is keyed instead of synchronously reset in effects", () => {
  assert.match(game, /coOpRecruitPromptDismissedKey/);
  assert.match(game, /coOpEmpPromptDismissedState/);
  assert.doesNotMatch(game, /useEffect\(\(\) => \{\s*setCoOpRecruitPromptDismissed\(false\);/);
  assert.doesNotMatch(game, /useEffect\(\(\) => \{\s*if \(!coOpEmpReady\) setCoOpEmpPromptDismissed\(false\);/);
});

test("both renderers mark the shared arena zones and throttle the live zone HUD", () => {
  assert.match(game, /import\s+\{[\s\S]*classifyCombatFeedback,[\s\S]*getArenaZone,[\s\S]*\}\s+from "\.\/game\/combat-presentation-rules\.mjs"/);
  assert.match(webglGame, /private buildArenaZoneMarkers\(\)/);
  assert.match(canvasGame, /private drawArenaZoneMarkers\(\)/);

  for (const label of [
    "CORE CHAMBER",
    "NORTH BREACH",
    "SOUTH BREACH",
    "COMPUTE NODE",
    "REPAIR BAY",
    "BOSS PORTAL",
  ]) {
    assert.match(combatPresentationRules, new RegExp(label));
  }

  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /const zone = getArenaZone\(\{\s*x: this\.player(?:\.group\.position)?\.x,\s*z: this\.player(?:\.group\.position)?\.z,?\s*\}\);\s*this\.currentZone = zone\.shortLabel;/,
    );
    assert.match(engine, /currentZone: this\.currentZone/);
    assert.match(engine, /this\.hudClock = 0\.1;[\s\S]*?this\.emitHud\(\);/);
  }

  assert.match(game, /combat-hud__zone/);
  assert.match(styles, /\.combat-hud__zone/);
});

test("desktop combat HUD keeps the arena clear behind explicit overlays", () => {
  assert.match(page, /useState\(createOverlayState\)/);
  assert.match(page, /toggleOverlay\(overlayState, panel\)/);
  assert.match(game, /combat-hud__status/);
  assert.match(game, />HP</);
  assert.match(game, />CORE</);
  assert.match(game, />WAVE</);
  assert.match(game, /combat-hud__toggles/);
  assert.match(game, /\["intel", "warband", "actions"\]/);
  assert.match(game, /overlayState\.active === "intel"/);
  assert.match(game, /overlayState\.active === "warband"/);
  assert.match(game, /overlayState\.active === "actions"/);
  assert.match(game, /intel-overlay/);
  assert.match(game, /warband-overlay/);
  assert.match(styles, /\.intel-overlay,\s*\.warband-overlay\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.intel-overlay\.is-active,\s*\.warband-overlay\.is-active\s*\{[\s\S]*?display:\s*(?:grid|block|flex)/);
  assert.match(styles, /\.actions-overlay\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.actions-overlay\.is-active\s*\{[\s\S]*?display:\s*(?:grid|block|flex)/);
});

test("campaign overlays keep the pause controller from resuming behind them", () => {
  assert.match(game, /setCombatOverlayOpen\(open: boolean\): void/);
  assert.ok((game.match(/private combatOverlayOpen = false/g) ?? []).length >= 2);
  assert.ok(
    (game.match(/if \(this\.mode === "paused" && this\.combatOverlayOpen && !isWatchMode\(this\.sessionMode\)\) return;/g) ?? []).length >= 2,
  );
  assert.match(game, /overlayPausedCampaignRef/);
  assert.match(game, /engineRef\.current\?\.setCombatOverlayOpen\(true\)/);
  assert.match(game, /engineRef\.current\?\.setCombatOverlayOpen\(false\)/);
});

test("enemy rendering does not allocate a point light per enemy", () => {
  const createEnemy = game.slice(
    game.indexOf("private createEnemy("),
    game.indexOf("private spawnWave("),
  );
  assert.doesNotMatch(createEnemy, /new THREE\.PointLight/);
  assert.match(createEnemy, /createLowPolyWarRobot\(/);
});

test("war threats use readable low-poly robot silhouettes in both renderers", () => {
  assert.match(threeResources, /export function createLowPolyWarRobot/);
  for (const part of [
    "robot-head",
    "robot-leg-left",
    "robot-leg-right",
    "robot-weapon",
  ]) {
    assert.match(threeResources, new RegExp(part));
  }
  assert.match(webglGame, /createLowPolyWarRobot\(/);
  assert.match(webglGame, /robotVisual|robotAnimate|robot\.animate/);
  assert.match(canvasGame, /drawRobotEnemy\(/);
  assert.match(canvasGame, /drawRobotEnemy|robot-head|enemy-robot/);
  assert.match(canvasGame, /robot-virus|robot-antenna|robot-horn|PHISHER/);
  assert.match(threeResources, /reducedMotion/);
  assert.match(webglGame, /this\.reducedMotion\)/);
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

test("both renderers keep targeting and combat feedback readable and bounded", () => {
  assert.match(game, /classifyCombatFeedback/);
  assert.match(game, /const MAX_COMBAT_EFFECTS = \d+/);
  assert.match(game, /const COMBAT_COMBO_WINDOW_SECONDS = [\d.]+/);

  assert.match(webglGame, /private readonly aimReticle: THREE\.Mesh/);
  assert.match(webglGame, /private readonly aimLine: THREE\.Line/);
  assert.match(webglGame, /private updateTargetingPresentation\(\)/);
  assert.match(webglGame, /private addSlashArc\(/);

  assert.match(canvasGame, /private drawTargetingPresentation\(\)/);
  assert.match(canvasGame, /private addSlashArc\(/);

  for (const engine of [webglGame, canvasGame]) {
    assert.match(
      engine,
      /classifyCombatFeedback\(\{\s*kind,\s*damage: appliedDamage,\s*critical,\s*target: "enemy",?\s*\}\)/,
    );
    assert.match(
      engine,
      /classifyCombatFeedback\(\{\s*kind: "core-warning",\s*damage,\s*critical: false,\s*target: "core",?\s*\}\)/,
    );
    assert.match(
      engine,
      /this\.addDamageNumber\([\s\S]*?feedback\.label,[\s\S]*?feedback\.emphasis/,
    );
    assert.match(engine, /private registerCombatCombo\(/);
    assert.match(engine, /COMBAT_COMBO_WINDOW_SECONDS/);
    assert.match(engine, /MAX_COMBAT_EFFECTS/);
    assert.match(engine, /if \(this\.reducedMotion\)/);
  }
});

test("combat flinch stays presentation-only and feedback allocations are pooled", () => {
  const canvasDamageEnemy = canvasGame.slice(
    canvasGame.indexOf("private damageEnemy("),
    canvasGame.indexOf("private removeProjectile("),
  );
  assert.doesNotMatch(canvasDamageEnemy, /enemy\.x\s*\+=/);
  assert.doesNotMatch(canvasDamageEnemy, /enemy\.z\s*\+=/);
  assert.match(canvasDamageEnemy, /enemy\.hitRecoilX\s*=/);
  assert.match(canvasDamageEnemy, /enemy\.hitRecoilZ\s*=/);
  assert.match(canvasGame, /const displayX = enemy\.x \+ enemy\.hitRecoilX/);
  assert.match(canvasGame, /const displayZ = enemy\.z \+ enemy\.hitRecoilZ/);

  assert.match(
    webglGame,
    /private readonly damageNumberPool = new BoundedPool<THREE\.Sprite>\(\d+\)/,
  );
  assert.match(webglGame, /this\.damageNumberPool\.acquire\(/);
  assert.match(webglGame, /this\.damageNumberPool\.release\(/);
  const webglDamageNumber = webglGame.slice(
    webglGame.indexOf("private addDamageNumber("),
    webglGame.indexOf("private async attachOperatorRig("),
  );
  assert.doesNotMatch(webglDamageNumber, /document\.createElement\("canvas"\)/);

  assert.match(
    canvasGame,
    /private readonly burstEffectPool = new BoundedPool<FlatEffect>\(\d+\)/,
  );
  assert.match(canvasGame, /this\.burstEffectPool\.acquire\(/);
  assert.match(canvasGame, /this\.burstEffectPool\.release\(/);
  const canvasBurst = canvasGame.slice(
    canvasGame.indexOf("private addBurst("),
    canvasGame.indexOf("private addSlashArc("),
  );
  assert.doesNotMatch(canvasBurst, /const particles: FlatParticle\[\] = \[\]/);
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
  assert.match(audioManager, /\.load\(\)/);
  assert.match(audioManager, /canplay/);
  assert.match(audioManager, /getSettings\(\): AudioSettingsSnapshot/);
  assert.match(audioManager, /subscribe\(listener: \(settings: AudioSettingsSnapshot\) => void\)/);
  assert.match(audioManager, /startMusic\(\)/);
  assert.match(audioManager, /"blocked"/);
  assert.match(game, /engine\.enableAudio\(\)/);
  assert.match(
    game,
    /if \(audioSettings\.muted \|\| audioSettings\.playback === "blocked"\) \{\s*engine\.enableAudio\(\);/,
  );
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
  assert.match(game, /disabled=\{recruited \|\| \(coOpActive \? !coOpCanAct \|\| !affordable : !canRecruitWarband\)\}/);
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

test("both renderers schedule recurring autonomous sub-agent bursts without edge-trigger stalls", () => {
  assert.match(game, /SUB_AGENT_GLOBAL_CAP/);
  assert.match(game, /SUB_AGENT_SPAWN_COOLDOWN_MS/);
  assert.match(game, /getSubAgentSpawnDecision/);
  assert.match(game, /tickSubAgentSpawnState/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private subAgentSpawnState/);
    assert.match(engine, /tickSubAgentSpawnState\(/);
    assert.match(engine, /getSubAgentSpawnDecision\(/);
    assert.match(engine, /activeChildren:[\s\S]*?totalActive:/);
    assert.match(engine, /cooldownLeftMs: spawnState\.cooldownLeftMs/);
    assert.match(engine, /cooldownLeftMs: SUB_AGENT_SPAWN_COOLDOWN_MS/);
    assert.doesNotMatch(engine, /if \(previous === "improvise"\) return/);
    assert.match(engine, /this\.maybeSpawnTemporarySubAgent\(agent, roleIntent, delta \* 1_000\)/);
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
    assert.match(engine, /shouldWithdrawToRepairBay/);
    assert.match(engine, /tickRepairBay/);
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
      /const withdrawing\s*=\s*shouldWithdrawToRepairBay\(\s*agent\.repairDecision,\s*repairBay,\s*\)/,
    );
    assert.match(updateAgents, /const radius = withdrawing \|\| gatheringPickup\s*\? 0/);
    assert.match(updateAgents, /atRepairBay[\s\S]*?<= 1\.35/);
    assert.match(updateAgents, /getAgentActionState\([\s\S]*?\}, \{ repairBay \}\)/);
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
    assert.match(engine, /useAgentSkill\(id: EvolutionAgentId\) \{[\s\S]*const actionState = getAgentActionState\(agent,[\s\S]*?if \(!actionState\.canAct\) return;/);
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
    assert.match(engine, /resolveEnemyAdvance\(/);
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

test("both renderers use the convergence watchdog and keep assault agents inside boss attack radius", () => {
  assert.match(game, /createMovementWatchdogState[\s\S]*resolveEnemyAdvance/);
  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /movementWatchdog/);
    assert.match(engine, /resolveEnemyAdvance\(/);
    assert.match(
      engine,
      /const assaultRadius = Math\.max\(2\.6, agent\.range \* 0\.46\);[\s\S]*?Math\.min\(assaultRadius, bossRadius\)/,
    );
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
  assert.match(game, /WARBAND <b>\{displayWarbandCount\}\/\{coOpActive \? coOpWarbandLimit : hud\.maxWarband\}<\/b>/);
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
  assert.match(game, /isMobile \|\| cameraPresentation === "command" \? cameraPresentation : "macro"/);
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

test("Watch Mode activity defaults to a compact accessible disclosure", () => {
  const watchPanel = game.slice(
    game.indexOf('<aside className="watch-panel"'),
    game.indexOf("{hud.boss &&"),
  );

  assert.match(
    game,
    /const \[watchActivityExpanded, setWatchActivityExpanded\] = useState\(false\)/,
  );
  assert.match(watchPanel, /aria-expanded=\{watchActivityExpanded\}/);
  assert.match(watchPanel, /aria-controls="watch-activity-log"/);
  assert.match(watchPanel, /id="watch-activity-log"/);
  assert.match(
    watchPanel,
    /watchActivityExpanded\s*\?\s*\(\s*<ol>[\s\S]*hud\.autonomyLog\.slice\(0, 4\)/,
  );
  assert.match(
    watchPanel,
    /hud\.autonomyLog\[0\]\s*\?\?\s*hud\.lastAutonomyEvent/,
  );
  assert.match(
    game,
    /hud\.sessionMode !== "watch"[\s\S]*setWatchActivityExpanded\(false\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 820px\)[\s\S]*\.watch-panel__activity-toggle\s*\{[\s\S]*min-height:\s*44px/,
  );
});

test("both renderers use the watch director to keep autonomous runs moving", () => {
  assert.match(watchDirectorRules, /export function tickWatchDirector/);
  assert.match(game, /watch-director-rules\.mjs/);

  for (const engine of [webglGame, canvasGame]) {
    assert.match(engine, /private watchDirectorState = createWatchDirectorState\(\)/);
    assert.match(engine, /tickWatchDirector\(/);
    assert.match(engine, /WATCH DIRECTOR/);
    assert.match(engine, /intent\.reset/);
  }
});

test("watch mode pilots the player in both renderers", () => {
  assert.equal((game.match(/private updateWatchOperator\(delta: number\)/g) ?? []).length, 2);
  assert.equal((game.match(/this\.updateWatchOperator\(delta\)/g) ?? []).length, 2);
  assert.equal((game.match(/this\.attack\(\)/g) ?? []).length >= 2, true);
});

test("watch recovery is rate-limited and creates a real escape window", () => {
  assert.equal((game.match(/watchRecoveryClock/g) ?? []).length >= 8, true);
  assert.equal((game.match(/WATCH RECOVERY PULSE/g) ?? []).length >= 2, true);
  assert.equal((game.match(/enemy\.slow = Math\.max/g) ?? []).length >= 2, true);
});
