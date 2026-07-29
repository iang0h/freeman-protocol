import * as THREE from "three";

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

const LOOT_COLORS: Record<string, number> = {
  repair: 0x78d6a5,
  component: 0xf0a65a,
  "upgrade-shard": 0xb9a4ff,
};

export function createLootPickupMesh(type: string) {
  const color = LOOT_COLORS[type] ?? 0xffffff;
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      metalness: 0.2,
      roughness: 0.35,
    }),
  );
  mesh.name = "loot-pickup";
  return mesh;
}

export function resetLootPickupMesh(mesh: THREE.Mesh, type: string) {
  const color = LOOT_COLORS[type] ?? 0xffffff;
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.color.setHex(color);
  material.emissive.setHex(color);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(1);
  mesh.removeFromParent();
}
