import * as THREE from "three";
import { getLootPresentation } from "./loot-rules.mjs";

export type ResourceOwnership = {
  sharedGeometries?: ReadonlySet<THREE.BufferGeometry>;
  sharedMaterials?: ReadonlySet<THREE.Material>;
  disposed?: WeakSet<object>;
};

const TEXTURE_KEYS = [
  "map",
  "alphaMap",
  "aoMap",
  "bumpMap",
  "displacementMap",
  "emissiveMap",
  "envMap",
  "lightMap",
  "metalnessMap",
  "normalMap",
  "roughnessMap",
] as const;

export function disposeObject3D(
  root: THREE.Object3D,
  ownership: ResourceOwnership = {},
) {
  const disposed = ownership.disposed ?? new WeakSet<object>();
  root.removeFromParent();
  root.traverse((object) => {
    if (
      !(
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points ||
        object instanceof THREE.Sprite
      )
    ) {
      return;
    }

    if (
      "geometry" in object &&
      object.geometry &&
      !ownership.sharedGeometries?.has(object.geometry) &&
      !disposed.has(object.geometry)
    ) {
      disposed.add(object.geometry);
      object.geometry.dispose();
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material || ownership.sharedMaterials?.has(material)) continue;
      for (const key of TEXTURE_KEYS) {
        const texture = (
          material as THREE.Material & Partial<Record<(typeof TEXTURE_KEYS)[number], THREE.Texture>>
        )[key];
        if (texture && !disposed.has(texture)) {
          disposed.add(texture);
          texture.dispose();
        }
      }
      if (!disposed.has(material)) {
        disposed.add(material);
        material.dispose();
      }
    }
  });
}

export class BoundedPool<T> {
  private readonly available: T[] = [];

  constructor(private readonly capacity: number) {}

  acquire(create: () => T) {
    return this.available.pop() ?? create();
  }

  release(
    value: T,
    reset: (value: T) => void,
    dispose: (value: T) => void,
  ) {
    reset(value);
    if (this.available.length < this.capacity) this.available.push(value);
    else dispose(value);
  }

  clear(dispose: (value: T) => void) {
    for (const value of this.available) dispose(value);
    this.available.length = 0;
  }

  get size() {
    return this.available.length;
  }
}

export type LowPolyWarRobotType = "virus" | "phisher" | "trojan" | "rootkit";

export type LowPolyWarRobot = {
  group: THREE.Group;
  body: THREE.Mesh;
  animate: (elapsed: number, delta: number, moving?: boolean) => void;
};

/**
 * Robot geometry is immutable and shared across threats. Materials stay
 * per-instance so hit flashes, decoys, and boss tinting never leak between
 * enemies. The renderer passes this set to its disposer to keep pooled
 * enemies from tearing down geometry still used by another threat.
 */
export const LOW_POLY_ROBOT_GEOMETRIES = new Set<THREE.BufferGeometry>();

const lowPolyRobotGeometry = <T extends THREE.BufferGeometry>(
  key: string,
  create: () => T,
) => {
  const cached = (lowPolyRobotGeometry as typeof lowPolyRobotGeometry & {
    cache?: Map<string, THREE.BufferGeometry>;
  }).cache ??= new Map();
  const existing = cached.get(key) as T | undefined;
  if (existing) return existing;
  const geometry = create();
  cached.set(key, geometry);
  LOW_POLY_ROBOT_GEOMETRIES.add(geometry);
  return geometry;
};

function robotMaterial(color: number, emissive: number, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.34,
    metalness: 0.68,
    flatShading: true,
  });
}

function robotAccentMaterial(color: number) {
  return new THREE.MeshBasicMaterial({ color });
}

