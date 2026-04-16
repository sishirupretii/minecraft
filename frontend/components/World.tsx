'use client';

import * as THREE from 'three';
import { BLOCKS, BlockType, BLOCK_TYPES } from '@/lib/blocks';

interface BlockRecord {
  type: BlockType;
  index: number;
}

interface PerTypeMesh {
  mesh: THREE.InstancedMesh;
  freeIndices: number[];
  indexToKey: Map<number, string>;
  count: number;
  capacity: number;
}

const INITIAL_CAPACITY = 40000;

export class WorldRenderer {
  public group = new THREE.Group();
  private meshes: Map<BlockType, PerTypeMesh> = new Map();
  private blockMap: Map<string, BlockRecord> = new Map();
  private scene: THREE.Scene;
  private tmpMat = new THREE.Matrix4();
  private tmpPos = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3(1, 1, 1);
  private tmpScaleZero = new THREE.Vector3(0, 0, 0);
  private animating: Map<string, { start: number; dur: number; dir: 1 | -1; index: number; type: BlockType }> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    for (const type of BLOCK_TYPES) {
      const meta = BLOCKS[type];
      const material = new THREE.MeshLambertMaterial({
        color: meta.color,
      });
      // Slightly cooler look on the top face via vertex colors baked in: use darker tint
      const mesh = new THREE.InstancedMesh(geometry, material, INITIAL_CAPACITY);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.name = `blocks-${type}`;
      (mesh as any).userData = { blockType: type };
      this.group.add(mesh);

      this.meshes.set(type, {
        mesh,
        freeIndices: [],
        indexToKey: new Map(),
        count: 0,
        capacity: INITIAL_CAPACITY,
      });
    }
  }

  key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  has(x: number, y: number, z: number): boolean {
    return this.blockMap.has(this.key(x, y, z));
  }

  getType(x: number, y: number, z: number): BlockType | null {
    const rec = this.blockMap.get(this.key(x, y, z));
    return rec ? rec.type : null;
  }

  addBlock(x: number, y: number, z: number, type: BlockType, animate = false) {
    const k = this.key(x, y, z);
    if (this.blockMap.has(k)) return;
    const per = this.meshes.get(type);
    if (!per) return;

    let idx: number;
    if (per.freeIndices.length > 0) {
      idx = per.freeIndices.pop()!;
    } else {
      idx = per.count;
      per.count++;
      if (per.count > per.capacity) {
        // Grow: allocate a new mesh with doubled capacity. Rare but handled.
        this.growMesh(type);
      }
      per.mesh.count = per.count;
    }

    per.indexToKey.set(idx, k);
    this.blockMap.set(k, { type, index: idx });

    this.tmpPos.set(x + 0.5, y + 0.5, z + 0.5);
    this.tmpScale.set(1, 1, 1);
    this.tmpMat.compose(this.tmpPos, this.tmpQuat, animate ? this.tmpScaleZero : this.tmpScale);
    per.mesh.setMatrixAt(idx, this.tmpMat);
    per.mesh.instanceMatrix.needsUpdate = true;

    if (animate) {
      this.animating.set(k, {
        start: performance.now(),
        dur: 100,
        dir: 1,
        index: idx,
        type,
      });
    }
  }

  removeBlock(x: number, y: number, z: number, animate = false) {
    const k = this.key(x, y, z);
    const rec = this.blockMap.get(k);
    if (!rec) return;
    const per = this.meshes.get(rec.type);
    if (!per) return;

    if (animate) {
      this.animating.set(k, {
        start: performance.now(),
        dur: 100,
        dir: -1,
        index: rec.index,
        type: rec.type,
      });
      // Keep record until animation finishes? Simpler: mark removed now, animate hides.
      this.blockMap.delete(k);
      per.indexToKey.delete(rec.index);
      per.freeIndices.push(rec.index);
      return;
    }

    this.blockMap.delete(k);
    per.indexToKey.delete(rec.index);
    per.freeIndices.push(rec.index);

    this.tmpPos.set(x + 0.5, y + 0.5, z + 0.5);
    this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScaleZero);
    per.mesh.setMatrixAt(rec.index, this.tmpMat);
    per.mesh.instanceMatrix.needsUpdate = true;
  }

  update() {
    if (this.animating.size === 0) return;
    const now = performance.now();
    const done: string[] = [];
    for (const [k, anim] of this.animating) {
      const per = this.meshes.get(anim.type);
      if (!per) {
        done.push(k);
        continue;
      }
      const t = Math.min(1, (now - anim.start) / anim.dur);
      const scale = anim.dir === 1 ? t : 1 - t;
      // Decode position from key
      const [sx, sy, sz] = k.split(',').map((n) => parseFloat(n));
      this.tmpPos.set(sx + 0.5, sy + 0.5, sz + 0.5);
      this.tmpScale.set(scale, scale, scale);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      per.mesh.setMatrixAt(anim.index, this.tmpMat);
      per.mesh.instanceMatrix.needsUpdate = true;
      if (t >= 1) {
        if (anim.dir === -1) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          per.mesh.setMatrixAt(anim.index, this.tmpMat);
          per.mesh.instanceMatrix.needsUpdate = true;
        }
        done.push(k);
      }
    }
    for (const k of done) this.animating.delete(k);
  }

  private growMesh(type: BlockType) {
    const per = this.meshes.get(type);
    if (!per) return;
    const newCap = per.capacity * 2;
    const meta = BLOCKS[type];
    const geom = per.mesh.geometry;
    const mat = per.mesh.material as THREE.Material;

    const nmesh = new THREE.InstancedMesh(geom, mat, newCap);
    nmesh.count = per.count;
    nmesh.frustumCulled = true;
    nmesh.name = `blocks-${type}`;
    (nmesh as any).userData = { blockType: type };

    // Copy existing matrices
    const m = new THREE.Matrix4();
    for (let i = 0; i < per.count; i++) {
      per.mesh.getMatrixAt(i, m);
      nmesh.setMatrixAt(i, m);
    }
    nmesh.instanceMatrix.needsUpdate = true;

    this.group.remove(per.mesh);
    per.mesh.dispose();
    this.group.add(nmesh);
    per.mesh = nmesh;
    per.capacity = newCap;

    // Avoid unused-meta warning
    void meta;
  }

  // Raycast from camera to find intersected block. Returns { x,y,z, normal } or null.
  raycast(
    camera: THREE.Camera,
    maxDistance: number,
  ): { x: number; y: number; z: number; normal: THREE.Vector3 } | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = maxDistance;

    const meshes: THREE.InstancedMesh[] = [];
    for (const per of this.meshes.values()) meshes.push(per.mesh);

    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    const instanceId = hit.instanceId;
    if (instanceId === undefined) return null;
    const target = hit.object as THREE.InstancedMesh;
    const blockType = (target.userData as any).blockType as BlockType;
    const per = this.meshes.get(blockType);
    if (!per) return null;
    const key = per.indexToKey.get(instanceId);
    if (!key) return null;
    const [x, y, z] = key.split(',').map((n) => parseInt(n, 10));

    // Compute normal of hit face
    const n = hit.face?.normal.clone() ?? new THREE.Vector3();
    // Face normal is in local space; InstancedMesh has identity transform at group level
    // Convert to world: multiply by object's world quaternion (identity here)
    return { x, y, z, normal: n };
  }

  clear() {
    for (const per of this.meshes.values()) {
      per.mesh.count = 0;
      per.freeIndices = [];
      per.indexToKey.clear();
      per.count = 0;
    }
    this.blockMap.clear();
    this.animating.clear();
  }

  dispose() {
    for (const per of this.meshes.values()) {
      per.mesh.geometry.dispose();
      (per.mesh.material as THREE.Material).dispose();
      this.group.remove(per.mesh);
      per.mesh.dispose();
    }
    this.scene.remove(this.group);
    this.meshes.clear();
    this.blockMap.clear();
  }
}
