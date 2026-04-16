'use client';

import * as THREE from 'three';
import { WorldRenderer } from './World';

// Purely client-side mobs (cows / pigs / chickens). They live only in this
// browser session — no server state, no networking. Each client sees its own
// herd. Cheap enough at low counts (~8 each) that we can build each mob as
// a Group of small Boxes rather than paying for an InstancedMesh setup.
//
// Behaviour: random wander with 2–5s direction changes, ground-snap, turn
// around at cliffs. If the player comes close, flee in the opposite
// direction — "spooked animal" feel.

interface MobState {
  group: THREE.Group;
  dir: number;          // radians in XZ plane, direction of travel
  nextTurn: number;     // seconds until we reconsider direction
  bobPhase: number;     // walking bob phase
  fleeCooldown: number; // seconds remaining of "scared of player" behaviour
}

/**
 * Base class for all wandering mobs. Subclasses supply their own geometry
 * (buildMob) and movement tuning (speed, bobRate). Everything else — ground-
 * snap, cliff avoidance, player-avoidance — lives here.
 */
abstract class BaseMobManager {
  protected mobs: MobState[] = [];
  protected scene: THREE.Scene;
  protected world: WorldRenderer;

  constructor(scene: THREE.Scene, world: WorldRenderer) {
    this.scene = scene;
    this.world = world;
  }

  /** Per-species body. Subclass fills this in. */
  protected abstract buildMob(): THREE.Group;
  /** Walk speed in blocks/sec. */
  protected abstract speed(): number;
  /** Walking bob frequency multiplier. */
  protected bobRate() {
    return 7;
  }
  /** Walking bob vertical amplitude. */
  protected bobAmp() {
    return 0.04;
  }
  /** Max drop the mob will willingly walk off (in blocks). */
  protected cliffDrop() {
    return 2.5;
  }
  /** Some species prefer grass (`base_blue`) over sand / stone. */
  protected prefersGrass() {
    return true;
  }

  spawn(count: number, cx: number, cz: number, radius: number) {
    let attempts = 0;
    while (this.mobs.length < count && attempts < count * 12) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      const topType = this.world.getType(gx, surface, gz);
      if (this.prefersGrass() && topType !== 'base_blue' && Math.random() > 0.3) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  protected findSurface(x: number, z: number): number | null {
    // Look for the highest non-empty block at this column. Start from a
    // height comfortably above world-gen's max (20 + trees).
    for (let y = 32; y >= 0; y--) {
      if (this.world.has(x, y, z) && !this.world.has(x, y + 1, z)) {
        return y;
      }
    }
    return null;
  }

  protected addMob(x: number, y: number, z: number) {
    const g = this.buildMob();
    g.position.set(x, y, z);
    this.scene.add(g);
    this.mobs.push({
      group: g,
      dir: Math.random() * Math.PI * 2,
      nextTurn: 2 + Math.random() * 3,
      bobPhase: Math.random() * Math.PI * 2,
      fleeCooldown: 0,
    });
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();
    const cliff = this.cliffDrop();

    for (const mob of this.mobs) {
      // Player-avoidance — if the player is within 3 blocks, set direction
      // directly away and cool down the decision so the mob actually runs
      // rather than instantly re-wandering.
      if (playerPos) {
        const dxp = mob.group.position.x - playerPos.x;
        const dzp = mob.group.position.z - playerPos.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 9) {
          mob.dir = Math.atan2(dzp, dxp);
          mob.fleeCooldown = 1.5;
          mob.nextTurn = 0.6;
        }
      }

      if (mob.fleeCooldown > 0) mob.fleeCooldown = Math.max(0, mob.fleeCooldown - dt);

      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 2 + Math.random() * 3;
      }

      // Fleeing mobs move at 1.6× speed — snappier "spooked" reaction.
      const curSpeed = mob.fleeCooldown > 0 ? speed * 1.6 : speed;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2 + Math.random() * 3;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -cliff || drop > cliff) {
        mob.dir += Math.PI;
        mob.nextTurn = 2 + Math.random() * 3;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      // Face direction of travel (derivation: local +Z must map to world dir
      // vector (cos θ, 0, sin θ), giving rotation.y = π/2 − θ).
      mob.group.rotation.y = -mob.dir + Math.PI / 2;

      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;
    }
  }

  clear() {
    for (const mob of this.mobs) {
      this.scene.remove(mob.group);
      mob.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
    }
    this.mobs.length = 0;
  }
}

// --------------------------- Cow ---------------------------

export class CowManager extends BaseMobManager {
  protected speed() {
    return 0.7;
  }
  protected buildMob(): THREE.Group {
    const g = new THREE.Group();

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.9 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x2a221b, roughness: 0.9 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xd89a8f, roughness: 0.85 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.15), whiteMat);
    body.position.y = 0.6;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

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

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), whiteMat);
    head.position.set(0, 0.7, 0.73);
    head.castShadow = true;
    g.add(head);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.12), pinkMat);
    muzzle.position.set(0, 0.6, 1.0);
    g.add(muzzle);

    const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const eyeL = new THREE.Mesh(eyeGeom, blackMat);
    eyeL.position.set(-0.16, 0.82, 0.96);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeom, blackMat);
    eyeR.position.set(0.16, 0.82, 0.96);
    g.add(eyeR);

    const hornGeom = new THREE.BoxGeometry(0.07, 0.2, 0.07);
    const hornL = new THREE.Mesh(hornGeom, hornMat);
    hornL.position.set(-0.2, 1.0, 0.72);
    g.add(hornL);
    const hornR = new THREE.Mesh(hornGeom, hornMat);
    hornR.position.set(0.2, 1.0, 0.72);
    g.add(hornR);

    const legGeom = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    const legPositions: Array<[number, number]> = [
      [-0.23, -0.4], [0.23, -0.4], [-0.23, 0.4], [0.23, 0.4],
    ];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeom, blackMat);
      leg.position.set(lx, 0.28, lz);
      leg.castShadow = true;
      g.add(leg);
    }

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), whiteMat);
    tail.position.set(0, 0.65, -0.68);
    tail.rotation.x = 0.3;
    g.add(tail);

    return g;
  }
}

