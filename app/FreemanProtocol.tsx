"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  canCompleteWave,
  getActiveEnemyLimit,
  releaseSpawnBatch,
  resolveArmoredDamage,
  remainingThreats,
} from "./game/combat-rules.mjs";
import {
  classifyCombatFeedback,
  getCommandMapMarkers,
  getArenaZone,
} from "./game/combat-presentation-rules.mjs";
import {
  createQualityMonitor,
  getQualitySettings,
  selectQualityPreset,
  tickQualityMonitor,
} from "./game/quality-rules.mjs";
import { getBattlegroundForWave } from "./game/battleground-rules.mjs";
import { createSimulationView } from "./game/simulation-view.mjs";
import {
  createCinemaState,
  setCinemaSpeed as setCinemaPresentationSpeed,
  tickCinemaState,
  toggleCinemaCleanView,
  toggleCinemaPaused,
} from "./game/cinema-rules.mjs";
import {
  EMP_BASE_DAMAGE,
  canFireEmp,
  createEmpState,
  fireEmp,
  getEmpRuntimeProfile,
  shouldShowEmpReadyPrompt,
  tickEmp,
  updateEmpCooldown,
} from "./game/emp-rules.mjs";
import { selectAutoSentryPosition } from "./game/sentry-placement.mjs";
import {
  AGENT_COMPONENT_UPGRADES,
  EVOLUTIONS,
  PLAYER_ARMORS,
  applyUpgradeStack,
  getUpgradeDraft,
  purchaseComponentUpgrade,
  purchaseEvolution,
} from "./game/progression.mjs";
import {
  WARBAND_SLOTS,
  advanceWarbandWorkshopMode,
  canRecruitPersistentWarband,
  canRecruitWarbandSlot,
  collectMaterials,
  getRecruitCost,
  getSpendableWarbandMaterials,
  getWarbandStrength,
  recruitWarbandSlot,
  tickAgentGathering,
} from "./game/warband-rules.mjs";
import {
  applyUnitDamage,
  findHostileProjectileHit,
  getAgentActionState,
  getRepairDecision,
  repairTurret,
  shouldWithdrawToRepairBay,
  tickRepairBay,
  resolveAgentDamage,
} from "./game/repair-rules.mjs";
import {
  AGENT_SKILLS,
  canUseSkill,
  getSlowMovementMultiplier,
  useSkill as activateAgentSkill,
} from "./game/skill-rules.mjs";
import {
  BOSS_REWARD_RATIONALE,
  getBossArmorMultiplier,
  getBossEncounter,
  getNearestBossTarget,
  getPendingBossTarget,
  tickBoss,
} from "./game/boss-rules.mjs";
import { normalizeStickInput, tapToFire } from "./game/input-rules.mjs";
import {
  applyLootPickup,
  canCollectLoot,
  creditPendingMaterialLoot,
  getLootPresentation,
  rollLootDrop,
} from "./game/loot-rules.mjs";
import {
  SUB_AGENT_GLOBAL_CAP,
  SUB_AGENT_MATERIAL_COST,
  SUB_AGENT_SPAWN_COOLDOWN_MS,
  PLAYER_RESERVE_BATCH_SIZE,
  clearSubAgents,
  createSubAgentSpawnState,
  decideAgentIntent,
  getSubAgentSpawnDecision,
  spawnTemporarySubAgent,
  tickSubAgentSpawnState,
  tickTemporarySubAgent,
} from "./game/autonomy-rules.mjs";
import { WAVE_INTERMISSION_MS, tickWaveIntermission } from "./game/wave-rules.mjs";
import {
  AUTONOMOUS_ACTION_INTERVAL_MS,
  CORE_REPAIR_AMOUNT,
  CORE_REPAIR_COMPONENT_COST,
  chooseAutonomousNetworkAction,
  repairCore,
} from "./game/autonomous-network-rules.mjs";
import {
  JAMMER_ZONE_RADIUS,
  getEffectiveResistanceFlags,
  getMaxEmpResistancePercent,
  getPhisherDecoyOffsets,
  getRootkitRebootUpdates,
  getTerrainModifier,
  getWaveModifiers,
  resolveEmpDamage,
} from "./game/encounter-rules.mjs";
import {
  createMovementWatchdogState,
  resolveEnemyAdvance,
} from "./game/enemy-movement-rules.mjs";
import {
  FIRST_WAVE,
  OBSERVE_BREACH,
  advanceTutorial,
  canPerformTutorialAction,
  canRetryFirstWave,
  isTutorialProtected,
} from "./game/tutorial-rules.mjs";
import { readStoredNumber, readStoredValue, writeStoredValue } from "./game/storage.mjs";
import { SpatialGrid } from "./game/spatial-grid";
import {
  BoundedPool,
  LOW_POLY_ROBOT_GEOMETRIES,
  createLowPolyWarRobot,
  createLootPickupMesh,
  createTemporarySubAgentMarker,
  disposeObject3D,
  resetLootPickupMesh,
  resetTemporarySubAgentMarker,
  updateTemporarySubAgentHealthCue,
} from "./game/three-resources";
import { AudioManager, type AudioSettingsSnapshot } from "./game/AudioManager";
import {
  createWatchState,
  creditWatchWaveReward,
  isWatchMode,
  pauseForVisibility,
  recordWatchEvent,
  setWatchPriority,
  setWatchSpeed,
  tickWatchState,
  WATCH_INCOMING_DAMAGE_MULTIPLIER,
  WATCH_INTERMISSION_CORE_REPAIR,
  WATCH_STARTER_SENTRY_COUNT,
  WATCH_COMPONENT_SALVAGE_PER_WAVE,
  WATCH_STARTER_AGENT_COUNT,
} from "./game/watch-mode-rules.mjs";
import { getRecruitmentAdvice } from "./game/recruitment-advisor-rules.mjs";
import { shouldShowRecruitPrompt } from "./game/recruitment-advisor-rules.mjs";
import {
  createWatchDirectorState,
  tickWatchDirector,
} from "./game/watch-director-rules.mjs";
import AgentPortrait from "./AgentPortrait";
import { getAgentVisual } from "./game/agent-presentation-rules.mjs";

type GameMode =
  "intro" | "playing" | "upgrade" | "evolution" | "paused" | "defeat" | "victory";
type SessionMode = "campaign" | "watch";
type CombatOverlay = "intel" | "warband" | "actions";
type OverlayState = { active: "closed" | CombatOverlay };

export type AgentId =
  | "kairos" | "kira" | "forge" | "covenant"
  | "relay" | "scout" | "warden" | "nova";
type EvolutionAgentId = "kairos" | "kira" | "forge" | "covenant";
type AgentSkillId =
  | "time-fracture"
  | "mark-execution"
  | "armor-break-burst"
  | "repair-barrier";
type AgentSkillAvailability = "ready" | "disabled" | "repair" | "retreat" | "offline";
type SquadCommand = "auto" | "follow" | "defend" | "focus";
type MobilePanel = "command" | "defend" | "skills";
type CameraPresentation = "macro" | "tactical" | "command";
type QualityMonitor = {
  profile: "low" | "medium" | "high";
  overBudgetFrames: number;
};
type RigAnimation = "idle" | "run" | "attack" | "hit" | "death" | "cheer";
type CombatFeedbackEmphasis = "standard" | "strong" | "urgent";
type UpgradeId =
  "overclock" | "bastion" | "bandwidth" | "voltage" | "repair" | "command";
type EnemyType = "virus" | "phisher" | "trojan" | "rootkit";
type ResistanceFlag = "shield" | "decoy" | "armor" | "jammer";
type EvolutionId =
  | "cryo-mesh" | "stasis-lock"
  | "execution-protocol" | "rail-pierce"
  | "cluster-burst" | "suppression-loop"
  | "aegis-relay" | "nanite-repair";
type PlayerArmorId = "vanguard" | "striker" | "relay";
type UpgradeStacks = Record<UpgradeId, number>;
type Evolutions = Record<EvolutionAgentId, EvolutionId | null>;
type ComponentUpgradeRanks = Record<string, number>;
type ArmorBonuses = {
  maxHealth?: number;
  damageMultiplier?: number;
  cooldownMultiplier?: number;
  empRadiusMultiplier?: number;
  healingMultiplier?: number;
};
type EmpState = {
  charge: number;
  maxCharge: number;
  cooldownLeftMs: number;
  cooldownMs: number;
};
type TutorialStep =
  | "move" | "shoot" | "recruit"
  | "observe" | "complete" | "skipped";
type TutorialEvent =
  | "movement-complete" | "training-cleared" | "kairos-recruited"
  | "breach-cleared";
type AutonomyRole = "assault" | "support" | "defend";
type AutonomyIntent = AutonomyRole | "improvise" | "follow";
type StartOptions = { tutorial: boolean; mode?: SessionMode };
type LootType = "repair" | "component" | "upgrade-shard";
type LootRecord = {
  id: string;
  type: LootType;
  x: number;
  y: number;
  value: number;
  radius?: number;
};
type LootCounters = { repairs: number; components: number; shards: number };
type BossState = {
  id: string;
  kind: string;
  label: string;
  wave: number;
  scheduled: boolean;
  count: number;
  maxActive: number;
  hp: number;
  maxHp: number;
  armored: boolean;
  armorReduction: number;
  movementSpeed: number;
  attackIntervalMs: number;
  attacksPerSecond: number;
  attackCooldownLeftMs: number;
  telegraphMs: number;
  telegraphLeftMs: number;
  attackDamage: number;
  attackRadius: number;
  pendingTargetId: string | number | null;
  pendingTargetKind: "agent" | "turret" | null;
  pendingTargetX: number | null;
  pendingTargetZ: number | null;
  attackCount: number;
  reinforcementCap: number;
  reinforcementsSpawned: number;
  reinforcementTriggered: boolean;
  rewards: { compute: number; components: number; shards: number };
  rewardQuantity: number;
  rewardClaimed: boolean;
};
type AgentSkillEffect = {
  type:
    | "time-fracture"
    | "mark"
    | "damage"
    | "armor-break"
    | "suppressive-burst"
    | "repair"
    | "barrier";
  targetId: string | number;
  radius: number;
  durationMs: number;
  damageMultiplier: number;
  amount: number;
  executes: boolean;
  armorReduction: number;
  slowMs: number;
  slowMultiplier: number;
  damage: number;
};
type AgentSkillHud = {
  id: AgentSkillId;
  label: string;
  cooldownMs: number;
  cooldownLeftMs: number;
  available: boolean;
  status: AgentSkillAvailability;
};

type RecruitmentResources = {
  compute: number;
  components: number;
  shards: number;
};

export type RecruitmentAdvice = {
  state: "recruit" | "repair" | "defend" | "save";
  eyebrow: string;
  title: string;
  detail: string;
  role: string | null;
  agentId: AgentId | null;
  action: "recruit" | "repair" | "defend" | "save";
  cost: Readonly<RecruitmentResources> | null;
  missing: Readonly<RecruitmentResources> | null;
};

export type RecruitmentAdvisorViewState = {
  recruitmentAdvice: RecruitmentAdvice;
  resources: RecruitmentResources;
  sessionMode: SessionMode;
  watchPriority: "survive" | "farm" | "expand";
};

export type CoOpCombatSnapshot = {
  snapshotId: number;
  serverTick: number;
  state: {
    core: { health: number; maxHealth: number };
    resources: { compute: number; components: number; shards: number; repairKits: number };
    players: Array<{
      id: string | null;
      name: string | null;
      connected: boolean;
      operator: {
        health: number;
        maxHealth: number;
        x: number;
        y: number;
        aimX: number;
        aimY: number;
      };
      emp: {
        charge: number;
        maxCharge: number;
        cooldownLeftMs: number;
        cooldownMs: number;
      };
    }>;
    enemies: Array<{ id: string; kind: string; health: number; maxHealth: number; x: number; y: number }>;
    loot: Array<{ id: string; type: string; value: number; x: number; y: number }>;
    sentries: Array<{ id: string; health: number; maxHealth: number; x: number; y: number }>;
    warband: {
      agents: string[];
      maxAgents: number;
      priority: "follow" | "guard" | "focus";
    };
    wave: { number: number; status: "waiting" | "playing" | "intermission" | "ended"; elapsedMs: number };
    boss: { id: string; kind: string; health: number; maxHealth: number; x: number; y: number } | null;
    subAgents: Array<{ id: string; parentId: string; role: string; remainingMs: number }>;
  };
};

export type CoOpAction = {
  action: "shoot" | "emp" | "repair" | "recruit" | "build-sentry" | "deploy-reserve";
  agentId?: string;
  targetId?: string;
};

type CoOpInputClient = {
  sendInput: (input: { moveX: number; moveY: number; aimX: number; aimY: number }) => boolean;
  sendPriority: (priority: "follow" | "guard" | "focus") => boolean;
};

type FirstWaveCheckpoint = {
  data: number;
  score: number;
  agents: AgentId[];
  defenses: Array<{ x: number; z: number }>;
  command: SquadCommand;
  empState: EmpState;
  loot: LootCounters;
  repairBayHp: number;
};

const TOTAL_WAVES = 8;
const ARENA_RADIUS = 17.5;
const SPAWN_RADIUS = 15.2;
const TUTORIAL_STORAGE_KEY = "freeman-tutorial-complete";
const MAX_TEMPORARY_SUB_AGENTS_PER_PARENT = 4;
const TOUCH_SAFE_PICKUP_RADIUS = 0.75;
const MAX_COMBAT_EFFECTS = 96;
const MAX_COMBAT_COMBO = 99;
const COMBAT_COMBO_WINDOW_SECONDS = 1.4;

const getRuntimeQualityHints = () => {
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const deviceMemory = typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory) || 4
    : 4;
  const hardwareConcurrency = typeof navigator !== "undefined"
    ? Number(navigator.hardwareConcurrency) || 4
    : 4;
  return { touch, deviceMemory, hardwareConcurrency };
};
const ARENA_ZONE_MARKERS = [
  { x: 0, z: 0, radius: 2.2, color: 0xf08a4b, kind: "core" },
  { x: 0, z: -4.75, radius: 1.35, color: 0xe17a57, kind: "breach" },
  { x: 0, z: 4.75, radius: 1.35, color: 0x6fa9bb, kind: "breach" },
  { x: 3.1, z: 1.15, radius: 1.5, color: 0x8cc5d0, kind: "landmark" },
  { x: -3.1, z: 1.15, radius: 1.5, color: 0x74c8bd, kind: "landmark" },
  { x: 0, z: -6.45, radius: 1.75, color: 0xd45b58, kind: "portal" },
] as const;

const combatFeedbackColor = (emphasis: CombatFeedbackEmphasis) =>
  emphasis === "urgent"
    ? 0xff6f61
    : emphasis === "strong"
      ? 0xffd166
      : 0xffbc8d;

const AUTONOMY_ROLES: Record<AgentId, AutonomyRole> = {
  kairos: "defend",
  kira: "assault",
  forge: "assault",
  covenant: "support",
  relay: "support",
  scout: "assault",
  warden: "defend",
  nova: "assault",
};

type HudState = {
  sessionMode: SessionMode;
  watchPaused: boolean;
  watchSpeed: number;
  watchPriority: "survive" | "farm" | "expand";
  cinemaPaused: boolean;
  cinemaSpeed: number;
  cinemaCleanView: boolean;
  battlegroundId: string;
  qualityPreset: "low" | "medium" | "high";
  commandMap: Array<{
    id: string;
    kind: string;
    label: string;
    x: number;
    z: number;
    status: string;
    priority: number;
  }>;
  survivalMs: number;
  sessionIncome: { compute: number; components: number; shards: number };
  lastAutonomyEvent: string;
  autonomyLog: string[];
  hp: number;
  maxHp: number;
  core: number;
  maxCore: number;
  data: number;
  wave: number;
  intermissionMs: number;
  enemies: number;
  score: number;
  best: number;
  dash: number;
  empCharge: number;
  empCooldownLeftMs: number;
  empCooldownMs: number;
  empReadyPrompt: boolean;
  defenses: number;
  maxDefenses: number;
  defenseCost: number;
  placingDefense: boolean;
  threat: string;
  currentZone: string;
  command: SquadCommand;
  agents: Record<AgentId, boolean>;
  warbandCount: number;
  maxWarband: number;
  nextRecruitCost: { compute: number; components: number; shards: number } | null;
  upgradeStacks: UpgradeStacks;
  evolutions: Evolutions;
  armorId: PlayerArmorId | null;
  armorBonuses: ArmorBonuses;
  componentUpgradeRanks: ComponentUpgradeRanks;
  temporarySubAgents: number;
  terrainLabel: string;
  empResistance: number;
  tutorialStep: TutorialStep | null;
  canRetryWave: boolean;
  loot: LootCounters;
  recruitmentAdvice: RecruitmentAdvice;
  recruitPrompt: RecruitmentAdvice | null;
  skills: Record<EvolutionAgentId, AgentSkillHud>;
  boss: {
    label: string;
    hp: number;
    maxHp: number;
    telegraphLeftMs: number;
  } | null;
};

type ToastState = {
  id: number;
  eyebrow: string;
  title: string;
  detail: string;
};

const INITIAL_AUDIO_SETTINGS: AudioSettingsSnapshot = {
  muted: false,
  musicVolume: 0.42,
  sfxVolume: 0.72,
  playback: "idle",
};

type GameCallbacks = {
  onMode: (mode: GameMode) => void;
  onHud: (hud: HudState) => void;
  onToast: (toast: Omit<ToastState, "id">) => void;
  onTutorialComplete(): void;
};

interface GameController {
  start(options?: StartOptions): void;
  setCoOpPresentation(enabled: boolean): void;
  setWatchSpeed(speed: number): void;
  setWatchPriority(priority: "survive" | "farm" | "expand"): void;
  setCinemaSpeed(speed: number): void;
  toggleCinemaPause(): void;
  toggleCinemaCleanView(): void;
  focusCommandMarker(id: string): void;
  endWatchRun(): void;
  setVisibilityPaused(hidden: boolean): void;
  skipTutorial(): void;
  retryWave(): void;
  getAudioSettings(): AudioSettingsSnapshot;
  enableAudio(): void;
  setMuted(muted: boolean): void;
  setMusicVolume(value: number): void;
  setSfxVolume(value: number): void;
  setCombatOverlayOpen(open: boolean): void;
  togglePause(): void;
  recruit(id: AgentId): void;
  useAgentSkill(id: EvolutionAgentId): void;
  buildDefense(): void;
  deployReserve(): void;
  beginManualDefensePlacement(): void;
  setSquadCommand(command: SquadCommand): void;
  useFieldKit(): void;
  attack(): void;
  melee(): void;
  dash(): void;
  activateEmp(): void;
  dismissRecruitPrompt(): void;
  dismissEmpPrompt(): void;
  applyUpgrade(id: UpgradeId): void;
  purchaseComponentUpgrade(target: "player" | AgentId, upgradeId: string): void;
  evolveAgent(agentId: EvolutionAgentId, evolutionId: EvolutionId): void;
  continueWithoutEvolution(): void;
  rotateCamera(direction: -1 | 1): void;
  zoomCamera(direction: -1 | 1): void;
  resetCamera(): void;
  setTouchMovement(x: number, y: number): void;
  setCameraPresentation(presentation: CameraPresentation): void;
  dispose(): void;
}

type AgentDefinition = {
  id: AgentId;
  code: string;
  name: string;
  role: string;
  detail: string;
  cost: number;
  color: number;
  damage: number;
  cooldown: number;
  range: number;
  armorProfile?: { id: string; damageMultiplier: number };
  strength?: number;
};

type AgentRuntime = AgentDefinition & {
  group: THREE.Group;
  healthBar: THREE.Group;
  healthFill: THREE.Mesh;
  hp: number;
  maxHp: number;
  repairDecision: "fight" | "retreat" | "repair" | "return";
  cooldownLeft: number;
  supportClock: number;
  disabledLeft: number;
  rig: AnimatedRig | null;
  moving: boolean;
  gatheringCooldownMs: number;
  gatheringTargetId: string | null;
  skillCooldownLeftMs: number;
  barrier: number;
  barrierLeft: number;
};

type TemporarySubAgent = {
  id: string;
  parentId: AgentId;
  role: AutonomyRole;
  remainingMs: number;
  maxLifetimeMs: number;
  cooldownLeftMs: number;
  healthRatio: number;
  lifetimeRatio: number;
  canSpawn: false;
};

type TemporarySubAgentAction =
  | { type: "attack"; damage: number }
  | {
      type: "repair";
      playerHealing: number;
      allyCooldownReductionMs: number;
    }
  | { type: "guard"; damage: number; slowMs: number }
  | { type: "idle" };

type WebglTemporarySubAgent = TemporarySubAgent & {
  marker: THREE.Group;
};

type DefenseRuntime = {
  group: THREE.Group;
  turret: THREE.Group;
  healthBar: THREE.Group;
  healthFill: THREE.Mesh;
  hp: number;
  maxHp: number;
  cooldownLeft: number;
  index: number;
  barrier: number;
  barrierLeft: number;
};

type EnemyMovementWatchdog = {
  targetId: string | number | null;
  lastDistance: number | null;
  stalledMs: number;
};

type EnemyRuntime = {
  id: number;
  type: EnemyType;
  group: THREE.Group;
  body: THREE.Mesh;
  healthBar: THREE.Group;
  healthFill: THREE.Mesh;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  attackCooldown: number;
  cooldownLeft: number;
  telegraphLeft: number;
  telegraphTotal: number;
  reward: number;
  radius: number;
  slow: number;
  slowMultiplier: number;
  bossPhase: number;
  hitFlash: number;
  tutorial: boolean;
  resistanceFlags: ResistanceFlag[];
  decoyOwnerId: number | null;
  decoyLeft: number;
  markedLeft: number;
  markMultiplier: number;
  armorBrokenLeft: number;
  armorBreakReduction: number;
  bossState: BossState | null;
  bossVisual: THREE.Group | null;
  movementWatchdog: EnemyMovementWatchdog;
  robotAnimate: (elapsed: number, delta: number, moving?: boolean, reducedMotion?: boolean) => void;
};

type ProjectileRuntime = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
  faction: "operator" | "agent" | "null";
  slow: number;
};

type EffectRuntime = {
  object: THREE.Object3D;
  life: number;
  maxLife: number;
  kind: "ring" | "beam" | "burst" | "portal" | "text" | "slash";
};

type LootRuntime = LootRecord & { mesh: THREE.Group };

type AnimatedRig = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<RigAnimation, THREE.AnimationAction>>;
  current: RigAnimation | null;
  lockedFor: number;
};

const AGENTS: AgentDefinition[] = [
  {
    id: "kairos",
    code: "01",
    name: "KAIROS",
    role: "Slows enemies",
    detail: "Slows nearby enemies so you have more time to attack.",
    cost: 45,
    color: 0xd9793f,
    damage: 13,
    cooldown: 1.05,
    range: 8,
  },
  {
    id: "kira",
    code: "02",
    name: "KIRA",
    role: "Heavy damage",
    detail: "Fires powerful long-range shots at the strongest enemy.",
    cost: 75,
    color: 0x9ebfc0,
    damage: 31,
    cooldown: 1.4,
    range: 10,
  },
  {
    id: "forge",
    code: "03",
    name: "FORGE",
    role: "Rapid fire",
    detail: "Fires quickly to clear groups of weaker enemies.",
    cost: 105,
    color: 0xe4b66d,
    damage: 12,
    cooldown: 0.5,
    range: 7,
  },
  {
    id: "covenant",
    code: "04",
    name: "COVENANT",
    role: "Heals and protects",
    detail: "Repairs your health and keeps the Core alive.",
    cost: 135,
    color: 0xd7d5ca,
    damage: 9,
    cooldown: 1.8,
    range: 7,
  },
  {
    id: "relay",
    code: "05",
    name: "RELAY",
    role: "Resource support",
    detail: "Secures nearby Components and Protocol Shards when the perimeter is clear.",
    cost: 175,
    color: 0x76c6c1,
    damage: 10,
    cooldown: 0.75,
    range: 7,
  },
  {
    id: "scout",
    code: "06",
    name: "SCOUT",
    role: "Fast assault",
    detail: "Flanks exposed threats and recovers materials between engagements.",
    cost: 225,
    color: 0xb6dd72,
    damage: 18,
    cooldown: 0.7,
    range: 8,
  },
  {
    id: "warden",
    code: "07",
    name: "WARDEN",
    role: "Core defender",
    detail: "Holds the Core perimeter and gathers only when no threat is close.",
    cost: 285,
    color: 0xa9a0e8,
    damage: 22,
    cooldown: 1.15,
    range: 8,
  },
  {
    id: "nova",
    code: "08",
    name: "NOVA",
    role: "Boss assault",
    detail: "Pressures priority threats and converts safe windows into material recovery.",
    cost: 355,
    color: 0xf0719b,
    damage: 30,
    cooldown: 1.3,
    range: 10,
  },
];

const UPGRADES: Array<{
  id: UpgradeId;
  index: string;
  name: string;
  detail: string;
  outcome: string;
}> = [
  {
    id: "overclock",
    index: "A",
    name: "POWER SHOTS",
    detail: "Make every shot hit harder.",
    outcome: "+35% shot damage",
  },
  {
    id: "bastion",
    index: "B",
    name: "STRONGER DEFENSE",
    detail: "Increase your maximum health without restoring the Core.",
    outcome: "+25 maximum health",
  },
  {
    id: "bandwidth",
    index: "C",
    name: "FASTER AI TEAM",
    detail: "Recruit sooner and make every agent fire faster.",
    outcome: "+70 Compute and 18% faster agents",
  },
  {
    id: "voltage",
    index: "D",
    name: "EMP DISCIPLINE",
    detail: "Improve pulse recovery first, then bypass part of hostile resistance.",
    outcome: "FASTER COOLDOWN · THEN +25% RESISTANCE BYPASS",
  },
  {
    id: "repair",
    index: "E",
    name: "FIELD REPAIR",
    detail: "Repair damage without increasing maximum health.",
    outcome: "+25 operator health",
  },
  {
    id: "command",
    index: "F",
    name: "SQUAD COMMAND",
    detail: "Improve the damage of every recruited AI agent.",
    outcome: "+30% agent damage",
  },
];

const makeEncounter = (
  viruses: number,
  phishers: number,
  trojans: number,
  rootkits = 0,
): EnemyType[] => [
  ...Array.from({ length: rootkits }, (): EnemyType => "rootkit"),
  ...Array.from({ length: viruses }, (): EnemyType => "virus"),
  ...Array.from({ length: phishers }, (): EnemyType => "phisher"),
  ...Array.from({ length: trojans }, (): EnemyType => "trojan"),
];

const ENCOUNTERS: EnemyType[][] = [
  makeEncounter(12, 2, 0),
  makeEncounter(16, 3, 1),
  makeEncounter(20, 4, 2),
  makeEncounter(22, 5, 3),
  makeEncounter(26, 6, 4),
  makeEncounter(28, 7, 5),
  makeEncounter(32, 8, 6),
  makeEncounter(22, 6, 4, 1),
];

const getUpgradeChoices = (wave: number, stacks: UpgradeStacks) => {
  return getUpgradeDraft(wave, stacks)
    .map(({ id, category }: { id: string; category: string }) => {
      const upgrade = UPGRADES.find(
        (item) => item.id === (id as UpgradeId),
      );
      return upgrade ? { ...upgrade, category } : null;
    })
    .filter((upgrade): upgrade is NonNullable<typeof upgrade> => Boolean(upgrade));
};

const EVOLUTION_COPY: Record<EvolutionId, string> = {
  "cryo-mesh": "Slow the target and chain frost to two nearby threats.",
  "stasis-lock": "Repeated hits lock targets in stasis.",
  "execution-protocol": "Deal 35% more damage to weakened targets.",
  "rail-pierce": "Heavy rounds pierce through additional targets.",
  "cluster-burst": "Shots burst for 45% damage around the impact.",
  "suppression-loop": "Repeated fire accelerates and disrupts attackers.",
  "aegis-relay": "Periodically reinforce the operator.",
  "nanite-repair": "Stronger repairs also clear agent disable time.",
};

const EMPTY_UPGRADE_STACKS: UpgradeStacks = {
  overclock: 0, bastion: 0, bandwidth: 0,
  voltage: 0, repair: 0, command: 0,
};
const EMPTY_EVOLUTIONS: Evolutions = {
  kairos: null, kira: null, forge: null, covenant: null,
};
const EMPTY_COMPONENT_UPGRADE_RANKS: ComponentUpgradeRanks = {};
const getAgentSkillAvailability = (
  agent: Pick<AgentRuntime, "hp" | "disabledLeft" | "repairDecision"> | null,
  repairBay?: { hp: number; maxHp: number; isSeparate: boolean; repairPerSecond?: number },
): AgentSkillAvailability => {
  if (!agent) return "offline";
  if (agent.disabledLeft > 0 || agent.hp <= 0) return "disabled";
  if (
    agent.repairDecision === "repair" &&
    shouldWithdrawToRepairBay("repair", repairBay)
  ) return "repair";
  if (
    agent.repairDecision === "retreat" &&
    shouldWithdrawToRepairBay("retreat", repairBay)
  ) return "retreat";
  return "ready";
};
const createInitialSkillHud = (): Record<EvolutionAgentId, AgentSkillHud> => ({
  kairos: { ...AGENT_SKILLS.kairos, cooldownLeftMs: 0, available: false, status: "offline" },
  kira: { ...AGENT_SKILLS.kira, cooldownLeftMs: 0, available: false, status: "offline" },
  forge: { ...AGENT_SKILLS.forge, cooldownLeftMs: 0, available: false, status: "offline" },
  covenant: { ...AGENT_SKILLS.covenant, cooldownLeftMs: 0, available: false, status: "offline" },
});
const getRecruitmentCandidates = (
  activeAgents: number,
  need: AutonomyRole | null,
) => {
  const candidate = WARBAND_SLOTS[activeAgents];
  const cost = getRecruitCost(candidate);
  if (!candidate || !cost) return [];
  return [{
    id: candidate.id,
    role: candidate.role,
    cost,
    matchesThreat: candidate.role === need,
  }];
};
const getRecruitmentNeed = ({
  coreHp,
  coreMaxHp,
  operatorHp,
  operatorMaxHp,
  breachThreatCount,
  activeThreatCount,
}: {
  coreHp: number;
  coreMaxHp: number;
  operatorHp: number;
  operatorMaxHp: number;
  breachThreatCount: number;
  activeThreatCount: number;
}): AutonomyRole | null => {
  if (breachThreatCount > 0 || coreHp / Math.max(1, coreMaxHp) <= 0.7) {
    return "defend";
  }
  if (operatorHp / Math.max(1, operatorMaxHp) <= 0.65) return "support";
  return activeThreatCount > 0 ? "assault" : null;
};
const formatRecruitmentCost = (cost: Readonly<RecruitmentResources> | null) =>
  cost
    ? `${Math.round(cost.compute)}C · ${Math.round(cost.components)} COMP · ${Math.round(cost.shards)} SHARDS`
    : "NO COST DATA";
const getArmorBonuses = (armorId: PlayerArmorId | null): ArmorBonuses =>
  armorId ? PLAYER_ARMORS[armorId].bonuses : {};
const getComponentRank = (
  ranks: ComponentUpgradeRanks,
  target: "player" | AgentId,
  upgradeId: string,
) => ranks[`${target}:${upgradeId}`] ?? 0;
const getAgentUpgradeMultiplier = (
  agentId: AgentId,
  upgradeId: string,
  bonus: "cooldownMultiplier" | "damageMultiplier" | "healingMultiplier",
) => {
  const upgrade = AGENT_COMPONENT_UPGRADES[agentId]?.find(
    (candidate: { id: string }) => candidate.id === upgradeId,
  );
  const value = (upgrade?.bonuses as Record<string, number> | undefined)?.[bonus];
  return typeof value === "number" ? value : 1;
};
const ARMOR_COPY: Record<PlayerArmorId, string> = {
  vanguard: "+35 max health · +15% incoming repairs",
  striker: "+20% weapon damage · 15% faster fire",
  relay: "+25% EMP radius · +25% incoming repairs",
};
const COMPONENT_COPY: Record<string, string> = {
  "stasis-array": "12% faster attacks per rank",
  "hunter-core": "+22% damage per rank",
  "breach-ammo": "+16% damage and 10% faster attacks per rank",
  "nanite-reserve": "+30% healing per rank",
  "sub-agent-lifetime": "+5 seconds temporary-unit lifetime per rank",
};
const UPGRADE_CATEGORY_LABELS: Record<string, string> = {
  player: "PLAYER DRAFT",
  agent: "AGENT DRAFT",
  defense: "DEFENSE DRAFT",
};

const INITIAL_HUD: HudState = {
  sessionMode: "campaign",
  watchPaused: false,
  watchSpeed: 1,
  watchPriority: "survive",
  cinemaPaused: false,
  cinemaSpeed: 1,
  cinemaCleanView: false,
  battlegroundId: "clear-grid",
  qualityPreset: "medium",
  commandMap: [],
  survivalMs: 0,
  sessionIncome: { compute: 0, components: 0, shards: 0 },
  lastAutonomyEvent: "NETWORK STANDING BY",
  autonomyLog: ["NETWORK STANDING BY"],
  hp: 100,
  maxHp: 100,
  core: 180,
  maxCore: 180,
  data: 55,
  wave: 1,
  intermissionMs: 0,
  enemies: 0,
  score: 0,
  best: 0,
  dash: 1,
  empCharge: 1,
  empCooldownLeftMs: 0,
  empCooldownMs: 16_000,
  empReadyPrompt: false,
  defenses: 0,
  maxDefenses: 3,
  defenseCost: 80,
  placingDefense: false,
  threat: "LOW",
  currentZone: "EAST",
  command: "follow",
  agents: {
    kairos: false,
    kira: false,
    forge: false,
    covenant: false,
    relay: false,
    scout: false,
    warden: false,
    nova: false,
  },
  warbandCount: 0,
  maxWarband: WARBAND_SLOTS.length,
  nextRecruitCost: getRecruitCost(WARBAND_SLOTS[0]),
  upgradeStacks: { ...EMPTY_UPGRADE_STACKS },
  evolutions: { ...EMPTY_EVOLUTIONS },
  armorId: null,
  armorBonuses: {},
  componentUpgradeRanks: { ...EMPTY_COMPONENT_UPGRADE_RANKS },
  temporarySubAgents: 0,
  terrainLabel: "CLEAR GRID",
  empResistance: 0,
  tutorialStep: null,
  canRetryWave: false,
  loot: { repairs: 0, components: 0, shards: 0 },
  recruitmentAdvice: getRecruitmentAdvice({
    coreHp: 180,
    coreMaxHp: 180,
    operatorHp: 100,
    operatorMaxHp: 100,
    threatCount: 0,
    activeAgents: 0,
    maxAgents: WARBAND_SLOTS.length,
    compute: 55,
    components: 0,
    shards: 0,
    candidates: [],
  }) as RecruitmentAdvice,
  recruitPrompt: null,
  skills: createInitialSkillHud(),
  boss: null,
};

const TUTORIAL_COPY: Record<
  Exclude<TutorialStep, "complete" | "skipped">,
  { title: string; detail: string; target: string }
> = {
  move: {
    title: "THE CORE IS YOUR WIN CONDITION",
    detail: "Stay near the ring and use the macro map to see every breach.",
    target: "move",
  },
  shoot: {
    title: "AGENTS FIGHT AUTOMATICALLY",
    detail: "Clear the training threats, then let your AI army hold the perimeter.",
    target: "attack",
  },
  recruit: {
    title: "RECRUIT YOUR FIRST AGENT",
    detail: "Spend Compute to add a specialist. Agents gather materials between fights.",
    target: "agents",
  },
  observe: {
    title: "AGENTS GATHER MATERIALS",
    detail: "Repair offline agents, build sentries, and upgrade between waves.",
    target: "arena",
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const toonGradient = (() => {
  const data = new Uint8Array([
    42, 42, 42, 255,
    132, 132, 132, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

function persistWatchRewards(reward: { compute?: number; components?: number; shards?: number }) {
  let saved: { compute?: number; components?: number; shards?: number } = {};
  try {
    saved = JSON.parse(readStoredValue("freeman-watch-rewards") ?? "{}");
  } catch {}
  writeStoredValue(
    "freeman-watch-rewards",
    JSON.stringify({
      compute: Math.max(0, Number(saved.compute) || 0) + Math.max(0, Number(reward.compute) || 0),
      components: Math.max(0, Number(saved.components) || 0) + Math.max(0, Number(reward.components) || 0),
      shards: Math.max(0, Number(saved.shards) || 0) + Math.max(0, Number(reward.shards) || 0),
    }),
  );
}

function createBossTelegraphVisual() {
  const group = new THREE.Group();
  group.name = "pooled-boss-telegraph";
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xd94b35,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  fill.name = "boss-telegraph-fill";
  fill.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff8a68,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.name = "boss-telegraph-ring";
  ring.rotation.x = -Math.PI / 2;
  group.add(fill, ring);
  resetBossTelegraphVisual(group);
  return group;
}

function resetBossTelegraphVisual(group: THREE.Group) {
  group.visible = false;
  group.position.set(0, 0.04, 0);
  group.rotation.set(0, 0, 0);
  group.scale.setScalar(1);
  group.userData.targetId = null;
  group.removeFromParent();
}

// Kept as a compact fallback reference while the streamed manager rolls out.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: OscillatorNode | null = null;
  private muted = false;

  unlock() {
    if (!this.context) {
      const AudioContextConstructor =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextConstructor) return;
      this.context = new AudioContextConstructor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.34;
      this.master.connect(this.context.destination);
      this.startAmbient();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.34,
        this.context.currentTime,
        0.03,
      );
    }
  }

  private startAmbient() {
    if (!this.context || !this.master || this.ambient) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 43;
    filter.type = "lowpass";
    filter.frequency.value = 115;
    gain.gain.value = 0.018;
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    this.ambient = oscillator;
  }

  private tone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    delay = 0,
  ) {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private noise(duration: number, volume: number, cutoff: number) {
    if (!this.context || !this.master || this.muted) return;
    const sampleCount = Math.max(
      1,
      Math.floor(this.context.sampleRate * duration),
    );
    const buffer = this.context.createBuffer(
      1,
      sampleCount,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      this.context.currentTime + duration,
    );
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  play(
    cue:
      | "attack"
      | "hit"
      | "kill"
      | "dash"
      | "recruit"
      | "wave"
      | "damage"
      | "ultimate"
      | "victory"
      | "defeat",
  ) {
    if (!this.context) return;
    if (cue === "attack") {
      this.tone(380, 145, 0.075, 0.055, "square");
      this.noise(0.055, 0.032, 2400);
    }
    if (cue === "hit") {
      this.tone(145, 72, 0.12, 0.07, "triangle");
      this.noise(0.09, 0.04, 1200);
    }
    if (cue === "kill") {
      this.tone(430, 720, 0.16, 0.065, "sine");
      this.noise(0.14, 0.045, 1700);
    }
    if (cue === "dash") this.tone(190, 660, 0.18, 0.06, "sawtooth");
    if (cue === "damage") {
      this.tone(95, 48, 0.24, 0.1, "square");
      this.noise(0.18, 0.07, 800);
    }
    if (cue === "wave") {
      this.tone(120, 240, 0.34, 0.07, "sawtooth");
      this.tone(180, 360, 0.3, 0.05, "triangle", 0.12);
    }
    if (cue === "recruit") {
      this.tone(220, 440, 0.2, 0.06, "sine");
      this.tone(330, 660, 0.22, 0.055, "sine", 0.1);
      this.tone(440, 880, 0.24, 0.05, "sine", 0.2);
    }
    if (cue === "ultimate") {
      this.tone(70, 880, 0.65, 0.12, "sawtooth");
      this.tone(140, 70, 0.72, 0.08, "square");
    }
    if (cue === "victory") {
      this.tone(220, 440, 0.4, 0.07, "triangle");
      this.tone(330, 660, 0.45, 0.06, "triangle", 0.16);
      this.tone(440, 880, 0.55, 0.055, "triangle", 0.32);
    }
    if (cue === "defeat") {
      this.tone(150, 42, 0.9, 0.1, "sawtooth");
    }
  }

  dispose() {
    this.ambient?.stop();
    this.ambient = null;
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}

class FreemanEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: GameCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(
    -10,
    10,
    7,
    -7,
    0.1,
    120,
  );
  private readonly clock = new THREE.Clock();
  private readonly gltfLoader = new GLTFLoader();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly audio = new AudioManager();
  private readonly keys = new Set<string>();
  private readonly enemies: EnemyRuntime[] = [];
  private readonly agents: AgentRuntime[] = [];
  private autonomyState: Partial<Record<AgentId, AutonomyIntent>> = {};
  private subAgentSpawnState: Partial<Record<AgentId, { cooldownLeftMs: number }>> = {};
  private autonomousActionClock = AUTONOMOUS_ACTION_INTERVAL_MS;
  private temporarySubAgents: WebglTemporarySubAgent[] = [];
  private readonly defenses: DefenseRuntime[] = [];
  private readonly projectiles: ProjectileRuntime[] = [];
  private readonly effects: EffectRuntime[] = [];
  private readonly enemyGrid = new SpatialGrid<EnemyRuntime>(3);
  private readonly disposedResources = new WeakSet<object>();
  private readonly projectilePool = new BoundedPool<THREE.Mesh>(128);
  private readonly damageNumberPool = new BoundedPool<THREE.Sprite>(32);
  private readonly lootPool = new BoundedPool<THREE.Group>(48);
  private readonly temporarySubAgentPool = new BoundedPool<THREE.Group>(32);
  private readonly bossTelegraphPool = new BoundedPool<THREE.Group>(2);
  private readonly pickups: LootRuntime[] = [];
  private loot: LootCounters = { repairs: 0, components: 0, shards: 0 };
  private readonly aimPoint = new THREE.Vector3(0, 0, -4);
  private readonly aimReticle: THREE.Mesh;
  private readonly aimLine: THREE.Line;
  private readonly lastMove = new THREE.Vector3(0, 0, -1);
  private readonly touchMove = new THREE.Vector2();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly desiredCameraTarget = new THREE.Vector3();
  private cameraPresentation: CameraPresentation = "tactical";
  private cameraFocusId: string | null = null;
  private readonly cinemaTarget = new THREE.Vector3();
  private hasCinemaTarget = false;
  private cinemaHoldClock = 0;
  private qualityMonitor: QualityMonitor = createQualityMonitor("medium");
  private qualityPreset: "low" | "medium" | "high" = "medium";
  private battleground = getBattlegroundForWave(1);
  private readonly player: {
    group: THREE.Group;
    weapon: THREE.Group;
    healthBar: THREE.Group;
    healthFill: THREE.Mesh;
    hp: number;
    maxHp: number;
    damage: number;
    attackCooldown: number;
    meleeCooldown: number;
    dashCooldown: number;
    invulnerable: number;
    rig: AnimatedRig | null;
  };
  private readonly core: {
    group: THREE.Group;
    crystal: THREE.Mesh;
    shield: THREE.Mesh;
    healthBar: THREE.Group;
    healthFill: THREE.Mesh;
    hp: number;
    maxHp: number;
  };
  private readonly repairBay: {
    group: THREE.Group;
    healthBar: THREE.Group;
    healthFill: THREE.Mesh;
    hp: number;
    maxHp: number;
  };
  private resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private mode: GameMode = "intro";
  private sessionMode: SessionMode = "campaign";
  private coOpPresentation = false;
  private combatOverlayOpen = false;
  private watchState = createWatchState();
  private cinemaState = createCinemaState();
  private watchDirectorState = createWatchDirectorState();
  private watchRecoveryClock = 0;
  private wave = 1;
  private waveActive = false;
  private waveEndClock = 0;
  private intermissionClock = 0;
  private score = 0;
  private best = 0;
  private data = 55;
  private enemySequence = 0;
  private yaw = Math.PI / 4;
  private zoom = 1;
  private dragPointer: number | null = null;
  private dragX = 0;
  private attackMultiplier = 1;
  private agentRateMultiplier = 1;
  private agentDamageMultiplier = 1;
  private empState: EmpState = createEmpState();
  private previousRecruitmentAdvice: RecruitmentAdvice | null = null;
  private dismissedRecruitAgentId: AgentId | null = null;
  private recruitPrompt: RecruitmentAdvice | null = null;
  private previousEmpReady = false;
  private dismissedEmpPrompt = false;
  private empReadyPrompt = false;
  private playerAttackCooldownMultiplier = 1;
  private upgradeStacks: UpgradeStacks = { ...EMPTY_UPGRADE_STACKS };
  private evolutions: Evolutions = { ...EMPTY_EVOLUTIONS };
  private armorId: PlayerArmorId | null = null;
  private componentUpgradeRanks: ComponentUpgradeRanks = {
    ...EMPTY_COMPONENT_UPGRADE_RANKS,
  };
  private shake = 0;
  private elapsed = 0;
  private hudClock = 0;
  private reinforcementClock = 0;
  private reinforcementsRemaining = 0;
  private spawnQueue: EnemyType[] = [];
  private nextQueueReleaseAt = 0;
  private scheduledReinforcementThreats = 0;
  private readonly activeEnemyLimit = getActiveEnemyLimit("webgl");
  private reducedMotion = false;
  private contextLost = false;
  private hasPointerAim = false;
  private touchAimActive = false;
  private touchMovePointer: number | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private squadCommand: SquadCommand = "auto";
  private placementActive = false;
  private placementGhost: THREE.Group | null = null;
  private playerMoving = false;
  private hitStop = 0;
  private combatCombo = 0;
  private combatComboLife = 0;
  private tutorialStep: TutorialStep | null = null;
  private tutorialMoveDistance = 0;
  private tutorialKills = 0;
  private tutorialResolved = false;
  private firstWaveCheckpoint: FirstWaveCheckpoint | null = null;
  private tutorialMarker: THREE.Group | null = null;
  private encounterModifiers = getWaveModifiers(1);
  private terrain = getTerrainModifier(1);
  private currentZone = "EAST";
  private terrainOverlay: THREE.Group | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.resetInput = this.resetInput.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.qualityPreset = selectQualityPreset(getRuntimeQualityHints());
    this.qualityMonitor = createQualityMonitor(this.qualityPreset);
    this.best = readStoredNumber("freeman-protocol-best");

    const graphicsContext = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!graphicsContext) throw new Error("WEBGL_UNAVAILABLE");

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: graphicsContext,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, getQualitySettings(this.qualityPreset).pixelRatioCap),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x091015);
    this.scene.fog = new THREE.FogExp2(0x091015, 0.018);

    this.buildWorld();
    this.applyBattlegroundTheme();
    this.core = this.buildCore();
    this.repairBay = this.buildRepairBay();
    this.player = this.buildOperator();
    const targetingPresentation = this.buildTargetingPresentation();
    this.aimReticle = targetingPresentation.reticle;
    this.aimLine = targetingPresentation.line;
    void this.attachOperatorRig();
    this.applyToonMaterialPass();
    this.bindEvents();
    this.canvas.addEventListener("webglcontextlost", this.onWebglContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.onWebglContextRestored, false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    this.emitHud(true);
    this.animate();
  }

  private applyToonMaterialPass() {
    this.toonifyObject(this.scene);
  }

  private toonifyObject(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const converted = materials.map((material) => {
        if (
          !(material instanceof THREE.MeshStandardMaterial) ||
          material.userData.keepStandard === true
        ) return material;
        const toonMaterial = new THREE.MeshToonMaterial({
          color: material.color,
          map: material.map,
          transparent: material.transparent,
          opacity: material.opacity,
          alphaTest: material.alphaTest,
          side: material.side,
          depthWrite: material.depthWrite,
          gradientMap: toonGradient,
        });
        (toonMaterial as THREE.MeshToonMaterial & { flatShading: boolean }).flatShading = true;
        toonMaterial.needsUpdate = true;
        return toonMaterial;
      });
      object.material = Array.isArray(object.material) ? converted : converted[0];
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  start(options: StartOptions = { tutorial: false, mode: "campaign" }) {
    this.resetInput();
    this.audio.startMusic();
    this.sessionMode = options.mode ?? "campaign";
    this.watchState = createWatchState();
    this.cinemaState = createCinemaState();
    this.watchDirectorState = createWatchDirectorState();
    this.cameraPresentation = "macro";
    this.hasCinemaTarget = false;
    this.cinemaHoldClock = 0;
    this.resetMissionState();
    if (options.tutorial) {
      this.tutorialStep = "move";
      this.createTutorialMarker();
      this.mode = "playing";
      this.callbacks.onMode("playing");
      this.emitHud(true);
      return;
    }
    this.resolveTutorial("skipped");
  }

  setCoOpPresentation(enabled: boolean) {
    this.coOpPresentation = enabled;
    this.resetInput();
  }

  setWatchSpeed(speed: number) {
    this.watchState = setWatchSpeed(this.watchState, speed);
    this.emitHud(true);
  }

  setCinemaSpeed(speed: number) {
    this.cinemaState = setCinemaPresentationSpeed(this.cinemaState, speed);
    this.emitHud(true);
  }

  toggleCinemaPause() {
    this.cinemaState = toggleCinemaPaused(this.cinemaState);
    this.emitHud(true);
  }

  toggleCinemaCleanView() {
    const wasClean = this.cinemaState.cleanView;
    this.cinemaState = toggleCinemaCleanView(this.cinemaState);
    if (wasClean) this.cinemaHoldClock = 0.8;
    else this.hasCinemaTarget = false;
    this.emitHud(true);
  }

  focusCommandMarker(id: string) {
    this.cameraFocusId = id || null;
    this.cameraPresentation = "command";
    this.resize();
    this.emitHud(true);
  }

  setWatchPriority(priority: "survive" | "farm" | "expand") {
    this.watchState = setWatchPriority(this.watchState, priority);
    this.emitHud(true);
  }

  endWatchRun() {
    if (!isWatchMode(this.sessionMode)) return;
    persistWatchRewards(this.watchState.sessionIncome);
    this.resetInput();
    this.sessionMode = "campaign";
    this.mode = "intro";
    this.callbacks.onMode("intro");
    this.emitHud(true);
  }

  setVisibilityPaused(hidden: boolean) {
    if (!isWatchMode(this.sessionMode)) return;
    this.watchState = pauseForVisibility(this.watchState, hidden);
    if (!hidden) this.watchState = { ...this.watchState, paused: false };
    if (hidden) this.resetInput();
    this.emitHud(true);
  }

  skipTutorial() {
    if (!this.tutorialStep || this.tutorialResolved) return;
    this.resolveTutorial("skipped");
  }

  private resetMissionState() {
    this.clearDynamic();
    this.loot = { repairs: 0, components: 0, shards: 0 };
    this.clearTutorialMarker();
    this.wave = 1;
    this.battleground = getBattlegroundForWave(this.wave);
    this.applyBattlegroundTheme();
    this.score = 0;
    this.data = 55;
    this.attackMultiplier = 1;
    this.agentRateMultiplier = 1;
    this.agentDamageMultiplier = 1;
    this.empState = createEmpState();
    this.previousRecruitmentAdvice = null;
    this.dismissedRecruitAgentId = null;
    this.recruitPrompt = null;
    this.previousEmpReady = false;
    this.dismissedEmpPrompt = false;
    this.empReadyPrompt = false;
    this.watchDirectorState = createWatchDirectorState();
    this.cameraFocusId = null;
    this.playerAttackCooldownMultiplier = 1;
    this.upgradeStacks = { ...EMPTY_UPGRADE_STACKS };
    this.evolutions = { ...EMPTY_EVOLUTIONS };
    this.armorId = null;
    this.componentUpgradeRanks = { ...EMPTY_COMPONENT_UPGRADE_RANKS };
    this.squadCommand = "auto";
    this.firstWaveCheckpoint = null;
    this.tutorialStep = null;
    this.tutorialMoveDistance = 0;
    this.tutorialKills = 0;
    this.tutorialResolved = false;
    this.cancelDefensePlacement(false);
    this.hitStop = 0;
    this.combatCombo = 0;
    this.combatComboLife = 0;
    this.watchRecoveryClock = 0;
    this.reinforcementClock = 0;
    this.reinforcementsRemaining = 0;
    this.spawnQueue = [];
    this.nextQueueReleaseAt = 0;
    this.scheduledReinforcementThreats = 0;
    this.player.hp = this.player.maxHp = 100;
    this.player.damage = 25;
    this.player.attackCooldown = 0;
    this.player.meleeCooldown = 0;
    this.player.dashCooldown = 0;
    this.player.invulnerable = 0;
    this.player.group.position.set(0, 0, 2.7);
    this.player.group.visible = true;
    this.playRig(this.player.rig, "idle");
    this.core.hp = this.core.maxHp = 180;
    this.repairBay.hp = this.repairBay.maxHp = 70;
  }

  private emitTutorialEvent(event: TutorialEvent) {
    if (!this.tutorialStep || this.tutorialResolved) return;
    const next = advanceTutorial(this.tutorialStep, event) as TutorialStep;
    if (next === this.tutorialStep) return;
    this.tutorialStep = next;
    this.applyTutorialTransition(next);
    this.emitHud(true);
  }

  private applyTutorialTransition(next: TutorialStep) {
    if (next === "shoot") {
      this.clearTutorialMarker();
      this.spawnTutorialTraining();
    }
    if (next === "recruit") this.data = Math.max(this.data, AGENTS[0].cost);
    if (next === "observe") this.spawnTutorialBreach();
    if (next === "complete") {
      this.resolveTutorial("complete");
    }
  }

  private resolveTutorial(result: "complete" | "skipped") {
    if (this.tutorialResolved) return;
    this.resetInput();
    this.tutorialResolved = true;
    this.clearTutorialMarker();
    this.clearTutorialThreats();
    this.tutorialStep = result;
    this.callbacks.onTutorialComplete();
    this.captureFirstWaveCheckpoint();
    this.mode = "playing";
    this.callbacks.onMode("playing");
    if (isWatchMode(this.sessionMode)) {
      for (const agentId of ["kairos", "kira", "forge", "covenant"].slice(0, WATCH_STARTER_AGENT_COUNT) as AgentId[]) {
        this.addAgent(agentId, { charge: false, notify: false });
      }
      this.recordWatchEvent("AI NETWORK DEPLOYED FOUR STARTER AGENTS");
    }
    this.spawnWave(1);
    if (isWatchMode(this.sessionMode)) {
      for (let index = 0; index < WATCH_STARTER_SENTRY_COUNT; index += 1) {
        this.buildDefense({ free: true });
      }
    }
    this.audio.play("wave");
    this.emitHud(true);
  }

  buildDefense(options: { free?: boolean } = {}) {
    if (this.mode !== "playing") return;
    if (this.placementActive) this.cancelDefensePlacement(false);
    const selected = selectAutoSentryPosition(
      this.defenses.map((defense) => ({
        x: defense.group.position.x,
        z: defense.group.position.z,
      })),
      [
        { x: this.player.group.position.x, z: this.player.group.position.z, radius: 0.8 },
        { x: this.core.group.position.x, z: this.core.group.position.z, radius: 1.5 },
        ...this.enemies.map((enemy) => ({
          x: enemy.group.position.x,
          z: enemy.group.position.z,
          radius: enemy.radius,
        })),
      ],
    );
    if (!selected) {
      this.callbacks.onToast({
        eyebrow: "NO VALID SENTRY POSITION",
        title: "THE DEFENSE GRID IS BLOCKED",
        detail: "Clear nearby threats or use manual placement.",
      });
      return;
    }
    this.placeDefenseAt(
      new THREE.Vector3(selected.x, 0.08, selected.z),
      !options.free,
      !options.free,
    );
  }

  beginManualDefensePlacement() {
    if (this.mode !== "playing") return;
    if (this.placementActive) {
      this.cancelDefensePlacement();
      return;
    }
    if (this.defenses.length >= 3) {
      this.callbacks.onToast({
        eyebrow: "BASE AT FULL POWER",
        title: "ALL THREE SENTRIES ARE ONLINE",
        detail: "Spend Compute on AI agents or save it for the next wave.",
      });
      return;
    }
    const cost = 80 + this.defenses.length * 35;
    if (this.data < cost) {
      this.callbacks.onToast({
        eyebrow: "NOT ENOUGH COMPUTE",
        title: `YOU NEED ${cost - this.data} MORE`,
        detail: "Destroy enemies to earn Compute, then build the sentry.",
      });
      return;
    }
    this.placementActive = true;
    this.placementGhost = this.createDefenseModel(this.defenses.length);
    this.placementGhost.name = "sentry-placement-ghost";
    this.placementGhost.position.copy(this.aimPoint).setY(0.08);
    this.placementGhost.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = Array.isArray(object.material)
        ? object.material
        : [object.material];
      object.material = source.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = 0.46;
        clone.depthWrite = false;
        return clone;
      });
    });
    this.scene.add(this.placementGhost);
    this.updateDefenseGhost();
    this.callbacks.onToast({
      eyebrow: "SENTRY PLACEMENT",
      title: "CHOOSE A POSITION",
      detail:
        "Tap the arena inside the marked defense zone. Tap the base button again to cancel.",
    });
    this.emitHud(true);
  }

  deployReserve() {
    if (this.mode !== "playing") return;
    const parent = this.agents[0];
    if (!parent) {
      this.callbacks.onToast({
        eyebrow: "RESERVE UNAVAILABLE",
        title: "RECRUIT AN AGENT FIRST",
        detail: "Your first AI agent leads temporary reserve units into battle.",
      });
      return;
    }
    let deployed = 0;
    for (let index = 0; index < PLAYER_RESERVE_BATCH_SIZE; index += 1) {
      const materials = { components: this.loot.components, shards: this.loot.shards };
      const spawned = spawnTemporarySubAgent(
        { id: parent.id, role: AUTONOMY_ROLES[parent.id] },
        {
          enemyDensity: Math.max(6, this.enemies.length),
          playerHealthRatio: this.player.hp / this.player.maxHp,
          coreHealthRatio: this.core.hp / this.core.maxHp,
          wavePressure: 1,
          subAgents: this.temporarySubAgents,
          maxSubAgents: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT,
          materials,
          upgrades: { componentUpgradeRanks: this.componentUpgradeRanks },
        },
      );
      if (!spawned) break;
      this.loot.components = materials.components;
      this.loot.shards = materials.shards;
      const marker = this.temporarySubAgentPool.acquire(() =>
        createTemporarySubAgentMarker(parent.color),
      );
      resetTemporarySubAgentMarker(marker, parent.color, 1);
      this.scene.add(marker);
      this.temporarySubAgents.push({
        ...spawned,
        canSpawn: false as const,
        marker,
        maxLifetimeMs: spawned.remainingMs,
        cooldownLeftMs: 350,
        healthRatio: 1,
        lifetimeRatio: 1,
      });
      deployed += 1;
    }
    if (deployed > 0) {
      this.callbacks.onToast({
        eyebrow: "RESERVE ARMY DEPLOYED",
        title: `${deployed} TEMPORARY UNITS ONLINE`,
        detail: "Your reserve force will swarm nearby threats for a limited time.",
      });
      this.emitHud(true);
    } else {
      this.callbacks.onToast({
        eyebrow: "RESERVE UNAVAILABLE",
        title: "GATHER MORE COMPONENTS AND SHARDS",
        detail: "Agents can collect materials for the next reserve deployment.",
      });
    }
  }

  setSquadCommand(command: SquadCommand) {
    if (this.squadCommand === command) return;
    this.squadCommand = command;
    const copy: Record<SquadCommand, { title: string; detail: string }> = {
      auto: {
        title: "AUTONOMOUS NETWORK ONLINE",
        detail: "Agents choose their own role priorities and improvise together.",
      },
      follow: {
        title: "SQUAD FOLLOWING YOU",
        detail: "Agents stay close and attack enemies around your position.",
      },
      defend: {
        title: "SQUAD GUARDING THE CORE",
        detail: "Agents hold the base and stop enemies that reach the center.",
      },
      focus: {
        title: "SQUAD FOCUSING PRIORITY TARGETS",
        detail: "Agents hunt the boss or the strongest enemy on the field.",
      },
    };
    this.callbacks.onToast({
      eyebrow: "SQUAD ORDER UPDATED",
      ...copy[command],
    });
    this.emitHud(true);
  }

  useFieldKit() {
    if (this.mode !== "playing") return;
    const damagedAgent = [...this.agents]
      .filter((agent) => agent.hp < agent.maxHp)
      .sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp)[0];
    if (damagedAgent && this.loot.repairs > 0) {
      damagedAgent.hp = Math.min(damagedAgent.maxHp, damagedAgent.hp + 28);
      this.loot.repairs -= 1;
      this.callbacks.onToast({
        eyebrow: "FIELD KIT DEPLOYED",
        title: `${damagedAgent.name} STABILISED`,
        detail: "Repair supplies are reserved for agents outside the functioning bay.",
      });
      this.emitHud(true);
      return;
    }
    const damagedTurret = this.defenses.find((defense) => defense.hp < defense.maxHp);
    if (damagedTurret) {
      const repaired = repairTurret(damagedTurret, this.loot.components);
      if (repaired.components !== this.loot.components) {
        damagedTurret.hp = repaired.turret.hp;
        this.loot.components = repaired.components;
        this.callbacks.onToast({
          eyebrow: "COMPONENT REPAIR",
          title: "SENTRY RESTORED",
          detail: "Components rebuilt the damaged turret assembly.",
        });
        this.emitHud(true);
        return;
      }
    }
    this.callbacks.onToast({
      eyebrow: "FIELD KIT UNAVAILABLE",
      title: "NO REPAIR TARGET OR SUPPLIES",
      detail: "Recover repair packs for agents or Components for sentries.",
    });
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  getAudioSettings() {
    return this.audio.getSettings();
  }

  enableAudio() {
    this.audio.enableAudio();
  }

  setMusicVolume(value: number) {
    this.audio.setMusicVolume(value);
  }

  setSfxVolume(value: number) {
    this.audio.setSfxVolume(value);
  }

  setCombatOverlayOpen(open: boolean) {
    this.combatOverlayOpen = open;
  }

  togglePause() {
    if (this.mode === "paused" && this.combatOverlayOpen && !isWatchMode(this.sessionMode)) return;
    if (this.mode === "playing") {
      this.resetInput();
      this.mode = "paused";
      if (isWatchMode(this.sessionMode)) this.watchState = { ...this.watchState, paused: true };
      this.audio.setPaused(true);
      this.callbacks.onMode("paused");
      return;
    }
    if (this.mode === "paused") {
      this.resetInput();
      this.mode = "playing";
      if (isWatchMode(this.sessionMode)) this.watchState = { ...this.watchState, paused: false };
      this.audio.setPaused(false);
      this.callbacks.onMode("playing");
    }
  }

  recruit(id: AgentId) {
    if (!canPerformTutorialAction(this.tutorialStep, `recruit-${id}`)) return;
    if (!canRecruitPersistentWarband(this.mode)) return;
    if (this.addAgent(id, { charge: true, notify: true }) && id === "kairos") {
      this.emitTutorialEvent("kairos-recruited");
    }
  }

  useAgentSkill(id: EvolutionAgentId) {
    if (this.mode !== "playing") return;
    const agent = this.agents.find((candidate) => candidate.id === id);
    const skill = AGENT_SKILLS[id];
    if (!agent || !skill) return;
    const actionState = getAgentActionState(agent, {
      repairBay: {
        hp: this.repairBay.hp,
        maxHp: this.repairBay.maxHp,
        isSeparate: true,
        repairPerSecond: 18,
      },
    });
    if (!actionState.canAct) return;
    const enemyTarget = id === "covenant" ? null : this.getPriorityEnemy();
    const supportTarget = id === "covenant"
      ? [
          ...this.agents.map((candidate) => ({
            id: candidate.id,
            kind: "agent" as const,
            hp: candidate.hp,
            maxHp: candidate.maxHp,
          })),
          ...this.defenses.map((candidate) => ({
            id: String(candidate.index),
            kind: "turret" as const,
            hp: candidate.hp,
            maxHp: candidate.maxHp,
          })),
        ].filter((candidate) => candidate.hp > 0)
          .sort(
            (left, right) =>
              left.hp / left.maxHp - right.hp / right.maxHp ||
              String(left.id).localeCompare(String(right.id)),
          )[0] ?? null
      : null;
    const target = enemyTarget
      ? {
          id: enemyTarget.id,
          kind: "enemy",
          hp: enemyTarget.hp,
          maxHp: enemyTarget.maxHp,
          armored: enemyTarget.resistanceFlags.includes("armor"),
        }
      : supportTarget;
    const source = {
      id: agent.id,
      hp: agent.hp,
      maxHp: agent.maxHp,
      disabledLeftMs: agent.disabledLeft * 1_000,
      skillCooldowns: { [skill.id]: agent.skillCooldownLeftMs },
    };
    if (!canUseSkill(source, skill.id, { target })) return;
    const result = activateAgentSkill(source, skill.id, { target });
    agent.skillCooldownLeftMs = result.agent.skillCooldowns[skill.id];

    for (const effect of result.effects as AgentSkillEffect[]) {
      if (effect.type === "time-fracture" && enemyTarget) {
        for (const threat of this.enemyGrid.query(
          enemyTarget.group.position,
          effect.radius,
        )) {
          threat.slow = Math.max(threat.slow, effect.durationMs / 1_000);
          threat.slowMultiplier = Math.min(
            threat.slowMultiplier,
            effect.slowMultiplier,
          );
        }
        this.addRing(
          enemyTarget.group.position,
          agent.color,
          0.2,
          effect.radius,
          0.72,
          "portal",
        );
      }
      if (effect.type === "mark" && enemyTarget) {
        enemyTarget.markedLeft = effect.durationMs / 1_000;
        enemyTarget.markMultiplier = effect.damageMultiplier;
      }
      if (effect.type === "damage" && enemyTarget) {
        this.damageEnemy(
          enemyTarget,
          effect.amount,
          enemyTarget.group.position,
          effect.executes,
        );
      }
      if (effect.type === "armor-break" && enemyTarget) {
        enemyTarget.armorBrokenLeft = effect.durationMs / 1_000;
        enemyTarget.armorBreakReduction = effect.armorReduction;
      }
      if (effect.type === "suppressive-burst" && enemyTarget) {
        for (const threat of this.enemyGrid.query(
          enemyTarget.group.position,
          effect.radius,
        )) {
          threat.slow = Math.max(threat.slow, effect.slowMs / 1_000);
          threat.slowMultiplier = Math.min(
            threat.slowMultiplier,
            effect.slowMultiplier,
          );
          this.damageEnemy(
            threat,
            effect.damage,
            enemyTarget.group.position,
          );
        }
        this.addRing(
          enemyTarget.group.position,
          agent.color,
          0.2,
          effect.radius,
          0.58,
          "portal",
        );
      }
      if ((effect.type === "repair" || effect.type === "barrier") && target) {
        const targetAgent = target.kind === "agent"
          ? this.agents.find((candidate) => candidate.id === target.id)
          : null;
        const targetDefense = target.kind === "turret"
          ? this.defenses.find(
              (candidate) => String(candidate.index) === target.id,
            )
          : null;
        if (effect.type === "repair") {
          if (targetAgent) {
            targetAgent.hp = Math.min(
              targetAgent.maxHp,
              targetAgent.hp + effect.amount,
            );
          }
          if (targetDefense) {
            targetDefense.hp = Math.min(
              targetDefense.maxHp,
              targetDefense.hp + effect.amount,
            );
          }
        } else {
          if (targetAgent) {
            targetAgent.barrier = effect.amount;
            targetAgent.barrierLeft = effect.durationMs / 1_000;
          }
          if (targetDefense) {
            targetDefense.barrier = effect.amount;
            targetDefense.barrierLeft = effect.durationMs / 1_000;
          }
        }
        const position = targetAgent?.group.position ?? targetDefense?.group.position;
        if (position) {
          this.addRing(position, agent.color, 0.15, 1.8, 0.55, "portal");
          this.addBeam(agent.group.position, position, agent.color, 0.42);
        }
      }
    }
    this.audio.play("ultimate");
    this.callbacks.onToast({
      eyebrow: `${agent.name} SKILL DEPLOYED`,
      title: skill.label,
      detail: `${Math.round(skill.cooldownMs / 1_000)} second cooldown started.`,
    });
    this.emitHud(true);
  }

  private addAgent(
    id: AgentId,
    options: { charge: boolean; notify: boolean },
  ): boolean {
    const definition = AGENTS.find((agent) => agent.id === id);
    if (!definition || this.agents.some((agent) => agent.id === id)) return false;
    const recruitmentState = {
      compute: this.data,
      components: this.loot.components,
      shards: this.loot.shards,
      warband: this.agents.map((agent) => agent.id),
    };
    if (options.charge && !canRecruitWarbandSlot(recruitmentState, id)) {
      const cost = getRecruitCost(id);
      this.callbacks.onToast({
        eyebrow: "WARBAND SLOT UNAVAILABLE",
        title: cost
          ? `NEEDS ${cost.compute} COMPUTE · ${cost.components} COMPONENTS · ${cost.shards} SHARDS`
          : "RECRUITMENT LOCKED",
        detail: "Recruit in slot order and recover materials from nearby loot.",
      });
      return false;
    }
    if (options.charge) {
      const next = recruitWarbandSlot(recruitmentState, id);
      this.data = next.compute;
      this.loot.components = next.components;
      this.loot.shards = next.shards;
    }
    const group = this.createAgentModel(definition);
    group.position
      .copy(this.player.group.position)
      .add(new THREE.Vector3(0, 0.8, 0));
    const health = this.createWorldHealthBar(1.08, definition.color);
    health.group.name = "agent-health";
    health.group.position.y = 2.08;
    group.add(health.group);
    this.scene.add(group);
    this.toonifyObject(group);
    const runtime: AgentRuntime = {
      ...definition,
      armorProfile: WARBAND_SLOTS.find((slot) => slot.id === id)?.armorProfile ?? { id: "standard", damageMultiplier: 1 },
      strength: WARBAND_SLOTS.find((slot) => slot.id === id)?.strength ?? 1,
      group,
      healthBar: health.group,
      healthFill: health.fill,
      hp: 75,
      maxHp: 75,
      repairDecision: "return",
      cooldownLeft: 0.35,
      supportClock: 5,
      disabledLeft: 0,
      rig: null,
      moving: false,
      gatheringCooldownMs: 0,
      gatheringTargetId: null,
      skillCooldownLeftMs: 0,
      barrier: 0,
      barrierLeft: 0,
    };
    this.agents.push(runtime);
    if (options.notify) {
      this.addRing(group.position, definition.color, 0.3, 2.2, 0.65, "portal");
      this.addBurst(group.position, definition.color, 13);
      this.audio.play("recruit");
      this.callbacks.onToast({
        eyebrow: "AUTONOMOUS ROLE ACTIVE",
        title: `${definition.name} JOINED YOUR TEAM`,
        detail: `${definition.detail} Optional squad orders can override this role.`,
      });
      this.emitHud(true);
    }
    return true;
  }

  private restoreAgent(id: AgentId) {
    this.addAgent(id, { charge: false, notify: false });
  }

  attack() {
    if (this.mode !== "playing" || this.player.attackCooldown > 0) return;
    const from = this.player.group.position
      .clone()
      .add(new THREE.Vector3(0, 1.05, 0));
    const target = this.resolveAim();
    const direction = target.clone().sub(from);
    direction.y = 0;
    if (direction.lengthSq() < 0.001) direction.copy(this.lastMove);
    direction.normalize();
    this.faceDirection(this.player.group, direction);
    this.player.attackCooldown = 0.28 * this.playerAttackCooldownMultiplier;
    this.fireProjectile(
      from.add(direction.clone().multiplyScalar(0.65)),
      direction,
      0xe77d44,
      this.player.damage * this.attackMultiplier,
      12.5,
      "operator",
      0,
      0.18,
    );
    this.player.weapon.rotation.z = -0.32;
    this.addRing(from, 0xe77d44, 0.08, 0.55, 0.18);
    this.addBurst(
      from.clone().add(direction.clone().multiplyScalar(0.22)),
      0xffc49f,
      4,
    );
    this.triggerRig(this.player.rig, "attack", 0.26);
    this.audio.play("attack");
  }

  melee() {
    if (this.mode !== "playing" || this.player.meleeCooldown > 0) return;
    const origin = this.player.group.position.clone();
    const direction = this.resolveAim().sub(origin).setY(0);
    if (direction.lengthSq() < 0.001) direction.copy(this.lastMove);
    direction.normalize();
    this.faceDirection(this.player.group, direction);
    this.player.meleeCooldown = 0.62;
    this.triggerRig(this.player.rig, "attack", 0.42);

    let hits = 0;
    for (const enemy of this.enemyGrid.query(origin, 4.2)) {
      const offset = enemy.group.position.clone().sub(origin).setY(0);
      const distance = offset.length();
      if (distance > 2.65 + enemy.radius) continue;
      const facing = distance < 0.2 ? 1 : offset.normalize().dot(direction);
      if (facing < -0.12) continue;
      hits += 1;
      const hitPosition = enemy.group.position
        .clone()
        .add(new THREE.Vector3(0, enemy.radius, 0));
      this.damageEnemy(
        enemy,
        46 * this.attackMultiplier,
        hitPosition,
      );
      enemy.group.position.add(direction.clone().multiplyScalar(0.42));
      this.addBeam(
        origin.clone().add(new THREE.Vector3(0, 0.9, 0)),
        hitPosition,
        0xffb277,
        0.16,
      );
    }

    const slashCenter = origin
      .clone()
      .add(direction.clone().multiplyScalar(1.15));
    this.addSlashArc(origin, direction, 0xffb277);
    this.addBurst(
      slashCenter.clone().add(new THREE.Vector3(0, 0.45, 0)),
      hits > 0 ? 0xffd2ad : 0xd9793f,
      hits > 0 ? 13 : 7,
    );
    this.shake = Math.max(
      this.shake,
      this.reducedMotion ? 0.025 : hits > 0 ? 0.2 : 0.08,
    );
    this.audio.play("attack");
  }

  dash() {
    if (this.mode !== "playing" || this.player.dashCooldown > 0) return;
    const direction =
      this.lastMove.lengthSq() > 0.01
        ? this.lastMove.clone()
        : this.resolveAim().sub(this.player.group.position).setY(0).normalize();
    const start = this.player.group.position.clone();
    this.player.group.position.add(direction.multiplyScalar(3.6));
    this.clampToArena(this.player.group.position, ARENA_RADIUS);
    this.recordTutorialMovement(start);
    this.player.dashCooldown = 3;
    this.player.invulnerable = 0.34;
    this.addBeam(
      start.add(new THREE.Vector3(0, 0.6, 0)),
      this.player.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
      0xd9793f,
      0.28,
    );
    this.addBurst(start, 0xd9793f, 10);
    this.addRing(this.player.group.position, 0xd9793f, 0.2, 1.45, 0.3);
    this.shake = Math.max(this.shake, 0.12);
    this.audio.play("dash");
  }

  activateEmp() {
    if (this.mode !== "playing" || this.intermissionClock > 0 || !this.waveActive || !canFireEmp(this.empState)) return;
    const pulse = fireEmp(this.empState, { baseDamage: EMP_BASE_DAMAGE });
    this.empState = pulse.state as EmpState;
    this.empReadyPrompt = false;
    this.dismissedEmpPrompt = false;
    const profile = getEmpRuntimeProfile({
      voltageRank: this.upgradeStacks.voltage,
      radiusMultiplier:
        getArmorBonuses(this.armorId).empRadiusMultiplier ?? 1,
      terrainRadiusMultiplier: this.terrain.empMultiplier,
    });
    const origin = this.player.group.position.clone();
    const jammerThreats = this.enemies.map((threat) => ({
      id: threat.id,
      x: threat.group.position.x,
      z: threat.group.position.z,
      resistanceFlags: threat.resistanceFlags,
    }));
    for (const enemy of this.enemyGrid.query(origin, profile.radius)) {
      const distance = enemy.group.position.distanceTo(origin);
      if (distance <= profile.radius) {
        enemy.slow = Math.max(enemy.slow, 2.8);
        const resistanceFlags = getEffectiveResistanceFlags(
          {
            id: enemy.id,
            x: enemy.group.position.x,
            z: enemy.group.position.z,
            resistanceFlags: enemy.resistanceFlags,
          },
          jammerThreats,
        );
        this.damageEnemy(
          enemy,
          resolveEmpDamage(
            pulse.damage,
            { resistanceFlags },
            this.encounterModifiers,
            profile.resistanceBypass,
          ),
          enemy.group.position,
          true,
        );
      }
    }
    this.addRing(
      origin,
      0xf1eadd,
      0.4,
      profile.radius + 0.5,
      0.9,
      "portal",
    );
    this.addRing(origin, 0x9ebfc0, 0.2, profile.radius * 0.67, 0.72);
    this.addBurst(origin.add(new THREE.Vector3(0, 0.7, 0)), 0xf1eadd, 28);
    for (const agent of this.agents) {
      this.addBeam(
        agent.group.position.clone(),
        origin.clone().add(new THREE.Vector3(0, 0.7, 0)),
        agent.color,
        0.5,
      );
    }
    this.shake = this.reducedMotion ? 0.04 : 0.48;
    this.audio.play("ultimate");
    this.callbacks.onToast({
      eyebrow: "EMP PULSE ACTIVATED",
      title: "THE BREACH HAS BEEN DISRUPTED",
      detail: `${pulse.damage} base disruption · ${profile.radius.toFixed(1)} range · ${Math.round(profile.resistanceBypass * 100)}% resistance bypass.`,
    });
    this.emitHud(true);
  }

  dismissRecruitPrompt() {
    this.dismissedRecruitAgentId = this.recruitPrompt?.agentId ?? null;
    this.recruitPrompt = null;
    this.emitHud(true);
  }

  dismissEmpPrompt() {
    this.dismissedEmpPrompt = true;
    this.empReadyPrompt = false;
    this.emitHud(true);
  }

  applyUpgrade(id: UpgradeId) {
    const autonomousWorkshop = this.intermissionClock > 0;
    if (this.mode !== "upgrade" && !autonomousWorkshop) return;
    try {
      const next = applyUpgradeStack({ stacks: this.upgradeStacks }, id);
      this.upgradeStacks = next.stacks;
    } catch {
      return;
    }
    if (id === "overclock") {
      this.attackMultiplier *= 1.35;
    }
    if (id === "bastion") {
      this.player.maxHp += 25;
      this.player.hp = this.player.maxHp;
    }
    if (id === "bandwidth") {
      this.data += 70;
      this.agentRateMultiplier *= 0.85;
    }
    if (id === "voltage") {
      const profile = getEmpRuntimeProfile({
        voltageRank: this.upgradeStacks.voltage,
      });
      this.empState = updateEmpCooldown(
        this.empState,
        profile.cooldownMs,
      ) as EmpState;
    }
    if (id === "repair") {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    }
    if (id === "command") this.agentDamageMultiplier *= 1.25;
    const selected = UPGRADES.find((upgrade) => upgrade.id === id);
    this.callbacks.onToast({
      eyebrow: "UPGRADE APPLIED",
      title: selected?.name ?? "TEAM UPGRADED",
      detail: selected?.outcome ?? "Your team is stronger.",
    });
    if (autonomousWorkshop) {
      this.emitHud(true);
      return;
    }
    this.resetInput();
    this.mode = "evolution";
    this.callbacks.onMode("evolution");
    this.emitHud(true);
  }

  evolveAgent(agentId: EvolutionAgentId, evolutionId: EvolutionId) {
    if (this.mode !== "evolution") return;
    try {
      const next = purchaseEvolution({
        compute: this.data,
        recruited: Object.fromEntries(
          (Object.keys(this.evolutions) as EvolutionAgentId[]).map((id) => [
            id,
            this.agents.some((agent) => agent.id === id),
          ]),
        ),
        evolutions: this.evolutions,
      }, agentId, evolutionId);
      this.data = next.compute;
      this.evolutions = next.evolutions;
      const evolution = EVOLUTIONS[agentId].find(
        (item: { id: string }) => item.id === evolutionId,
      );
      this.callbacks.onToast({
        eyebrow: `${agentId.toUpperCase()} EVOLVED`,
        title: evolution?.name ?? "NEW PROTOCOL ONLINE",
        detail: "This agent now has a permanent specialist ability.",
      });
      this.startNextWave();
    } catch (error) {
      this.callbacks.onToast({
        eyebrow: "EVOLUTION UNAVAILABLE",
        title: error instanceof Error ? error.message.toUpperCase() : "TRY AGAIN",
        detail: "Earn more Compute or choose another recruited agent.",
      });
    }
  }

  purchaseComponentUpgrade(target: "player" | AgentId, upgradeId: string) {
    if (this.mode !== "evolution") return;
    try {
      const next = purchaseComponentUpgrade({
        components: this.loot.components,
        armorId: this.armorId,
        recruited: Object.fromEntries(
          AGENTS.map((agent) => [
            agent.id,
            this.agents.some((recruited) => recruited.id === agent.id),
          ]),
        ),
        componentUpgradeRanks: this.componentUpgradeRanks,
      }, target, upgradeId);
      this.loot.components = next.components;
      this.componentUpgradeRanks = next.componentUpgradeRanks;
      if (target === "player") {
        this.armorId = next.armorId as PlayerArmorId;
        const bonuses = getArmorBonuses(this.armorId);
        const addedHealth = bonuses.maxHealth ?? 0;
        this.player.maxHp += addedHealth;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + addedHealth);
        this.attackMultiplier *= bonuses.damageMultiplier ?? 1;
        this.playerAttackCooldownMultiplier *= bonuses.cooldownMultiplier ?? 1;
      }
      const definition = target === "player"
        ? PLAYER_ARMORS[upgradeId as PlayerArmorId]
        : AGENT_COMPONENT_UPGRADES[target].find(
            (item: { id: string }) => item.id === upgradeId,
          );
      this.callbacks.onToast({
        eyebrow: "COMPONENT INSTALLED",
        title: definition?.name ?? "UPGRADE INSTALLED",
        detail: "Components were committed to a permanent mission upgrade.",
      });
      this.emitHud(true);
    } catch (error) {
      this.callbacks.onToast({
        eyebrow: "COMPONENT UPGRADE UNAVAILABLE",
        title: error instanceof Error ? error.message.toUpperCase() : "TRY AGAIN",
        detail: "INSUFFICIENT COMPONENTS, capped ranks, or an unavailable target.",
      });
    }
  }

  // Component purchases stay in the post-wave workshop until the operator continues.
  continueWithoutEvolution() {
    if (this.mode === "evolution") this.startNextWave();
  }

  private startNextWave() {
    this.resetInput();
    this.intermissionClock = 0;
    this.clearTemporarySubAgents();
    this.wave += 1;
    this.mode = advanceWarbandWorkshopMode(this.mode, "start-next-wave");
    this.callbacks.onMode("playing");
    this.spawnWave(this.wave);
    this.audio.play("wave");
    this.emitHud(true);
  }

  rotateCamera(direction: -1 | 1) {
    this.yaw += direction * (Math.PI / 4);
  }

  zoomCamera(direction: -1 | 1) {
    this.zoom = THREE.MathUtils.clamp(this.zoom + direction * 0.12, 0.7, 1.42);
    this.resize();
  }

  setCameraPresentation(presentation: CameraPresentation) {
    this.cameraPresentation = presentation;
    if (presentation !== "command") this.cameraFocusId = null;
    this.resize();
  }

  resetCamera() {
    this.yaw = Math.PI / 4;
    this.zoom = 1;
    this.cameraFocusId = null;
    this.resize();
  }

  setTouchMovement(x: number, y: number) {
    this.touchMove.set(x, y);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.canvas.removeEventListener("webglcontextlost", this.onWebglContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onWebglContextRestored);
    this.resetInput();
    this.clearTemporarySubAgents();
    this.audio.dispose();
    this.clearDynamic();
    this.projectilePool.clear((mesh) => this.disposeDynamicObject(mesh));
    this.damageNumberPool.clear((sprite) => this.disposeDynamicObject(sprite));
    this.lootPool.clear((mesh) => this.disposeDynamicObject(mesh));
    this.temporarySubAgentPool.clear((marker) =>
      this.disposeDynamicObject(marker),
    );
    this.bossTelegraphPool.clear((marker) =>
      this.disposeDynamicObject(marker),
    );
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line))
        return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material?.dispose();
    });
    this.renderer.dispose();
  }

  private buildTargetingPresentation() {
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.43, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd2ad,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    reticle.name = "operator-aim-reticle";
    reticle.rotation.x = -Math.PI / 2;
    reticle.renderOrder = 8;
    this.scene.add(reticle);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({
        color: 0xffb277,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
      }),
    );
    line.name = "operator-aim-line";
    line.renderOrder = 8;
    this.scene.add(line);
    return { reticle, line };
  }

  private updateTargetingPresentation() {
    const visible = this.mode === "playing" && !this.placementActive;
    this.aimReticle.visible = visible;
    this.aimLine.visible = visible;
    if (!visible) return;

    const target = this.resolveAim().setY(0.08);
    this.aimReticle.position.copy(target);
    this.aimReticle.scale.setScalar(
      this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 8) * 0.08,
    );

    const direction = target
      .clone()
      .sub(this.player.group.position)
      .setY(0);
    const distance = direction.length();
    if (distance > 0.001) direction.divideScalar(distance);
    const start = target
      .clone()
      .addScaledVector(direction, -Math.min(1.35, distance))
      .setY(0.1);
    const positions = this.aimLine.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, target.x, target.y + 0.02, target.z);
    positions.needsUpdate = true;
    this.aimLine.geometry.computeBoundingSphere();
  }

  private buildWorld() {
    const hemisphere = new THREE.HemisphereLight(0xa7c4ca, 0x1b0d08, 1.25);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffd8b0, 3.15);
    keyLight.position.set(7, 14, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6ca7b4, 0.95);
    fillLight.position.set(-9, 8, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xe98148, 32, 26, 2);
    rimLight.position.set(-6, 4, -7);
    this.scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 64),
      new THREE.MeshStandardMaterial({
        color: 0x101a20,
        roughness: 0.74,
        metalness: 0.36,
        emissive: 0x061018,
        emissiveIntensity: 0.72,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.11;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(60, 60, 0xb0633d, 0x294b54);
    grid.name = "arena-grid";
    grid.position.y = -0.08;
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.68;
    this.scene.add(grid);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(5.1, 5.6, 0.25, 8),
      new THREE.MeshStandardMaterial({
        color: 0x1b272b,
        roughness: 0.5,
        metalness: 0.66,
        emissive: 0x12242a,
        emissiveIntensity: 0.72,
      }),
    );
    platform.position.y = 0;
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.scene.add(platform);

    const platformLine = new THREE.Mesh(
      new THREE.TorusGeometry(5.15, 0.035, 8, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf08a4b,
        transparent: true,
        opacity: 0.9,
      }),
    );
    platformLine.rotation.x = Math.PI / 2;
    platformLine.position.y = 0.15;
    this.scene.add(platformLine);

    const buildingMaterial = new THREE.MeshStandardMaterial({
      color: 0x172329,
      roughness: 0.5,
      metalness: 0.7,
      emissive: 0x07151b,
      emissiveIntensity: 0.85,
    });
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: 0xd98652,
      transparent: true,
      opacity: 0.82,
    });
    const positions: Array<[number, number]> = [];
    for (let x = -20; x <= 20; x += 4) {
      positions.push([x, -22], [x, 22]);
    }
    for (let z = -18; z <= 18; z += 4) {
      positions.push([-22, z], [22, z]);
    }
    positions.forEach(([x, z], index) => {
      const height = 2.2 + ((index * 17) % 6) * 0.62;
      const width = 2.1 + ((index * 7) % 3) * 0.35;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, width),
        buildingMaterial,
      );
      building.position.set(x, height / 2 - 0.05, z);
      building.rotation.y = (index % 3) * 0.08;
      building.castShadow = true;
      building.receiveShadow = true;
      this.scene.add(building);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.74, 0.035, width + 0.02),
        lightMaterial,
      );
      strip.position.set(x, Math.max(0.8, height * 0.64), z);
      strip.rotation.y = building.rotation.y;
      this.scene.add(strip);
    });

    const nodeGeometry = new THREE.OctahedronGeometry(0.13, 0);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x6f8c8d });
    for (let index = 0; index < 44; index += 1) {
      const angle = (index / 44) * Math.PI * 2;
      const radius = 6.8 + ((index * 23) % 46) / 10;
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.set(
        Math.cos(angle) * radius,
        0.04 + (index % 3) * 0.08,
        Math.sin(angle) * radius,
      );
      node.rotation.y = angle;
      this.scene.add(node);
    }

    const particleCount = 280;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = ((index * 71) % 600) / 10 - 30;
      particlePositions[index * 3 + 1] = 0.2 + ((index * 47) % 90) / 10;
      particlePositions[index * 3 + 2] = ((index * 97) % 600) / 10 - 30;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xb6d8dc,
        size: 0.052,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
    );
    particles.name = "ambient-particles";
    this.scene.add(particles);

    this.buildArenaZoneMarkers();
  }

  private applyBattlegroundTheme() {
    const palette = this.battleground.palette;
    this.scene.background = new THREE.Color(palette.background);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(palette.fog);
    }
    const grid = this.scene.getObjectByName("arena-grid");
    if (!(grid instanceof THREE.LineSegments)) return;
    const material = grid.material as THREE.LineBasicMaterial | THREE.LineBasicMaterial[];
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((entry) => entry.color.set(palette.grid));
  }

  private buildArenaZoneMarkers() {
    for (const marker of ARENA_ZONE_MARKERS) {
      const zone = getArenaZone({ x: marker.x, z: marker.z });
      const width = marker.kind === "core" ? 0.1 : 0.055;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(marker.radius - width, marker.radius + width, 48),
        new THREE.MeshBasicMaterial({
          color: marker.color,
          transparent: true,
          opacity:
            marker.kind === "core" ? 0.7 : marker.kind === "portal" ? 0.36 : 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.name = `arena-zone-marker-${zone.id}`;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(marker.x, 0.035, marker.z);
      this.scene.add(ring);

      if (marker.kind === "breach") {
        const lane = new THREE.Mesh(
          new THREE.PlaneGeometry(2.6, 0.1),
          new THREE.MeshBasicMaterial({
            color: marker.color,
            transparent: true,
            opacity: 0.48,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        lane.rotation.x = -Math.PI / 2;
        lane.position.set(marker.x, 0.04, marker.z);
        this.scene.add(lane);
      }

      const label = this.createArenaZoneLabel(zone.label, marker.color);
      label.position.set(marker.x, 0.08, marker.z + marker.radius + 0.22);
      this.scene.add(label);
    }
  }

  private createArenaZoneLabel(label: string, color: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return new THREE.Sprite();
    context.font = "600 26px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 7;
    context.strokeStyle = "rgba(4, 8, 10, 0.86)";
    context.strokeText(label, canvas.width / 2, canvas.height / 2);
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    );
    sprite.name = `arena-zone-label-${label.toLowerCase().replaceAll(" ", "-")}`;
    sprite.scale.set(Math.max(1.65, label.length * 0.15), 0.26, 1);
    return sprite;
  }

  private buildCore() {
    const group = new THREE.Group();
    group.position.set(0, 0.1, 0);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.55, 0.55, 8),
      new THREE.MeshStandardMaterial({
        color: 0x243238,
        roughness: 0.42,
        metalness: 0.8,
        emissive: 0x0a1e25,
        emissiveIntensity: 0.8,
      }),
    );
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.72, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffeee0,
        emissive: 0xf07d3e,
        emissiveIntensity: 2.7,
        roughness: 0.18,
        metalness: 0.5,
      }),
    );
    crystal.position.y = 1.35;
    crystal.castShadow = true;
    group.add(crystal);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.055, 8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff9a5d,
        transparent: true,
        opacity: 0.95,
      }),
    );
    innerRing.position.y = 1.25;
    innerRing.rotation.x = Math.PI / 2;
    innerRing.name = "core-ring";
    group.add(innerRing);

    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x8fd5e2,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    shield.position.y = 0.1;
    group.add(shield);

    const light = new THREE.PointLight(0xff8b4f, 68, 16, 2);
    light.position.y = 1.5;
    group.add(light);

    const health = this.createWorldHealthBar(2.45, 0x9ed8dd);
    health.group.position.y = 2.45;
    group.add(health.group);

    this.scene.add(group);
    return {
      group,
      crystal,
      shield,
      healthBar: health.group,
      healthFill: health.fill,
      hp: 180,
      maxHp: 180,
    };
  }

  private buildOperator() {
    const group = new THREE.Group();
    group.position.set(0, 0, 2.7);

    const bodyRoot = new THREE.Group();
    bodyRoot.name = "operator-body-root";
    group.add(bodyRoot);

    const undersuit = new THREE.MeshStandardMaterial({
      color: 0x11181c,
      roughness: 0.78,
      metalness: 0.18,
    });
    const graphite = new THREE.MeshStandardMaterial({
      color: 0x293137,
      roughness: 0.34,
      metalness: 0.76,
      emissive: 0x071116,
      emissiveIntensity: 0.35,
    });
    const armour = new THREE.MeshStandardMaterial({
      color: 0x70402d,
      roughness: 0.31,
      metalness: 0.84,
      emissive: 0x351308,
      emissiveIntensity: 0.38,
    });
    const gunmetal = new THREE.MeshStandardMaterial({
      color: 0x0c1114,
      roughness: 0.28,
      metalness: 0.92,
    });
    const visorMaterial = new THREE.MeshStandardMaterial({
      color: 0xa8eef2,
      emissive: 0x55c4d0,
      emissiveIntensity: 2.4,
      roughness: 0.12,
      metalness: 0.46,
    });
    const signalMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa063,
      emissive: 0xe75f27,
      emissiveIntensity: 2,
      roughness: 0.18,
      metalness: 0.58,
    });

    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 0.38, 8),
      graphite,
    );
    pelvis.position.y = 1.02;
    bodyRoot.add(pelvis);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.34, 0.78, 8),
      undersuit,
    );
    torso.position.y = 1.42;
    bodyRoot.add(torso);

    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.6, 0.3),
      graphite,
    );
    chestPlate.position.set(0, 1.47, -0.28);
    chestPlate.rotation.x = -0.08;
    bodyRoot.add(chestPlate);

    const sternum = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.42, 0.08),
      armour,
    );
    sternum.position.set(0, 1.47, -0.44);
    bodyRoot.add(sternum);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.095, 8, 20, Math.PI * 1.55),
      graphite,
    );
    collar.position.set(0, 1.83, 0);
    collar.rotation.set(Math.PI / 2, 0, -Math.PI * 0.27);
    bodyRoot.add(collar);

    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "operator-leg-left" : "operator-leg-right";
      leg.position.set(side * 0.2, 0.97, 0.03);
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.21, 0.58, 8),
        undersuit,
      );
      thigh.position.y = -0.28;
      leg.add(thigh);
      const thighPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.29, 0.44, 0.25),
        armour,
      );
      thighPlate.position.set(0, -0.25, -0.12);
      leg.add(thighPlate);
      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 7),
        graphite,
      );
      knee.scale.set(1, 0.8, 1);
      knee.position.set(0, -0.58, -0.04);
      leg.add(knee);
      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.54, 0.27),
        graphite,
      );
      shin.position.set(0, -0.84, 0);
      leg.add(shin);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.2, 0.42),
        gunmetal,
      );
      boot.position.set(0, -1.07, -0.09);
      leg.add(boot);
      bodyRoot.add(leg);

      const arm = new THREE.Group();
      arm.name = side < 0 ? "operator-arm-left" : "operator-arm-right";
      arm.position.set(side * 0.5, 1.7, 0);
      const shoulder = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.29, 0.46),
        armour,
      );
      shoulder.position.set(side * 0.04, -0.03, -0.01);
      shoulder.rotation.z = side * -0.12;
      arm.add(shoulder);
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 0.48, 8),
        undersuit,
      );
      upperArm.position.y = -0.3;
      arm.add(upperArm);
      const forearm = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.44, 0.27),
        graphite,
      );
      forearm.position.set(0, -0.68, -0.06);
      arm.add(forearm);
      bodyRoot.add(arm);
    }

    const coatTail = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.72, 0.1),
      undersuit,
    );
    coatTail.position.set(0, 0.83, 0.3);
    coatTail.rotation.x = -0.12;
    bodyRoot.add(coatTail);

    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.72, 0.25),
      gunmetal,
    );
    backpack.position.set(0, 1.43, 0.35);
    bodyRoot.add(backpack);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 10),
      graphite,
    );
    helmet.name = "operator-helmet";
    helmet.scale.set(0.94, 1.05, 1);
    helmet.position.y = 2.08;
    bodyRoot.add(helmet);

    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.23, 0.25),
      gunmetal,
    );
    jaw.position.set(0, 1.97, -0.14);
    bodyRoot.add(jaw);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.49, 0.105, 0.08),
      visorMaterial,
    );
    visor.position.set(0, 2.12, -0.285);
    bodyRoot.add(visor);

    const weapon = new THREE.Group();
    weapon.name = "operator-weapon";
    weapon.position.set(0.53, 1.28, -0.25);
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.24, 1.05),
      gunmetal,
    );
    stock.position.z = -0.32;
    weapon.add(stock);
    const upperRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.1, 0.74),
      armour,
    );
    upperRail.position.set(0, 0.16, -0.4);
    weapon.add(upperRail);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.72, 10),
      gunmetal,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.05;
    weapon.add(barrel);
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.14, 10),
      signalMaterial,
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = -1.43;
    weapon.add(muzzle);
    bodyRoot.add(weapon);

    const operatorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff9a5d,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      }),
    );
    operatorRing.rotation.x = -Math.PI / 2;
    operatorRing.position.y = 0.04;
    operatorRing.name = "operator-ring";
    group.add(operatorRing);

    const operatorLight = new THREE.PointLight(0xff8a4a, 10, 4.5, 2);
    operatorLight.position.set(0, 1.1, 0);
    operatorLight.name = "operator-light";
    group.add(operatorLight);

    const health = this.createWorldHealthBar(1.78, 0xe77d44);
    health.group.position.y = 2.72;
    health.group.name = "operator-health";
    group.add(health.group);

    group.scale.setScalar(1.24);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    this.scene.add(group);
    return {
      group,
      weapon,
      healthBar: health.group,
      healthFill: health.fill,
      hp: 100,
      maxHp: 100,
      damage: 25,
      attackCooldown: 0,
      meleeCooldown: 0,
      dashCooldown: 0,
      invulnerable: 0,
      rig: null,
    };
  }

  private buildRepairBay() {
    const group = new THREE.Group();
    group.name = "separate-repair-bay";
    group.position.set(-3.1, 0, 1.15);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.72, 0.74, 8),
      new THREE.MeshStandardMaterial({
        color: 0x26383a,
        emissive: 0x0d5554,
        emissiveIntensity: 1.15,
        metalness: 0.78,
        roughness: 0.28,
      }),
    );
    shell.position.y = 0.37;
    group.add(shell);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.13, 0.7, 8),
      new THREE.MeshBasicMaterial({ color: 0x76c6c1 }),
    );
    beacon.position.y = 1.05;
    group.add(beacon);
    const health = this.createWorldHealthBar(1.28, 0x76c6c1);
    health.group.name = "repair-bay-health";
    health.group.position.y = 1.58;
    group.add(health.group);
    this.scene.add(group);
    return {
      group,
      healthBar: health.group,
      healthFill: health.fill,
      hp: 70,
      maxHp: 70,
    };
  }

  private createWorldHealthBar(width: number, color: number) {
    const group = new THREE.Group();
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 0.16),
      new THREE.MeshBasicMaterial({
        color: 0x080c0f,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
      }),
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.1, 0.09),
      new THREE.MeshBasicMaterial({ color, depthTest: false }),
    );
    fill.position.z = 0.01;
    group.add(back, fill);
    return { group, fill };
  }

  private createDefenseModel(index: number) {
    const group = new THREE.Group();
    const armor = new THREE.MeshStandardMaterial({
      color: 0x24373e,
      roughness: 0.35,
      metalness: 0.82,
      emissive: 0x0b2c34,
      emissiveIntensity: 0.8,
    });
    const glow = new THREE.MeshBasicMaterial({
      color: index === 2 ? 0xe4b66d : 0x9ed8dd,
    });
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.82, 0.42, 8),
      armor,
    );
    base.position.y = 0.22;
    base.castShadow = true;
    group.add(base);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.23, 0.8, 8),
      armor,
    );
    mast.position.y = 0.8;
    mast.castShadow = true;
    group.add(mast);
    const turret = new THREE.Group();
    turret.name = "sentry-turret";
    turret.position.y = 1.2;
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.4, 0.72),
      armor,
    );
    housing.castShadow = true;
    turret.add(housing);
    for (const side of [-1, 1]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8),
        glow,
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.22, 0, -0.58);
      turret.add(barrel);
    }
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.06), glow);
    eye.position.set(0, 0.05, -0.39);
    turret.add(eye);
    group.add(turret);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.83, 0.035, 6, 32),
      glow,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    ring.name = "sentry-ring";
    group.add(ring);
    return group;
  }

  private createAgentModel(definition: AgentDefinition) {
    const group = new THREE.Group();
    const root = new THREE.Group();
    root.name = "agent-body-root";
    group.add(root);
    const accent = new THREE.MeshStandardMaterial({
      color: definition.color,
      emissive: definition.color,
      emissiveIntensity: 1.35,
      roughness: 0.24,
      metalness: 0.78,
    });
    const armour = new THREE.MeshStandardMaterial({
      color:
        definition.id === "forge"
          ? 0x3b3329
          : definition.id === "covenant"
            ? 0x343a3a
            : 0x20292e,
      roughness: 0.36,
      metalness: 0.88,
      emissive: definition.color,
      emissiveIntensity: 0.07,
    });
    const undersuit = new THREE.MeshStandardMaterial({
      color: 0x0c1216,
      roughness: 0.72,
      metalness: 0.24,
    });
    const weaponMaterial = new THREE.MeshStandardMaterial({
      color: 0x090d10,
      roughness: 0.28,
      metalness: 0.94,
    });

    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.33, 0.34, 8),
      armour,
    );
    pelvis.position.y = 0.94;
    root.add(pelvis);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.39, 0.29, 0.72, 8),
      undersuit,
    );
    torso.position.y = 1.38;
    root.add(torso);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(
        definition.id === "forge" ? 0.88 : 0.72,
        0.54,
        0.28,
      ),
      armour,
    );
    chest.position.set(0, 1.44, -0.2);
    root.add(chest);

    const chestCore = new THREE.Mesh(
      definition.id === "kairos"
        ? new THREE.OctahedronGeometry(0.13, 0)
        : new THREE.BoxGeometry(0.22, 0.1, 0.055),
      accent,
    );
    chestCore.position.set(0, 1.48, -0.36);
    root.add(chestCore);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 12, 8),
      armour,
    );
    helmet.scale.set(0.92, 1.05, 1);
    helmet.position.y = 1.95;
    root.add(helmet);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.39, 0.075, 0.055),
      accent,
    );
    visor.name = "agent-eye";
    visor.position.set(0, 1.99, -0.245);
    root.add(visor);

    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "agent-leg-left" : "agent-leg-right";
      leg.position.set(side * 0.17, 0.88, 0);
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.48, 7),
        undersuit,
      );
      thigh.position.y = -0.25;
      leg.add(thigh);
      const knee = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.2),
        accent,
      );
      knee.position.set(0, -0.52, -0.05);
      leg.add(knee);
      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.46, 0.22),
        armour,
      );
      shin.position.y = -0.76;
      leg.add(shin);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.16, 0.34),
        weaponMaterial,
      );
      boot.position.set(0, -1.02, -0.06);
      leg.add(boot);
      root.add(leg);

      const arm = new THREE.Group();
      arm.name = side < 0 ? "agent-arm-left" : "agent-arm-right";
      arm.position.set(side * (definition.id === "forge" ? 0.51 : 0.43), 1.64, 0);
      const shoulder = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.25, 0.34),
        side < 0 ? armour : accent,
      );
      shoulder.position.y = -0.04;
      arm.add(shoulder);
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.115, 0.42, 7),
        undersuit,
      );
      upper.position.y = -0.3;
      arm.add(upper);
      const forearm = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.38, 0.2),
        armour,
      );
      forearm.position.set(0, -0.61, -0.03);
      arm.add(forearm);
      root.add(arm);
    }

    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(
        definition.id === "forge" ? 0.72 : 0.42,
        definition.id === "forge" ? 0.66 : 0.52,
        0.24,
      ),
      weaponMaterial,
    );
    backpack.position.set(0, 1.42, 0.25);
    root.add(backpack);

    const weapon = new THREE.Group();
    weapon.name = "agent-weapon";
    weapon.position.set(0.28, 1.25, -0.48);
    if (definition.id === "kairos") {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.12, 1.25),
        weaponMaterial,
      );
      weapon.add(blade);
      const timeEdge = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.055, 1.05),
        accent,
      );
      timeEdge.position.y = 0.09;
      weapon.add(timeEdge);
      const clockRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.025, 6, 24),
        accent,
      );
      clockRing.name = "agent-ring";
      clockRing.position.set(-0.58, 0.28, 0.1);
      root.add(clockRing);
    } else if (definition.id === "kira") {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.16, 1.62),
        weaponMaterial,
      );
      weapon.add(rail);
      const railCore = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.055, 1.32),
        accent,
      );
      railCore.position.y = 0.11;
      weapon.add(railCore);
      weapon.position.z = -0.62;
    } else if (definition.id === "forge") {
      for (const side of [-1, 1] as const) {
        const cannon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.07, 1.05, 8),
          side < 0 ? weaponMaterial : accent,
        );
        cannon.rotation.x = Math.PI / 2;
        cannon.position.set(side * 0.18, 0, -0.15);
        weapon.add(cannon);
      }
      weapon.position.set(0, 1.38, -0.55);
    } else {
      const shield = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.48, 0.12, 8),
        accent,
      );
      shield.rotation.x = Math.PI / 2;
      shield.position.set(-0.5, 0.08, 0);
      weapon.add(shield);
      const emitter = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.16, 0.8),
        weaponMaterial,
      );
      weapon.add(emitter);
    }
    root.add(weapon);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.028, 8, 40),
      accent,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.035;
    ring.name = "agent-pad-ring";
    group.add(ring);

    const agentPad = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.68, 32),
      new THREE.MeshBasicMaterial({
        color: definition.color,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
      }),
    );
    agentPad.rotation.x = -Math.PI / 2;
    agentPad.position.y = -0.42;
    agentPad.name = "agent-pad";
    group.add(agentPad);

    const light = new THREE.PointLight(definition.color, 9, 4.6, 2);
    group.add(light);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    group.scale.setScalar(definition.id === "forge" ? 0.92 : 0.88);
    return group;
  }

  private createEnemy(
    type: EnemyType,
    position: THREE.Vector3,
    options: {
      tutorial?: boolean;
      speed?: number;
      damage?: number;
      reward?: number;
      decoyOwnerId?: number;
      bossState?: BossState;
    } = {},
  ) {
    const definitions: Record<
      EnemyType,
      {
        hp: number;
        speed: number;
        damage: number;
        range: number;
        cooldown: number;
        reward: number;
        radius: number;
        color: number;
        scale: number;
      }
    > = {
      virus: {
        hp: 24,
        speed: 2.35,
        damage: 7,
        range: 1.05,
        cooldown: 1.45,
        reward: 8,
        radius: 0.46,
        color: 0xa73d2d,
        scale: 1.02,
      },
      phisher: {
        hp: 52,
        speed: 1.5,
        damage: 10,
        range: 6,
        cooldown: 2.1,
        reward: 15,
        radius: 0.55,
        color: 0xb35d32,
        scale: 1.08,
      },
      trojan: {
        hp: 100,
        speed: 1.05,
        damage: 18,
        range: 1.45,
        cooldown: 2.4,
        reward: 24,
        radius: 0.82,
        color: 0x7b2923,
        scale: 1.26,
      },
      rootkit: {
        hp: 520,
        speed: 0.75,
        damage: 26,
        range: 2.1,
        cooldown: 2.6,
        reward: 125,
        radius: 1.42,
        color: 0xb7422e,
        scale: 2.05,
      },
    };
    const definition = definitions[type];
    const bossState = options.bossState
      ? { ...options.bossState, rewards: { ...options.bossState.rewards } }
      : null;
    const resistanceFlags: ResistanceFlag[] =
      options.tutorial || options.decoyOwnerId
      ? []
      : [...this.encounterModifiers.flagsByType[type]] as ResistanceFlag[];
    if (bossState && !resistanceFlags.includes("armor")) {
      resistanceFlags.push("armor");
    }
    const enemyId = ++this.enemySequence;
    const robotVisual = createLowPolyWarRobot(
      type,
      definition.color,
      definition.scale,
      enemyId * 0.73,
    );
    const group = robotVisual.group;
    const body = robotVisual.body;
    group.position.copy(position);
    group.name = bossState
      ? "pooled-warboss"
      : options.decoyOwnerId
        ? "enemy-decoy-target"
        : "enemy-threat";

    const threatRing = new THREE.Mesh(
      new THREE.RingGeometry(
        definition.radius * 0.9,
        definition.radius * 1.08,
        32,
      ),
      new THREE.MeshBasicMaterial({
        color: definition.color,
        transparent: true,
        opacity: type === "rootkit" ? 0.5 : 0.3,
        side: THREE.DoubleSide,
      }),
    );
    threatRing.rotation.x = -Math.PI / 2;
    threatRing.position.y = 0.02;
    threatRing.scale.setScalar(1 / definition.scale);
    group.add(threatRing);

    if (resistanceFlags.includes("jammer")) {
      const jammerZone = new THREE.Mesh(
        new THREE.RingGeometry(
          JAMMER_ZONE_RADIUS - 0.08,
          JAMMER_ZONE_RADIUS,
          48,
        ),
        new THREE.MeshBasicMaterial({
          color: 0xe86b64,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      jammerZone.name = "enemy-jammer-zone";
      jammerZone.rotation.x = -Math.PI / 2;
      jammerZone.position.y = 0.035;
      jammerZone.scale.setScalar(1 / definition.scale);
      group.add(jammerZone);
    }

    if (options.decoyOwnerId) {
      group.scale.multiplyScalar(0.72);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          material.transparent = true;
          material.opacity = 0.46;
        });
      });
    }

    const healthBar = new THREE.Group();
    const robotOverlayY =
      type === "rootkit"
        ? 2.35
        : type === "phisher"
          ? 2.2
          : type === "trojan"
            ? 2.08
            : 1.92;
    healthBar.position.y = robotOverlayY;
    healthBar.scale.setScalar(1 / definition.scale);
    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.09),
      new THREE.MeshBasicMaterial({
        color: 0x160a08,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
      }),
    );
    const healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.055),
      new THREE.MeshBasicMaterial({
        color: 0xd9793f,
        depthTest: false,
      }),
    );
    healthFill.position.z = 0.01;
    healthBar.add(healthBack, healthFill);
    if (bossState) {
      healthBar.scale.x = 2.35 / definition.scale;
      healthBar.position.y = robotOverlayY + 0.42;
    }
    group.add(healthBar);

    resistanceFlags.forEach((flag, index) => {
      const colors: Record<ResistanceFlag, number> = {
        shield: 0x9ed8dd,
        decoy: 0xc6a6e8,
        armor: 0xf0b26b,
        jammer: 0xe86b64,
      };
      const cue = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.028, 5, 14),
        new THREE.MeshBasicMaterial({ color: colors[flag] }),
      );
      cue.name = "enemy-resistance-cue";
      cue.position.set(
        (index - (resistanceFlags.length - 1) / 2) * 0.3,
        robotOverlayY + 0.38,
        0,
      );
      cue.scale.setScalar(1 / definition.scale);
      group.add(cue);
    });

    this.scene.add(group);
    const bossVisual = bossState
      ? this.bossTelegraphPool.acquire(createBossTelegraphVisual)
      : null;
    if (bossVisual) {
      resetBossTelegraphVisual(bossVisual);
      this.scene.add(bossVisual);
    }
    const healthScale =
      1 + (this.wave - 1) * (type === "rootkit" ? 0.12 : 0.09);
    const damageScale = 1 + (this.wave - 1) * 0.055;
    const speedScale = 1 + Math.min(0.28, (this.wave - 1) * 0.035);
    const attackRateScale = Math.max(0.72, 1 - (this.wave - 1) * 0.035);
    const scaledHp = bossState
      ? bossState.maxHp
      : options.decoyOwnerId
        ? 1
        : Math.round(definition.hp * healthScale);
    const enemy: EnemyRuntime = {
      id: enemyId,
      type,
      group,
      body,
      healthBar,
      healthFill,
      hp: scaledHp,
      maxHp: scaledHp,
      speed: options.decoyOwnerId
        ? 0
        : options.speed ?? bossState?.movementSpeed ?? definition.speed * speedScale,
      damage:
        options.damage ??
        bossState?.attackDamage ??
        Math.round(
          definition.damage *
            damageScale *
            (this.wave === 1 ? FIRST_WAVE.damageMultiplier : 1),
        ),
      range: bossState?.attackRadius ?? definition.range,
      attackCooldown:
        bossState ? bossState.attackIntervalMs / 1_000 : definition.cooldown * attackRateScale,
      cooldownLeft: bossState
        ? bossState.attackCooldownLeftMs / 1_000
        : options.decoyOwnerId
          ? 0
          : 0.4 + Math.random() * 0.8,
      telegraphLeft: 0,
      telegraphTotal:
        bossState
          ? bossState.telegraphMs / 1_000
          : type === "phisher"
            ? 0.82
            : type === "rootkit"
              ? 1.05
              : 0.6,
      reward: options.reward ?? bossState?.rewards.compute ?? definition.reward,
      radius: definition.radius,
      slow: 0,
      slowMultiplier: 0.48,
      bossPhase: bossState ? 0 : type === "rootkit" ? 1 : 0,
      hitFlash: 0,
      tutorial: options.tutorial ?? false,
      resistanceFlags,
      decoyOwnerId: options.decoyOwnerId ?? null,
      decoyLeft: options.decoyOwnerId ? 4.2 : 0,
      markedLeft: 0,
      markMultiplier: 1,
      armorBrokenLeft: 0,
      armorBreakReduction: 0,
      bossState,
      bossVisual,
      movementWatchdog: createMovementWatchdogState() as EnemyMovementWatchdog,
      robotAnimate: robotVisual.animate,
    };
    this.toonifyObject(enemy.group);
    this.enemies.push(enemy);
    this.addRing(
      position,
      definition.color,
      0.2,
      type === "rootkit" ? 2.8 : 1.15,
      0.55,
      "portal",
    );
    return enemy;
  }

  private createTutorialMarker() {
    this.clearTutorialMarker();
    const group = new THREE.Group();
    group.name = "tutorial-training-ring";
    group.position.set(0, 0, -0.5);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.07, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x9ed8dd }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    const center = new THREE.Mesh(
      new THREE.CircleGeometry(0.86, 40),
      new THREE.MeshBasicMaterial({
        color: 0x9ed8dd,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
      }),
    );
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.055;
    group.add(center);
    this.scene.add(group);
    this.tutorialMarker = group;
  }

  private clearTutorialMarker() {
    if (!this.tutorialMarker) return;
    this.disposeDynamicObject(this.tutorialMarker);
    this.tutorialMarker = null;
  }

  private spawnTutorialTraining() {
    this.clearTutorialThreats();
    this.scheduledReinforcementThreats = 0;
    this.reinforcementsRemaining = 0;
    for (const [x, z] of [[-2.2, -1.8], [0, -2.6], [2.2, -1.8]]) {
      this.createEnemy("virus", new THREE.Vector3(x, 0, z), {
        tutorial: true,
        speed: 0.65,
        damage: 2,
      });
    }
  }

  private spawnTutorialBreach() {
    this.clearTutorialThreats();
    this.scheduledReinforcementThreats = 0;
    this.reinforcementsRemaining = 0;
    for (const threat of OBSERVE_BREACH) {
      this.createEnemy(threat.type as EnemyType, new THREE.Vector3(threat.x, 0, threat.z), {
        tutorial: true,
        speed: threat.speed,
        damage: threat.damage,
        reward: threat.reward,
      });
    }
  }

  private clearTutorialThreats() {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy.tutorial) continue;
      this.disposeDynamicObject(enemy.group);
      this.enemies.splice(index, 1);
    }
  }

  private captureFirstWaveCheckpoint() {
    this.firstWaveCheckpoint = {
      data: this.data,
      score: this.score,
      agents: this.agents.map((agent) => agent.id),
      defenses: this.defenses.map((defense) => ({
        x: defense.group.position.x,
        z: defense.group.position.z,
      })),
      command: this.squadCommand,
      empState: { ...this.empState },
      loot: { ...this.loot },
      repairBayHp: this.repairBay.hp,
    };
  }

  retryWave() {
    if (!canRetryFirstWave({
      wave: this.wave,
      tutorialResolved:
        this.tutorialStep === "complete" || this.tutorialStep === "skipped",
      checkpoint: this.firstWaveCheckpoint !== null,
    })) return;
    const checkpoint = this.firstWaveCheckpoint!;
    this.resetInput();
    this.clearTemporarySubAgents();
    this.clearDynamic();
    this.cancelDefensePlacement(false);
    this.data = checkpoint.data;
    this.score = checkpoint.score;
    this.squadCommand = checkpoint.command;
    this.empState = { ...checkpoint.empState };
    this.loot = { ...checkpoint.loot };
    this.repairBay.hp = checkpoint.repairBayHp;
    this.player.hp = this.player.maxHp;
    this.core.hp = this.core.maxHp;
    for (const id of checkpoint.agents) this.restoreAgent(id);
    for (const position of checkpoint.defenses) this.restoreDefense(position);
    this.wave = 1;
    this.mode = "playing";
    this.callbacks.onMode("playing");
    if (isWatchMode(this.sessionMode)) {
      for (const agentId of ["kairos", "kira", "forge", "covenant"].slice(0, WATCH_STARTER_AGENT_COUNT) as AgentId[]) {
        this.addAgent(agentId, { charge: false, notify: false });
      }
      this.recordWatchEvent("AI NETWORK DEPLOYED FOUR STARTER AGENTS");
    }
    this.spawnWave(1);
    if (isWatchMode(this.sessionMode)) {
      for (let index = 0; index < WATCH_STARTER_SENTRY_COUNT; index += 1) {
        this.buildDefense({ free: true });
      }
    }
    this.emitHud(true);
  }

  private spawnWave(wave: number) {
    this.encounterModifiers = getWaveModifiers(wave);
    this.terrain = getTerrainModifier(wave);
    this.battleground = getBattlegroundForWave(wave);
    this.applyBattlegroundTheme();
    this.updateTerrainOverlay();
    this.waveActive = true;
    this.waveEndClock = 0;
    if (wave === 1) {
      this.reinforcementsRemaining = 1;
      this.scheduledReinforcementThreats = FIRST_WAVE.reinforcement.length;
      this.reinforcementClock = FIRST_WAVE.reinforcementDelay;
      this.spawnFormation(FIRST_WAVE.initial as EnemyType[]);
    } else {
      this.reinforcementsRemaining = Math.min(4, 1 + Math.floor(wave / 2));
      this.scheduledReinforcementThreats =
        this.reinforcementsRemaining * Math.min(10, 4 + wave);
      this.reinforcementClock = Math.max(4.5, 7.2 - wave * 0.25);
      const boss = getBossEncounter(wave, `mission-wave-${wave}`, getWarbandStrength(this.agents));
      if (boss.scheduled) {
        const angle = wave * 0.71 + this.terrain.spawnAngleOffset;
        this.createEnemy(
          "rootkit",
          new THREE.Vector3(
            Math.cos(angle) * SPAWN_RADIUS,
            0,
            Math.sin(angle) * SPAWN_RADIUS,
          ),
          { bossState: boss },
        );
      }
      this.spawnFormation(
        (ENCOUNTERS[wave - 1] ?? ENCOUNTERS[ENCOUNTERS.length - 1])
          .filter((type) => type !== "rootkit"),
      );
    }
    if (wave === 4 || wave === 7) {
      this.callbacks.onToast({
        eyebrow: `ELITE BREACH · WAVE ${wave}`,
        title: "ARMOURED TROJANS INBOUND",
        detail: "Their armour reduces damage until the shell is broken.",
      });
    }
    if (wave === TOTAL_WAVES) {
      const portalZone = getArenaZone({ x: 0, z: -6.45 });
      this.callbacks.onToast({
        eyebrow: `${portalZone.label} ACTIVE`,
        title: "ROOTKIT PRIME HAS ENTERED",
        detail: "Break its armor, evade telegraphed strikes, and protect the Core.",
      });
    }
  }

  private spawnFormation(types: EnemyType[]) {
    const capacity = Math.max(
      0,
      this.activeEnemyLimit - this.enemies.length,
    );
    const immediate = types.slice(0, capacity);
    this.spawnQueue.push(...types.slice(immediate.length));
    this.spawnFormationImmediate(immediate);
  }

  private spawnFormationImmediate(types: EnemyType[]) {
    types.forEach((type, index) => {
      const angle =
        (index / types.length) * Math.PI * 2 +
        this.wave * 0.38 +
        (index % 2) * 0.12 +
        this.terrain.spawnAngleOffset;
      const radius =
        type === "rootkit" ? SPAWN_RADIUS : SPAWN_RADIUS + (index % 4) * 1.1;
      this.createEnemy(
        type,
        new THREE.Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        ),
      );
    });
    this.emitHud(true);
  }

  private releaseQueuedEnemies() {
    const result = releaseSpawnBatch(
      this.spawnQueue,
      this.activeEnemyLimit - this.enemies.length,
      this.elapsed,
      this.nextQueueReleaseAt,
    );
    this.spawnQueue = result.queue;
    this.nextQueueReleaseAt = result.nextReleaseAt;
    if (result.released.length > 0) {
      this.spawnFormationImmediate(result.released as EnemyType[]);
    }
  }

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.resetInput);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("lostpointercapture", this.resetInput);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  private unbindEvents() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.resetInput);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.resetInput);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }
    if (this.coOpPresentation) return;
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") this.attack();
    if (event.code === "KeyX") this.melee();
    if (event.code === "KeyQ" || event.code === "ShiftLeft") this.dash();
    if (event.code === "KeyR") this.activateEmp();
    if (event.code === "KeyZ") this.rotateCamera(-1);
    if (event.code === "KeyF") this.resetCamera();
    if (event.code === "KeyB") {
      if (event.shiftKey) this.beginManualDefensePlacement();
      else this.buildDefense();
    }
    if (event.code === "KeyE") {
      const commands: SquadCommand[] = ["auto", "follow", "defend", "focus"];
      this.setSquadCommand(
        commands[(commands.indexOf(this.squadCommand) + 1) % commands.length],
      );
    }
    if (event.code === "Escape") {
      if (this.placementActive) this.cancelDefensePlacement();
      else this.togglePause();
    }
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const agent = AGENTS[index];
      if (agent) this.recruit(agent.id);
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private resetInput() {
    this.keys.clear();
    this.touchMove.set(0, 0);
    this.touchMovePointer = null;
    if (this.touchAimActive) this.hasPointerAim = false;
    this.touchAimActive = false;
    if (
      this.dragPointer !== null &&
      this.canvas.hasPointerCapture(this.dragPointer)
    ) {
      this.canvas.releasePointerCapture(this.dragPointer);
    }
    this.dragPointer = null;
    this.playerMoving = false;
  }

  private onVisibilityChange() {
    this.setVisibilityPaused(document.hidden);
    if (document.hidden) this.resetInput();
  }

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus();
    if (this.coOpPresentation) return;
    if (event.pointerType === "touch" && event.button === 0) {
      this.touchMovePointer = event.pointerId;
      this.touchStartX = event.clientX;
      this.touchStartY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const tap = tapToFire((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      this.updateAimFromScreen(event.clientX, event.clientY);
      this.touchAimActive = true;
      void tap;
      this.hasPointerAim = true;
      if (this.placementActive) this.confirmDefensePlacement();
      else this.attack();
      return;
    }
    if (event.button === 1) {
      this.dragPointer = event.pointerId;
      this.dragX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 2) {
      this.updateAim(event);
      if (!this.placementActive) this.melee();
      return;
    }
    if (event.button === 0) {
      this.updateAim(event);
      if (this.placementActive) {
        this.confirmDefensePlacement();
        return;
      }
      this.attack();
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.touchMovePointer === event.pointerId) {
      const normalized = normalizeStickInput(
        (event.clientX - this.touchStartX) / 72,
        (event.clientY - this.touchStartY) / 72,
      );
      this.setTouchMovement(normalized.x, normalized.y);
      return;
    }
    if (this.dragPointer === event.pointerId) {
      const delta = event.clientX - this.dragX;
      this.dragX = event.clientX;
      this.yaw -= delta * 0.008;
      return;
    }
    this.updateAim(event);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.touchMovePointer === event.pointerId) {
      this.touchMovePointer = null;
      this.setTouchMovement(0, 0);
      if (this.touchAimActive) this.hasPointerAim = false;
      this.touchAimActive = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (this.dragPointer === event.pointerId) {
      this.dragPointer = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    }
  };

  private onPointerCancel = () => {
    this.resetInput();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(
      this.zoom + Math.sign(event.deltaY) * 0.08,
      0.7,
      1.42,
    );
    this.resize();
  };

  private preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private updateAim(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      this.aimPoint.copy(hit);
      this.hasPointerAim = true;
      this.updateDefenseGhost();
    }
  }

  private updateAimFromScreen(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      this.aimPoint.copy(hit);
      this.hasPointerAim = true;
      this.updateDefenseGhost();
    }
  }

  private onWebglContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.callbacks.onToast({
      eyebrow: "RENDERER RECOVERY",
      title: "DISPLAY PAUSED",
      detail: "The battlefield state is safe. Waiting for the graphics device to recover.",
    });
  };

  private onWebglContextRestored = () => {
    this.contextLost = false;
    this.applyBattlegroundTheme();
    this.callbacks.onToast({
      eyebrow: "RENDERER RECOVERY",
      title: "DISPLAY RESTORED",
      detail: "Combat resumed without changing your campaign state.",
    });
    this.emitHud(true);
  };

  private animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    this.updateQuality(rawDelta * 1_000);
    const delta = this.hitStop > 0 ? rawDelta * 0.06 : rawDelta;
    this.hitStop = Math.max(0, this.hitStop - rawDelta);
    this.elapsed += rawDelta;
    if (isWatchMode(this.sessionMode)) {
      const cinemaDelta = this.mode === "playing" && !this.watchState.paused
        ? rawDelta * 1_000
        : 0;
      this.cinemaState = tickCinemaState(this.cinemaState, cinemaDelta);
      this.watchState = tickWatchState(
        this.watchState,
        rawDelta * 1_000,
        { visible: !document.hidden && !this.cinemaState.paused },
      );
    }
    const presentationDelta = isWatchMode(this.sessionMode) &&
      (this.watchState.paused || this.cinemaState.paused)
      ? 0
      : rawDelta;
    this.updateAmbient(presentationDelta);
    if (!this.coOpPresentation && this.mode === "playing" && (!isWatchMode(this.sessionMode) || (!this.watchState.paused && !this.cinemaState.paused))) {
      this.updateGame(isWatchMode(this.sessionMode) ? delta * this.watchState.speed * this.cinemaState.speed : delta);
    }
    this.updateEffects(presentationDelta);
    this.updateCamera(rawDelta);
    this.updateTargetingPresentation();
    if (!this.contextLost) this.renderer.render(this.scene, this.camera);
  };

  private updateQuality(frameMs: number) {
    const next = tickQualityMonitor(this.qualityMonitor, frameMs);
    this.qualityMonitor = next;
    if (next.profile === this.qualityPreset) return;
    this.qualityPreset = next.profile;
    const settings = getQualitySettings(next.profile);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    this.renderer.shadowMap.enabled = settings.shadowMapSize > 0;
    while (this.effects.length > settings.maxCombatEffects) {
      const effect = this.effects.shift();
      if (effect) this.releaseEffect(effect);
    }
    this.emitHud(true);
  }

  private updateAmbient(delta: number) {
    this.core.crystal.rotation.y += delta * 0.65;
    this.core.crystal.position.y = 1.35 + Math.sin(this.elapsed * 1.8) * 0.08;
    const ring = this.core.group.getObjectByName("core-ring");
    if (ring) {
      ring.rotation.z += delta * 0.34;
      ring.scale.setScalar(1 + Math.sin(this.elapsed * 2) * 0.04);
    }
    const particles = this.scene.getObjectByName("ambient-particles");
    if (particles) particles.rotation.y += delta * 0.006;
    this.player.weapon.rotation.z = THREE.MathUtils.lerp(
      this.player.weapon.rotation.z,
      0,
      1 - Math.exp(-delta * 13),
    );
    const operatorBody = this.player.group.getObjectByName("operator-body-root");
    const leftLeg = this.player.group.getObjectByName("operator-leg-left");
    const rightLeg = this.player.group.getObjectByName("operator-leg-right");
    const leftArm = this.player.group.getObjectByName("operator-arm-left");
    const rightArm = this.player.group.getObjectByName("operator-arm-right");
    const helmet = this.player.group.getObjectByName("operator-helmet");
    const stride = this.playerMoving ? Math.sin(this.elapsed * 10.5) : 0;
    if (operatorBody) {
      operatorBody.position.y =
        this.playerMoving
          ? Math.abs(Math.sin(this.elapsed * 10.5)) * 0.045
          : Math.sin(this.elapsed * 2.2) * 0.016;
      operatorBody.rotation.z =
        this.mode === "defeat" && this.player.hp <= 0
          ? THREE.MathUtils.lerp(operatorBody.rotation.z, -1.28, 0.08)
          : THREE.MathUtils.lerp(
              operatorBody.rotation.z,
              this.playerMoving ? stride * 0.025 : 0,
              0.16,
            );
    }
    if (leftLeg) leftLeg.rotation.x = stride * 0.5;
    if (rightLeg) rightLeg.rotation.x = -stride * 0.5;
    if (leftArm) leftArm.rotation.x = -stride * 0.32 - 0.12;
    if (rightArm) rightArm.rotation.x = stride * 0.2 - 0.24;
    if (helmet) helmet.rotation.y = Math.sin(this.elapsed * 1.4) * 0.035;
    this.core.shield.scale.setScalar(1 + Math.sin(this.elapsed * 1.4) * 0.025);
    (this.core.shield.material as THREE.MeshBasicMaterial).opacity =
      0.035 + (this.core.hp / this.core.maxHp) * 0.05;
    this.player.healthBar.quaternion.copy(this.camera.quaternion);
    this.core.healthBar.quaternion.copy(this.camera.quaternion);
    this.repairBay.healthBar.quaternion.copy(this.camera.quaternion);
    const playerRatio = clamp01(this.player.hp / this.player.maxHp);
    const coreRatio = clamp01(this.core.hp / this.core.maxHp);
    this.player.healthFill.scale.x = Math.max(0.001, playerRatio);
    this.player.healthFill.position.x = -0.76 * (1 - playerRatio);
    this.core.healthFill.scale.x = Math.max(0.001, coreRatio);
    this.core.healthFill.position.x = -1.175 * (1 - coreRatio);
    const bayRatio = clamp01(this.repairBay.hp / this.repairBay.maxHp);
    this.repairBay.healthFill.scale.x = Math.max(0.001, bayRatio);
    this.repairBay.healthFill.position.x = -0.59 * (1 - bayRatio);
  }

  private updateGame(delta: number) {
    this.empState = tickEmp(this.empState, delta * 1_000) as EmpState;
    this.watchRecoveryClock = Math.max(0, this.watchRecoveryClock - delta);
    if (this.intermissionClock > 0) {
      this.intermissionClock = tickWaveIntermission(this.intermissionClock, delta * 1_000);
      if (this.intermissionClock === 0) this.startNextWave();
    }
    this.runAutonomousNetwork(delta);
    this.updatePlayer(delta);
    this.updateWatchOperator(delta);
    this.updateRig(this.player.rig, delta, this.playerMoving ? "run" : "idle");
    this.enemyGrid.rebuild(this.enemies);
    this.updateAgents(delta);
    this.updateDefenses(delta);
    this.updateEnemies(delta);
    this.enemyGrid.rebuild(this.enemies);
    this.updateProjectiles(delta);
    this.updateLootPickups(delta);
    this.releaseQueuedEnemies();
    this.player.attackCooldown = Math.max(
      0,
      this.player.attackCooldown - delta,
    );
    this.player.meleeCooldown = Math.max(
      0,
      this.player.meleeCooldown - delta,
    );
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);

    if (this.reinforcementsRemaining > 0) {
      this.reinforcementClock -= delta;
      if (this.reinforcementClock <= 0) {
        this.reinforcementsRemaining -= 1;
        const types = this.wave === 1
          ? FIRST_WAVE.reinforcement as unknown as EnemyType[]
          : Array.from(
              { length: Math.min(10, 4 + this.wave) },
              (_, index): EnemyType =>
                this.wave >= 6 && index === 0
                  ? "trojan"
                  : index % 3 === 0
                    ? "phisher"
                    : "virus",
            );
        if (this.wave !== 1) {
          this.reinforcementClock = Math.max(4, 6.6 - this.wave * 0.24);
        }
        const count = types.length;
        this.scheduledReinforcementThreats = Math.max(
          0,
          this.scheduledReinforcementThreats - count,
        );
        this.spawnFormation(types);
        if (this.wave !== 1) {
          this.callbacks.onToast({
            eyebrow: "HORDE REINFORCEMENT",
            title: `${count} MORE THREATS ENTERED`,
            detail:
              "Later waves keep sending reinforcements. Hold the perimeter.",
          });
        }
      }
    }

    if (
      this.waveActive &&
      canCompleteWave({
        active: this.enemies.length,
        queued: this.spawnQueue.length,
        scheduled: this.scheduledReinforcementThreats,
      }) &&
      this.waveEndClock === 0
    ) {
      this.waveActive = false;
      this.waveEndClock = 1.25;
    }
    if (this.waveEndClock > 0) {
      this.waveEndClock -= delta;
      if (this.waveEndClock <= 0) this.completeWave();
    }

    this.hudClock -= delta;
    if (this.hudClock <= 0) {
      this.hudClock = 0.1;
      this.emitHud();
    }
  }

  private recordWatchEvent(event: string) {
    if (!isWatchMode(this.sessionMode)) return;
    this.watchState = recordWatchEvent(this.watchState, event);
  }

  private runAutonomousNetwork(delta: number) {
    this.autonomousActionClock -= delta * 1_000;
    if (this.autonomousActionClock > 0 || this.agents.length === 0) return;
    this.autonomousActionClock = AUTONOMOUS_ACTION_INTERVAL_MS;
    if (isWatchMode(this.sessionMode) && this.agents.length < WARBAND_SLOTS.length) {
      const nextAgent = WARBAND_SLOTS[this.agents.length]?.id as AgentId | undefined;
      if (nextAgent && this.addAgent(nextAgent, { charge: true, notify: false })) {
        this.recordWatchEvent(nextAgent.toUpperCase() + " RECRUITED BY THE NETWORK");
        this.emitHud(true);
        return;
      }
    }
    const damagedAgent = this.agents.some((agent) => agent.hp < agent.maxHp);
    const damagedTurret = this.defenses.some((defense) => defense.hp < defense.maxHp);
    const action = chooseAutonomousNetworkAction({
      mode: this.mode,
      coreDamaged: this.core.hp < this.core.maxHp,
      components: this.loot.components,
      damagedAgent,
      repairKits: this.loot.repairs,
      damagedTurret,
      defenses: this.defenses.length,
      maxDefenses: 3,
      compute: this.data,
      defenseCost: 80 + this.defenses.length * 35,
      watchPriority: this.watchState.priority,
    });
    if (action === "repair-core") {
      const result = repairCore(this.core, this.loot.components);
      if (!result.repaired) return;
      this.core.hp = result.core.hp;
      this.loot.components = result.components;
      this.recordWatchEvent("AGENTS REPAIRED THE CORE");
      this.callbacks.onToast({
        eyebrow: "AUTONOMOUS CORE REPAIR",
        title: `CORE RESTORED +${CORE_REPAIR_AMOUNT}`,
        detail: `Agents spent ${CORE_REPAIR_COMPONENT_COST} Components to stabilize the network core.`,
      });
      this.emitHud(true);
    } else if (action === "repair-agent" || action === "repair-sentry") {
      this.recordWatchEvent(action === "repair-agent"
        ? "AGENT RETURNED TO REPAIR"
        : "SENTRY REPAIRED");
      this.useFieldKit();
    } else if (action === "build-sentry") {
      this.recordWatchEvent("AGENTS BUILT A SENTRY");
      this.buildDefense();
    }
  }

  private updatePlayer(delta: number) {
    this.playerMoving = false;
    let horizontal = 0;
    let vertical = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) horizontal -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) horizontal += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) vertical += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) vertical -= 1;
    horizontal += this.touchMove.x;
    vertical += -this.touchMove.y;
    const input = new THREE.Vector2(horizontal, vertical);
    if (input.lengthSq() > 1) input.normalize();
    if (input.lengthSq() > 0.01) {
      this.playerMoving = true;
      const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );
      const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw),
      );
      const movement = forward
        .multiplyScalar(input.y)
        .add(right.multiplyScalar(input.x))
        .normalize();
      this.lastMove.copy(movement);
      const previousPosition = this.player.group.position.clone();
      this.player.group.position.add(movement.multiplyScalar(delta * 4.8));
      this.clampToArena(this.player.group.position, ARENA_RADIUS);
      this.faceDirection(this.player.group, this.lastMove);
      this.recordTutorialMovement(previousPosition);
    }
  }

  private updateWatchOperator(delta: number) {
    if (!isWatchMode(this.sessionMode) || this.mode !== "playing") return;
    const threatRuntime = this.getNearestEnemy(this.core.group.position, 12) ??
      this.getNearestEnemy(this.player.group.position, 10);
    const threat = threatRuntime
      ? {
          x: threatRuntime.group.position.x,
          z: threatRuntime.group.position.z,
          distance: threatRuntime.group.position.distanceTo(this.player.group.position),
        }
      : null;
    const pickupRuntime = !threatRuntime
      ? [...this.pickups]
          .filter((candidate) => candidate.type !== "repair" || this.player.hp < this.player.maxHp)
          .sort((left, right) =>
            this.player.group.position.distanceTo(new THREE.Vector3(left.x, 0, left.y)) -
            this.player.group.position.distanceTo(new THREE.Vector3(right.x, 0, right.y)),
          )[0]
      : null;
    const directorResult = tickWatchDirector(
      this.watchDirectorState,
      {
        operator: {
          x: this.player.group.position.x,
          z: this.player.group.position.z,
          hpRatio: this.player.hp / this.player.maxHp,
        },
        core: {
          x: this.core.group.position.x,
          z: this.core.group.position.z,
          hpRatio: this.core.hp / this.core.maxHp,
        },
        threat,
        pickup: pickupRuntime
          ? {
              x: pickupRuntime.x,
              z: pickupRuntime.y,
              useful: pickupRuntime.type !== "repair" || this.player.hp < this.player.maxHp,
            }
          : null,
        zones: ARENA_ZONE_MARKERS.map(({ x, z }) => ({ x, z })),
        priority: this.watchState.priority,
      },
      delta * 1_000,
    );
    this.watchDirectorState = directorResult.state;
    if (directorResult.intent.reset) {
      this.recordWatchEvent(`WATCH DIRECTOR: ${directorResult.intent.reason}`);
      this.releaseQueuedEnemies();
    }
    const target = new THREE.Vector3(
      directorResult.intent.target.x,
      0,
      directorResult.intent.target.z,
    );
    const direction = target.clone().sub(this.player.group.position).setY(0);
    const distance = direction.length();
    const engaging = directorResult.intent.state === "engage" && threatRuntime !== null;
    if (distance > (engaging ? 4.4 : 0.55)) {
      direction.normalize();
      this.player.group.position.add(direction.multiplyScalar(delta * 3.2));
      this.clampToArena(this.player.group.position, ARENA_RADIUS - 0.5);
      this.faceDirection(this.player.group, direction);
      this.playerMoving = true;
    } else if (engaging && threatRuntime) {
      this.faceDirection(
        this.player.group,
        threatRuntime.group.position.clone().sub(this.player.group.position).setY(0),
      );
      if (distance <= 2.5) this.melee();
      this.attack();
    }
  }

  private recordTutorialMovement(previousPosition: THREE.Vector3) {
    if (this.tutorialStep !== "move" || !this.tutorialMarker) return;
    this.tutorialMoveDistance += previousPosition.distanceTo(
      this.player.group.position,
    );
    if (
      this.tutorialMoveDistance >= 2.5 &&
      this.player.group.position.distanceTo(this.tutorialMarker.position) <= 1.25
    ) {
      this.emitTutorialEvent("movement-complete");
    }
  }

  private updateTemporarySubAgents(delta: number) {
    const repairBay = {
      hp: this.repairBay.hp,
      maxHp: this.repairBay.maxHp,
      isSeparate: true,
      repairPerSecond: 18,
    };
    const active: WebglTemporarySubAgent[] = [];
    this.temporarySubAgents.forEach((subAgent, index) => {
      const parent = this.agents.find((agent) => agent.id === subAgent.parentId);
      if (!parent) {
        this.temporarySubAgentPool.release(
          subAgent.marker,
          (marker) => resetTemporarySubAgentMarker(marker, 0xffffff),
          (marker) => this.disposeDynamicObject(marker),
        );
        return;
      }
      const { canAct: parentCanAct } = getAgentActionState({
        ...parent,
        disabledLeftMs: parent.disabledLeft * 1_000,
      }, { repairBay });
      const angle = this.elapsed * 1.8 + index * 2.1;
      subAgent.marker.position
        .copy(parent.group.position)
        .add(new THREE.Vector3(Math.cos(angle) * 0.75, 0.3, Math.sin(angle) * 0.75));
      subAgent.marker.rotation.y += delta * 2.5;
      const attackTarget = this.enemies.find(
        (enemy) => enemy.group.position.distanceTo(subAgent.marker.position) < 6,
      );
      const coreThreat = this.enemies.find(
        (enemy) => enemy.group.position.distanceTo(this.core.group.position) < 7.5,
      );
      const result = tickTemporarySubAgent(
        subAgent,
        {
          attackTargetInRange: parentCanAct && Boolean(attackTarget),
          playerNeedsRepair:
            parentCanAct && this.player.hp < this.player.maxHp,
          coreThreatInRange: parentCanAct && Boolean(coreThreat),
        },
        delta * 1_000,
      );
      Object.assign(subAgent, result.state);
      updateTemporarySubAgentHealthCue(subAgent.marker, subAgent.lifetimeRatio);
      const healthBar = subAgent.marker.getObjectByName(
        "temporary-sub-agent-health",
      );
      healthBar?.quaternion.copy(this.camera.quaternion);
      if (result.expired) {
        this.addRing(subAgent.marker.position, parent.color, 0.1, 1.1, 0.2);
        this.temporarySubAgentPool.release(
          subAgent.marker,
          (marker) => resetTemporarySubAgentMarker(marker, 0xffffff),
          (marker) => this.disposeDynamicObject(marker),
        );
        return;
      }
      const action = result.action as TemporarySubAgentAction;
      if (action.type === "attack" && attackTarget) {
        this.damageEnemy(attackTarget, action.damage, subAgent.marker.position);
      } else if (action.type === "repair") {
        this.player.hp = Math.min(
          this.player.maxHp,
          this.player.hp + action.playerHealing,
        );
        for (const ally of this.agents) {
          ally.cooldownLeft = Math.max(
            0,
            ally.cooldownLeft - action.allyCooldownReductionMs / 1_000,
          );
        }
        this.addRing(subAgent.marker.position, parent.color, 0.12, 1.2, 0.25);
      } else if (action.type === "guard" && coreThreat) {
        coreThreat.slow = Math.max(coreThreat.slow, action.slowMs / 1_000);
        this.damageEnemy(coreThreat, action.damage, subAgent.marker.position);
      }
      active.push(subAgent);
    });
    this.temporarySubAgents = active;
  }

  private maybeSpawnTemporarySubAgent(
    agent: AgentRuntime,
    intent: AutonomyIntent,
    elapsedMs = 0,
  ) {
    const spawnState = tickSubAgentSpawnState(
      this.subAgentSpawnState[agent.id] ?? createSubAgentSpawnState(),
      elapsedMs,
    );
    this.subAgentSpawnState[agent.id] = spawnState;
    this.autonomyState[agent.id] = intent;
    if (intent !== "improvise") return;
    const spendableMaterials = getSpendableWarbandMaterials({
      components: this.loot.components,
      shards: this.loot.shards,
      warband: this.agents.map((candidate) => candidate.id),
    });
    const pressure = this.enemies.length / this.activeEnemyLimit;
    const spawnDecisionInput = {
      pressure,
      activeChildren: this.temporarySubAgents.filter(
        (subAgent) => subAgent.parentId === agent.id,
      ).length,
      totalActive: this.temporarySubAgents.length,
      materials: spendableMaterials,
      cooldownLeftMs: spawnState.cooldownLeftMs,
      maxPerParent: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT,
      globalCap: SUB_AGENT_GLOBAL_CAP,
    };
    const decision = getSubAgentSpawnDecision(spawnDecisionInput);
    if (!decision.allowed) return;
    const spawned = spawnTemporarySubAgent(
      { id: agent.id, role: AUTONOMY_ROLES[agent.id] },
      {
        enemyDensity: this.enemies.length,
        playerHealthRatio: this.player.hp / this.player.maxHp,
        coreHealthRatio: this.core.hp / this.core.maxHp,
        wavePressure: this.enemies.length / this.activeEnemyLimit,
        subAgents: this.temporarySubAgents,
        maxSubAgents: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT,
        materials: spendableMaterials,
        upgrades: { componentUpgradeRanks: this.componentUpgradeRanks },
      },
    ) as TemporarySubAgent | null;
    if (!spawned) return;
    this.loot.components -= SUB_AGENT_MATERIAL_COST.components;
    this.loot.shards -= SUB_AGENT_MATERIAL_COST.shards;
    const marker = this.temporarySubAgentPool.acquire(() =>
      createTemporarySubAgentMarker(agent.color),
    );
    resetTemporarySubAgentMarker(marker, agent.color, 1);
    this.scene.add(marker);
    this.temporarySubAgents.push({
      ...spawned,
      marker,
      maxLifetimeMs: spawned.remainingMs,
      cooldownLeftMs: 350,
      healthRatio: 1,
      lifetimeRatio: 1,
    });
    this.addRing(agent.group.position, agent.color, 0.12, 1.4, 0.28);
    this.addBurst(
      agent.group.position.clone().add(new THREE.Vector3(0, 0.35, 0)),
      agent.color,
      8,
    );
    this.subAgentSpawnState[agent.id] = {
      cooldownLeftMs: SUB_AGENT_SPAWN_COOLDOWN_MS,
    };
    this.callbacks.onToast({
      eyebrow: "TEMPORARY SUB-AGENT DEPLOYED",
      title: `${agent.name} DEPLOYED ${spawned.role.toUpperCase()} SUPPORT`,
      detail: `-${SUB_AGENT_MATERIAL_COST.components} COMPONENT · -${SUB_AGENT_MATERIAL_COST.shards} SHARD · ${spawned.remainingMs / 1_000} SECOND LIFETIME`,
    });
    this.emitHud(true);
  }

  private clearTemporarySubAgents() {
    for (const subAgent of this.temporarySubAgents) {
      this.temporarySubAgentPool.release(
        subAgent.marker,
        (marker) => resetTemporarySubAgentMarker(marker, 0xffffff),
        (marker) => this.disposeDynamicObject(marker),
      );
    }
    this.temporarySubAgents = clearSubAgents() as WebglTemporarySubAgent[];
    this.autonomyState = {};
    this.subAgentSpawnState = {};
  }

  private updateAgents(delta: number) {
    const count = this.agents.length;
    const priority = this.getPriorityEnemy();
    const repairBay = {
      hp: this.repairBay.hp,
      maxHp: this.repairBay.maxHp,
      isSeparate: true,
      repairPerSecond: 18,
    };
    this.agents.forEach((agent, index) => {
      const roleIntent = decideAgentIntent(
        { id: agent.id, role: AUTONOMY_ROLES[agent.id] },
        {
          enemyDensity: this.enemies.length,
          playerHealthRatio: this.player.hp / this.player.maxHp,
          coreHealthRatio: this.core.hp / this.core.maxHp,
          wavePressure: this.enemies.length / this.activeEnemyLimit,
        },
      ) as AutonomyIntent;
      const intent: AutonomyIntent =
        this.squadCommand === "auto"
          ? roleIntent
          : this.squadCommand === "follow"
          ? "follow"
          : this.squadCommand === "focus"
          ? "assault"
          : this.squadCommand === "defend"
            ? "defend"
            : roleIntent;
      agent.repairDecision = getRepairDecision(agent, {
        repairBay,
      });
      const gathering = tickAgentGathering(
        {
          id: agent.id,
          x: agent.group.position.x,
          y: agent.group.position.z,
          gatheringCooldownMs: agent.gatheringCooldownMs,
        },
        {
          hostileTargetInRange: Boolean(
            this.getNearestEnemy(agent.group.position, agent.range),
          ),
          retreating:
            agent.disabledLeft > 0 ||
            shouldWithdrawToRepairBay(agent.repairDecision, repairBay),
          nearbyLoot: this.pickups,
        },
        delta * 1000,
      );
      agent.gatheringCooldownMs = gathering.gatheringCooldownMs;
      agent.gatheringTargetId = gathering.gatheringTargetId;
      const gatheringPickup = agent.gatheringTargetId
        ? this.pickups.find((pickup) => pickup.id === agent.gatheringTargetId) ?? null
        : null;
      const angle =
        (index / Math.max(1, count)) * Math.PI * 2 +
        (isWatchMode(this.sessionMode) ? (this.cinemaState.elapsedMs / 1_000) * 0.22 : 0) +
        (intent === "support"
          ? (isWatchMode(this.sessionMode) ? this.cinemaState.elapsedMs / 1_000 : this.elapsed) * 0.18
          : 0);
      const withdrawing = shouldWithdrawToRepairBay(
        agent.repairDecision,
        repairBay,
      );
      const anchor =
        withdrawing
        ? this.repairBay.group.position
        : gatheringPickup
        ? new THREE.Vector3(gatheringPickup.x, 0.02, gatheringPickup.y)
        : intent === "follow"
          ? this.player.group.position
          : intent === "assault" && priority
          ? priority.group.position
          : intent === "support"
            ? this.player.hp / this.player.maxHp <= this.core.hp / this.core.maxHp
              ? this.player.group.position
              : this.core.group.position
            : intent === "defend"
              ? this.core.group.position
              : priority?.group.position ?? this.player.group.position;
      const assaultRadius = Math.max(2.6, agent.range * 0.46);
      const bossRadius = priority?.bossState
        ? Math.max(0.8, priority.bossState.attackRadius * 0.75)
        : Infinity;
      const radius = withdrawing || gatheringPickup
        ? 0
        : intent === "defend"
          ? 2.75
          : intent === "assault" || intent === "improvise"
            ? Math.min(assaultRadius, bossRadius)
            : 1.45 + (index % 2) * 0.38;
      const targetPosition = anchor
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            0.02 +
              (agent.rig
                ? 0
                : Math.abs(Math.sin(this.elapsed * 8 + index)) * 0.025),
            Math.sin(angle) * radius,
          ),
        );
      const flatTarget = new THREE.Vector2(targetPosition.x, targetPosition.z);
      if (flatTarget.length() > ARENA_RADIUS - 0.4) {
        flatTarget.setLength(ARENA_RADIUS - 0.4);
        targetPosition.x = flatTarget.x;
        targetPosition.z = flatTarget.y;
      }
      agent.moving = agent.group.position.distanceTo(targetPosition) > 0.18;
      agent.group.position.lerp(
        targetPosition,
        1 - Math.exp(-delta * (agent.id === "forge" ? 5 : 4)),
      );
      const atRepairBay =
        agent.group.position.distanceTo(this.repairBay.group.position) <= 1.35;
      const repaired = tickRepairBay(
        repairBay,
        [{
          ...agent,
          disabledLeftMs: agent.disabledLeft * 1_000,
          atRepairBay,
          repairing: atRepairBay && agent.repairDecision === "repair",
        }],
        delta * 1_000,
      );
      agent.hp = repaired.units[0].hp;
      agent.disabledLeft = repaired.units[0].disabledLeftMs / 1_000;
      agent.group.rotation.z = agent.rig
        ? 0
        : Math.sin(this.elapsed * 2.8 + index) * 0.06;
      const ring = agent.group.getObjectByName("agent-ring");
      if (ring) ring.rotation.z += delta * (0.8 + index * 0.12);
      const rotor = agent.group.getObjectByName("agent-rotor");
      if (rotor) rotor.rotation.z += delta * (3.4 + index * 0.3);
      const leftWing = agent.group.getObjectByName("agent-wing-left");
      const rightWing = agent.group.getObjectByName("agent-wing-right");
      if (leftWing) {
        leftWing.rotation.z = 0.08 + Math.sin(this.elapsed * 3 + index) * 0.12;
      }
      if (rightWing) {
        rightWing.rotation.z =
          -0.08 - Math.sin(this.elapsed * 3 + index) * 0.12;
      }
      const eye = agent.group.getObjectByName("agent-eye");
      if (eye) {
        eye.scale.x = 0.8 + Math.sin(this.elapsed * 5 + index) * 0.18;
      }
      const stride = agent.moving
        ? Math.sin(this.elapsed * 9.5 + index * 0.7)
        : 0;
      const leftLeg = agent.group.getObjectByName("agent-leg-left");
      const rightLeg = agent.group.getObjectByName("agent-leg-right");
      const leftArm = agent.group.getObjectByName("agent-arm-left");
      const rightArm = agent.group.getObjectByName("agent-arm-right");
      if (leftLeg) leftLeg.rotation.x = stride * 0.5;
      if (rightLeg) rightLeg.rotation.x = -stride * 0.5;
      if (leftArm) leftArm.rotation.x = -stride * 0.3 - 0.12;
      if (rightArm) rightArm.rotation.x = stride * 0.22 - 0.2;
      agent.cooldownLeft = Math.max(0, agent.cooldownLeft - delta);
      agent.skillCooldownLeftMs = Math.max(
        0,
        agent.skillCooldownLeftMs - delta * 1_000,
      );
      agent.barrierLeft = Math.max(0, agent.barrierLeft - delta);
      if (agent.barrierLeft === 0) agent.barrier = 0;
      const activeScale = agent.rig
        ? 0.84
        : agent.id === "forge"
          ? 0.92
          : 0.88;
      agent.group.scale.setScalar(
        agent.disabledLeft > 0 ? activeScale * 0.76 : activeScale,
      );
      const agentRatio = clamp01(agent.hp / agent.maxHp);
      agent.healthBar.quaternion.copy(this.camera.quaternion);
      agent.healthFill.scale.x = Math.max(0.001, agentRatio);
      agent.healthFill.position.x = -0.49 * (1 - agentRatio);
      this.updateRig(agent.rig, delta, agent.moving ? "run" : "idle");
      const actionState = getAgentActionState({
        ...agent,
        disabledLeftMs: agent.disabledLeft * 1_000,
      }, { repairBay });
      if (!actionState.canAct) return;
      agent.supportClock -= delta;

      if (gatheringPickup) {
        const collection = collectMaterials(
          {
            id: agent.id,
            x: agent.group.position.x,
            y: agent.group.position.z,
            gatheringCooldownMs: agent.gatheringCooldownMs,
          },
          this.pickups,
        );
        agent.gatheringCooldownMs = collection.agent.gatheringCooldownMs;
        if (collection.collected.repairs || collection.collected.components || collection.collected.shards) {
          this.loot.repairs += collection.collected.repairs;
          this.loot.components += collection.collected.components;
          this.loot.shards += collection.collected.shards;
          const pickupIndex = this.pickups.findIndex(
            (pickup) => pickup.id === collection.agent.gatheredLootId,
          );
          if (pickupIndex >= 0) {
            const [pickup] = this.pickups.splice(pickupIndex, 1);
            this.releaseLootPickup(pickup);
          }
          this.emitHud(true);
        }
      }

      this.maybeSpawnTemporarySubAgent(agent, roleIntent, delta * 1_000);

      if (agent.id === "covenant" && agent.supportClock <= 0) {
        const nanites = this.evolutions.covenant === "nanite-repair";
        const aegis = this.evolutions.covenant === "aegis-relay";
        const healingMultiplier =
          (getArmorBonuses(this.armorId).healingMultiplier ?? 1) *
          Math.pow(
            getAgentUpgradeMultiplier(
              "covenant",
              "nanite-reserve",
              "healingMultiplier",
            ),
            getComponentRank(this.componentUpgradeRanks, "covenant", "nanite-reserve"),
          );
        agent.supportClock = aegis ? 8 : 6.5;
        this.player.hp = Math.min(
          this.player.maxHp,
          this.player.hp + (nanites ? 18 : aegis ? 20 : 12) * healingMultiplier,
        );
        if (nanites) {
          for (const ally of this.agents) {
            ally.disabledLeft = Math.max(0, ally.disabledLeft - 1.5);
          }
        }
        this.addRing(this.player.group.position, agent.color, 0.4, 3.2, 0.72);
      }

      let target: EnemyRuntime | null = null;
      if (!gatheringPickup && (intent === "assault" || intent === "improvise")) {
        target = priority;
      } else if (!gatheringPickup && (intent === "follow" || intent === "support")) {
        target = this.getNearestEnemy(agent.group.position, agent.range);
      } else if (!gatheringPickup && intent === "defend") {
        const coreThreat = this.getNearestEnemy(this.core.group.position, 9.5);
        if (
          coreThreat &&
          coreThreat.group.position.distanceTo(agent.group.position) <=
            agent.range + 1.4
        ) {
          target = coreThreat;
        }
      }
      if (
        target &&
        target.group.position.distanceTo(agent.group.position) >
          agent.range + 0.9
      ) {
        target = null;
      }
      if (!target || agent.cooldownLeft > 0) return;
      const origin = agent.group.position
        .clone()
        .add(new THREE.Vector3(0, agent.rig ? 1.05 : 1.25, 0));
      const direction = target.group.position
        .clone()
        .add(new THREE.Vector3(0, target.radius, 0))
        .sub(origin)
        .normalize();
      this.faceDirection(agent.group, direction);
      agent.cooldownLeft =
        agent.cooldown *
        this.agentRateMultiplier *
        (agent.id === "kairos"
          ? Math.pow(
              getAgentUpgradeMultiplier(
                "kairos",
                "stasis-array",
                "cooldownMultiplier",
              ),
              getComponentRank(this.componentUpgradeRanks, "kairos", "stasis-array"),
            )
          : agent.id === "forge"
            ? Math.pow(
                getAgentUpgradeMultiplier(
                  "forge",
                  "breach-ammo",
                  "cooldownMultiplier",
                ),
                getComponentRank(this.componentUpgradeRanks, "forge", "breach-ammo"),
              )
            : 1) *
        (agent.id === "forge" &&
        this.evolutions.forge === "suppression-loop"
          ? 0.68
          : 1);
      this.triggerRig(agent.rig, "attack", 0.3);
      this.addBurst(origin, agent.color, agent.id === "forge" ? 3 : 5);
      if (agent.id === "kairos") {
        target.slow = Math.max(
          target.slow,
          this.evolutions.kairos === "stasis-lock" ? 2.8 : 1.6,
        );
        this.damageEnemy(
          target,
          agent.damage * this.agentDamageMultiplier,
          origin,
        );
        this.addBeam(
          origin,
          target.group.position
            .clone()
            .add(new THREE.Vector3(0, target.radius, 0)),
          agent.color,
          0.22,
        );
        this.addRing(target.group.position, agent.color, 0.1, 1.35, 0.38);
        if (this.evolutions.kairos === "cryo-mesh") {
          for (const chained of this.enemyGrid
            .query(target.group.position, 2.5)
            .filter((enemy) => enemy !== target)
            .slice(0, 2)) {
            chained.slow = Math.max(chained.slow, 1.12);
            this.damageEnemy(
              chained,
              agent.damage * this.agentDamageMultiplier * 0.7,
              target.group.position,
            );
          }
        }
        return;
      }
      const evolutionDamage =
        agent.id === "kira" &&
        this.evolutions.kira === "execution-protocol" &&
        target.hp / target.maxHp < 0.4
          ? 1.35
          : agent.id === "forge" &&
              this.evolutions.forge === "cluster-burst"
            ? 1.45
            : agent.id === "kira" && this.evolutions.kira === "rail-pierce"
              ? 1.22
              : 1;
      const componentDamage =
        agent.id === "kira"
          ? Math.pow(
              getAgentUpgradeMultiplier(
                "kira",
                "hunter-core",
                "damageMultiplier",
              ),
              getComponentRank(this.componentUpgradeRanks, "kira", "hunter-core"),
            )
          : agent.id === "forge"
            ? Math.pow(
                getAgentUpgradeMultiplier(
                  "forge",
                  "breach-ammo",
                  "damageMultiplier",
                ),
                getComponentRank(this.componentUpgradeRanks, "forge", "breach-ammo"),
              )
            : 1;
      this.fireProjectile(
        origin,
        direction,
        agent.color,
        agent.damage * this.agentDamageMultiplier * evolutionDamage * componentDamage,
        agent.id === "kira" ? 15 : agent.id === "forge" ? 12 : 10,
        "agent",
        agent.id === "covenant" ? 0.25 : 0,
        agent.id === "forge" ? 0.13 : 0.17,
      );
    });
    this.updateTemporarySubAgents(delta);
  }

  private updateDefenses(delta: number) {
    for (const defense of this.defenses) {
      defense.barrierLeft = Math.max(0, defense.barrierLeft - delta);
      if (defense.barrierLeft === 0) defense.barrier = 0;
      defense.healthBar.quaternion.copy(this.camera.quaternion);
      const healthRatio = clamp01(defense.hp / defense.maxHp);
      defense.healthFill.scale.x = Math.max(0.001, healthRatio);
      defense.healthFill.position.x = -0.54 * (1 - healthRatio);
      if (defense.hp <= 0) continue;
      defense.cooldownLeft = Math.max(0, defense.cooldownLeft - delta);
      const ring = defense.group.getObjectByName("sentry-ring");
      if (ring) ring.rotation.z += delta * (0.6 + defense.index * 0.12);
      const target = this.getNearestEnemy(defense.group.position, 8.5);
      if (!target) {
        defense.turret.rotation.y += delta * 0.4;
        continue;
      }
      const direction = target.group.position
        .clone()
        .add(new THREE.Vector3(0, target.radius, 0))
        .sub(defense.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)))
        .normalize();
      defense.turret.rotation.y = Math.atan2(-direction.x, -direction.z);
      if (defense.cooldownLeft > 0) continue;
      defense.cooldownLeft = Math.max(0.38, 0.82 - this.wave * 0.025);
      this.fireProjectile(
        defense.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
        direction,
        0x9ed8dd,
        18 + this.wave * 1.5,
        14,
        "agent",
        0,
        0.15,
      );
      this.addRing(defense.group.position, 0x9ed8dd, 0.08, 0.55, 0.15);
    }
  }

  private updateBossEnemy(enemy: EnemyRuntime, delta: number) {
    if (!enemy.bossState) return;
    const bossTargets = [
      ...this.agents.map((agent) => ({
        id: agent.id,
        kind: "agent" as const,
        hp: agent.hp,
        x: agent.group.position.x,
        z: agent.group.position.z,
      })),
      ...this.defenses.map((defense) => ({
        id: String(defense.index),
        kind: "turret" as const,
        hp: defense.hp,
        x: defense.group.position.x,
        z: defense.group.position.z,
      })),
    ];
    const result = tickBoss(
      { ...enemy.bossState, hp: enemy.hp },
      delta * 1_000,
      {
        targets: bossTargets,
        bossX: enemy.group.position.x,
        bossZ: enemy.group.position.z,
        enemyCapacity: Math.max(
          0,
          this.activeEnemyLimit - this.enemies.length,
        ),
      },
    );
    enemy.bossState = result.boss;
    enemy.telegraphLeft = result.boss.telegraphLeftMs / 1_000;
    enemy.telegraphTotal = result.boss.telegraphMs / 1_000;

    for (const event of result.events) {
      if (event.type === "telegraph" && enemy.bossVisual) {
        enemy.bossVisual.position.set(event.x, 0.04, event.z);
        enemy.bossVisual.userData.targetId = event.targetId;
        enemy.bossVisual.userData.targetKind = event.targetKind;
        enemy.bossVisual.visible = true;
      }
      if (event.type === "damage") {
        if (event.targetKind === "agent") {
          const target = this.agents.find(
            (candidate) => candidate.id === event.targetId,
          );
          if (target) this.damageAgent(target, event.amount);
        }
        if (event.targetKind === "turret") {
          const target = this.defenses.find(
            (candidate) => String(candidate.index) === event.targetId,
          );
          if (target) this.damageDefense(target, event.amount);
        }
      }
      if (event.type === "reinforcement") {
        this.spawnFormation(
          Array.from(
            { length: event.count },
            (_, index): EnemyType => index % 2 === 0 ? "virus" : "phisher",
          ),
        );
      }
    }

    if (enemy.bossVisual) {
      enemy.bossVisual.visible = result.boss.telegraphLeftMs > 0;
      if (enemy.bossVisual.visible) {
        const pulse = 1 + Math.sin(this.elapsed * 9) * 0.08;
        enemy.bossVisual.scale.setScalar(result.boss.attackRadius * pulse);
        enemy.bossVisual.rotation.y += delta * 0.9;
      }
    }

    if (Math.floor(this.elapsed * 60) % getQualitySettings(this.qualityPreset).robotAnimationStride === 0) {
      enemy.robotAnimate(
        this.elapsed,
        delta,
        result.boss.telegraphLeftMs === 0,
        this.reducedMotion,
      );
    }
    enemy.healthBar.quaternion.copy(this.camera.quaternion);
    const pendingTarget = getPendingBossTarget(result.boss, bossTargets);
    const movementTarget =
      pendingTarget ??
      getNearestBossTarget(
        bossTargets,
        enemy.group.position.x,
        enemy.group.position.z,
      );
    if (movementTarget && result.boss.telegraphLeftMs === 0) {
      const arrivalDistance = Math.max(0.75, result.boss.attackRadius * 0.86);
      const distance = enemy.group.position.distanceTo(
        new THREE.Vector3(movementTarget.x, 0, movementTarget.z),
      );
      if (distance > arrivalDistance) {
        const slowFactor = getSlowMovementMultiplier(
          enemy.slow * 1_000,
          enemy.slowMultiplier,
        );
        const advance = resolveEnemyAdvance(
          {
            position: {
              x: enemy.group.position.x,
              z: enemy.group.position.z,
            },
            target: {
              id: movementTarget.id,
              x: movementTarget.x,
              z: movementTarget.z,
            },
            routeBias: this.terrain.routeBias,
            arrivalDistance,
            watchdog: enemy.movementWatchdog,
          },
          delta * 1_000,
        );
        enemy.movementWatchdog = advance.watchdog;
        const direction = new THREE.Vector3(advance.vector.x, 0, advance.vector.z);
        enemy.group.position.add(
          direction
            .normalize()
            .multiplyScalar(delta * enemy.speed * slowFactor),
        );
        this.faceDirection(enemy.group, direction);
      }
    }
  }

  private updateEnemies(delta: number) {
    for (const enemy of [...this.enemies]) {
      enemy.cooldownLeft = Math.max(0, enemy.cooldownLeft - delta);
      enemy.slow = Math.max(0, enemy.slow - delta);
      if (enemy.slow === 0) enemy.slowMultiplier = 0.48;
      enemy.markedLeft = Math.max(0, enemy.markedLeft - delta);
      enemy.armorBrokenLeft = Math.max(0, enemy.armorBrokenLeft - delta);
      if (enemy.armorBrokenLeft === 0) enemy.armorBreakReduction = 0;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
      if (enemy.decoyOwnerId !== null) {
        enemy.decoyLeft -= delta;
        const ownerActive = this.enemies.some(
          (threat) => threat.id === enemy.decoyOwnerId,
        );
        if (enemy.decoyLeft <= 0 || !ownerActive) {
          this.disposeDynamicObject(enemy.group);
          this.enemies.splice(this.enemies.indexOf(enemy), 1);
        }
        continue;
      }
      if (enemy.bossState) {
        this.updateBossEnemy(enemy, delta);
        continue;
      }
      const enemyMaterial = enemy.body.material as THREE.MeshStandardMaterial;
      enemyMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        enemy.type === "rootkit" ? 1.4 : 0.8,
        4.2,
        clamp01(enemy.hitFlash / 0.11),
      );
      const position = enemy.group.position;
      const playerDistance = position.distanceTo(this.player.group.position);
      const agentTarget = this.agents
        .filter((agent) => agent.hp > 0 && agent.disabledLeft <= 0)
        .sort((left, right) =>
          position.distanceTo(left.group.position) - position.distanceTo(right.group.position),
        )[0];
      const turretTarget = this.defenses
        .filter((defense) => defense.hp > 0)
        .sort((left, right) =>
          position.distanceTo(left.group.position) - position.distanceTo(right.group.position),
        )[0];
      const agentDistance = agentTarget
        ? position.distanceTo(agentTarget.group.position)
        : Infinity;
      const turretDistance = turretTarget
        ? position.distanceTo(turretTarget.group.position)
        : Infinity;
      const repairBayDistance = this.repairBay.hp > 0
        ? position.distanceTo(this.repairBay.group.position)
        : Infinity;
      const targetKind =
        playerDistance < 4.2
          ? "player"
          : agentDistance < 6.5
            ? "agent"
            : turretDistance < 6.5
              ? "turret"
              : repairBayDistance < 6.5
                ? "repair-bay"
                : "core";
      const targetPosition = targetKind === "player"
        ? this.player.group.position
        : targetKind === "agent" && agentTarget
          ? agentTarget.group.position
          : targetKind === "turret" && turretTarget
            ? turretTarget.group.position
            : targetKind === "repair-bay"
              ? this.repairBay.group.position
              : this.core.group.position;
      const distance = position.distanceTo(targetPosition);

      if (Math.floor(this.elapsed * 60) % getQualitySettings(this.qualityPreset).robotAnimationStride === 0) {
        enemy.robotAnimate(
          this.elapsed,
          delta,
          distance > enemy.range * 0.72,
          this.reducedMotion,
        );
      }
      enemy.healthBar.quaternion.copy(this.camera.quaternion);

      if (
        enemy.type === "rootkit" &&
        enemy.hp / enemy.maxHp < 0.68 &&
        enemy.bossPhase === 1
      ) {
        enemy.bossPhase = 2;
        enemy.speed *= 1.16;
        enemy.attackCooldown *= 0.84;
        const baseAngle = Math.atan2(position.z, position.x);
        for (let index = 0; index < 4; index += 1) {
          const angle = baseAngle + (index - 1) * 0.6;
          this.createEnemy(
            index % 2 === 0 ? "phisher" : "virus",
            position
              .clone()
              .add(
                new THREE.Vector3(Math.cos(angle) * 2, 0, Math.sin(angle) * 2),
              ),
          );
        }
        this.addRing(position, 0xd14b34, 0.4, 4.5, 0.75, "portal");
        this.callbacks.onToast({
          eyebrow: "ROOTKIT PHASE II",
          title: "THE SHELL HAS SPLIT",
          detail: "It is faster now. Collapse the spawned processes first.",
        });
      }
      if (
        enemy.type === "rootkit" &&
        enemy.hp / enemy.maxHp < 0.34 &&
        enemy.bossPhase === 2
      ) {
        enemy.bossPhase = 3;
        enemy.speed *= 1.3;
        enemy.attackCooldown *= 0.65;
        const baseAngle = Math.atan2(position.z, position.x);
        for (let index = 0; index < 6; index += 1) {
          const angle = baseAngle + (index / 6) * Math.PI * 2;
          this.createEnemy(
            index < 2 ? "trojan" : "virus",
            position
              .clone()
              .add(
                new THREE.Vector3(
                  Math.cos(angle) * 2.8,
                  0,
                  Math.sin(angle) * 2.8,
                ),
              ),
          );
        }
        this.addRing(position, 0xffe1c8, 0.6, 7, 0.95, "portal");
        this.callbacks.onToast({
          eyebrow: "ROOTKIT PHASE III",
          title: "THE CORE IS EXPOSED",
          detail:
            "Final damage race. Use EMP before the remaining processes overwhelm the Core.",
        });
      }

      if (enemy.telegraphLeft > 0) {
        enemy.telegraphLeft -= delta;
        const pulse =
          1 +
          Math.sin((enemy.telegraphLeft / enemy.telegraphTotal) * Math.PI * 6) *
            0.08;
        // The robot factory owns the definition scale on the parent group.
        // Telegraphs should only pulse the local torso, otherwise the torso
        // becomes permanently larger than its legs and overlays.
        enemy.body.scale.setScalar(pulse);
        if (enemy.telegraphLeft <= 0) {
          enemy.cooldownLeft = enemy.attackCooldown;
          enemy.body.scale.setScalar(1);
          if (enemy.type === "phisher") {
            if (enemy.resistanceFlags.includes("decoy")) {
              const hasActiveDecoys = this.enemies.some(
                (threat) => threat.decoyOwnerId === enemy.id,
              );
              if (!hasActiveDecoys) {
                for (const offset of getPhisherDecoyOffsets(
                  this.wave,
                  enemy.id,
                )) {
                  this.createEnemy(
                    "phisher",
                    position
                      .clone()
                      .add(new THREE.Vector3(offset.x, 0, offset.z)),
                    { decoyOwnerId: enemy.id, reward: 0 },
                  );
                }
              }
            }
            const availableAgents = this.agents.filter(
              (agent) => agent.disabledLeft <= 0,
            );
            if (availableAgents.length > 0 && Math.random() < 0.4) {
              const disabled =
                availableAgents[enemy.id % availableAgents.length];
              disabled.disabledLeft = 3.2;
              this.addRing(disabled.group.position, 0xb7422e, 0.2, 1.6, 0.48);
              this.callbacks.onToast({
                eyebrow: "PHISHER JAM DETECTED",
                title: `${disabled.name} IS OFFLINE`,
                detail:
                  "The agent will reboot in three seconds. Prioritise the Phisher.",
              });
            }
            const origin = position.clone().add(new THREE.Vector3(0, 0.8, 0));
            this.fireProjectile(
              origin,
              targetPosition
                .clone()
                .add(new THREE.Vector3(0, 0.5, 0))
                .sub(origin)
                .normalize(),
              0xb7422e,
              enemy.damage,
              7.2,
              "null",
              0,
              0.2,
            );
          } else if (distance <= enemy.range + 0.9) {
            if (enemy.type === "rootkit") {
              const updates = getRootkitRebootUpdates(
                {
                  id: enemy.id,
                  x: position.x,
                  z: position.z,
                  resistanceFlags: enemy.resistanceFlags,
                },
                this.enemies.map((threat) => ({
                  id: threat.id,
                  x: threat.group.position.x,
                  z: threat.group.position.z,
                  hp: threat.hp,
                  maxHp: threat.maxHp,
                  slow: threat.slow,
                  decoyOwnerId: threat.decoyOwnerId,
                })),
              );
              for (const update of updates) {
                const rebooted = this.enemies.find(
                  (threat) => threat.id === update.id,
                );
                if (!rebooted) continue;
                rebooted.hp = update.hp;
                rebooted.slow = update.slow;
                const ratio = clamp01(rebooted.hp / rebooted.maxHp);
                rebooted.healthFill.scale.x = Math.max(0.001, ratio);
                rebooted.healthFill.position.x = -0.59 * (1 - ratio);
                this.addBeam(position, rebooted.group.position, 0xe86b64, 0.28);
              }
            }
            if (targetKind === "agent" && agentTarget) {
              this.damageAgent(agentTarget, enemy.damage);
            } else if (targetKind === "turret" && turretTarget) {
              this.damageDefense(turretTarget, enemy.damage);
            } else if (targetKind === "repair-bay") {
              this.damageRepairBay(enemy.damage);
            } else {
              this.damageTarget(targetKind === "player" ? "player" : "core", enemy.damage);
            }
            this.addRing(
              targetPosition,
              0xb7422e,
              0.25,
              enemy.type === "rootkit" ? 2.5 : 1.3,
              0.32,
            );
          }
        }
        continue;
      }

      if (distance <= enemy.range && enemy.cooldownLeft <= 0) {
        enemy.telegraphLeft = enemy.telegraphTotal;
        this.addRing(
          position,
          0xb7422e,
          0.25,
          Math.max(1.2, enemy.range),
          enemy.telegraphTotal,
          "portal",
        );
        continue;
      }

      const arrivalDistance = Math.max(0.75, enemy.range * 0.86);
      if (distance > arrivalDistance) {
        const slowFactor = getSlowMovementMultiplier(
          enemy.slow * 1_000,
          enemy.slowMultiplier,
        );
        const routeBias =
          this.terrain.routeBias * (enemy.id % 2 === 0 ? 1 : -1);
        const advance = resolveEnemyAdvance(
          {
            position: { x: position.x, z: position.z },
            target: { id: targetKind, x: targetPosition.x, z: targetPosition.z },
            routeBias,
            arrivalDistance,
            watchdog: enemy.movementWatchdog,
          },
          delta * 1_000,
        );
        enemy.movementWatchdog = advance.watchdog;
        const direction = new THREE.Vector3(advance.vector.x, 0, advance.vector.z);
        position.add(
          direction.multiplyScalar(delta * enemy.speed * slowFactor),
        );
        this.faceDirection(enemy.group, direction);
      }
    }
  }

  private updateProjectiles(delta: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.life -= delta;
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.rotation.x += delta * 5;
      projectile.mesh.rotation.y += delta * 7;
      if (projectile.life <= 0) {
        this.removeProjectile(projectile);
        continue;
      }
      if (projectile.faction === "null") {
        const hit = findHostileProjectileHit(
          {
            x: projectile.mesh.position.x,
            z: projectile.mesh.position.z,
            radius: projectile.radius,
          },
          [
            { id: "player", kind: "player", x: this.player.group.position.x, z: this.player.group.position.z, radius: 0.52, hp: this.player.hp },
            { id: "core", kind: "core", x: this.core.group.position.x, z: this.core.group.position.z, radius: 1, hp: this.core.hp },
            { id: "repair-bay", kind: "repair-bay", x: this.repairBay.group.position.x, z: this.repairBay.group.position.z, radius: 0.7, hp: this.repairBay.hp },
            ...this.agents.map((agent) => ({ id: agent.id, kind: "agent", x: agent.group.position.x, z: agent.group.position.z, radius: 0.52, hp: agent.hp })),
            ...this.defenses.map((defense) => ({ id: String(defense.index), kind: "turret", x: defense.group.position.x, z: defense.group.position.z, radius: 0.6, hp: defense.hp })),
          ],
        );
        if (hit?.kind === "agent") {
          const agent = this.agents.find((candidate) => candidate.id === hit.id);
          if (agent) this.damageAgent(agent, projectile.damage);
        } else if (hit?.kind === "turret") {
          const defense = this.defenses.find(
            (candidate) => String(candidate.index) === hit.id,
          );
          if (defense) this.damageDefense(defense, projectile.damage);
        } else if (hit?.kind === "repair-bay") {
          this.damageRepairBay(projectile.damage);
        } else if (hit?.kind === "player" || hit?.kind === "core") {
          this.damageTarget(hit.kind, projectile.damage);
        }
        if (hit) {
          this.addBurst(projectile.mesh.position, 0xb7422e, 7);
          this.removeProjectile(projectile);
        }
        continue;
      }
      const candidates = this.enemyGrid.query(
        projectile.mesh.position,
        projectile.radius + 1.6,
      );
      for (const enemy of candidates) {
        const distance = projectile.mesh.position.distanceTo(
          enemy.group.position
            .clone()
            .add(new THREE.Vector3(0, enemy.radius, 0)),
        );
        if (distance > projectile.radius + enemy.radius) continue;
        if (projectile.slow > 0) {
          enemy.slow = Math.max(enemy.slow, projectile.slow);
          enemy.slowMultiplier = Math.min(enemy.slowMultiplier, 0.48);
        }
        this.damageEnemy(enemy, projectile.damage, projectile.mesh.position);
        this.removeProjectile(projectile);
        break;
      }
    }
  }

  private updateLootPickups(delta: number) {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      pickup.mesh.rotation.y += delta * 2.4;
      pickup.mesh.position.y = 0.62 + Math.sin(this.elapsed * 3 + index) * 0.1;
      pickup.mesh.scale.setScalar(
        Math.min(1, pickup.mesh.scale.x + delta * 5) *
          (1 + Math.sin(this.elapsed * 4 + index) * 0.035),
      );
      if (!canCollectLoot({ x: this.player.group.position.x, y: this.player.group.position.z }, pickup)) continue;
      const next = applyLootPickup({
        health: this.player.hp,
        maxHealth: this.player.maxHp,
        repairKits: this.loot.repairs,
        components: this.loot.components,
        upgradeShards: this.loot.shards,
      }, pickup);
      this.player.hp = next.health;
      this.loot.repairs = next.repairKits ?? 0;
      this.loot.components = next.components ?? 0;
      this.loot.shards = next.upgradeShards ?? 0;
      const presentation = getLootPresentation(pickup.type, pickup.value);
      this.callbacks.onToast({ eyebrow: "LOOT COLLECTED", title: presentation.toastText, detail: "Recovered from a destroyed threat." });
      this.releaseLootPickup(pickup);
      this.pickups.splice(index, 1);
      this.emitHud(true);
    }
  }

  private releaseLootPickup(pickup: LootRuntime) {
    this.lootPool.release(pickup.mesh, (mesh) => resetLootPickupMesh(mesh, pickup.type), (mesh) => this.disposeDynamicObject(mesh));
  }

  private clearLootPickups() {
    for (const pickup of this.pickups) this.releaseLootPickup(pickup);
    this.pickups.length = 0;
  }

  private updateEffects(delta: number) {
    this.combatComboLife = Math.max(0, this.combatComboLife - delta);
    if (this.combatComboLife === 0) this.combatCombo = 0;
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= delta;
      const progress = 1 - effect.life / effect.maxLife;
      if (effect.kind === "ring" || effect.kind === "portal") {
        const material = (effect.object as THREE.Mesh)
          .material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(
          0,
          (1 - progress) * (effect.kind === "portal" ? 0.72 : 0.9),
        );
        if (effect.kind === "portal") {
          effect.object.rotation.z += delta * 2.8;
        }
      }
      if (effect.kind === "beam" || effect.kind === "slash") {
        const material = (effect.object as THREE.Line)
          .material as THREE.LineBasicMaterial;
        material.opacity = Math.max(0, 1 - progress);
      }
      if (effect.kind === "burst") {
        effect.object.children.forEach((child) => {
          const velocity = child.userData.velocity as THREE.Vector3 | undefined;
          if (velocity) {
            child.position.add(velocity.clone().multiplyScalar(delta));
            velocity.y -= delta * 2.4;
          }
          child.scale.setScalar(Math.max(0.05, 1 - progress));
        });
      }
      if (effect.kind === "text") {
        effect.object.position.y += delta * 0.9;
        const material = (effect.object as THREE.Sprite)
          .material as THREE.SpriteMaterial;
        material.opacity = Math.max(0, 1 - progress);
        effect.object.scale.multiplyScalar(1 + delta * 0.18);
      }
      if (effect.life <= 0) {
        this.releaseEffect(effect);
        this.effects.splice(index, 1);
      }
    }
  }

  private updateCamera(delta: number) {
    const focus = this.getCameraFocusPosition();
    if (focus) {
      this.desiredCameraTarget.copy(focus);
      if (this.cinemaState.cleanView) {
        this.cinemaTarget.copy(focus);
        this.hasCinemaTarget = true;
      }
    } else if (this.cinemaHoldClock > 0 && this.hasCinemaTarget) {
      this.desiredCameraTarget.copy(this.cinemaTarget);
    } else {
      this.desiredCameraTarget
        .copy(this.core.group.position)
        .multiplyScalar(0.35)
        .add(this.player.group.position.clone().multiplyScalar(0.65));
    }
    this.cameraTarget.lerp(
      this.desiredCameraTarget,
      1 - Math.exp(-delta * 4.2),
    );
    if (
      this.cinemaState.cleanView &&
      this.mode === "playing" &&
      !this.watchState.paused &&
      !this.cinemaState.paused &&
      !this.reducedMotion
    ) {
      this.yaw += delta * 0.045;
    }
    const distance = this.cinemaState.cleanView ? 25 : 23;
    const cameraOffset = new THREE.Vector3(
      Math.sin(this.yaw) * distance,
      15.5,
      Math.cos(this.yaw) * distance,
    );
    const shakeAmount =
      this.reducedMotion || this.shake <= 0
        ? 0
        : this.shake * (0.4 + Math.random() * 0.6);
    this.camera.position
      .copy(this.cameraTarget)
      .add(cameraOffset)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * shakeAmount,
          (Math.random() - 0.5) * shakeAmount,
          (Math.random() - 0.5) * shakeAmount,
        ),
      );
    this.camera.lookAt(this.cameraTarget);
    this.shake = Math.max(0, this.shake - delta * 1.8);
    this.cinemaHoldClock = Math.max(0, this.cinemaHoldClock - delta);
  }

  private getCameraFocusPosition() {
    const focusId = this.cameraFocusId;
    if (focusId === "core") return this.core.group.position.clone();
    if (focusId === "repair-bay") return this.repairBay.group.position.clone();
    if (focusId === "compute-node") return new THREE.Vector3(3.1, 0, 1.15);
    if (focusId === "north-breach") return new THREE.Vector3(0, 0, -4);
    if (focusId === "south-breach") return new THREE.Vector3(0, 0, 4);
    if (focusId === "boss-portal") return new THREE.Vector3(0, 0, -6.45);

    if (focusId) {
      const [kind, ...keyParts] = focusId.split("-");
      const key = keyParts.join("-");
      if (kind === "agent") {
        const agent = this.agents.find((candidate) => candidate.id === key);
        if (agent) return agent.group.position.clone();
      }
      if (kind === "threat") {
        const enemy = this.enemies.find((candidate) => String(candidate.id) === key);
        if (enemy) return enemy.group.position.clone();
      }
      if (kind === "loot") {
        const pickup = this.pickups.find((candidate) => candidate.id === key);
        if (pickup) return new THREE.Vector3(pickup.x, 0, pickup.y);
      }
      if (kind === "sentry") {
        const defenseKey = key.startsWith("sentry-") ? key.slice("sentry-".length) : key;
        const defense = this.defenses.find((candidate) => String(candidate.index) === defenseKey);
        if (defense) return defense.group.position.clone();
      }
      if (focusId.startsWith("sub-agent-")) {
        const subAgentKey = focusId.slice("sub-agent-".length);
        const subAgent =
          this.temporarySubAgents.find((candidate) => candidate.id === subAgentKey) ??
          this.temporarySubAgents[Number(subAgentKey)];
        if (subAgent) return subAgent.marker.position.clone();
      }
      if (kind === "boss") {
        const boss = this.enemies.find((candidate) => candidate.bossState);
        if (boss) return boss.group.position.clone();
      }
    }

    if (this.cinemaState.cleanView) {
      const priorityBoss = this.enemies.find((enemy) => enemy.bossState);
      if (priorityBoss) return priorityBoss.group.position.clone();
      const breachEnemy = this.enemies.find(
        (enemy) => enemy.group.position.distanceTo(this.core.group.position) <= 4.5,
      );
      if (breachEnemy) return breachEnemy.group.position.clone();
      const pickup = this.pickups[this.pickups.length - 1];
      if (pickup) return new THREE.Vector3(pickup.x, 0, pickup.y);
      return this.core.group.position.clone();
    }
    return null;
  }

  private completeWave() {
    this.resetInput();
    this.clearTemporarySubAgents();
    this.cancelDefensePlacement(false);
    this.loot = creditPendingMaterialLoot(
      this.loot,
      this.pickups,
    ) as LootCounters;
    this.clearLootPickups();
    if (this.wave >= TOTAL_WAVES && !isWatchMode(this.sessionMode)) {
      this.mode = "victory";
      this.score += Math.round(this.core.hp * 5 + this.player.hp * 3);
      this.best = Math.max(this.best, this.score);
      writeStoredValue("freeman-protocol-best", String(this.best));
      this.callbacks.onMode("victory");
      this.triggerRig(this.player.rig, "cheer", 2.2);
      for (const agent of this.agents) {
        this.triggerRig(agent.rig, "cheer", 2.2);
      }
      this.audio.play("victory");
      this.callbacks.onToast({
        eyebrow: "MISSION COMPLETE",
        title: "THE NETWORK IS SAFE",
        detail:
          "You survived all eight encounters and contained Rootkit Prime.",
      });
      this.emitHud(true);
      return;
    }
    if (isWatchMode(this.sessionMode)) {
      this.loot.components += WATCH_COMPONENT_SALVAGE_PER_WAVE;
      this.recordWatchEvent(`NETWORK SALVAGE +${WATCH_COMPONENT_SALVAGE_PER_WAVE} COMPONENTS`);
      const reward = {
        compute: this.wave === 4 || this.wave === 7 ? 42 : 24,
        components: this.loot.components,
        shards: this.loot.shards,
      };
      this.watchState = creditWatchWaveReward(this.watchState, reward);
      persistWatchRewards(reward);
      this.core.hp = Math.min(
        this.core.maxHp,
        this.core.hp + WATCH_INTERMISSION_CORE_REPAIR,
      );
    }
    this.data += this.wave === 4 || this.wave === 7 ? 42 : 24;
    this.intermissionClock = WAVE_INTERMISSION_MS;
    this.callbacks.onMode("playing");
    const autonomousUpgrade = getUpgradeChoices(this.wave, this.upgradeStacks)[0];
    if (autonomousUpgrade) {
      this.applyUpgrade(autonomousUpgrade.id);
    }
    this.callbacks.onToast({
      eyebrow: `WAVE ${this.wave} CLEARED`,
      title: "NETWORK RECONFIGURING",
      detail: "Build defenses and deploy reserves. The next wave begins in 3 seconds.",
    });
    this.audio.play("wave");
    this.emitHud(true);
  }

  private triggerWatchRecovery() {
    if (!isWatchMode(this.sessionMode) || this.watchRecoveryClock > 0) return false;
    this.watchRecoveryClock = 12;
    this.core.hp = Math.max(32, Math.round(this.core.maxHp * 0.32));
    this.loot.components += 4;
    this.loot.shards += 1;
    for (const enemy of this.enemies) {
      enemy.slow = Math.max(enemy.slow, 4);
      enemy.hp = Math.min(enemy.hp, Math.max(1, enemy.maxHp * 0.55));
    }
    this.recordWatchEvent("WATCH RECOVERY PULSE");
    this.callbacks.onToast({
      eyebrow: "EMERGENCY NETWORK RECOVERY",
      title: "WATCH RECOVERY PULSE",
      detail: "The AI network slowed the breach, rebuilt the Core, and salvaged 4 Components.",
    });
    this.emitHud(true);
    return true;
  }

  private damageTarget(target: "player" | "core", damage: number) {
    if (isWatchMode(this.sessionMode) && target === "player") return;
    if (isWatchMode(this.sessionMode)) {
      damage *= WATCH_INCOMING_DAMAGE_MULTIPLIER;
    }
    const floor = isTutorialProtected(this.tutorialStep) ? 1 : 0;
    if (target === "player") {
      if (this.player.invulnerable > 0) return;
      this.player.hp = Math.max(floor, this.player.hp - damage);
      this.player.invulnerable = 0.28;
      this.triggerRig(this.player.rig, "hit", 0.34);
      this.addDamageNumber(
        this.player.group.position.clone().add(new THREE.Vector3(0, 2.25, 0)),
        `-${Math.round(damage)}`,
        0xff8a68,
      );
      this.addBurst(
        this.player.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
        0xb7422e,
        8,
      );
    } else {
      this.core.hp = Math.max(floor, this.core.hp - damage);
      if (isWatchMode(this.sessionMode) && this.core.hp <= 0) {
        if (!this.triggerWatchRecovery()) this.core.hp = 8;
      }
      const feedback = classifyCombatFeedback({
        kind: "core-warning",
        damage,
        critical: false,
        target: "core",
      });
      this.addDamageNumber(
        this.core.group.position.clone().add(new THREE.Vector3(0, 2.55, 0)),
        feedback.label,
        feedback.emphasis,
      );
      this.addBurst(
        this.core.group.position.clone().add(new THREE.Vector3(0, 1, 0)),
        0xb7422e,
        8,
      );
    }
    this.hitStop = Math.max(this.hitStop, 0.035);
    this.shake = Math.max(this.shake, this.reducedMotion ? 0.03 : 0.2);
    this.audio.play("damage");
    this.emitHud(true);
    if (!isWatchMode(this.sessionMode) && (this.player.hp <= 0 || this.core.hp <= 0)) this.defeat();
  }

  private damageAgent(agent: AgentRuntime, damage: number) {
    const absorbed = Math.min(agent.barrier, Math.max(0, damage));
    agent.barrier -= absorbed;
    const resolvedDamage = Math.max(0, damage - absorbed);
    const damaged = applyUnitDamage(
      { hp: agent.hp, maxHp: agent.maxHp, disabledLeftMs: agent.disabledLeft * 1_000 },
      resolveAgentDamage(resolvedDamage, agent.armorProfile),
    );
    agent.hp = damaged.hp;
    agent.disabledLeft = damaged.disabledLeftMs / 1_000;
    this.triggerRig(agent.rig, "hit", 0.28);
    this.addDamageNumber(
      agent.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)),
      absorbed > 0 ? `BARRIER ${Math.round(absorbed)}` : `-${Math.round(resolvedDamage)}`,
      absorbed > 0 ? 0x9ed8dd : 0xff8a68,
    );
    this.addBurst(agent.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xb7422e, 6);
  }

  private damageDefense(defense: DefenseRuntime, damage: number) {
    const absorbed = Math.min(defense.barrier, Math.max(0, damage));
    defense.barrier -= absorbed;
    const resolvedDamage = Math.max(0, damage - absorbed);
    const damaged = applyUnitDamage(defense, resolvedDamage);
    defense.hp = damaged.hp;
    this.addDamageNumber(defense.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)), `-${Math.round(damage)}`, 0xff8a68);
    this.addBurst(defense.group.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 0xb7422e, 6);
  }

  private damageRepairBay(damage: number) {
    const damaged = applyUnitDamage(this.repairBay, damage);
    this.repairBay.hp = damaged.hp;
    this.addDamageNumber(
      this.repairBay.group.position.clone().add(new THREE.Vector3(0, 1.75, 0)),
      `-${Math.round(damage)}`,
      0xff8a68,
    );
    this.addBurst(
      this.repairBay.group.position.clone().add(new THREE.Vector3(0, 0.7, 0)),
      0xb7422e,
      6,
    );
    if (this.repairBay.hp === 0) {
      this.callbacks.onToast({
        eyebrow: "REPAIR BAY DESTROYED",
        title: "FIELD KITS OR WITHDRAWAL ONLY",
        detail: "Agents cannot recover at the bay for the rest of this mission.",
      });
    }
  }

  private defeat() {
    if (this.mode === "defeat") return;
    this.resetInput();
    this.clearTemporarySubAgents();
    this.mode = "defeat";
    this.waveActive = false;
    this.clearLootPickups();
    if (this.player.hp <= 0) {
      this.triggerRig(this.player.rig, "death", 2.8);
    }
    this.callbacks.onMode("defeat");
    this.audio.play("defeat");
    this.callbacks.onToast({
      eyebrow: "MISSION FAILED",
      title: this.core.hp <= 0 ? "THE CORE WAS DESTROYED" : "YOU WERE DEFEATED",
      detail:
        "Try again, recruit agents earlier, and keep enemies away from the Core.",
    });
    this.emitHud(true);
  }

  private damageEnemy(
    enemy: EnemyRuntime,
    damage: number,
    hitPosition: THREE.Vector3,
    bypassArmor = false,
  ) {
    if (!this.enemies.includes(enemy)) return;
    const markedDamage =
      enemy.markedLeft > 0 ? damage * enemy.markMultiplier : damage;
    const armoured =
      !bypassArmor &&
      enemy.resistanceFlags.includes("armor") &&
      (enemy.bossState !== null || enemy.hp > enemy.maxHp * 0.45);
    const armorMultiplier = enemy.bossState
      ? getBossArmorMultiplier(enemy.bossState)
      : 0.42;
    const appliedDamage = resolveArmoredDamage(markedDamage, {
      armored: armoured,
      armorMultiplier,
      armorBreakReduction: enemy.armorBrokenLeft > 0
        ? enemy.armorBreakReduction
        : 0,
    });
    enemy.hp -= appliedDamage;
    if (enemy.bossState) enemy.bossState.hp = enemy.hp;
    enemy.hitFlash = 0.11;
    const critical =
      enemy.markedLeft > 0 ||
      appliedDamage >= Math.max(18, enemy.maxHp * 0.24);
    const kind = enemy.hp <= 0 ? "kill" : critical ? "critical" : "hit";
    const feedback = classifyCombatFeedback({
      kind,
      damage: appliedDamage,
      critical,
      target: "enemy",
    });
    const feedbackPosition = enemy.group.position
      .clone()
      .add(new THREE.Vector3(0, enemy.radius * 2 + 0.45, 0));
    this.addDamageNumber(
      feedbackPosition,
      armoured ? `ARMOR ${feedback.label}` : feedback.label,
      feedback.emphasis,
    );
    this.registerCombatCombo(feedbackPosition);
    if (enemy.type !== "rootkit") {
      const knockback = enemy.group.position.clone().sub(hitPosition).setY(0);
      if (knockback.lengthSq() < 0.02) {
        knockback
          .copy(enemy.group.position)
          .sub(this.player.group.position)
          .setY(0);
      }
      if (knockback.lengthSq() > 0.001) {
        enemy.group.position.add(
          knockback
            .normalize()
            .multiplyScalar(
              this.reducedMotion ? 0.025 : armoured ? 0.05 : 0.13,
            ),
        );
        this.clampToArena(enemy.group.position, 12.2);
      }
    }
    const ratio = clamp01(enemy.hp / enemy.maxHp);
    enemy.healthFill.scale.x = Math.max(0.001, ratio);
    enemy.healthFill.position.x = -0.59 * (1 - ratio);
    this.addBurst(
      hitPosition,
      feedback.kind === "critical" ? 0xffd166 : 0xe77d44,
      feedback.kind === "kill" ? 14 : feedback.kind === "critical" ? 9 : 6,
    );
    this.hitStop = Math.max(this.hitStop, enemy.hp <= 0 ? 0.055 : 0.018);
    this.shake = Math.max(
      this.shake,
      this.reducedMotion ? 0.015 : enemy.hp <= 0 ? 0.16 : 0.045,
    );
    this.audio.play("hit");
    if (enemy.hp > 0) return;
    const deathPosition = enemy.group.position.clone();
    if (enemy.bossState) {
      const reward = tickBoss(
        { ...enemy.bossState, hp: 0 },
        0,
        { targets: [] },
      );
      const rewardState = reward.boss as BossState;
      enemy.bossState = rewardState;
      this.callbacks.onToast({
        eyebrow: "WARBOSS CONTAINED",
        title: "RARE PROTOCOL SHARDS DROPPED",
        detail: `${rewardState.rewards.components} Components · ${rewardState.rewards.shards} Shards are recoverable in the arena. ${BOSS_REWARD_RATIONALE}`,
      });
    }
    if (enemy.bossVisual) {
      this.bossTelegraphPool.release(
        enemy.bossVisual,
        resetBossTelegraphVisual,
        (visual) => this.disposeDynamicObject(visual),
      );
      enemy.bossVisual = null;
    }
    this.disposeDynamicObject(enemy.group);
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    if (enemy.decoyOwnerId !== null) {
      this.addBurst(deathPosition, 0xc6a6e8, 5);
      return;
    }
    for (const decoy of this.enemies.filter(
      (threat) => threat.decoyOwnerId === enemy.id,
    )) {
      this.disposeDynamicObject(decoy.group);
      this.enemies.splice(this.enemies.indexOf(decoy), 1);
    }
    this.data += enemy.reward;
    this.score += Math.round(enemy.maxHp * 10 + this.wave * 90);
    const drops = enemy.bossState
      ? [
          {
            id: `boss-component-${enemy.id}`,
            type: "component" as LootType,
            x: -0.65,
            y: 0,
            value: enemy.bossState.rewards.components,
          },
          {
            id: `boss-shard-${enemy.id}`,
            type: "upgrade-shard" as LootType,
            x: 0.65,
            y: 0,
            value: enemy.bossState.rewards.shards,
          },
        ]
      : [rollLootDrop(enemy.type, Math.random)].filter(
          (drop): drop is NonNullable<typeof drop> => Boolean(drop),
        );
    for (const drop of drops) {
      const mesh = this.lootPool.acquire(() => createLootPickupMesh(drop.type));
      resetLootPickupMesh(mesh, drop.type, drop.value);
      const pickup: LootRuntime = {
        ...drop,
        x: deathPosition.x + drop.x * 0.35,
        y: deathPosition.z + drop.y * 0.35,
        radius: TOUCH_SAFE_PICKUP_RADIUS,
        mesh,
      };
      mesh.position.set(pickup.x, 0.62, pickup.y);
      mesh.scale.setScalar(0.15);
      this.scene.add(mesh);
      this.pickups.push(pickup);
    }
    this.addRing(deathPosition, 0xd9793f, 0.2, enemy.radius * 2.4, 0.42);
    this.addBurst(
      deathPosition.clone().add(new THREE.Vector3(0, enemy.radius, 0)),
      0xd9793f,
      enemy.type === "rootkit" ? 22 : 11,
    );
    this.audio.play("kill");
    if (enemy.tutorial && this.tutorialStep === "shoot") {
      this.tutorialKills += 1;
      if (this.tutorialKills === 3) this.emitTutorialEvent("training-cleared");
    }
    if (
      enemy.tutorial &&
      this.tutorialStep === "observe" &&
      !this.enemies.some((threat) => threat.tutorial)
    ) {
      this.emitTutorialEvent("breach-cleared");
    }
    this.emitHud(true);
  }

  private fireProjectile(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    damage: number,
    speed: number,
    faction: ProjectileRuntime["faction"],
    slow: number,
    radius: number,
  ) {
    const mesh = this.projectilePool.acquire(
      () =>
        new THREE.Mesh(
          new THREE.OctahedronGeometry(1, 0),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
          }),
        ),
    );
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.setHex(color);
    material.opacity = 0.95;
    mesh.scale.setScalar(radius);
    mesh.rotation.set(0, 0, 0);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      velocity: direction.clone().normalize().multiplyScalar(speed),
      life: 2.2,
      damage,
      radius,
      faction,
      slow,
    });
  }

  private removeProjectile(projectile: ProjectileRuntime) {
    const index = this.projectiles.indexOf(projectile);
    if (index >= 0) this.projectiles.splice(index, 1);
    this.projectilePool.release(
      projectile.mesh,
      (mesh) => {
        mesh.removeFromParent();
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.setScalar(1);
      },
      (mesh) => this.disposeDynamicObject(mesh),
    );
  }

  private pushEffect(effect: EffectRuntime) {
    while (this.effects.length >= MAX_COMBAT_EFFECTS) {
      const expired = this.effects.shift();
      if (expired) this.releaseEffect(expired);
    }
    this.effects.push(effect);
  }

  private releaseEffect(effect: EffectRuntime) {
    if (effect.kind === "text" && effect.object instanceof THREE.Sprite) {
      this.damageNumberPool.release(
        effect.object,
        (sprite) => this.resetDamageNumberSprite(sprite),
        (sprite) => this.disposeDynamicObject(sprite),
      );
      return;
    }
    this.disposeDynamicObject(effect.object);
  }

  private registerCombatCombo(position: THREE.Vector3) {
    if (this.combatComboLife <= 0) this.combatCombo = 0;
    this.combatCombo = Math.min(MAX_COMBAT_COMBO, this.combatCombo + 1);
    this.combatComboLife = COMBAT_COMBO_WINDOW_SECONDS;
    if (this.combatCombo < 2) return;
    this.addDamageNumber(
      position.clone().add(new THREE.Vector3(0, 0.42, 0)),
      `×${this.combatCombo} COMBO`,
      "strong",
    );
  }

  private addRing(
    position: THREE.Vector3,
    color: number,
    startRadius: number,
    endRadius: number,
    duration: number,
    kind: "ring" | "portal" = "ring",
  ) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: kind === "portal" ? 0.72 : 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.position.copy(position);
    ring.position.y = Math.max(0.055, position.y + 0.055);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(startRadius);
    ring.userData.startRadius = startRadius;
    ring.userData.endRadius = endRadius;
    this.scene.add(ring);
    const effect: EffectRuntime = {
      object: ring,
      life: duration,
      maxLife: duration,
      kind,
    };
    this.pushEffect(effect);
    const animateScale = () => {
      if (!this.effects.includes(effect)) return;
      const progress = 1 - effect.life / effect.maxLife;
      ring.scale.setScalar(
        THREE.MathUtils.lerp(startRadius, endRadius, 1 - (1 - progress) ** 2),
      );
    };
    ring.onBeforeRender = animateScale;
  }

  private addBeam(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: number,
    duration: number,
  ) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
      }),
    );
    this.scene.add(line);
    this.pushEffect({
      object: line,
      life: duration,
      maxLife: duration,
      kind: "beam",
    });
  }

  private addSlashArc(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
  ) {
    const center = origin.clone().addScaledVector(direction, 1.15).setY(0.68);
    const facing = Math.atan2(direction.z, direction.x);
    const points = Array.from({ length: 13 }, (_, index) => {
      const angle = facing - 1.05 + (index / 12) * 2.1;
      return new THREE.Vector3(
        center.x + Math.cos(angle) * 1.25,
        center.y + Math.sin((index / 12) * Math.PI) * 0.34,
        center.z + Math.sin(angle) * 1.25,
      );
    });
    const slash = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.94,
        depthTest: false,
      }),
    );
    slash.renderOrder = 7;
    this.scene.add(slash);
    this.pushEffect({
      object: slash,
      life: this.reducedMotion ? 0.16 : 0.28,
      maxLife: this.reducedMotion ? 0.16 : 0.28,
      kind: "slash",
    });
  }

  private addBurst(position: THREE.Vector3, color: number, count: number) {
    if (this.reducedMotion) count = Math.min(count, 5);
    const group = new THREE.Group();
    group.position.copy(position);
    const geometry = new THREE.TetrahedronGeometry(0.055, 0);
    const material = new THREE.MeshBasicMaterial({ color });
    for (let index = 0; index < count; index += 1) {
      const shard = new THREE.Mesh(geometry, material);
      const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.3;
      const speed = 0.8 + (index % 4) * 0.35;
      shard.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        0.6 + (index % 5) * 0.17,
        Math.sin(angle) * speed,
      );
      group.add(shard);
    }
    this.scene.add(group);
    this.pushEffect({
      object: group,
      life: 0.55,
      maxLife: 0.55,
      kind: "burst",
    });
  }

  private createDamageNumberSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    sprite.userData.damageNumberCanvas = canvas;
    return sprite;
  }

  private resetDamageNumberSprite(sprite: THREE.Sprite) {
    sprite.removeFromParent();
    sprite.position.set(0, 0, 0);
    sprite.scale.set(2.4, 0.9, 1);
    (sprite.material as THREE.SpriteMaterial).opacity = 1;
  }

  private addDamageNumber(
    position: THREE.Vector3,
    label: string,
    color: number | CombatFeedbackEmphasis,
  ) {
    const sprite = this.damageNumberPool.acquire(() =>
      this.createDamageNumberSprite(),
    );
    const canvas = sprite.userData.damageNumberCanvas as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) {
      this.damageNumberPool.release(
        sprite,
        (pooledSprite) => this.resetDamageNumberSprite(pooledSprite),
        (pooledSprite) => this.disposeDynamicObject(pooledSprite),
      );
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "800 38px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 8;
    context.strokeStyle = "rgba(4,8,10,.92)";
    context.strokeText(label, 128, 48);
    const resolvedColor =
      typeof color === "number" ? color : combatFeedbackColor(color);
    context.fillStyle = `#${resolvedColor.toString(16).padStart(6, "0")}`;
    context.fillText(label, 128, 48);
    const material = sprite.material as THREE.SpriteMaterial;
    if (material.map) material.map.needsUpdate = true;
    material.opacity = 1;
    sprite.position.copy(position);
    sprite.scale.set(2.4, 0.9, 1);
    this.scene.add(sprite);
    this.pushEffect({
      object: sprite,
      life: 0.72,
      maxLife: 0.72,
      kind: "text",
    });
  }

  private async attachOperatorRig() {
    this.canvas.dataset.operatorRig = "loading";
    try {
      const gltf = await this.gltfLoader.loadAsync(
        "/models/quaternius/Character.gltf",
      );
      const root = gltf.scene;
      root.name = "operator-production-rig";
      root.rotation.y = Math.PI;
      let visibleMeshCount = 0;
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        visibleMeshCount += 1;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const cloneMaterial = (source: THREE.Material) => {
          const material = source.clone() as THREE.MeshStandardMaterial;
          material.roughness = 0.36;
          material.metalness = material.name.includes("Black") ? 0.72 : 0.48;
          if (
            material.name.includes("Accent") ||
            material.name.includes("Blade")
          ) {
            material.emissive = new THREE.Color(0x8b2f13);
            material.emissiveIntensity = 0.24;
          }
          return material;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(cloneMaterial)
          : cloneMaterial(mesh.material);
      });

      root.updateMatrixWorld(true);
      const sourceBounds = new THREE.Box3().setFromObject(root);
      const sourceSize = sourceBounds.getSize(new THREE.Vector3());
      if (
        visibleMeshCount === 0 ||
        !Number.isFinite(sourceSize.y) ||
        sourceSize.y < 0.1
      ) {
        throw new Error("The operator GLTF contains no visible character mesh.");
      }

      const targetHeight = 2.3;
      root.scale.setScalar(targetHeight / sourceSize.y);
      root.updateMatrixWorld(true);
      const fittedBounds = new THREE.Box3().setFromObject(root);
      const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
      root.position.set(
        -fittedCenter.x,
        -fittedBounds.min.y,
        -fittedCenter.z,
      );
      this.player.group.add(root);
      this.toonifyObject(root);
      root.updateMatrixWorld(true);

      const finalBounds = new THREE.Box3().setFromObject(root);
      const finalSize = finalBounds.getSize(new THREE.Vector3());
      if (
        !Number.isFinite(finalSize.y) ||
        finalSize.y < targetHeight * 0.7
      ) {
        this.player.group.remove(root);
        throw new Error("The operator GLTF could not be fitted to the arena.");
      }

      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.07, 0.055),
        new THREE.MeshStandardMaterial({
          color: 0xb8f7f3,
          emissive: 0x64d9dd,
          emissiveIntensity: 2.4,
          roughness: 0.1,
          metalness: 0.4,
        }),
      );
      visor.name = "operator-production-visor";
      visor.position.set(0, 1.78, -0.27);
      this.player.group.add(visor);

      const bodyRoot = this.player.group.getObjectByName("operator-body-root");
      if (bodyRoot) bodyRoot.visible = false;

      const mixer = new THREE.AnimationMixer(root);
      const clipNames: Record<RigAnimation, string> = {
        idle: "Idle_Gun_Pointing",
        run: "Run_Shoot",
        attack: "Gun_Shoot",
        hit: "HitRecieve",
        death: "Death",
        cheer: "Wave",
      };
      const actions: Partial<Record<RigAnimation, THREE.AnimationAction>> = {};
      for (const [state, clipName] of Object.entries(clipNames) as Array<
        [RigAnimation, string]
      >) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
        if (clip) actions[state] = mixer.clipAction(clip);
      }
      const rig: AnimatedRig = {
        root,
        mixer,
        actions,
        current: null,
        lockedFor: 0,
      };
      this.player.rig = rig;
      this.playRig(rig, "idle");
      this.canvas.dataset.operatorRig = "ready";
    } catch (error) {
      this.canvas.dataset.operatorRig = "failed";
      console.error(
        "Operator production rig could not be loaded. Using the built-in cyber operator.",
        error,
      );
    }
  }

  private playRig(rig: AnimatedRig | null, state: RigAnimation) {
    if (!rig || rig.current === state) return;
    const next = rig.actions[state];
    if (!next) return;
    const current = rig.current ? rig.actions[rig.current] : null;
    current?.fadeOut(0.12);
    next.reset();
    next.enabled = true;
    next.clampWhenFinished = false;
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.setEffectiveTimeScale(state === "run" ? 1.08 : 1);
    next.fadeIn(0.12).play();
    rig.current = state;
  }

  private triggerRig(
    rig: AnimatedRig | null,
    state: RigAnimation,
    duration: number,
  ) {
    if (!rig) return;
    const next = rig.actions[state];
    if (!next) return;
    const current = rig.current ? rig.actions[rig.current] : null;
    current?.fadeOut(0.05);
    next.reset();
    next.enabled = true;
    next.clampWhenFinished = true;
    next.setLoop(THREE.LoopOnce, 1);
    next.setEffectiveTimeScale(
      state === "attack" ? 1.7 : state === "hit" ? 1.35 : 1,
    );
    next.fadeIn(0.04).play();
    rig.current = state;
    rig.lockedFor = duration;
  }

  private updateRig(
    rig: AnimatedRig | null,
    delta: number,
    desired: "idle" | "run",
  ) {
    if (!rig) return;
    rig.mixer.update(delta);
    rig.lockedFor = Math.max(0, rig.lockedFor - delta);
    if (rig.lockedFor <= 0) this.playRig(rig, desired);
  }

  private isDefensePositionValid(position: THREE.Vector3) {
    const distanceFromCore = position.distanceTo(this.core.group.position);
    if (distanceFromCore < 2.35 || distanceFromCore > 7.2) return false;
    return this.defenses.every(
      (defense) => defense.group.position.distanceTo(position) >= 1.8,
    );
  }

  private updateDefenseGhost() {
    if (!this.placementActive || !this.placementGhost) return;
    this.placementGhost.position.copy(this.aimPoint).setY(0.08);
    const valid = this.isDefensePositionValid(this.placementGhost.position);
    const tint = new THREE.Color(valid ? 0x9ed8dd : 0xd14b34);
    this.placementGhost.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if ("color" in material) {
          (material as THREE.Material & { color: THREE.Color }).color.copy(
            tint,
          );
        }
      }
    });
  }

  private confirmDefensePlacement() {
    if (!this.placementActive || !this.placementGhost) return;
    const position = this.placementGhost.position.clone().setY(0.08);
    if (!this.isDefensePositionValid(position)) {
      this.callbacks.onToast({
        eyebrow: "INVALID POSITION",
        title: "PLACE IT INSIDE THE DEFENSE ZONE",
        detail: "Keep the sentry away from the Core and other sentries.",
      });
      return;
    }
    this.placeDefenseAt(position);
  }

  private placeDefenseAt(
    position: THREE.Vector3,
    charge = true,
    notify = true,
  ) {
    return {
      ok: this.addDefense(
        { x: position.x, z: position.z },
        { charge, notify },
      ),
    };
  }

  private addDefense(
    position: { x: number; z: number },
    options: { charge: boolean; notify: boolean },
  ): boolean {
    const worldPosition = new THREE.Vector3(position.x, 0.08, position.z);
    if (!this.isDefensePositionValid(worldPosition)) return false;
    if (this.defenses.length >= 3) return false;
    const cost = 80 + this.defenses.length * 35;
    if (options.charge && this.data < cost) {
      if (options.notify) {
        this.callbacks.onToast({
          eyebrow: "NOT ENOUGH COMPUTE",
          title: `YOU NEED ${cost - this.data} MORE`,
          detail: "Destroy enemies to earn Compute, then build the sentry.",
        });
      }
      return false;
    }
    const index = this.defenses.length;
    if (options.charge) this.data -= cost;
    this.cancelDefensePlacement(false);
    const group = this.createDefenseModel(index);
    group.position.copy(worldPosition);
    const health = this.createWorldHealthBar(1.18, 0x9ed8dd);
    health.group.name = "sentry-health";
    health.group.position.y = 1.82;
    group.add(health.group);
    this.scene.add(group);
    this.defenses.push({
      group,
      turret: group.getObjectByName("sentry-turret") as THREE.Group,
      healthBar: health.group,
      healthFill: health.fill,
      hp: 100,
      maxHp: 100,
      cooldownLeft: 0.35,
      index,
      barrier: 0,
      barrierLeft: 0,
    });
    if (options.notify) {
      this.addRing(group.position, 0x9ed8dd, 0.2, 2.4, 0.7, "portal");
      this.addBurst(
        group.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
        0x9ed8dd,
        15,
      );
      this.audio.play("recruit");
      this.callbacks.onToast({
        eyebrow: `BASE SENTRY ${index + 1} BUILT`,
        title: "AUTOMATED DEFENSE ONLINE",
        detail: "This sentry protects its chosen area and fires automatically.",
      });
      this.emitHud(true);
    }
    return true;
  }

  private restoreDefense(position: { x: number; z: number }) {
    this.addDefense(position, { charge: false, notify: false });
  }

  private cancelDefensePlacement(notify = true) {
    if (this.placementGhost) {
      this.scene.remove(this.placementGhost);
      this.placementGhost.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      });
    }
    const wasActive = this.placementActive;
    this.placementActive = false;
    this.placementGhost = null;
    if (notify && wasActive) {
      this.callbacks.onToast({
        eyebrow: "PLACEMENT CANCELLED",
        title: "SENTRY NOT BUILT",
        detail: "No Compute was spent.",
      });
    }
    if (wasActive) this.emitHud(true);
  }

  private getPriorityEnemy() {
    let priority: EnemyRuntime | null = null;
    let priorityScore = -Infinity;
    for (const enemy of this.enemies) {
      const score =
        (enemy.type === "rootkit"
          ? 10000
          : enemy.type === "trojan"
            ? 2000
            : enemy.type === "phisher"
              ? 900
              : 0) + enemy.hp;
      if (score > priorityScore) {
        priority = enemy;
        priorityScore = score;
      }
    }
    return priority;
  }

  private getNearestEnemy(position: THREE.Vector3, maxDistance = Infinity) {
    let nearest: EnemyRuntime | null = null;
    const targetingRange = Number.isFinite(maxDistance)
      ? maxDistance * this.terrain.targetingRangeMultiplier
      : maxDistance;
    let nearestDistance = targetingRange;
    const candidates = Number.isFinite(targetingRange)
      ? this.enemyGrid.query(position, targetingRange)
      : this.enemies;
    for (const enemy of candidates) {
      const distance =
        enemy.group.position.distanceTo(position) *
        (enemy.resistanceFlags.includes("decoy") ? 1.35 : 1);
      if (distance < nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private resolveAim() {
    const nearest = this.getNearestEnemy(this.player.group.position, 7.5);
    if (nearest) {
      const pointerDistance = this.aimPoint.distanceTo(
        this.player.group.position,
      );
      if (
        !this.hasPointerAim ||
        pointerDistance < 0.5 ||
        this.touchMove.lengthSq() > 0
      ) {
        return nearest.group.position
          .clone()
          .add(new THREE.Vector3(0, nearest.radius, 0));
      }
    }
    return this.aimPoint.clone().setY(0.8);
  }

  private faceDirection(group: THREE.Group, direction: THREE.Vector3) {
    if (direction.lengthSq() < 0.001) return;
    group.rotation.y = Math.atan2(-direction.x, -direction.z);
  }

  private clampToArena(position: THREE.Vector3, radius: number) {
    const flat = new THREE.Vector2(position.x, position.z);
    if (flat.length() > radius) {
      flat.setLength(radius);
      position.x = flat.x;
      position.z = flat.y;
    }
    position.y = 0;
  }

  private disposeDynamicObject(object: THREE.Object3D) {
    disposeObject3D(object, {
      disposed: this.disposedResources,
      sharedGeometries: LOW_POLY_ROBOT_GEOMETRIES,
    });
  }

  private clearDynamic() {
    this.clearTemporarySubAgents();
    this.clearTerrainOverlay();
    for (const enemy of this.enemies) {
      if (enemy.bossVisual) {
        this.bossTelegraphPool.release(
          enemy.bossVisual,
          resetBossTelegraphVisual,
          (visual) => this.disposeDynamicObject(visual),
        );
        enemy.bossVisual = null;
      }
      this.disposeDynamicObject(enemy.group);
    }
    for (const agent of this.agents) this.disposeDynamicObject(agent.group);
    for (const defense of this.defenses) this.disposeDynamicObject(defense.group);
    while (this.projectiles.length > 0) {
      this.removeProjectile(this.projectiles[this.projectiles.length - 1]);
    }
    for (const effect of this.effects) this.releaseEffect(effect);
    this.clearLootPickups();
    this.enemies.length = 0;
    this.agents.length = 0;
    this.defenses.length = 0;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.spawnQueue = [];
    this.nextQueueReleaseAt = 0;
    this.scheduledReinforcementThreats = 0;
    this.waveActive = false;
    this.waveEndClock = 0;
  }

  private clearTerrainOverlay() {
    if (!this.terrainOverlay) return;
    this.disposeDynamicObject(this.terrainOverlay);
    this.terrainOverlay = null;
  }

  private updateTerrainOverlay() {
    this.clearTerrainOverlay();
    if (this.terrain.id === "none") return;
    const overlay = new THREE.Group();
    overlay.name = "terrain-overlay";
    const material = new THREE.MeshBasicMaterial({
      color: this.terrain.color,
      transparent: true,
      opacity: this.terrain.id === "data-fog" ? 0.09 : 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const offsets =
      this.terrain.id === "split-breach"
        ? [-7, 7]
        : this.terrain.id === "firewall-lanes"
          ? [-7.5, -2.5, 2.5, 7.5]
          : [0, 0];
    offsets.forEach((offset, index) => {
      const marker =
        this.terrain.id === "relay-storm" || this.terrain.id === "data-fog"
          ? new THREE.Mesh(
              new THREE.RingGeometry(
                6 + index * 5,
                6.12 + index * 5,
                64,
              ),
              material,
            )
          : new THREE.Mesh(new THREE.PlaneGeometry(1.1, 31), material);
      marker.rotation.x = -Math.PI / 2;
      marker.rotation.z =
        this.terrain.id === "split-breach" ? index * Math.PI : 0;
      marker.position.set(offset, 0.025, 0);
      overlay.add(marker);
    });
    this.scene.add(overlay);
    this.terrainOverlay = overlay;
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const aspect = width / height;
    const portraitPullback =
      aspect < 0.58 ? 1.5 : aspect < 0.78 ? 1.28 : aspect < 1 ? 1.12 : 1;
    const presentationPullback = this.cameraPresentation === "command"
      ? 1.62
      : this.cameraPresentation === "macro"
        ? 1.34
        : 1;
    const viewHeight = 15.8 * this.zoom * portraitPullback * presentationPullback;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private emitHud(force = false) {
    if (!force && this.hudClock > 0) return;
    const recruited = (id: AgentId) =>
      this.agents.some((agent) => agent.id === id);
    const skills = createInitialSkillHud();
    const repairBayState = {
      hp: this.repairBay.hp,
      maxHp: this.repairBay.maxHp,
      isSeparate: true,
      repairPerSecond: 18,
    };
    for (const id of Object.keys(skills) as EvolutionAgentId[]) {
      const agent = this.agents.find((candidate) => candidate.id === id);
      skills[id].cooldownLeftMs = agent?.skillCooldownLeftMs ?? 0;
      skills[id].status = getAgentSkillAvailability(agent ?? null, repairBayState);
      skills[id].available = skills[id].status === "ready";
    }
    const boss = this.enemies.find((enemy) => enemy.bossState)?.bossState ?? null;
    const zone = getArenaZone({
      x: this.player.group.position.x,
      z: this.player.group.position.z,
    });
    this.currentZone = zone.shortLabel;
    const breachThreatCount = this.enemies.filter(
      (enemy) => enemy.group.position.distanceTo(this.core.group.position) <= 4.5,
    ).length;
    const recruitmentNeed = getRecruitmentNeed({
      coreHp: this.core.hp,
      coreMaxHp: this.core.maxHp,
      operatorHp: this.player.hp,
      operatorMaxHp: this.player.maxHp,
      breachThreatCount,
      activeThreatCount: this.enemies.length,
    });
    const recruitmentAdvice = getRecruitmentAdvice({
      coreHp: this.core.hp,
      coreMaxHp: this.core.maxHp,
      operatorHp: this.player.hp,
      operatorMaxHp: this.player.maxHp,
      threatCount: breachThreatCount,
      activeAgents: this.agents.length,
      maxAgents: WARBAND_SLOTS.length,
      compute: this.data,
      components: this.loot.components,
      shards: this.loot.shards,
      candidates: getRecruitmentCandidates(
        this.agents.length,
        recruitmentNeed,
      ),
    }) as RecruitmentAdvice;
    if (recruitmentAdvice.state !== "recruit") {
      this.dismissedRecruitAgentId = null;
      this.recruitPrompt = null;
    } else if (
      shouldShowRecruitPrompt(
        this.previousRecruitmentAdvice,
        recruitmentAdvice,
        this.dismissedRecruitAgentId,
      )
    ) {
      this.recruitPrompt = recruitmentAdvice;
      this.callbacks.onToast({
        eyebrow: "WARband RESOURCE THRESHOLD",
        title: `RECRUIT ${recruitmentAdvice.agentId?.toUpperCase() ?? "AGENT"}`,
        detail: `${recruitmentAdvice.role ?? "SPECIALIST"} online. Your Warband can afford this recruit now.`,
      });
    }
    this.previousRecruitmentAdvice = recruitmentAdvice;
    const empReady = this.mode === "playing" && this.intermissionClock <= 0 && this.waveActive && canFireEmp(this.empState);
    if (!empReady) {
      this.empReadyPrompt = false;
      this.dismissedEmpPrompt = false;
    } else if (
      shouldShowEmpReadyPrompt(
        this.previousEmpReady,
        empReady,
        this.dismissedEmpPrompt,
      )
    ) {
      this.empReadyPrompt = true;
      this.callbacks.onToast({
        eyebrow: "EMP SYSTEM CHARGED",
        title: "EMP READY",
        detail: "Tap EMP PULSE or press R to disrupt nearby threats.",
      });
    }
    this.previousEmpReady = empReady;
    const bossEntity = this.enemies.find((enemy) => enemy.bossState) ?? null;
    const simulationView = createSimulationView({
      wave: this.wave,
      resources: {
        compute: this.data,
        components: this.loot.components,
        shards: this.loot.shards,
      },
      core: {
        hp: this.core.hp,
        maxHp: this.core.maxHp,
        x: this.core.group.position.x,
        z: this.core.group.position.z,
      },
      operator: {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        x: this.player.group.position.x,
        z: this.player.group.position.z,
      },
      agents: this.agents.map((agent) => ({
        id: agent.id,
        hp: agent.hp,
        maxHp: agent.maxHp,
        x: agent.group.position.x,
        z: agent.group.position.z,
        state: agent.disabledLeft > 0
          ? "disabled"
          : agent.gatheringTargetId
            ? "gathering"
            : agent.repairDecision,
      })),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        kind: enemy.type,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        x: enemy.group.position.x,
        z: enemy.group.position.z,
        state: enemy.hp > 0 ? "alive" : "destroyed",
      })),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        value: pickup.value,
        x: pickup.x,
        z: pickup.y,
      })),
      sentries: this.defenses.map((defense) => ({
        id: `sentry-${defense.index}`,
        hp: defense.hp,
        maxHp: defense.maxHp,
        x: defense.group.position.x,
        z: defense.group.position.z,
      })),
      subAgents: this.temporarySubAgents.map((subAgent) => ({
        id: subAgent.id,
        parentId: subAgent.parentId,
        role: subAgent.role,
        remainingMs: subAgent.remainingMs,
        x: subAgent.marker.position.x,
        z: subAgent.marker.position.z,
      })),
      boss: bossEntity
        ? {
            id: bossEntity.id,
            kind: bossEntity.type,
            hp: bossEntity.hp,
            maxHp: bossEntity.maxHp,
            x: bossEntity.group.position.x,
            z: bossEntity.group.position.z,
          }
        : null,
    });
    const commandMap = getCommandMapMarkers(simulationView);
    this.callbacks.onHud({
      sessionMode: this.sessionMode,
      watchPaused: this.watchState.paused,
      watchSpeed: this.watchState.speed,
      watchPriority: this.watchState.priority as "survive" | "farm" | "expand",
      cinemaPaused: this.cinemaState.paused,
      cinemaSpeed: this.cinemaState.speed,
      cinemaCleanView: this.cinemaState.cleanView,
      survivalMs: this.watchState.survivalMs,
      sessionIncome: { ...this.watchState.sessionIncome },
      lastAutonomyEvent: this.watchState.lastEvent,
      autonomyLog: [...(this.watchState.activityLog ?? [this.watchState.lastEvent])],
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      core: Math.round(this.core.hp),
      maxCore: Math.round(this.core.maxHp),
      data: Math.round(this.data),
      wave: this.wave,
      intermissionMs: this.intermissionClock,
      enemies: remainingThreats({
        active: this.enemies.length,
        queued: this.spawnQueue.length,
        scheduled: this.scheduledReinforcementThreats,
      }),
      score: this.score,
      best: this.best,
      dash: clamp01(1 - this.player.dashCooldown / 3),
      empCharge: this.empState.charge / this.empState.maxCharge,
      empCooldownLeftMs: this.empState.cooldownLeftMs,
      empCooldownMs: this.empState.cooldownMs,
      empReadyPrompt: this.empReadyPrompt,
      defenses: this.defenses.length,
      maxDefenses: 3,
      defenseCost: 80 + this.defenses.length * 35,
      placingDefense: this.placementActive,
      threat:
        this.wave >= 8
          ? "CRITICAL"
          : this.wave >= 6
            ? "EXTREME"
            : this.wave >= 4
              ? "HIGH"
              : this.wave >= 2
                ? "RISING"
                : "LOW",
      currentZone: this.currentZone,
      command: this.squadCommand,
      agents: {
        kairos: recruited("kairos"),
        kira: recruited("kira"),
        forge: recruited("forge"),
        covenant: recruited("covenant"),
        relay: recruited("relay"),
        scout: recruited("scout"),
        warden: recruited("warden"),
        nova: recruited("nova"),
      },
      warbandCount: simulationView.agents.length,
      maxWarband: WARBAND_SLOTS.length,
      nextRecruitCost: getRecruitCost(WARBAND_SLOTS[this.agents.length]),
      upgradeStacks: { ...this.upgradeStacks },
      evolutions: { ...this.evolutions },
      armorId: this.armorId,
      armorBonuses: getArmorBonuses(this.armorId),
      componentUpgradeRanks: { ...this.componentUpgradeRanks },
      temporarySubAgents: this.temporarySubAgents.length,
      terrainLabel: this.terrain.label,
      battlegroundId: this.battleground.id,
      qualityPreset: this.qualityPreset,
      commandMap: [...commandMap],
      empResistance: getMaxEmpResistancePercent(this.encounterModifiers),
      loot: { ...this.loot },
      recruitmentAdvice,
      recruitPrompt: this.recruitPrompt,
      skills,
      boss: boss
        ? {
            label: boss.label,
            hp: Math.max(0, Math.round(boss.hp)),
            maxHp: boss.maxHp,
            telegraphLeftMs: boss.telegraphLeftMs,
          }
        : null,
      tutorialStep: this.tutorialStep,
      canRetryWave: canRetryFirstWave({
        wave: this.wave,
        tutorialResolved:
          this.tutorialStep === "complete" || this.tutorialStep === "skipped",
        checkpoint: this.firstWaveCheckpoint !== null,
      }),
    });
  }
}

type FlatEnemy = {
  id: number;
  type: EnemyType;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  attackCooldown: number;
  cooldownLeft: number;
  telegraphLeft: number;
  telegraphTotal: number;
  reward: number;
  radius: number;
  slow: number;
  slowMultiplier: number;
  bossPhase: number;
  hitFlash: number;
  hitRecoilX: number;
  hitRecoilZ: number;
  tutorial: boolean;
  resistanceFlags: ResistanceFlag[];
  decoyOwnerId: number | null;
  decoyLeft: number;
  markedLeft: number;
  markMultiplier: number;
  armorBrokenLeft: number;
  armorBreakReduction: number;
  bossState: BossState | null;
  movementWatchdog: EnemyMovementWatchdog;
};

type FlatAgent = AgentDefinition & {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  repairDecision: "fight" | "retreat" | "repair" | "return";
  cooldownLeft: number;
  supportClock: number;
  disabledLeft: number;
  gatheringCooldownMs: number;
  gatheringTargetId: string | null;
  skillCooldownLeftMs: number;
  barrier: number;
  barrierLeft: number;
};

type FlatTemporarySubAgent = TemporarySubAgent & {
  x: number;
  z: number;
  color: number;
};

type FlatDefense = {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  cooldownLeft: number;
  index: number;
  rotation: number;
  barrier: number;
  barrierLeft: number;
};

type FlatProjectile = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  damage: number;
  radius: number;
  color: string;
  faction: "operator" | "agent" | "null";
  slow: number;
};

type FlatLootRuntime = LootRecord;

type FlatParticle = {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
};

type FlatEffect = {
  kind: "ring" | "beam" | "burst" | "slash" | "text";
  x: number;
  z: number;
  x2: number;
  z2: number;
  life: number;
  maxLife: number;
  color: string;
  radiusStart: number;
  radiusEnd: number;
  particles: FlatParticle[];
  label?: string;
  emphasis?: CombatFeedbackEmphasis;
};

const toCssColor = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

class FreemanCanvasEngine implements GameController {
  purchaseComponentUpgrade(target: "player" | AgentId, upgradeId: string) {
    if (this.mode !== "evolution") return;
    try {
      const next = purchaseComponentUpgrade({
        components: this.loot.components,
        armorId: this.armorId,
        recruited: Object.fromEntries(
          AGENTS.map((agent) => [
            agent.id,
            this.agents.some((recruited) => recruited.id === agent.id),
          ]),
        ),
        componentUpgradeRanks: this.componentUpgradeRanks,
      }, target, upgradeId);
      this.loot.components = next.components;
      this.componentUpgradeRanks = next.componentUpgradeRanks;
      if (target === "player") {
        this.armorId = next.armorId as PlayerArmorId;
        const bonuses = getArmorBonuses(this.armorId);
        const addedHealth = bonuses.maxHealth ?? 0;
        this.player.maxHp += addedHealth;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + addedHealth);
        this.attackMultiplier *= bonuses.damageMultiplier ?? 1;
        this.playerAttackCooldownMultiplier *= bonuses.cooldownMultiplier ?? 1;
      }
      const definition = target === "player"
        ? PLAYER_ARMORS[upgradeId as PlayerArmorId]
        : AGENT_COMPONENT_UPGRADES[target].find(
            (item: { id: string }) => item.id === upgradeId,
          );
      this.callbacks.onToast({
        eyebrow: "COMPONENT INSTALLED",
        title: definition?.name ?? "UPGRADE INSTALLED",
        detail: "Components were committed to a permanent mission upgrade.",
      });
      this.emitHud(true);
    } catch (error) {
      this.callbacks.onToast({
        eyebrow: "COMPONENT UPGRADE UNAVAILABLE",
        title: error instanceof Error ? error.message.toUpperCase() : "TRY AGAIN",
        detail: "INSUFFICIENT COMPONENTS, capped ranks, or an unavailable target.",
      });
    }
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly callbacks: GameCallbacks;
  private readonly audio = new AudioManager();
  private readonly keys = new Set<string>();
  private readonly enemies: FlatEnemy[] = [];
  private readonly agents: FlatAgent[] = [];
  private autonomyState: Partial<Record<AgentId, AutonomyIntent>> = {};
  private subAgentSpawnState: Partial<Record<AgentId, { cooldownLeftMs: number }>> = {};
  private autonomousActionClock = AUTONOMOUS_ACTION_INTERVAL_MS;
  private temporarySubAgents: FlatTemporarySubAgent[] = [];
  private readonly defenses: FlatDefense[] = [];
  private readonly projectiles: FlatProjectile[] = [];
  private readonly effects: FlatEffect[] = [];
  private readonly burstEffectPool = new BoundedPool<FlatEffect>(48);
  private readonly pickups: FlatLootRuntime[] = [];
  private loot: LootCounters = { repairs: 0, components: 0, shards: 0 };
  private readonly touchMove = { x: 0, y: 0 };
  private readonly aim = { x: 0, z: -4 };
  private readonly lastMove = { x: 0, z: -1 };
  private readonly player = {
    x: 0,
    z: 2.7,
    hp: 100,
    maxHp: 100,
    damage: 25,
    attackCooldown: 0,
    meleeCooldown: 0,
    dashCooldown: 0,
    invulnerable: 0,
  };
  private readonly core = { x: 0, z: 0, hp: 180, maxHp: 180 };
  private readonly repairBay = { x: -3.1, z: 1.15, hp: 70, maxHp: 70 };
  private readonly buildings: Array<{
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
  }> = [];
  private resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private lastFrame = performance.now();
  private mode: GameMode = "intro";
  private sessionMode: SessionMode = "campaign";
  private coOpPresentation = false;
  private combatOverlayOpen = false;
  private watchState = createWatchState();
  private cinemaState = createCinemaState();
  private watchDirectorState = createWatchDirectorState();
  private watchRecoveryClock = 0;
  private wave = 1;
  private waveActive = false;
  private waveEndClock = 0;
  private intermissionClock = 0;
  private score = 0;
  private best = 0;
  private data = 55;
  private enemySequence = 0;
  private yaw = Math.PI / 4;
  private zoom = 1;
  private cameraPresentation: CameraPresentation = "tactical";
  private qualityMonitor: QualityMonitor = createQualityMonitor("medium");
  private qualityPreset: "low" | "medium" | "high" = "medium";
  private battleground = getBattlegroundForWave(1);
  private cameraX = 0;
  private cameraZ = 0;
  private cameraFocusId: string | null = null;
  private cinemaTarget = { x: 0, z: 0 };
  private hasCinemaTarget = false;
  private cinemaHoldClock = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private elapsed = 0;
  private hudClock = 0;
  private reinforcementClock = 0;
  private reinforcementsRemaining = 0;
  private spawnQueue: EnemyType[] = [];
  private nextQueueReleaseAt = 0;
  private scheduledReinforcementThreats = 0;
  private readonly activeEnemyLimit = getActiveEnemyLimit("canvas");
  private attackMultiplier = 1;
  private agentRateMultiplier = 1;
  private agentDamageMultiplier = 1;
  private empState: EmpState = createEmpState();
  private previousRecruitmentAdvice: RecruitmentAdvice | null = null;
  private dismissedRecruitAgentId: AgentId | null = null;
  private recruitPrompt: RecruitmentAdvice | null = null;
  private previousEmpReady = false;
  private dismissedEmpPrompt = false;
  private empReadyPrompt = false;
  private playerAttackCooldownMultiplier = 1;
  private upgradeStacks: UpgradeStacks = { ...EMPTY_UPGRADE_STACKS };
  private evolutions: Evolutions = { ...EMPTY_EVOLUTIONS };
  private armorId: PlayerArmorId | null = null;
  private componentUpgradeRanks: ComponentUpgradeRanks = {
    ...EMPTY_COMPONENT_UPGRADE_RANKS,
  };
  private dragPointer: number | null = null;
  private dragX = 0;
  private reducedMotion = false;
  private shake = 0;
  private combatCombo = 0;
  private combatComboLife = 0;
  private hasPointerAim = false;
  private touchAimActive = false;
  private touchMovePointer: number | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private squadCommand: SquadCommand = "follow";
  private placementActive = false;
  private tutorialStep: TutorialStep | null = null;
  private tutorialMoveDistance = 0;
  private tutorialKills = 0;
  private tutorialResolved = false;
  private firstWaveCheckpoint: FirstWaveCheckpoint | null = null;
  private tutorialMarker: { x: number; z: number } | null = null;
  private encounterModifiers = getWaveModifiers(1);
  private terrain = getTerrainModifier(1);
  private currentZone = "EAST";

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    this.canvas = canvas;
    this.context = context;
    this.callbacks = callbacks;
    this.resetInput = this.resetInput.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.best = readStoredNumber("freeman-protocol-best");
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.qualityPreset = selectQualityPreset(getRuntimeQualityHints());
    this.qualityMonitor = createQualityMonitor(this.qualityPreset);
    this.buildings = this.createBuildings();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    this.emitHud(true);
    this.animate(performance.now());
  }

  start(options: StartOptions = { tutorial: false, mode: "campaign" }) {
    this.resetInput();
    this.audio.startMusic();
    this.sessionMode = options.mode ?? "campaign";
    this.watchState = createWatchState();
    this.cinemaState = createCinemaState();
    this.watchDirectorState = createWatchDirectorState();
    this.cameraPresentation = "macro";
    this.hasCinemaTarget = false;
    this.cinemaHoldClock = 0;
    this.resetMissionState();
    if (options.tutorial) {
      this.tutorialStep = "move";
      this.tutorialMarker = { x: 0, z: -0.5 };
      this.mode = "playing";
      this.callbacks.onMode("playing");
      this.emitHud(true);
      return;
    }
    this.resolveTutorial("skipped");
  }

  setCoOpPresentation(enabled: boolean) {
    this.coOpPresentation = enabled;
    this.resetInput();
  }

  setWatchSpeed(speed: number) {
    this.watchState = setWatchSpeed(this.watchState, speed);
    this.emitHud(true);
  }

  setCinemaSpeed(speed: number) {
    this.cinemaState = setCinemaPresentationSpeed(this.cinemaState, speed);
    this.emitHud(true);
  }

  toggleCinemaPause() {
    this.cinemaState = toggleCinemaPaused(this.cinemaState);
    this.emitHud(true);
  }

  toggleCinemaCleanView() {
    const wasClean = this.cinemaState.cleanView;
    this.cinemaState = toggleCinemaCleanView(this.cinemaState);
    if (wasClean) this.cinemaHoldClock = 0.8;
    else this.hasCinemaTarget = false;
    this.emitHud(true);
  }

  focusCommandMarker(id: string) {
    this.cameraFocusId = id || null;
    this.cameraPresentation = "command";
    this.emitHud(true);
  }

  setWatchPriority(priority: "survive" | "farm" | "expand") {
    this.watchState = setWatchPriority(this.watchState, priority);
    this.emitHud(true);
  }

  endWatchRun() {
    if (!isWatchMode(this.sessionMode)) return;
    persistWatchRewards(this.watchState.sessionIncome);
    this.resetInput();
    this.sessionMode = "campaign";
    this.mode = "intro";
    this.callbacks.onMode("intro");
    this.emitHud(true);
  }

  setVisibilityPaused(hidden: boolean) {
    if (!isWatchMode(this.sessionMode)) return;
    this.watchState = pauseForVisibility(this.watchState, hidden);
    if (!hidden) this.watchState = { ...this.watchState, paused: false };
    if (hidden) this.resetInput();
    this.emitHud(true);
  }

  skipTutorial() {
    if (!this.tutorialStep || this.tutorialResolved) return;
    this.resolveTutorial("skipped");
  }

  private resetMissionState() {
    this.enemies.length = 0;
    this.agents.length = 0;
    this.defenses.length = 0;
    this.projectiles.length = 0;
    this.clearEffects();
    this.clearLootPickups();
    this.loot = { repairs: 0, components: 0, shards: 0 };
    this.wave = 1;
    this.battleground = getBattlegroundForWave(this.wave);
    this.score = 0;
    this.data = 55;
    this.attackMultiplier = 1;
    this.agentRateMultiplier = 1;
    this.agentDamageMultiplier = 1;
    this.empState = createEmpState();
    this.previousRecruitmentAdvice = null;
    this.dismissedRecruitAgentId = null;
    this.recruitPrompt = null;
    this.previousEmpReady = false;
    this.dismissedEmpPrompt = false;
    this.empReadyPrompt = false;
    this.watchDirectorState = createWatchDirectorState();
    this.cameraFocusId = null;
    this.playerAttackCooldownMultiplier = 1;
    this.upgradeStacks = { ...EMPTY_UPGRADE_STACKS };
    this.evolutions = { ...EMPTY_EVOLUTIONS };
    this.armorId = null;
    this.componentUpgradeRanks = { ...EMPTY_COMPONENT_UPGRADE_RANKS };
    this.squadCommand = "auto";
    this.firstWaveCheckpoint = null;
    this.tutorialStep = null;
    this.tutorialMarker = null;
    this.tutorialMoveDistance = 0;
    this.tutorialKills = 0;
    this.tutorialResolved = false;
    this.placementActive = false;
    this.combatCombo = 0;
    this.combatComboLife = 0;
    this.waveActive = false;
    this.waveEndClock = 0;
    this.watchRecoveryClock = 0;
    this.reinforcementClock = 0;
    this.reinforcementsRemaining = 0;
    this.spawnQueue = [];
    this.nextQueueReleaseAt = 0;
    this.scheduledReinforcementThreats = 0;
    this.player.x = 0;
    this.player.z = 2.7;
    this.player.hp = this.player.maxHp = 100;
    this.player.damage = 25;
    this.player.attackCooldown = 0;
    this.player.meleeCooldown = 0;
    this.player.dashCooldown = 0;
    this.player.invulnerable = 0;
    this.core.hp = this.core.maxHp = 180;
    this.repairBay.hp = this.repairBay.maxHp = 70;
  }

  private emitTutorialEvent(event: TutorialEvent) {
    if (!this.tutorialStep || this.tutorialResolved) return;
    const next = advanceTutorial(this.tutorialStep, event) as TutorialStep;
    if (next === this.tutorialStep) return;
    this.tutorialStep = next;
    this.applyTutorialTransition(next);
    this.emitHud(true);
  }

  private applyTutorialTransition(next: TutorialStep) {
    if (next === "shoot") {
      this.tutorialMarker = null;
      this.spawnTutorialTraining();
    }
    if (next === "recruit") this.data = Math.max(this.data, AGENTS[0].cost);
    if (next === "observe") this.spawnTutorialBreach();
    if (next === "complete") this.resolveTutorial("complete");
  }

  private resolveTutorial(result: "complete" | "skipped") {
    if (this.tutorialResolved) return;
    this.resetInput();
    this.tutorialResolved = true;
    this.tutorialMarker = null;
    this.clearTutorialThreats();
    this.tutorialStep = result;
    this.callbacks.onTutorialComplete();
    this.captureFirstWaveCheckpoint();
    this.mode = "playing";
    this.callbacks.onMode("playing");
    this.spawnWave(1);
    if (isWatchMode(this.sessionMode)) {
      for (let index = 0; index < WATCH_STARTER_SENTRY_COUNT; index += 1) {
        this.buildDefense({ free: true });
      }
    }
    this.audio.play("wave");
    this.emitHud(true);
  }

  buildDefense(options: { free?: boolean } = {}) {
    if (this.mode !== "playing") return;
    if (this.placementActive) this.placementActive = false;
    const selected = selectAutoSentryPosition(
      this.defenses.map((defense) => ({ x: defense.x, z: defense.z })),
      [
        { x: this.player.x, z: this.player.z, radius: 0.8 },
        { x: this.core.x, z: this.core.z, radius: 1.5 },
        ...this.enemies.map((enemy) => ({
          x: enemy.x,
          z: enemy.z,
          radius: enemy.radius,
        })),
      ],
    );
    if (!selected) {
      this.callbacks.onToast({
        eyebrow: "NO VALID SENTRY POSITION",
        title: "THE DEFENSE GRID IS BLOCKED",
        detail: "Clear nearby threats or use manual placement.",
      });
      return;
    }
    this.placeDefenseAt(selected, !options.free, !options.free);
  }

  beginManualDefensePlacement() {
    if (this.mode !== "playing") return;
    if (this.placementActive) {
      this.placementActive = false;
      this.callbacks.onToast({
        eyebrow: "PLACEMENT CANCELLED",
        title: "SENTRY NOT BUILT",
        detail: "No Compute was spent.",
      });
      this.emitHud(true);
      return;
    }
    if (this.defenses.length >= 3) {
      this.callbacks.onToast({
        eyebrow: "BASE AT FULL POWER",
        title: "ALL THREE SENTRIES ARE ONLINE",
        detail: "Spend Compute on AI agents or save it for the next wave.",
      });
      return;
    }
    const cost = 80 + this.defenses.length * 35;
    if (this.data < cost) {
      this.callbacks.onToast({
        eyebrow: "NOT ENOUGH COMPUTE",
        title: `YOU NEED ${cost - this.data} MORE`,
        detail: "Destroy enemies to earn Compute, then build the sentry.",
      });
      return;
    }
    this.placementActive = true;
    this.callbacks.onToast({
      eyebrow: "SENTRY PLACEMENT",
      title: "CHOOSE A POSITION",
      detail:
        "Tap the arena inside the marked defense zone. Tap the base button again to cancel.",
    });
    this.emitHud(true);
  }

  setSquadCommand(command: SquadCommand) {
    if (this.squadCommand === command) return;
    this.squadCommand = command;
    const titles: Record<SquadCommand, string> = {
      auto: "AUTONOMOUS NETWORK ONLINE",
      follow: "SQUAD FOLLOWING YOU",
      defend: "SQUAD GUARDING THE CORE",
      focus: "SQUAD FOCUSING PRIORITY TARGETS",
    };
    this.callbacks.onToast({
      eyebrow: "SQUAD ORDER UPDATED",
      title: titles[command],
      detail:
        command === "auto"
          ? "Agents choose their own role priorities and improvise together."
          : command === "follow"
          ? "Agents stay close to your position."
          : command === "defend"
            ? "Agents hold the center and protect the Core."
            : "Agents hunt the boss or strongest enemy.",
    });
    this.emitHud(true);
  }

  useFieldKit() {
    if (this.mode !== "playing") return;
    const agent = [...this.agents]
      .filter((candidate) => candidate.hp < candidate.maxHp)
      .sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp)[0];
    if (agent && this.loot.repairs > 0) {
      agent.hp = Math.min(agent.maxHp, agent.hp + 28);
      this.loot.repairs -= 1;
      this.callbacks.onToast({ eyebrow: "FIELD KIT DEPLOYED", title: `${agent.name} STABILISED`, detail: "Repair supplies restore a damaged agent." });
      this.emitHud(true);
      return;
    }
    const turret = this.defenses.find((candidate) => candidate.hp < candidate.maxHp);
    if (turret) {
      const repaired = repairTurret(turret, this.loot.components);
      if (repaired.components !== this.loot.components) {
        turret.hp = repaired.turret.hp;
        this.loot.components = repaired.components;
        this.callbacks.onToast({
          eyebrow: "COMPONENT REPAIR",
          title: "SENTRY RESTORED",
          detail: "Components rebuilt the damaged turret assembly.",
        });
        this.emitHud(true);
        return;
      }
    }
    this.callbacks.onToast({
      eyebrow: "FIELD KIT UNAVAILABLE",
      title: "NO REPAIR TARGET OR SUPPLIES",
      detail: "Recover repair packs for agents or Components for sentries.",
    });
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  getAudioSettings() {
    return this.audio.getSettings();
  }

  enableAudio() {
    this.audio.enableAudio();
  }

  setMusicVolume(value: number) {
    this.audio.setMusicVolume(value);
  }

  setSfxVolume(value: number) {
    this.audio.setSfxVolume(value);
  }

  setCombatOverlayOpen(open: boolean) {
    this.combatOverlayOpen = open;
  }

  togglePause() {
    if (this.mode === "paused" && this.combatOverlayOpen && !isWatchMode(this.sessionMode)) return;
    if (this.mode === "playing") {
      this.resetInput();
      this.mode = "paused";
      if (isWatchMode(this.sessionMode)) this.watchState = { ...this.watchState, paused: true };
      this.audio.setPaused(true);
      this.callbacks.onMode("paused");
    } else if (this.mode === "paused") {
      this.resetInput();
      this.mode = "playing";
      if (isWatchMode(this.sessionMode)) this.watchState = { ...this.watchState, paused: false };
      this.audio.setPaused(false);
      this.callbacks.onMode("playing");
    }
  }

  recruit(id: AgentId) {
    if (!canPerformTutorialAction(this.tutorialStep, `recruit-${id}`)) return;
    if (!canRecruitPersistentWarband(this.mode)) return;
    if (this.addAgent(id, { charge: true, notify: true }) && id === "kairos") {
      this.emitTutorialEvent("kairos-recruited");
    }
  }

  useAgentSkill(id: EvolutionAgentId) {
    if (this.mode !== "playing") return;
    const agent = this.agents.find((candidate) => candidate.id === id);
    const skill = AGENT_SKILLS[id];
    if (!agent || !skill) return;
    const actionState = getAgentActionState(agent, {
      repairBay: {
        ...this.repairBay,
        isSeparate: true,
        repairPerSecond: 18,
      },
    });
    if (!actionState.canAct) return;
    const enemyTarget = id === "covenant" ? null : this.getFlatPriorityEnemy();
    const supportTarget = id === "covenant"
      ? [
          ...this.agents.map((candidate) => ({
            id: candidate.id,
            kind: "agent" as const,
            hp: candidate.hp,
            maxHp: candidate.maxHp,
          })),
          ...this.defenses.map((candidate) => ({
            id: String(candidate.index),
            kind: "turret" as const,
            hp: candidate.hp,
            maxHp: candidate.maxHp,
          })),
        ].filter((candidate) => candidate.hp > 0)
          .sort(
            (left, right) =>
              left.hp / left.maxHp - right.hp / right.maxHp ||
              String(left.id).localeCompare(String(right.id)),
          )[0] ?? null
      : null;
    const target = enemyTarget
      ? {
          id: enemyTarget.id,
          kind: "enemy",
          hp: enemyTarget.hp,
          maxHp: enemyTarget.maxHp,
          armored: enemyTarget.resistanceFlags.includes("armor"),
        }
      : supportTarget;
    const source = {
      id: agent.id,
      hp: agent.hp,
      maxHp: agent.maxHp,
      disabledLeftMs: agent.disabledLeft * 1_000,
      skillCooldowns: { [skill.id]: agent.skillCooldownLeftMs },
    };
    if (!canUseSkill(source, skill.id, { target })) return;
    const result = activateAgentSkill(source, skill.id, { target });
    agent.skillCooldownLeftMs = result.agent.skillCooldowns[skill.id];

    for (const effect of result.effects as AgentSkillEffect[]) {
      if (effect.type === "time-fracture" && enemyTarget) {
        for (const threat of this.enemies.filter(
          (candidate) =>
            this.distance(
              candidate.x,
              candidate.z,
              enemyTarget.x,
              enemyTarget.z,
            ) <= effect.radius,
        )) {
          threat.slow = Math.max(threat.slow, effect.durationMs / 1_000);
          threat.slowMultiplier = Math.min(
            threat.slowMultiplier,
            effect.slowMultiplier,
          );
        }
        this.addRing(
          enemyTarget.x,
          enemyTarget.z,
          agent.color,
          0.2,
          effect.radius,
          0.72,
        );
      }
      if (effect.type === "mark" && enemyTarget) {
        enemyTarget.markedLeft = effect.durationMs / 1_000;
        enemyTarget.markMultiplier = effect.damageMultiplier;
      }
      if (effect.type === "damage" && enemyTarget) {
        this.damageEnemy(enemyTarget, effect.amount, effect.executes);
      }
      if (effect.type === "armor-break" && enemyTarget) {
        enemyTarget.armorBrokenLeft = effect.durationMs / 1_000;
        enemyTarget.armorBreakReduction = effect.armorReduction;
      }
      if (effect.type === "suppressive-burst" && enemyTarget) {
        for (const threat of [...this.enemies].filter(
          (candidate) =>
            this.distance(
              candidate.x,
              candidate.z,
              enemyTarget.x,
              enemyTarget.z,
            ) <= effect.radius,
        )) {
          threat.slow = Math.max(threat.slow, effect.slowMs / 1_000);
          threat.slowMultiplier = Math.min(
            threat.slowMultiplier,
            effect.slowMultiplier,
          );
          this.damageEnemy(threat, effect.damage);
        }
        this.addRing(
          enemyTarget.x,
          enemyTarget.z,
          agent.color,
          0.2,
          effect.radius,
          0.58,
        );
      }
      if ((effect.type === "repair" || effect.type === "barrier") && target) {
        const targetAgent = target.kind === "agent"
          ? this.agents.find((candidate) => candidate.id === target.id)
          : null;
        const targetDefense = target.kind === "turret"
          ? this.defenses.find(
              (candidate) => String(candidate.index) === target.id,
            )
          : null;
        if (effect.type === "repair") {
          if (targetAgent) {
            targetAgent.hp = Math.min(
              targetAgent.maxHp,
              targetAgent.hp + effect.amount,
            );
          }
          if (targetDefense) {
            targetDefense.hp = Math.min(
              targetDefense.maxHp,
              targetDefense.hp + effect.amount,
            );
          }
        } else {
          if (targetAgent) {
            targetAgent.barrier = effect.amount;
            targetAgent.barrierLeft = effect.durationMs / 1_000;
          }
          if (targetDefense) {
            targetDefense.barrier = effect.amount;
            targetDefense.barrierLeft = effect.durationMs / 1_000;
          }
        }
        const x = targetAgent?.x ?? targetDefense?.x;
        const z = targetAgent?.z ?? targetDefense?.z;
        if (x !== undefined && z !== undefined) {
          this.addRing(x, z, agent.color, 0.15, 1.8, 0.55);
          this.addBeam(agent.x, agent.z, x, z, agent.color, 0.42);
        }
      }
    }
    this.audio.play("ultimate");
    this.callbacks.onToast({
      eyebrow: `${agent.name} SKILL DEPLOYED`,
      title: skill.label,
      detail: `${Math.round(skill.cooldownMs / 1_000)} second cooldown started.`,
    });
    this.emitHud(true);
  }

  private addAgent(
    id: AgentId,
    options: { charge: boolean; notify: boolean },
  ): boolean {
    const definition = AGENTS.find((agent) => agent.id === id);
    if (!definition || this.agents.some((agent) => agent.id === id)) return false;
    const recruitmentState = {
      compute: this.data,
      components: this.loot.components,
      shards: this.loot.shards,
      warband: this.agents.map((agent) => agent.id),
    };
    if (options.charge && !canRecruitWarbandSlot(recruitmentState, id)) {
      const cost = getRecruitCost(id);
      this.callbacks.onToast({
        eyebrow: "WARBAND SLOT UNAVAILABLE",
        title: cost
          ? `NEEDS ${cost.compute} COMPUTE · ${cost.components} COMPONENTS · ${cost.shards} SHARDS`
          : "RECRUITMENT LOCKED",
        detail: "Recruit in slot order and recover materials from nearby loot.",
      });
      return false;
    }
    if (options.charge) {
      const next = recruitWarbandSlot(recruitmentState, id);
      this.data = next.compute;
      this.loot.components = next.components;
      this.loot.shards = next.shards;
    }
    this.agents.push({
      ...definition,
      armorProfile: WARBAND_SLOTS.find((slot) => slot.id === id)?.armorProfile ?? { id: "standard", damageMultiplier: 1 },
      strength: WARBAND_SLOTS.find((slot) => slot.id === id)?.strength ?? 1,
      x: this.player.x,
      z: this.player.z,
      hp: 75,
      maxHp: 75,
      repairDecision: "return",
      cooldownLeft: 0.35,
      supportClock: 5,
      disabledLeft: 0,
      gatheringCooldownMs: 0,
      gatheringTargetId: null,
      skillCooldownLeftMs: 0,
      barrier: 0,
      barrierLeft: 0,
    });
    if (!options.notify) return true;
    this.addRing(
      this.player.x,
      this.player.z,
      definition.color,
      0.3,
      2.2,
      0.65,
    );
    this.addBurst(this.player.x, this.player.z, definition.color, 13);
    this.audio.play("recruit");
    this.callbacks.onToast({
      eyebrow: "AUTONOMOUS ROLE ACTIVE",
      title: `${definition.name} JOINED YOUR TEAM`,
      detail: `${definition.detail} Optional squad orders can override this role.`,
    });
    this.emitHud(true);
    return true;
  }

  private restoreAgent(id: AgentId) {
    this.addAgent(id, { charge: false, notify: false });
  }

  attack() {
    if (this.mode !== "playing" || this.player.attackCooldown > 0) return;
    const target = this.resolveAim();
    let dx = target.x - this.player.x;
    let dz = target.z - this.player.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    this.player.attackCooldown = 0.28 * this.playerAttackCooldownMultiplier;
    this.projectiles.push({
      x: this.player.x + dx * 0.55,
      z: this.player.z + dz * 0.55,
      vx: dx * 12.5,
      vz: dz * 12.5,
      life: 2.2,
      damage: this.player.damage * this.attackMultiplier,
      radius: 0.2,
      color: "#e77d44",
      faction: "operator",
      slow: 0,
    });
    this.addRing(
      this.player.x + dx * 0.5,
      this.player.z + dz * 0.5,
      0xe77d44,
      0.08,
      0.55,
      0.18,
    );
    this.audio.play("attack");
  }

  melee() {
    if (this.mode !== "playing" || this.player.meleeCooldown > 0) return;
    const target = this.resolveAim();
    let dx = target.x - this.player.x;
    let dz = target.z - this.player.z;
    const aimLength = Math.hypot(dx, dz);
    if (aimLength < 0.01) {
      dx = this.lastMove.x;
      dz = this.lastMove.z;
    } else {
      dx /= aimLength;
      dz /= aimLength;
    }
    this.player.meleeCooldown = 0.62;
    let hits = 0;
    for (const enemy of [...this.enemies]) {
      const offsetX = enemy.x - this.player.x;
      const offsetZ = enemy.z - this.player.z;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance > 2.65 + enemy.radius) continue;
      const facing =
        distance < 0.2
          ? 1
          : (offsetX / distance) * dx + (offsetZ / distance) * dz;
      if (facing < -0.12) continue;
      hits += 1;
      this.damageEnemy(enemy, 46 * this.attackMultiplier);
      enemy.x += dx * 0.42;
      enemy.z += dz * 0.42;
      this.addBeam(
        this.player.x,
        this.player.z,
        enemy.x,
        enemy.z,
        0xffb277,
        0.16,
      );
    }
    const slashX = this.player.x + dx * 1.15;
    const slashZ = this.player.z + dz * 1.15;
    this.addSlashArc(this.player.x, this.player.z, dx, dz, 0xffb277);
    this.addBurst(
      slashX,
      slashZ,
      hits > 0 ? 0xffd2ad : 0xd9793f,
      hits > 0 ? 13 : 7,
    );
    this.shake = Math.max(
      this.shake,
      this.reducedMotion ? 0.025 : hits > 0 ? 0.22 : 0.08,
    );
    this.audio.play("attack");
  }

  dash() {
    if (this.mode !== "playing" || this.player.dashCooldown > 0) return;
    let dx = this.lastMove.x;
    let dz = this.lastMove.z;
    if (Math.hypot(dx, dz) < 0.1) {
      dx = this.aim.x - this.player.x;
      dz = this.aim.z - this.player.z;
    }
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const startX = this.player.x;
    const startZ = this.player.z;
    this.player.x += dx * 3.6;
    this.player.z += dz * 3.6;
    this.clampToArena(this.player, ARENA_RADIUS);
    this.player.dashCooldown = 3;
    this.player.invulnerable = 0.34;
    this.addBeam(startX, startZ, this.player.x, this.player.z, 0xd9793f, 0.28);
    this.addBurst(startX, startZ, 0xd9793f, 10);
    this.addRing(this.player.x, this.player.z, 0xd9793f, 0.2, 1.45, 0.3);
    this.shake = Math.max(this.shake, 0.18);
    this.audio.play("dash");
  }

  activateEmp() {
    if (this.mode !== "playing" || this.intermissionClock > 0 || !this.waveActive || !canFireEmp(this.empState)) return;
    const pulse = fireEmp(this.empState, { baseDamage: EMP_BASE_DAMAGE });
    this.empState = pulse.state as EmpState;
    this.empReadyPrompt = false;
    this.dismissedEmpPrompt = false;
    const profile = getEmpRuntimeProfile({
      voltageRank: this.upgradeStacks.voltage,
      radiusMultiplier:
        getArmorBonuses(this.armorId).empRadiusMultiplier ?? 1,
      terrainRadiusMultiplier: this.terrain.empMultiplier,
    });
    const jammerThreats = this.enemies.map((threat) => ({
      id: threat.id,
      x: threat.x,
      z: threat.z,
      resistanceFlags: threat.resistanceFlags,
    }));
    for (const enemy of [...this.enemies]) {
      if (
        this.distance(enemy.x, enemy.z, this.player.x, this.player.z) <=
        profile.radius
      ) {
        enemy.slow = Math.max(enemy.slow, 2.8);
        const resistanceFlags = getEffectiveResistanceFlags(
          enemy,
          jammerThreats,
        );
        this.damageEnemy(
          enemy,
          resolveEmpDamage(
            pulse.damage,
            { resistanceFlags },
            this.encounterModifiers,
            profile.resistanceBypass,
          ),
          true,
        );
      }
    }
    this.addRing(
      this.player.x,
      this.player.z,
      0xf1eadd,
      0.4,
      profile.radius + 0.5,
      0.9,
    );
    this.addRing(
      this.player.x,
      this.player.z,
      0x9ebfc0,
      0.2,
      profile.radius * 0.67,
      0.72,
    );
    this.addBurst(this.player.x, this.player.z, 0xf1eadd, 28);
    for (const agent of this.agents) {
      this.addBeam(
        agent.x,
        agent.z,
        this.player.x,
        this.player.z,
        agent.color,
        0.5,
      );
    }
    this.shake = this.reducedMotion ? 0.04 : 0.52;
    this.audio.play("ultimate");
    this.callbacks.onToast({
      eyebrow: "EMP PULSE ACTIVATED",
      title: "THE BREACH HAS BEEN DISRUPTED",
      detail: `${pulse.damage} base disruption · ${profile.radius.toFixed(1)} range · ${Math.round(profile.resistanceBypass * 100)}% resistance bypass.`,
    });
    this.emitHud(true);
  }

  dismissRecruitPrompt() {
    this.dismissedRecruitAgentId = this.recruitPrompt?.agentId ?? null;
    this.recruitPrompt = null;
    this.emitHud(true);
  }

  dismissEmpPrompt() {
    this.dismissedEmpPrompt = true;
    this.empReadyPrompt = false;
    this.emitHud(true);
  }

  applyUpgrade(id: UpgradeId) {
    const autonomousWorkshop = this.intermissionClock > 0;
    if (this.mode !== "upgrade" && !autonomousWorkshop) return;
    try {
      const next = applyUpgradeStack({ stacks: this.upgradeStacks }, id);
      this.upgradeStacks = next.stacks;
    } catch {
      return;
    }
    if (id === "overclock") this.attackMultiplier *= 1.35;
    if (id === "bastion") {
      this.player.maxHp += 25;
      this.player.hp = this.player.maxHp;
    }
    if (id === "bandwidth") {
      this.data += 70;
      this.agentRateMultiplier *= 0.85;
    }
    if (id === "voltage") {
      const profile = getEmpRuntimeProfile({
        voltageRank: this.upgradeStacks.voltage,
      });
      this.empState = updateEmpCooldown(
        this.empState,
        profile.cooldownMs,
      ) as EmpState;
    }
    if (id === "repair") {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    }
    if (id === "command") this.agentDamageMultiplier *= 1.25;
    const selected = UPGRADES.find((upgrade) => upgrade.id === id);
    this.callbacks.onToast({
      eyebrow: "UPGRADE APPLIED",
      title: selected?.name ?? "TEAM UPGRADED",
      detail: selected?.outcome ?? "Your team is stronger.",
    });
    if (autonomousWorkshop) {
      this.emitHud(true);
      return;
    }
    this.resetInput();
    this.mode = "evolution";
    this.callbacks.onMode("evolution");
    this.emitHud(true);
  }

  evolveAgent(agentId: EvolutionAgentId, evolutionId: EvolutionId) {
    if (this.mode !== "evolution") return;
    try {
      const next = purchaseEvolution({
        compute: this.data,
        recruited: Object.fromEntries(
          (Object.keys(this.evolutions) as EvolutionAgentId[]).map((id) => [
            id,
            this.agents.some((agent) => agent.id === id),
          ]),
        ),
        evolutions: this.evolutions,
      }, agentId, evolutionId);
      this.data = next.compute;
      this.evolutions = next.evolutions;
      const evolution = EVOLUTIONS[agentId].find(
        (item: { id: string }) => item.id === evolutionId,
      );
      this.callbacks.onToast({
        eyebrow: `${agentId.toUpperCase()} EVOLVED`,
        title: evolution?.name ?? "NEW PROTOCOL ONLINE",
        detail: "This agent now has a permanent specialist ability.",
      });
      this.startNextWave();
    } catch (error) {
      this.callbacks.onToast({
        eyebrow: "EVOLUTION UNAVAILABLE",
        title: error instanceof Error ? error.message.toUpperCase() : "TRY AGAIN",
        detail: "Earn more Compute or choose another recruited agent.",
      });
    }
  }

  continueWithoutEvolution() {
    if (this.mode === "evolution") this.startNextWave();
  }

  private startNextWave() {
    this.resetInput();
    this.intermissionClock = 0;
    this.clearTemporarySubAgents();
    this.wave += 1;
    this.mode = advanceWarbandWorkshopMode(this.mode, "start-next-wave");
    this.callbacks.onMode("playing");
    this.spawnWave(this.wave);
    this.audio.play("wave");
    this.emitHud(true);
  }

  rotateCamera(direction: -1 | 1) {
    this.yaw += direction * (Math.PI / 4);
  }

  zoomCamera(direction: -1 | 1) {
    this.zoom = Math.min(1.42, Math.max(0.7, this.zoom + direction * 0.12));
  }

  setCameraPresentation(presentation: CameraPresentation) {
    this.cameraPresentation = presentation;
    if (presentation !== "command") this.cameraFocusId = null;
  }

  resetCamera() {
    this.yaw = Math.PI / 4;
    this.zoom = 1;
    this.cameraFocusId = null;
  }

  setTouchMovement(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.resetInput();
    this.clearTemporarySubAgents();
    this.clearEffects();
    this.burstEffectPool.clear((effect) => {
      effect.particles.length = 0;
    });
    this.audio.dispose();
  }

  private createBuildings() {
    const result: FreemanCanvasEngine["buildings"] = [];
    for (let x = -20; x <= 20; x += 4) {
      const index = (x + 20) / 4;
      result.push({
        x,
        z: -22,
        width: 2.1 + (index % 3) * 0.35,
        depth: 2.1 + (index % 2) * 0.4,
        height: 2.4 + ((index * 17) % 6) * 0.6,
      });
      result.push({
        x,
        z: 22,
        width: 2.2 + ((index + 1) % 3) * 0.3,
        depth: 2.2,
        height: 2.8 + ((index * 11) % 5) * 0.68,
      });
    }
    for (let z = -18; z <= 18; z += 4) {
      const index = (z + 18) / 4;
      result.push({
        x: -22,
        z,
        width: 2.35,
        depth: 2.1 + (index % 3) * 0.28,
        height: 2.2 + ((index * 13) % 6) * 0.55,
      });
      result.push({
        x: 22,
        z,
        width: 2.2,
        depth: 2.2 + (index % 2) * 0.35,
        height: 2.6 + ((index * 19) % 5) * 0.63,
      });
    }
    return result;
  }

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.resetInput);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("lostpointercapture", this.resetInput);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  private unbindEvents() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.resetInput);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.resetInput);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }
    if (this.coOpPresentation) return;
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") this.attack();
    if (event.code === "KeyX") this.melee();
    if (event.code === "KeyQ" || event.code === "ShiftLeft") this.dash();
    if (event.code === "KeyR") this.activateEmp();
    if (event.code === "KeyZ") this.rotateCamera(-1);
    if (event.code === "KeyF") this.resetCamera();
    if (event.code === "KeyB") {
      if (event.shiftKey) this.beginManualDefensePlacement();
      else this.buildDefense();
    }
    if (event.code === "KeyE") {
      const commands: SquadCommand[] = ["auto", "follow", "defend", "focus"];
      this.setSquadCommand(
        commands[(commands.indexOf(this.squadCommand) + 1) % commands.length],
      );
    }
    if (event.code === "Escape") {
      if (this.placementActive) {
        this.placementActive = false;
        this.emitHud(true);
      } else {
        this.togglePause();
      }
    }
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const agent = AGENTS[index];
      if (agent) this.recruit(agent.id);
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private resetInput() {
    this.keys.clear();
    this.touchMove.x = 0;
    this.touchMove.y = 0;
    this.touchMovePointer = null;
    if (this.touchAimActive) this.hasPointerAim = false;
    this.touchAimActive = false;
    if (
      this.dragPointer !== null &&
      this.canvas.hasPointerCapture(this.dragPointer)
    ) {
      this.canvas.releasePointerCapture(this.dragPointer);
    }
    this.dragPointer = null;
  }

  private onVisibilityChange() {
    this.setVisibilityPaused(document.hidden);
    if (document.hidden) this.resetInput();
  }

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus();
    if (this.coOpPresentation) return;
    if (event.pointerType === "touch" && event.button === 0) {
      this.touchMovePointer = event.pointerId;
      this.touchStartX = event.clientX;
      this.touchStartY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const tap = tapToFire((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      this.updateAimFromScreen(event.clientX, event.clientY);
      this.touchAimActive = true;
      void tap;
      this.hasPointerAim = true;
      if (this.placementActive) this.confirmFlatDefensePlacement();
      else this.attack();
      return;
    }
    if (event.button === 1) {
      this.dragPointer = event.pointerId;
      this.dragX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 2) {
      this.updateAim(event);
      if (!this.placementActive) this.melee();
      return;
    }
    if (event.button === 0) {
      this.updateAim(event);
      if (this.placementActive) {
        this.confirmFlatDefensePlacement();
        return;
      }
      this.attack();
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.touchMovePointer === event.pointerId) {
      const normalized = normalizeStickInput(
        (event.clientX - this.touchStartX) / 72,
        (event.clientY - this.touchStartY) / 72,
      );
      this.setTouchMovement(normalized.x, normalized.y);
      return;
    }
    if (this.dragPointer === event.pointerId) {
      const delta = event.clientX - this.dragX;
      this.dragX = event.clientX;
      this.yaw -= delta * 0.008;
      return;
    }
    this.updateAim(event);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.touchMovePointer === event.pointerId) {
      this.touchMovePointer = null;
      this.setTouchMovement(0, 0);
      if (this.touchAimActive) this.hasPointerAim = false;
      this.touchAimActive = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (this.dragPointer === event.pointerId) {
      this.dragPointer = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    }
  };

  private onPointerCancel = () => {
    this.resetInput();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom = Math.min(
      1.42,
      Math.max(0.7, this.zoom + Math.sign(event.deltaY) * 0.08),
    );
  };

  private preventContextMenu = (event: Event) => event.preventDefault();

  private updateAim(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.unproject(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    this.aim.x = world.x;
    this.aim.z = world.z;
    this.hasPointerAim = true;
  }

  private updateAimFromScreen(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.unproject(clientX - rect.left, clientY - rect.top);
    this.aim.x = world.x;
    this.aim.z = world.z;
    this.hasPointerAim = true;
  }

  private animate = (time: number) => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    this.updateQuality(delta * 1_000);
    this.elapsed += delta;
    if (isWatchMode(this.sessionMode)) {
      const cinemaDelta = this.mode === "playing" && !this.watchState.paused
        ? delta * 1_000
        : 0;
      this.cinemaState = tickCinemaState(this.cinemaState, cinemaDelta);
      this.watchState = tickWatchState(
        this.watchState,
        delta * 1_000,
        { visible: !document.hidden && !this.cinemaState.paused },
      );
    }
    const presentationDelta = isWatchMode(this.sessionMode) &&
      (this.watchState.paused || this.cinemaState.paused)
      ? 0
      : delta;
    if (!this.coOpPresentation && this.mode === "playing" && (!isWatchMode(this.sessionMode) || (!this.watchState.paused && !this.cinemaState.paused))) {
      this.updateGame(isWatchMode(this.sessionMode) ? delta * this.watchState.speed * this.cinemaState.speed : delta);
    }
    this.updateEffects(presentationDelta);
    this.updateCamera(delta);
    this.draw();
  };

  private updateQuality(frameMs: number) {
    const next = tickQualityMonitor(this.qualityMonitor, frameMs);
    this.qualityMonitor = next;
    if (next.profile === this.qualityPreset) return;
    this.qualityPreset = next.profile;
    const settings = getQualitySettings(next.profile);
    this.pixelRatio = Math.min(window.devicePixelRatio, settings.pixelRatioCap);
    while (this.effects.length > settings.maxCombatEffects) {
      const effect = this.effects.shift();
      if (effect) this.releaseFlatEffect(effect);
    }
    this.resize();
    this.emitHud(true);
  }

  private updateGame(delta: number) {
    this.empState = tickEmp(this.empState, delta * 1_000) as EmpState;
    this.watchRecoveryClock = Math.max(0, this.watchRecoveryClock - delta);
    if (this.intermissionClock > 0) {
      this.intermissionClock = tickWaveIntermission(this.intermissionClock, delta * 1_000);
      if (this.intermissionClock === 0) this.startNextWave();
    }
    this.runAutonomousNetwork(delta);
    this.updatePlayer(delta);
    this.updateWatchOperator(delta);
    this.updateAgents(delta);
    this.updateDefenses(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.updateLootPickups();
    this.releaseQueuedEnemies();
    this.player.attackCooldown = Math.max(
      0,
      this.player.attackCooldown - delta,
    );
    this.player.meleeCooldown = Math.max(
      0,
      this.player.meleeCooldown - delta,
    );
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);

    if (this.reinforcementsRemaining > 0) {
      this.reinforcementClock -= delta;
      if (this.reinforcementClock <= 0) {
        this.reinforcementsRemaining -= 1;
        const types = this.wave === 1
          ? FIRST_WAVE.reinforcement as unknown as EnemyType[]
          : Array.from(
              { length: Math.min(10, 4 + this.wave) },
              (_, index): EnemyType =>
                this.wave >= 6 && index === 0
                  ? "trojan"
                  : index % 3 === 0
                    ? "phisher"
                    : "virus",
            );
        if (this.wave !== 1) {
          this.reinforcementClock = Math.max(4, 6.6 - this.wave * 0.24);
        }
        const count = types.length;
        this.scheduledReinforcementThreats = Math.max(
          0,
          this.scheduledReinforcementThreats - count,
        );
        this.spawnFormation(types);
        if (this.wave !== 1) {
          this.callbacks.onToast({
            eyebrow: "HORDE REINFORCEMENT",
            title: `${count} MORE THREATS ENTERED`,
            detail:
              "Later waves keep sending reinforcements. Hold the perimeter.",
          });
        }
      }
    }

    if (
      this.waveActive &&
      canCompleteWave({
        active: this.enemies.length,
        queued: this.spawnQueue.length,
        scheduled: this.scheduledReinforcementThreats,
      }) &&
      this.waveEndClock === 0
    ) {
      this.waveActive = false;
      this.waveEndClock = 1.25;
    }
    if (this.waveEndClock > 0) {
      this.waveEndClock -= delta;
      if (this.waveEndClock <= 0) this.completeWave();
    }
    this.hudClock -= delta;
    if (this.hudClock <= 0) {
      this.hudClock = 0.1;
      this.emitHud();
    }
  }

  private recordWatchEvent(event: string) {
    if (!isWatchMode(this.sessionMode)) return;
    this.watchState = recordWatchEvent(this.watchState, event);
  }

  private runAutonomousNetwork(delta: number) {
    this.autonomousActionClock -= delta * 1_000;
    if (this.autonomousActionClock > 0 || this.agents.length === 0) return;
    this.autonomousActionClock = AUTONOMOUS_ACTION_INTERVAL_MS;
    if (isWatchMode(this.sessionMode) && this.agents.length < WARBAND_SLOTS.length) {
      const nextAgent = WARBAND_SLOTS[this.agents.length]?.id as AgentId | undefined;
      if (nextAgent && this.addAgent(nextAgent, { charge: true, notify: false })) {
        this.recordWatchEvent(nextAgent.toUpperCase() + " RECRUITED BY THE NETWORK");
        this.emitHud(true);
        return;
      }
    }
    const damagedAgent = this.agents.some((agent) => agent.hp < agent.maxHp);
    const damagedTurret = this.defenses.some((defense) => defense.hp < defense.maxHp);
    const action = chooseAutonomousNetworkAction({
      mode: this.mode,
      coreDamaged: this.core.hp < this.core.maxHp,
      components: this.loot.components,
      damagedAgent,
      repairKits: this.loot.repairs,
      damagedTurret,
      defenses: this.defenses.length,
      maxDefenses: 3,
      compute: this.data,
      defenseCost: 80 + this.defenses.length * 35,
      watchPriority: this.watchState.priority,
    });
    if (action === "repair-core") {
      const result = repairCore(this.core, this.loot.components);
      if (!result.repaired) return;
      this.core.hp = result.core.hp;
      this.loot.components = result.components;
      this.recordWatchEvent("AGENTS REPAIRED THE CORE");
      this.callbacks.onToast({
        eyebrow: "AUTONOMOUS CORE REPAIR",
        title: `CORE RESTORED +${CORE_REPAIR_AMOUNT}`,
        detail: `Agents spent ${CORE_REPAIR_COMPONENT_COST} Components to stabilize the network core.`,
      });
      this.emitHud(true);
    } else if (action === "repair-agent" || action === "repair-sentry") {
      this.recordWatchEvent(action === "repair-agent"
        ? "AGENT RETURNED TO REPAIR"
        : "SENTRY REPAIRED");
      this.useFieldKit();
    } else if (action === "build-sentry") {
      this.recordWatchEvent("AGENTS BUILT A SENTRY");
      this.buildDefense();
    }
  }

  private updatePlayer(delta: number) {
    let horizontal = 0;
    let vertical = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) horizontal -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) horizontal += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) vertical += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) vertical -= 1;
    horizontal += this.touchMove.x;
    vertical += -this.touchMove.y;
    const inputLength = Math.hypot(horizontal, vertical);
    if (inputLength > 1) {
      horizontal /= inputLength;
      vertical /= inputLength;
    }
    if (Math.hypot(horizontal, vertical) <= 0.01) return;
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    let dx = forwardX * vertical + rightX * horizontal;
    let dz = forwardZ * vertical + rightZ * horizontal;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    this.lastMove.x = dx;
    this.lastMove.z = dz;
    const previousPosition = { x: this.player.x, z: this.player.z };
    this.player.x += dx * delta * 4.8;
    this.player.z += dz * delta * 4.8;
    this.clampToArena(this.player, ARENA_RADIUS);
    this.recordTutorialMovement(previousPosition);
  }

  private updateWatchOperator(delta: number) {
    if (!isWatchMode(this.sessionMode) || this.mode !== "playing") return;
    const threatRuntime = this.getNearestEnemy(this.core.x, this.core.z, 12) ??
      this.getNearestEnemy(this.player.x, this.player.z, 10);
    const threat = threatRuntime
      ? {
          x: threatRuntime.x,
          z: threatRuntime.z,
          distance: this.distance(this.player.x, this.player.z, threatRuntime.x, threatRuntime.z),
        }
      : null;
    const pickupRuntime = !threatRuntime
      ? [...this.pickups]
          .filter((candidate) => candidate.type !== "repair" || this.player.hp < this.player.maxHp)
          .sort((left, right) =>
            this.distance(this.player.x, this.player.z, left.x, left.y) -
            this.distance(this.player.x, this.player.z, right.x, right.y),
          )[0]
      : null;
    const directorResult = tickWatchDirector(
      this.watchDirectorState,
      {
        operator: {
          x: this.player.x,
          z: this.player.z,
          hpRatio: this.player.hp / this.player.maxHp,
        },
        core: {
          x: this.core.x,
          z: this.core.z,
          hpRatio: this.core.hp / this.core.maxHp,
        },
        threat,
        pickup: pickupRuntime
          ? {
              x: pickupRuntime.x,
              z: pickupRuntime.y,
              useful: pickupRuntime.type !== "repair" || this.player.hp < this.player.maxHp,
            }
          : null,
        zones: ARENA_ZONE_MARKERS.map(({ x, z }) => ({ x, z })),
        priority: this.watchState.priority,
      },
      delta * 1_000,
    );
    this.watchDirectorState = directorResult.state;
    if (directorResult.intent.reset) {
      this.recordWatchEvent(`WATCH DIRECTOR: ${directorResult.intent.reason}`);
      this.releaseQueuedEnemies();
    }
    const targetX = directorResult.intent.target.x;
    const targetZ = directorResult.intent.target.z;
    let dx = targetX - this.player.x;
    let dz = targetZ - this.player.z;
    const distance = Math.hypot(dx, dz);
    const engaging = directorResult.intent.state === "engage" && threatRuntime !== null;
    if (distance > (engaging ? 4.4 : 0.55)) {
      dx /= distance || 1;
      dz /= distance || 1;
      this.player.x += dx * delta * 3.2;
      this.player.z += dz * delta * 3.2;
      this.clampToArena(this.player, ARENA_RADIUS - 0.5);
    } else if (engaging && threatRuntime) {
      if (distance <= 2.5) this.melee();
      this.attack();
    }
  }

  private recordTutorialMovement(previousPosition: { x: number; z: number }) {
    if (this.tutorialStep !== "move" || !this.tutorialMarker) return;
    this.tutorialMoveDistance += this.distance(
      previousPosition.x,
      previousPosition.z,
      this.player.x,
      this.player.z,
    );
    if (
      this.tutorialMoveDistance >= 2.5 &&
      this.distance(
        this.player.x,
        this.player.z,
        this.tutorialMarker.x,
        this.tutorialMarker.z,
      ) <= 1.25
    ) {
      this.emitTutorialEvent("movement-complete");
    }
  }

  private updateTemporarySubAgents(delta: number) {
    const repairBay = {
      ...this.repairBay,
      isSeparate: true,
      repairPerSecond: 18,
    };
    const active: FlatTemporarySubAgent[] = [];
    this.temporarySubAgents.forEach((subAgent, index) => {
      const parent = this.agents.find((agent) => agent.id === subAgent.parentId);
      if (!parent) return;
      const { canAct: parentCanAct } = getAgentActionState({
        ...parent,
        disabledLeftMs: parent.disabledLeft * 1_000,
      }, { repairBay });
      const angle = this.elapsed * 1.8 + index * 2.1;
      subAgent.x = parent.x + Math.cos(angle) * 0.75;
      subAgent.z = parent.z + Math.sin(angle) * 0.75;
      const attackTarget = this.enemies.find(
        (enemy) =>
          this.distance(enemy.x, enemy.z, subAgent.x, subAgent.z) < 6,
      );
      const coreThreat = this.enemies.find(
        (enemy) =>
          this.distance(enemy.x, enemy.z, this.core.x, this.core.z) < 7.5,
      );
      const result = tickTemporarySubAgent(
        subAgent,
        {
          attackTargetInRange: parentCanAct && Boolean(attackTarget),
          playerNeedsRepair:
            parentCanAct && this.player.hp < this.player.maxHp,
          coreThreatInRange: parentCanAct && Boolean(coreThreat),
        },
        delta * 1_000,
      );
      Object.assign(subAgent, result.state);
      if (result.expired) {
        this.addRing(subAgent.x, subAgent.z, parent.color, 0.1, 1.1, 0.2);
        return;
      }
      const action = result.action as TemporarySubAgentAction;
      if (action.type === "attack" && attackTarget) {
        this.damageEnemy(attackTarget, action.damage);
      } else if (action.type === "repair") {
        this.player.hp = Math.min(
          this.player.maxHp,
          this.player.hp + action.playerHealing,
        );
        for (const ally of this.agents) {
          ally.cooldownLeft = Math.max(
            0,
            ally.cooldownLeft - action.allyCooldownReductionMs / 1_000,
          );
        }
        this.addRing(subAgent.x, subAgent.z, parent.color, 0.12, 1.2, 0.25);
      } else if (action.type === "guard" && coreThreat) {
        coreThreat.slow = Math.max(coreThreat.slow, action.slowMs / 1_000);
        this.damageEnemy(coreThreat, action.damage);
      }
      active.push(subAgent);
    });
    this.temporarySubAgents = active;
  }

  private maybeSpawnTemporarySubAgent(
    agent: FlatAgent,
    intent: AutonomyIntent,
    elapsedMs = 0,
  ) {
    const spawnState = tickSubAgentSpawnState(
      this.subAgentSpawnState[agent.id] ?? createSubAgentSpawnState(),
      elapsedMs,
    );
    this.subAgentSpawnState[agent.id] = spawnState;
    this.autonomyState[agent.id] = intent;
    if (intent !== "improvise") return;
    const spendableMaterials = getSpendableWarbandMaterials({
      components: this.loot.components,
      shards: this.loot.shards,
      warband: this.agents.map((candidate) => candidate.id),
    });
    const pressure = this.enemies.length / this.activeEnemyLimit;
    const spawnDecisionInput = {
      pressure,
      activeChildren: this.temporarySubAgents.filter(
        (subAgent) => subAgent.parentId === agent.id,
      ).length,
      totalActive: this.temporarySubAgents.length,
      materials: spendableMaterials,
      cooldownLeftMs: spawnState.cooldownLeftMs,
      maxPerParent: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT,
      globalCap: SUB_AGENT_GLOBAL_CAP,
    };
    const decision = getSubAgentSpawnDecision(spawnDecisionInput);
    if (!decision.allowed) return;
    const spawned = spawnTemporarySubAgent(
      { id: agent.id, role: AUTONOMY_ROLES[agent.id] },
      {
        enemyDensity: this.enemies.length,
        playerHealthRatio: this.player.hp / this.player.maxHp,
        coreHealthRatio: this.core.hp / this.core.maxHp,
        wavePressure: this.enemies.length / this.activeEnemyLimit,
        subAgents: this.temporarySubAgents,
        maxSubAgents: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT,
        materials: spendableMaterials,
        upgrades: { componentUpgradeRanks: this.componentUpgradeRanks },
      },
    ) as TemporarySubAgent | null;
    if (!spawned) return;
    this.loot.components -= SUB_AGENT_MATERIAL_COST.components;
    this.loot.shards -= SUB_AGENT_MATERIAL_COST.shards;
    this.temporarySubAgents.push({
      ...spawned,
      x: agent.x,
      z: agent.z,
      color: agent.color,
      maxLifetimeMs: spawned.remainingMs,
      cooldownLeftMs: 350,
      healthRatio: 1,
      lifetimeRatio: 1,
    });
    this.addRing(agent.x, agent.z, agent.color, 0.12, 1.4, 0.28);
    this.addBurst(agent.x, agent.z, agent.color, 8);
    this.subAgentSpawnState[agent.id] = {
      cooldownLeftMs: SUB_AGENT_SPAWN_COOLDOWN_MS,
    };
    this.callbacks.onToast({
      eyebrow: "TEMPORARY SUB-AGENT DEPLOYED",
      title: `${agent.name} DEPLOYED ${spawned.role.toUpperCase()} SUPPORT`,
      detail: `-${SUB_AGENT_MATERIAL_COST.components} COMPONENT · -${SUB_AGENT_MATERIAL_COST.shards} SHARD · ${spawned.remainingMs / 1_000} SECOND LIFETIME`,
    });
    this.emitHud(true);
  }

  private clearTemporarySubAgents() {
    this.temporarySubAgents = clearSubAgents() as FlatTemporarySubAgent[];
    this.autonomyState = {};
    this.subAgentSpawnState = {};
  }

  private updateAgents(delta: number) {
    const count = this.agents.length;
    const priority = this.getFlatPriorityEnemy();
    const repairBay = {
      ...this.repairBay,
      isSeparate: true,
      repairPerSecond: 18,
    };
    this.agents.forEach((agent, index) => {
      const roleIntent = decideAgentIntent(
        { id: agent.id, role: AUTONOMY_ROLES[agent.id] },
        {
          enemyDensity: this.enemies.length,
          playerHealthRatio: this.player.hp / this.player.maxHp,
          coreHealthRatio: this.core.hp / this.core.maxHp,
          wavePressure: this.enemies.length / this.activeEnemyLimit,
        },
      ) as AutonomyIntent;
      const intent: AutonomyIntent =
        this.squadCommand === "auto"
          ? roleIntent
          : this.squadCommand === "follow"
          ? "follow"
          : this.squadCommand === "focus"
          ? "assault"
          : this.squadCommand === "defend"
            ? "defend"
            : roleIntent;
      agent.repairDecision = getRepairDecision(agent, {
        repairBay,
      });
      const gathering = tickAgentGathering(
        {
          id: agent.id,
          x: agent.x,
          y: agent.z,
          gatheringCooldownMs: agent.gatheringCooldownMs,
        },
        {
          hostileTargetInRange: Boolean(
            this.getNearestEnemy(agent.x, agent.z, agent.range),
          ),
          retreating:
            agent.disabledLeft > 0 ||
            shouldWithdrawToRepairBay(agent.repairDecision, repairBay),
          nearbyLoot: this.pickups,
        },
        delta * 1000,
      );
      agent.gatheringCooldownMs = gathering.gatheringCooldownMs;
      agent.gatheringTargetId = gathering.gatheringTargetId;
      const gatheringPickup = agent.gatheringTargetId
        ? this.pickups.find((pickup) => pickup.id === agent.gatheringTargetId) ?? null
        : null;
      const angle =
        (index / Math.max(1, count)) * Math.PI * 2 +
        (isWatchMode(this.sessionMode) ? (this.cinemaState.elapsedMs / 1_000) * 0.22 : 0) +
        (intent === "support"
          ? (isWatchMode(this.sessionMode) ? this.cinemaState.elapsedMs / 1_000 : this.elapsed) * 0.18
          : 0);
      const withdrawing = shouldWithdrawToRepairBay(
        agent.repairDecision,
        repairBay,
      );
      const anchorX = withdrawing
        ? this.repairBay.x
        : gatheringPickup
        ? gatheringPickup.x
        : intent === "follow"
          ? this.player.x
          : intent === "assault" && priority
          ? priority.x
          : intent === "support"
            ? this.player.hp / this.player.maxHp <= this.core.hp / this.core.maxHp
              ? this.player.x
              : this.core.x
            : intent === "defend"
              ? this.core.x
              : priority?.x ?? this.player.x;
      const anchorZ = withdrawing
        ? this.repairBay.z
        : gatheringPickup
        ? gatheringPickup.y
        : intent === "follow"
          ? this.player.z
          : intent === "assault" && priority
          ? priority.z
          : intent === "support"
            ? this.player.hp / this.player.maxHp <= this.core.hp / this.core.maxHp
              ? this.player.z
              : this.core.z
            : intent === "defend"
              ? this.core.z
              : priority?.z ?? this.player.z;
      const assaultRadius = Math.max(2.6, agent.range * 0.46);
      const bossRadius = priority?.bossState
        ? Math.max(0.8, priority.bossState.attackRadius * 0.75)
        : Infinity;
      const radius = withdrawing || gatheringPickup
        ? 0
        : intent === "defend"
          ? 2.75
          : intent === "assault" || intent === "improvise"
            ? Math.min(assaultRadius, bossRadius)
            : 1.45 + (index % 2) * 0.38;
      let targetX = anchorX + Math.cos(angle) * radius;
      let targetZ = anchorZ + Math.sin(angle) * radius;
      const targetLength = Math.hypot(targetX, targetZ);
      if (targetLength > ARENA_RADIUS - 0.4) {
        targetX = (targetX / targetLength) * (ARENA_RADIUS - 0.4);
        targetZ = (targetZ / targetLength) * (ARENA_RADIUS - 0.4);
      }
      const ease = 1 - Math.exp(-delta * (agent.id === "forge" ? 5 : 4));
      agent.x += (targetX - agent.x) * ease;
      agent.z += (targetZ - agent.z) * ease;
      const atRepairBay =
        this.distance(agent.x, agent.z, this.repairBay.x, this.repairBay.z) <= 1.35;
      const repaired = tickRepairBay(
        repairBay,
        [{
          ...agent,
          disabledLeftMs: agent.disabledLeft * 1_000,
          atRepairBay,
          repairing: atRepairBay && agent.repairDecision === "repair",
        }],
        delta * 1_000,
      );
      agent.hp = repaired.units[0].hp;
      agent.disabledLeft = repaired.units[0].disabledLeftMs / 1_000;
      agent.cooldownLeft = Math.max(0, agent.cooldownLeft - delta);
      agent.skillCooldownLeftMs = Math.max(
        0,
        agent.skillCooldownLeftMs - delta * 1_000,
      );
      agent.barrierLeft = Math.max(0, agent.barrierLeft - delta);
      if (agent.barrierLeft === 0) agent.barrier = 0;
      const actionState = getAgentActionState({
        ...agent,
        disabledLeftMs: agent.disabledLeft * 1_000,
      }, { repairBay });
      if (!actionState.canAct) return;
      agent.supportClock -= delta;
      if (gatheringPickup) {
        const collection = collectMaterials(
          {
            id: agent.id,
            x: agent.x,
            y: agent.z,
            gatheringCooldownMs: agent.gatheringCooldownMs,
          },
          this.pickups,
        );
        agent.gatheringCooldownMs = collection.agent.gatheringCooldownMs;
        if (collection.collected.repairs || collection.collected.components || collection.collected.shards) {
          this.loot.repairs += collection.collected.repairs;
          this.loot.components += collection.collected.components;
          this.loot.shards += collection.collected.shards;
          const pickupIndex = this.pickups.findIndex(
            (pickup) => pickup.id === collection.agent.gatheredLootId,
          );
          if (pickupIndex >= 0) this.pickups.splice(pickupIndex, 1);
          this.emitHud(true);
        }
      }
      this.maybeSpawnTemporarySubAgent(agent, roleIntent, delta * 1_000);
      if (agent.id === "covenant" && agent.supportClock <= 0) {
        const nanites = this.evolutions.covenant === "nanite-repair";
        const aegis = this.evolutions.covenant === "aegis-relay";
        const healingMultiplier =
          (getArmorBonuses(this.armorId).healingMultiplier ?? 1) *
          Math.pow(
            getAgentUpgradeMultiplier(
              "covenant",
              "nanite-reserve",
              "healingMultiplier",
            ),
            getComponentRank(this.componentUpgradeRanks, "covenant", "nanite-reserve"),
          );
        agent.supportClock = aegis ? 8 : 6.5;
        this.player.hp = Math.min(
          this.player.maxHp,
          this.player.hp + (nanites ? 18 : aegis ? 20 : 12) * healingMultiplier,
        );
        if (nanites) {
          for (const ally of this.agents) {
            ally.disabledLeft = Math.max(0, ally.disabledLeft - 1.5);
          }
        }
        this.addRing(this.player.x, this.player.z, agent.color, 0.4, 3.2, 0.72);
      }
      let target: FlatEnemy | null = null;
      if (!gatheringPickup && (intent === "assault" || intent === "improvise")) {
        target = priority;
      } else if (!gatheringPickup && (intent === "follow" || intent === "support")) {
        target = this.getNearestEnemy(agent.x, agent.z, agent.range);
      } else if (!gatheringPickup && intent === "defend") {
        const coreThreat = this.getNearestEnemy(this.core.x, this.core.z, 9.5);
        if (
          coreThreat &&
          this.distance(coreThreat.x, coreThreat.z, agent.x, agent.z) <=
            agent.range + 1.4
        ) {
          target = coreThreat;
        }
      }
      if (
        target &&
        this.distance(target.x, target.z, agent.x, agent.z) > agent.range + 0.9
      ) {
        target = null;
      }
      if (!target || agent.cooldownLeft > 0) return;
      let dx = target.x - agent.x;
      let dz = target.z - agent.z;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      agent.cooldownLeft =
        agent.cooldown *
        this.agentRateMultiplier *
        (agent.id === "kairos"
          ? Math.pow(
              getAgentUpgradeMultiplier(
                "kairos",
                "stasis-array",
                "cooldownMultiplier",
              ),
              getComponentRank(this.componentUpgradeRanks, "kairos", "stasis-array"),
            )
          : agent.id === "forge"
            ? Math.pow(
                getAgentUpgradeMultiplier(
                  "forge",
                  "breach-ammo",
                  "cooldownMultiplier",
                ),
                getComponentRank(this.componentUpgradeRanks, "forge", "breach-ammo"),
              )
            : 1) *
        (agent.id === "forge" &&
        this.evolutions.forge === "suppression-loop"
          ? 0.68
          : 1);
      if (agent.id === "kairos") {
        target.slow = Math.max(
          target.slow,
          this.evolutions.kairos === "stasis-lock" ? 2.8 : 1.6,
        );
        this.damageEnemy(target, agent.damage * this.agentDamageMultiplier);
        this.addBeam(agent.x, agent.z, target.x, target.z, agent.color, 0.22);
        this.addRing(target.x, target.z, agent.color, 0.1, 1.35, 0.38);
        if (this.evolutions.kairos === "cryo-mesh") {
          for (const chained of this.enemies
            .filter(
              (enemy) =>
                enemy !== target &&
                this.distance(enemy.x, enemy.z, target.x, target.z) <= 2.5,
            )
            .slice(0, 2)) {
            chained.slow = Math.max(chained.slow, 1.12);
            this.damageEnemy(
              chained,
              agent.damage * this.agentDamageMultiplier * 0.7,
            );
          }
        }
        return;
      }
      const evolutionDamage =
        agent.id === "kira" &&
        this.evolutions.kira === "execution-protocol" &&
        target.hp / target.maxHp < 0.4
          ? 1.35
          : agent.id === "forge" &&
              this.evolutions.forge === "cluster-burst"
            ? 1.45
            : agent.id === "kira" && this.evolutions.kira === "rail-pierce"
              ? 1.22
              : 1;
      const componentDamage =
        agent.id === "kira"
          ? Math.pow(
              getAgentUpgradeMultiplier(
                "kira",
                "hunter-core",
                "damageMultiplier",
              ),
              getComponentRank(
                this.componentUpgradeRanks,
                "kira",
                "hunter-core",
              ),
            )
          : agent.id === "forge"
            ? Math.pow(
                getAgentUpgradeMultiplier(
                  "forge",
                  "breach-ammo",
                  "damageMultiplier",
                ),
                getComponentRank(
                  this.componentUpgradeRanks,
                  "forge",
                  "breach-ammo",
                ),
              )
            : 1;
      this.projectiles.push({
        x: agent.x,
        z: agent.z,
        vx: dx * (agent.id === "kira" ? 15 : agent.id === "forge" ? 12 : 10),
        vz: dz * (agent.id === "kira" ? 15 : agent.id === "forge" ? 12 : 10),
        life: 2.2,
        damage:
          agent.damage *
          this.agentDamageMultiplier *
          evolutionDamage *
          componentDamage,
        radius: agent.id === "forge" ? 0.14 : 0.18,
        color: toCssColor(agent.color),
        faction: "agent",
        slow: agent.id === "covenant" ? 0.25 : 0,
      });
    });
    this.updateTemporarySubAgents(delta);
  }

  private updateDefenses(delta: number) {
    for (const defense of this.defenses) {
      defense.barrierLeft = Math.max(0, defense.barrierLeft - delta);
      if (defense.barrierLeft === 0) defense.barrier = 0;
      if (defense.hp <= 0) continue;
      defense.cooldownLeft = Math.max(0, defense.cooldownLeft - delta);
      const target = this.getNearestEnemy(defense.x, defense.z, 8.5);
      if (!target) {
        defense.rotation += delta * 0.4;
        continue;
      }
      const dx = target.x - defense.x;
      const dz = target.z - defense.z;
      const length = Math.hypot(dx, dz) || 1;
      defense.rotation = Math.atan2(dx, dz);
      if (defense.cooldownLeft > 0) continue;
      defense.cooldownLeft = Math.max(0.38, 0.82 - this.wave * 0.025);
      this.projectiles.push({
        x: defense.x,
        z: defense.z,
        vx: (dx / length) * 14,
        vz: (dz / length) * 14,
        life: 2.2,
        damage: 18 + this.wave * 1.5,
        radius: 0.15,
        color: "#9ed8dd",
        faction: "agent",
        slow: 0,
      });
      this.addRing(defense.x, defense.z, 0x9ed8dd, 0.08, 0.55, 0.15);
    }
  }

  private updateFlatBossEnemy(enemy: FlatEnemy, delta: number) {
    if (!enemy.bossState) return;
    const bossTargets = [
      ...this.agents.map((agent) => ({
        id: agent.id,
        kind: "agent" as const,
        hp: agent.hp,
        x: agent.x,
        z: agent.z,
      })),
      ...this.defenses.map((defense) => ({
        id: String(defense.index),
        kind: "turret" as const,
        hp: defense.hp,
        x: defense.x,
        z: defense.z,
      })),
    ];
    const result = tickBoss(
      { ...enemy.bossState, hp: enemy.hp },
      delta * 1_000,
      {
        targets: bossTargets,
        bossX: enemy.x,
        bossZ: enemy.z,
        enemyCapacity: Math.max(
          0,
          this.activeEnemyLimit - this.enemies.length,
        ),
      },
    );
    enemy.bossState = result.boss;
    enemy.telegraphLeft = result.boss.telegraphLeftMs / 1_000;
    enemy.telegraphTotal = result.boss.telegraphMs / 1_000;
    for (const event of result.events) {
      if (event.type === "damage" && event.targetKind === "agent") {
        const target = this.agents.find(
          (candidate) => candidate.id === event.targetId,
        );
        if (target) this.damageAgent(target, event.amount);
      }
      if (event.type === "damage" && event.targetKind === "turret") {
        const target = this.defenses.find(
          (candidate) => String(candidate.index) === event.targetId,
        );
        if (target) this.damageDefense(target, event.amount);
      }
      if (event.type === "reinforcement") {
        this.spawnFormation(
          Array.from(
            { length: event.count },
            (_, index): EnemyType => index % 2 === 0 ? "virus" : "phisher",
          ),
        );
      }
    }
    const pendingTarget = getPendingBossTarget(result.boss, bossTargets);
    const movementTarget =
      pendingTarget ??
      getNearestBossTarget(
        bossTargets,
        enemy.x,
        enemy.z,
      );
    const targetX = movementTarget?.x;
    const targetZ = movementTarget?.z;
    if (
      targetX !== undefined &&
      targetZ !== undefined &&
      result.boss.telegraphLeftMs === 0
    ) {
      const arrivalDistance = Math.max(0.75, result.boss.attackRadius * 0.86);
      const distance = this.distance(enemy.x, enemy.z, targetX, targetZ);
      if (distance > arrivalDistance) {
        const slowFactor = getSlowMovementMultiplier(
          enemy.slow * 1_000,
          enemy.slowMultiplier,
        );
        const advance = resolveEnemyAdvance(
          {
            position: { x: enemy.x, z: enemy.z },
            target: {
              id: movementTarget?.id ?? "boss-target",
              x: targetX,
              z: targetZ,
            },
            routeBias: this.terrain.routeBias,
            arrivalDistance,
            watchdog: enemy.movementWatchdog,
          },
          delta * 1_000,
        );
        enemy.movementWatchdog = advance.watchdog;
        enemy.x +=
          advance.vector.x *
          delta *
          enemy.speed *
          slowFactor;
        enemy.z +=
          advance.vector.z *
          delta *
          enemy.speed *
          slowFactor;
      }
    }
  }

  private updateEnemies(delta: number) {
    for (const enemy of [...this.enemies]) {
      enemy.cooldownLeft = Math.max(0, enemy.cooldownLeft - delta);
      enemy.slow = Math.max(0, enemy.slow - delta);
      if (enemy.slow === 0) enemy.slowMultiplier = 0.48;
      enemy.markedLeft = Math.max(0, enemy.markedLeft - delta);
      enemy.armorBrokenLeft = Math.max(0, enemy.armorBrokenLeft - delta);
      if (enemy.armorBrokenLeft === 0) enemy.armorBreakReduction = 0;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
      if (enemy.hitFlash === 0) {
        enemy.hitRecoilX = 0;
        enemy.hitRecoilZ = 0;
      }
      if (enemy.decoyOwnerId !== null) {
        enemy.decoyLeft -= delta;
        const ownerActive = this.enemies.some(
          (threat) => threat.id === enemy.decoyOwnerId,
        );
        if (enemy.decoyLeft <= 0 || !ownerActive) {
          this.enemies.splice(this.enemies.indexOf(enemy), 1);
        }
        continue;
      }
      if (enemy.bossState) {
        this.updateFlatBossEnemy(enemy, delta);
        continue;
      }
      const playerDistance = this.distance(
        enemy.x,
        enemy.z,
        this.player.x,
        this.player.z,
      );
      const agentTarget = this.agents
        .filter((agent) => agent.hp > 0 && agent.disabledLeft <= 0)
        .sort(
          (left, right) =>
            this.distance(enemy.x, enemy.z, left.x, left.z) -
            this.distance(enemy.x, enemy.z, right.x, right.z),
        )[0];
      const turretTarget = this.defenses
        .filter((defense) => defense.hp > 0)
        .sort(
          (left, right) =>
            this.distance(enemy.x, enemy.z, left.x, left.z) -
            this.distance(enemy.x, enemy.z, right.x, right.z),
        )[0];
      const agentDistance = agentTarget
        ? this.distance(enemy.x, enemy.z, agentTarget.x, agentTarget.z)
        : Infinity;
      const turretDistance = turretTarget
        ? this.distance(enemy.x, enemy.z, turretTarget.x, turretTarget.z)
        : Infinity;
      const repairBayDistance = this.repairBay.hp > 0
        ? this.distance(enemy.x, enemy.z, this.repairBay.x, this.repairBay.z)
        : Infinity;
      const targetKind =
        playerDistance < 4.2
          ? "player"
          : agentDistance < 6.5
            ? "agent"
            : turretDistance < 6.5
              ? "turret"
              : repairBayDistance < 6.5
                ? "repair-bay"
                : "core";
      const targetX = targetKind === "player"
        ? this.player.x
        : targetKind === "agent" && agentTarget
          ? agentTarget.x
          : targetKind === "turret" && turretTarget
            ? turretTarget.x
            : targetKind === "repair-bay"
              ? this.repairBay.x
              : this.core.x;
      const targetZ = targetKind === "player"
        ? this.player.z
        : targetKind === "agent" && agentTarget
          ? agentTarget.z
          : targetKind === "turret" && turretTarget
            ? turretTarget.z
            : targetKind === "repair-bay"
              ? this.repairBay.z
              : this.core.z;
      const distance = this.distance(enemy.x, enemy.z, targetX, targetZ);

      if (
        enemy.type === "rootkit" &&
        enemy.hp / enemy.maxHp < 0.68 &&
        enemy.bossPhase === 1
      ) {
        enemy.bossPhase = 2;
        enemy.speed *= 1.16;
        enemy.attackCooldown *= 0.84;
        const baseAngle = Math.atan2(enemy.z, enemy.x);
        for (let index = 0; index < 4; index += 1) {
          const angle = baseAngle + (index - 1) * 0.6;
          this.createEnemy(
            index % 2 === 0 ? "phisher" : "virus",
            enemy.x + Math.cos(angle) * 2,
            enemy.z + Math.sin(angle) * 2,
          );
        }
        this.addRing(enemy.x, enemy.z, 0xd14b34, 0.4, 4.5, 0.75);
        this.callbacks.onToast({
          eyebrow: "ROOTKIT PHASE II",
          title: "THE SHELL HAS SPLIT",
          detail: "It is faster now. Collapse the spawned processes first.",
        });
      }
      if (
        enemy.type === "rootkit" &&
        enemy.hp / enemy.maxHp < 0.34 &&
        enemy.bossPhase === 2
      ) {
        enemy.bossPhase = 3;
        enemy.speed *= 1.3;
        enemy.attackCooldown *= 0.65;
        const baseAngle = Math.atan2(enemy.z, enemy.x);
        for (let index = 0; index < 6; index += 1) {
          const angle = baseAngle + (index / 6) * Math.PI * 2;
          this.createEnemy(
            index < 2 ? "trojan" : "virus",
            enemy.x + Math.cos(angle) * 2.8,
            enemy.z + Math.sin(angle) * 2.8,
          );
        }
        this.addRing(enemy.x, enemy.z, 0xffe1c8, 0.6, 7, 0.95);
        this.callbacks.onToast({
          eyebrow: "ROOTKIT PHASE III",
          title: "THE CORE IS EXPOSED",
          detail:
            "Final damage race. Use EMP before the remaining processes overwhelm the Core.",
        });
      }

      if (enemy.telegraphLeft > 0) {
        enemy.telegraphLeft -= delta;
        if (enemy.telegraphLeft <= 0) {
          enemy.cooldownLeft = enemy.attackCooldown;
          if (enemy.type === "phisher") {
            if (enemy.resistanceFlags.includes("decoy")) {
              const hasActiveDecoys = this.enemies.some(
                (threat) => threat.decoyOwnerId === enemy.id,
              );
              if (!hasActiveDecoys) {
                for (const offset of getPhisherDecoyOffsets(
                  this.wave,
                  enemy.id,
                )) {
                  this.createEnemy(
                    "phisher",
                    enemy.x + offset.x,
                    enemy.z + offset.z,
                    { decoyOwnerId: enemy.id, reward: 0 },
                  );
                }
              }
            }
            const availableAgents = this.agents.filter(
              (agent) => agent.disabledLeft <= 0,
            );
            if (availableAgents.length > 0 && Math.random() < 0.4) {
              const disabled =
                availableAgents[enemy.id % availableAgents.length];
              disabled.disabledLeft = 3.2;
              this.addRing(disabled.x, disabled.z, 0xb7422e, 0.2, 1.6, 0.48);
              this.callbacks.onToast({
                eyebrow: "PHISHER JAM DETECTED",
                title: `${disabled.name} IS OFFLINE`,
                detail:
                  "The agent will reboot in three seconds. Prioritise the Phisher.",
              });
            }
            let dx = targetX - enemy.x;
            let dz = targetZ - enemy.z;
            const length = Math.hypot(dx, dz) || 1;
            dx /= length;
            dz /= length;
            this.projectiles.push({
              x: enemy.x,
              z: enemy.z,
              vx: dx * 7.2,
              vz: dz * 7.2,
              life: 2.4,
              damage: enemy.damage,
              radius: 0.22,
              color: "#b7422e",
              faction: "null",
              slow: 0,
            });
          } else if (distance <= enemy.range + 0.9) {
            if (enemy.type === "rootkit") {
              const updates = getRootkitRebootUpdates(enemy, this.enemies);
              for (const update of updates) {
                const rebooted = this.enemies.find(
                  (threat) => threat.id === update.id,
                );
                if (!rebooted) continue;
                rebooted.hp = update.hp;
                rebooted.slow = update.slow;
                this.addBeam(
                  enemy.x,
                  enemy.z,
                  rebooted.x,
                  rebooted.z,
                  0xe86b64,
                  0.28,
                );
              }
            }
            if (targetKind === "agent" && agentTarget) {
              this.damageAgent(agentTarget, enemy.damage);
            } else if (targetKind === "turret" && turretTarget) {
              this.damageDefense(turretTarget, enemy.damage);
            } else if (targetKind === "repair-bay") {
              this.damageRepairBay(enemy.damage);
            } else {
              this.damageTarget(targetKind === "player" ? "player" : "core", enemy.damage);
            }
            this.addRing(
              targetX,
              targetZ,
              0xb7422e,
              0.25,
              enemy.type === "rootkit" ? 2.5 : 1.3,
              0.32,
            );
          }
        }
        continue;
      }

      if (distance <= enemy.range && enemy.cooldownLeft <= 0) {
        enemy.telegraphLeft = enemy.telegraphTotal;
        this.addRing(
          enemy.x,
          enemy.z,
          0xb7422e,
          0.25,
          Math.max(1.2, enemy.range),
          enemy.telegraphTotal,
        );
        continue;
      }

      const arrivalDistance = Math.max(0.75, enemy.range * 0.86);
      if (distance > arrivalDistance) {
        const slowFactor = getSlowMovementMultiplier(
          enemy.slow * 1_000,
          enemy.slowMultiplier,
        );
        const routeBias =
          this.terrain.routeBias * (enemy.id % 2 === 0 ? 1 : -1);
        const advance = resolveEnemyAdvance(
          {
            position: { x: enemy.x, z: enemy.z },
            target: { id: targetKind, x: targetX, z: targetZ },
            routeBias,
            arrivalDistance,
            watchdog: enemy.movementWatchdog,
          },
          delta * 1_000,
        );
        enemy.movementWatchdog = advance.watchdog;
        enemy.x +=
          advance.vector.x *
          delta *
          enemy.speed *
          slowFactor;
        enemy.z +=
          advance.vector.z *
          delta *
          enemy.speed *
          slowFactor;
      }
    }
  }

  private updateProjectiles(delta: number) {
    for (const projectile of [...this.projectiles]) {
      projectile.life -= delta;
      projectile.x += projectile.vx * delta;
      projectile.z += projectile.vz * delta;
      if (projectile.life <= 0) {
        this.removeProjectile(projectile);
        continue;
      }
      if (projectile.faction === "null") {
        const hit = findHostileProjectileHit(
          projectile,
          [
            { id: "player", kind: "player", x: this.player.x, z: this.player.z, radius: 0.52, hp: this.player.hp },
            { id: "core", kind: "core", x: this.core.x, z: this.core.z, radius: 1, hp: this.core.hp },
            { id: "repair-bay", kind: "repair-bay", x: this.repairBay.x, z: this.repairBay.z, radius: 0.7, hp: this.repairBay.hp },
            ...this.agents.map((agent) => ({ id: agent.id, kind: "agent", x: agent.x, z: agent.z, radius: 0.52, hp: agent.hp })),
            ...this.defenses.map((defense) => ({ id: String(defense.index), kind: "turret", x: defense.x, z: defense.z, radius: 0.6, hp: defense.hp })),
          ],
        );
        if (hit?.kind === "agent") {
          const agent = this.agents.find((candidate) => candidate.id === hit.id);
          if (agent) this.damageAgent(agent, projectile.damage);
        } else if (hit?.kind === "turret") {
          const defense = this.defenses.find(
            (candidate) => String(candidate.index) === hit.id,
          );
          if (defense) this.damageDefense(defense, projectile.damage);
        } else if (hit?.kind === "repair-bay") {
          this.damageRepairBay(projectile.damage);
        } else if (hit?.kind === "player" || hit?.kind === "core") {
          this.damageTarget(hit.kind, projectile.damage);
        }
        if (hit) {
          this.addBurst(projectile.x, projectile.z, 0xb7422e, 7);
          this.removeProjectile(projectile);
        }
        continue;
      }
      for (const enemy of [...this.enemies]) {
        if (
          this.distance(projectile.x, projectile.z, enemy.x, enemy.z) >
          projectile.radius + enemy.radius
        ) {
          continue;
        }
        if (projectile.slow > 0) {
          enemy.slow = Math.max(enemy.slow, projectile.slow);
          enemy.slowMultiplier = Math.min(enemy.slowMultiplier, 0.48);
        }
        this.damageEnemy(enemy, projectile.damage);
        this.removeProjectile(projectile);
        break;
      }
    }
  }

  private updateEffects(delta: number) {
    this.combatComboLife = Math.max(0, this.combatComboLife - delta);
    if (this.combatComboLife === 0) this.combatCombo = 0;
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= delta;
      if (effect.kind === "burst") {
        for (const particle of effect.particles) {
          particle.x += particle.vx * delta;
          particle.z += particle.vz * delta;
          particle.y += particle.vy * delta;
          particle.vy -= 2.4 * delta;
        }
      }
      if (effect.life <= 0) {
        this.effects.splice(index, 1);
        this.releaseFlatEffect(effect);
      }
    }
  }

  private updateCamera(delta: number) {
    const focus = this.getCameraFocusPosition();
    let targetX = this.core.x * 0.35 + this.player.x * 0.65;
    let targetZ = this.core.z * 0.35 + this.player.z * 0.65;
    if (focus) {
      targetX = focus.x;
      targetZ = focus.z;
      if (this.cinemaState.cleanView) {
        this.cinemaTarget = { x: focus.x, z: focus.z };
        this.hasCinemaTarget = true;
      }
    } else if (this.cinemaHoldClock > 0 && this.hasCinemaTarget) {
      targetX = this.cinemaTarget.x;
      targetZ = this.cinemaTarget.z;
    }
    const ease = 1 - Math.exp(-delta * 4.2);
    this.cameraX += (targetX - this.cameraX) * ease;
    this.cameraZ += (targetZ - this.cameraZ) * ease;
    if (
      this.cinemaState.cleanView &&
      this.mode === "playing" &&
      !this.watchState.paused &&
      !this.cinemaState.paused &&
      !this.reducedMotion
    ) {
      this.yaw += delta * 0.045;
    }
    this.shake = Math.max(0, this.shake - delta * 1.8);
    this.cinemaHoldClock = Math.max(0, this.cinemaHoldClock - delta);
  }

  private getCameraFocusPosition() {
    const focusId = this.cameraFocusId;
    if (focusId === "core") return { x: this.core.x, z: this.core.z };
    if (focusId === "repair-bay") return { x: this.repairBay.x, z: this.repairBay.z };
    if (focusId === "compute-node") return { x: 3.1, z: 1.15 };
    if (focusId === "north-breach") return { x: 0, z: -4 };
    if (focusId === "south-breach") return { x: 0, z: 4 };
    if (focusId === "boss-portal") return { x: 0, z: -6.45 };

    if (focusId) {
      const [kind, ...keyParts] = focusId.split("-");
      const key = keyParts.join("-");
      if (kind === "agent") {
        const agent = this.agents.find((candidate) => candidate.id === key);
        if (agent) return { x: agent.x, z: agent.z };
      }
      if (kind === "threat") {
        const enemy = this.enemies.find((candidate) => String(candidate.id) === key);
        if (enemy) return { x: enemy.x, z: enemy.z };
      }
      if (kind === "loot") {
        const pickup = this.pickups.find((candidate) => candidate.id === key);
        if (pickup) return { x: pickup.x, z: pickup.y };
      }
      if (kind === "sentry") {
        const defenseKey = key.startsWith("sentry-") ? key.slice("sentry-".length) : key;
        const defense = this.defenses.find((candidate) => String(candidate.index) === defenseKey);
        if (defense) return { x: defense.x, z: defense.z };
      }
      if (focusId.startsWith("sub-agent-")) {
        const subAgentKey = focusId.slice("sub-agent-".length);
        const subAgent =
          this.temporarySubAgents.find((candidate) => candidate.id === subAgentKey) ??
          this.temporarySubAgents[Number(subAgentKey)];
        if (subAgent) return { x: subAgent.x, z: subAgent.z };
      }
      if (kind === "boss") {
        const boss = this.enemies.find((candidate) => candidate.bossState);
        if (boss) return { x: boss.x, z: boss.z };
      }
    }

    if (this.cinemaState.cleanView) {
      const priorityBoss = this.enemies.find((enemy) => enemy.bossState);
      if (priorityBoss) return { x: priorityBoss.x, z: priorityBoss.z };
      const breachEnemy = this.enemies.find(
        (enemy) => this.distance(enemy.x, enemy.z, this.core.x, this.core.z) <= 4.5,
      );
      if (breachEnemy) return { x: breachEnemy.x, z: breachEnemy.z };
      const pickup = this.pickups[this.pickups.length - 1];
      if (pickup) return { x: pickup.x, z: pickup.y };
      return { x: this.core.x, z: this.core.z };
    }
    return null;
  }

  private spawnWave(wave: number) {
    this.encounterModifiers = getWaveModifiers(wave);
    this.terrain = getTerrainModifier(wave);
    this.battleground = getBattlegroundForWave(wave);
    this.waveActive = true;
    this.waveEndClock = 0;
    if (wave === 1) {
      this.reinforcementsRemaining = 1;
      this.scheduledReinforcementThreats = FIRST_WAVE.reinforcement.length;
      this.reinforcementClock = FIRST_WAVE.reinforcementDelay;
      this.spawnFormation(FIRST_WAVE.initial as EnemyType[]);
    } else {
      this.reinforcementsRemaining = Math.min(4, 1 + Math.floor(wave / 2));
      this.scheduledReinforcementThreats =
        this.reinforcementsRemaining * Math.min(10, 4 + wave);
      this.reinforcementClock = Math.max(4.5, 7.2 - wave * 0.25);
      const boss = getBossEncounter(wave, `mission-wave-${wave}`, getWarbandStrength(this.agents));
      if (boss.scheduled) {
        const angle = wave * 0.71 + this.terrain.spawnAngleOffset;
        this.createEnemy(
          "rootkit",
          Math.cos(angle) * SPAWN_RADIUS,
          Math.sin(angle) * SPAWN_RADIUS,
          { bossState: boss },
        );
      }
      this.spawnFormation(
        (ENCOUNTERS[wave - 1] ?? ENCOUNTERS[ENCOUNTERS.length - 1])
          .filter((type) => type !== "rootkit"),
      );
    }
    if (wave === 4 || wave === 7) {
      this.callbacks.onToast({
        eyebrow: `ELITE BREACH · WAVE ${wave}`,
        title: "ARMOURED TROJANS INBOUND",
        detail: "Their armour reduces damage until the shell is broken.",
      });
    }
    if (wave === TOTAL_WAVES) {
      const portalZone = getArenaZone({ x: 0, z: -6.45 });
      this.callbacks.onToast({
        eyebrow: `${portalZone.label} ACTIVE`,
        title: "ROOTKIT PRIME HAS ENTERED",
        detail: "Break its armor, evade telegraphed strikes, and protect the Core.",
      });
    }
    this.emitHud(true);
  }

  private spawnFormation(types: EnemyType[]) {
    const capacity = Math.max(
      0,
      this.activeEnemyLimit - this.enemies.length,
    );
    const immediate = types.slice(0, capacity);
    this.spawnQueue.push(...types.slice(immediate.length));
    this.spawnFormationImmediate(immediate);
  }

  private spawnFormationImmediate(types: EnemyType[]) {
    types.forEach((type, index) => {
      const angle =
        (index / types.length) * Math.PI * 2 +
        this.wave * 0.38 +
        (index % 2) * 0.12 +
        this.terrain.spawnAngleOffset;
      const radius =
        type === "rootkit" ? SPAWN_RADIUS : SPAWN_RADIUS + (index % 4) * 1.1;
      this.createEnemy(
        type,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    });
  }

  private releaseQueuedEnemies() {
    const result = releaseSpawnBatch(
      this.spawnQueue,
      this.activeEnemyLimit - this.enemies.length,
      this.elapsed,
      this.nextQueueReleaseAt,
    );
    this.spawnQueue = result.queue;
    this.nextQueueReleaseAt = result.nextReleaseAt;
    if (result.released.length > 0) {
      this.spawnFormationImmediate(result.released as EnemyType[]);
    }
  }

  private createEnemy(
    type: EnemyType,
    x: number,
    z: number,
    options: {
      tutorial?: boolean;
      speed?: number;
      damage?: number;
      reward?: number;
      decoyOwnerId?: number;
      bossState?: BossState;
    } = {},
  ) {
    const definitions: Record<
      EnemyType,
      Omit<
        FlatEnemy,
        | "id"
        | "type"
        | "x"
        | "z"
        | "maxHp"
        | "cooldownLeft"
        | "telegraphLeft"
        | "slow"
        | "slowMultiplier"
        | "bossPhase"
        | "hitFlash"
        | "hitRecoilX"
        | "hitRecoilZ"
        | "tutorial"
        | "resistanceFlags"
        | "decoyOwnerId"
        | "decoyLeft"
        | "markedLeft"
        | "markMultiplier"
        | "armorBrokenLeft"
        | "armorBreakReduction"
        | "bossState"
        | "movementWatchdog"
      >
    > = {
      virus: {
        hp: 24,
        speed: 2.35,
        damage: 7,
        range: 1.05,
        attackCooldown: 1.45,
        telegraphTotal: 0.6,
        reward: 8,
        radius: 0.46,
      },
      phisher: {
        hp: 52,
        speed: 1.5,
        damage: 10,
        range: 6,
        attackCooldown: 2.1,
        telegraphTotal: 0.82,
        reward: 15,
        radius: 0.55,
      },
      trojan: {
        hp: 100,
        speed: 1.05,
        damage: 18,
        range: 1.45,
        attackCooldown: 2.4,
        telegraphTotal: 0.72,
        reward: 24,
        radius: 0.82,
      },
      rootkit: {
        hp: 520,
        speed: 0.75,
        damage: 26,
        range: 2.1,
        attackCooldown: 2.6,
        telegraphTotal: 1.05,
        reward: 125,
        radius: 1.42,
      },
    };
    const definition = definitions[type];
    const bossState = options.bossState
      ? { ...options.bossState, rewards: { ...options.bossState.rewards } }
      : null;
    const resistanceFlags: ResistanceFlag[] =
      options.tutorial || options.decoyOwnerId
      ? []
      : [...this.encounterModifiers.flagsByType[type]] as ResistanceFlag[];
    if (bossState && !resistanceFlags.includes("armor")) {
      resistanceFlags.push("armor");
    }
    const healthScale =
      1 + (this.wave - 1) * (type === "rootkit" ? 0.12 : 0.09);
    const damageScale = 1 + (this.wave - 1) * 0.055;
    const speedScale = 1 + Math.min(0.28, (this.wave - 1) * 0.035);
    const attackRateScale = Math.max(0.72, 1 - (this.wave - 1) * 0.035);
    const scaledHp = bossState
      ? bossState.maxHp
      : options.decoyOwnerId
        ? 1
        : Math.round(definition.hp * healthScale);
    const enemy: FlatEnemy = {
      id: ++this.enemySequence,
      type,
      x,
      z,
      ...definition,
      hp: scaledHp,
      maxHp: scaledHp,
      speed: options.decoyOwnerId
        ? 0
        : options.speed ?? bossState?.movementSpeed ?? definition.speed * speedScale,
      damage:
        options.damage ??
        bossState?.attackDamage ??
        Math.round(
          definition.damage *
            damageScale *
            (this.wave === 1 ? FIRST_WAVE.damageMultiplier : 1),
        ),
      reward: options.reward ?? bossState?.rewards.compute ?? definition.reward,
      range: bossState?.attackRadius ?? definition.range,
      attackCooldown:
        bossState
          ? bossState.attackIntervalMs / 1_000
          : definition.attackCooldown * attackRateScale,
      cooldownLeft: bossState
        ? bossState.attackCooldownLeftMs / 1_000
        : options.decoyOwnerId
          ? 0
          : 0.4 + Math.random() * 0.8,
      telegraphLeft: 0,
      telegraphTotal: bossState
        ? bossState.telegraphMs / 1_000
        : definition.telegraphTotal,
      slow: 0,
      slowMultiplier: 0.48,
      bossPhase: bossState ? 0 : type === "rootkit" ? 1 : 0,
      hitFlash: 0,
      hitRecoilX: 0,
      hitRecoilZ: 0,
      tutorial: options.tutorial ?? false,
      resistanceFlags,
      decoyOwnerId: options.decoyOwnerId ?? null,
      decoyLeft: options.decoyOwnerId ? 4.2 : 0,
      markedLeft: 0,
      markMultiplier: 1,
      armorBrokenLeft: 0,
      armorBreakReduction: 0,
      bossState,
      movementWatchdog: createMovementWatchdogState() as EnemyMovementWatchdog,
    };
    this.enemies.push(enemy);
    this.addRing(
      x,
      z,
      type === "rootkit" ? 0xd14b34 : 0xa73d2d,
      0.2,
      type === "rootkit" ? 2.8 : 1.15,
      0.55,
    );
  }

  private spawnTutorialTraining() {
    this.clearTutorialThreats();
    this.scheduledReinforcementThreats = 0;
    this.reinforcementsRemaining = 0;
    this.createEnemy("virus", -2.2, -1.8, {
      tutorial: true,
      speed: 0.65,
      damage: 2,
    });
    this.createEnemy("virus", 0, -2.6, {
      tutorial: true,
      speed: 0.65,
      damage: 2,
    });
    this.createEnemy("virus", 2.2, -1.8, {
      tutorial: true,
      speed: 0.65,
      damage: 2,
    });
  }

  private spawnTutorialBreach() {
    this.clearTutorialThreats();
    this.scheduledReinforcementThreats = 0;
    this.reinforcementsRemaining = 0;
    for (const threat of OBSERVE_BREACH) {
      this.createEnemy(threat.type as EnemyType, threat.x, threat.z, {
        tutorial: true,
        speed: threat.speed,
        damage: threat.damage,
        reward: threat.reward,
      });
    }
  }

  private clearTutorialThreats() {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      if (this.enemies[index].tutorial) this.enemies.splice(index, 1);
    }
  }

  private captureFirstWaveCheckpoint() {
    this.firstWaveCheckpoint = {
      data: this.data,
      score: this.score,
      agents: this.agents.map((agent) => agent.id),
      defenses: this.defenses.map((defense) => ({
        x: defense.x,
        z: defense.z,
      })),
      command: this.squadCommand,
      empState: { ...this.empState },
      loot: { ...this.loot },
      repairBayHp: this.repairBay.hp,
    };
  }

  retryWave() {
    if (!canRetryFirstWave({
      wave: this.wave,
      tutorialResolved:
        this.tutorialStep === "complete" || this.tutorialStep === "skipped",
      checkpoint: this.firstWaveCheckpoint !== null,
    })) return;
    const checkpoint = this.firstWaveCheckpoint!;
    this.resetInput();
    this.clearTemporarySubAgents();
    this.clearDynamic();
    this.data = checkpoint.data;
    this.score = checkpoint.score;
    this.squadCommand = checkpoint.command;
    this.empState = { ...checkpoint.empState };
    this.loot = { ...checkpoint.loot };
    this.repairBay.hp = checkpoint.repairBayHp;
    this.player.hp = this.player.maxHp;
    this.core.hp = this.core.maxHp;
    for (const id of checkpoint.agents) this.restoreAgent(id);
    for (const position of checkpoint.defenses) this.restoreDefense(position);
    this.wave = 1;
    this.mode = "playing";
    this.callbacks.onMode("playing");
    this.spawnWave(1);
    if (isWatchMode(this.sessionMode)) {
      for (let index = 0; index < WATCH_STARTER_SENTRY_COUNT; index += 1) {
        this.buildDefense({ free: true });
      }
    }
    this.emitHud(true);
  }

  private clearDynamic() {
    this.clearTemporarySubAgents();
    this.enemies.length = 0;
    this.agents.length = 0;
    this.defenses.length = 0;
    this.projectiles.length = 0;
    this.clearEffects();
    this.clearLootPickups();
    this.spawnQueue = [];
    this.nextQueueReleaseAt = 0;
    this.scheduledReinforcementThreats = 0;
    this.waveActive = false;
    this.waveEndClock = 0;
    this.placementActive = false;
  }

  private completeWave() {
    this.resetInput();
    this.clearTemporarySubAgents();
    this.placementActive = false;
    this.loot = creditPendingMaterialLoot(
      this.loot,
      this.pickups,
    ) as LootCounters;
    this.clearLootPickups();
    if (this.wave >= TOTAL_WAVES && !isWatchMode(this.sessionMode)) {
      this.mode = "victory";
      this.score += Math.round(this.core.hp * 5 + this.player.hp * 3);
      this.best = Math.max(this.best, this.score);
      writeStoredValue("freeman-protocol-best", String(this.best));
      this.callbacks.onMode("victory");
      this.audio.play("victory");
      this.callbacks.onToast({
        eyebrow: "MISSION COMPLETE",
        title: "THE NETWORK IS SAFE",
        detail:
          "You survived all eight encounters and contained Rootkit Prime.",
      });
      this.emitHud(true);
      return;
    }
    if (isWatchMode(this.sessionMode)) {
      this.loot.components += WATCH_COMPONENT_SALVAGE_PER_WAVE;
      this.recordWatchEvent(`NETWORK SALVAGE +${WATCH_COMPONENT_SALVAGE_PER_WAVE} COMPONENTS`);
      const reward = {
        compute: this.wave === 4 || this.wave === 7 ? 42 : 24,
        components: this.loot.components,
        shards: this.loot.shards,
      };
      this.watchState = creditWatchWaveReward(this.watchState, reward);
      persistWatchRewards(reward);
      this.core.hp = Math.min(
        this.core.maxHp,
        this.core.hp + WATCH_INTERMISSION_CORE_REPAIR,
      );
    }
    this.data += this.wave === 4 || this.wave === 7 ? 42 : 24;
    this.intermissionClock = WAVE_INTERMISSION_MS;
    this.callbacks.onMode("playing");
    const autonomousUpgrade = getUpgradeChoices(this.wave, this.upgradeStacks)[0];
    if (autonomousUpgrade) {
      this.applyUpgrade(autonomousUpgrade.id);
    }
    this.callbacks.onToast({
      eyebrow: `WAVE ${this.wave} CLEARED`,
      title: "NETWORK RECONFIGURING",
      detail: "Build defenses and deploy reserves. The next wave begins in 3 seconds.",
    });
    this.audio.play("wave");
    this.emitHud(true);
  }

  private triggerWatchRecovery() {
    if (!isWatchMode(this.sessionMode) || this.watchRecoveryClock > 0) return false;
    this.watchRecoveryClock = 12;
    this.core.hp = Math.max(32, Math.round(this.core.maxHp * 0.32));
    this.loot.components += 4;
    this.loot.shards += 1;
    for (const enemy of this.enemies) {
      enemy.slow = Math.max(enemy.slow, 4);
      enemy.hp = Math.min(enemy.hp, Math.max(1, enemy.maxHp * 0.55));
    }
    this.recordWatchEvent("WATCH RECOVERY PULSE");
    this.callbacks.onToast({
      eyebrow: "EMERGENCY NETWORK RECOVERY",
      title: "WATCH RECOVERY PULSE",
      detail: "The AI network slowed the breach, rebuilt the Core, and salvaged 4 Components.",
    });
    this.emitHud(true);
    return true;
  }

  private damageTarget(target: "player" | "core", damage: number) {
    if (isWatchMode(this.sessionMode) && target === "player") return;
    if (isWatchMode(this.sessionMode)) {
      damage *= WATCH_INCOMING_DAMAGE_MULTIPLIER;
    }
    const floor = isTutorialProtected(this.tutorialStep) ? 1 : 0;
    if (target === "player") {
      if (this.player.invulnerable > 0) return;
      this.player.hp = Math.max(floor, this.player.hp - damage);
      this.player.invulnerable = 0.28;
      this.addBurst(this.player.x, this.player.z, 0xb7422e, 8);
    } else {
      this.core.hp = Math.max(floor, this.core.hp - damage);
      if (isWatchMode(this.sessionMode) && this.core.hp <= 0) {
        if (!this.triggerWatchRecovery()) this.core.hp = 8;
      }
      const feedback = classifyCombatFeedback({
        kind: "core-warning",
        damage,
        critical: false,
        target: "core",
      });
      this.addDamageNumber(
        this.core.x,
        this.core.z,
        feedback.label,
        feedback.emphasis,
      );
      this.addBurst(this.core.x, this.core.z, 0xb7422e, 8);
    }
    this.shake = Math.max(this.shake, this.reducedMotion ? 0.03 : 0.2);
    this.audio.play("damage");
    this.emitHud(true);
    if (!isWatchMode(this.sessionMode) && (this.player.hp <= 0 || this.core.hp <= 0)) this.defeat();
  }

  private damageAgent(agent: FlatAgent, damage: number) {
    const absorbed = Math.min(agent.barrier, Math.max(0, damage));
    agent.barrier -= absorbed;
    const damaged = applyUnitDamage(
      { hp: agent.hp, maxHp: agent.maxHp, disabledLeftMs: agent.disabledLeft * 1_000 },
      resolveAgentDamage(Math.max(0, damage - absorbed), agent.armorProfile),
    );
    agent.hp = damaged.hp;
    agent.disabledLeft = damaged.disabledLeftMs / 1_000;
    this.addBurst(agent.x, agent.z, 0xb7422e, 6);
  }

  private damageDefense(defense: FlatDefense, damage: number) {
    const absorbed = Math.min(defense.barrier, Math.max(0, damage));
    defense.barrier -= absorbed;
    defense.hp = applyUnitDamage(
      defense,
      Math.max(0, damage - absorbed),
    ).hp;
    this.addBurst(defense.x, defense.z, 0xb7422e, 6);
  }

  private damageRepairBay(damage: number) {
    this.repairBay.hp = applyUnitDamage(this.repairBay, damage).hp;
    this.addBurst(this.repairBay.x, this.repairBay.z, 0xb7422e, 6);
    if (this.repairBay.hp === 0) {
      this.callbacks.onToast({
        eyebrow: "REPAIR BAY DESTROYED",
        title: "FIELD KITS OR WITHDRAWAL ONLY",
        detail: "Agents cannot recover at the bay for the rest of this mission.",
      });
    }
  }

  private defeat() {
    if (this.mode === "defeat") return;
    this.resetInput();
    this.clearTemporarySubAgents();
    this.mode = "defeat";
    this.waveActive = false;
    this.clearLootPickups();
    this.callbacks.onMode("defeat");
    this.audio.play("defeat");
    this.callbacks.onToast({
      eyebrow: "MISSION FAILED",
      title: this.core.hp <= 0 ? "THE CORE WAS DESTROYED" : "YOU WERE DEFEATED",
      detail:
        "Try again, recruit agents earlier, and keep enemies away from the Core.",
    });
    this.emitHud(true);
  }

  private damageEnemy(
    enemy: FlatEnemy,
    damage: number,
    bypassArmor = false,
  ) {
    if (!this.enemies.includes(enemy)) return;
    const markedDamage =
      enemy.markedLeft > 0 ? damage * enemy.markMultiplier : damage;
    const armoured =
      !bypassArmor &&
      enemy.resistanceFlags.includes("armor") &&
      (enemy.bossState !== null || enemy.hp > enemy.maxHp * 0.45);
    const armorMultiplier = enemy.bossState
      ? getBossArmorMultiplier(enemy.bossState)
      : 0.42;
    const appliedDamage = resolveArmoredDamage(markedDamage, {
      armored: armoured,
      armorMultiplier,
      armorBreakReduction: enemy.armorBrokenLeft > 0
        ? enemy.armorBreakReduction
        : 0,
    });
    enemy.hp -= appliedDamage;
    if (enemy.bossState) enemy.bossState.hp = enemy.hp;
    enemy.hitFlash = 0.11;
    const critical =
      enemy.markedLeft > 0 ||
      appliedDamage >= Math.max(18, enemy.maxHp * 0.24);
    const kind = enemy.hp <= 0 ? "kill" : critical ? "critical" : "hit";
    const feedback = classifyCombatFeedback({
      kind,
      damage: appliedDamage,
      critical,
      target: "enemy",
    });
    this.addDamageNumber(
      enemy.x,
      enemy.z,
      armoured ? `ARMOR ${feedback.label}` : feedback.label,
      feedback.emphasis,
    );
    this.registerCombatCombo(enemy.x, enemy.z);
    const recoilX = enemy.x - this.player.x;
    const recoilZ = enemy.z - this.player.z;
    const recoilDistance = Math.hypot(recoilX, recoilZ) || 1;
    const recoil = enemy.type === "rootkit"
      ? 0
      : this.reducedMotion
        ? 0.025
        : armoured
          ? 0.05
          : 0.13;
    enemy.hitRecoilX = (recoilX / recoilDistance) * recoil;
    enemy.hitRecoilZ = (recoilZ / recoilDistance) * recoil;
    this.addBurst(
      enemy.x,
      enemy.z,
      feedback.kind === "critical" ? 0xffd166 : 0xe77d44,
      feedback.kind === "kill" ? 14 : feedback.kind === "critical" ? 9 : 6,
    );
    this.audio.play("hit");
    if (enemy.hp > 0) return;
    if (enemy.bossState) {
      const reward = tickBoss(
        { ...enemy.bossState, hp: 0 },
        0,
        { targets: [] },
      );
      const rewardState = reward.boss as BossState;
      enemy.bossState = rewardState;
      this.callbacks.onToast({
        eyebrow: "WARBOSS CONTAINED",
        title: "RARE PROTOCOL SHARDS DROPPED",
        detail: `${rewardState.rewards.components} Components · ${rewardState.rewards.shards} Shards are recoverable in the arena. ${BOSS_REWARD_RATIONALE}`,
      });
    }
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    if (enemy.decoyOwnerId !== null) {
      this.addBurst(enemy.x, enemy.z, 0xc6a6e8, 5);
      return;
    }
    for (const decoy of this.enemies.filter(
      (threat) => threat.decoyOwnerId === enemy.id,
    )) {
      this.enemies.splice(this.enemies.indexOf(decoy), 1);
    }
    this.data += enemy.reward;
    this.score += Math.round(enemy.maxHp * 10 + this.wave * 90);
    const drops = enemy.bossState
      ? [
          {
            id: `boss-component-${enemy.id}`,
            type: "component" as LootType,
            x: -0.65,
            y: 0,
            value: enemy.bossState.rewards.components,
          },
          {
            id: `boss-shard-${enemy.id}`,
            type: "upgrade-shard" as LootType,
            x: 0.65,
            y: 0,
            value: enemy.bossState.rewards.shards,
          },
        ]
      : [rollLootDrop(enemy.type, Math.random)].filter(
          (drop): drop is NonNullable<typeof drop> => Boolean(drop),
        );
    for (const drop of drops) {
      this.pickups.push({
        ...drop,
        x: enemy.x + drop.x * 0.35,
        y: enemy.z + drop.y * 0.35,
        radius: TOUCH_SAFE_PICKUP_RADIUS,
      });
    }
    this.addRing(enemy.x, enemy.z, 0xd9793f, 0.2, enemy.radius * 2.4, 0.42);
    this.addBurst(
      enemy.x,
      enemy.z,
      0xd9793f,
      enemy.type === "rootkit" ? 22 : 11,
    );
    this.audio.play("kill");
    if (enemy.tutorial && this.tutorialStep === "shoot") {
      this.tutorialKills += 1;
      if (this.tutorialKills === 3) this.emitTutorialEvent("training-cleared");
    }
    if (
      enemy.tutorial &&
      this.tutorialStep === "observe" &&
      !this.enemies.some((threat) => threat.tutorial)
    ) {
      this.emitTutorialEvent("breach-cleared");
    }
    this.emitHud(true);
  }

  private removeProjectile(projectile: FlatProjectile) {
    const index = this.projectiles.indexOf(projectile);
    if (index >= 0) this.projectiles.splice(index, 1);
  }

  private updateLootPickups() {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      if (!canCollectLoot({ x: this.player.x, y: this.player.z }, pickup)) continue;
      const next = applyLootPickup({
        health: this.player.hp,
        maxHealth: this.player.maxHp,
        repairKits: this.loot.repairs,
        components: this.loot.components,
        upgradeShards: this.loot.shards,
      }, pickup);
      this.player.hp = next.health;
      this.loot.repairs = next.repairKits ?? 0;
      this.loot.components = next.components ?? 0;
      this.loot.shards = next.upgradeShards ?? 0;
      const presentation = getLootPresentation(pickup.type, pickup.value);
      this.callbacks.onToast({ eyebrow: "LOOT COLLECTED", title: presentation.toastText, detail: "Recovered from a destroyed threat." });
      this.pickups.splice(index, 1);
      this.emitHud(true);
    }
  }

  private clearLootPickups() {
    this.pickups.length = 0;
  }

  private pushEffect(effect: FlatEffect) {
    while (this.effects.length >= MAX_COMBAT_EFFECTS) {
      const expired = this.effects.shift();
      if (expired) this.releaseFlatEffect(expired);
    }
    this.effects.push(effect);
  }

  private releaseFlatEffect(effect: FlatEffect) {
    if (effect.kind !== "burst") return;
    this.burstEffectPool.release(
      effect,
      (pooledEffect) => {
        pooledEffect.life = 0;
        pooledEffect.maxLife = 0;
      },
      (pooledEffect) => {
        pooledEffect.particles.length = 0;
      },
    );
  }

  private clearEffects() {
    while (this.effects.length > 0) {
      const effect = this.effects.pop();
      if (effect) this.releaseFlatEffect(effect);
    }
  }

  private registerCombatCombo(x: number, z: number) {
    if (this.combatComboLife <= 0) this.combatCombo = 0;
    this.combatCombo = Math.min(MAX_COMBAT_COMBO, this.combatCombo + 1);
    this.combatComboLife = COMBAT_COMBO_WINDOW_SECONDS;
    if (this.combatCombo < 2) return;
    this.addDamageNumber(x, z, `×${this.combatCombo} COMBO`, "strong");
  }

  private addRing(
    x: number,
    z: number,
    color: number,
    radiusStart: number,
    radiusEnd: number,
    duration: number,
  ) {
    this.pushEffect({
      kind: "ring",
      x,
      z,
      x2: x,
      z2: z,
      life: duration,
      maxLife: duration,
      color: toCssColor(color),
      radiusStart,
      radiusEnd,
      particles: [],
    });
  }

  private addBeam(
    x: number,
    z: number,
    x2: number,
    z2: number,
    color: number,
    duration: number,
  ) {
    this.pushEffect({
      kind: "beam",
      x,
      z,
      x2,
      z2,
      life: duration,
      maxLife: duration,
      color: toCssColor(color),
      radiusStart: 0,
      radiusEnd: 0,
      particles: [],
    });
  }

  private addBurst(x: number, z: number, color: number, count: number) {
    if (this.reducedMotion) count = Math.min(count, 5);
    const effect = this.burstEffectPool.acquire(() => ({
      kind: "burst",
      x: 0,
      z: 0,
      x2: 0,
      z2: 0,
      life: 0,
      maxLife: 0,
      color: "#ffffff",
      radiusStart: 0,
      radiusEnd: 0,
      particles: [],
    }));
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.3;
      const speed = 0.8 + (index % 4) * 0.35;
      const particle = effect.particles[index] ?? {
        x: 0,
        z: 0,
        y: 0,
        vx: 0,
        vz: 0,
        vy: 0,
      };
      particle.x = x;
      particle.z = z;
      particle.y = 0.5;
      particle.vx = Math.cos(angle) * speed;
      particle.vz = Math.sin(angle) * speed;
      particle.vy = 0.6 + (index % 5) * 0.17;
      effect.particles[index] = particle;
    }
    effect.particles.length = count;
    effect.kind = "burst";
    effect.x = x;
    effect.z = z;
    effect.x2 = x;
    effect.z2 = z;
    effect.life = 0.55;
    effect.maxLife = 0.55;
    effect.color = toCssColor(color);
    effect.radiusStart = 0;
    effect.radiusEnd = 0;
    delete effect.label;
    delete effect.emphasis;
    this.pushEffect(effect);
  }

  private addSlashArc(
    x: number,
    z: number,
    dx: number,
    dz: number,
    color: number,
  ) {
    const duration = this.reducedMotion ? 0.16 : 0.28;
    this.pushEffect({
      kind: "slash",
      x,
      z,
      x2: dx,
      z2: dz,
      life: duration,
      maxLife: duration,
      color: toCssColor(color),
      radiusStart: 0.45,
      radiusEnd: 2.1,
      particles: [],
    });
  }

  private addDamageNumber(
    x: number,
    z: number,
    label: string,
    emphasis: CombatFeedbackEmphasis,
  ) {
    this.pushEffect({
      kind: "text",
      x,
      z,
      x2: x,
      z2: z,
      life: 0.72,
      maxLife: 0.72,
      color: toCssColor(combatFeedbackColor(emphasis)),
      radiusStart: 0,
      radiusEnd: 0,
      particles: [],
      label,
      emphasis,
    });
  }

  private isFlatDefensePositionValid(x: number, z: number) {
    const distanceFromCore = this.distance(x, z, this.core.x, this.core.z);
    if (distanceFromCore < 2.35 || distanceFromCore > 7.2) return false;
    return this.defenses.every(
      (defense) => this.distance(x, z, defense.x, defense.z) >= 1.8,
    );
  }

  private confirmFlatDefensePlacement() {
    if (!this.placementActive) return;
    if (!this.isFlatDefensePositionValid(this.aim.x, this.aim.z)) {
      this.callbacks.onToast({
        eyebrow: "INVALID POSITION",
        title: "PLACE IT INSIDE THE DEFENSE ZONE",
        detail: "Keep the sentry away from the Core and other sentries.",
      });
      return;
    }
    this.placeDefenseAt({ x: this.aim.x, z: this.aim.z });
  }

  deployReserve() {
    if (this.mode !== "playing") return;
    const parent = this.agents[0];
    if (!parent) {
      this.callbacks.onToast({
        eyebrow: "RESERVE UNAVAILABLE",
        title: "RECRUIT AN AGENT FIRST",
        detail: "Your first AI agent leads temporary reserve units into battle.",
      });
      return;
    }
    let deployed = 0;
    for (let index = 0; index < PLAYER_RESERVE_BATCH_SIZE; index += 1) {
      const materials = { components: this.loot.components, shards: this.loot.shards };
      const spawned = spawnTemporarySubAgent(
        { id: parent.id, role: AUTONOMY_ROLES[parent.id] },
        {
          enemyDensity: Math.max(6, this.enemies.length),
          playerHealthRatio: this.player.hp / this.player.maxHp,
          coreHealthRatio: this.core.hp / this.core.maxHp,
          wavePressure: 1,
          subAgents: this.temporarySubAgents,
          maxSubAgents: MAX_TEMPORARY_SUB_AGENTS_PER_PARENT,
          materials,
          upgrades: { componentUpgradeRanks: this.componentUpgradeRanks },
        },
      );
      if (!spawned) break;
      this.loot.components = materials.components;
      this.loot.shards = materials.shards;
      this.temporarySubAgents.push({
        ...spawned,
        canSpawn: false as const,
        x: parent.x,
        z: parent.z,
        color: parent.color,
        maxLifetimeMs: spawned.remainingMs,
        cooldownLeftMs: 350,
        healthRatio: 1,
        lifetimeRatio: 1,
      });
      deployed += 1;
    }
    this.callbacks.onToast({
      eyebrow: deployed > 0 ? "RESERVE ARMY DEPLOYED" : "RESERVE UNAVAILABLE",
      title: deployed > 0 ? `${deployed} TEMPORARY UNITS ONLINE` : "GATHER MORE COMPONENTS AND SHARDS",
      detail: deployed > 0 ? "Your reserve force will swarm nearby threats for a limited time." : "Agents can collect materials for the next reserve deployment.",
    });
    if (deployed > 0) this.emitHud(true);
  }

  private placeDefenseAt(
    position: { x: number; z: number },
    charge = true,
    notify = true,
  ) {
    return {
      ok: this.addDefense(position, { charge, notify }),
    };
  }

  private addDefense(
    position: { x: number; z: number },
    options: { charge: boolean; notify: boolean },
  ): boolean {
    if (!this.isFlatDefensePositionValid(position.x, position.z)) {
      return false;
    }
    if (this.defenses.length >= 3) return false;
    const cost = 80 + this.defenses.length * 35;
    if (options.charge && this.data < cost) {
      this.placementActive = false;
      this.emitHud(true);
      return false;
    }
    const index = this.defenses.length;
    if (options.charge) this.data -= cost;
    this.placementActive = false;
    this.defenses.push({
      x: position.x,
      z: position.z,
      hp: 100,
      maxHp: 100,
      cooldownLeft: 0.35,
      index,
      rotation: 0,
      barrier: 0,
      barrierLeft: 0,
    });
    if (options.notify) {
      this.addRing(position.x, position.z, 0x9ed8dd, 0.2, 2.4, 0.7);
      this.addBurst(position.x, position.z, 0x9ed8dd, 15);
      this.audio.play("recruit");
      this.callbacks.onToast({
        eyebrow: `BASE SENTRY ${index + 1} BUILT`,
        title: "AUTOMATED DEFENSE ONLINE",
        detail: "This sentry protects its chosen area and fires automatically.",
      });
      this.emitHud(true);
    }
    return true;
  }

  private restoreDefense(position: { x: number; z: number }) {
    this.addDefense(position, { charge: false, notify: false });
  }

  private getFlatPriorityEnemy() {
    let priority: FlatEnemy | null = null;
    let priorityScore = -Infinity;
    for (const enemy of this.enemies) {
      const score =
        (enemy.type === "rootkit"
          ? 10000
          : enemy.type === "trojan"
            ? 2000
            : enemy.type === "phisher"
              ? 900
              : 0) + enemy.hp;
      if (score > priorityScore) {
        priority = enemy;
        priorityScore = score;
      }
    }
    return priority;
  }

  private getNearestEnemy(x: number, z: number, maxDistance = Infinity) {
    let nearest: FlatEnemy | null = null;
    let nearestDistance = Number.isFinite(maxDistance)
      ? maxDistance * this.terrain.targetingRangeMultiplier
      : maxDistance;
    for (const enemy of this.enemies) {
      const distance =
        this.distance(x, z, enemy.x, enemy.z) *
        (enemy.resistanceFlags.includes("decoy") ? 1.35 : 1);
      if (distance < nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private resolveAim() {
    const nearest = this.getNearestEnemy(this.player.x, this.player.z, 7.5);
    const aimDistance = this.distance(
      this.aim.x,
      this.aim.z,
      this.player.x,
      this.player.z,
    );
    if (
      nearest &&
      (!this.hasPointerAim ||
        aimDistance < 0.5 ||
        Math.hypot(this.touchMove.x, this.touchMove.y) > 0.01)
    ) {
      return { x: nearest.x, z: nearest.z };
    }
    return this.aim;
  }

  private distance(x: number, z: number, x2: number, z2: number) {
    return Math.hypot(x2 - x, z2 - z);
  }

  private clampToArena(point: { x: number; z: number }, radius: number) {
    const length = Math.hypot(point.x, point.z);
    if (length <= radius) return;
    point.x = (point.x / length) * radius;
    point.z = (point.z / length) * radius;
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.width = Math.max(1, parent.clientWidth);
    this.height = Math.max(1, parent.clientHeight);
    this.pixelRatio = Math.min(
      window.devicePixelRatio,
      getQualitySettings(this.qualityPreset).pixelRatioCap,
    );
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.context.imageSmoothingEnabled = true;
  }

  private project(x: number, z: number, y = 0) {
    const shakeX =
      this.reducedMotion || this.shake <= 0
        ? 0
        : (Math.random() - 0.5) * this.shake * 16;
    const shakeY =
      this.reducedMotion || this.shake <= 0
        ? 0
        : (Math.random() - 0.5) * this.shake * 10;
    const dx = x - this.cameraX;
    const dz = z - this.cameraZ;
    const cosine = Math.cos(this.yaw);
    const sine = Math.sin(this.yaw);
    const cameraSpaceX = cosine * dx - sine * dz;
    const cameraSpaceZ = sine * dx + cosine * dz;
    const presentationPullback = this.cameraPresentation === "command"
      ? 1.62
      : this.cameraPresentation === "macro"
        ? 1.34
        : 1;
    const scale = Math.min(this.width, this.height) / (25 * this.zoom * presentationPullback);
    return {
      x: this.width / 2 + cameraSpaceX * scale + shakeX,
      y: this.height * 0.49 + cameraSpaceZ * scale * 0.55 - y * scale + shakeY,
      depth: cameraSpaceZ,
      scale,
    };
  }

  private unproject(screenX: number, screenY: number) {
    const presentationPullback = this.cameraPresentation === "command"
      ? 1.62
      : this.cameraPresentation === "macro"
        ? 1.34
        : 1;
    const scale = Math.min(this.width, this.height) / (25 * this.zoom * presentationPullback);
    const cameraSpaceX = (screenX - this.width / 2) / scale;
    const cameraSpaceZ = (screenY - this.height * 0.49) / (scale * 0.55);
    const cosine = Math.cos(this.yaw);
    const sine = Math.sin(this.yaw);
    return {
      x: this.cameraX + cosine * cameraSpaceX + sine * cameraSpaceZ,
      z: this.cameraZ - sine * cameraSpaceX + cosine * cameraSpaceZ,
    };
  }

  private draw() {
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    const background = context.createRadialGradient(
      this.width * 0.5,
      this.height * 0.46,
      30,
      this.width * 0.5,
      this.height * 0.46,
      Math.max(this.width, this.height) * 0.72,
    );
    background.addColorStop(0, this.battleground.palette.fog);
    background.addColorStop(0.44, this.battleground.palette.background);
    background.addColorStop(1, "#060b0f");
    context.fillStyle = background;
    context.fillRect(0, 0, this.width, this.height);

    this.drawGrid();
    this.drawTerrainOverlay();
    this.drawPlatform();
    this.drawArenaZoneMarkers();
    if (this.tutorialMarker) this.drawTutorialMarker();
    if (this.placementActive) this.drawPlacementPreview();
    else this.drawTargetingPresentation();

    const drawables: Array<{
      depth: number;
      draw: () => void;
    }> = [];
    for (const building of this.buildings) {
      drawables.push({
        depth: this.project(building.x, building.z).depth,
        draw: () => this.drawIsoBlock(building),
      });
    }
    drawables.push({
      depth: this.project(this.core.x, this.core.z).depth,
      draw: () => this.drawCore(),
    });
    drawables.push({
      depth: this.project(this.repairBay.x, this.repairBay.z).depth,
      draw: () => this.drawRepairBay(),
    });
    drawables.push({
      depth: this.project(this.player.x, this.player.z).depth,
      draw: () => this.drawPlayer(),
    });
    for (const agent of this.agents) {
      drawables.push({
        depth: this.project(agent.x, agent.z).depth,
        draw: () => this.drawAgent(agent),
      });
    }
    for (const subAgent of this.temporarySubAgents) {
      drawables.push({
        depth: this.project(subAgent.x, subAgent.z).depth,
        draw: () => this.drawTemporarySubAgent(subAgent),
      });
    }
    for (const defense of this.defenses) {
      drawables.push({
        depth: this.project(defense.x, defense.z).depth,
        draw: () => this.drawDefense(defense),
      });
    }
    for (const enemy of this.enemies) {
      drawables.push({
        depth: this.project(enemy.x, enemy.z).depth,
        draw: () => this.drawEnemy(enemy),
      });
    }
    for (const pickup of this.pickups) {
      drawables.push({
        depth: this.project(pickup.x, pickup.y).depth,
        draw: () => this.drawLootPickup(pickup),
      });
    }
    drawables.sort((a, b) => a.depth - b.depth);
    drawables.forEach((drawable) => drawable.draw());
    this.drawProjectiles();
    this.drawEffects();
  }

  private drawLootPickup(pickup: FlatLootRuntime) {
      const presentation = getLootPresentation(pickup.type, pickup.value);
    const point = this.project(
      pickup.x,
      pickup.y,
      0.48 + Math.sin(this.elapsed * 3) * 0.1,
    );
    const ground = this.project(pickup.x, pickup.y, 0);
    const beamTop = this.project(pickup.x, pickup.y, presentation.beamHeight);
    const pulse = 1 + Math.sin(this.elapsed * 4) * 0.08;
    const context = this.context;
    context.save();
    context.strokeStyle = presentation.color;
    context.globalAlpha = 0.5;
    context.lineWidth = Math.max(2, point.scale * 0.08);
    context.beginPath();
    context.moveTo(ground.x, ground.y);
    context.lineTo(beamTop.x, beamTop.y);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = presentation.color;
    context.shadowColor = presentation.color;
    context.shadowBlur = 20;
    context.beginPath();
    context.arc(
      point.x,
      point.y,
      Math.max(7, point.scale * 0.28) * pulse,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.shadowBlur = 6;
    context.font = `700 ${Math.max(11, point.scale * 0.22)}px system-ui`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.lineWidth = 4;
    context.strokeStyle = "#05080b";
    context.strokeText(presentation.worldLabel, beamTop.x, beamTop.y - 6);
    context.fillText(presentation.worldLabel, beamTop.x, beamTop.y - 6);
    context.restore();
  }

  private drawGrid() {
    const context = this.context;
    context.save();
    context.lineWidth = 1;
    for (let value = -28; value <= 28; value += 2) {
      const horizontalStart = this.project(-28, value);
      const horizontalEnd = this.project(28, value);
      context.beginPath();
      context.moveTo(horizontalStart.x, horizontalStart.y);
      context.lineTo(horizontalEnd.x, horizontalEnd.y);
      context.strokeStyle = value === 0
        ? `${this.battleground.palette.accent}aa`
        : `${this.battleground.palette.grid}2e`;
      context.stroke();

      const verticalStart = this.project(value, -28);
      const verticalEnd = this.project(value, 28);
      context.beginPath();
      context.moveTo(verticalStart.x, verticalStart.y);
      context.lineTo(verticalEnd.x, verticalEnd.y);
      context.stroke();
    }
    context.restore();
  }

  private drawArenaZoneMarkers() {
    const context = this.context;
    context.save();
    for (const marker of ARENA_ZONE_MARKERS) {
      const zone = getArenaZone({ x: marker.x, z: marker.z });
      const points = Array.from({ length: 40 }, (_, index) => {
        const angle = (index / 40) * Math.PI * 2;
        return this.project(
          marker.x + Math.cos(angle) * marker.radius,
          marker.z + Math.sin(angle) * marker.radius,
          0.035,
        );
      });
      context.globalAlpha =
        marker.kind === "core" ? 0.74 : marker.kind === "portal" ? 0.38 : 0.52;
      context.strokeStyle = toCssColor(marker.color);
      context.fillStyle = toCssColor(marker.color);
      context.lineWidth = marker.kind === "core" ? 2.25 : 1.25;
      context.setLineDash(marker.kind === "portal" ? [4, 5] : []);
      context.beginPath();
      points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      if (marker.kind === "core") {
        context.globalAlpha = 0.12;
        context.fill();
        context.globalAlpha = 0.74;
      }
      context.stroke();

      if (marker.kind === "breach") {
        const start = this.project(marker.x - 1.3, marker.z, 0.04);
        const end = this.project(marker.x + 1.3, marker.z, 0.04);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }

      context.setLineDash([]);
      context.globalAlpha = 0.72;
      const label = this.project(marker.x, marker.z + marker.radius + 0.22, 0.08);
      context.font = "600 9px ui-monospace, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(4, 8, 10, 0.86)";
      context.strokeText(zone.label, label.x, label.y);
      context.fillStyle = toCssColor(marker.color);
      context.fillText(zone.label, label.x, label.y);
    }
    context.restore();
  }

  private drawTerrainOverlay() {
    if (this.terrain.id === "none") return;
    const labels: Record<string, string> = {
      "relay-storm": "RELAY STORM",
      "firewall-lanes": "FIREWALL LANES",
      "data-fog": "DATA FOG",
      "split-breach": "SPLIT BREACH",
    };
    const context = this.context;
    context.save();
    context.strokeStyle = this.terrain.color;
    context.fillStyle = this.terrain.color;
    context.globalAlpha = this.terrain.id === "data-fog" ? 0.12 : 0.34;
    context.lineWidth = 2;
    const lanes =
      this.terrain.id === "split-breach"
        ? [-8, 8]
        : this.terrain.id === "firewall-lanes"
          ? [-7.5, -2.5, 2.5, 7.5]
          : [-11, 11];
    for (const lane of lanes) {
      const start = this.project(lane, -16, 0.03);
      const end = this.project(lane, 16, 0.03);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    if (this.terrain.id === "data-fog") {
      context.fillRect(0, this.height * 0.25, this.width, this.height * 0.5);
    }
    context.globalAlpha = 0.78;
    context.font = "700 10px monospace";
    context.textAlign = "center";
    context.fillText(labels[this.terrain.id] ?? "", this.width / 2, 90);
    context.restore();
  }

  private drawTutorialMarker() {
    if (!this.tutorialMarker) return;
    const context = this.context;
    const point = this.project(this.tutorialMarker.x, this.tutorialMarker.z, 0.05);
    context.save();
    context.strokeStyle = "#9ed8dd";
    context.fillStyle = "rgba(158,216,221,.14)";
    context.shadowColor = "#9ed8dd";
    context.shadowBlur = 16;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, point.scale * 1.08, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawPlatform() {
    const context = this.context;
    const points = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return this.project(Math.cos(angle) * 5.5, Math.sin(angle) * 5.5);
    });
    context.save();
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fillStyle = "rgba(27,39,43,.96)";
    context.fill();
    context.strokeStyle = "rgba(240,138,75,.72)";
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  private drawPlacementPreview() {
    const context = this.context;
    const valid = this.isFlatDefensePositionValid(this.aim.x, this.aim.z);
    const points = Array.from({ length: 32 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      return this.project(
        this.aim.x + Math.cos(angle) * 0.88,
        this.aim.z + Math.sin(angle) * 0.88,
        0.04,
      );
    });
    context.save();
    context.strokeStyle = valid ? "#9ed8dd" : "#d14b34";
    context.fillStyle = valid ? "rgba(158,216,221,.16)" : "rgba(209,75,52,.16)";
    context.shadowColor = valid ? "#9ed8dd" : "#d14b34";
    context.shadowBlur = 18;
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fill();
    context.lineWidth = 2;
    context.stroke();
    const center = this.project(this.aim.x, this.aim.z, 0.8);
    context.font = "700 10px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillStyle = valid ? "#d9f4f5" : "#ffc2b5";
    context.fillText(
      valid ? "PLACE SENTRY" : "INVALID POSITION",
      center.x,
      center.y,
    );
    context.restore();
  }

  private drawTargetingPresentation() {
    if (this.mode !== "playing") return;
    const target = this.resolveAim();
    const targetPoint = this.project(target.x, target.z, 0.08);
    const dx = target.x - this.player.x;
    const dz = target.z - this.player.z;
    const distance = Math.hypot(dx, dz) || 1;
    const lineStart = this.project(
      target.x - (dx / distance) * Math.min(1.35, distance),
      target.z - (dz / distance) * Math.min(1.35, distance),
      0.1,
    );
    const radius =
      Math.max(7, targetPoint.scale * 0.38) *
      (this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 8) * 0.08);
    const context = this.context;
    context.save();
    context.strokeStyle = "#ffd2ad";
    context.shadowColor = "#ff9d68";
    context.shadowBlur = 10;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(lineStart.x, lineStart.y);
    context.lineTo(targetPoint.x, targetPoint.y);
    context.stroke();
    context.beginPath();
    context.arc(targetPoint.x, targetPoint.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(targetPoint.x - radius - 5, targetPoint.y);
    context.lineTo(targetPoint.x - radius + 2, targetPoint.y);
    context.moveTo(targetPoint.x + radius - 2, targetPoint.y);
    context.lineTo(targetPoint.x + radius + 5, targetPoint.y);
    context.stroke();
    context.restore();
  }

  private drawIsoBlock(building: {
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
  }) {
    const { x, z, width, depth, height } = building;
    const base = [
      this.project(x - width / 2, z - depth / 2),
      this.project(x + width / 2, z - depth / 2),
      this.project(x + width / 2, z + depth / 2),
      this.project(x - width / 2, z + depth / 2),
    ];
    const top = [
      this.project(x - width / 2, z - depth / 2, height),
      this.project(x + width / 2, z - depth / 2, height),
      this.project(x + width / 2, z + depth / 2, height),
      this.project(x - width / 2, z + depth / 2, height),
    ];
    const context = this.context;
    const polygon = (points: Array<{ x: number; y: number }>, fill: string) => {
      context.beginPath();
      points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = "rgba(158,210,220,.18)";
      context.lineWidth = 1;
      context.stroke();
    };
    context.save();
    polygon([base[0], base[1], top[1], top[0]], "#101a20");
    polygon([base[1], base[2], top[2], top[1]], "#18262d");
    polygon(top, "#24343b");
    const stripStart = this.project(
      x - width / 2,
      z - depth / 2,
      height * 0.62,
    );
    const stripEnd = this.project(x + width / 2, z - depth / 2, height * 0.62);
    context.beginPath();
    context.moveTo(stripStart.x, stripStart.y);
    context.lineTo(stripEnd.x, stripEnd.y);
    context.strokeStyle = "rgba(240,138,75,.68)";
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  private drawCore() {
    const context = this.context;
    const base = this.project(this.core.x, this.core.z, 0.2);
    const crystal = this.project(
      this.core.x,
      this.core.z,
      1.38 + Math.sin(this.elapsed * 1.8) * 0.08,
    );
    const scale = base.scale;
    context.save();
    context.fillStyle = "rgba(0,0,0,.42)";
    context.beginPath();
    context.ellipse(
      base.x,
      base.y + 8,
      scale * 1.35,
      scale * 0.46,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.fillStyle = "#25353b";
    context.strokeStyle = "rgba(255,154,93,.78)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(base.x, base.y - scale * 0.42);
    context.lineTo(base.x + scale, base.y);
    context.lineTo(base.x, base.y + scale * 0.42);
    context.lineTo(base.x - scale, base.y);
    context.closePath();
    context.fill();
    context.stroke();
    context.shadowColor = "#dc7540";
    context.shadowBlur = 32;
    context.fillStyle = "#fff0e2";
    context.beginPath();
    context.moveTo(crystal.x, crystal.y - scale * 0.62);
    context.lineTo(crystal.x + scale * 0.4, crystal.y);
    context.lineTo(crystal.x, crystal.y + scale * 0.72);
    context.lineTo(crystal.x - scale * 0.4, crystal.y);
    context.closePath();
    context.fill();
    context.strokeStyle = "#ff9a5d";
    context.stroke();
    this.drawWorldHealthBar(
      this.core.x,
      this.core.z,
      2.45,
      72,
      this.core.hp / this.core.maxHp,
      "#9ed8dd",
    );
    context.restore();
  }

  private drawRepairBay() {
    const context = this.context;
    const base = this.project(this.repairBay.x, this.repairBay.z, 0.12);
    const beacon = this.project(this.repairBay.x, this.repairBay.z, 1.25);
    const size = base.scale * 0.62;
    const operational = this.repairBay.hp > 0;
    context.save();
    context.fillStyle = operational ? "#1a3435" : "#291719";
    context.strokeStyle = operational ? "#76c6c1" : "#b7422e";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(base.x, base.y, size, size * 0.35, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowColor = operational ? "#76c6c1" : "#b7422e";
    context.shadowBlur = 16;
    context.fillStyle = operational ? "#b8fffa" : "#54252a";
    context.fillRect(beacon.x - size * 0.15, beacon.y, size * 0.3, size * 0.82);
    context.shadowBlur = 0;
    this.drawWorldHealthBar(
      this.repairBay.x,
      this.repairBay.z,
      1.72,
      54,
      this.repairBay.hp / this.repairBay.maxHp,
      operational ? "#76c6c1" : "#b7422e",
    );
    context.restore();
  }

  private drawPlayer() {
    const context = this.context;
    const feet = this.project(this.player.x, this.player.z);
    const waist = this.project(this.player.x, this.player.z, 0.82);
    const chest = this.project(this.player.x, this.player.z, 1.42);
    const head = this.project(this.player.x, this.player.z, 2.08);
    const scale = feet.scale;
    context.save();

    // Grounded shadow and command ring.
    context.fillStyle = "rgba(0,0,0,.5)";
    context.beginPath();
    context.ellipse(
      feet.x,
      feet.y + 6,
      scale * 0.66,
      scale * 0.23,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.strokeStyle = "rgba(255,154,93,.96)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(
      feet.x,
      feet.y + 3,
      scale * 0.72,
      scale * 0.27,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();

    // Coat silhouette and armoured legs.
    context.fillStyle = "#11191e";
    context.strokeStyle = "#31454e";
    context.lineWidth = Math.max(1, scale * 0.035);
    context.beginPath();
    context.moveTo(chest.x - scale * 0.44, chest.y - scale * 0.08);
    context.lineTo(chest.x + scale * 0.44, chest.y - scale * 0.08);
    context.lineTo(feet.x + scale * 0.48, feet.y + scale * 0.04);
    context.lineTo(feet.x, feet.y - scale * 0.12);
    context.lineTo(feet.x - scale * 0.48, feet.y + scale * 0.04);
    context.closePath();
    context.fill();
    context.stroke();

    for (const side of [-1, 1] as const) {
      context.fillStyle = "#29373e";
      context.strokeStyle = "#5a737b";
      context.beginPath();
      context.moveTo(waist.x + side * scale * 0.08, waist.y);
      context.lineTo(waist.x + side * scale * 0.34, waist.y + scale * 0.04);
      context.lineTo(feet.x + side * scale * 0.47, feet.y + scale * 0.13);
      context.lineTo(feet.x + side * scale * 0.15, feet.y + scale * 0.08);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = "#7d452f";
      context.beginPath();
      context.roundRect(
        feet.x + side * scale * 0.3 - scale * 0.11,
        feet.y - scale * 0.2,
        scale * 0.22,
        scale * 0.2,
        scale * 0.04,
      );
      context.fill();
    }

    // Broad chest plate and shoulder armour.
    context.fillStyle = "#2b383f";
    context.strokeStyle = "#76949b";
    context.beginPath();
    context.moveTo(chest.x - scale * 0.48, chest.y - scale * 0.28);
    context.lineTo(chest.x + scale * 0.48, chest.y - scale * 0.28);
    context.lineTo(waist.x + scale * 0.34, waist.y + scale * 0.05);
    context.lineTo(waist.x - scale * 0.34, waist.y + scale * 0.05);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = "#8a4b31";
    for (const side of [-1, 1] as const) {
      context.beginPath();
      context.roundRect(
        chest.x + side * scale * 0.49 - scale * 0.19,
        chest.y - scale * 0.35,
        scale * 0.38,
        scale * 0.24,
        scale * 0.07,
      );
      context.fill();
    }

    // Chest power bus.
    context.shadowColor = "#ff9a5d";
    context.shadowBlur = 12;
    context.fillStyle = "#f08a4b";
    context.beginPath();
    context.roundRect(
      chest.x - scale * 0.09,
      chest.y - scale * 0.16,
      scale * 0.18,
      scale * 0.3,
      scale * 0.03,
    );
    context.fill();
    context.shadowBlur = 0;

    // Full helmet with a cyan visor.
    context.fillStyle = "#1b252a";
    context.strokeStyle = "#718b91";
    context.lineWidth = Math.max(1, scale * 0.04);
    context.beginPath();
    context.arc(head.x, head.y, scale * 0.34, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#0c1317";
    context.beginPath();
    context.roundRect(
      head.x - scale * 0.25,
      head.y + scale * 0.05,
      scale * 0.5,
      scale * 0.21,
      scale * 0.06,
    );
    context.fill();
    context.shadowColor = "#9eeaf0";
    context.shadowBlur = 14;
    context.strokeStyle = "#bde7ec";
    context.lineWidth = Math.max(2, scale * 0.09);
    context.beginPath();
    context.moveTo(head.x - scale * 0.24, head.y - scale * 0.03);
    context.lineTo(head.x + scale * 0.24, head.y - scale * 0.03);
    context.stroke();
    context.shadowBlur = 0;

    // Arms and a solid rifle silhouette aligned to the current aim.
    const aimScreen = this.project(this.aim.x, this.aim.z, 0.8);
    let dx = aimScreen.x - chest.x;
    let dy = aimScreen.y - chest.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const px = -dy;
    const py = dx;
    const gunStartX = chest.x + dx * scale * 0.1;
    const gunStartY = chest.y + dy * scale * 0.1;
    const gunEndX = chest.x + dx * scale * 1.28;
    const gunEndY = chest.y + dy * scale * 1.28;

    context.strokeStyle = "#202b31";
    context.lineWidth = Math.max(4, scale * 0.19);
    context.beginPath();
    context.moveTo(chest.x - px * scale * 0.26, chest.y - py * scale * 0.26);
    context.lineTo(
      gunStartX + dx * scale * 0.42,
      gunStartY + dy * scale * 0.42,
    );
    context.moveTo(chest.x + px * scale * 0.26, chest.y + py * scale * 0.26);
    context.lineTo(
      gunStartX + dx * scale * 0.2,
      gunStartY + dy * scale * 0.2,
    );
    context.stroke();

    context.fillStyle = "#0d1418";
    context.strokeStyle = "#b66841";
    context.lineWidth = Math.max(1, scale * 0.035);
    context.beginPath();
    context.moveTo(
      gunStartX + px * scale * 0.13,
      gunStartY + py * scale * 0.13,
    );
    context.lineTo(gunEndX + px * scale * 0.08, gunEndY + py * scale * 0.08);
    context.lineTo(gunEndX - px * scale * 0.08, gunEndY - py * scale * 0.08);
    context.lineTo(
      gunStartX - px * scale * 0.13,
      gunStartY - py * scale * 0.13,
    );
    context.closePath();
    context.fill();
    context.stroke();
    context.shadowColor = "#ff9a5d";
    context.shadowBlur = 10;
    context.fillStyle = "#ff9a5d";
    context.beginPath();
    context.arc(gunEndX, gunEndY, scale * 0.065, 0, Math.PI * 2);
    context.fill();

    this.drawWorldHealthBar(
      this.player.x,
      this.player.z,
      2.72,
      62,
      this.player.hp / this.player.maxHp,
      "#e77d44",
    );
    context.restore();
  }

  private drawTemporarySubAgent(subAgent: FlatTemporarySubAgent) {
    const context = this.context;
    const floor = this.project(subAgent.x, subAgent.z, 0);
    const signal = this.project(
      subAgent.x,
      subAgent.z,
      0.55 + Math.sin(this.elapsed * 7) * 0.08,
    );
    const size = floor.scale * 0.22;
    context.save();
    context.setLineDash([3, 3]);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.ellipse(
      floor.x,
      floor.y,
      size * 1.5,
      size * 0.55,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = toCssColor(subAgent.color);
    context.shadowColor = toCssColor(subAgent.color);
    context.shadowBlur = 14;
    context.beginPath();
    context.moveTo(signal.x, signal.y - size);
    context.lineTo(signal.x + size, signal.y);
    context.lineTo(signal.x, signal.y + size);
    context.lineTo(signal.x - size, signal.y);
    context.closePath();
    context.fill();
    const lifetimeRatio = Math.min(1, Math.max(0, subAgent.lifetimeRatio));
    context.shadowBlur = 0;
    context.fillStyle = "#071015";
    context.fillRect(signal.x - size * 1.3, signal.y - size * 1.75, size * 2.6, 3);
    context.fillStyle = toCssColor(subAgent.color);
    context.fillRect(
      signal.x - size * 1.3,
      signal.y - size * 1.75,
      size * 2.6 * lifetimeRatio,
      3,
    );
    context.restore();
  }

  private drawAgent(agent: FlatAgent) {
    const context = this.context;
    const floor = this.project(agent.x, agent.z, 0);
    const hips = this.project(agent.x, agent.z, 0.82);
    const chest = this.project(agent.x, agent.z, 1.38);
    const head = this.project(agent.x, agent.z, 1.92);
    const size = floor.scale * (agent.id === "forge" ? 0.44 : 0.38);
    const stride = Math.sin(this.elapsed * 9 + Number(agent.code)) * size * 0.16;
    const target = this.getNearestEnemy(agent.x, agent.z, agent.range + 4);
    const aim = target
      ? this.project(target.x, target.z, 0.8)
      : this.project(this.player.x, this.player.z, 0.8);
    let dx = aim.x - chest.x;
    let dy = aim.y - chest.y;
    const aimLength = Math.hypot(dx, dy) || 1;
    dx /= aimLength;
    dy /= aimLength;
    const px = -dy;
    const py = dx;

    context.save();
    context.shadowColor = toCssColor(agent.color);
    context.shadowBlur = 16;
    context.strokeStyle = "#29363c";
    context.lineCap = "round";
    context.lineWidth = Math.max(3, size * 0.22);

    context.beginPath();
    context.moveTo(hips.x - size * 0.18, hips.y);
    context.lineTo(floor.x - size * 0.2 + stride, floor.y);
    context.moveTo(hips.x + size * 0.18, hips.y);
    context.lineTo(floor.x + size * 0.2 - stride, floor.y);
    context.stroke();

    context.fillStyle = agent.id === "forge" ? "#30343a" : "#202a2f";
    context.strokeStyle = toCssColor(agent.color);
    context.lineWidth = Math.max(1.5, size * 0.06);
    context.beginPath();
    context.moveTo(chest.x - size * 0.62, chest.y - size * 0.42);
    context.lineTo(chest.x + size * 0.62, chest.y - size * 0.42);
    context.lineTo(hips.x + size * 0.38, hips.y + size * 0.15);
    context.lineTo(hips.x - size * 0.38, hips.y + size * 0.15);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = toCssColor(agent.color);
    context.fillRect(
      chest.x - size * 0.16,
      chest.y - size * 0.24,
      size * 0.32,
      size * 0.15,
    );

    context.fillStyle = "#1a2429";
    context.beginPath();
    context.arc(head.x, head.y, size * 0.34, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 12;
    context.strokeStyle = toCssColor(agent.color);
    context.lineWidth = Math.max(2, size * 0.08);
    context.beginPath();
    context.moveTo(head.x - size * 0.24, head.y);
    context.lineTo(head.x + size * 0.24, head.y);
    context.stroke();

    context.shadowBlur = 0;
    context.strokeStyle = "#27343a";
    context.lineWidth = Math.max(3, size * 0.18);
    context.beginPath();
    context.moveTo(chest.x - px * size * 0.42, chest.y - py * size * 0.42);
    context.lineTo(chest.x + dx * size * 0.52, chest.y + dy * size * 0.52);
    context.moveTo(chest.x + px * size * 0.42, chest.y + py * size * 0.42);
    context.lineTo(chest.x + dx * size * 0.34, chest.y + dy * size * 0.34);
    context.stroke();

    const weaponLength =
      agent.id === "kira" ? 1.8 : agent.id === "forge" ? 1.45 : 1.25;
    context.strokeStyle = "#0a1013";
    context.lineWidth =
      agent.id === "forge"
        ? Math.max(5, size * 0.24)
        : Math.max(3, size * 0.13);
    context.beginPath();
    context.moveTo(
      chest.x + dx * size * 0.2,
      chest.y + dy * size * 0.2,
    );
    context.lineTo(
      chest.x + dx * size * weaponLength,
      chest.y + dy * size * weaponLength,
    );
    context.stroke();
    context.strokeStyle = toCssColor(agent.color);
    context.lineWidth = Math.max(1.5, size * 0.045);
    context.stroke();

    context.strokeStyle = toCssColor(agent.color);
    context.lineWidth = 1.5;
    context.beginPath();
    context.ellipse(
      floor.x,
      floor.y + size * 0.1,
      size * 1.18,
      size * 0.36,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    this.drawWorldHealthBar(
      agent.x,
      agent.z,
      2.28,
      34,
      agent.hp / agent.maxHp,
      toCssColor(agent.color),
    );
    context.restore();
  }

  private drawDefense(defense: FlatDefense) {
    const context = this.context;
    const base = this.project(defense.x, defense.z, 0.25);
    const head = this.project(defense.x, defense.z, 1.25);
    const size = base.scale * 0.5;
    context.save();
    context.fillStyle = "#263b43";
    context.strokeStyle = "#9ed8dd";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(base.x, base.y - size * 0.42);
    context.lineTo(base.x + size * 0.78, base.y);
    context.lineTo(base.x, base.y + size * 0.42);
    context.lineTo(base.x - size * 0.78, base.y);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillRect(
      head.x - size * 0.42,
      head.y - size * 0.22,
      size * 0.84,
      size * 0.44,
    );
    context.shadowColor = "#9ed8dd";
    context.shadowBlur = 14;
    context.strokeStyle = "#c8f7fa";
    context.beginPath();
    context.moveTo(head.x, head.y);
    context.lineTo(
      head.x + Math.sin(defense.rotation) * size * 1.25,
      head.y + Math.cos(defense.rotation) * size * 0.65,
    );
    context.stroke();
    this.drawWorldHealthBar(
      defense.x,
      defense.z,
      1.7,
      38,
      defense.hp / defense.maxHp,
      "#9ed8dd",
    );
    context.restore();
  }

  private drawWorldHealthBar(
    x: number,
    z: number,
    y: number,
    width: number,
    ratio: number,
    color: string,
  ) {
    const point = this.project(x, z, y);
    const context = this.context;
    context.fillStyle = "rgba(5,9,11,.9)";
    context.fillRect(point.x - width / 2, point.y, width, 6);
    context.fillStyle = color;
    context.fillRect(
      point.x - width / 2 + 2,
      point.y + 2,
      (width - 4) * clamp01(ratio),
      2,
    );
  }

  private traceProjectedRing(
    x: number,
    z: number,
    radius: number,
    segments = 48,
  ) {
    const points = Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      return this.project(
        x + Math.cos(angle) * radius,
        z + Math.sin(angle) * radius,
        0.03,
      );
    });
    points.forEach((point, index) => {
      if (index === 0) this.context.moveTo(point.x, point.y);
      else this.context.lineTo(point.x, point.y);
    });
    this.context.closePath();
  }

  private drawEnemy(enemy: FlatEnemy) {
    const context = this.context;
    const bossState = enemy.bossState;
    if (bossState && bossState.telegraphLeftMs > 0) {
      const targetX = bossState.pendingTargetX;
      const targetZ = bossState.pendingTargetZ;
      if (targetX !== null && targetZ !== null) {
        const progress =
          bossState.telegraphLeftMs / bossState.telegraphMs;
        context.save();
        context.fillStyle = `rgba(217,75,53,${0.08 + (1 - progress) * 0.16})`;
        context.strokeStyle = "#ff8a68";
        context.lineWidth = 2 + (1 - progress) * 2;
        context.setLineDash([7, 5]);
        context.beginPath();
        this.traceProjectedRing(targetX, targetZ, bossState.attackRadius);
        context.fill();
        context.stroke();
        context.restore();
      }
    }
    if (enemy.resistanceFlags.includes("jammer")) {
      const jammerZoneName = "enemy-jammer-zone";
      context.save();
      context.strokeStyle = "rgba(232,107,100,.28)";
      context.lineWidth = 2;
      context.setLineDash([5, 7]);
      context.beginPath();
      this.traceProjectedRing(enemy.x, enemy.z, JAMMER_ZONE_RADIUS);
      context.stroke();
      context.restore();
      void jammerZoneName;
    }
    const recoilStrength = clamp01(enemy.hitFlash / 0.11);
    const displayX = enemy.x + enemy.hitRecoilX * recoilStrength;
    const displayZ = enemy.z + enemy.hitRecoilZ * recoilStrength;
    const motionTime = this.reducedMotion ? 0 : this.elapsed;
    const point = this.project(
      displayX,
      displayZ,
      enemy.radius + Math.sin(motionTime * 2.4 + enemy.id) * 0.05,
    );
    const floor = this.project(displayX, displayZ);
    const baseSize = point.scale * enemy.radius;
    const color =
      enemy.type === "trojan"
        ? "#8a3026"
        : enemy.type === "rootkit"
          ? "#bd422e"
          : enemy.type === "phisher"
            ? "#b45d32"
            : "#a73d2d";
    const pulse =
      enemy.telegraphLeft > 0 ? 1 + Math.sin(motionTime * 18) * 0.09 : 1;
    const size = baseSize * pulse;
    this.drawRobotEnemy(enemy, point, floor, size, color);

    context.save();
    if (enemy.decoyOwnerId !== null) context.globalAlpha = 0.48;
    context.shadowBlur = 0;
    const healthWidth = enemy.bossState
      ? Math.max(140, size * 2.4)
      : Math.max(28, size * 1.6);
    const healthRatio = clamp01(enemy.hp / enemy.maxHp);
    context.fillStyle = "rgba(15,4,3,.85)";
    context.fillRect(
      point.x - healthWidth / 2,
      point.y - size - 12,
      healthWidth,
      3,
    );
    context.fillStyle = "#dc7540";
    context.fillRect(
      point.x - healthWidth / 2,
      point.y - size - 12,
      healthWidth * healthRatio,
      3,
    );
    context.fillStyle = "rgba(255,226,207,.78)";
    context.font = `${Math.max(7, Math.min(9, size * 0.25))}px monospace`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(
      enemy.decoyOwnerId !== null
        ? "PHISHER DECOY"
        : enemy.bossState
          ? `${enemy.bossState.label} · ARMORED`
        : enemy.type === "rootkit"
          ? "ROOTKIT BOSS"
          : enemy.type.toUpperCase(),
      point.x,
      point.y - size - 15,
    );
    this.drawResistanceCues(enemy, point.x, point.y - size - 28);
    context.restore();
  }

  private drawRobotEnemy(
    enemy: FlatEnemy,
    point: { x: number; y: number; scale: number },
    floor: { x: number; y: number },
    size: number,
    color: string,
  ) {
    const context = this.context;
    const robotColor = enemy.hitFlash > 0 ? "#fff0df" : color;
    const armorColor = enemy.type === "rootkit"
      ? "#5e1718"
      : enemy.type === "trojan"
        ? "#44242a"
        : "#2b1519";
    const highlight = enemy.type === "phisher" ? "#ffc57c" : "#ff9f6d";
    const motionTime = this.reducedMotion ? 0 : this.elapsed;
    const pulse = enemy.telegraphLeft > 0
      ? 1 + Math.sin(motionTime * 18) * 0.08
      : 1;
    const bodyW = size * (enemy.type === "rootkit" ? 0.92 : 0.72) * pulse;
    const bodyH = size * (enemy.type === "rootkit" ? 0.92 : 0.8) * pulse;
    const legH = size * 0.62;
    const drawPolygon = (points: Array<{ x: number; y: number }>) => {
      context.beginPath();
      points.forEach((entry, index) => {
        if (index === 0) context.moveTo(entry.x, entry.y);
        else context.lineTo(entry.x, entry.y);
      });
      context.closePath();
      context.fill();
      context.stroke();
    };

    context.save();
    if (enemy.decoyOwnerId !== null) context.globalAlpha = 0.48;
    context.fillStyle = "rgba(0,0,0,.52)";
    context.beginPath();
    context.ellipse(
      floor.x,
      floor.y + 4,
      bodyW * 1.08,
      Math.max(3, bodyW * 0.3),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    context.shadowColor = color;
    context.shadowBlur = enemy.type === "rootkit" ? 34 : 18;
    context.strokeStyle = color;
    context.lineWidth = enemy.type === "rootkit" ? 2.5 : 1.6;

    // Legs and feet make the threat read as a moving war machine instead of
    // another floating gem. Their alternating stride mirrors the WebGL rig.
    const stride = this.reducedMotion
      ? 0
      : Math.sin(motionTime * (enemy.type === "rootkit" ? 4.4 : 8.5) + enemy.id) * size * 0.09;
    context.fillStyle = armorColor;
    drawPolygon([
      { x: point.x - bodyW * 0.38 + stride, y: point.y + bodyH * 0.35 },
      { x: point.x - bodyW * 0.08 + stride, y: point.y + bodyH * 0.35 },
      { x: point.x - bodyW * 0.12 + stride, y: point.y + bodyH * 0.35 + legH },
      { x: point.x - bodyW * 0.42 + stride, y: point.y + bodyH * 0.35 + legH },
    ]);
    drawPolygon([
      { x: point.x + bodyW * 0.08 - stride, y: point.y + bodyH * 0.35 },
      { x: point.x + bodyW * 0.38 - stride, y: point.y + bodyH * 0.35 },
      { x: point.x + bodyW * 0.42 - stride, y: point.y + bodyH * 0.35 + legH },
      { x: point.x + bodyW * 0.12 - stride, y: point.y + bodyH * 0.35 + legH },
    ]);

    context.fillStyle = robotColor;
    drawPolygon([
      { x: point.x - bodyW, y: point.y - bodyH * 0.34 },
      { x: point.x - bodyW * 0.62, y: point.y - bodyH * 0.72 },
      { x: point.x + bodyW * 0.62, y: point.y - bodyH * 0.72 },
      { x: point.x + bodyW, y: point.y - bodyH * 0.34 },
      { x: point.x + bodyW * 0.76, y: point.y + bodyH * 0.42 },
      { x: point.x - bodyW * 0.76, y: point.y + bodyH * 0.42 },
    ]);

    // Shoulder plates and a raised weapon give the silhouettes a readable
    // military profile at both macro and tactical camera distances.
    context.fillStyle = armorColor;
    drawPolygon([
      { x: point.x - bodyW * 1.22, y: point.y - bodyH * 0.28 },
      { x: point.x - bodyW * 0.86, y: point.y - bodyH * 0.5 },
      { x: point.x - bodyW * 0.82, y: point.y - bodyH * 0.02 },
      { x: point.x - bodyW * 1.18, y: point.y + bodyH * 0.12 },
    ]);
    drawPolygon([
      { x: point.x + bodyW * 0.82, y: point.y - bodyH * 0.5 },
      { x: point.x + bodyW * 1.22, y: point.y - bodyH * 0.28 },
      { x: point.x + bodyW * 1.18, y: point.y + bodyH * 0.12 },
      { x: point.x + bodyW * 0.82, y: point.y - bodyH * 0.02 },
    ]);

    const headSize = size * (enemy.type === "rootkit" ? 0.42 : 0.32) * pulse;
    context.fillStyle = robotColor;
    drawPolygon([
      { x: point.x - headSize, y: point.y - bodyH * 0.7 },
      { x: point.x - headSize * 0.72, y: point.y - bodyH * 1.08 },
      { x: point.x + headSize * 0.72, y: point.y - bodyH * 1.08 },
      { x: point.x + headSize, y: point.y - bodyH * 0.7 },
      { x: point.x + headSize * 0.74, y: point.y - bodyH * 0.48 },
      { x: point.x - headSize * 0.74, y: point.y - bodyH * 0.48 },
    ]);
    context.shadowBlur = 10;
    context.fillStyle = highlight;
    context.fillRect(
      point.x - headSize * 0.58,
      point.y - bodyH * 0.81,
      headSize * 1.16,
      Math.max(2, headSize * 0.16),
    );
    context.fillStyle = enemy.hitFlash > 0 ? "#fff4e6" : "#ffc9a4";
    context.beginPath();
    context.arc(
      point.x,
      point.y - bodyH * 0.12,
      Math.max(2, size * (enemy.type === "rootkit" ? 0.14 : 0.11)),
      0,
      Math.PI * 2,
    );
    context.fill();

    context.shadowBlur = 12;
    context.strokeStyle = highlight;
    context.lineWidth = Math.max(2, size * 0.08);
    context.beginPath();
    context.moveTo(point.x + bodyW * 0.9, point.y - bodyH * 0.22);
    context.lineTo(point.x + bodyW * 1.45, point.y - bodyH * 0.98);
    context.stroke();
    context.fillStyle = highlight;
    context.beginPath();
    context.arc(point.x + bodyW * 1.48, point.y - bodyH, Math.max(2, size * 0.1), 0, Math.PI * 2);
    context.fill();

    if (enemy.type === "virus") {
      // Fast scout: lateral signal spikes make this silhouette distinct from
      // the heavier armored classes in the Canvas fallback.
      context.fillStyle = highlight;
      drawPolygon([
        { x: point.x - bodyW * 1.02, y: point.y - bodyH * 0.25 },
        { x: point.x - bodyW * 1.62, y: point.y - bodyH * 0.55 },
        { x: point.x - bodyW * 1.08, y: point.y + bodyH * 0.02 },
      ]);
      drawPolygon([
        { x: point.x + bodyW * 1.02, y: point.y - bodyH * 0.25 },
        { x: point.x + bodyW * 1.62, y: point.y - bodyH * 0.55 },
        { x: point.x + bodyW * 1.08, y: point.y + bodyH * 0.02 },
      ]);
    } else if (enemy.type === "phisher") {
      // Phishers broadcast a lure: a tall antenna and a bright signal node.
      context.strokeStyle = highlight;
      context.lineWidth = Math.max(2, size * 0.06);
      context.beginPath();
      context.moveTo(point.x, point.y - bodyH * 1.02);
      context.lineTo(point.x, point.y - bodyH * 1.55);
      context.stroke();
      context.fillStyle = highlight;
      context.beginPath();
      context.arc(point.x, point.y - bodyH * 1.62, Math.max(2, size * 0.1), 0, Math.PI * 2);
      context.fill();
    } else if (enemy.type === "trojan") {
      // Trojans carry a plated wedge and horns; the extra mass reads as a
      // slow breach unit before the health bar is even visible.
      context.fillStyle = armorColor;
      drawPolygon([
        { x: point.x - bodyW * 0.65, y: point.y + bodyH * 0.38 },
        { x: point.x, y: point.y + bodyH * 0.8 },
        { x: point.x + bodyW * 0.65, y: point.y + bodyH * 0.38 },
        { x: point.x + bodyW * 0.45, y: point.y + bodyH * 0.08 },
        { x: point.x - bodyW * 0.45, y: point.y + bodyH * 0.08 },
      ]);
      context.strokeStyle = highlight;
      context.lineWidth = Math.max(2, size * 0.07);
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(point.x + side * headSize * 0.55, point.y - bodyH * 1.02);
        context.lineTo(point.x + side * headSize * 0.95, point.y - bodyH * 1.38);
        context.stroke();
      }
    }

    if (enemy.type === "rootkit") {
      context.globalAlpha *= 0.7;
      context.strokeStyle = "#ff6f61";
      context.lineWidth = 2;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.ellipse(floor.x, floor.y - size * 0.12, bodyW * 1.7, bodyW * 0.58, 0, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    context.restore();
  }

  private drawResistanceCues(
    enemy: FlatEnemy,
    x: number,
    y: number,
  ) {
    const colors: Record<ResistanceFlag, string> = {
      shield: "#9ed8dd",
      decoy: "#c6a6e8",
      armor: "#f0b26b",
      jammer: "#e86b64",
    };
    enemy.resistanceFlags.forEach((flag, index) => {
      const cueX =
        x + (index - (enemy.resistanceFlags.length - 1) / 2) * 9;
      this.context.fillStyle = colors[flag];
      this.context.beginPath();
      this.context.arc(cueX, y, 3, 0, Math.PI * 2);
      this.context.fill();
    });
  }

  private drawProjectiles() {
    const context = this.context;
    for (const projectile of this.projectiles) {
      const point = this.project(projectile.x, projectile.z, 0.72);
      const radius = Math.max(2.5, point.scale * projectile.radius);
      context.save();
      context.fillStyle = projectile.color;
      context.shadowColor = projectile.color;
      context.shadowBlur = 14;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  private drawEffects() {
    const context = this.context;
    for (const effect of this.effects) {
      const progress = 1 - effect.life / effect.maxLife;
      const opacity = Math.max(0, 1 - progress);
      context.save();
      context.globalAlpha = opacity;
      context.strokeStyle = effect.color;
      context.fillStyle = effect.color;
      context.shadowColor = effect.color;
      context.shadowBlur = 12;
      if (effect.kind === "ring") {
        const radius =
          effect.radiusStart +
          (effect.radiusEnd - effect.radiusStart) * (1 - (1 - progress) ** 2);
        const points = Array.from({ length: 32 }, (_, index) => {
          const angle = (index / 32) * Math.PI * 2;
          return this.project(
            effect.x + Math.cos(angle) * radius,
            effect.z + Math.sin(angle) * radius,
            0.04,
          );
        });
        context.beginPath();
        points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.lineWidth = 1.4;
        context.stroke();
      }
      if (effect.kind === "beam") {
        const start = this.project(effect.x, effect.z, 0.8);
        const end = this.project(effect.x2, effect.z2, 0.8);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.lineWidth = 1 + opacity * 2;
        context.stroke();
      }
      if (effect.kind === "slash") {
        const facing = Math.atan2(effect.z2, effect.x2);
        const centerX = effect.x + effect.x2 * 1.15;
        const centerZ = effect.z + effect.z2 * 1.15;
        context.beginPath();
        for (let index = 0; index <= 12; index += 1) {
          const angle = facing - 1.05 + (index / 12) * 2.1;
          const point = this.project(
            centerX + Math.cos(angle) * 1.25,
            centerZ + Math.sin(angle) * 1.25,
            0.68 + Math.sin((index / 12) * Math.PI) * 0.34,
          );
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.lineWidth = 2 + opacity * 2;
        context.stroke();
      }
      if (effect.kind === "burst") {
        for (const particle of effect.particles) {
          const point = this.project(particle.x, particle.z, particle.y);
          const size = 1.5 + opacity * 2.5;
          context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        }
      }
      if (effect.kind === "text" && effect.label) {
        const point = this.project(
          effect.x,
          effect.z,
          1.45 + progress * 0.7,
        );
        context.font = `${
          effect.emphasis === "urgent"
            ? 800
            : effect.emphasis === "strong"
              ? 750
              : 700
        } ${effect.emphasis === "standard" ? 13 : 16}px ui-monospace, monospace`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineWidth = 5;
        context.strokeStyle = "rgba(4,8,10,.92)";
        context.strokeText(effect.label, point.x, point.y);
        context.fillStyle = effect.color;
        context.fillText(effect.label, point.x, point.y);
      }
      context.restore();
    }
  }

  private emitHud(force = false) {
    if (!force && this.hudClock > 0) return;
    const recruited = (id: AgentId) =>
      this.agents.some((agent) => agent.id === id);
    const skills = createInitialSkillHud();
    const repairBayState = {
      ...this.repairBay,
      isSeparate: true,
      repairPerSecond: 18,
    };
    for (const id of Object.keys(skills) as EvolutionAgentId[]) {
      const agent = this.agents.find((candidate) => candidate.id === id);
      skills[id].cooldownLeftMs = agent?.skillCooldownLeftMs ?? 0;
      skills[id].status = getAgentSkillAvailability(agent ?? null, repairBayState);
      skills[id].available = skills[id].status === "ready";
    }
    const boss = this.enemies.find((enemy) => enemy.bossState)?.bossState ?? null;
    const zone = getArenaZone({ x: this.player.x, z: this.player.z });
    this.currentZone = zone.shortLabel;
    const breachThreatCount = this.enemies.filter(
      (enemy) => this.distance(enemy.x, enemy.z, this.core.x, this.core.z) <= 4.5,
    ).length;
    const recruitmentNeed = getRecruitmentNeed({
      coreHp: this.core.hp,
      coreMaxHp: this.core.maxHp,
      operatorHp: this.player.hp,
      operatorMaxHp: this.player.maxHp,
      breachThreatCount,
      activeThreatCount: this.enemies.length,
    });
    const recruitmentAdvice = getRecruitmentAdvice({
      coreHp: this.core.hp,
      coreMaxHp: this.core.maxHp,
      operatorHp: this.player.hp,
      operatorMaxHp: this.player.maxHp,
      threatCount: breachThreatCount,
      activeAgents: this.agents.length,
      maxAgents: WARBAND_SLOTS.length,
      compute: this.data,
      components: this.loot.components,
      shards: this.loot.shards,
      candidates: getRecruitmentCandidates(
        this.agents.length,
        recruitmentNeed,
      ),
    }) as RecruitmentAdvice;
    if (recruitmentAdvice.state !== "recruit") {
      this.dismissedRecruitAgentId = null;
      this.recruitPrompt = null;
    } else if (
      shouldShowRecruitPrompt(
        this.previousRecruitmentAdvice,
        recruitmentAdvice,
        this.dismissedRecruitAgentId,
      )
    ) {
      this.recruitPrompt = recruitmentAdvice;
      this.callbacks.onToast({
        eyebrow: "WARBAND RESOURCE THRESHOLD",
        title: `RECRUIT ${recruitmentAdvice.agentId?.toUpperCase() ?? "AGENT"}`,
        detail: `${recruitmentAdvice.role ?? "SPECIALIST"} online. Your Warband can afford this recruit now.`,
      });
    }
    this.previousRecruitmentAdvice = recruitmentAdvice;
    const empReady = this.mode === "playing" && this.intermissionClock <= 0 && this.waveActive && canFireEmp(this.empState);
    if (!empReady) {
      this.empReadyPrompt = false;
      this.dismissedEmpPrompt = false;
    } else if (
      shouldShowEmpReadyPrompt(
        this.previousEmpReady,
        empReady,
        this.dismissedEmpPrompt,
      )
    ) {
      this.empReadyPrompt = true;
      this.callbacks.onToast({
        eyebrow: "EMP SYSTEM CHARGED",
        title: "EMP READY",
        detail: "Tap EMP PULSE or press R to disrupt nearby threats.",
      });
    }
    this.previousEmpReady = empReady;
    const bossEntity = this.enemies.find((enemy) => enemy.bossState) ?? null;
    const simulationView = createSimulationView({
      wave: this.wave,
      resources: {
        compute: this.data,
        components: this.loot.components,
        shards: this.loot.shards,
      },
      core: { ...this.core },
      operator: { ...this.player },
      agents: this.agents.map((agent) => ({
        id: agent.id,
        hp: agent.hp,
        maxHp: agent.maxHp,
        x: agent.x,
        z: agent.z,
        state: agent.disabledLeft > 0
          ? "disabled"
          : agent.gatheringTargetId
            ? "gathering"
            : agent.repairDecision,
      })),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        kind: enemy.type,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        x: enemy.x,
        z: enemy.z,
        state: enemy.hp > 0 ? "alive" : "destroyed",
      })),
      pickups: this.pickups.map((pickup) => ({ ...pickup })),
      sentries: this.defenses.map((defense, index) => ({
        id: `sentry-${index}`,
        hp: defense.hp,
        maxHp: defense.maxHp,
        x: defense.x,
        z: defense.z,
      })),
      subAgents: this.temporarySubAgents.map((subAgent) => ({
        id: subAgent.id,
        parentId: subAgent.parentId,
        role: subAgent.role,
        remainingMs: subAgent.remainingMs,
        x: subAgent.x,
        z: subAgent.z,
      })),
      boss: bossEntity
        ? {
            id: bossEntity.id,
            kind: bossEntity.type,
            hp: bossEntity.hp,
            maxHp: bossEntity.maxHp,
            x: bossEntity.x,
            z: bossEntity.z,
          }
        : null,
    });
    const commandMap = getCommandMapMarkers(simulationView);
    this.callbacks.onHud({
      sessionMode: this.sessionMode,
      watchPaused: this.watchState.paused,
      watchSpeed: this.watchState.speed,
      watchPriority: this.watchState.priority as "survive" | "farm" | "expand",
      cinemaPaused: this.cinemaState.paused,
      cinemaSpeed: this.cinemaState.speed,
      cinemaCleanView: this.cinemaState.cleanView,
      survivalMs: this.watchState.survivalMs,
      sessionIncome: { ...this.watchState.sessionIncome },
      lastAutonomyEvent: this.watchState.lastEvent,
      autonomyLog: [...(this.watchState.activityLog ?? [this.watchState.lastEvent])],
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      core: Math.round(this.core.hp),
      maxCore: Math.round(this.core.maxHp),
      data: Math.round(this.data),
      wave: this.wave,
      intermissionMs: this.intermissionClock,
      enemies: remainingThreats({
        active: this.enemies.length,
        queued: this.spawnQueue.length,
        scheduled: this.scheduledReinforcementThreats,
      }),
      score: this.score,
      best: this.best,
      dash: clamp01(1 - this.player.dashCooldown / 3),
      empCharge: this.empState.charge / this.empState.maxCharge,
      empCooldownLeftMs: this.empState.cooldownLeftMs,
      empCooldownMs: this.empState.cooldownMs,
      empReadyPrompt: this.empReadyPrompt,
      defenses: this.defenses.length,
      maxDefenses: 3,
      defenseCost: 80 + this.defenses.length * 35,
      placingDefense: this.placementActive,
      threat:
        this.wave >= 8
          ? "CRITICAL"
          : this.wave >= 6
            ? "EXTREME"
            : this.wave >= 4
              ? "HIGH"
              : this.wave >= 2
                ? "RISING"
                : "LOW",
      currentZone: this.currentZone,
      command: this.squadCommand,
      agents: {
        kairos: recruited("kairos"),
        kira: recruited("kira"),
        forge: recruited("forge"),
        covenant: recruited("covenant"),
        relay: recruited("relay"),
        scout: recruited("scout"),
        warden: recruited("warden"),
        nova: recruited("nova"),
      },
      warbandCount: simulationView.agents.length,
      maxWarband: WARBAND_SLOTS.length,
      nextRecruitCost: getRecruitCost(WARBAND_SLOTS[this.agents.length]),
      upgradeStacks: { ...this.upgradeStacks },
      evolutions: { ...this.evolutions },
      armorId: this.armorId,
      armorBonuses: getArmorBonuses(this.armorId),
      componentUpgradeRanks: { ...this.componentUpgradeRanks },
      temporarySubAgents: this.temporarySubAgents.length,
      terrainLabel: this.terrain.label,
      battlegroundId: this.battleground.id,
      qualityPreset: this.qualityPreset,
      commandMap: [...commandMap],
      empResistance: getMaxEmpResistancePercent(this.encounterModifiers),
      loot: { ...this.loot },
      recruitmentAdvice,
      recruitPrompt: this.recruitPrompt,
      skills,
      boss: boss
        ? {
            label: boss.label,
            hp: Math.max(0, Math.round(boss.hp)),
            maxHp: boss.maxHp,
            telegraphLeftMs: boss.telegraphLeftMs,
          }
        : null,
      tutorialStep: this.tutorialStep,
      canRetryWave: canRetryFirstWave({
        wave: this.wave,
        tutorialResolved:
          this.tutorialStep === "complete" || this.tutorialStep === "skipped",
        checkpoint: this.firstWaveCheckpoint !== null,
      }),
    });
  }
}

type FreemanProtocolProps = {
  overlayState: OverlayState;
  onToggleOverlay: (panel: CombatOverlay) => void;
  recruitmentAdvisor: ReactNode;
  onRecruitmentAdvisorChange: (state: RecruitmentAdvisorViewState) => void;
  advisorAgentId: AgentId | null;
  advisorRequestKey: number;
  coOpSnapshot?: CoOpCombatSnapshot | null;
  coOpPlayerId?: string | null;
  coOpConnectionState?: string;
  coOpClient?: CoOpInputClient | null;
  onCoOpAction?: (action: CoOpAction) => boolean;
  onCoOpLeave?: () => void;
};

export default function FreemanProtocol({
  overlayState,
  onToggleOverlay,
  recruitmentAdvisor,
  onRecruitmentAdvisorChange,
  advisorAgentId,
  advisorRequestKey,
  coOpSnapshot = null,
  coOpPlayerId = null,
  coOpConnectionState = "idle",
  coOpClient = null,
  onCoOpAction,
  onCoOpLeave,
}: FreemanProtocolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameController | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const helpPausedGameRef = useRef(false);
  const overlayPausedCampaignRef = useRef(false);
  const advisorRequestHandledRef = useRef(0);
  const recruitmentAdvisorChangeRef = useRef(onRecruitmentAdvisorChange);
  const latestCoOpSnapshotRef = useRef<CoOpCombatSnapshot | null>(null);
  const coOpStartRef = useRef<string | null>(null);
  const [mode, setMode] = useState<GameMode>("intro");
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [audioSettings, setAudioSettings] = useState(INITIAL_AUDIO_SETTINGS);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileSquadOpen, setMobileSquadOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel | "closed">("closed");
  const [cameraPresentation, setCameraPresentation] = useState<CameraPresentation>("macro");
  const [tutorialComplete, setTutorialComplete] = useState(false);
  const [watchActivityExpanded, setWatchActivityExpanded] = useState(false);
  const [coOpClock, setCoOpClock] = useState(0);
  const [previousCoOpSnapshot, setPreviousCoOpSnapshot] = useState<CoOpCombatSnapshot | null>(null);
  const [coOpSnapshotReceivedAt, setCoOpSnapshotReceivedAt] = useState(0);
  const [coOpRecruitPromptDismissedKey, setCoOpRecruitPromptDismissedKey] = useState<string | null>(null);
  const [coOpEmpPromptDismissedState, setCoOpEmpPromptDismissedState] = useState<{
    sessionKey: string | null;
    dismissed: boolean;
  }>({ sessionKey: null, dismissed: false });
  const [coOpEmpActionPendingSnapshot, setCoOpEmpActionPendingSnapshot] = useState<{
    sessionKey: string | null;
    snapshotId: number | null;
  }>({ sessionKey: null, snapshotId: null });

  const coOpActive = Boolean(coOpPlayerId);
  const remoteCoOpPlayer = coOpSnapshot?.state.players.find(
    (player) => player.id && player.id !== coOpPlayerId,
  ) ?? null;
  const localCoOpPlayer = coOpSnapshot?.state.players.find(
    (player) => player.id === coOpPlayerId,
  ) ?? null;
  const previousRemoteCoOpPlayer = previousCoOpSnapshot?.state.players.find(
    (player) => player.id && player.id !== coOpPlayerId,
  ) ?? null;
  const interpolationProgress = Math.min(
    1,
    Math.max(0, (coOpClock - coOpSnapshotReceivedAt) / 150),
  );
  const remoteOperator = remoteCoOpPlayer
    ? {
        ...remoteCoOpPlayer.operator,
        x: previousRemoteCoOpPlayer
          ? previousRemoteCoOpPlayer.operator.x + (remoteCoOpPlayer.operator.x - previousRemoteCoOpPlayer.operator.x) * interpolationProgress
          : remoteCoOpPlayer.operator.x,
        y: previousRemoteCoOpPlayer
          ? previousRemoteCoOpPlayer.operator.y + (remoteCoOpPlayer.operator.y - previousRemoteCoOpPlayer.operator.y) * interpolationProgress
          : remoteCoOpPlayer.operator.y,
      }
    : null;
  const coOpSnapshotAge = coOpSnapshotReceivedAt
    ? coOpClock - coOpSnapshotReceivedAt
    : 0;
  const coOpSnapshotStale = coOpActive && (!coOpSnapshot || coOpSnapshotAge > 2_000);
  const interpolateCoOpPosition = (
    entity: { id: string; x: number; y: number },
    previousEntities: ReadonlyArray<{ id: string; x: number; y: number }> | undefined,
  ) => {
    const previous = previousEntities?.find((entry) => entry.id === entity.id);
    return {
      x: previous ? previous.x + (entity.x - previous.x) * interpolationProgress : entity.x,
      y: previous ? previous.y + (entity.y - previous.y) * interpolationProgress : entity.y,
    };
  };
  const coOpShootTarget = coOpSnapshot?.state.enemies.reduce<string | null>((nearest, enemy) => {
    if (!localCoOpPlayer || !nearest) return enemy.id;
    const current = coOpSnapshot.state.enemies.find((entry) => entry.id === nearest);
    if (!current) return enemy.id;
    const origin = localCoOpPlayer.operator;
    return Math.hypot(enemy.x - origin.x, enemy.y - origin.y) < Math.hypot(current.x - origin.x, current.y - origin.y)
      ? enemy.id
      : nearest;
  }, null) ?? null;
  const coOpCore = coOpSnapshot?.state.core ?? null;
  const coOpResources = coOpSnapshot?.state.resources ?? null;
  const coOpRepairTarget = coOpCore && coOpCore.health < coOpCore.maxHealth
    ? "core"
    : coOpSnapshot?.state.sentries.find((sentry) => sentry.health < sentry.maxHealth)?.id ?? null;
  const coOpReserveAgentId = coOpSnapshot?.state.warband.agents[0] ?? null;
  const coOpSentryCount = coOpSnapshot?.state.sentries.length ?? 0;
  const coOpSentryCost = 80 + coOpSentryCount * 35;
  const coOpWorldPosition = (x: number, y: number) => ({
    left: `${Math.max(5, Math.min(95, 50 + x * 3.9))}%`,
    top: `${Math.max(8, Math.min(92, 50 + y * 3.9))}%`,
  });
  const coOpRecruited = new Set(coOpSnapshot?.state.warband.agents ?? []);
  const coOpCanAct = coOpActive && coOpConnectionState === "playing" && coOpSnapshot?.state.wave.status === "playing";
  const coOpWarbandLimit = coOpSnapshot?.state.warband.maxAgents ?? 8;
  const coOpEmpState = localCoOpPlayer?.emp ?? null;
  const coOpEmpReady = Boolean(
    coOpCanAct &&
      coOpEmpState &&
      canFireEmp(coOpEmpState),
  );
  const coOpBreachThreatCount = coOpSnapshot?.state.enemies.filter((enemy) =>
    coOpCore
      ? Math.hypot(enemy.x, enemy.y) <= 4.5
      : false,
  ).length ?? 0;
  const coOpRecruitmentNeed = coOpSnapshot
    ? getRecruitmentNeed({
        coreHp: coOpCore?.health ?? 0,
        coreMaxHp: coOpCore?.maxHealth ?? 1,
        operatorHp: localCoOpPlayer?.operator.health ?? 0,
        operatorMaxHp: localCoOpPlayer?.operator.maxHealth ?? 1,
        breachThreatCount: coOpBreachThreatCount,
        activeThreatCount: coOpSnapshot.state.enemies.length,
      })
    : null;
  const coOpRecruitmentAdvice = coOpSnapshot
    ? (getRecruitmentAdvice({
        coreHp: coOpCore?.health ?? 0,
        coreMaxHp: coOpCore?.maxHealth ?? 1,
        operatorHp: localCoOpPlayer?.operator.health ?? 0,
        operatorMaxHp: localCoOpPlayer?.operator.maxHealth ?? 1,
        threatCount: coOpBreachThreatCount,
        activeAgents: coOpRecruited.size,
        maxAgents: coOpWarbandLimit,
        compute: coOpResources?.compute ?? 0,
        components: coOpResources?.components ?? 0,
        shards: coOpResources?.shards ?? 0,
        candidates: getRecruitmentCandidates(
          coOpRecruited.size,
          coOpRecruitmentNeed,
        ),
      }) as RecruitmentAdvice)
    : null;
  const coOpRecruitPromptAgentId =
    coOpCanAct && coOpRecruitmentAdvice?.state === "recruit"
      ? coOpRecruitmentAdvice.agentId
      : null;
  const coOpRecruitPromptKey = coOpRecruitPromptAgentId
    ? `${coOpPlayerId ?? "co-op"}:${coOpRecruitPromptAgentId}`
    : null;
  const coOpRecruitPromptDismissed = coOpRecruitPromptKey !== null &&
    coOpRecruitPromptDismissedKey === coOpRecruitPromptKey;
  const coOpRecruitPrompt =
    coOpRecruitPromptAgentId && !coOpRecruitPromptDismissed
      ? coOpRecruitmentAdvice
      : null;
  const coOpEmpPromptSessionKey = coOpPlayerId ?? null;
  const coOpEmpPromptDismissed = coOpEmpPromptDismissedState.sessionKey === coOpEmpPromptSessionKey &&
    coOpEmpPromptDismissedState.dismissed;
  const coOpSnapshotId = coOpSnapshot?.snapshotId ?? null;
  const coOpEmpActionPending = coOpEmpActionPendingSnapshot.sessionKey === coOpEmpPromptSessionKey &&
    coOpEmpActionPendingSnapshot.snapshotId !== null &&
    coOpSnapshotId === coOpEmpActionPendingSnapshot.snapshotId;
  const recruitPrompt = coOpActive ? coOpRecruitPrompt : hud.recruitPrompt;
  const empPromptVisible = coOpActive
    ? coOpEmpReady && !coOpEmpPromptDismissed && !coOpEmpActionPending
    : mode === "playing" && hud.intermissionMs <= 0 && hud.empReadyPrompt;
  const displayEmpCharge = coOpActive
    ? coOpEmpState && coOpEmpState.maxCharge > 0
      ? coOpEmpState.charge / coOpEmpState.maxCharge
      : 0
    : hud.empCharge;
  const displayEmpCooldownLeftMs = coOpActive
    ? coOpEmpState?.cooldownLeftMs ?? 0
    : hud.empCooldownLeftMs;
  const toCoOpPriority = (command: SquadCommand): "follow" | "guard" | "focus" =>
    command === "defend" || command === "auto" ? "guard" : command;
  const displayHp = coOpActive ? Math.round(localCoOpPlayer?.operator.health ?? 0) : hud.hp;
  const displayMaxHp = coOpActive ? Math.round(localCoOpPlayer?.operator.maxHealth ?? 0) : hud.maxHp;
  const displayCore = coOpActive ? Math.round(coOpCore?.health ?? 0) : hud.core;
  const displayMaxCore = coOpActive ? Math.round(coOpCore?.maxHealth ?? 0) : hud.maxCore;
  const displayWave = coOpActive ? (coOpSnapshot?.state.wave.number ?? 1) : hud.wave;
  const displayEnemies = coOpActive ? (coOpSnapshot?.state.enemies.length ?? 0) : hud.enemies;
  const displayWarbandCount = coOpActive ? coOpRecruited.size : hud.warbandCount;
  const displayZone = coOpActive ? "CO-OP GRID" : hud.currentZone;

  const sendCoOpAction = useCallback((action: CoOpAction) => {
    if (!coOpActive) return false;
    return Boolean(onCoOpAction?.(action));
  }, [coOpActive, onCoOpAction]);

  const triggerCoOpEmp = useCallback(() => {
    if (!coOpEmpReady || coOpEmpActionPending) return false;
    const sent = sendCoOpAction({ action: "emp" });
    if (sent) {
      setCoOpEmpActionPendingSnapshot({
        sessionKey: coOpEmpPromptSessionKey,
        snapshotId: coOpSnapshotId,
      });
      setCoOpEmpPromptDismissedState({
        sessionKey: coOpEmpPromptSessionKey,
        dismissed: false,
      });
    }
    return sent;
  }, [coOpEmpActionPending, coOpEmpPromptSessionKey, coOpEmpReady, coOpSnapshotId, sendCoOpAction]);

  useEffect(() => {
    recruitmentAdvisorChangeRef.current = onRecruitmentAdvisorChange;
  }, [onRecruitmentAdvisorChange]);

  useEffect(() => {
    if (!coOpSnapshot) return;
    if (latestCoOpSnapshotRef.current?.snapshotId === coOpSnapshot.snapshotId) return;
    setPreviousCoOpSnapshot(latestCoOpSnapshotRef.current);
    latestCoOpSnapshotRef.current = coOpSnapshot;
    const receivedAt = Date.now();
    setCoOpSnapshotReceivedAt(receivedAt);
    setCoOpClock(receivedAt);
    const interpolationTimer = window.setTimeout(() => setCoOpClock(Date.now()), 160);
    const staleTimer = window.setTimeout(() => setCoOpClock(Date.now()), 2_010);
    return () => {
      window.clearTimeout(interpolationTimer);
      window.clearTimeout(staleTimer);
    };
  }, [coOpSnapshot]);

  useEffect(() => {
    if (!coOpActive || !coOpClient) return;
    const pressed = new Set<string>();
    let aimX = 0;
    let aimY = 1;
    let touchPointerId: number | null = null;
    let touchStartX = 0;
    let touchStartY = 0;
    const sendInput = () => {
      const moveX = Number(pressed.has("KeyD")) - Number(pressed.has("KeyA"));
      const moveY = Number(pressed.has("KeyS")) - Number(pressed.has("KeyW"));
      coOpClient.sendInput({ moveX, moveY, aimX, aimY });
    };
    const updateAim = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      aimX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      aimY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      sendInput();
    };
    const sendCoOpTouchInput = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      aimX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      aimY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      const movementRadius = Math.max(48, Math.min(bounds.width, bounds.height) * 0.16);
      const deltaX = event.clientX - touchStartX;
      const deltaY = event.clientY - touchStartY;
      const distance = Math.hypot(deltaX, deltaY);
      const scale = distance > movementRadius ? movementRadius / distance : 1;
      coOpClient.sendInput({
        moveX: Math.max(-1, Math.min(1, deltaX * scale / movementRadius)),
        moveY: Math.max(-1, Math.min(1, deltaY * scale / movementRadius)),
        aimX,
        aimY,
      });
    };
    const onCoOpPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || event.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      touchPointerId = event.pointerId;
      touchStartX = event.clientX;
      touchStartY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      sendCoOpTouchInput(event);
    };
    const onCoOpPointerMove = (event: PointerEvent) => {
      if (event.pointerId === touchPointerId) {
        sendCoOpTouchInput(event);
        return;
      }
      updateAim(event);
    };
    const releaseCoOpTouch = (event: PointerEvent) => {
      if (event.pointerId !== touchPointerId) return;
      touchPointerId = null;
      coOpClient.sendInput({ moveX: 0, moveY: 0, aimX, aimY });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyR" && !event.repeat) {
        triggerCoOpEmp();
        return;
      }
      if (!/^(KeyW|KeyA|KeyS|KeyD)$/.test(event.code)) return;
      pressed.add(event.code);
      sendInput();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!/^(KeyW|KeyA|KeyS|KeyD)$/.test(event.code)) return;
      pressed.delete(event.code);
      sendInput();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const canvas = canvasRef.current;
    canvas?.addEventListener("pointerdown", onCoOpPointerDown);
    canvas?.addEventListener("pointermove", onCoOpPointerMove, { passive: true });
    canvas?.addEventListener("pointerup", releaseCoOpTouch);
    canvas?.addEventListener("pointercancel", releaseCoOpTouch);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (touchPointerId !== null) coOpClient.sendInput({ moveX: 0, moveY: 0, aimX, aimY });
      canvas?.removeEventListener("pointerdown", onCoOpPointerDown);
      canvas?.removeEventListener("pointermove", onCoOpPointerMove);
      canvas?.removeEventListener("pointerup", releaseCoOpTouch);
      canvas?.removeEventListener("pointercancel", releaseCoOpTouch);
    };
  }, [coOpActive, coOpClient, triggerCoOpEmp]);

  useEffect(() => {
    if (readStoredValue(TUTORIAL_STORAGE_KEY) !== "1") return;
    const timer = window.setTimeout(() => setTutorialComplete(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hud.sessionMode !== "watch") {
      const timer = window.setTimeout(
        () => setWatchActivityExpanded(false),
        0,
      );
      return () => window.clearTimeout(timer);
    }
  }, [hud.sessionMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const callbacks: GameCallbacks = {
      onMode: setMode,
      onHud: (nextHud) => {
        setHud(nextHud);
        setAudioSettings(engineRef.current?.getAudioSettings() ?? INITIAL_AUDIO_SETTINGS);
        recruitmentAdvisorChangeRef.current({
          recruitmentAdvice: nextHud.recruitmentAdvice,
          resources: {
            compute: nextHud.data,
            components: nextHud.loot.components,
            shards: nextHud.loot.shards,
          },
          sessionMode: nextHud.sessionMode,
          watchPriority: nextHud.watchPriority,
        });
      },
      onTutorialComplete: () => {
        setTutorialComplete(true);
        writeStoredValue(TUTORIAL_STORAGE_KEY, "1");
      },
      onToast: (nextToast) => {
        setToast({ ...nextToast, id: Date.now() });
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 3800);
      },
    };
    let engine: GameController;
    try {
      engine = new FreemanEngine(canvas, callbacks);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "WEBGL_UNAVAILABLE") {
        throw error;
      }
      engine = new FreemanCanvasEngine(canvas, callbacks);
    }
    engineRef.current = engine;
    const audioSettingsTimer = window.setTimeout(() => {
      setAudioSettings(engine.getAudioSettings());
    }, 0);
    return () => {
      window.clearTimeout(audioSettingsTimer);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setCoOpPresentation(coOpActive);
  }, [coOpActive]);

  useEffect(() => {
    if (!coOpPlayerId) {
      coOpStartRef.current = null;
      latestCoOpSnapshotRef.current = null;
      return;
    }
    if (coOpStartRef.current === coOpPlayerId || !engineRef.current) return;
    coOpStartRef.current = coOpPlayerId;
    engineRef.current.start({ tutorial: false });
  }, [coOpPlayerId]);

  const toggleAudio = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (audioSettings.playback === "blocked") {
      engine.enableAudio();
    } else {
      engine.setMuted(!audioSettings.muted);
    }
    setAudioSettings(engine.getAudioSettings());
  };

  const openHelp = () => {
    if (mode === "playing") {
      engineRef.current?.togglePause();
      helpPausedGameRef.current = true;
    }
    setHelpOpen(true);
  };

  const closeHelp = () => {
    setHelpOpen(false);
    if (helpPausedGameRef.current) {
      engineRef.current?.togglePause();
      helpPausedGameRef.current = false;
    }
  };

  const toggleCombatOverlay = useCallback((panel: CombatOverlay) => {
    const closing = overlayState.active === panel;
    const opening = overlayState.active === "closed";

    if (hud.sessionMode === "campaign" && !coOpActive) {
      if (opening && mode === "playing") {
        engineRef.current?.togglePause();
        engineRef.current?.setCombatOverlayOpen(true);
        overlayPausedCampaignRef.current = true;
      } else if (closing) {
        engineRef.current?.setCombatOverlayOpen(false);
        if (overlayPausedCampaignRef.current && mode === "paused") {
          engineRef.current?.togglePause();
        }
        overlayPausedCampaignRef.current = false;
      }
    }
    onToggleOverlay(panel);
  }, [coOpActive, hud.sessionMode, mode, onToggleOverlay, overlayState.active]);

  const focusRecruitment = (advice: RecruitmentAdvice, resources: RecruitmentResources) => {
    onRecruitmentAdvisorChange({
      recruitmentAdvice: advice,
      resources,
      sessionMode: hud.sessionMode,
      watchPriority: hud.watchPriority,
    });
    setMobilePanel("command");
    setMobileSquadOpen(true);
    if (overlayState.active !== "warband") toggleCombatOverlay("warband");
  };

  useEffect(() => {
    if (
      advisorRequestKey <= 0 ||
      advisorRequestHandledRef.current === advisorRequestKey
    ) {
      return;
    }
    advisorRequestHandledRef.current = advisorRequestKey;
    setMobilePanel("command");
    setMobileSquadOpen(true);
    if (overlayState.active !== "warband") {
      toggleCombatOverlay("warband");
    }
  }, [
    advisorAgentId,
    advisorRequestKey,
    overlayState.active,
    toggleCombatOverlay,
  ]);

  const isOverlay = mode !== "playing";
  const canRecruitWarband = canRecruitPersistentWarband(mode);
  const workshopActive = mode === "upgrade" || mode === "evolution";
  const canBuildSentry = coOpActive
    ? Boolean(
        coOpCanAct &&
          coOpResources &&
          coOpSentryCount < 3 &&
          coOpResources.compute >= coOpSentryCost,
      )
    : mode === "playing" &&
      hud.defenses < hud.maxDefenses &&
      hud.data >= hud.defenseCost;
  const canRecruitAgent = Boolean(
    coOpActive
      ? coOpCanAct && coOpRecruited.size < coOpWarbandLimit
      : mode === "playing" && canRecruitWarband && hud.nextRecruitCost,
  );
  const getAgentStatus = (agentId: AgentId) => {
    if (coOpActive) return coOpRecruited.has(agentId) ? "ACTIVE" : "AVAILABLE";
    if (!hud.agents[agentId]) return "AVAILABLE";
    const skill = hud.skills[agentId as EvolutionAgentId];
    if (skill?.status === "offline") return "OFFLINE";
    if (skill?.status === "repair" || skill?.status === "retreat") return "REPAIRING";
    if (hud.command === "auto") return "GATHERING";
    return "FIGHTING";
  };
  const getAgentShortStatus = (agentId: AgentId) => {
    const status = getAgentStatus(agentId);
    return {
      ACTIVE: "READY",
      AVAILABLE: "READY",
      OFFLINE: "OFFLINE",
      REPAIRING: "REPAIR",
      GATHERING: "GATHER",
      FIGHTING: "FIGHT",
    }[status] ?? status;
  };
  const agentRankSummary = AGENTS.filter((agent) => hud.agents[agent.id])
    .map((agent) => {
      const componentRanks = (AGENT_COMPONENT_UPGRADES[agent.id] ?? []).reduce(
        (total: number, upgrade: { id: string }) =>
          total + getComponentRank(hud.componentUpgradeRanks, agent.id, upgrade.id),
        0,
      );
      return `${agent.code} ${hud.evolutions[agent.id as EvolutionAgentId] ? "II" : "I"}${componentRanks ? ` +${componentRanks}` : ""}`;
    })
    .join(" · ") || "NO AGENTS";
  const tutorial =
    hud.tutorialStep &&
    hud.tutorialStep !== "complete" &&
    hud.tutorialStep !== "skipped"
      ? TUTORIAL_COPY[hud.tutorialStep]
      : null;
  const cinemaActive = mode === "playing" && hud.sessionMode === "watch" && hud.cinemaCleanView;
  const commandMapVisible = mode === "playing" && !coOpActive && cameraPresentation === "command";
  const commandMapPosition = (x: number, z: number) => ({
    left: `${Math.max(4, Math.min(96, 50 + x * 2.65))}%`,
    top: `${Math.max(9, Math.min(91, 50 + z * 2.65))}%`,
  });
  const commandMapFixedIds = new Set([
    "core",
    "repair-bay",
    "compute-node",
    "north-breach",
    "south-breach",
    "boss-portal",
  ]);
  const commandMapReservedKinds = new Set(["agent", "sub-agent", "sentry", "boss"]);
  const commandMapMarkerSort = (first: HudState["commandMap"][number], second: HudState["commandMap"][number]) =>
    Number(commandMapFixedIds.has(second.id)) - Number(commandMapFixedIds.has(first.id)) ||
    Number(commandMapReservedKinds.has(second.kind)) - Number(commandMapReservedKinds.has(first.kind)) ||
    second.priority - first.priority;
  const commandMapMarkers = [
    ...hud.commandMap
      .filter((marker) => commandMapFixedIds.has(marker.id) || commandMapReservedKinds.has(marker.kind))
      .sort(commandMapMarkerSort),
    ...hud.commandMap
      .filter((marker) => !commandMapFixedIds.has(marker.id) && !commandMapReservedKinds.has(marker.kind))
      .sort(commandMapMarkerSort),
  ].slice(0, 64);
  const cycleCinemaSpeed = () => {
    const speeds = [0.5, 1, 2, 4];
    const currentIndex = speeds.indexOf(hud.cinemaSpeed);
    engineRef.current?.setCinemaSpeed(speeds[(currentIndex + 1) % speeds.length]);
  };
  const startGame = (options: StartOptions) => {
    setCameraPresentation("macro");
    engineRef.current?.start(options);
  };

  useEffect(() => {
    const applyCameraPresentation = () => {
      const isMobile = window.matchMedia("(max-width: 820px)").matches;
      engineRef.current?.setCameraPresentation(
        isMobile || cameraPresentation === "command" ? cameraPresentation : "macro",
      );
    };
    applyCameraPresentation();
    window.addEventListener("resize", applyCameraPresentation);
    return () => window.removeEventListener("resize", applyCameraPresentation);
  }, [cameraPresentation]);

  useEffect(() => {
    const onCinemaKey = (event: KeyboardEvent) => {
      if (mode !== "playing" || event.repeat) return;
      if (event.code === "KeyC") {
        if (coOpActive) return;
        event.preventDefault();
        setCameraPresentation((presentation) => presentation === "command" ? "macro" : "command");
      }
      if (hud.sessionMode !== "watch") return;
      if (event.code === "KeyP") {
        event.preventDefault();
        engineRef.current?.toggleCinemaPause();
      }
      if (event.code === "KeyV") {
        event.preventDefault();
        engineRef.current?.toggleCinemaCleanView();
      }
    };
    window.addEventListener("keydown", onCinemaKey);
    return () => window.removeEventListener("keydown", onCinemaKey);
  }, [coOpActive, hud.sessionMode, mode]);

  useEffect(() => {
    if (mode !== "playing") {
      const tutorialRequiresCommand = hud.tutorialStep === "recruit";
      const timer = window.setTimeout(() => {
        setMobilePanel(tutorialRequiresCommand ? "command" : "closed");
        setMobileSquadOpen(tutorialRequiresCommand);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [hud.tutorialStep, mode]);

  useEffect(() => {
    const open =
      hud.tutorialStep === "recruit"
        ? true
        : hud.tutorialStep === "observe" || hud.tutorialStep === "complete"
          ? false
          : null;
    if (open === null) return;
    const timer = window.setTimeout(() => {
      setMobileSquadOpen(open);
      if (open) setMobilePanel("command");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hud.tutorialStep]);

  return (
    <main
      className={`game-shell mode-${mode} ${cinemaActive ? "is-cinema" : ""} ${commandMapVisible ? "is-command-map" : ""}`}
      data-co-op-authoritative={coOpActive || undefined}
    >
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        aria-label="Freeman Protocol isometric combat arena"
      />

      {commandMapVisible && (
        <aside className="command-map-layer" aria-label="Command Map">
          <div className="command-map-layer__header">
            <span>
              <small>COMMAND MAP</small>
              <strong>{hud.battlegroundId.replaceAll("-", " ").toUpperCase()}</strong>
            </span>
            <button
              type="button"
              className="command-map-layer__close"
              onClick={() => setCameraPresentation("macro")}
            >
              EXIT MAP
            </button>
          </div>
          <div className="command-map-layer__legend" aria-label="Map legend">
            <span><i className="is-core" />CORE</span>
            <span><i className="is-repair" />REPAIR</span>
            <span><i className="is-compute" />COMPUTE</span>
            <span><i className="is-breach" />BREACH</span>
            <span><i className="is-agent" />AGENT</span>
            <span><i className="is-loot" />LOOT</span>
            <span className="command-map-legend__optional"><i className="is-sentry" />SENTRY</span>
            <span className="command-map-legend__optional"><i className="is-boss" />BOSS</span>
            <span className="command-map-legend__optional"><i className="is-portal" />PORTAL</span>
            <span className="command-map-legend__optional"><i className="is-threat" />THREAT</span>
          </div>
          <div className="command-map-layer__markers">
            {commandMapMarkers.map((marker) => {
              const markerAgentId = marker.kind === "agent"
                ? marker.id.replace(/^agent-/, "")
                : "";
              const agentVisual = markerAgentId
                ? getAgentVisual(markerAgentId)
                : null;
              return (
                <button
                  key={marker.id}
                  type="button"
                  className={`command-map-marker command-map-marker--${marker.kind}`}
                  style={commandMapPosition(marker.x, marker.z)}
                  title={`${marker.label} · ${marker.status}`}
                  onClick={() => engineRef.current?.focusCommandMarker(marker.id)}
                >
                  {agentVisual ? (
                    <span className="command-map-marker__portrait">
                      <AgentPortrait agentId={markerAgentId} size="sm" decorative />
                    </span>
                  ) : (
                    <i />
                  )}
                  <small>{marker.label}</small>
                </button>
              );
            })}
          </div>
          <p className="command-map-layer__hint">Tap a marker to keep the battlefield in focus · C toggles map</p>
        </aside>
      )}

      {coOpActive && (
        <section className="co-op-world" aria-label="Authoritative co-op arena">
          <div className="co-op-world__grid" aria-hidden="true" />
          <div className="co-op-world__lane co-op-world__lane--west" aria-hidden="true" />
          <div className="co-op-world__lane co-op-world__lane--east" aria-hidden="true" />
          <div className="co-op-world__core" style={coOpWorldPosition(0, 0)}>
            <i />
            <span>CORE</span>
          </div>
          {coOpSnapshot && (
            <>
              {coOpSnapshot.state.loot.map((item) => {
                const position = interpolateCoOpPosition(item, previousCoOpSnapshot?.state.loot);
                return (
                  <div
                    className={`co-op-world__loot co-op-world__loot--${item.type}`}
                    key={item.id}
                    style={coOpWorldPosition(position.x, position.y)}
                    title={`${item.type} +${item.value}`}
                  >
                    <i />
                    <small>{item.type}</small>
                  </div>
                );
              })}
              {coOpSnapshot.state.sentries.map((sentry) => {
                const position = interpolateCoOpPosition(sentry, previousCoOpSnapshot?.state.sentries);
                return (
                  <div
                    className="co-op-world__sentry"
                    key={sentry.id}
                    style={coOpWorldPosition(position.x, position.y)}
                    title={`Sentry ${Math.round(sentry.health)}/${Math.round(sentry.maxHealth)}`}
                  >
                    <i />
                    <b style={{ width: `${clamp01(sentry.health / sentry.maxHealth) * 100}%` }} />
                  </div>
                );
              })}
              {coOpSnapshot.state.warband.agents.map((agentId, index) => {
                const angle = index * 2.399963229728653;
                const radius = 2.4 + (index % 2) * 0.6;
                return (
                  <div
                    className="co-op-world__agent"
                    key={agentId}
                    style={coOpWorldPosition(Math.cos(angle) * radius, Math.sin(angle) * radius)}
                    title={`${agentId.toUpperCase()} autonomous agent`}
                  >
                    <span className="co-op-world__agent-avatar">
                      <AgentPortrait agentId={agentId} size="sm" decorative />
                    </span>
                    <small className="sr-only">{agentId.toUpperCase()}</small>
                  </div>
                );
              })}
              {coOpSnapshot.state.subAgents.map((subAgent, index) => {
                const angle = index * 1.5707963267948966 + 0.6;
                const radius = 3.6 + (index % 3) * 0.35;
                return (
                  <div
                    className="co-op-world__sub-agent"
                    key={subAgent.id}
                    style={coOpWorldPosition(Math.cos(angle) * radius, Math.sin(angle) * radius)}
                    title={`${subAgent.role} sub-agent · ${Math.ceil(subAgent.remainingMs / 1_000)}s`}
                  />
                );
              })}
              {coOpSnapshot.state.players.map((player) => {
                const operator = player.id === remoteCoOpPlayer?.id && remoteOperator
                  ? remoteOperator
                  : player.operator;
                return (
                  <div
                    className={`co-op-world__operator ${player.id === coOpPlayerId ? "is-local" : "is-remote"} ${!player.connected ? "is-disconnected" : ""}`}
                    key={player.id ?? player.name ?? "operator"}
                    style={coOpWorldPosition(operator.x, operator.y)}
                  >
                    <i />
                    <b style={{ width: `${clamp01(operator.health / operator.maxHealth) * 100}%` }} />
                    <small>{player.id === coOpPlayerId ? "YOU" : player.name ?? "ALLY"}</small>
                  </div>
                );
              })}
              {coOpSnapshot.state.enemies.map((enemy) => {
                const position = interpolateCoOpPosition(enemy, previousCoOpSnapshot?.state.enemies);
                return (
                  <div
                    className={`co-op-world__enemy co-op-world__enemy--${enemy.kind}`}
                    key={enemy.id}
                    style={coOpWorldPosition(position.x, position.y)}
                    title={`${enemy.kind} ${Math.round(enemy.health)}/${Math.round(enemy.maxHealth)}`}
                  >
                    <i />
                    <b style={{ width: `${clamp01(enemy.health / enemy.maxHealth) * 100}%` }} />
                  </div>
                );
              })}
              {coOpSnapshot.state.boss && (
                (() => {
                  const boss = coOpSnapshot.state.boss;
                  const position = interpolateCoOpPosition(
                    boss,
                    previousCoOpSnapshot?.state.boss ? [previousCoOpSnapshot.state.boss] : undefined,
                  );
                  return (
                    <div
                      className="co-op-world__boss"
                      style={coOpWorldPosition(position.x, position.y)}
                      title={`${boss.kind} ${Math.round(boss.health)}/${Math.round(boss.maxHealth)}`}
                    >
                      <i />
                      <b style={{ width: `${clamp01(boss.health / boss.maxHealth) * 100}%` }} />
                      <small>{boss.kind}</small>
                    </div>
                  );
                })()
              )}
            </>
          )}
          <aside className="co-op-world__hud" aria-label="Authoritative co-op status">
            <span><small>CORE</small><strong>{displayCore}/{displayMaxCore}</strong></span>
            <span><small>COMPUTE</small><strong>{coOpResources?.compute ?? 0}</strong></span>
            <span><small>TEAM</small><strong>{displayWarbandCount}/{coOpWarbandLimit}</strong></span>
            <span><small>HOSTILES</small><strong>{displayEnemies}</strong></span>
          </aside>
        </section>
      )}

      <div className="atmosphere" aria-hidden="true" />
      <div className="frame-corners" aria-hidden="true" />

      <header className="hud-top combat-hud">
        <div className="combat-hud__status" aria-label={`Encounter ${displayWave} of ${TOTAL_WAVES}`}>
          <span><small>HP</small><strong>{displayHp}/{displayMaxHp}</strong></span>
          <span><small>CORE</small><strong>{displayCore}/{displayMaxCore}</strong></span>
          <span><small>WAVE</small><strong>{displayWave}/{TOTAL_WAVES}</strong></span>
          <span className="combat-hud__zone"><small>ZONE</small><strong>{displayZone}</strong></span>
        </div>

        <div className="combat-hud__toggles">
          {(["intel", "warband", "actions"] as const).map((panel) => (
            <button
              type="button"
              key={panel}
              className={overlayState.active === panel ? "is-active" : ""}
              onClick={() => toggleCombatOverlay(panel)}
              disabled={
                mode !== "playing" &&
                !(mode === "paused" && overlayState.active === panel)
              }
              aria-pressed={overlayState.active === panel}
            >
              {panel.toUpperCase()}
            </button>
          ))}
        </div>

        {mode !== "intro" && (
          <div className="combat-hud__advisor">
            {recruitmentAdvisor}
          </div>
        )}

        <div className="hud-actions">
          <a href="/asset-catalog">ASSET LEDGER</a>
          {mode === "playing" && !coOpActive && hud.sessionMode !== "watch" && (
            <button
              type="button"
              className="desktop-command-map-action"
              aria-pressed={commandMapVisible}
              onClick={() => setCameraPresentation(commandMapVisible ? "macro" : "command")}
            >
              {commandMapVisible ? "EXIT MAP" : "COMMAND MAP"}
            </button>
          )}
          <button type="button" onClick={openHelp}>
            CONTROLS
          </button>
          <button type="button" onClick={toggleAudio} aria-pressed={audioSettings.muted}>
            {audioSettings.muted
              ? "AUDIO OFF"
              : audioSettings.playback === "blocked"
                ? "TAP TO ENABLE AUDIO"
                : "AUDIO ON"}
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.togglePause()}
            disabled={
              mode === "intro" ||
              mode === "defeat" ||
              mode === "victory" ||
              (hud.sessionMode === "campaign" && overlayState.active !== "closed")
            }
          >
            {mode === "paused" ? "RESUME" : "PAUSE"}
          </button>
          {hud.sessionMode === "watch" && (
            <button
              type="button"
              className="watch-end-button"
              onClick={() => {
                setCameraPresentation("macro");
                engineRef.current?.endWatchRun();
              }}
            >
              END RUN
            </button>
          )}
          {coOpActive && onCoOpLeave && (
            <button
              type="button"
              className="co-op-leave-button"
              onClick={() => {
                setCameraPresentation("macro");
                onCoOpLeave?.();
              }}
            >
              END CO-OP RUN
            </button>
          )}
        </div>
      </header>

      {coOpActive && (
        <aside className="co-op-remote-status" aria-label="Remote co-op operator">
          <span>
            <small>REMOTE OPERATOR</small>
            <strong>{remoteCoOpPlayer?.name ?? "RECONNECTING"}</strong>
          </span>
          <span>
            <small>STATUS</small>
            <strong>
              {remoteCoOpPlayer?.connected
                ? `${Math.round(remoteOperator?.health ?? 0)}/${Math.round(remoteOperator?.maxHealth ?? 0)} HP`
                : "RECONNECTING"}
            </strong>
          </span>
          {remoteOperator && (
            <span className="co-op-remote-status__position">
              X {remoteOperator.x.toFixed(1)} · Y {remoteOperator.y.toFixed(1)}
            </span>
          )}
        </aside>
      )}

      {coOpActive && (
        <p
          className={`co-op-connection-strip ${coOpSnapshotStale ? "is-stale" : ""}`}
          role="status"
          aria-live="polite"
        >
          {coOpSnapshotStale
            ? "NETWORK STALE — HOLDING LAST SNAPSHOT"
            : `CO-OP ${coOpConnectionState.toUpperCase()}`}
        </p>
      )}

      {mode === "playing" && recruitPrompt && (
        <aside
          className="combat-prompt combat-prompt--recruit"
          role="status"
          aria-live="polite"
          aria-label="AI recruit ready"
        >
          <div className="combat-prompt__copy">
            <small>AI RECRUIT READY</small>
            <strong>{recruitPrompt.title}</strong>
            <span>{recruitPrompt.detail}</span>
            <span className="combat-prompt__cost">
              COST · {formatRecruitmentCost(recruitPrompt.cost)}
            </span>
          </div>
          <button
            type="button"
            className="combat-prompt__action"
            onClick={() => {
              if (!recruitPrompt?.agentId) return;
              const advice = recruitPrompt;
              focusRecruitment(
                advice,
                coOpActive
                  ? {
                      compute: coOpResources?.compute ?? 0,
                      components: coOpResources?.components ?? 0,
                      shards: coOpResources?.shards ?? 0,
                    }
                  : {
                      compute: hud.data,
                      components: hud.loot.components,
                      shards: hud.loot.shards,
                    },
              );
              if (coOpActive) {
                if (coOpRecruitPromptKey) setCoOpRecruitPromptDismissedKey(coOpRecruitPromptKey);
              } else {
                engineRef.current?.dismissRecruitPrompt();
              }
            }}
          >
            RECRUIT NOW
          </button>
          <button
            type="button"
            className="combat-prompt__dismiss"
            aria-label="Dismiss recruit prompt"
            onClick={() => {
              if (coOpActive) {
                if (coOpRecruitPromptKey) setCoOpRecruitPromptDismissedKey(coOpRecruitPromptKey);
              } else {
                engineRef.current?.dismissRecruitPrompt();
              }
            }}
          >
            ×
          </button>
        </aside>
      )}

      {mode === "playing" && empPromptVisible && (
        <aside
          className="combat-prompt combat-prompt--emp"
          role="status"
          aria-live="polite"
          aria-label="EMP ready"
        >
          <div className="combat-prompt__copy">
            <small>EMP SYSTEM CHARGED</small>
            <strong>EMP READY</strong>
            <span>Disrupt nearby threats with a tap, click, or press R.</span>
          </div>
          <button
            type="button"
            className="combat-prompt__action"
            onClick={() => {
              if (coOpActive) {
                triggerCoOpEmp();
              } else engineRef.current?.activateEmp();
            }}
          >
            EMP PULSE
          </button>
          <button
            type="button"
            className="combat-prompt__dismiss"
            aria-label="Dismiss EMP ready prompt"
            onClick={() => {
              if (coOpActive) {
                setCoOpEmpPromptDismissedState({
                  sessionKey: coOpEmpPromptSessionKey,
                  dismissed: true,
                });
              }
              else engineRef.current?.dismissEmpPrompt();
            }}
          >
            ×
          </button>
        </aside>
      )}

      {mode !== "intro" && (
        <>
          {overlayState.active !== "closed" && (
            <button
              type="button"
              className="combat-overlay-backdrop"
              aria-label="Close combat overlay"
              onClick={() => toggleCombatOverlay(overlayState.active as CombatOverlay)}
            />
          )}
          {hud.intermissionMs > 0 && (
            <div className="wave-intermission-banner" role="status">
              <small>WAVE {hud.wave} CLEARED</small>
              <strong>NETWORK RECONFIGURING · NEXT WAVE IN {Math.ceil(hud.intermissionMs / 1_000)}S</strong>
            </div>
          )}

          {hud.sessionMode === "watch" && (
            <aside className="watch-panel" aria-label="Autonomous watch mode">
              <div className="watch-panel__header">
                <span>
                  <small>WATCH MODE</small>
                    <strong>{hud.watchPaused || hud.cinemaPaused ? "PAUSED" : "AUTONOMOUS RUNNING"}</strong>
                </span>
                <span>
                  <small>SURVIVAL</small>
                  <strong>{Math.floor(hud.survivalMs / 1_000)}s</strong>
                </span>
              </div>
              <div className="watch-panel__metrics">
                <span><small>WAVE</small><b>{hud.wave}</b></span>
                <span><small>INCOME</small><b>{hud.sessionIncome.compute} C</b></span>
                <span><small>AGENTS</small><b>{hud.warbandCount}/{hud.maxWarband}</b></span>
                <span><small>CORE</small><b>{hud.core}/{hud.maxCore}</b></span>
                <span><small>COMPONENTS</small><b>{hud.loot.components}</b></span>
                <span><small>SHARDS</small><b>{hud.loot.shards}</b></span>
              </div>
              <div className="watch-panel__activity" aria-label="Live AI activity">
                <div className="watch-panel__activity-heading">
                  <small>LIVE AI ACTIVITY</small>
                  <button
                    type="button"
                    className="watch-panel__activity-toggle"
                    onClick={() => setWatchActivityExpanded((expanded) => !expanded)}
                    aria-expanded={watchActivityExpanded}
                    aria-controls="watch-activity-log"
                  >
                    {watchActivityExpanded ? "HIDE LOG" : "SHOW LOG"}
                  </button>
                </div>
                <div id="watch-activity-log">
                  {watchActivityExpanded ? (
                    <ol>
                      {hud.autonomyLog.slice(0, 4).map((event, index) => (
                        <li key={`${event}-${index}`} className={index === 0 ? "is-current" : ""}>
                          <span>{index === 0 ? "NOW" : `-${index}`}</span>{event}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="watch-panel__activity-summary">
                      <span className="watch-panel__activity-marker">NOW</span>
                      <span className="watch-panel__activity-event">
                        {hud.autonomyLog[0] ?? hud.lastAutonomyEvent}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <div className="watch-panel__controls">
                <div>
                  <small>SPEED</small>
                  {[1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={hud.watchSpeed === speed ? "is-active" : ""}
                      onClick={() => engineRef.current?.setWatchSpeed(speed)}
                    >
                      {speed}X
                    </button>
                  ))}
                </div>
                <div>
                  <small>PRIORITY</small>
                  {(["survive", "farm", "expand"] as const).map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      className={hud.watchPriority === priority ? "is-active" : ""}
                      onClick={() => engineRef.current?.setWatchPriority(priority)}
                    >
                      {priority.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="watch-panel__cinema-controls" aria-label="Cinema watch controls">
                <div>
                  <small>CINEMA SPEED</small>
                  {[0.5, 1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={hud.cinemaSpeed === speed ? "is-active" : ""}
                      aria-pressed={hud.cinemaSpeed === speed}
                      onClick={() => engineRef.current?.setCinemaSpeed(speed)}
                    >
                      {speed}X
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={hud.cinemaPaused ? "is-active" : ""}
                  aria-pressed={hud.cinemaPaused}
                  onClick={() => engineRef.current?.toggleCinemaPause()}
                >
                  {hud.cinemaPaused ? "RESUME" : "PAUSE"}
                </button>
                <button
                  type="button"
                  className={hud.cinemaCleanView ? "is-active" : ""}
                  aria-pressed={hud.cinemaCleanView}
                  onClick={() => engineRef.current?.toggleCinemaCleanView()}
                >
                  {hud.cinemaCleanView ? "EXIT CINEMA" : "CINEMA"}
                </button>
                <button
                  type="button"
                  className={commandMapVisible ? "is-active" : ""}
                  aria-pressed={commandMapVisible}
                  onClick={() => setCameraPresentation(commandMapVisible ? "macro" : "command")}
                >
                  COMMAND MAP
                </button>
              </div>
              {(hud.watchPaused || hud.cinemaPaused) && (
                <p className="watch-panel__paused" role="status">
                  RUN PAUSED — RETURN TO RESUME
                </p>
              )}
            </aside>
          )}

          {cinemaActive && (
            <aside className="cinema-status" aria-label="Cinema watch controls">
              <span>
                <small>CINEMA WATCH</small>
                <strong>WAVE {hud.wave} · {hud.battlegroundId.replaceAll("-", " ").toUpperCase()}</strong>
              </span>
              <div className="cinema-status__actions">
                <button
                  type="button"
                  aria-label={`Cinema speed ${hud.cinemaSpeed}X`}
                  onClick={cycleCinemaSpeed}
                >
                  {hud.cinemaSpeed}X
                </button>
                <button
                  type="button"
                  aria-pressed={commandMapVisible}
                  onClick={() => setCameraPresentation(commandMapVisible ? "macro" : "command")}
                >
                  {commandMapVisible ? "EXIT MAP" : "MAP"}
                </button>
                <button
                  type="button"
                  aria-pressed={hud.cinemaPaused}
                  onClick={() => engineRef.current?.toggleCinemaPause()}
                >
                  {hud.cinemaPaused ? "RESUME" : "PAUSE"}
                </button>
                <button type="button" className="cinema-exit" onClick={() => engineRef.current?.toggleCinemaCleanView()}>
                  EXIT CINEMA
                </button>
              </div>
            </aside>
          )}

          {hud.boss && (
            <div className="boss-health-banner" role="status">
              <span>
                <small>ARMORED WARBOSS</small>
                <strong>{hud.boss.label}</strong>
              </span>
              <i>
                <b
                  style={{
                    width: `${clamp01(hud.boss.hp / hud.boss.maxHp) * 100}%`,
                  }}
                />
              </i>
              <span>
                <strong>{hud.boss.hp}/{hud.boss.maxHp}</strong>
                <small>
                  {hud.boss.telegraphLeftMs > 0
                    ? "ATTACK TELEGRAPH ACTIVE"
                    : "SLOW · ARMORED · ONE ACTIVE"}
                </small>
              </span>
            </div>
          )}

          {hud.placingDefense && (
            <div className="placement-guide" role="status">
              <small>BUILD MODE</small>
              <strong>TAP A VALID SPOT TO PLACE THE SENTRY</strong>
              <span>
                Keep it near the Core, but not on top of another sentry.
              </span>
            </div>
          )}

          {tutorial && (
            <aside
              className={`tutorial-card ${tutorial.target === "agents" || mobileSquadOpen ? "tutorial-card--above-squad" : ""}`}
              role="status"
            >
              <small>TRAINING OBJECTIVE</small>
              <strong>{tutorial.title}</strong>
              <span>{tutorial.detail}</span>
              <button
                type="button"
                onClick={() => engineRef.current?.skipTutorial()}
              >
                SKIP TUTORIAL
              </button>
            </aside>
          )}

          <aside
            className={`vitals-panel intel-overlay ${overlayState.active === "intel" ? "is-active" : ""}`}
          >
            <p className="panel-label">IAN GOH · NETWORK DEFENDER</p>
            <div className="vital-row">
              <span>YOUR HEALTH</span>
              <strong>
                {hud.hp}
                <small>/{hud.maxHp}</small>
              </strong>
            </div>
            <div className="meter">
              <i style={{ width: `${clamp01(hud.hp / hud.maxHp) * 100}%` }} />
            </div>
            <div className="vital-row core-row">
              <span>CORE HEALTH · PROTECT-ONLY</span>
              <strong>
                {hud.core}
                <small>/{hud.maxCore}</small>
              </strong>
            </div>
            <div className="meter meter--core">
              <i
                style={{ width: `${clamp01(hud.core / hud.maxCore) * 100}%` }}
              />
            </div>
            <div className="resource-grid secondary-telemetry">
              <span>
                <small>COMPUTE</small>
                <strong>{String(hud.data).padStart(3, "0")}</strong>
              </span>
              <span>
                <small>ENEMIES</small>
                <strong>{String(hud.enemies).padStart(2, "0")}</strong>
              </span>
              <span>
                <small>SCORE</small>
                <strong>{hud.score.toLocaleString()}</strong>
              </span>
            </div>
            <section
              className="progression-telemetry secondary-telemetry"
              aria-label="Progression and encounter telemetry"
            >
              <div>
                <small>WARBAND MATERIALS</small>
                <strong>
                  COMPONENTS {hud.loot.components} · SHARDS {hud.loot.shards}
                </strong>
                <span>
                  {hud.nextRecruitCost
                    ? `NEXT: ${hud.nextRecruitCost.compute} COMPUTE · ${hud.nextRecruitCost.components} COMPONENTS · ${hud.nextRecruitCost.shards} SHARDS`
                    : "WARBAND AT FULL CAPACITY"}
                </span>
              </div>
              <div>
                <small>LOOT INVENTORY</small>
                <strong>R {hud.loot.repairs} · C {hud.loot.components} · S {hud.loot.shards}</strong>
                <span>REPAIRS · MODULES · SHARD INVENTORY</span>
              </div>
              <div>
                <small>ARMOR PROFILE</small>
                <strong>{hud.armorId?.toUpperCase() ?? "UNASSIGNED"}</strong>
                <span>{hud.armorId ? ARMOR_COPY[hud.armorId] : "INSTALL AT THE WORKSHOP"}</span>
              </div>
              <div>
                <small>AGENT RANKS</small>
                <strong>{agentRankSummary}</strong>
                <span>RANK · COMPONENT STACKS</span>
              </div>
              <div>
                <small>TEMP SUB-AGENTS</small>
                <strong>{hud.temporarySubAgents}</strong>
                <span>ACTIVE · {MAX_TEMPORARY_SUB_AGENTS_PER_PARENT} MAX PER AGENT</span>
              </div>
              <div>
                <small>TERRAIN SIGNAL</small>
                <strong>{hud.terrainLabel}</strong>
                <span>ENCOUNTER ROUTING MODIFIER</span>
              </div>
              <div>
                <small>EMP RESISTANCE</small>
                <strong>{hud.empResistance}% MAX</strong>
                <span>HIGHEST HOSTILE REDUCTION</span>
              </div>
            </section>
            <button
              type="button"
              className={`base-builder ${hud.placingDefense ? "is-placing" : ""}`}
              onClick={() => {
                if (coOpActive) {
                  sendCoOpAction({ action: "build-sentry" });
                } else {
                  engineRef.current?.buildDefense();
                }
              }}
              disabled={coOpActive ? !canBuildSentry : mode !== "playing" || hud.defenses >= hud.maxDefenses}
            >
              <span>
                <small>
                  {hud.placingDefense ? "MANUAL MODE ACTIVE" : "YOUR BASE"}
                </small>
                <strong>
                  {hud.defenses >= hud.maxDefenses
                    ? "SENTRY GRID COMPLETE"
                    : "AUTO-DEPLOY SENTRY"}
                </strong>
              </span>
              <b>
                {hud.placingDefense
                  ? "CHOOSE A VALID POSITION"
                  : `${hud.defenses}/${hud.maxDefenses}`}
                {!hud.placingDefense && hud.defenses < hud.maxDefenses
                  ? ` · ${hud.defenseCost} COMPUTE`
                  : !hud.placingDefense
                    ? " · ONLINE"
                    : ""}
              </b>
            </button>
            <button
              type="button"
              className="base-builder__manual"
              onClick={() =>
                engineRef.current?.beginManualDefensePlacement()
              }
              disabled={mode !== "playing" || hud.defenses >= hud.maxDefenses}
            >
              {hud.placingDefense ? "CANCEL MANUAL PLACEMENT" : "PLACE MANUALLY"}
              <kbd>SHIFT+B</kbd>
            </button>
            <button
              type="button"
              className="base-builder base-builder--reserve"
              onClick={() => {
                if (coOpActive) {
                  if (coOpReserveAgentId) sendCoOpAction({ action: "deploy-reserve", agentId: coOpReserveAgentId });
                } else {
                  engineRef.current?.deployReserve();
                }
              }}
              disabled={coOpActive
                ? !coOpCanAct || !coOpReserveAgentId || (coOpResources?.components ?? 0) < 3 || (coOpResources?.shards ?? 0) < 3
                : mode !== "playing" || hud.loot.components < 3 || hud.loot.shards < 3}
            >
              <span>
                <small>PLAYER RESERVE</small>
                <strong>DEPLOY TEMP ARMY</strong>
              </span>
              <b>{coOpActive ? coOpResources?.components ?? 0 : hud.loot.components}C · {coOpActive ? coOpResources?.shards ?? 0 : hud.loot.shards}S</b>
            </button>
          </aside>

          <aside className="mobile-status-strip" aria-label="Mission status">
            <span>
              <small>HP</small>
              <strong>{displayHp}</strong>
            </span>
            <span>
              <small>CORE</small>
              <strong>{displayCore}</strong>
            </span>
            <span>
              <small>WAVE</small>
              <strong>{displayWave}/{TOTAL_WAVES}</strong>
            </span>
            <span>
              <small>ZONE</small>
              <strong>{coOpActive ? "CO-OP GRID" : hud.currentZone}</strong>
            </span>
            <span className="mobile-status-strip__alert">
              <small>ALERT</small>
              <strong>{coOpActive ? `${displayEnemies} HOSTILES` : hud.threat === "LOW" ? "CLEAR" : `${hud.threat} THREAT`}</strong>
            </span>
          </aside>

          <aside className="camera-panel" aria-label="Camera controls">
            <button
              type="button"
              aria-label="Rotate camera left"
              onClick={() => engineRef.current?.rotateCamera(-1)}
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Reset camera"
              onClick={() => engineRef.current?.resetCamera()}
            >
              ◇
            </button>
            <button
              type="button"
              aria-label="Rotate camera right"
              onClick={() => engineRef.current?.rotateCamera(1)}
            >
              ↷
            </button>
            <button
              type="button"
              aria-label="Zoom camera out"
              onClick={() => engineRef.current?.zoomCamera(1)}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom camera in"
              onClick={() => engineRef.current?.zoomCamera(-1)}
            >
              +
            </button>
          </aside>

          <nav className="mobile-panel-switcher" aria-label="Mobile command trays">
            {([
              ["command", "COMMAND"],
              ["defend", "DEFEND"],
              ["skills", "SKILLS"],
            ] as Array<[MobilePanel, string]>).map(([panel, label]) => (
              <button
                type="button"
                key={panel}
                aria-pressed={mobilePanel === panel}
                onClick={() => {
                  setMobilePanel(mobilePanel === panel ? "closed" : panel);
                  setMobileSquadOpen(panel === "command");
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="mobile-camera-toggle"
            aria-label={`Camera presentation: ${cameraPresentation}. Tap to change view.`}
            aria-pressed={cameraPresentation === "command"}
            onClick={() => setCameraPresentation((presentation) => {
              if (coOpActive) return presentation === "macro" ? "tactical" : "macro";
              if (presentation === "macro") return "tactical";
              if (presentation === "tactical") return "command";
              return "macro";
            })}
          >
            {coOpActive
              ? cameraPresentation === "macro" ? "TACTICAL VIEW" : "MACRO MAP"
              : cameraPresentation === "macro"
                ? "TACTICAL VIEW"
                : cameraPresentation === "tactical"
                  ? "COMMAND MAP"
                  : "MACRO MAP"}
          </button>

          <section
            className={`agent-dock mobile-action-tray mobile-panel--command warband-overlay ${overlayState.active === "warband" ? "is-active" : ""} ${mobilePanel === "command" ? "mobile-panel--active" : "mobile-panel--inactive"} ${workshopActive ? "is-workshop" : ""} ${mobileSquadOpen ? "is-mobile-open" : ""} ${tutorial?.target === "agents" ? "tutorial-highlight" : ""}`}
            aria-label="AI agent recruitment"
          >
            <button
              type="button"
              className="mobile-squad-toggle"
              onClick={() => {
                setMobilePanel("command");
                setMobileSquadOpen((open) => !open);
              }}
              aria-expanded={mobilePanel === "command" && mobileSquadOpen}
              aria-controls="mobile-squad-panel"
            >
              <span>
                COMMAND <b>{displayWarbandCount}/{coOpActive ? coOpWarbandLimit : hud.maxWarband}</b>
              </span>
              <strong>{mobileSquadOpen ? "CLOSE" : "OPEN"}</strong>
            </button>
            <div className="commander-actions" aria-label="Commander actions">
              <small
                className="commander-explainer"
                aria-label="AGENTS FIGHT AUTOMATICALLY · AGENTS GATHER MATERIALS · REPAIR OFFLINE AGENTS · UPGRADE BETWEEN WAVES"
                title="AGENTS FIGHT AUTOMATICALLY · AGENTS GATHER MATERIALS · REPAIR OFFLINE AGENTS · UPGRADE BETWEEN WAVES"
              >
                AUTO // FIGHT + GATHER
              </small>
              <button type="button" title="Recruit an AI agent" onClick={() => setMobileSquadOpen(true)} disabled={!canRecruitAgent}>
                <i className="agent-action-icon agent-action-icon--recruit" aria-hidden="true" />
                RECRUIT AGENT
              </button>
              <button type="button" title="Build a sentry" onClick={() => {
                if (coOpActive) {
                  sendCoOpAction({ action: "build-sentry" });
                } else {
                  engineRef.current?.buildDefense();
                }
              }} disabled={!canBuildSentry}>
                <i className="agent-action-icon agent-action-icon--build" aria-hidden="true" />
                BUILD SENTRY
              </button>
              <button type="button" title="Repair the network" onClick={() => {
                if (coOpActive) {
                  if (coOpRepairTarget) sendCoOpAction({ action: "repair", targetId: coOpRepairTarget });
                } else {
                  engineRef.current?.useFieldKit();
                }
              }} disabled={coOpActive ? !coOpCanAct || !coOpRepairTarget || (coOpResources?.components ?? 0) < 1 : mode !== "playing" || hud.loot.repairs < 1}>
                <i className="agent-action-icon agent-action-icon--repair" aria-hidden="true" />
                REPAIR NETWORK
              </button>
              <button type="button" title="Deploy a temporary reserve" onClick={() => {
                if (coOpActive) {
                  if (coOpReserveAgentId) sendCoOpAction({ action: "deploy-reserve", agentId: coOpReserveAgentId });
                } else {
                  engineRef.current?.deployReserve();
                }
              }} disabled={coOpActive
                ? !coOpCanAct || !coOpReserveAgentId || (coOpResources?.components ?? 0) < 3 || (coOpResources?.shards ?? 0) < 3
                : mode !== "playing" || hud.loot.components < 3 || hud.loot.shards < 3}>
                <i className="agent-action-icon agent-action-icon--deploy" aria-hidden="true" />
                DEPLOY RESERVE
              </button>
            </div>
            <div className="agent-dock__heading">
              <span>
                <small>YOUR WARBAND</small>
                <strong>
                  WARBAND <b>{displayWarbandCount}/{coOpActive ? coOpWarbandLimit : hud.maxWarband}</b>
                </strong>
              </span>
              <span className="desktop-only">CLICK A CARD OR PRESS 1–8</span>
            </div>
            <div
              id="mobile-squad-panel"
              className="squad-commands"
              aria-label="AI squad orders"
            >
              <span>
                <small>SQUAD ORDERS</small>
                <strong>CHOOSE HOW YOUR AGENTS FIGHT</strong>
              </span>
              <div>
                {(
                  [
                    ["follow", "FOLLOW ME", "Stay close and fight near you"],
                    ["defend", "GUARD CORE", "Hold the center of the base"],
                    ["focus", "FOCUS BOSS", "Hunt the strongest enemy"],
                  ] as Array<[SquadCommand, string, string]>
                ).map(([command, label, detail]) => (
                  <button
                    type="button"
                    key={command}
                    className={(coOpActive ? coOpSnapshot?.state.warband.priority === toCoOpPriority(command) : hud.command === command) ? "is-active" : ""}
                    onClick={() => {
                      if (coOpActive) {
                        coOpClient?.sendPriority(toCoOpPriority(command));
                      } else {
                        engineRef.current?.setSquadCommand(command);
                      }
                    }}
                    disabled={coOpActive ? !coOpCanAct : mode !== "playing"}
                    title={detail}
                    aria-pressed={coOpActive ? coOpSnapshot?.state.warband.priority === toCoOpPriority(command) : hud.command === command}
                  >
                    <i className={`agent-action-icon agent-action-icon--${command}`} aria-hidden="true" />
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="agent-grid">
              {AGENTS.map((agent, index) => {
                const recruited = coOpActive ? coOpRecruited.has(agent.id) : hud.agents[agent.id];
                const cost = getRecruitCost(agent.id);
                const affordable = Boolean(
                  cost &&
                    (coOpActive ? coOpResources?.compute ?? 0 : hud.data) >= cost.compute &&
                    (coOpActive ? coOpResources?.components ?? 0 : hud.loot.components) >= cost.components &&
                    (coOpActive ? coOpResources?.shards ?? 0 : hud.loot.shards) >= cost.shards,
                );
                const evolution = hud.evolutions[agent.id as EvolutionAgentId];
                const visual = getAgentVisual(agent.id);
                const status = getAgentStatus(agent.id);
                return (
                  <button
                    type="button"
                    key={agent.id}
                    className={`agent-card ${recruited ? "is-recruited" : ""} ${advisorAgentId === agent.id ? "is-advised" : ""}`}
                    onClick={() => {
                      if (coOpActive) {
                        sendCoOpAction({ action: "recruit", agentId: agent.id });
                      } else {
                        engineRef.current?.recruit(agent.id);
                      }
                    }}
                    disabled={recruited || (coOpActive ? !coOpCanAct || !affordable : !canRecruitWarband)}
                    aria-current={advisorAgentId === agent.id ? "true" : undefined}
                    aria-label={
                      recruited
                        ? `${agent.name} recruited`
                        : `Recruit ${agent.name} for ${cost?.compute ?? agent.cost} Compute, ${cost?.components ?? 0} Components, and ${cost?.shards ?? 0} Shards`
                    }
                  >
                    <AgentPortrait
                      agentId={agent.id}
                      size="md"
                      state={status}
                      decorative
                      className="agent-card__portrait"
                    />
                    <span className="agent-card__copy">
                      <small className="agent-card__role">{visual?.roleLabel ?? agent.role}</small>
                      <strong>{agent.name}</strong>
                      <small
                        className="agent-card__hint agent-metrics"
                        title={`Damage ${agent.damage}, cooldown ${agent.cooldown.toFixed(1)} seconds, range ${agent.range}`}
                      >
                        {evolution
                          ? `RANK II · ${EVOLUTIONS[agent.id as EvolutionAgentId].find((item: { id: string }) => item.id === evolution)?.name ?? "UPGRADED"}`
                          : "AUTONOMOUS"}
                      </small>
                      <span className="agent-metrics" hidden aria-hidden="true">{agent.role}</span>
                    </span>
                    <span className="agent-card__status" data-status={status}>
                      <i aria-hidden="true" />
                      <span>{getAgentShortStatus(agent.id)}</span>
                    </span>
                    <span
                      className={`agent-card__cost ${!affordable && !recruited ? "is-low" : ""}`}
                      aria-label={recruited ? "Recruited" : `Cost ${cost?.compute ?? agent.cost} Compute, ${cost?.components ?? 0} Components, ${cost?.shards ?? 0} Shards`}
                    >
                      {recruited
                        ? <span className="agent-card__recruited-mark">✓ ACTIVE</span>
                        : (
                          <>
                            <span className="agent-resource-chip" title={`${cost?.compute ?? agent.cost} Compute`}><i aria-hidden="true">C</i><b>{cost?.compute ?? agent.cost}</b></span>
                            <span className="agent-resource-chip" title={`${cost?.components ?? 0} Components`}><i aria-hidden="true">CO</i><b>{cost?.components ?? 0}</b></span>
                            <span className="agent-resource-chip" title={`${cost?.shards ?? 0} Shards`}><i aria-hidden="true">SH</i><b>{cost?.shards ?? 0}</b></span>
                          </>
                        )}
                    </span>
                    <kbd className="agent-card__slot" aria-label={`Keyboard shortcut ${index + 1}`}>{index + 1}</kbd>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            className={`actions-overlay ${overlayState.active === "actions" ? "is-active" : ""}`}
            aria-label="Combat actions"
          >
          <div
            className={`skill-actions mobile-action-tray mobile-panel--skills ${mobilePanel === "skills" ? "mobile-panel--active" : "mobile-panel--inactive"}`}
            aria-label="Agent skill controls"
          >
            {(Object.keys(hud.skills) as EvolutionAgentId[]).map((id) => {
              const skill = hud.skills[id];
              const ready = clamp01(
                1 - skill.cooldownLeftMs / skill.cooldownMs,
              );
              return (
                <button
                  type="button"
                  key={id}
                  className={ready >= 1 ? "is-ready" : ""}
                  onClick={() => engineRef.current?.useAgentSkill(id)}
                  disabled={
                    coOpActive ||
                    mode !== "playing" ||
                    !hud.agents[id] ||
                    !skill.available ||
                    skill.cooldownLeftMs > 0
                  }
                  aria-label={`${AGENT_SKILLS[id].label} skill`}
                  style={
                    {
                      "--skill-ready": ready,
                      "--skill-color": `#${AGENTS.find((agent) => agent.id === id)?.color.toString(16).padStart(6, "0")}`,
                    } as React.CSSProperties
                  }
                >
                  <i aria-hidden="true" />
                  <AgentPortrait
                    agentId={id}
                    size="sm"
                    decorative
                    className="skill-action__portrait"
                  />
                  <small className="sr-only">{id.toUpperCase()}</small>
                  <strong>{skill.label}</strong>
                  <span>
                    {skill.cooldownLeftMs > 0
                      ? `${Math.ceil(skill.cooldownLeftMs / 1_000)}S`
                      : skill.status === "disabled"
                        ? "DISABLED"
                        : skill.status === "repair"
                          ? "REPAIR"
                          : skill.status === "retreat"
                            ? "RETREAT"
                            : skill.status === "ready"
                              ? "READY"
                              : "OFFLINE"}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`combat-actions mobile-action-tray mobile-panel--defend ${mobilePanel === "defend" ? "mobile-panel--active" : "mobile-panel--inactive"}`}
          >
            <button
              type="button"
              className="ability ability--dash"
              onClick={() => engineRef.current?.dash()}
              disabled={coOpActive || mode !== "playing" || hud.dash < 1}
              aria-label="Dash"
            >
              <i style={{ "--charge": hud.dash } as React.CSSProperties} />
              <small>Q</small>
              <strong>DASH</strong>
            </button>
            <button
              type="button"
              className={`ability ability--attack ${tutorial?.target === "attack" ? "tutorial-highlight" : ""}`}
              onClick={() => {
                if (coOpActive) {
                  if (coOpShootTarget) sendCoOpAction({ action: "shoot", targetId: coOpShootTarget });
                } else {
                  engineRef.current?.attack();
                }
              }}
              disabled={coOpActive ? !coOpCanAct || !coOpShootTarget : mode !== "playing"}
              aria-label="Shoot at the nearest enemy"
            >
              <small>SPACE</small>
              <strong>SHOOT</strong>
            </button>
            <button
              type="button"
              className="ability ability--melee"
              onClick={() => engineRef.current?.melee()}
              disabled={coOpActive || mode !== "playing"}
              aria-label="Slash nearby enemies"
            >
              <small>RMB / X</small>
              <strong>SLASH</strong>
            </button>
            <button
              type="button"
              className={`ability ability--emp ${displayEmpCharge >= 1 && displayEmpCooldownLeftMs === 0 ? "is-ready" : ""}`}
              onClick={() => {
                if (coOpActive) {
                  triggerCoOpEmp();
                } else {
                  engineRef.current?.activateEmp();
                }
              }}
              disabled={
                coOpActive ? !coOpCanAct || !coOpEmpReady || coOpEmpActionPending :
                mode !== "playing" ||
                hud.intermissionMs > 0 ||
                displayEmpCharge < 1 ||
                displayEmpCooldownLeftMs > 0
              }
              aria-label="EMP pulse"
            >
              <i style={{ "--charge": displayEmpCharge } as React.CSSProperties} />
              <small>
                {displayEmpCharge >= 1 && displayEmpCooldownLeftMs === 0
                  ? "R / READY"
                  : `R / EMP COOLDOWN ${Math.ceil(displayEmpCooldownLeftMs / 1_000)}S · ${Math.round(displayEmpCharge * 100)}%`}
              </small>
              <strong>EMP PULSE</strong>
            </button>
          </div>

          <button
            type="button"
            className={`repair-field-kit mobile-action-tray mobile-panel--defend ${mobilePanel === "defend" ? "mobile-panel--active" : "mobile-panel--inactive"}`}
            onClick={() => {
              if (coOpActive) {
                if (coOpRepairTarget) sendCoOpAction({ action: "repair", targetId: coOpRepairTarget });
              } else {
                engineRef.current?.useFieldKit();
              }
            }}
            disabled={coOpActive ? !coOpCanAct || !coOpRepairTarget || (coOpResources?.components ?? 0) < 1 : mode !== "playing"}
            aria-label="Repair damaged agents with a field kit or sentries with Components"
          >
            <small>R {hud.loot.repairs} · C {coOpActive ? coOpResources?.components ?? 0 : hud.loot.components}</small>
            <strong>REPAIR / FIELD KIT</strong>
          </button>
          </section>

        </>
      )}

      {toast && (
        <div
          className="mission-toast"
          key={toast.id}
          role="status"
          aria-live="polite"
        >
          <small>{toast.eyebrow}</small>
          <strong>{toast.title}</strong>
          <span>{toast.detail}</span>
        </div>
      )}

      {mode === "intro" && (
        <section className="intro-screen">
          <video
            className="hero-trailer"
            autoPlay
            muted
            loop
            playsInline
            poster="/video/freeman-protocol-trailer-poster.jpg"
            aria-hidden="true"
          >
            <source
              src="/video/freeman-protocol-trailer.mp4"
              type="video/mp4"
            />
          </video>
          <div className="intro-network" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i />
          </div>
          <div className="intro-copy">
            <span className="eyebrow">ISOMETRIC CYBER DEFENSE ACTION RPG</span>
            <div className="intro-mark">
              <span>F</span>
              <i>00</i>
            </div>
            <h1>
              FREEMAN
              <em>PROTOCOL</em>
            </h1>
            <p className="intro-lede">
              Hackers have breached the network.
              <br />
              Build an AI team and fight back.
            </p>
            <p className="intro-mission">
              Destroy threats to earn Compute. Recruit agents, build sentries,
              collect Components, and keep the Core alive through eight waves.
              In Watch Mode, your AI network fights, gathers, upgrades, and
              pilots your operator for you.
            </p>
            <button
              type="button"
              className="enter-button"
              onClick={() => startGame({ tutorial: !tutorialComplete, mode: "campaign" })}
            >
              <span>START CAMPAIGN</span>
              <i>→</i>
            </button>
            <button
              type="button"
              className="enter-button enter-button--watch"
              onClick={() => startGame({ tutorial: false, mode: "watch" })}
            >
              <span>START WATCH MODE</span>
              <i>◉</i>
            </button>
            <p className="intro-watch-note">
              WATCH MODE · AI PILOT + AUTONOMOUS WAR NETWORK · RUNS WHILE OPEN
            </p>
            {tutorialComplete && (
              <button
                type="button"
                className="intro-tutorial-button"
                onClick={() => startGame({ tutorial: true })}
              >
                PLAY TUTORIAL
              </button>
            )}
          </div>

          <div className="intro-brief">
            <span className="intro-brief__line" />
            <p>
              <small>YOUR GOAL</small>
              <strong>KEEP THE CORE ALIVE</strong>
            </p>
            <p>
              <small>CONTROLS</small>
              <strong>WASD MOVE · LEFT CLICK SHOOTS · RIGHT CLICK SLASHES</strong>
            </p>
            <p>
              <small>YOUR TEAM</small>
              <strong>RECRUIT AI AGENTS · BUILD BASE SENTRIES</strong>
            </p>
          </div>

          <footer className="intro-footer">
            <span>NO DOWNLOAD · DESKTOP + TOUCH</span>
            <span>MOVE · SHOOT · SLASH · RECRUIT · SURVIVE</span>
          </footer>
        </section>
      )}

      {mode === "upgrade" && (
        <section className="overlay-screen protocol-screen">
          <div className="overlay-copy">
            <span className="eyebrow">WAVE {hud.wave} CLEARED</span>
            <h2>Choose one upgrade.</h2>
            <p>The next wave is stronger. Pick what your team needs most.</p>
          </div>
          <div className="protocol-grid">
            {getUpgradeChoices(hud.wave, hud.upgradeStacks).map((upgrade) => (
              <button
                type="button"
                key={`${upgrade.category}:${upgrade.id}`}
                onClick={() => engineRef.current?.applyUpgrade(upgrade.id)}
              >
                <small>{upgrade.index}</small>
                <span>
                  <em>{UPGRADE_CATEGORY_LABELS[upgrade.category]}</em>
                  <strong>{upgrade.name}</strong>
                  <p>{upgrade.detail}</p>
                </span>
                <b>
                  {upgrade.outcome} · STACK{" "}
                  {hud.upgradeStacks[upgrade.id] + 1}/
                  {upgrade.id === "repair" ? "∞" : "2"}
                </b>
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === "evolution" && (
        <section className="overlay-screen protocol-screen evolution-screen">
          <div className="overlay-copy">
            <span className="eyebrow">OPTIONAL TEAM EVOLUTION</span>
            <h2>Specialize an AI agent.</h2>
            <p>
              Spend Compute on protocols or install deeper component upgrades.
              COMPONENTS AVAILABLE: {hud.loot.components}
            </p>
          </div>
          <div className="progression-section">
            <div className="progression-section__heading">
              <span>ARMOR PROFILE</span>
              <strong>{hud.armorId?.toUpperCase() ?? "UNASSIGNED"}</strong>
            </div>
            <div className="protocol-grid progression-grid">
              {(Object.entries(PLAYER_ARMORS) as Array<
                [PlayerArmorId, (typeof PLAYER_ARMORS)[PlayerArmorId]]
              >).map(([armorId, armor]) => {
                const rank = getComponentRank(
                  hud.componentUpgradeRanks,
                  "player",
                  armorId,
                );
                const locked = Boolean(hud.armorId && hud.armorId !== armorId);
                const unaffordable = hud.loot.components < armor.cost;
                return (
                  <button
                    type="button"
                    key={armorId}
                    disabled={locked || rank >= armor.maxRank || unaffordable}
                    onClick={() =>
                      engineRef.current?.purchaseComponentUpgrade(
                        "player",
                        armorId,
                      )
                    }
                  >
                    <small>{armorId.slice(0, 1).toUpperCase()}</small>
                    <span>
                      <em>PLAYER ARMOR</em>
                      <strong>{armor.name}</strong>
                      <p>{ARMOR_COPY[armorId]}</p>
                    </span>
                    <b>
                      {locked
                        ? `${hud.armorId?.toUpperCase()} ALREADY ACTIVE`
                        : rank >= armor.maxRank
                          ? "INSTALLED"
                          : unaffordable
                            ? `INSUFFICIENT COMPONENTS · ${armor.cost} REQUIRED`
                            : `${armor.cost} COMPONENTS · RANK 0/1`}
                    </b>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="progression-section">
            <div className="progression-section__heading">
              <span>AGENT COMPONENT UPGRADES</span>
              <strong>{hud.loot.components} COMPONENTS</strong>
            </div>
            <div className="protocol-grid progression-grid">
              {AGENTS.filter((agent) => hud.agents[agent.id]).flatMap((agent) =>
                (AGENT_COMPONENT_UPGRADES[agent.id] ?? []).map(
                  (upgrade: {
                    id: string;
                    name: string;
                    cost: number;
                    maxRank: number;
                  }) => {
                    const rank = getComponentRank(
                      hud.componentUpgradeRanks,
                      agent.id,
                      upgrade.id,
                    );
                    const capped = rank >= upgrade.maxRank;
                    const unaffordable = hud.loot.components < upgrade.cost;
                    return (
                      <button
                        type="button"
                        key={`${agent.id}:${upgrade.id}`}
                        disabled={capped || unaffordable}
                        onClick={() =>
                          engineRef.current?.purchaseComponentUpgrade(
                            agent.id,
                            upgrade.id,
                          )
                        }
                      >
                        <small>{agent.code}</small>
                        <span>
                          <em>{agent.name} COMPONENT</em>
                          <strong>{upgrade.name}</strong>
                          <p>{COMPONENT_COPY[upgrade.id]}</p>
                        </span>
                        <b>
                          {capped
                            ? `MAX RANK ${rank}/${upgrade.maxRank}`
                            : unaffordable
                              ? `INSUFFICIENT COMPONENTS · ${upgrade.cost} REQUIRED`
                              : `${upgrade.cost} COMPONENTS · RANK ${rank}/${upgrade.maxRank}`}
                        </b>
                      </button>
                    );
                  },
                ),
              )}
            </div>
          </div>
          <div className="protocol-grid evolution-grid">
            {AGENTS.filter(
              (agent) =>
                hud.agents[agent.id] &&
                EVOLUTIONS[agent.id as EvolutionAgentId] &&
                !hud.evolutions[agent.id as EvolutionAgentId],
            ).flatMap((agent) =>
              EVOLUTIONS[agent.id as EvolutionAgentId].map(
                (evolution: {
                  id: EvolutionId;
                  name: string;
                  price: number;
                }) => (
                  <button
                    type="button"
                    key={evolution.id}
                    disabled={hud.data < evolution.price}
                    onClick={() =>
                      engineRef.current?.evolveAgent(
                        agent.id as EvolutionAgentId,
                        evolution.id,
                      )
                    }
                  >
                    <small>{agent.name} · RANK II</small>
                    <span>
                      <em>EVOLUTION PROTOCOL</em>
                      <strong>{evolution.name}</strong>
                      <p>{EVOLUTION_COPY[evolution.id]}</p>
                    </span>
                    <b>{evolution.price} COMPUTE</b>
                  </button>
                ),
              ),
            )}
          </div>
          <button
            type="button"
            className="enter-button enter-button--compact"
            onClick={() => engineRef.current?.continueWithoutEvolution()}
          >
            <span>CONTINUE WITHOUT EVOLVING</span>
            <i>→</i>
          </button>
        </section>
      )}

      {mode === "paused" && overlayState.active === "closed" && (
        <section className="overlay-screen pause-screen">
          <span className="eyebrow">GAME PAUSED</span>
          <h2>Take a breath.</h2>
          <p>The action is frozen until you resume.</p>
          <button
            type="button"
            className="enter-button enter-button--compact"
            onClick={() => engineRef.current?.togglePause()}
          >
            <span>RESUME MISSION</span>
            <i>→</i>
          </button>
        </section>
      )}

      {(mode === "defeat" || mode === "victory") && (
        <section
          className={`overlay-screen end-screen ${mode === "victory" ? "is-victory" : "is-defeat"}`}
        >
          <span className="eyebrow">
            {mode === "victory" ? "MISSION COMPLETE" : "MISSION FAILED"}
          </span>
          <h2>
            {mode === "victory"
              ? "The network is safe."
              : hud.core <= 0
                ? "The Core was destroyed."
                : "You were defeated."}
          </h2>
          <p>
            {mode === "victory"
              ? "You survived eight encounters, built an AI squad and contained Rootkit Prime."
              : "Try again, recruit agents earlier, and keep enemies away from the Core."}
          </p>
          <div className="end-stats">
            <span>
              <small>SCORE</small>
              <strong>{hud.score.toLocaleString()}</strong>
            </span>
            <span>
              <small>BEST</small>
              <strong>{hud.best.toLocaleString()}</strong>
            </span>
            <span>
              <small>WARBAND</small>
              <strong>{hud.warbandCount}/{hud.maxWarband}</strong>
            </span>
          </div>
          {mode === "defeat" && hud.canRetryWave && (
            <button
              type="button"
              className="enter-button enter-button--compact"
              onClick={() => engineRef.current?.retryWave()}
            >
              <span>RETRY WAVE</span>
              <i>→</i>
            </button>
          )}
          <button
            type="button"
            className={`enter-button enter-button--compact ${mode === "defeat" && hud.canRetryWave ? "enter-button--secondary" : ""}`}
            onClick={() => startGame({ tutorial: false })}
          >
            <span>{mode === "victory" ? "PLAY AGAIN" : "RESTART MISSION"}</span>
            <i>→</i>
          </button>
        </section>
      )}

      {helpOpen && (
        <section
          className="help-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Controls"
        >
          <button
            type="button"
            className="help-dialog__close"
            onClick={closeHelp}
            aria-label="Close controls"
          >
            ×
          </button>
          <span className="eyebrow">HOW TO PLAY</span>
          <h2>Protect the Core.</h2>
          <p className="help-dialog__goal">
            Destroy enemies, earn Compute, recruit AI agents, build up to three
            automatic sentry towers and draft one upgrade after every encounter.
            Choose whether agents follow you, guard the Core, or focus the
            strongest enemy. Later waves add stronger enemies and
            reinforcements. Survive eight encounters before your health or the
            Core reaches zero.
          </p>
          <div className="control-list">
            <span>
              <kbd>WASD</kbd>
              <b>Move</b>
            </span>
            <span>
              <kbd>LEFT CLICK / SPACE</kbd>
              <b>Shoot</b>
            </span>
            <span>
              <kbd>RIGHT CLICK / X</kbd>
              <b>Slash nearby enemies</b>
            </span>
            <span>
              <kbd>Q / SHIFT</kbd>
              <b>Dash away</b>
            </span>
            <span>
              <kbd>R</kbd>
              <b>EMP pulse</b>
            </span>
            <span>
              <kbd>1–8</kbd>
              <b>Recruit an AI agent</b>
            </span>
            <span>
              <kbd>B / BASE PANEL</kbd>
              <b>Place an auto-sentry</b>
            </span>
            <span>
              <kbd>E / SQUAD ORDERS</kbd>
              <b>Change agent behaviour</b>
            </span>
            <span>
              <kbd>MIDDLE DRAG</kbd>
              <b>Rotate camera</b>
            </span>
            <span>
              <kbd>WHEEL</kbd>
              <b>Zoom camera</b>
            </span>
            <span>
              <kbd>Z / C / F</kbd>
              <b>Rotate / reset view</b>
            </span>
          </div>
          <div className="audio-settings" aria-label="Audio mix">
            <label>
              <span>MUSIC</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audioSettings.musicVolume}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  engineRef.current?.setMusicVolume(value);
                  setAudioSettings((settings) => ({ ...settings, musicVolume: value }));
                }}
              />
            </label>
            <label>
              <span>EFFECTS</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audioSettings.sfxVolume}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  engineRef.current?.setSfxVolume(value);
                  setAudioSettings((settings) => ({ ...settings, sfxVolume: value }));
                }}
              />
            </label>
            <small>Soundtrack shuffles all three Freeman themes.</small>
          </div>
          <p>
            On touch devices, move with the left stick and use the action
            buttons.
          </p>
        </section>
      )}

      {helpOpen && (
        <button
          type="button"
          className="dialog-backdrop"
          aria-label="Close controls"
          onClick={closeHelp}
        />
      )}

      <div
        className={`overlay-fade ${isOverlay ? "is-visible" : ""}`}
        aria-hidden="true"
      />
    </main>
  );
}