export function createLowPolyWarRobot(
  type: LowPolyWarRobotType,
  color: number,
  scale = 1,
): LowPolyWarRobot {
  const group = new THREE.Group();
  group.name = `enemy-robot-${type}`;
  group.scale.setScalar(scale);

  const dark = new THREE.Color(color).multiplyScalar(0.34).getHex();
  const hot = type === "phisher" ? 0xffc57c : type === "rootkit" ? 0xff6b54 : 0xff9c63;
  const torso = new THREE.Mesh(
    lowPolyRobotGeometry("torso", () => new THREE.BoxGeometry(0.82, 0.72, 0.52)),
    robotMaterial(color, dark, type === "rootkit" ? 1.35 : 0.8),
  );
  torso.name = "enemy-robot-body";
  torso.position.y = 0.9;
  group.add(torso);

  const chest = new THREE.Mesh(
    lowPolyRobotGeometry("chest", () => new THREE.OctahedronGeometry(0.29, 0)),
    robotAccentMaterial(hot),
  );
  chest.name = "robot-sensor";
  chest.position.set(0, 0.91, -0.31);
  chest.scale.set(1, 0.8, 0.45);
  group.add(chest);

  const head = new THREE.Mesh(
    lowPolyRobotGeometry("head", () => new THREE.BoxGeometry(0.42, 0.34, 0.38)),
    robotMaterial(dark, color, type === "rootkit" ? 1.5 : 0.65),
  );
  head.name = "robot-head";
  head.position.set(0, 1.48, -0.02);
  group.add(head);

  const visor = new THREE.Mesh(
    lowPolyRobotGeometry("visor", () => new THREE.BoxGeometry(0.27, 0.07, 0.04)),
    robotAccentMaterial(hot),
  );
  visor.name = "robot-visor";
  visor.position.set(0, 1.5, -0.22);
  group.add(visor);

  const leftShoulder = new THREE.Mesh(
    lowPolyRobotGeometry("shoulder", () => new THREE.BoxGeometry(0.24, 0.3, 0.3)),
    robotMaterial(dark, color, 0.45),
  );
  leftShoulder.name = "robot-shoulder-left";
  leftShoulder.position.set(-0.55, 1.02, 0);
  const rightShoulder = leftShoulder.clone();
  rightShoulder.name = "robot-shoulder-right";
  rightShoulder.position.x = 0.55;
  group.add(leftShoulder, rightShoulder);

  const leftLeg = new THREE.Mesh(
    lowPolyRobotGeometry("leg", () => new THREE.BoxGeometry(0.2, 0.52, 0.22)),
    robotMaterial(dark, color, 0.35),
  );
  leftLeg.name = "robot-leg-left";
  leftLeg.position.set(-0.22, 0.36, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.name = "robot-leg-right";
  rightLeg.position.x = 0.22;
  group.add(leftLeg, rightLeg);

  const weapon = new THREE.Mesh(
    lowPolyRobotGeometry("weapon", () => new THREE.BoxGeometry(0.13, 0.56, 0.13)),
    robotMaterial(color, color, 0.65),
  );
  weapon.name = "robot-weapon";
  weapon.position.set(0.66, 0.86, -0.08);
  weapon.rotation.z = -0.34;
  group.add(weapon);

  const muzzle = new THREE.Mesh(
    lowPolyRobotGeometry("muzzle", () => new THREE.ConeGeometry(0.08, 0.22, 5)),
    robotAccentMaterial(hot),
  );
  muzzle.name = "robot-muzzle";
  muzzle.position.set(0.74, 0.58, -0.1);
  muzzle.rotation.z = -Math.PI / 2;
  group.add(muzzle);

  if (type === "trojan" || type === "rootkit") {
    const hornGeometry = lowPolyRobotGeometry(
      "horn",
      () => new THREE.ConeGeometry(type === "rootkit" ? 0.15 : 0.1, type === "rootkit" ? 0.5 : 0.34, 5),
    );
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeometry, robotAccentMaterial(color));
      horn.name = `robot-horn-${side < 0 ? "left" : "right"}`;
      horn.position.set(side * 0.2, 1.77, 0);
      horn.rotation.z = side * -0.22;
      group.add(horn);
    }
  }

  if (type === "phisher") {
    const antenna = new THREE.Mesh(
      lowPolyRobotGeometry("antenna", () => new THREE.CylinderGeometry(0.035, 0.035, 0.4, 5)),
      robotAccentMaterial(hot),
    );
    antenna.name = "robot-antenna";
    antenna.position.set(0, 1.85, 0);
    group.add(antenna);
  }

  if (type === "rootkit") {
    const shield = new THREE.Mesh(
      lowPolyRobotGeometry("rootkit-shield", () => new THREE.TorusGeometry(0.75, 0.035, 5, 18)),
      new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.72 }),
    );
    shield.name = "robot-boss-shield";
    shield.rotation.x = Math.PI / 2;
    shield.position.y = 0.8;
    group.add(shield);
  }

  const animate = (elapsed: number, delta: number, moving = true) => {
    const stride = moving ? Math.sin(elapsed * (type === "rootkit" ? 4.4 : 8.5)) * 0.34 : 0;
    leftLeg.rotation.x = stride;
    rightLeg.rotation.x = -stride;
    torso.position.y = 0.9 + (moving ? Math.abs(Math.sin(elapsed * 8.5)) * 0.035 : Math.sin(elapsed * 2) * 0.012);
    weapon.rotation.x = Math.sin(elapsed * 5.2) * 0.025;
    const bossShield = group.getObjectByName("robot-boss-shield");
    if (bossShield) bossShield.rotation.z += delta * 0.75;
  };

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  animate(0, 0, false);
  return { group, body: torso, animate };
}

