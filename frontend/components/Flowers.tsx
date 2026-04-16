'use client';

import * as THREE from 'three';
import { WorldRenderer } from './World';
import { BlockType } from '@/lib/blocks';

// Decorative, purely client-side flowers. Scattered deterministically on
// grass surfaces using a position hash so two clients would see the same
// flowers (though they're not actually synced — server doesn't know they
// exist). Rendered via InstancedMesh per color / part so even a few hundred
// flowers are one draw call each.

// Flower palette — roses, dandelions, chamomile. Based loosely on Minecraft
// poppy / dandelion / oxeye.
const HEAD_COLORS = [
  0xd63a3a, // red
  0xf2d44a, // yellow
  0xf2ecd6, // white
  0xc674d1, // violet
];

export class FlowerManager {
  private scene: THREE.Scene;
  private meshes: THREE.InstancedMesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Scans the loaded world for grass surfaces and instantiates flowers at
   * positions that pass a deterministic hash threshold. Must be called
   * *after* all world chunks have loaded.
   */
  generate(world: WorldRenderer, worldSize: number, worldHeight: number) {
    type FlowerPos = { x: number; z: number; top: number; colorIdx: number };
    const positions: FlowerPos[] = [];

    for (let x = 0; x < worldSize; x++) {
      for (let z = 0; z < worldSize; z++) {
        // Highest block in this column
        let surface = -1;
        for (let y = worldHeight; y >= 0; y--) {
          if (world.has(x, y, z)) {
            surface = y;
            break;
          }
        }
        if (surface < 0) continue;
        const type: BlockType | null = world.getType(x, surface, z);
        if (type !== 'base_blue') continue; // flowers only on grass

        // Deterministic probability check. Same world seed → same flowers.
        const h = Math.sin(x * 12.9898 + z * 78.233 + 29.01) * 43758.5453;
        const frac = h - Math.floor(h);
        if (frac > 0.04) continue;

        const colorIdx = Math.floor(frac * 100) % HEAD_COLORS.length;
        positions.push({ x, z, top: surface + 1, colorIdx });
      }
    }

    if (positions.length === 0) return;

    // Single stem mesh (green), per-color head meshes.
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a7a34, roughness: 0.92 });
    const stemGeom = new THREE.BoxGeometry(0.06, 0.3, 0.06);
    const stemMesh = new THREE.InstancedMesh(stemGeom, stemMat, positions.length);
    stemMesh.castShadow = false;
    stemMesh.receiveShadow = true;

    // Bucket by head color so each color gets its own instanced mesh.
    const perColor: Array<FlowerPos[]> = HEAD_COLORS.map(() => []);
    for (const p of positions) perColor[p.colorIdx].push(p);

    const headGeom = new THREE.BoxGeometry(0.22, 0.1, 0.22);
    const headMeshes: THREE.InstancedMesh[] = HEAD_COLORS.map((color, ci) => {
      const n = Math.max(1, perColor[ci].length);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      const m = new THREE.InstancedMesh(headGeom, mat, n);
      m.castShadow = false;
      m.receiveShadow = false;
      m.count = perColor[ci].length;
      return m;
    });

    // Stems
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      pos.set(p.x + 0.5, p.top + 0.15, p.z + 0.5);
      mat4.compose(pos, quat, scale);
      stemMesh.setMatrixAt(i, mat4);
    }
    stemMesh.instanceMatrix.needsUpdate = true;

    // Heads per color
    for (let ci = 0; ci < HEAD_COLORS.length; ci++) {
      const bucket = perColor[ci];
      const mesh = headMeshes[ci];
      for (let i = 0; i < bucket.length; i++) {
        const p = bucket[i];
        pos.set(p.x + 0.5, p.top + 0.35, p.z + 0.5);
        mat4.compose(pos, quat, scale);
        mesh.setMatrixAt(i, mat4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    this.scene.add(stemMesh);
    for (const m of headMeshes) this.scene.add(m);
    this.meshes = [stemMesh, ...headMeshes];
  }

  clear() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.meshes = [];
  }
}
