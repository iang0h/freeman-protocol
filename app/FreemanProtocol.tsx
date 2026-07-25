"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

type GameMode =
  | "intro"
  | "playing"
  | "upgrade"
  | "paused"
  | "defeat"
  | "victory";

type AgentId = "kairos" | "kira" | "forge" | "covenant";
type UpgradeId = "overclock" | "bastion" | "bandwidth";
type EnemyType = "virus" | "phisher" | "trojan" | "rootkit";

type HudState = {
  hp: number;
  maxHp: number;
  core: number;
  maxCore: number;
  data: number;
  wave: number;
  enemies: number;
  score: number;
  best: number;
  dash: number;
  ultimate: number;
  agents: Record<AgentId, boolean>;
};

type ToastState = {
  id: number;
  eyebrow: string;
  title: string;
  detail: string;
};

type GameCallbacks = {
  onMode: (mode: GameMode) => void;
  onHud: (hud: HudState) => void;
  onToast: (toast: Omit<ToastState, "id">) => void;
};

interface GameController {
  start(): void;
  setMuted(muted: boolean): void;
  togglePause(): void;
  recruit(id: AgentId): void;
  attack(): void;
  dash(): void;
  ultimate(): void;
  applyUpgrade(id: UpgradeId): void;
  rotateCamera(direction: -1 | 1): void;
  zoomCamera(direction: -1 | 1): void;
  resetCamera(): void;
  setTouchMovement(x: number, y: number): void;
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
};

type AgentRuntime = AgentDefinition & {
  group: THREE.Group;
  cooldownLeft: number;
  supportClock: number;
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
  phaseTriggered: boolean;
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
  kind: "ring" | "beam" | "burst" | "portal";
};

const AGENTS: AgentDefinition[] = [
  {
    id: "kairos",
    code: "01",
    name: "KAIROS",
    role: "Tempo strategist",
    detail: "Slows hostile processes and creates clean attack windows.",
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
    role: "Precision analyst",
    detail: "Reads weak points and lands high-value ranged strikes.",
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
    role: "Kingdom builder",
    detail: "Turns spare compute into rapid suppressive fire.",
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
    role: "Network warden",
    detail: "Repairs the Operator and protects the Freeman Core.",
    cost: 135,
    color: 0xd7d5ca,
    damage: 9,
    cooldown: 1.8,
    range: 7,
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
    name: "OVERCLOCK",
    detail: "Trade restraint for decisive force.",
    outcome: "+35% Operator damage",
  },
  {
    id: "bastion",
    index: "B",
    name: "BASTION",
    detail: "Make the Covenant harder to break.",
    outcome: "+25 max integrity, repair both",
  },
  {
    id: "bandwidth",
    index: "C",
    name: "BANDWIDTH",
    detail: "Increase the intelligence you can command.",
    outcome: "+70 compute, agents fire 18% faster",
  },
];

