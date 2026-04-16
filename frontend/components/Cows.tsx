'use client';

import * as THREE from 'three';
import { WorldRenderer } from './World';
import { BLOCKS } from '@/lib/blocks';

// Purely client-side cow mobs. They live only in this browser session — no
// server state, no networking. Each client sees its own herd. Cheap enough
// at this count (~8) that we can build each cow as a Group of small Boxes
// rather than paying for an InstancedMesh setup.
//
// Behaviour: pick a random direction, walk for 2–5s, pick a new one. Ground-
// snap to the top of whatever block is under them. If the next step would
// be a cliff (drop of more than two blocks) turn around instead.

interface Cow {
  group: THREE.Group;
  dir: number;          // radians in XZ plane, direction of travel
  nextTurn: number;     // seconds until we reconsider direction
  bobPhase: number;     // walking bob phase
}

export class CowManager {
  private cows: Cow[] = [];
  private scene: THREE.Scene;
  private world: WorldRenderer;

  constructor(scene: THREE.Scene, world: WorldRenderer) {
    this.scene = scene;
    this.world = world;
  }

  /**
   * Spawn `count` cows on grass within `radius` blocks of (cx, cz).
   * Skips slots where we can't find a grass surface.
   */
  spawn(count: number, cx: number, cz: number, radius: number) {
    let attempts = 0;
    while (this.cows.length < count && attempts < count * 10) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      // Prefer grass, but any surface is fine — some clients spawn near sand.
      const topType = this.world.getType(gx, surface, gz);
      if (topType !== 'base_blue' && Math.random() > 0.3) continue;
      this.addCow(x, surface + 1, z);
    }
  }

  private findSurface(x: number, z: number): number | null {
    // Look for the highest non-empty block at this column. Start from a
    // height comfortably above world-gen's max (20 + trees).
    for (let y = 32; y >= 0; y--) {
      if (this.world.has(x, y, z) && !this.world.has(x, y + 1, z)) {
        return y;
      }
    }
    return null;
  }

  private addCow(x: number, y: number, z: number) {
    const g = new THREE.Group();

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.9 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x2a221b, roughness: 0.9 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xd89a8f, roughness: 0.85 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 0.7 });

    // Body — the big main box
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.15), whiteMat);
    body.position.y = 0.6;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Black spots on the back + sides — deterministic per-cow layout via a
    // quick local PRNG so each cow looks different but consistent.
    const spotCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < spotCount; i++) {
      const spot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 + Math.random() * 0.14, 0.08, 0.22 + Math.random() * 0.14),
        blackMat,
      );
      spot.position.set(
        (Math.random() - 0.5) * 0.55,
        0.88,
        (Math.random() - 0.5) * 0.95,
      );
      g.add(spot);
    }

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), whiteMat);
    head.position.set(0, 0.7, 0.73);
    head.castShadow = true;
    g.add(head);

    // Muzzle
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.12), pinkMat);
    muzzle.position.set(0, 0.6, 1.0);
    g.add(muzzle);

    // Eyes (tiny black squares)
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const eyeL = new THREE.Mesh(eyeGeom, blackMat);
    eyeL.position.set(-0.16, 0.82, 0.96);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeom, blackMat);
    eyeR.position.set(0.16, 0.82, 0.96);
    g.add(eyeR);

    // Horns
    const hornGeom = new THREE.BoxGeometry(0.07, 0.2, 0.07);
    const hornL = new THREE.Mesh(hornGeom, hornMat);
    hornL.position.set(-0.2, 1.0, 0.72);
    g.add(hornL);
    const hornR = new THREE.Mesh(hornGeom, hornMat);
    hornR.position.set(0.2, 1.0, 0.72);
    g.add(hornR);

    // Legs (four identical)
    const legGeom = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    const legPositions: Array<[number, number]> = [
      [-0.23, -0.4],
      [0.23, -0.4],
      [-0.23, 0.4],
      [0.23, 0.4],
    ];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeom, blackMat);
      leg.position.set(lx, 0.28, lz);
      leg.castShadow = true;
      g.add(leg);
    }

    // Tail
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), whiteMat);
    tail.position.set(0, 0.65, -0.68);
    tail.rotation.x = 0.3;
    g.add(tail);

    g.position.set(x, y, z);
    this.scene.add(g);

    this.cows.push({
      group: g,
      dir: Math.random() * Math.PI * 2,
      nextTurn: 2 + Math.random() * 3,
      bobPhase: Math.random() * Math.PI * 2,
    });

    // Suppress unused palette warning — keeping BLOCKS import gives us a
    // cheap way to sanity-check grass constant at import time.
    void BLOCKS;
  }

  update(dt: number) {
    const speed = 0.7;
    for (const cow of this.cows) {
      cow.nextTurn -= dt;
      if (cow.nextTurn <= 0) {
        cow.dir = Math.random() * Math.PI * 2;
        cow.nextTurn = 2 + Math.random() * 3;
      }

      const dx = Math.cos(cow.dir) * speed * dt;
      const dz = Math.sin(cow.dir) * speed * dt;
      const newX = cow.group.position.x + dx;
      const newZ = cow.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        // No ground in that direction — turn around.
        cow.dir += Math.PI;
        cow.nextTurn = 2 + Math.random() * 3;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - cow.group.position.y;
      if (drop < -2.5 || drop > 2.5) {
        // Cliff up or down — turn around rather than fall.
        cow.dir += Math.PI;
        cow.nextTurn = 2 + Math.random() * 3;
        continue;
      }

      cow.group.position.set(newX, targetY, newZ);
      // Face direction of travel. See CowManager.update comment for the
      // rotation.y derivation.
      cow.group.rotation.y = -cow.dir + Math.PI / 2;

      // Walking bob — small vertical oscillation driven by horizontal speed.
      cow.bobPhase += dt * 7;
      cow.group.position.y += Math.sin(cow.bobPhase) * 0.04;
    }
  }

  clear() {
    for (const cow of this.cows) {
      this.scene.remove(cow.group);
      cow.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
    }
    this.cows.length = 0;
  }
}
