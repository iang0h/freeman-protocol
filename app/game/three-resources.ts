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

export function resetLootPickupMesh(mesh: THREE.Group, type: string) {
  const presentation = getLootPresentation(type);
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