const INITIAL_HUD: HudState = {
  hp: 100,
  maxHp: 100,
  core: 180,
  maxCore: 180,
  data: 55,
  wave: 1,
  enemies: 0,
  score: 0,
  best: 0,
  dash: 1,
  ultimate: 0,
  agents: {
    kairos: false,
    kira: false,
    forge: false,
    covenant: false,
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

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
    if (cue === "attack") this.tone(320, 160, 0.09, 0.055, "square");
    if (cue === "hit") this.tone(145, 72, 0.12, 0.07, "triangle");
    if (cue === "kill") this.tone(430, 720, 0.16, 0.065, "sine");
    if (cue === "dash") this.tone(190, 660, 0.18, 0.06, "sawtooth");
    if (cue === "damage") this.tone(95, 48, 0.24, 0.1, "square");
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
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 120);
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly audio = new SynthAudio();
  private readonly keys = new Set<string>();
  private readonly enemies: EnemyRuntime[] = [];
  private readonly agents: AgentRuntime[] = [];
  private readonly projectiles: ProjectileRuntime[] = [];
  private readonly effects: EffectRuntime[] = [];
  private readonly aimPoint = new THREE.Vector3(0, 0, -4);
  private readonly lastMove = new THREE.Vector3(0, 0, -1);
  private readonly touchMove = new THREE.Vector2();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly desiredCameraTarget = new THREE.Vector3();
  private readonly player: {
    group: THREE.Group;
    weapon: THREE.Group;
    hp: number;
    maxHp: number;
    damage: number;
    attackCooldown: number;
    dashCooldown: number;
    ultimate: number;
    invulnerable: number;
  };
  private readonly core: {
    group: THREE.Group;
    crystal: THREE.Mesh;
    shield: THREE.Mesh;
    hp: number;
    maxHp: number;
  };
  private resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private mode: GameMode = "intro";
  private wave = 1;
  private waveActive = false;
  private waveEndClock = 0;
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
  private shake = 0;
  private elapsed = 0;
  private hudClock = 0;
  private reducedMotion = false;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.best = Number(window.localStorage.getItem("freeman-protocol-best") || 0);

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x050707);
    this.scene.fog = new THREE.FogExp2(0x050707, 0.032);

    this.buildWorld();
    this.core = this.buildCore();
    this.player = this.buildOperator();
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    this.emitHud(true);
    this.animate();
  }

  start() {
    this.audio.unlock();
    this.clearDynamic();
    this.wave = 1;
    this.score = 0;
    this.data = 55;
    this.attackMultiplier = 1;
    this.agentRateMultiplier = 1;
    this.player.hp = this.player.maxHp = 100;
    this.player.damage = 25;
    this.player.attackCooldown = 0;
    this.player.dashCooldown = 0;
    this.player.ultimate = 0;
    this.player.group.position.set(0, 0, 2.7);
    this.player.group.visible = true;
    this.core.hp = this.core.maxHp = 180;
    this.mode = "playing";
    this.callbacks.onMode("playing");
    this.spawnWave(1);
    this.callbacks.onToast({
      eyebrow: "MISSION 001",
      title: "NULL BREACH DETECTED",
      detail: "Protect the Covenant Core. Recover compute. Recruit intelligence.",
    });
    this.audio.play("wave");
    this.emitHud(true);
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.callbacks.onMode("paused");
      return;
    }
    if (this.mode === "paused") {
      this.mode = "playing";
      this.callbacks.onMode("playing");
    }
  }

  recruit(id: AgentId) {
    if (this.mode !== "playing") return;
    const definition = AGENTS.find((agent) => agent.id === id);
    if (!definition || this.agents.some((agent) => agent.id === id)) return;
    if (this.data < definition.cost) {
      this.callbacks.onToast({
        eyebrow: "INSUFFICIENT COMPUTE",
        title: `${definition.cost - this.data} MORE REQUIRED`,
        detail: "Destroy hostile processes to recover clean compute.",
      });
      return;
    }
    this.data -= definition.cost;
    const group = this.createAgentModel(definition);
    group.position.copy(this.player.group.position).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(group);
    this.agents.push({
      ...definition,
      group,
      cooldownLeft: 0.35,
      supportClock: 5,
    });
    this.addRing(group.position, definition.color, 0.3, 2.2, 0.65, "portal");
    this.addBurst(group.position, definition.color, 13);
    this.audio.play("recruit");
    this.callbacks.onToast({
      eyebrow: `AGENT ${definition.code} RECRUITED`,
      title: `${definition.name} IS ONLINE`,
      detail: definition.detail,
    });
    this.emitHud(true);
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
    this.player.attackCooldown = 0.28;
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
    this.clampToArena(this.player.group.position, 11.8);
    this.player.dashCooldown = 3;
    this.player.invulnerable = 0.34;
    this.addBeam(start.add(new THREE.Vector3(0, 0.6, 0)), this.player.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xd9793f, 0.28);
    this.addBurst(start, 0xd9793f, 10);
    this.addRing(this.player.group.position, 0xd9793f, 0.2, 1.45, 0.3);
    this.shake = Math.max(this.shake, 0.12);
    this.audio.play("dash");
  }

  ultimate() {
    if (this.mode !== "playing" || this.player.ultimate < 100) return;
    this.player.ultimate = 0;
    const origin = this.player.group.position.clone();
    const damage = 44 + this.agents.length * 8;
    for (const enemy of [...this.enemies]) {
      const distance = enemy.group.position.distanceTo(origin);
      if (distance <= 10.5) {
        enemy.slow = Math.max(enemy.slow, 2.8);
        this.damageEnemy(enemy, damage, enemy.group.position);
      }
    }
    this.addRing(origin, 0xf1eadd, 0.4, 11, 0.9, "portal");
    this.addRing(origin, 0x9ebfc0, 0.2, 7, 0.72);
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
      eyebrow: "ORCHESTRATION COMPLETE",
      title: "THE SWARM MOVES AS ONE",
      detail: `${this.agents.length || "No"} recruited agents amplified the command burst.`,
    });
    this.emitHud(true);
  }

  applyUpgrade(id: UpgradeId) {
    if (this.mode !== "upgrade") return;
    if (id === "overclock") {
      this.attackMultiplier *= 1.35;
    }
    if (id === "bastion") {
      this.player.maxHp += 25;
      this.player.hp = this.player.maxHp;
      this.core.maxHp += 20;
      this.core.hp = this.core.maxHp;
    }
    if (id === "bandwidth") {
      this.data += 70;
      this.agentRateMultiplier *= 0.82;
    }
    const selected = UPGRADES.find((upgrade) => upgrade.id === id);
    this.callbacks.onToast({
      eyebrow: "PROTOCOL INSTALLED",
      title: selected?.name ?? "SYSTEM UPGRADED",
      detail: selected?.outcome ?? "The network is stronger.",
    });
    this.wave += 1;
    this.mode = "playing";
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

  resetCamera() {
    this.yaw = Math.PI / 4;
    this.zoom = 1;
    this.resize();
  }

  setTouchMovement(x: number, y: number) {
    this.touchMove.set(x, y);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.audio.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material?.dispose();
    });
    this.renderer.dispose();
  }

  private buildWorld() {
    const hemisphere = new THREE.HemisphereLight(0x9ebfc0, 0x140c08, 1.7);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xf4d3ad, 3.8);
    keyLight.position.set(7, 14, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xd9793f, 35, 24, 2);
    rimLight.position.set(-6, 4, -7);
    this.scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshStandardMaterial({
        color: 0x090c0c,
        roughness: 0.82,
        metalness: 0.28,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.11;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(44, 44, 0x3a2920, 0x172020);
    grid.position.y = -0.08;
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.72;
    this.scene.add(grid);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(5.1, 5.6, 0.25, 8),
      new THREE.MeshStandardMaterial({
        color: 0x101515,
        roughness: 0.62,
        metalness: 0.58,
        emissive: 0x111512,
      }),
    );
    platform.position.y = 0;
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.scene.add(platform);

    const platformLine = new THREE.Mesh(
      new THREE.TorusGeometry(5.15, 0.035, 8, 64),
      new THREE.MeshBasicMaterial({
        color: 0x9d5635,
        transparent: true,
        opacity: 0.72,
      }),
    );
    platformLine.rotation.x = Math.PI / 2;
    platformLine.position.y = 0.15;
    this.scene.add(platformLine);

    const buildingMaterial = new THREE.MeshStandardMaterial({
      color: 0x101515,
      roughness: 0.5,
      metalness: 0.7,
      emissive: 0x081010,
    });
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: 0x966044,
      transparent: true,
      opacity: 0.5,
    });
    const positions: Array<[number, number]> = [];
    for (let x = -16; x <= 16; x += 4) {
      positions.push([x, -16], [x, 16]);
    }
    for (let z = -12; z <= 12; z += 4) {
      positions.push([-16, z], [16, z]);
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
      particlePositions[index * 3] = ((index * 71) % 400) / 10 - 20;
      particlePositions[index * 3 + 1] = 0.2 + ((index * 47) % 90) / 10;
      particlePositions[index * 3 + 2] = ((index * 97) % 400) / 10 - 20;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0x9ebfc0,
        size: 0.035,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    particles.name = "ambient-particles";
    this.scene.add(particles);
  }

  private buildCore() {
    const group = new THREE.Group();
    group.position.set(0, 0.1, 0);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.55, 0.55, 8),
      new THREE.MeshStandardMaterial({
        color: 0x151a19,
        roughness: 0.42,
        metalness: 0.8,
      }),
    );
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.72, 0),
      new THREE.MeshStandardMaterial({
        color: 0xe7d9c8,
        emissive: 0xd9793f,
        emissiveIntensity: 1.8,
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
        color: 0xd9793f,
        transparent: true,
        opacity: 0.8,
      }),
    );
    innerRing.position.y = 1.25;
    innerRing.rotation.x = Math.PI / 2;
    innerRing.name = "core-ring";
    group.add(innerRing);

    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x9ebfc0,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    shield.position.y = 0.1;
    group.add(shield);

    const light = new THREE.PointLight(0xd9793f, 42, 12, 2);
    light.position.y = 1.5;
    group.add(light);

    this.scene.add(group);
    return { group, crystal, shield, hp: 180, maxHp: 180 };
  }

  private buildOperator() {
    const group = new THREE.Group();
    group.position.set(0, 0, 2.7);

    const coatMaterial = new THREE.MeshStandardMaterial({
      color: 0x171b1a,
      roughness: 0.62,
      metalness: 0.28,
      emissive: 0x130d09,
    });
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b3430,
      roughness: 0.38,
      metalness: 0.72,
      emissive: 0x34170b,
      emissiveIntensity: 0.4,
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xb98b72,
      roughness: 0.78,
    });

    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.5, 0.9, 6),
      coatMaterial,
    );
    lower.position.y = 0.52;
    lower.castShadow = true;
    group.add(lower);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.36, 0.8, 6),
      armorMaterial,
    );
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 8),
      skinMaterial,
    );
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.1, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x9ebfc0 }),
    );
    visor.position.set(0, 1.8, -0.23);
    group.add(visor);

    const weapon = new THREE.Group();
    weapon.position.set(0.5, 1.12, -0.24);
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.14, 0.85),
      armorMaterial,
    );
    stock.position.z = -0.3;
    weapon.add(stock);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8),
      new THREE.MeshBasicMaterial({ color: 0xe77d44 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.82;
    weapon.add(barrel);
    group.add(weapon);

    const operatorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0xe77d44,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    operatorRing.rotation.x = -Math.PI / 2;
    operatorRing.position.y = 0.04;
    group.add(operatorRing);

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    this.scene.add(group);
    return {
      group,
      weapon,
      hp: 100,
      maxHp: 100,
      damage: 25,
      attackCooldown: 0,
      dashCooldown: 0,
      ultimate: 0,
      invulnerable: 0,
    };
  }

  private createAgentModel(definition: AgentDefinition) {
    const group = new THREE.Group();
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: definition.color,
      emissive: definition.color,
      emissiveIntensity: 0.8,
      roughness: 0.28,
      metalness: 0.68,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x151919,
      roughness: 0.4,
      metalness: 0.8,
    });
    const geometry =
      definition.id === "kairos"
        ? new THREE.OctahedronGeometry(0.34, 0)
        : definition.id === "kira"
          ? new THREE.TetrahedronGeometry(0.42, 0)
          : definition.id === "forge"
            ? new THREE.BoxGeometry(0.52, 0.52, 0.52)
            : new THREE.IcosahedronGeometry(0.36, 0);
    const core = new THREE.Mesh(geometry, coreMaterial);
    core.castShadow = true;
    group.add(core);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.035, 6, 32),
      darkMaterial,
    );
    ring.rotation.x = Math.PI / 2;
    ring.name = "agent-ring";
    group.add(ring);

    const light = new THREE.PointLight(definition.color, 9, 3.5, 2);
    group.add(light);
    return group;
  }

  private createEnemy(type: EnemyType, position: THREE.Vector3) {
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
        hp: 54,
        speed: 2.1,
        damage: 10,
        range: 1.05,
        cooldown: 1.45,
        reward: 14,
        radius: 0.46,
        color: 0xa73d2d,
        scale: 0.72,
      },
      phisher: {
        hp: 72,
        speed: 1.35,
        damage: 13,
        range: 6,
        cooldown: 2.1,
        reward: 20,
        radius: 0.55,
        color: 0xb35d32,
        scale: 0.86,
      },
      trojan: {
        hp: 138,
        speed: 0.9,
        damage: 22,
        range: 1.45,
        cooldown: 2.4,
        reward: 30,
        radius: 0.82,
        color: 0x7b2923,
        scale: 1.12,
      },
      rootkit: {
        hp: 560,
        speed: 0.75,
        damage: 26,
        range: 2.1,
        cooldown: 2.6,
        reward: 125,
        radius: 1.42,
        color: 0xb7422e,
        scale: 1.85,
      },
    };
    const definition = definitions[type];
    const group = new THREE.Group();
    group.position.copy(position);

    const material = new THREE.MeshStandardMaterial({
      color: 0x251313,
      emissive: definition.color,
      emissiveIntensity: type === "rootkit" ? 1.05 : 0.64,
      roughness: 0.42,
      metalness: 0.36,
    });
    let geometry: THREE.BufferGeometry;
    if (type === "phisher") geometry = new THREE.TetrahedronGeometry(0.66, 0);
    else if (type === "trojan") geometry = new THREE.BoxGeometry(1, 1, 1);
    else if (type === "rootkit") geometry = new THREE.IcosahedronGeometry(0.88, 1);
    else geometry = new THREE.IcosahedronGeometry(0.52, 0);

    const body = new THREE.Mesh(geometry, material);
    body.position.y = definition.radius;
    body.scale.setScalar(definition.scale);
    body.castShadow = true;
    group.add(body);

    if (type === "virus" || type === "rootkit") {
      const spikeGeometry = new THREE.ConeGeometry(
        type === "rootkit" ? 0.16 : 0.08,
        type === "rootkit" ? 0.7 : 0.38,
        5,
      );
      const spikeMaterial = new THREE.MeshBasicMaterial({
        color: definition.color,
      });
      const spikeCount = type === "rootkit" ? 8 : 5;
      for (let index = 0; index < spikeCount; index += 1) {
        const angle = (index / spikeCount) * Math.PI * 2;
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        spike.position.set(
          Math.cos(angle) * definition.radius * 0.78,
          definition.radius,
          Math.sin(angle) * definition.radius * 0.78,
        );
        spike.rotation.z = Math.PI / 2;
        spike.rotation.y = -angle;
        group.add(spike);
      }
    }

    if (type === "phisher") {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.045, 6, 24),
        new THREE.MeshBasicMaterial({
          color: definition.color,
          transparent: true,
          opacity: 0.78,
        }),
      );
      halo.position.y = 0.75;
      halo.rotation.x = Math.PI / 2;
      halo.name = "enemy-halo";
      group.add(halo);
    }

    if (type === "trojan") {
      const hornGeometry = new THREE.ConeGeometry(0.12, 0.55, 5);
      const hornMaterial = new THREE.MeshBasicMaterial({
        color: definition.color,
      });
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeometry, hornMaterial);
        horn.position.set(side * 0.38, 1.45, -0.12);
        horn.rotation.z = side * -0.22;
        group.add(horn);
      }
    }

    const healthBar = new THREE.Group();
    healthBar.position.y = definition.radius * 2.25 + 0.48;
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
    group.add(healthBar);

    this.scene.add(group);
    const enemy: EnemyRuntime = {
      id: ++this.enemySequence,
      type,
      group,
      body,
      healthBar,
      healthFill,
      hp: definition.hp,
      maxHp: definition.hp,
      speed: definition.speed,
      damage: definition.damage,
      range: definition.range,
      attackCooldown: definition.cooldown,
      cooldownLeft: 0.4 + Math.random() * 0.8,
      telegraphLeft: 0,
      telegraphTotal: type === "phisher" ? 0.82 : type === "rootkit" ? 1.05 : 0.6,
      reward: definition.reward,
      radius: definition.radius,
      slow: 0,
      phaseTriggered: false,
    };
    this.enemies.push(enemy);
    this.addRing(position, definition.color, 0.2, type === "rootkit" ? 2.8 : 1.15, 0.55, "portal");
    return enemy;
  }

  private spawnWave(wave: number) {
    this.waveActive = true;
    this.waveEndClock = 0;
    if (wave === 1) {
      this.spawnFormation(["virus", "virus", "virus", "virus", "virus", "phisher"]);
      return;
    }
    if (wave === 2) {
      this.spawnFormation([
        "virus",
        "virus",
        "virus",
        "virus",
        "virus",
        "phisher",
        "phisher",
        "phisher",
        "trojan",
        "trojan",
      ]);
      return;
    }
    this.spawnFormation([
      "rootkit",
      "virus",
      "virus",
      "virus",
      "virus",
      "phisher",
      "phisher",
      "trojan",
    ]);
    this.callbacks.onToast({
      eyebrow: "FINAL BREACH",
      title: "ROOTKIT PRIME HAS ENTERED",
      detail: "Break its shell before it reaches the Covenant Core.",
    });
  }

  private spawnFormation(types: EnemyType[]) {
    types.forEach((type, index) => {
      const angle =
        (index / types.length) * Math.PI * 2 +
        this.wave * 0.38 +
        (index % 2) * 0.12;
      const radius = type === "rootkit" ? 11 : 9.6 + (index % 3) * 1.25;
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

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  private unbindEvents() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
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
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") this.attack();
    if (event.code === "KeyQ" || event.code === "ShiftLeft") this.dash();
    if (event.code === "KeyR") this.ultimate();
    if (event.code === "KeyZ") this.rotateCamera(-1);
    if (event.code === "KeyC") this.rotateCamera(1);
    if (event.code === "KeyF") this.resetCamera();
    if (event.code === "Escape") this.togglePause();
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const agent = AGENTS[index];
      if (agent) this.recruit(agent.id);
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus();
    if (event.button === 2) {
      this.dragPointer = event.pointerId;
      this.dragX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 0) {
      this.updateAim(event);
      this.attack();
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.dragPointer === event.pointerId) {
      const delta = event.clientX - this.dragX;
      this.dragX = event.clientX;
      this.yaw -= delta * 0.008;
      return;
    }
    this.updateAim(event);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.dragPointer === event.pointerId) {
      this.dragPointer = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    }
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
    }
  }

  private animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.updateAmbient(delta);
    if (this.mode === "playing") this.updateGame(delta);
    this.updateEffects(delta);
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
  };

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
    this.core.shield.scale.setScalar(
      1 + Math.sin(this.elapsed * 1.4) * 0.025,
    );
    (
      this.core.shield.material as THREE.MeshBasicMaterial
    ).opacity = 0.035 + (this.core.hp / this.core.maxHp) * 0.05;
  }

  private updateGame(delta: number) {
    this.updatePlayer(delta);
    this.updateAgents(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.player.attackCooldown = Math.max(
      0,
      this.player.attackCooldown - delta,
    );
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);

    if (
      this.waveActive &&
      this.enemies.length === 0 &&
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

  private updatePlayer(delta: number) {
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
      this.player.group.position.add(movement.multiplyScalar(delta * 4.8));
      this.clampToArena(this.player.group.position, 11.8);
      this.faceDirection(this.player.group, this.lastMove);
    }
  }

  private updateAgents(delta: number) {
    const count = this.agents.length;
    this.agents.forEach((agent, index) => {
      const angle =
        this.elapsed * 0.28 + (index / Math.max(1, count)) * Math.PI * 2;
      const radius = 1.35 + (index % 2) * 0.38;
      const targetPosition = this.player.group.position
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            1.05 + Math.sin(this.elapsed * 2.3 + index) * 0.14,
            Math.sin(angle) * radius,
          ),
        );
      agent.group.position.lerp(
        targetPosition,
        1 - Math.exp(-delta * (agent.id === "forge" ? 5 : 4)),
      );
      agent.group.rotation.y += delta * (1.1 + index * 0.16);
      const ring = agent.group.getObjectByName("agent-ring");
      if (ring) ring.rotation.z += delta * (0.8 + index * 0.12);
      agent.cooldownLeft = Math.max(0, agent.cooldownLeft - delta);
      agent.supportClock -= delta;

      if (agent.id === "covenant" && agent.supportClock <= 0) {
        agent.supportClock = 6.5;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
        this.core.hp = Math.min(this.core.maxHp, this.core.hp + 10);
        this.addRing(
          this.player.group.position,
          agent.color,
          0.4,
          3.2,
          0.72,
        );
      }

      const target = this.getNearestEnemy(agent.group.position, agent.range);
      if (!target || agent.cooldownLeft > 0) return;
      const direction = target.group.position
        .clone()
        .add(new THREE.Vector3(0, target.radius, 0))
        .sub(agent.group.position)
        .normalize();
      agent.cooldownLeft = agent.cooldown * this.agentRateMultiplier;
      if (agent.id === "kairos") {
        target.slow = Math.max(target.slow, 1.6);
        this.damageEnemy(target, agent.damage, target.group.position);
        this.addBeam(
          agent.group.position,
          target.group.position.clone().add(new THREE.Vector3(0, target.radius, 0)),
          agent.color,
          0.22,
        );
        this.addRing(target.group.position, agent.color, 0.1, 1.35, 0.38);
        return;
      }
      this.fireProjectile(
        agent.group.position.clone(),
        direction,
        agent.color,
        agent.damage,
        agent.id === "kira" ? 15 : agent.id === "forge" ? 12 : 10,
        "agent",
        agent.id === "covenant" ? 0.25 : 0,
        agent.id === "forge" ? 0.13 : 0.17,
      );
    });
  }

  private updateEnemies(delta: number) {
    for (const enemy of [...this.enemies]) {
      enemy.cooldownLeft = Math.max(0, enemy.cooldownLeft - delta);
      enemy.slow = Math.max(0, enemy.slow - delta);
      const position = enemy.group.position;
      const playerDistance = position.distanceTo(this.player.group.position);
      const targetPlayer = playerDistance < 4.2;
      const targetPosition = targetPlayer
        ? this.player.group.position
        : this.core.group.position;
      const distance = position.distanceTo(targetPosition);
      const direction = targetPosition.clone().sub(position).setY(0);
      if (direction.lengthSq() > 0.001) direction.normalize();

      enemy.body.rotation.y += delta * (enemy.type === "rootkit" ? 0.45 : 1.2);
      enemy.body.position.y =
        enemy.radius +
        Math.sin(this.elapsed * 2.4 + enemy.id) *
          (enemy.type === "trojan" ? 0.02 : 0.08);
      const halo = enemy.group.getObjectByName("enemy-halo");
      if (halo) halo.rotation.z += delta;
      enemy.healthBar.quaternion.copy(this.camera.quaternion);

      if (enemy.type === "rootkit" && enemy.hp / enemy.maxHp < 0.52 && !enemy.phaseTriggered) {
        enemy.phaseTriggered = true;
        enemy.speed *= 1.25;
        enemy.attackCooldown *= 0.8;
        const baseAngle = Math.atan2(position.z, position.x);
        for (let index = 0; index < 3; index += 1) {
          const angle = baseAngle + (index - 1) * 0.6;
          this.createEnemy(
            index === 1 ? "phisher" : "virus",
            position
              .clone()
              .add(new THREE.Vector3(Math.cos(angle) * 2, 0, Math.sin(angle) * 2)),
          );
        }
        this.addRing(position, 0xd14b34, 0.4, 4.5, 0.75, "portal");
        this.callbacks.onToast({
          eyebrow: "ROOTKIT PHASE II",
          title: "THE SHELL HAS SPLIT",
          detail: "It is faster now. Collapse the spawned processes first.",
        });
      }

      if (enemy.telegraphLeft > 0) {
        enemy.telegraphLeft -= delta;
        const pulse =
          1 + Math.sin((enemy.telegraphLeft / enemy.telegraphTotal) * Math.PI * 6) * 0.08;
        enemy.body.scale.setScalar(pulse * (enemy.type === "rootkit" ? 1.85 : enemy.type === "trojan" ? 1.12 : enemy.type === "phisher" ? 0.86 : 0.72));
        if (enemy.telegraphLeft <= 0) {
          enemy.cooldownLeft = enemy.attackCooldown;
          enemy.body.scale.setScalar(
            enemy.type === "rootkit"
              ? 1.85
              : enemy.type === "trojan"
                ? 1.12
                : enemy.type === "phisher"
                  ? 0.86
                  : 0.72,
          );
          if (enemy.type === "phisher") {
            const origin = position.clone().add(new THREE.Vector3(0, 0.8, 0));
            this.fireProjectile(
              origin,
              targetPosition.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(origin).normalize(),
              0xb7422e,
              enemy.damage,
              7.2,
              "null",
              0,
              0.2,
            );
          } else if (distance <= enemy.range + 0.9) {
            this.damageTarget(targetPlayer ? "player" : "core", enemy.damage);
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

      if (distance > Math.max(0.75, enemy.range * 0.86)) {
        const slowFactor = enemy.slow > 0 ? 0.48 : 1;
        position.add(direction.multiplyScalar(delta * enemy.speed * slowFactor));
        this.faceDirection(enemy.group, direction);
      }
    }
  }

  private updateProjectiles(delta: number) {
    for (const projectile of [...this.projectiles]) {
      projectile.life -= delta;
      projectile.mesh.position.add(
        projectile.velocity.clone().multiplyScalar(delta),
      );
      projectile.mesh.rotation.x += delta * 5;
      projectile.mesh.rotation.y += delta * 7;
      if (projectile.life <= 0) {
        this.removeProjectile(projectile);
        continue;
      }
      if (projectile.faction === "null") {
        const playerDistance = projectile.mesh.position.distanceTo(
          this.player.group.position.clone().add(new THREE.Vector3(0, 0.7, 0)),
        );
        if (playerDistance < projectile.radius + 0.52) {
          this.damageTarget("player", projectile.damage);
          this.addBurst(projectile.mesh.position, 0xb7422e, 7);
          this.removeProjectile(projectile);
          continue;
        }
        const coreDistance = projectile.mesh.position.distanceTo(
          this.core.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
        );
        if (coreDistance < projectile.radius + 1) {
          this.damageTarget("core", projectile.damage);
          this.addBurst(projectile.mesh.position, 0xb7422e, 7);
          this.removeProjectile(projectile);
        }
        continue;
      }
      for (const enemy of [...this.enemies]) {
        const distance = projectile.mesh.position.distanceTo(
          enemy.group.position.clone().add(new THREE.Vector3(0, enemy.radius, 0)),
        );
        if (distance > projectile.radius + enemy.radius) continue;
        if (projectile.slow > 0) {
          enemy.slow = Math.max(enemy.slow, projectile.slow);
        }
        this.damageEnemy(enemy, projectile.damage, projectile.mesh.position);
        this.removeProjectile(projectile);
        break;
      }
    }
  }

  private updateEffects(delta: number) {
    for (const effect of [...this.effects]) {
      effect.life -= delta;
      const progress = 1 - effect.life / effect.maxLife;
      if (effect.kind === "ring" || effect.kind === "portal") {
        const material = (effect.object as THREE.Mesh)
          .material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, (1 - progress) * (effect.kind === "portal" ? 0.72 : 0.9));
        if (effect.kind === "portal") {
          effect.object.rotation.z += delta * 2.8;
        }
      }
      if (effect.kind === "beam") {
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
      if (effect.life <= 0) {
        this.scene.remove(effect.object);
        this.effects.splice(this.effects.indexOf(effect), 1);
      }
    }
  }

  private updateCamera(delta: number) {
    this.desiredCameraTarget
      .copy(this.core.group.position)
      .multiplyScalar(0.35)
      .add(this.player.group.position.clone().multiplyScalar(0.65));
    this.cameraTarget.lerp(
      this.desiredCameraTarget,
      1 - Math.exp(-delta * 4.2),
    );
    const distance = 20;
    const cameraOffset = new THREE.Vector3(
      Math.sin(this.yaw) * distance,
      15,
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
  }

  private completeWave() {
    if (this.wave >= 3) {
      this.mode = "victory";
      this.score += Math.round(this.core.hp * 5 + this.player.hp * 3);
      this.best = Math.max(this.best, this.score);
      window.localStorage.setItem("freeman-protocol-best", String(this.best));
      this.callbacks.onMode("victory");
      this.audio.play("victory");
      this.callbacks.onToast({
        eyebrow: "MISSION COMPLETE",
        title: "THE GRID REMAINS FREE",
        detail: "The NULL siege has been contained.",
      });
      this.emitHud(true);
      return;
    }
    this.mode = "upgrade";
    this.data += 24;
    this.callbacks.onMode("upgrade");
    this.callbacks.onToast({
      eyebrow: `BREACH ${this.wave} CONTAINED`,
      title: "CHOOSE THE NEXT PROTOCOL",
      detail: "Survival earns a choice. Use it with judgment.",
    });
    this.audio.play("wave");
    this.emitHud(true);
  }

  private damageTarget(target: "player" | "core", damage: number) {
    if (target === "player") {
      if (this.player.invulnerable > 0) return;
      this.player.hp = Math.max(0, this.player.hp - damage);
      this.player.invulnerable = 0.28;
      this.addBurst(
        this.player.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
        0xb7422e,
        8,
      );
    } else {
      this.core.hp = Math.max(0, this.core.hp - damage);
      this.addBurst(
        this.core.group.position.clone().add(new THREE.Vector3(0, 1, 0)),
        0xb7422e,
        8,
      );
    }
    this.shake = Math.max(this.shake, this.reducedMotion ? 0.03 : 0.2);
    this.audio.play("damage");
    this.emitHud(true);
    if (this.player.hp <= 0 || this.core.hp <= 0) this.defeat();
  }

  private defeat() {
    if (this.mode === "defeat") return;
    this.mode = "defeat";
    this.waveActive = false;
    this.callbacks.onMode("defeat");
    this.audio.play("defeat");
    this.callbacks.onToast({
      eyebrow: "SIGNAL LOST",
      title: this.core.hp <= 0 ? "THE COVENANT FELL" : "OPERATOR OFFLINE",
      detail: "Reset the protocol. Recruit earlier. Protect what matters.",
    });
    this.emitHud(true);
  }

  private damageEnemy(
    enemy: EnemyRuntime,
    damage: number,
    hitPosition: THREE.Vector3,
  ) {
    if (!this.enemies.includes(enemy)) return;
    enemy.hp -= damage;
    const ratio = clamp01(enemy.hp / enemy.maxHp);
    enemy.healthFill.scale.x = Math.max(0.001, ratio);
    enemy.healthFill.position.x = -0.59 * (1 - ratio);
    this.player.ultimate = Math.min(
      100,
      this.player.ultimate + Math.min(8, damage * 0.12),
    );
    this.addBurst(hitPosition, 0xe77d44, 5);
    this.audio.play("hit");
    if (enemy.hp > 0) return;
    this.scene.remove(enemy.group);
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.data += enemy.reward;
    this.score += Math.round(enemy.maxHp * 10 + this.wave * 90);
    this.player.ultimate = Math.min(100, this.player.ultimate + 9);
    this.addRing(enemy.group.position, 0xd9793f, 0.2, enemy.radius * 2.4, 0.42);
    this.addBurst(
      enemy.group.position.clone().add(new THREE.Vector3(0, enemy.radius, 0)),
      0xd9793f,
      enemy.type === "rootkit" ? 22 : 11,
    );
    this.audio.play("kill");
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
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(radius, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      }),
    );
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
    this.scene.remove(projectile.mesh);
    const index = this.projectiles.indexOf(projectile);
    if (index >= 0) this.projectiles.splice(index, 1);
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
    this.effects.push(effect);
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
    this.effects.push({
      object: line,
      life: duration,
      maxLife: duration,
      kind: "beam",
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
    this.effects.push({
      object: group,
      life: 0.55,
      maxLife: 0.55,
      kind: "burst",
    });
  }

  private getNearestEnemy(position: THREE.Vector3, maxDistance = Infinity) {
    let nearest: EnemyRuntime | null = null;
    let nearestDistance = maxDistance;
    for (const enemy of this.enemies) {
      const distance = enemy.group.position.distanceTo(position);
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
      const pointerDistance = this.aimPoint.distanceTo(this.player.group.position);
      if (pointerDistance < 0.5 || this.touchMove.lengthSq() > 0) {
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

  private clearDynamic() {
    for (const enemy of [...this.enemies]) this.scene.remove(enemy.group);
    for (const agent of [...this.agents]) this.scene.remove(agent.group);
    for (const projectile of [...this.projectiles]) {
      this.scene.remove(projectile.mesh);
    }
    for (const effect of [...this.effects]) this.scene.remove(effect.object);
    this.enemies.length = 0;
    this.agents.length = 0;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.waveActive = false;
    this.waveEndClock = 0;
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const aspect = width / height;
    const viewHeight = 14 * this.zoom;
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
    this.callbacks.onHud({
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      core: Math.round(this.core.hp),
      maxCore: Math.round(this.core.maxHp),
      data: Math.round(this.data),
      wave: this.wave,
      enemies: this.enemies.length,
      score: this.score,
      best: this.best,
      dash: clamp01(1 - this.player.dashCooldown / 3),
      ultimate: clamp01(this.player.ultimate / 100),
      agents: {
        kairos: recruited("kairos"),
        kira: recruited("kira"),
        forge: recruited("forge"),
        covenant: recruited("covenant"),
      },
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
  phaseTriggered: boolean;
};

type FlatAgent = AgentDefinition & {
  x: number;
  z: number;
  cooldownLeft: number;
  supportClock: number;
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

type FlatParticle = {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
};

type FlatEffect = {
  kind: "ring" | "beam" | "burst";
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
};

const toCssColor = (color: number) =>
  `#${color.toString(16).padStart(6, "0")}`;

class FreemanCanvasEngine implements GameController {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly callbacks: GameCallbacks;
  private readonly audio = new SynthAudio();
  private readonly keys = new Set<string>();
  private readonly enemies: FlatEnemy[] = [];
  private readonly agents: FlatAgent[] = [];
  private readonly projectiles: FlatProjectile[] = [];
  private readonly effects: FlatEffect[] = [];
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
    dashCooldown: 0,
    ultimate: 0,
    invulnerable: 0,
  };
  private readonly core = { x: 0, z: 0, hp: 180, maxHp: 180 };
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
  private wave = 1;
  private waveActive = false;
  private waveEndClock = 0;
  private score = 0;
  private best = 0;
  private data = 55;
  private enemySequence = 0;
  private yaw = Math.PI / 4;
  private zoom = 1;
  private cameraX = 0;
  private cameraZ = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private elapsed = 0;
  private hudClock = 0;
  private attackMultiplier = 1;
  private agentRateMultiplier = 1;
  private dragPointer: number | null = null;
  private dragX = 0;
  private reducedMotion = false;
  private shake = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    this.canvas = canvas;
    this.context = context;
    this.callbacks = callbacks;
    this.best = Number(window.localStorage.getItem("freeman-protocol-best") || 0);
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.buildings = this.createBuildings();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
    this.emitHud(true);
    this.animate(performance.now());
  }

  start() {
    this.audio.unlock();
    this.enemies.length = 0;
    this.agents.length = 0;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.wave = 1;
    this.score = 0;
    this.data = 55;
    this.attackMultiplier = 1;
    this.agentRateMultiplier = 1;
    this.player.x = 0;
    this.player.z = 2.7;
    this.player.hp = this.player.maxHp = 100;
    this.player.damage = 25;
    this.player.attackCooldown = 0;
    this.player.dashCooldown = 0;
    this.player.ultimate = 0;
    this.player.invulnerable = 0;
    this.core.hp = this.core.maxHp = 180;
    this.mode = "playing";
    this.callbacks.onMode("playing");
    this.spawnWave(1);
    this.audio.play("wave");
    this.callbacks.onToast({
      eyebrow: "MISSION 001",
      title: "NULL BREACH DETECTED",
      detail: "Protect the Covenant Core. Recover compute. Recruit intelligence.",
    });
    this.emitHud(true);
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.callbacks.onMode("paused");
    } else if (this.mode === "paused") {
      this.mode = "playing";
      this.callbacks.onMode("playing");
    }
  }

  recruit(id: AgentId) {
    if (this.mode !== "playing") return;
    const definition = AGENTS.find((agent) => agent.id === id);
    if (!definition || this.agents.some((agent) => agent.id === id)) return;
    if (this.data < definition.cost) {
      this.callbacks.onToast({
        eyebrow: "INSUFFICIENT COMPUTE",
        title: `${definition.cost - this.data} MORE REQUIRED`,
        detail: "Destroy hostile processes to recover clean compute.",
      });
      return;
    }
    this.data -= definition.cost;
    this.agents.push({
      ...definition,
      x: this.player.x,
      z: this.player.z,
      cooldownLeft: 0.35,
      supportClock: 5,
    });
    this.addRing(this.player.x, this.player.z, definition.color, 0.3, 2.2, 0.65);
    this.addBurst(this.player.x, this.player.z, definition.color, 13);
    this.audio.play("recruit");
    this.callbacks.onToast({
      eyebrow: `AGENT ${definition.code} RECRUITED`,
      title: `${definition.name} IS ONLINE`,
      detail: definition.detail,
    });
    this.emitHud(true);
  }

  attack() {
    if (this.mode !== "playing" || this.player.attackCooldown > 0) return;
    const target = this.resolveAim();
    let dx = target.x - this.player.x;
    let dz = target.z - this.player.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    this.player.attackCooldown = 0.28;
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
    this.clampToArena(this.player, 11.8);
    this.player.dashCooldown = 3;
    this.player.invulnerable = 0.34;
    this.addBeam(startX, startZ, this.player.x, this.player.z, 0xd9793f, 0.28);
    this.addBurst(startX, startZ, 0xd9793f, 10);
    this.addRing(this.player.x, this.player.z, 0xd9793f, 0.2, 1.45, 0.3);
    this.shake = Math.max(this.shake, 0.18);
    this.audio.play("dash");
  }

  ultimate() {
    if (this.mode !== "playing" || this.player.ultimate < 100) return;
    this.player.ultimate = 0;
    const damage = 44 + this.agents.length * 8;
    for (const enemy of [...this.enemies]) {
      if (this.distance(enemy.x, enemy.z, this.player.x, this.player.z) <= 10.5) {
        enemy.slow = Math.max(enemy.slow, 2.8);
        this.damageEnemy(enemy, damage);
      }
    }
    this.addRing(this.player.x, this.player.z, 0xf1eadd, 0.4, 11, 0.9);
    this.addRing(this.player.x, this.player.z, 0x9ebfc0, 0.2, 7, 0.72);
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
      eyebrow: "ORCHESTRATION COMPLETE",
      title: "THE SWARM MOVES AS ONE",
      detail: `${this.agents.length || "No"} recruited agents amplified the command burst.`,
    });
    this.emitHud(true);
  }

  applyUpgrade(id: UpgradeId) {
    if (this.mode !== "upgrade") return;
    if (id === "overclock") this.attackMultiplier *= 1.35;
    if (id === "bastion") {
      this.player.maxHp += 25;
      this.player.hp = this.player.maxHp;
      this.core.maxHp += 20;
      this.core.hp = this.core.maxHp;
    }
    if (id === "bandwidth") {
      this.data += 70;
      this.agentRateMultiplier *= 0.82;
    }
    const selected = UPGRADES.find((upgrade) => upgrade.id === id);
    this.callbacks.onToast({
      eyebrow: "PROTOCOL INSTALLED",
      title: selected?.name ?? "SYSTEM UPGRADED",
      detail: selected?.outcome ?? "The network is stronger.",
    });
    this.wave += 1;
    this.mode = "playing";
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

  resetCamera() {
    this.yaw = Math.PI / 4;
    this.zoom = 1;
  }

  setTouchMovement(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.audio.dispose();
  }

  private createBuildings() {
    const result: FreemanCanvasEngine["buildings"] = [];
    for (let x = -16; x <= 16; x += 4) {
      const index = (x + 16) / 4;
      result.push({
        x,
        z: -16,
        width: 2.1 + (index % 3) * 0.35,
        depth: 2.1 + (index % 2) * 0.4,
        height: 2.4 + ((index * 17) % 6) * 0.6,
      });
      result.push({
        x,
        z: 16,
        width: 2.2 + ((index + 1) % 3) * 0.3,
        depth: 2.2,
        height: 2.8 + ((index * 11) % 5) * 0.68,
      });
    }
    for (let z = -12; z <= 12; z += 4) {
      const index = (z + 12) / 4;
      result.push({
        x: -16,
        z,
        width: 2.35,
        depth: 2.1 + (index % 3) * 0.28,
        height: 2.2 + ((index * 13) % 6) * 0.55,
      });
      result.push({
        x: 16,
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
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  private unbindEvents() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
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
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") this.attack();
    if (event.code === "KeyQ" || event.code === "ShiftLeft") this.dash();
    if (event.code === "KeyR") this.ultimate();
    if (event.code === "KeyZ") this.rotateCamera(-1);
    if (event.code === "KeyC") this.rotateCamera(1);
    if (event.code === "KeyF") this.resetCamera();
    if (event.code === "Escape") this.togglePause();
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const agent = AGENTS[index];
      if (agent) this.recruit(agent.id);
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus();
    if (event.button === 2) {
      this.dragPointer = event.pointerId;
      this.dragX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 0) {
      this.updateAim(event);
      this.attack();
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.dragPointer === event.pointerId) {
      const delta = event.clientX - this.dragX;
      this.dragX = event.clientX;
      this.yaw -= delta * 0.008;
      return;
    }
    this.updateAim(event);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.dragPointer === event.pointerId) {
      this.dragPointer = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    }
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
  }

  private animate = (time: number) => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    this.elapsed += delta;
    if (this.mode === "playing") this.updateGame(delta);
    this.updateEffects(delta);
    this.updateCamera(delta);
    this.draw();
  };

  private updateGame(delta: number) {
    this.updatePlayer(delta);
    this.updateAgents(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.player.attackCooldown = Math.max(
      0,
      this.player.attackCooldown - delta,
    );
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);

    if (
      this.waveActive &&
      this.enemies.length === 0 &&
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
    this.player.x += dx * delta * 4.8;
    this.player.z += dz * delta * 4.8;
    this.clampToArena(this.player, 11.8);
  }

  private updateAgents(delta: number) {
    const count = this.agents.length;
    this.agents.forEach((agent, index) => {
      const angle =
        this.elapsed * 0.28 + (index / Math.max(1, count)) * Math.PI * 2;
      const radius = 1.35 + (index % 2) * 0.38;
      const targetX = this.player.x + Math.cos(angle) * radius;
      const targetZ = this.player.z + Math.sin(angle) * radius;
      const ease = 1 - Math.exp(-delta * (agent.id === "forge" ? 5 : 4));
      agent.x += (targetX - agent.x) * ease;
      agent.z += (targetZ - agent.z) * ease;
      agent.cooldownLeft = Math.max(0, agent.cooldownLeft - delta);
      agent.supportClock -= delta;
      if (agent.id === "covenant" && agent.supportClock <= 0) {
        agent.supportClock = 6.5;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
        this.core.hp = Math.min(this.core.maxHp, this.core.hp + 10);
        this.addRing(this.player.x, this.player.z, agent.color, 0.4, 3.2, 0.72);
      }
      const target = this.getNearestEnemy(agent.x, agent.z, agent.range);
      if (!target || agent.cooldownLeft > 0) return;
      let dx = target.x - agent.x;
      let dz = target.z - agent.z;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      agent.cooldownLeft = agent.cooldown * this.agentRateMultiplier;
      if (agent.id === "kairos") {
        target.slow = Math.max(target.slow, 1.6);
        this.damageEnemy(target, agent.damage);
        this.addBeam(agent.x, agent.z, target.x, target.z, agent.color, 0.22);
        this.addRing(target.x, target.z, agent.color, 0.1, 1.35, 0.38);
        return;
      }
      this.projectiles.push({
        x: agent.x,
        z: agent.z,
        vx: dx * (agent.id === "kira" ? 15 : agent.id === "forge" ? 12 : 10),
        vz: dz * (agent.id === "kira" ? 15 : agent.id === "forge" ? 12 : 10),
        life: 2.2,
        damage: agent.damage,
        radius: agent.id === "forge" ? 0.14 : 0.18,
        color: toCssColor(agent.color),
        faction: "agent",
        slow: agent.id === "covenant" ? 0.25 : 0,
      });
    });
  }

  private updateEnemies(delta: number) {
    for (const enemy of [...this.enemies]) {
      enemy.cooldownLeft = Math.max(0, enemy.cooldownLeft - delta);
      enemy.slow = Math.max(0, enemy.slow - delta);
      const playerDistance = this.distance(
        enemy.x,
        enemy.z,
        this.player.x,
        this.player.z,
      );
      const targetPlayer = playerDistance < 4.2;
      const targetX = targetPlayer ? this.player.x : this.core.x;
      const targetZ = targetPlayer ? this.player.z : this.core.z;
      const distance = this.distance(enemy.x, enemy.z, targetX, targetZ);

      if (
        enemy.type === "rootkit" &&
        enemy.hp / enemy.maxHp < 0.52 &&
        !enemy.phaseTriggered
      ) {
        enemy.phaseTriggered = true;
        enemy.speed *= 1.25;
        enemy.attackCooldown *= 0.8;
        const baseAngle = Math.atan2(enemy.z, enemy.x);
        for (let index = 0; index < 3; index += 1) {
          const angle = baseAngle + (index - 1) * 0.6;
          this.createEnemy(
            index === 1 ? "phisher" : "virus",
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

      if (enemy.telegraphLeft > 0) {
        enemy.telegraphLeft -= delta;
        if (enemy.telegraphLeft <= 0) {
          enemy.cooldownLeft = enemy.attackCooldown;
          if (enemy.type === "phisher") {
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
            this.damageTarget(targetPlayer ? "player" : "core", enemy.damage);
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

      if (distance > Math.max(0.75, enemy.range * 0.86)) {
        const slowFactor = enemy.slow > 0 ? 0.48 : 1;
        const length = distance || 1;
        enemy.x +=
          ((targetX - enemy.x) / length) * delta * enemy.speed * slowFactor;
        enemy.z +=
          ((targetZ - enemy.z) / length) * delta * enemy.speed * slowFactor;
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
        if (
          this.distance(
            projectile.x,
            projectile.z,
            this.player.x,
            this.player.z,
          ) <
          projectile.radius + 0.52
        ) {
          this.damageTarget("player", projectile.damage);
          this.addBurst(projectile.x, projectile.z, 0xb7422e, 7);
          this.removeProjectile(projectile);
          continue;
        }
        if (
          this.distance(
            projectile.x,
            projectile.z,
            this.core.x,
            this.core.z,
          ) <
          projectile.radius + 1
        ) {
          this.damageTarget("core", projectile.damage);
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
        }
        this.damageEnemy(enemy, projectile.damage);
        this.removeProjectile(projectile);
        break;
      }
    }
  }

  private updateEffects(delta: number) {
    for (const effect of [...this.effects]) {
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
        this.effects.splice(this.effects.indexOf(effect), 1);
      }
    }
  }

  private updateCamera(delta: number) {
    const targetX = this.core.x * 0.35 + this.player.x * 0.65;
    const targetZ = this.core.z * 0.35 + this.player.z * 0.65;
    const ease = 1 - Math.exp(-delta * 4.2);
    this.cameraX += (targetX - this.cameraX) * ease;
    this.cameraZ += (targetZ - this.cameraZ) * ease;
    this.shake = Math.max(0, this.shake - delta * 1.8);
  }

  private spawnWave(wave: number) {
    this.waveActive = true;
    this.waveEndClock = 0;
    const types: EnemyType[] =
      wave === 1
        ? ["virus", "virus", "virus", "virus", "virus", "phisher"]
        : wave === 2
          ? [
              "virus",
              "virus",
              "virus",
              "virus",
              "virus",
              "phisher",
              "phisher",
              "phisher",
              "trojan",
              "trojan",
            ]
          : [
              "rootkit",
              "virus",
              "virus",
              "virus",
              "virus",
              "phisher",
              "phisher",
              "trojan",
            ];
    types.forEach((type, index) => {
      const angle =
        (index / types.length) * Math.PI * 2 +
        wave * 0.38 +
        (index % 2) * 0.12;
      const radius = type === "rootkit" ? 11 : 9.6 + (index % 3) * 1.25;
      this.createEnemy(
        type,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    });
    if (wave === 3) {
      this.callbacks.onToast({
        eyebrow: "FINAL BREACH",
        title: "ROOTKIT PRIME HAS ENTERED",
        detail: "Break its shell before it reaches the Covenant Core.",
      });
    }
    this.emitHud(true);
  }

  private createEnemy(type: EnemyType, x: number, z: number) {
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
        | "phaseTriggered"
      >
    > = {
      virus: {
        hp: 54,
        speed: 2.1,
        damage: 10,
        range: 1.05,
        attackCooldown: 1.45,
        telegraphTotal: 0.6,
        reward: 14,
        radius: 0.46,
      },
      phisher: {
        hp: 72,
        speed: 1.35,
        damage: 13,
        range: 6,
        attackCooldown: 2.1,
        telegraphTotal: 0.82,
        reward: 20,
        radius: 0.55,
      },
      trojan: {
        hp: 138,
        speed: 0.9,
        damage: 22,
        range: 1.45,
        attackCooldown: 2.4,
        telegraphTotal: 0.72,
        reward: 30,
        radius: 0.82,
      },
      rootkit: {
        hp: 560,
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
    const enemy: FlatEnemy = {
      id: ++this.enemySequence,
      type,
      x,
      z,
      ...definition,
      maxHp: definition.hp,
      cooldownLeft: 0.4 + Math.random() * 0.8,
      telegraphLeft: 0,
      slow: 0,
      phaseTriggered: false,
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

  private completeWave() {
    if (this.wave >= 3) {
      this.mode = "victory";
      this.score += Math.round(this.core.hp * 5 + this.player.hp * 3);
      this.best = Math.max(this.best, this.score);
      window.localStorage.setItem("freeman-protocol-best", String(this.best));
      this.callbacks.onMode("victory");
      this.audio.play("victory");
      this.callbacks.onToast({
        eyebrow: "MISSION COMPLETE",
        title: "THE GRID REMAINS FREE",
        detail: "The NULL siege has been contained.",
      });
      this.emitHud(true);
      return;
    }
    this.mode = "upgrade";
    this.data += 24;
    this.callbacks.onMode("upgrade");
    this.callbacks.onToast({
      eyebrow: `BREACH ${this.wave} CONTAINED`,
      title: "CHOOSE THE NEXT PROTOCOL",
      detail: "Survival earns a choice. Use it with judgment.",
    });
    this.audio.play("wave");
    this.emitHud(true);
  }

  private damageTarget(target: "player" | "core", damage: number) {
    if (target === "player") {
      if (this.player.invulnerable > 0) return;
      this.player.hp = Math.max(0, this.player.hp - damage);
      this.player.invulnerable = 0.28;
      this.addBurst(this.player.x, this.player.z, 0xb7422e, 8);
    } else {
      this.core.hp = Math.max(0, this.core.hp - damage);
      this.addBurst(this.core.x, this.core.z, 0xb7422e, 8);
    }
    this.shake = Math.max(this.shake, this.reducedMotion ? 0.03 : 0.2);
    this.audio.play("damage");
    this.emitHud(true);
    if (this.player.hp <= 0 || this.core.hp <= 0) this.defeat();
  }

  private defeat() {
    if (this.mode === "defeat") return;
    this.mode = "defeat";
    this.waveActive = false;
    this.callbacks.onMode("defeat");
    this.audio.play("defeat");
    this.callbacks.onToast({
      eyebrow: "SIGNAL LOST",
      title: this.core.hp <= 0 ? "THE COVENANT FELL" : "OPERATOR OFFLINE",
      detail: "Reset the protocol. Recruit earlier. Protect what matters.",
    });
    this.emitHud(true);
  }

  private damageEnemy(enemy: FlatEnemy, damage: number) {
    if (!this.enemies.includes(enemy)) return;
    enemy.hp -= damage;
    this.player.ultimate = Math.min(
      100,
      this.player.ultimate + Math.min(8, damage * 0.12),
    );
    this.addBurst(enemy.x, enemy.z, 0xe77d44, 5);
    this.audio.play("hit");
    if (enemy.hp > 0) return;
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.data += enemy.reward;
    this.score += Math.round(enemy.maxHp * 10 + this.wave * 90);
    this.player.ultimate = Math.min(100, this.player.ultimate + 9);
    this.addRing(enemy.x, enemy.z, 0xd9793f, 0.2, enemy.radius * 2.4, 0.42);
    this.addBurst(
      enemy.x,
      enemy.z,
      0xd9793f,
      enemy.type === "rootkit" ? 22 : 11,
    );
    this.audio.play("kill");
    this.emitHud(true);
  }

  private removeProjectile(projectile: FlatProjectile) {
    const index = this.projectiles.indexOf(projectile);
    if (index >= 0) this.projectiles.splice(index, 1);
  }

  private addRing(
    x: number,
    z: number,
    color: number,
    radiusStart: number,
    radiusEnd: number,
    duration: number,
  ) {
    this.effects.push({
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
    this.effects.push({
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
    const particles: FlatParticle[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.3;
      const speed = 0.8 + (index % 4) * 0.35;
      particles.push({
        x,
        z,
        y: 0.5,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        vy: 0.6 + (index % 5) * 0.17,
      });
    }
    this.effects.push({
      kind: "burst",
      x,
      z,
      x2: x,
      z2: z,
      life: 0.55,
      maxLife: 0.55,
      color: toCssColor(color),
      radiusStart: 0,
      radiusEnd: 0,
      particles,
    });
  }

  private getNearestEnemy(x: number, z: number, maxDistance = Infinity) {
    let nearest: FlatEnemy | null = null;
    let nearestDistance = maxDistance;
    for (const enemy of this.enemies) {
      const distance = this.distance(x, z, enemy.x, enemy.z);
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
      (aimDistance < 0.5 ||
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
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.7);
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
    const scale = Math.min(this.width, this.height) / (20 * this.zoom);
    return {
      x: this.width / 2 + cameraSpaceX * scale + shakeX,
      y:
        this.height * 0.49 +
        cameraSpaceZ * scale * 0.55 -
        y * scale +
        shakeY,
      depth: cameraSpaceZ,
      scale,
    };
  }

  private unproject(screenX: number, screenY: number) {
    const scale = Math.min(this.width, this.height) / (20 * this.zoom);
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
    context.setTransform(
      this.pixelRatio,
      0,
      0,
      this.pixelRatio,
      0,
      0,
    );
    context.clearRect(0, 0, this.width, this.height);
    const background = context.createRadialGradient(
      this.width * 0.5,
      this.height * 0.46,
      30,
      this.width * 0.5,
      this.height * 0.46,
      Math.max(this.width, this.height) * 0.72,
    );
    background.addColorStop(0, "#111717");
    background.addColorStop(0.42, "#080c0c");
    background.addColorStop(1, "#030505");
    context.fillStyle = background;
    context.fillRect(0, 0, this.width, this.height);

    this.drawGrid();
    this.drawPlatform();

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
      depth: this.project(this.player.x, this.player.z).depth,
      draw: () => this.drawPlayer(),
    });
    for (const agent of this.agents) {
      drawables.push({
        depth: this.project(agent.x, agent.z).depth,
        draw: () => this.drawAgent(agent),
      });
    }
    for (const enemy of this.enemies) {
      drawables.push({
        depth: this.project(enemy.x, enemy.z).depth,
        draw: () => this.drawEnemy(enemy),
      });
    }
    drawables.sort((a, b) => a.depth - b.depth);
    drawables.forEach((drawable) => drawable.draw());
    this.drawProjectiles();
    this.drawEffects();
  }

  private drawGrid() {
    const context = this.context;
    context.save();
    context.lineWidth = 1;
    for (let value = -20; value <= 20; value += 2) {
      const horizontalStart = this.project(-20, value);
      const horizontalEnd = this.project(20, value);
      context.beginPath();
      context.moveTo(horizontalStart.x, horizontalStart.y);
      context.lineTo(horizontalEnd.x, horizontalEnd.y);
      context.strokeStyle =
        value === 0 ? "rgba(220,117,64,.18)" : "rgba(120,150,148,.075)";
      context.stroke();

      const verticalStart = this.project(value, -20);
      const verticalEnd = this.project(value, 20);
      context.beginPath();
      context.moveTo(verticalStart.x, verticalStart.y);
      context.lineTo(verticalEnd.x, verticalEnd.y);
      context.stroke();
    }
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
    context.fillStyle = "rgba(15,21,20,.92)";
    context.fill();
    context.strokeStyle = "rgba(220,117,64,.35)";
    context.lineWidth = 1;
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
      context.strokeStyle = "rgba(158,191,192,.08)";
      context.lineWidth = 1;
      context.stroke();
    };
    context.save();
    polygon([base[0], base[1], top[1], top[0]], "#0a0e0e");
    polygon([base[1], base[2], top[2], top[1]], "#101515");
    polygon(top, "#171d1c");
    const stripStart = this.project(x - width / 2, z - depth / 2, height * 0.62);
    const stripEnd = this.project(x + width / 2, z - depth / 2, height * 0.62);
    context.beginPath();
    context.moveTo(stripStart.x, stripStart.y);
    context.lineTo(stripEnd.x, stripEnd.y);
    context.strokeStyle = "rgba(220,117,64,.28)";
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
    context.ellipse(base.x, base.y + 8, scale * 1.35, scale * 0.46, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#151a19";
    context.strokeStyle = "rgba(220,117,64,.48)";
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
    context.shadowBlur = 22;
    context.fillStyle = "#e5d9c9";
    context.beginPath();
    context.moveTo(crystal.x, crystal.y - scale * 0.62);
    context.lineTo(crystal.x + scale * 0.4, crystal.y);
    context.lineTo(crystal.x, crystal.y + scale * 0.72);
    context.lineTo(crystal.x - scale * 0.4, crystal.y);
    context.closePath();
    context.fill();
    context.strokeStyle = "#dc7540";
    context.stroke();
    context.restore();
  }

  private drawPlayer() {
    const context = this.context;
    const feet = this.project(this.player.x, this.player.z);
    const torso = this.project(this.player.x, this.player.z, 1);
    const head = this.project(this.player.x, this.player.z, 1.72);
    const scale = feet.scale;
    context.save();
    context.fillStyle = "rgba(0,0,0,.5)";
    context.beginPath();
    context.ellipse(feet.x, feet.y + 6, scale * 0.52, scale * 0.2, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(220,117,64,.75)";
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(feet.x, feet.y + 3, scale * 0.72, scale * 0.27, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#282b29";
    context.beginPath();
    context.moveTo(torso.x - scale * 0.37, torso.y - scale * 0.25);
    context.lineTo(torso.x + scale * 0.37, torso.y - scale * 0.25);
    context.lineTo(feet.x + scale * 0.44, feet.y);
    context.lineTo(feet.x - scale * 0.44, feet.y);
    context.closePath();
    context.fill();
    context.strokeStyle = "#dc7540";
    context.stroke();
    context.fillStyle = "#b98b72";
    context.beginPath();
    context.arc(head.x, head.y, scale * 0.24, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#9ebfc0";
    context.lineWidth = Math.max(1, scale * 0.07);
    context.beginPath();
    context.moveTo(head.x - scale * 0.19, head.y);
    context.lineTo(head.x + scale * 0.19, head.y);
    context.stroke();
    const aimScreen = this.project(this.aim.x, this.aim.z, 0.8);
    let dx = aimScreen.x - torso.x;
    let dy = aimScreen.y - torso.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    context.strokeStyle = "#dc7540";
    context.lineWidth = Math.max(2, scale * 0.08);
    context.beginPath();
    context.moveTo(torso.x, torso.y);
    context.lineTo(torso.x + dx * scale * 0.9, torso.y + dy * scale * 0.9);
    context.stroke();
    context.restore();
  }

  private drawAgent(agent: FlatAgent) {
    const context = this.context;
    const point = this.project(
      agent.x,
      agent.z,
      1.05 + Math.sin(this.elapsed * 2.3 + Number(agent.code)) * 0.14,
    );
    const size = point.scale * 0.28;
    context.save();
    context.shadowColor = toCssColor(agent.color);
    context.shadowBlur = 17;
    context.strokeStyle = toCssColor(agent.color);
    context.fillStyle = "#111616";
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(point.x, point.y - size);
    context.lineTo(point.x + size, point.y);
    context.lineTo(point.x, point.y + size);
    context.lineTo(point.x - size, point.y);
    context.closePath();
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = toCssColor(agent.color);
    context.font = `${Math.max(6, point.scale * 0.12)}px var(--mono)`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(agent.code, point.x, point.y);
    context.restore();
  }

  private drawEnemy(enemy: FlatEnemy) {
    const context = this.context;
    const point = this.project(
      enemy.x,
      enemy.z,
      enemy.radius + Math.sin(this.elapsed * 2.4 + enemy.id) * 0.05,
    );
    const floor = this.project(enemy.x, enemy.z);
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
      enemy.telegraphLeft > 0
        ? 1 + Math.sin(this.elapsed * 18) * 0.09
        : 1;
    const size = baseSize * pulse;
    context.save();
    context.fillStyle = "rgba(0,0,0,.48)";
    context.beginPath();
    context.ellipse(floor.x, floor.y + 4, size * 0.9, size * 0.28, 0, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = color;
    context.shadowBlur = enemy.type === "rootkit" ? 28 : 13;
    context.fillStyle = "#241212";
    context.strokeStyle = color;
    context.lineWidth = enemy.type === "rootkit" ? 2 : 1.2;
    context.beginPath();
    if (enemy.type === "phisher") {
      context.moveTo(point.x, point.y - size);
      context.lineTo(point.x + size * 0.88, point.y + size * 0.7);
      context.lineTo(point.x - size * 0.88, point.y + size * 0.7);
    } else if (enemy.type === "trojan") {
      context.rect(point.x - size * 0.75, point.y - size * 0.75, size * 1.5, size * 1.5);
    } else {
      const sides = enemy.type === "rootkit" ? 10 : 7;
      for (let index = 0; index < sides; index += 1) {
        const angle = (index / sides) * Math.PI * 2 - Math.PI / 2;
        const radius = index % 2 === 0 ? size : size * 0.72;
        const x = point.x + Math.cos(angle) * radius;
        const y = point.y + Math.sin(angle) * radius;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    const healthWidth = Math.max(28, size * 1.6);
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
    context.restore();
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
          (effect.radiusEnd - effect.radiusStart) *
            (1 - (1 - progress) ** 2);
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
      if (effect.kind === "burst") {
        for (const particle of effect.particles) {
          const point = this.project(particle.x, particle.z, particle.y);
          const size = 1.5 + opacity * 2.5;
          context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        }
      }
      context.restore();
    }
  }

  private emitHud(force = false) {
    if (!force && this.hudClock > 0) return;
    const recruited = (id: AgentId) =>
      this.agents.some((agent) => agent.id === id);
    this.callbacks.onHud({
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      core: Math.round(this.core.hp),
      maxCore: Math.round(this.core.maxHp),
      data: Math.round(this.data),
      wave: this.wave,
      enemies: this.enemies.length,
      score: this.score,
      best: this.best,
      dash: clamp01(1 - this.player.dashCooldown / 3),
      ultimate: clamp01(this.player.ultimate / 100),
      agents: {
        kairos: recruited("kairos"),
        kira: recruited("kira"),
        forge: recruited("forge"),
        covenant: recruited("covenant"),
      },
    });
  }
}

function VirtualStick({
  onMove,
}: {
  onMove: (x: number, y: number) => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const update = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const radius = rect.width / 2;
      let x = event.clientX - (rect.left + radius);
      let y = event.clientY - (rect.top + radius);
      const length = Math.hypot(x, y);
      if (length > radius * 0.66) {
        x = (x / length) * radius * 0.66;
        y = (y / length) * radius * 0.66;
      }
      setPosition({ x, y });
      onMove(x / (radius * 0.66), y / (radius * 0.66));
    },
    [onMove],
  );

  return (
    <div
      ref={baseRef}
      className="virtual-stick"
      aria-label="Movement control"
      onPointerDown={(event) => {
        pointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current === event.pointerId) update(event);
      }}
      onPointerUp={(event) => {
        if (pointerRef.current !== event.pointerId) return;
        pointerRef.current = null;
        setPosition({ x: 0, y: 0 });
        onMove(0, 0);
      }}
      onPointerCancel={() => {
        pointerRef.current = null;
        setPosition({ x: 0, y: 0 });
        onMove(0, 0);
      }}
    >
      <span
        className="virtual-stick__knob"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      />
    </div>
  );
}

export default function FreemanProtocol() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameController | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<GameMode>("intro");
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [muted, setMuted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const callbacks: GameCallbacks = {
      onMode: setMode,
      onHud: setHud,
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
      if (
        !(error instanceof Error) ||
        error.message !== "WEBGL_UNAVAILABLE"
      ) {
        throw error;
      }
      engine = new FreemanCanvasEngine(canvas, callbacks);
    }
    engineRef.current = engine;
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const setTouchMovement = useCallback((x: number, y: number) => {
    engineRef.current?.setTouchMovement(x, y);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  };

  const isOverlay = mode !== "playing";
  const recruitedCount = Object.values(hud.agents).filter(Boolean).length;

  return (
    <main className="game-shell">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        aria-label="Freeman Protocol isometric combat arena"
      />

      <div className="atmosphere" aria-hidden="true" />
      <div className="frame-corners" aria-hidden="true" />

      <header className="hud-top">
        <div className="hud-brand">
          <span className="hud-brand__sigil">F</span>
          <span>
            <strong>FREEMAN / PROTOCOL</strong>
            <small>KAIROS SYSTEM · MISSION 001</small>
          </span>
        </div>

        <div className="wave-state" aria-label={`Breach ${hud.wave} of 3`}>
          <span>BREACH</span>
          {[1, 2, 3].map((wave) => (
            <i
              key={wave}
              className={
                wave < hud.wave
                  ? "is-cleared"
                  : wave === hud.wave
                    ? "is-active"
                    : ""
              }
            >
              {String(wave).padStart(2, "0")}
            </i>
          ))}
        </div>

        <div className="hud-actions">
          <button type="button" onClick={() => setHelpOpen(true)}>
            CONTROLS
          </button>
          <button type="button" onClick={toggleMute} aria-pressed={muted}>
            AUDIO {muted ? "OFF" : "ON"}
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.togglePause()}
            disabled={mode === "intro" || mode === "defeat" || mode === "victory"}
          >
            {mode === "paused" ? "RESUME" : "PAUSE"}
          </button>
        </div>
      </header>

      {mode !== "intro" && (
        <>
          <aside className="vitals-panel">
            <p className="panel-label">IAN GOH · BRIDGE OPERATOR</p>
            <div className="vital-row">
              <span>INTEGRITY</span>
              <strong>
                {hud.hp}<small>/{hud.maxHp}</small>
              </strong>
            </div>
            <div className="meter">
              <i style={{ width: `${clamp01(hud.hp / hud.maxHp) * 100}%` }} />
            </div>
            <div className="vital-row core-row">
              <span>COVENANT CORE</span>
              <strong>
                {hud.core}<small>/{hud.maxCore}</small>
              </strong>
            </div>
            <div className="meter meter--core">
              <i style={{ width: `${clamp01(hud.core / hud.maxCore) * 100}%` }} />
            </div>
            <div className="resource-grid">
              <span>
                <small>CLEAN COMPUTE</small>
                <strong>{String(hud.data).padStart(3, "0")}</strong>
              </span>
              <span>
                <small>HOSTILES</small>
                <strong>{String(hud.enemies).padStart(2, "0")}</strong>
              </span>
              <span>
                <small>SCORE</small>
                <strong>{hud.score.toLocaleString()}</strong>
              </span>
            </div>
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

          <section className="agent-dock" aria-label="AI agent recruitment">
            <div className="agent-dock__heading">
              <span>
                <small>YOUR SWARM</small>
                <strong>
                  RECRUIT INTELLIGENCE <b>{recruitedCount}/4</b>
                </strong>
              </span>
              <span className="desktop-only">PRESS 1–4 TO DEPLOY</span>
            </div>
            <div className="agent-grid">
              {AGENTS.map((agent, index) => {
                const recruited = hud.agents[agent.id];
                const affordable = hud.data >= agent.cost;
                return (
                  <button
                    type="button"
                    key={agent.id}
                    className={`agent-card ${recruited ? "is-recruited" : ""}`}
                    onClick={() => engineRef.current?.recruit(agent.id)}
                    disabled={recruited || mode !== "playing"}
                    aria-label={
                      recruited
                        ? `${agent.name} recruited`
                        : `Recruit ${agent.name} for ${agent.cost} compute`
                    }
                  >
                    <span
                      className="agent-card__node"
                      style={{ "--agent-color": `#${agent.color.toString(16).padStart(6, "0")}` } as React.CSSProperties}
                    >
                      {agent.code}
                    </span>
                    <span className="agent-card__copy">
                      <small>{agent.role}</small>
                      <strong>{agent.name}</strong>
                    </span>
                    <span
                      className={`agent-card__cost ${!affordable && !recruited ? "is-low" : ""}`}
                    >
                      {recruited ? "ONLINE" : `${agent.cost} C`}
                    </span>
                    <kbd>{index + 1}</kbd>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="combat-actions">
            <button
              type="button"
              className="ability ability--dash"
              onClick={() => engineRef.current?.dash()}
              disabled={mode !== "playing" || hud.dash < 1}
              aria-label="Dash"
            >
              <i style={{ "--charge": hud.dash } as React.CSSProperties} />
              <small>Q</small>
              <strong>DASH</strong>
            </button>
            <button
              type="button"
              className="ability ability--attack"
              onClick={() => engineRef.current?.attack()}
              disabled={mode !== "playing"}
              aria-label="Command burst"
            >
              <small>SPACE</small>
              <strong>BURST</strong>
            </button>
            <button
              type="button"
              className={`ability ability--ultimate ${hud.ultimate >= 1 ? "is-ready" : ""}`}
              onClick={() => engineRef.current?.ultimate()}
              disabled={mode !== "playing" || hud.ultimate < 1}
              aria-label="Orchestrate ultimate ability"
            >
              <i style={{ "--charge": hud.ultimate } as React.CSSProperties} />
              <small>R</small>
              <strong>ORCHESTRATE</strong>
            </button>
          </div>

          <div className="mobile-stick">
            <VirtualStick onMove={setTouchMovement} />
          </div>
        </>
      )}

      {toast && (
        <div className="mission-toast" key={toast.id} role="status">
          <small>{toast.eyebrow}</small>
          <strong>{toast.title}</strong>
          <span>{toast.detail}</span>
        </div>
      )}

      {mode === "intro" && (
        <section className="intro-screen">
          <div className="intro-copy">
            <span className="eyebrow">A KAIROS FIELD EXPERIMENT · 2026</span>
            <div className="intro-mark">
              <span>F</span>
              <i>00</i>
            </div>
            <h1>
              FREEMAN
              <em>PROTOCOL</em>
            </h1>
            <p className="intro-lede">
              The grid does not need another hero.
              <br />
              It needs an operator.
            </p>
            <p className="intro-mission">
              Recruit intelligence. Build the Kingdom. Protect the Covenant.
              Secure the Freeman.
            </p>
            <button
              type="button"
              className="enter-button"
              onClick={() => engineRef.current?.start()}
            >
              <span>ENTER THE GRID</span>
              <i>→</i>
            </button>
          </div>

          <div className="intro-brief">
            <span className="intro-brief__line" />
            <p>
              <small>MISSION 001</small>
              <strong>THE NULL SIEGE</strong>
            </p>
            <p>
              <small>OPERATOR</small>
              <strong>IAN GOH · BRIDGE CLASS</strong>
            </p>
            <p>
              <small>DIRECTIVE</small>
              <strong>DEFEND THE COVENANT CORE</strong>
            </p>
          </div>

          <footer className="intro-footer">
            <span>DESKTOP + TOUCH ENABLED</span>
            <span>MOVE · AIM · RECRUIT · ORCHESTRATE</span>
          </footer>
        </section>
      )}

      {mode === "upgrade" && (
        <section className="overlay-screen protocol-screen">
          <div className="overlay-copy">
            <span className="eyebrow">BREACH {hud.wave} CONTAINED</span>
            <h2>Judgment is the upgrade.</h2>
            <p>Choose one protocol before the next attack reaches the grid.</p>
          </div>
          <div className="protocol-grid">
            {UPGRADES.map((upgrade) => (
              <button
                type="button"
                key={upgrade.id}
                onClick={() => engineRef.current?.applyUpgrade(upgrade.id)}
              >
                <small>{upgrade.index}</small>
                <span>
                  <em>INSTALL PROTOCOL</em>
                  <strong>{upgrade.name}</strong>
                  <p>{upgrade.detail}</p>
                </span>
                <b>{upgrade.outcome}</b>
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === "paused" && (
        <section className="overlay-screen pause-screen">
          <span className="eyebrow">SIMULATION SUSPENDED</span>
          <h2>Hold the line.</h2>
          <p>The grid will remain frozen until you return.</p>
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
            {mode === "victory" ? "MISSION COMPLETE" : "SIGNAL LOST"}
          </span>
          <h2>
            {mode === "victory"
              ? "The grid remains free."
              : hud.core <= 0
                ? "The Covenant fell."
                : "Operator offline."}
          </h2>
          <p>
            {mode === "victory"
              ? "You did not fight alone. You built a system that could."
              : "Survival is information. Reset, recruit earlier, and return."}
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
              <small>AGENTS</small>
              <strong>{recruitedCount}/4</strong>
            </span>
          </div>
          <button
            type="button"
            className="enter-button enter-button--compact"
            onClick={() => engineRef.current?.start()}
          >
            <span>{mode === "victory" ? "RUN IT AGAIN" : "RESET PROTOCOL"}</span>
            <i>→</i>
          </button>
        </section>
      )}

      {helpOpen && (
        <section className="help-dialog" role="dialog" aria-modal="true" aria-label="Controls">
          <button
            type="button"
            className="help-dialog__close"
            onClick={() => setHelpOpen(false)}
            aria-label="Close controls"
          >
            ×
          </button>
          <span className="eyebrow">OPERATOR MANUAL</span>
          <h2>Move with intent.</h2>
          <div className="control-list">
            <span><kbd>WASD</kbd><b>Move</b></span>
            <span><kbd>CLICK / SPACE</kbd><b>Command burst</b></span>
            <span><kbd>Q / SHIFT</kbd><b>Dash</b></span>
            <span><kbd>R</kbd><b>Orchestrate swarm</b></span>
            <span><kbd>1–4</kbd><b>Recruit agents</b></span>
            <span><kbd>RIGHT DRAG</kbd><b>Rotate camera</b></span>
            <span><kbd>WHEEL</kbd><b>Zoom camera</b></span>
            <span><kbd>Z / C / F</kbd><b>Rotate / reset view</b></span>
          </div>
          <p>On touch, use the left stick and the three action controls.</p>
        </section>
      )}

      {helpOpen && (
        <button
          type="button"
          className="dialog-backdrop"
          aria-label="Close controls"
          onClick={() => setHelpOpen(false)}
        />
      )}

      <div className={`overlay-fade ${isOverlay ? "is-visible" : ""}`} aria-hidden="true" />
    </main>
  );
}