export function createTemporarySubAgentMarker(color: number) {
  const marker = new THREE.Group();
  marker.name = "temporary-sub-agent";
  const signal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82 }),
  );
  signal.name = "temporary-sub-agent-signal";
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.025, 6, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
    }),
  );
  ring.name = "temporary-sub-agent-ring";
  ring.rotation.x = Math.PI / 2;
  const healthBar = new THREE.Group();
  healthBar.name = "temporary-sub-agent-health";
  healthBar.position.y = 0.48;
  const healthBack = new THREE.Mesh(
    new THREE.PlaneGeometry(0.76, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x091014, transparent: true, opacity: 0.8 }),
  );
  const healthFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.045),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  healthFill.name = "temporary-sub-agent-health-fill";
  healthFill.position.z = 0.002;
  healthBar.add(healthBack, healthFill);
  marker.add(signal, ring, healthBar);
  resetTemporarySubAgentMarker(marker, color, 1);
  return marker;
}

export function updateTemporarySubAgentHealthCue(
  marker: THREE.Group,
  healthRatio: number,
) {
  const ratio = Math.min(1, Math.max(0, healthRatio));
  const fill = marker.getObjectByName(
    "temporary-sub-agent-health-fill",
  ) as THREE.Mesh;
  fill.scale.x = Math.max(0.001, ratio);
  fill.position.x = -0.35 * (1 - ratio);
}

export function resetTemporarySubAgentMarker(
  marker: THREE.Group,
  color: number,
  healthRatio = 1,
) {
  const signal = marker.getObjectByName(
    "temporary-sub-agent-signal",
  ) as THREE.Mesh;
  const fill = marker.getObjectByName(
    "temporary-sub-agent-health-fill",
  ) as THREE.Mesh;
  (signal.material as THREE.MeshBasicMaterial).color.setHex(color);
  (fill.material as THREE.MeshBasicMaterial).color.setHex(color);
  updateTemporarySubAgentHealthCue(marker, healthRatio);
  marker.position.set(0, 0, 0);
  marker.rotation.set(0, 0, 0);
  marker.scale.setScalar(1);
  marker.removeFromParent();
}

export function createLootPickupMesh(type: string) {
  const group = new THREE.Group();
  group.name = "loot-pickup";
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({
      emissiveIntensity: 2.2,
      metalness: 0.2,
      roughness: 0.35,
    }),
  );
  body.name = "loot-pickup-body";
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.08, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.62 }),
  );
  beam.name = "loot-pickup-beam";
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  label.name = "loot-pickup-label";
  label.scale.set(1.8, 0.34, 1);
  group.add(body, beam, label);
  group.userData.lootLabelCanvas = canvas;
  group.userData.lootLabelTexture = texture;
  resetLootPickupMesh(group, type);
  return group;
}

export function resetLootPickupMesh(
  mesh: THREE.Group,
  type: string,
  value?: number,
) {
  const presentation = getLootPresentation(type, value);
  const color = Number.parseInt(presentation.color.slice(1), 16);
  const body = mesh.getObjectByName("loot-pickup-body") as THREE.Mesh;
  const beam = mesh.getObjectByName("loot-pickup-beam") as THREE.Mesh;
  const label = mesh.getObjectByName("loot-pickup-label") as THREE.Sprite;
  const bodyMaterial = body.material as THREE.MeshStandardMaterial;
  const beamMaterial = beam.material as THREE.MeshBasicMaterial;
  bodyMaterial.color.setHex(color);
  bodyMaterial.emissive.setHex(color);
  beamMaterial.color.setHex(color);
  beam.scale.y = presentation.beamHeight;
  beam.position.y = presentation.beamHeight / 2;
  label.position.y = presentation.beamHeight + 0.28;
  drawLootLabel(mesh.userData.lootLabelCanvas as HTMLCanvasElement, presentation.worldLabel, presentation.color);
  (mesh.userData.lootLabelTexture as THREE.CanvasTexture).needsUpdate = true;
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(1);
  mesh.removeFromParent();
}

function drawLootLabel(canvas: HTMLCanvasElement, label: string, color: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "700 36px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 7;
  context.strokeStyle = "#05080b";
  context.strokeText(label, canvas.width / 2, canvas.height / 2);
  context.fillStyle = color;
  context.fillText(label, canvas.width / 2, canvas.height / 2);
}
