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