// --------------------------- Pig ---------------------------

export class PigManager extends BaseMobManager {
  protected speed() {
    return 0.85;
  }
  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0aaa0, roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xd68278, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1413, roughness: 0.9 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3c2a20, roughness: 0.95 });

    // Chubby body — slightly shorter and wider than the cow.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 1.0), skinMat);
    body.position.y = 0.5;
    body.castShadow = true;
    g.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), skinMat);
    head.position.set(0, 0.55, 0.65);
    head.castShadow = true;
    g.add(head);

    // Flat snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.1), noseMat);
    snout.position.set(0, 0.5, 0.9);
    g.add(snout);

    // Tiny nostrils
    const nosGeom = new THREE.BoxGeometry(0.05, 0.05, 0.03);
    const nL = new THREE.Mesh(nosGeom, eyeMat);
    nL.position.set(-0.07, 0.5, 0.96);
    const nR = nL.clone();
    nR.position.x = 0.07;
    g.add(nL);
    g.add(nR);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.07, 0.07, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat);
    eL.position.set(-0.16, 0.68, 0.86);
    const eR = eL.clone();
    eR.position.x = 0.16;
    g.add(eL);
    g.add(eR);

    // Ears
    const earGeom = new THREE.BoxGeometry(0.12, 0.1, 0.06);
    const earL = new THREE.Mesh(earGeom, skinMat);
    earL.position.set(-0.18, 0.85, 0.55);
    earL.rotation.z = 0.4;
    g.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.18;
    earR.rotation.z = -0.4;
    g.add(earR);

    // Legs (hooves — darker)
    const legGeom = new THREE.BoxGeometry(0.17, 0.45, 0.17);
    const legs: Array<[number, number]> = [
      [-0.22, -0.32], [0.22, -0.32], [-0.22, 0.32], [0.22, 0.32],
    ];
    for (const [lx, lz] of legs) {
      const leg = new THREE.Mesh(legGeom, hoofMat);
      leg.position.set(lx, 0.23, lz);
      leg.castShadow = true;
      g.add(leg);
    }

    // Curly tail (two tiny stacked boxes)
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), skinMat);
    t1.position.set(0, 0.62, -0.55);
    g.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), skinMat);
    t2.position.set(0, 0.72, -0.58);
    g.add(t2);

    return g;
  }
}

// --------------------------- Chicken ---------------------------

export class ChickenManager extends BaseMobManager {
  protected speed() {
    return 1.1;
  }
  protected bobRate() {
    return 12; // jerky chicken walk
  }
  protected bobAmp() {
    return 0.06;
  }
  protected prefersGrass() {
    return false; // chickens are happy anywhere
  }
  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: 0.9 });
    const combMat = new THREE.MeshStandardMaterial({ color: 0xc2362a, roughness: 0.85 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xe5b64e, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161410, roughness: 0.9 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe0a84c, roughness: 0.85 });

    // Oval-ish body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.55), featherMat);
    body.position.y = 0.45;
    body.castShadow = true;
    g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), featherMat);
    head.position.set(0, 0.78, 0.24);
    head.castShadow = true;
    g.add(head);

    // Comb (red fin on top)
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.2), combMat);
    comb.position.set(0, 0.96, 0.22);
    g.add(comb);

    // Wattle (small red blob under beak)
    const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), combMat);
    wattle.position.set(0, 0.66, 0.38);
    g.add(wattle);

    // Beak
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.08), beakMat);
    beak.position.set(0, 0.75, 0.4);
    g.add(beak);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.05, 0.05, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat);
    eL.position.set(-0.1, 0.83, 0.35);
    const eR = eL.clone();
    eR.position.x = 0.1;
    g.add(eL);
    g.add(eR);

    // Wings (flat on the sides)
    const wingGeom = new THREE.BoxGeometry(0.05, 0.28, 0.45);
    const wL = new THREE.Mesh(wingGeom, featherMat);
    wL.position.set(-0.2, 0.48, 0);
    g.add(wL);
    const wR = wL.clone();
    wR.position.x = 0.2;
    g.add(wR);

    // Two yellow legs
    const legGeom = new THREE.BoxGeometry(0.07, 0.28, 0.07);
    const legL = new THREE.Mesh(legGeom, legMat);
    legL.position.set(-0.09, 0.14, 0);
    legL.castShadow = true;
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.09;
    g.add(legR);

    // Tail feathers
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.1), featherMat);
    tail.position.set(0, 0.62, -0.3);
    tail.rotation.x = -0.4;
    g.add(tail);

    return g;
  }
}
