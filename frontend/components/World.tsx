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

// Physically-based material params per block type. Standard materials give us
// real shading under the sun + rim light, instead of flat plastic look.
const MATERIAL_PARAMS: Record<BlockType, { roughness: number; metalness: number }> = {
  base_blue:   { roughness: 0.55, metalness: 0.12 }, // grass-equivalent — signature Base blue
  deep_blue:   { roughness: 0.5,  metalness: 0.18 }, // stone-equivalent, subtle sheen
  ice_stone:   { roughness: 0.3,  metalness: 0.25 }, // icy / crystalline
  cyan_wood:   { roughness: 0.75, metalness: 0.05 }, // wood — rougher
  sand_blue:   { roughness: 0.92, metalness: 0.02 }, // dirt/sand-equivalent
  royal_brick: { roughness: 0.7,  metalness: 0.08 }, // brick
};

// Deterministic per-position color jitter. Same block at same coord always
// gets the same shade, so the world looks consistent across reloads but
// each individual block is slightly unique — kills the "copy-pasted cube"
// look without adding textures.
const _hashColor = new THREE.Color();
const _hashHSL = { h: 0, s: 0, l: 0 };
function hashColor(baseHex: number, x: number, y: number, z: number, out: THREE.Color): THREE.Color {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  const jitter = (h - Math.floor(h) - 0.5) * 0.08; // ±4% lightness
  _hashColor.setHex(baseHex);
  _hashColor.getHSL(_hashHSL);
  out.setHSL(_hashHSL.h, _hashHSL.s, Math.max(0, Math.min(1, _hashHSL.l + jitter)));
  return out;
}

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
  private tmpColor = new THREE.Color();
  private animating: Map<string, { start: number; dur: number; dir: 1 | -1; index: number; type: BlockType }> = new Map();

  // Callback fires after a block is removed, so Game can spawn break particles
  // without this file needing to know about the particle system.
  public onBlockBroken: ((x: number, y: number, z: number, type: BlockType) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    for (const type of BLOCK_TYPES) {
      const meta = BLOCKS[type];
      const params = MATERIAL_PARAMS[type] ?? { roughness: 0.8, metalness: 0 };
      // MeshStandardMaterial receives light from our new lighting rig.
      // InstancedMesh multiplies the material colour by the per-instance
      // colour set with setColorAt, so we leave material.color white.
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: params.roughness,
        metalness: params.metalness,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, INITIAL_CAPACITY);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.name = `blocks-${type}`;
      (mesh as any).userData = { blockType: type, baseColor: meta.color };

      // Pre-allocate instance color attribute so setColorAt works from the
      // very first call. Without this Three.js would allocate on demand.
      const colorAttr = new THREE.InstancedBufferAttribute(
        new Float32Array(INITIAL_CAPACITY * 3),
        3,
      );
      mesh.instanceColor = colorAttr;

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

    // Per-instance colour jitter — each block gets a deterministic subtle
    // variant of its base colour. Dramatic improvement over flat cubes.
    const baseColor = BLOCKS[type].color;
    hashColor(baseColor, x, y, z, this.tmpColor);
    per.mesh.setColorAt(idx, this.tmpColor);
    if (per.mesh.instanceColor) per.mesh.instanceColor.needsUpdate = true;

    if (animate) {
      this.animating.set(k, {
        start: performance.now(),
        dur: 180, // slightly longer for a juicier pop-in
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

    // Notify listeners (particle system) BEFORE we lose the type info.
    if (this.onBlockBroken) {
      this.onBlockBroken(x, y, z, rec.type);
    }

    if (animate) {
      this.animating.set(k, {
        start: performance.now(),
        dur: 120,
        dir: -1,
        index: rec.index,
        type: rec.type,
      });
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
      // Ease-out cubic for pop-in / pop-out feel
      const eased = anim.dir === 1 ? 1 - Math.pow(1 - t, 3) : Math.pow(1 - t, 2);
      const scale = anim.dir === 1 ? 0.85 + eased * 0.15 : eased; // place: 0.85→1; break: 1→0
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
    nmesh.castShadow = true;
    nmesh.receiveShadow = true;
    nmesh.frustumCulled = true;
    nmesh.name = `blocks-${type}`;
    (nmesh as any).userData = { blockType: type, baseColor: meta.color };

    // Re-allocate instance color attribute at the new capacity
    const newColorAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(newCap * 3),
      3,
    );
    nmesh.instanceColor = newColorAttr;

    // Copy existing matrices + colors
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < per.count; i++) {
      per.mesh.getMatrixAt(i, m);
      nmesh.setMatrixAt(i, m);
      if (per.mesh.instanceColor) {
        (per.mesh as any).getColorAt(i, c);
        nmesh.setColorAt(i, c);
      }
    }
    nmesh.instanceMatrix.needsUpdate = true;
    if (nmesh.instanceColor) nmesh.instanceColor.needsUpdate = true;

    this.group.remove(per.mesh);
    per.mesh.dispose();
    this.group.add(nmesh);
    per.mesh = nmesh;
    per.capacity = newCap;
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

    const n = hit.face?.normal.clone() ?? new THREE.Vector3();
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
