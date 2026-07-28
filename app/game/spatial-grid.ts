import * as THREE from "three";

type Positioned = {
  group: THREE.Object3D;
};

export class SpatialGrid<T extends Positioned> {
  private readonly buckets = new Map<string, T[]>();
  private readonly seen = new Set<T>();

  constructor(private readonly cellSize = 3) {}

  rebuild(items: readonly T[]) {
    this.buckets.clear();
    for (const item of items) {
      const key = this.keyFor(item.group.position.x, item.group.position.z);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(item);
      else this.buckets.set(key, [item]);
    }
  }

  query(position: THREE.Vector3, radius: number) {
    if (!Number.isFinite(radius)) return [];
    const results: T[] = [];
    const radiusSquared = radius * radius;
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    this.seen.clear();

    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const bucket = this.buckets.get(`${cellX}:${cellZ}`);
        if (!bucket) continue;
        for (const item of bucket) {
          if (this.seen.has(item)) continue;
          this.seen.add(item);
          const dx = item.group.position.x - position.x;
          const dz = item.group.position.z - position.z;
          if (dx * dx + dz * dz <= radiusSquared) results.push(item);
        }
      }
    }
    return results;
  }

  private keyFor(x: number, z: number) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
  }
}
