'use client';

import * as THREE from 'three';
import { WorldRenderer } from './World';
import { ItemType } from '@/lib/items';

// Purely client-side mobs (cows / pigs / chickens / zombies). They live only
// in this browser session — no server state, no networking. Each client sees
// its own herd / horde.
//
// Passive mobs: random wander, flee from player.
// Hostile mobs (zombie): chase player at night, wander at day.

export interface MobDrop {
  item: ItemType;
  count: number;
}

interface MobState {
  group: THREE.Group;
  dir: number;          // radians in XZ plane, direction of travel
  nextTurn: number;     // seconds until we reconsider direction
  bobPhase: number;     // walking bob phase
  fleeCooldown: number; // seconds remaining of "scared of player" behaviour
  health: number;       // hit points
  maxHealth: number;
  hurtTimer: number;    // flash red on hit
  dead: boolean;
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
  /** Max health. */
  protected maxHealth() { return 10; }
  /** What this mob drops on death. */
  protected abstract drops(): MobDrop[];
  /** Walking bob frequency multiplier. */
  protected bobRate() { return 7; }
  /** Walking bob vertical amplitude. */
  protected bobAmp() { return 0.04; }
  /** Max drop the mob will willingly walk off (in blocks). */
  protected cliffDrop() { return 2.5; }
  /** Some species prefer grass over sand / stone. */
  protected prefersGrass() { return true; }

  getMobs(): MobState[] { return this.mobs; }

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
      health: this.maxHealth(),
      maxHealth: this.maxHealth(),
      hurtTimer: 0,
      dead: false,
    });
  }

  /** Hit test: returns the mob within `range` blocks of `origin` looking along `dir`, or null. */
  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, range: number): MobState | null {
    let closest: MobState | null = null;
    let closestDist = range;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const toMob = new THREE.Vector3().subVectors(mob.group.position, origin);
      // Rough cylinder hit test: mob is ~0.5 wide, ~1 tall
      const dot = toMob.dot(dir);
      if (dot < 0 || dot > range) continue;
      const proj = dir.clone().multiplyScalar(dot);
      const perp = toMob.clone().sub(proj);
      perp.y *= 0.6; // squash y for taller hit area
      if (perp.length() < 0.8 && dot < closestDist) {
        closestDist = dot;
        closest = mob;
      }
    }
    return closest;
  }

  /** Deal damage to a specific mob. Returns drops if it died. */
  dealDamage(mob: MobState, damage: number): MobDrop[] | null {
    mob.health -= damage;
    mob.hurtTimer = 0.4;
    // Knockback
    const kb = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      0.3,
      (Math.random() - 0.5) * 2,
    );
    mob.group.position.add(kb);
    mob.fleeCooldown = 2;

    if (mob.health <= 0) {
      mob.dead = true;
      return this.drops();
    }
    return null;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();
    const cliff = this.cliffDrop();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Remove dead mobs after brief delay
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      // Player-avoidance — if the player is within 3 blocks, set direction
      // directly away and cool down the decision so the mob actually runs.
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
      mob.group.rotation.y = -mob.dir + Math.PI / 2;

      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;

      // Despawn mobs too far from player
      if (playerPos) {
        const dx2 = mob.group.position.x - playerPos.x;
        const dz2 = mob.group.position.z - playerPos.z;
        const dist2 = dx2 * dx2 + dz2 * dz2;
        if (dist2 > 80 * 80) {
          mob.dead = true;
        }
      }
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
  protected speed() { return 0.7; }
  protected drops(): MobDrop[] { return [{ item: 'beef', count: 1 + Math.floor(Math.random() * 2) }]; }
  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.9 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x2a221b, roughness: 0.9 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xd89a8f, roughness: 0.85 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.15), whiteMat);
    body.position.y = 0.6; body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const spotCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < spotCount; i++) {
      const spot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 + Math.random() * 0.14, 0.08, 0.22 + Math.random() * 0.14),
        blackMat,
      );
      spot.position.set((Math.random() - 0.5) * 0.55, 0.88, (Math.random() - 0.5) * 0.95);
      g.add(spot);
    }

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), whiteMat);
    head.position.set(0, 0.7, 0.73); head.castShadow = true;
    g.add(head);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.12), pinkMat);
    muzzle.position.set(0, 0.6, 1.0);
    g.add(muzzle);

    const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const eyeL = new THREE.Mesh(eyeGeom, blackMat); eyeL.position.set(-0.16, 0.82, 0.96); g.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeom, blackMat); eyeR.position.set(0.16, 0.82, 0.96); g.add(eyeR);

    const hornGeom = new THREE.BoxGeometry(0.07, 0.2, 0.07);
    const hornL = new THREE.Mesh(hornGeom, hornMat); hornL.position.set(-0.2, 1.0, 0.72); g.add(hornL);
    const hornR = new THREE.Mesh(hornGeom, hornMat); hornR.position.set(0.2, 1.0, 0.72); g.add(hornR);

    const legGeom = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    for (const [lx, lz] of [[-0.23, -0.4], [0.23, -0.4], [-0.23, 0.4], [0.23, 0.4]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeom, blackMat);
      leg.position.set(lx, 0.28, lz); leg.castShadow = true; g.add(leg);
    }

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), whiteMat);
    tail.position.set(0, 0.65, -0.68); tail.rotation.x = 0.3; g.add(tail);
    return g;
  }
}

// --------------------------- Pig ---------------------------

export class PigManager extends BaseMobManager {
  protected speed() { return 0.85; }
  protected drops(): MobDrop[] { return [{ item: 'porkchop', count: 1 + Math.floor(Math.random() * 2) }]; }
  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0aaa0, roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xd68278, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1413, roughness: 0.9 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3c2a20, roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 1.0), skinMat);
    body.position.y = 0.5; body.castShadow = true; g.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), skinMat);
    head.position.set(0, 0.55, 0.65); head.castShadow = true; g.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.1), noseMat);
    snout.position.set(0, 0.5, 0.9); g.add(snout);

    const nosGeom = new THREE.BoxGeometry(0.05, 0.05, 0.03);
    const nL = new THREE.Mesh(nosGeom, eyeMat); nL.position.set(-0.07, 0.5, 0.96);
    const nR = nL.clone(); nR.position.x = 0.07; g.add(nL); g.add(nR);

    const eyeGeom = new THREE.BoxGeometry(0.07, 0.07, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.16, 0.68, 0.86);
    const eR = eL.clone(); eR.position.x = 0.16; g.add(eL); g.add(eR);

    const earGeom = new THREE.BoxGeometry(0.12, 0.1, 0.06);
    const earL = new THREE.Mesh(earGeom, skinMat); earL.position.set(-0.18, 0.85, 0.55); earL.rotation.z = 0.4; g.add(earL);
    const earR = earL.clone(); earR.position.x = 0.18; earR.rotation.z = -0.4; g.add(earR);

    const legGeom = new THREE.BoxGeometry(0.17, 0.45, 0.17);
    for (const [lx, lz] of [[-0.22, -0.32], [0.22, -0.32], [-0.22, 0.32], [0.22, 0.32]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeom, hoofMat);
      leg.position.set(lx, 0.23, lz); leg.castShadow = true; g.add(leg);
    }

    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), skinMat);
    t1.position.set(0, 0.62, -0.55); g.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), skinMat);
    t2.position.set(0, 0.72, -0.58); g.add(t2);
    return g;
  }
}

// --------------------------- Chicken ---------------------------

export class ChickenManager extends BaseMobManager {
  protected speed() { return 1.1; }
  protected bobRate() { return 12; }
  protected bobAmp() { return 0.06; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] { return [{ item: 'chicken_meat', count: 1 }]; }
  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const featherMat = new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: 0.9 });
    const combMat = new THREE.MeshStandardMaterial({ color: 0xc2362a, roughness: 0.85 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xe5b64e, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161410, roughness: 0.9 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe0a84c, roughness: 0.85 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.55), featherMat);
    body.position.y = 0.45; body.castShadow = true; g.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), featherMat);
    head.position.set(0, 0.78, 0.24); head.castShadow = true; g.add(head);

    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.2), combMat);
    comb.position.set(0, 0.96, 0.22); g.add(comb);

    const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), combMat);
    wattle.position.set(0, 0.66, 0.38); g.add(wattle);

    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.08), beakMat);
    beak.position.set(0, 0.75, 0.4); g.add(beak);

    const eyeGeom = new THREE.BoxGeometry(0.05, 0.05, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.1, 0.83, 0.35);
    const eR = eL.clone(); eR.position.x = 0.1; g.add(eL); g.add(eR);

    const wingGeom = new THREE.BoxGeometry(0.05, 0.28, 0.45);
    const wL = new THREE.Mesh(wingGeom, featherMat); wL.position.set(-0.2, 0.48, 0); g.add(wL);
    const wR = wL.clone(); wR.position.x = 0.2; g.add(wR);

    const legGeom = new THREE.BoxGeometry(0.07, 0.28, 0.07);
    const legL = new THREE.Mesh(legGeom, legMat); legL.position.set(-0.09, 0.14, 0); legL.castShadow = true; g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.09; g.add(legR);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.1), featherMat);
    tail.position.set(0, 0.62, -0.3); tail.rotation.x = -0.4; g.add(tail);
    return g;
  }
}

// --------------------------- Zombie (Hostile) ---------------------------

export class ZombieManager extends BaseMobManager {
  protected speed() { return 1.2; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] { return [{ item: 'rotten_flesh', count: 1 + Math.floor(Math.random() * 2) }]; }

  public isNight = false;
  public attackCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a8a4a, roughness: 0.9 }); // green skin
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.9 }); // teal shirt
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a2a5a, roughness: 0.9 }); // dark pants
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
    const eyeGlowMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: new THREE.Color(0xff2200), emissiveIntensity: 0.6, roughness: 0.5 });

    // Body (shirt)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), shirtMat);
    body.position.y = 1.1; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skinMat);
    head.position.set(0, 1.65, 0); head.castShadow = true; g.add(head);

    // Eyes (red glowing)
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.06, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeGlowMat); eL.position.set(-0.1, 1.7, 0.24); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeGlowMat); eR.position.set(0.1, 1.7, 0.24); g.add(eR);

    // Mouth
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.02), eyeMat);
    mouth.position.set(0, 1.55, 0.24); g.add(mouth);

    // Arms (extended forward like classic zombie)
    const armGeom = new THREE.BoxGeometry(0.18, 0.55, 0.18);
    const armL = new THREE.Mesh(armGeom, skinMat);
    armL.position.set(-0.35, 1.2, 0.35); armL.rotation.x = -Math.PI / 2 + 0.3;
    armL.castShadow = true; g.add(armL);
    const armR = new THREE.Mesh(armGeom, skinMat);
    armR.position.set(0.35, 1.2, 0.35); armR.rotation.x = -Math.PI / 2 + 0.3;
    armR.castShadow = true; g.add(armR);

    // Legs (pants)
    const legGeom = new THREE.BoxGeometry(0.22, 0.6, 0.22);
    const legL = new THREE.Mesh(legGeom, pantsMat);
    legL.position.set(-0.13, 0.45, 0); legL.castShadow = true; g.add(legL);
    const legR = new THREE.Mesh(legGeom, pantsMat);
    legR.position.set(0.13, 0.45, 0); legR.castShadow = true; g.add(legR);

    return g;
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    // Spawn zombies 20-40 blocks from player
    let attempts = 0;
    const target = Math.min(count, 8); // cap at 8 zombies
    while (this.mobs.length < target && attempts < target * 20) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Remove dead mobs
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive && mat.emissiveIntensity < 0.5) {
              mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
            }
          }
        });
      }

      // Day: burn / despawn if isNight is false
      if (!this.isNight) {
        mob.health -= dt * 4; // burn in sunlight
        mob.hurtTimer = 0.1;
        if (mob.health <= 0) {
          mob.dead = true;
          continue;
        }
      }

      // Chase player at night
      if (playerPos && this.isNight) {
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 256) { // 16 block aggro range
          mob.dir = Math.atan2(dzp, dxp);
          mob.nextTurn = 0.5;
        }
      } else if (!this.isNight) {
        // Wander randomly during day (they'll burn anyway)
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 2 + Math.random() * 3;
        }
      } else {
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 2 + Math.random() * 3;
        }
      }

      // Update attack cooldown
      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      const curSpeed = this.isNight && playerPos ? speed * 1.1 : speed * 0.5;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -2.5 || drop > 1.2) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;
    }
  }

  /** Check if any zombie is close enough to attack the player. Returns damage or 0. */
  checkAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      if (dist2 < 2.5) { // ~1.6 block attack range
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 3; // 1.5 hearts per hit
          this.attackCooldowns.set(mob, 1.2); // 1.2s cooldown
        }
      }
    }
    return totalDamage;
  }
}

// --------------------------- Skeleton (Hostile, Ranged) ---------------------------

export class SkeletonManager extends BaseMobManager {
  protected speed() { return 1.0; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [
      { item: 'bone', count: 1 + Math.floor(Math.random() * 2) },
      { item: 'arrow', count: 1 + Math.floor(Math.random() * 3) },
    ];
  }

  public isNight = false;
  public attackCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // Body (ribcage)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.2), boneMat);
    body.position.y = 1.0; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), boneMat);
    head.position.set(0, 1.5, 0); head.castShadow = true; g.add(head);

    // Eyes (slightly recessed)
    const eyeGeom = new THREE.BoxGeometry(0.07, 0.07, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.08, 1.53, 0.16); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.08, 1.53, 0.16); g.add(eR);

    // Arms (angled slightly forward)
    const armGeom = new THREE.BoxGeometry(0.12, 0.5, 0.12);
    const armL = new THREE.Mesh(armGeom, boneMat);
    armL.position.set(-0.22, 1.05, 0.1); armL.rotation.x = -0.3;
    armL.castShadow = true; g.add(armL);
    const armR = new THREE.Mesh(armGeom, boneMat);
    armR.position.set(0.22, 1.05, 0.1); armR.rotation.x = -0.3;
    armR.castShadow = true; g.add(armR);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.12, 0.55, 0.12);
    const legL = new THREE.Mesh(legGeom, boneMat);
    legL.position.set(-0.09, 0.4, 0); legL.castShadow = true; g.add(legL);
    const legR = new THREE.Mesh(legGeom, boneMat);
    legR.position.set(0.09, 0.4, 0); legR.castShadow = true; g.add(legR);

    return g;
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    let attempts = 0;
    const target = Math.min(count, 8);
    while (this.mobs.length < target && attempts < target * 20) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Remove dead mobs
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      // Day: burn in sunlight (same as zombie)
      if (!this.isNight) {
        mob.health -= dt * 4;
        mob.hurtTimer = 0.1;
        if (mob.health <= 0) {
          mob.dead = true;
          continue;
        }
      }

      // Chase player at night within 12 blocks, but flee if too close (< 5 blocks)
      if (playerPos && this.isNight) {
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 25) {
          // Too close — flee away from player
          mob.dir = Math.atan2(-dzp, -dxp);
          mob.nextTurn = 0.5;
        } else if (dist2 < 144) { // 12 blocks
          mob.dir = Math.atan2(dzp, dxp);
          mob.nextTurn = 0.5;
        }
      } else {
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 2 + Math.random() * 3;
        }
      }

      // Update attack cooldown
      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      const curSpeed = this.isNight && playerPos ? speed * 1.1 : speed * 0.5;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -2.5 || drop > 1.2) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;
    }
  }

  /** Ranged attack: fires every 2s when player is 6-16 blocks away. Returns damage or 0. */
  checkRangedAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      const dist = Math.sqrt(dist2);
      if (dist >= 6 && dist <= 16) {
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 3;
          this.attackCooldowns.set(mob, 2.0); // 2s cooldown
        }
      }
    }
    return totalDamage;
  }
}

// --------------------------- Creeper (Hostile, Explodes) ---------------------------

export class CreeperManager extends BaseMobManager {
  protected speed() { return 0.9; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [{ item: 'gunpowder', count: 1 + Math.floor(Math.random() * 2) }];
  }

  public isNight = false;
  private fuseTimers: WeakMap<MobState, number> = new WeakMap();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.9 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a6a2a, roughness: 0.9 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.25), bodyMat);
    body.position.y = 0.8; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), bodyMat);
    head.position.set(0, 1.4, 0); head.castShadow = true; g.add(head);

    // Face: two eyes + frown mouth (sad face)
    const eyeGeom = new THREE.BoxGeometry(0.07, 0.07, 0.02);
    const eL = new THREE.Mesh(eyeGeom, faceMat); eL.position.set(-0.08, 1.48, 0.21); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, faceMat); eR.position.set(0.08, 1.48, 0.21); g.add(eR);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.02), faceMat);
    mouth.position.set(0, 1.32, 0.21); g.add(mouth);

    // 4 short legs at corners
    const legGeom = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    for (const [lx, lz] of [[-0.12, -0.06], [0.12, -0.06], [-0.12, 0.06], [0.12, 0.06]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(lx, 0.2, lz); leg.castShadow = true; g.add(leg);
    }

    return g;
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    let attempts = 0;
    const target = Math.min(count, 8);
    while (this.mobs.length < target && attempts < target * 20) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Remove dead mobs
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      // Creeper does NOT burn in sunlight — survives during the day

      // Walk toward player if within 12 blocks (at night, or if already targeting)
      if (playerPos) {
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 144 && this.isNight) { // 12 blocks
          mob.dir = Math.atan2(dzp, dxp);
          mob.nextTurn = 0.5;
        } else {
          mob.nextTurn -= dt;
          if (mob.nextTurn <= 0) {
            mob.dir = Math.random() * Math.PI * 2;
            mob.nextTurn = 2 + Math.random() * 3;
          }
        }
      } else {
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 2 + Math.random() * 3;
        }
      }

      const curSpeed = this.isNight && playerPos ? speed * 1.1 : speed * 0.5;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -2.5 || drop > 1.2) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;
    }
  }

  /**
   * Check if any creeper is close enough to explode. Tracks fuse timer per mob.
   * Returns { damage, pos } if explosion happens, or null.
   */
  checkExplosion(playerPos: THREE.Vector3, dt: number): { damage: number; pos: THREE.Vector3 } | null {
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      const dist = Math.sqrt(dist2);
      if (dist < 2.5) {
        const fuse = (this.fuseTimers.get(mob) ?? 0) + dt;
        this.fuseTimers.set(mob, fuse);
        // Flash white as fuse progresses
        const flashRate = 5 + fuse * 15;
        const flash = Math.sin(fuse * flashRate) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xffffff : 0x000000);
          }
        });
        if (fuse >= 1.5) {
          mob.dead = true;
          const pos = mob.group.position.clone();
          return { damage: 8, pos };
        }
      } else {
        // Player moved away — reset fuse
        if (this.fuseTimers.has(mob)) {
          this.fuseTimers.set(mob, 0);
          mob.group.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
              if (mat.emissive) mat.emissive.setHex(0x000000);
            }
          });
        }
      }
    }
    return null;
  }
}

// --------------------------- Spider (Hostile at Night, Neutral at Day) ---------------------------

export class SpiderManager extends BaseMobManager {
  protected speed() { return 1.3; }
  protected maxHealth() { return 16; }
  protected prefersGrass() { return false; }
  protected cliffDrop() { return 4; }
  protected drops(): MobDrop[] {
    const d: MobDrop[] = [
      { item: 'string', count: 1 + Math.floor(Math.random() * 2) },
    ];
    if (Math.random() < 0.5) {
      d.push({ item: 'spider_eye', count: 1 });
    }
    return d;
  }

  public isNight = false;
  public attackCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: new THREE.Color(0xff2020), emissiveIntensity: 0.5, roughness: 0.5 });

    // Body (wide and flat)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), bodyMat);
    body.position.y = 0.35; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), headMat);
    head.position.set(0, 0.35, 0.35); head.castShadow = true; g.add(head);

    // 8 red eyes — 4 pairs on front of head
    const eyeGeom = new THREE.BoxGeometry(0.04, 0.04, 0.02);
    const eyePositions: [number, number, number][] = [
      [-0.1, 0.42, 0.53], [-0.04, 0.42, 0.53], [0.04, 0.42, 0.53], [0.1, 0.42, 0.53],
      [-0.08, 0.36, 0.53], [-0.03, 0.36, 0.53], [0.03, 0.36, 0.53], [0.08, 0.36, 0.53],
    ];
    for (const [ex, ey, ez] of eyePositions) {
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      eye.position.set(ex, ey, ez); g.add(eye);
    }

    // 8 legs — 4 per side, angled outward
    const legGeom = new THREE.BoxGeometry(0.06, 0.2, 0.5);
    for (let i = 0; i < 4; i++) {
      const zOff = -0.15 + i * 0.12;
      // Left leg
      const legL = new THREE.Mesh(legGeom, bodyMat);
      legL.position.set(-0.4, 0.25, zOff);
      legL.rotation.z = 0.6; // angle outward
      legL.castShadow = true; g.add(legL);
      // Right leg
      const legR = new THREE.Mesh(legGeom, bodyMat);
      legR.position.set(0.4, 0.25, zOff);
      legR.rotation.z = -0.6;
      legR.castShadow = true; g.add(legR);
    }

    return g;
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    let attempts = 0;
    const target = Math.min(count, 8);
    while (this.mobs.length < target && attempts < target * 20) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Remove dead mobs
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive && mat.emissiveIntensity < 0.4) {
              mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
            }
          }
        });
      }

      // Spider does NOT burn in sunlight

      // At night: chase player within 10 blocks
      // At day: neutral — just wander (only attacks if hit, handled via fleeCooldown)
      if (playerPos && this.isNight) {
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 100) { // 10 blocks
          mob.dir = Math.atan2(dzp, dxp);
          mob.nextTurn = 0.5;
        }
      } else {
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 2 + Math.random() * 3;
        }
      }

      // Update attack cooldown
      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      const curSpeed = this.isNight && playerPos ? speed : speed * 0.6;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -4 || drop > 1.5) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;
    }
  }

  /** Melee attack: 2 damage, 1.0s cooldown. Returns damage or 0. */
  checkAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      if (dist2 < 2.5) {
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 2;
          this.attackCooldowns.set(mob, 1.0);
        }
      }
    }
    return totalDamage;
  }
}

// --------------------------- Wolf (Tameable) ---------------------------

interface WolfMobState extends MobState {
  tamed: boolean;
  sitting: boolean;
}

export class WolfManager extends BaseMobManager {
  protected speed() { return 1.4; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return true; }
  protected drops(): MobDrop[] { return [{ item: 'bone', count: 1 }]; }
  public tamedWolves: Set<MobState> = new Set();
  public sittingWolves: Set<MobState> = new Set();
  private wolfAttackCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0xc8bda8, roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x2a2020, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.7 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.8), furMat);
    body.position.y = 0.55; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), furMat);
    head.position.set(0, 0.7, 0.5); head.castShadow = true; g.add(head);

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), furMat);
    snout.position.set(0, 0.62, 0.72); g.add(snout);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), noseMat);
    nose.position.set(0, 0.66, 0.82); g.add(nose);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.1, 0.78, 0.68); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.1, 0.78, 0.68); g.add(eR);

    // Ears
    const earGeom = new THREE.BoxGeometry(0.1, 0.12, 0.06);
    const earL = new THREE.Mesh(earGeom, furMat); earL.position.set(-0.13, 0.9, 0.48); g.add(earL);
    const earR = new THREE.Mesh(earGeom, furMat); earR.position.set(0.13, 0.9, 0.48); g.add(earR);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.12, 0.35, 0.12);
    for (const [lx, lz] of [[-0.14, -0.28], [0.14, -0.28], [-0.14, 0.28], [0.14, 0.28]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeom, furMat);
      leg.position.set(lx, 0.18, lz); leg.castShadow = true; g.add(leg);
    }

    // Tail (curved up)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), furMat);
    tail.position.set(0, 0.75, -0.45); tail.rotation.x = -0.5; g.add(tail);

    // Collar (hidden initially, shown when tamed)
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), collarMat);
    collar.position.set(0, 0.76, 0.45);
    collar.visible = false;
    collar.name = 'collar';
    g.add(collar);

    return g;
  }

  /** Tame a wolf — shows red collar, marks as tamed */
  tame(mob: MobState) {
    this.tamedWolves.add(mob);
    mob.group.traverse((obj) => {
      if (obj.name === 'collar') obj.visible = true;
    });
    mob.health = 20;
    mob.maxHealth = 20;
  }

  isTamed(mob: MobState): boolean {
    return this.tamedWolves.has(mob);
  }

  toggleSit(mob: MobState) {
    if (this.sittingWolves.has(mob)) {
      this.sittingWolves.delete(mob);
    } else {
      this.sittingWolves.add(mob);
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.tamedWolves.delete(mob);
          this.sittingWolves.delete(mob);
          this.wolfAttackCooldowns.delete(mob);
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      const cd = this.wolfAttackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.wolfAttackCooldowns.set(mob, cd - dt);

      // Sitting wolves don't move
      if (this.sittingWolves.has(mob)) continue;

      if (this.tamedWolves.has(mob) && playerPos) {
        // Follow player
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 > 9) { // >3 blocks → follow
          mob.dir = Math.atan2(dzp, dxp);
        } else {
          // Idle near player
          mob.nextTurn -= dt;
          if (mob.nextTurn <= 0) {
            mob.dir = Math.random() * Math.PI * 2;
            mob.nextTurn = 3 + Math.random() * 3;
          }
        }
        // Teleport if too far
        if (dist2 > 400) { // >20 blocks
          mob.group.position.set(playerPos.x + (Math.random() - 0.5) * 3, playerPos.y, playerPos.z + (Math.random() - 0.5) * 3);
          continue;
        }
      } else {
        // Wild wolf: wander or flee
        if (playerPos) {
          const dxp = mob.group.position.x - playerPos.x;
          const dzp = mob.group.position.z - playerPos.z;
          const dist2 = dxp * dxp + dzp * dzp;
          if (dist2 < 9 && mob.fleeCooldown > 0) {
            mob.dir = Math.atan2(dzp, dxp);
          }
        }
        if (mob.fleeCooldown > 0) mob.fleeCooldown = Math.max(0, mob.fleeCooldown - dt);
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 2 + Math.random() * 3;
        }
      }

      const curSpeed = this.tamedWolves.has(mob) ? speed * 1.2 : speed * 0.7;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -2.5 || drop > 1.2) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;

      // Despawn wild wolves too far from player
      if (!this.tamedWolves.has(mob) && playerPos) {
        const dx2 = mob.group.position.x - playerPos.x;
        const dz2 = mob.group.position.z - playerPos.z;
        if (dx2 * dx2 + dz2 * dz2 > 80 * 80) {
          mob.dead = true;
        }
      }
    }
  }

  /** Tamed wolves attack hostile mob targets. Returns damage dealt. */
  attackTarget(target: THREE.Vector3): number {
    let totalDmg = 0;
    for (const mob of this.mobs) {
      if (mob.dead || !this.tamedWolves.has(mob) || this.sittingWolves.has(mob)) continue;
      const dx = target.x - mob.group.position.x;
      const dz = target.z - mob.group.position.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < 4) {
        const cd = this.wolfAttackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDmg += 4;
          this.wolfAttackCooldowns.set(mob, 1.0);
        }
      }
    }
    return totalDmg;
  }
}

// --------------------------- Enderman (Hostile when looked at) ---------------------------

export class EndermanManager extends BaseMobManager {
  protected speed() { return 1.0; }
  protected maxHealth() { return 40; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [{ item: 'diamond', count: 1 }];
  }

  public isNight = false;
  public attackCooldowns: Map<MobState, number> = new Map();
  private aggroedMobs: Set<MobState> = new Set();
  private teleportTimers: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xcc55ff, emissive: new THREE.Color(0xcc55ff), emissiveIntensity: 0.8, roughness: 0.5 });

    // Body (tall and thin)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.25), skinMat);
    body.position.y = 1.8; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
    head.position.set(0, 2.5, 0); head.castShadow = true; g.add(head);

    // Purple eyes
    const eyeGeom = new THREE.BoxGeometry(0.1, 0.06, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.1, 2.55, 0.21); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.1, 2.55, 0.21); g.add(eR);

    // Long arms
    const armGeom = new THREE.BoxGeometry(0.12, 0.9, 0.12);
    const armL = new THREE.Mesh(armGeom, skinMat);
    armL.position.set(-0.26, 1.6, 0); armL.castShadow = true; g.add(armL);
    const armR = new THREE.Mesh(armGeom, skinMat);
    armR.position.set(0.26, 1.6, 0); armR.castShadow = true; g.add(armR);

    // Long legs
    const legGeom = new THREE.BoxGeometry(0.14, 1.0, 0.14);
    const legL = new THREE.Mesh(legGeom, skinMat);
    legL.position.set(-0.1, 0.5, 0); legL.castShadow = true; g.add(legL);
    const legR = new THREE.Mesh(legGeom, skinMat);
    legR.position.set(0.1, 0.5, 0); legR.castShadow = true; g.add(legR);

    return g;
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    let attempts = 0;
    const target = Math.min(count, 3); // rare spawn — max 3
    while (this.mobs.length < target && attempts < target * 30) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 25;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  /** Check if the player is looking at an enderman — triggers aggro */
  checkLookedAt(playerPos: THREE.Vector3, lookDir: THREE.Vector3) {
    for (const mob of this.mobs) {
      if (mob.dead || this.aggroedMobs.has(mob)) continue;
      const toMob = new THREE.Vector3().subVectors(mob.group.position, playerPos);
      toMob.y = 0; // horizontal only
      const dist = toMob.length();
      if (dist < 1 || dist > 20) continue;
      toMob.normalize();
      const lookH = lookDir.clone();
      lookH.y = 0;
      lookH.normalize();
      const dot = toMob.dot(lookH);
      if (dot > 0.98) { // very precise look
        this.aggroedMobs.add(mob);
      }
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
          this.aggroedMobs.delete(mob);
          this.teleportTimers.delete(mob);
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive && mat.emissiveIntensity < 0.7) {
              mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
            }
          }
        });
      }

      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      // Teleport timer
      const tp = (this.teleportTimers.get(mob) ?? 0) + dt;
      this.teleportTimers.set(mob, tp);

      if (this.aggroedMobs.has(mob) && playerPos) {
        // Chase player aggressively
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        mob.dir = Math.atan2(dzp, dxp);

        // Teleport closer if far and timer expired
        if (dist2 > 100 && tp > 3) {
          this.teleportTimers.set(mob, 0);
          const tpAngle = Math.random() * Math.PI * 2;
          const tpDist = 3 + Math.random() * 3;
          const newTpX = playerPos.x + Math.cos(tpAngle) * tpDist;
          const newTpZ = playerPos.z + Math.sin(tpAngle) * tpDist;
          const surface = this.findSurface(Math.floor(newTpX), Math.floor(newTpZ));
          if (surface !== null) {
            mob.group.position.set(newTpX, surface + 1, newTpZ);
          }
        }
      } else {
        // Wander slowly
        mob.nextTurn -= dt;
        if (mob.nextTurn <= 0) {
          mob.dir = Math.random() * Math.PI * 2;
          mob.nextTurn = 3 + Math.random() * 5;
        }
      }

      const curSpeed = this.aggroedMobs.has(mob) ? speed * 2.0 : speed * 0.4;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -3 || drop > 1.5) {
        mob.dir += Math.PI;
        mob.nextTurn = 2;
        continue;
      }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;

      // Despawn too far
      if (playerPos) {
        const dx2 = mob.group.position.x - playerPos.x;
        const dz2 = mob.group.position.z - playerPos.z;
        if (dx2 * dx2 + dz2 * dz2 > 80 * 80) {
          mob.dead = true;
        }
      }
    }
  }

  /** Melee attack: 7 damage, 1.5s cooldown. Only attacks if aggroed. */
  checkAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead || !this.aggroedMobs.has(mob)) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      if (dist2 < 3) {
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 7;
          this.attackCooldowns.set(mob, 1.5);
        }
      }
    }
    return totalDamage;
  }

  /** When hit, enderman teleports to random nearby position */
  dealDamage(mob: MobState, damage: number): MobDrop[] | null {
    const drops = super.dealDamage(mob, damage);
    if (!mob.dead) {
      // Teleport on hit (~50% chance)
      if (Math.random() < 0.5) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 4 + Math.random() * 6;
        const nx = mob.group.position.x + Math.cos(angle) * dist;
        const nz = mob.group.position.z + Math.sin(angle) * dist;
        const surface = this.findSurface(Math.floor(nx), Math.floor(nz));
        if (surface !== null) {
          mob.group.position.set(nx, surface + 1, nz);
        }
      }
      // Always aggro when hit
      this.aggroedMobs.add(mob);
    }
    return drops;
  }
}

// --------------------------- Iron Golem (Player-friendly protector) ---------------------------

export class IronGolemManager extends BaseMobManager {
  protected speed() { return 0.6; }
  protected maxHealth() { return 100; }
  protected prefersGrass() { return true; }
  protected drops(): MobDrop[] {
    return [
      { item: 'iron_ingot', count: 3 + Math.floor(Math.random() * 3) },
    ];
  }

  public attackCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.9 });

    // Body — large and bulky
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.55), bodyMat);
    body.position.y = 1.6; body.castShadow = true; g.add(body);

    // Head — small compared to body
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), bodyMat);
    head.position.set(0, 2.2, 0); head.castShadow = true; g.add(head);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.04, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.12, 2.25, 0.26); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.12, 2.25, 0.26); g.add(eR);

    // Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.08), noseMat);
    nose.position.set(0, 2.15, 0.28); g.add(nose);

    // Massive arms
    const armGeom = new THREE.BoxGeometry(0.25, 1.2, 0.25);
    const armL = new THREE.Mesh(armGeom, darkMat);
    armL.position.set(-0.6, 1.3, 0); armL.castShadow = true; g.add(armL);
    const armR = new THREE.Mesh(armGeom, darkMat);
    armR.position.set(0.6, 1.3, 0); armR.castShadow = true; g.add(armR);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const legL = new THREE.Mesh(legGeom, darkMat);
    legL.position.set(-0.2, 0.4, 0); legL.castShadow = true; g.add(legL);
    const legR = new THREE.Mesh(legGeom, darkMat);
    legR.position.set(0.2, 0.4, 0); legR.castShadow = true; g.add(legR);

    return g;
  }

  /** Iron golem attacks hostile mobs near player. Returns mob position if attacking. */
  attackHostileNear(hostileMobPos: THREE.Vector3): number {
    let totalDmg = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = hostileMobPos.x - mob.group.position.x;
      const dz = hostileMobPos.z - mob.group.position.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < 9) { // 3 blocks
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDmg += 10; // iron golem hits hard
          this.attackCooldowns.set(mob, 1.5);
          // Face the target
          mob.dir = Math.atan2(dz, dx);
        }
      }
    }
    return totalDmg;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    // Iron golems wander slowly, don't flee, don't despawn
    const speed = this.speed();
    const bobRate = this.bobRate();
    const bobAmp = this.bobAmp();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      // Wander around slowly
      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 4 + Math.random() * 6;
      }

      const dx = Math.cos(mob.dir) * speed * dt;
      const dz = Math.sin(mob.dir) * speed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) { mob.dir += Math.PI; mob.nextTurn = 2; continue; }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -2 || drop > 1.2) { mob.dir += Math.PI; mob.nextTurn = 2; continue; }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * bobRate;
      mob.group.position.y += Math.sin(mob.bobPhase) * bobAmp;
    }
  }
}

// --------------------------- Slime (Hostile, bounces, splits on death) ---------------------------

export class SlimeManager extends BaseMobManager {
  protected speed() { return 0.8; }
  protected maxHealth() { return 16; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [{ item: 'seeds', count: 1 + Math.floor(Math.random() * 2) }];
  }

  public isNight = false;
  public attackCooldowns: Map<MobState, number> = new Map();
  private slimeSizes: Map<MobState, number> = new Map(); // 1 = small, 2 = medium, 3 = large
  private bouncePhases: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    return this.buildSlime(1.0);
  }

  private buildSlime(scale: number): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x55cc55, roughness: 0.3, transparent: true, opacity: 0.7 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x338833, roughness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    // Outer body (translucent cube)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.7 * scale, 0.7 * scale), bodyMat);
    body.position.y = 0.35 * scale; body.castShadow = true; g.add(body);

    // Inner core
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.35 * scale, 0.35 * scale, 0.35 * scale), coreMat);
    core.position.y = 0.35 * scale; g.add(core);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.08 * scale, 0.08 * scale, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.12 * scale, 0.42 * scale, 0.36 * scale); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.08 * scale, 0.42 * scale, 0.36 * scale); g.add(eR);

    // Mouth
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.04 * scale, 0.02), eyeMat);
    mouth.position.set(0, 0.28 * scale, 0.36 * scale); g.add(mouth);

    return g;
  }

  spawnSlime(x: number, y: number, z: number, size: number) {
    const scale = size === 3 ? 1.4 : size === 2 ? 1.0 : 0.6;
    const g = this.buildSlime(scale);
    g.position.set(x, y, z);
    this.scene.add(g);
    const mob: MobState = {
      group: g,
      dir: Math.random() * Math.PI * 2,
      nextTurn: 1 + Math.random() * 2,
      bobPhase: Math.random() * Math.PI * 2,
      fleeCooldown: 0,
      health: size * 4,
      maxHealth: size * 4,
      hurtTimer: 0,
      dead: false,
    };
    this.mobs.push(mob);
    this.slimeSizes.set(mob, size);
    this.bouncePhases.set(mob, Math.random() * Math.PI * 2);
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    let attempts = 0;
    const target = Math.min(count, 5);
    while (this.mobs.length < target && attempts < target * 20) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      const size = 2 + Math.floor(Math.random() * 2); // medium or large
      this.spawnSlime(x, surface + 1, z, size);
    }
  }

  /** Override dealDamage to split into smaller slimes on death */
  dealDamage(mob: MobState, damage: number): MobDrop[] | null {
    const drops = super.dealDamage(mob, damage);
    if (mob.dead) {
      const size = this.slimeSizes.get(mob) ?? 1;
      if (size > 1) {
        // Spawn 2-3 smaller slimes
        const childCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < childCount; i++) {
          const nx = mob.group.position.x + (Math.random() - 0.5) * 2;
          const nz = mob.group.position.z + (Math.random() - 0.5) * 2;
          this.spawnSlime(nx, mob.group.position.y, nz, size - 1);
        }
      }
      this.slimeSizes.delete(mob);
      this.bouncePhases.delete(mob);
    }
    return drops;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      // Hop toward player if nearby
      if (playerPos) {
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 144) { // 12 blocks
          mob.dir = Math.atan2(dzp, dxp);
          mob.nextTurn = 0.5;
        }
      }

      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 1 + Math.random() * 2;
      }

      // Bouncing movement
      const bp = (this.bouncePhases.get(mob) ?? 0) + dt * 4;
      this.bouncePhases.set(mob, bp);
      const bounce = Math.abs(Math.sin(bp)) * 0.3;

      const curSpeed = speed;
      const dx = Math.cos(mob.dir) * curSpeed * dt;
      const dz = Math.sin(mob.dir) * curSpeed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);

      if (surface === null) { mob.dir += Math.PI; mob.nextTurn = 1; continue; }

      const targetY = surface + 1;
      mob.group.position.set(newX, targetY + bounce, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;

      // Squash and stretch effect
      const squash = 1.0 + Math.sin(bp) * 0.15;
      mob.group.scale.set(1, squash, 1);

      // Despawn too far
      if (playerPos) {
        const dx2 = mob.group.position.x - playerPos.x;
        const dz2 = mob.group.position.z - playerPos.z;
        if (dx2 * dx2 + dz2 * dz2 > 80 * 80) {
          mob.dead = true;
        }
      }
    }
  }

  checkAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      const size = this.slimeSizes.get(mob) ?? 1;
      if (dist2 < 2.5) {
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += size; // damage scales with size
          this.attackCooldowns.set(mob, 1.2);
        }
      }
    }
    return totalDamage;
  }
}

// --------------------------- Bat (Ambient flying cave mob) ---------------------------

export class BatManager extends BaseMobManager {
  protected speed() { return 2.0; }
  protected maxHealth() { return 6; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] { return []; } // bats drop nothing
  protected bobRate() { return 15; }
  protected bobAmp() { return 0.1; }

  private flyHeights: Map<MobState, number> = new Map();
  private wingPhases: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    // Small body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.12), bodyMat);
    body.position.y = 0; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), bodyMat);
    head.position.set(0, 0.14, 0.04); g.add(head);

    // Ears
    const earGeom = new THREE.BoxGeometry(0.05, 0.08, 0.03);
    const earL = new THREE.Mesh(earGeom, bodyMat); earL.position.set(-0.06, 0.24, 0.04); g.add(earL);
    const earR = new THREE.Mesh(earGeom, bodyMat); earR.position.set(0.06, 0.24, 0.04); g.add(earR);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.03, 0.03, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.04, 0.16, 0.08); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.04, 0.16, 0.08); g.add(eR);

    // Wings (will be animated)
    const wingGeom = new THREE.BoxGeometry(0.3, 0.02, 0.18);
    const wingL = new THREE.Mesh(wingGeom, wingMat);
    wingL.position.set(-0.2, 0.02, 0);
    wingL.name = 'wingL';
    g.add(wingL);
    const wingR = new THREE.Mesh(wingGeom, wingMat);
    wingR.position.set(0.2, 0.02, 0);
    wingR.name = 'wingR';
    g.add(wingR);

    return g;
  }

  spawnBats(count: number, cx: number, cz: number, radius: number) {
    let attempts = 0;
    while (this.mobs.length < count && attempts < count * 15) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      const flyHeight = surface + 4 + Math.random() * 6; // fly 4-10 blocks above ground
      const g = this.buildMob();
      g.position.set(x, flyHeight, z);
      this.scene.add(g);
      const mob: MobState = {
        group: g,
        dir: Math.random() * Math.PI * 2,
        nextTurn: 1 + Math.random() * 3,
        bobPhase: Math.random() * Math.PI * 2,
        fleeCooldown: 0,
        health: this.maxHealth(),
        maxHealth: this.maxHealth(),
        hurtTimer: 0,
        dead: false,
      };
      this.mobs.push(mob);
      this.flyHeights.set(mob, flyHeight);
      this.wingPhases.set(mob, Math.random() * Math.PI * 2);
    }
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.85);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.flyHeights.delete(mob);
          this.wingPhases.delete(mob);
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      // Random direction changes more frequently
      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 0.5 + Math.random() * 2;
        // Occasionally change fly height
        const currentH = this.flyHeights.get(mob) ?? mob.group.position.y;
        this.flyHeights.set(mob, currentH + (Math.random() - 0.5) * 3);
      }

      // Flee from player if close
      if (playerPos) {
        const dxp = mob.group.position.x - playerPos.x;
        const dzp = mob.group.position.z - playerPos.z;
        const dist2 = dxp * dxp + dzp * dzp;
        if (dist2 < 16) {
          mob.dir = Math.atan2(dzp, dxp);
          mob.nextTurn = 0.3;
        }
      }

      const dx = Math.cos(mob.dir) * speed * dt;
      const dz = Math.sin(mob.dir) * speed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      // Fly toward target height with bob
      const targetH = this.flyHeights.get(mob) ?? mob.group.position.y;
      const currentY = mob.group.position.y;
      const yDiff = targetH - currentY;
      const newY = currentY + yDiff * dt * 2;

      mob.group.position.set(newX, newY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;

      // Animate wings
      const wp = (this.wingPhases.get(mob) ?? 0) + dt * 15;
      this.wingPhases.set(mob, wp);
      const wingAngle = Math.sin(wp) * 0.5;
      mob.group.traverse((obj) => {
        if (obj.name === 'wingL') obj.rotation.z = wingAngle;
        if (obj.name === 'wingR') obj.rotation.z = -wingAngle;
      });

      // Bob up and down
      mob.group.position.y += Math.sin(wp * 0.3) * 0.1;

      // Despawn too far
      if (playerPos) {
        const dx2 = mob.group.position.x - playerPos.x;
        const dz2 = mob.group.position.z - playerPos.z;
        if (dx2 * dx2 + dz2 * dz2 > 60 * 60) {
          mob.dead = true;
        }
      }
    }
  }
}

// --------------------------- Villager (Passive, trading NPC) ---------------------------

export class VillagerManager extends BaseMobManager {
  protected speed() { return 0.4; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return true; }
  protected drops(): MobDrop[] {
    return [{ item: 'emerald', count: 1 + Math.floor(Math.random() * 3) }];
  }
  protected bobRate() { return 5; }

  // Track trade cooldowns per villager
  private tradeCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xc4956a, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.9 });

    // Body (robe)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.35), robeMat);
    body.position.y = 0.55; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
    head.position.y = 1.2; head.castShadow = true; g.add(head);

    // Nose (big MC-style nose)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), noseMat);
    nose.position.set(0, 1.14, 0.24); g.add(nose);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.1, 1.24, 0.21); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.1, 1.24, 0.21); g.add(eR);

    // Arms (folded in robe)
    const armGeom = new THREE.BoxGeometry(0.16, 0.15, 0.35);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x7a3a10, roughness: 0.85 });
    const arms = new THREE.Mesh(armGeom, armMat);
    arms.position.set(0, 0.75, 0.12); g.add(arms);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.4, 0.2);
    const legL = new THREE.Mesh(legGeom, robeMat); legL.position.set(-0.12, 0.1, 0); legL.name = 'legL'; g.add(legL);
    const legR = new THREE.Mesh(legGeom, robeMat); legR.position.set(0.12, 0.1, 0); legR.name = 'legR'; g.add(legR);

    return g;
  }

  /** Check if a villager can trade (1s cooldown per trade) */
  canTrade(mob: MobState): boolean {
    const cd = this.tradeCooldowns.get(mob) ?? 0;
    return cd <= 0;
  }

  /** Mark trade cooldown */
  markTraded(mob: MobState) {
    this.tradeCooldowns.set(mob, 5); // 5 second cooldown between trades
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    // Use base update for movement
    super.update(dt, playerPos);
    // Update trade cooldowns
    for (const [mob, cd] of this.tradeCooldowns) {
      if (cd > 0) this.tradeCooldowns.set(mob, cd - dt);
    }
  }

  clear() {
    super.clear();
    this.tradeCooldowns.clear();
  }
}

// --------------------------- Witch (Hostile, ranged potion thrower) ---------------------------

export class WitchManager extends BaseMobManager {
  protected speed() { return 0.6; }
  protected maxHealth() { return 26; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    const r = Math.random();
    if (r < 0.3) return [{ item: 'glass_bottle', count: 1 + Math.floor(Math.random() * 3) }, { item: 'spider_eye', count: 1 }];
    if (r < 0.6) return [{ item: 'gunpowder', count: 1 + Math.floor(Math.random() * 2) }, { item: 'glass_bottle', count: 1 }];
    return [{ item: 'spider_eye', count: 1 + Math.floor(Math.random() * 2) }];
  }

  public isNight = false;
  private attackCooldowns: Map<MobState, number> = new Map();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x3a1a4a, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x1a0a2a, roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.8 }); // green nose (wart)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x880088, roughness: 0.9 }); // purple eyes

    // Body (purple robe)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.35), robeMat);
    body.position.y = 0.55; body.castShadow = true; g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
    head.position.y = 1.15; head.castShadow = true; g.add(head);

    // Witch hat (3 layers getting smaller)
    const hatBrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.55), hatMat);
    hatBrim.position.y = 1.38; g.add(hatBrim);
    const hatMid = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.35), hatMat);
    hatMid.position.y = 1.5; g.add(hatMid);
    const hatTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), hatMat);
    hatTop.position.y = 1.68; hatTop.rotation.z = 0.1; g.add(hatTop);

    // Nose (warty)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), noseMat);
    nose.position.set(0, 1.1, 0.24); g.add(nose);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eL = new THREE.Mesh(eyeGeom, eyeMat); eL.position.set(-0.1, 1.2, 0.21); g.add(eL);
    const eR = new THREE.Mesh(eyeGeom, eyeMat); eR.position.set(0.1, 1.2, 0.21); g.add(eR);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.18, 0.35, 0.18);
    const legL = new THREE.Mesh(legGeom, robeMat); legL.position.set(-0.12, 0.1, 0); legL.name = 'legL'; g.add(legL);
    const legR = new THREE.Mesh(legGeom, robeMat); legR.position.set(0.12, 0.1, 0); legR.name = 'legR'; g.add(legR);

    return g;
  }

  spawnNight(count: number, playerX: number, playerZ: number) {
    let attempts = 0;
    const target = this.mobs.length + count;
    while (this.mobs.length < target && attempts < count * 20) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 25;
      const x = playerX + Math.cos(angle) * dist;
      const z = playerZ + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      if (surface === null) continue;
      this.addMob(x, surface + 1, z);
    }
  }

  /** Check ranged attack: witch throws potion at player within 10 blocks */
  checkRangedAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist2 = dx * dx + dz * dz + dy * dy;
      if (dist2 < 100 && dist2 > 4) { // 2-10 blocks range
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 3 + Math.floor(Math.random() * 3); // 3-5 damage
          this.attackCooldowns.set(mob, 3.0); // 3 second cooldown
          // Face player
          mob.dir = Math.atan2(-dx, -dz);
        }
      }
    }
    return totalDamage;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    const speed = this.speed();

    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
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
          this.mobs.splice(mi, 1);
          this.attackCooldowns.delete(mob);
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      // Keep distance from player (ranged mob stays 5-8 blocks away)
      if (playerPos) {
        const dxp = playerPos.x - mob.group.position.x;
        const dzp = playerPos.z - mob.group.position.z;
        const dist = Math.sqrt(dxp * dxp + dzp * dzp);
        if (dist < 5) {
          // Too close — back away
          mob.dir = Math.atan2(-dzp, -dxp);
          mob.nextTurn = 0.3;
        } else if (dist < 12) {
          // In range — strafe (circle player)
          mob.dir = Math.atan2(dzp, dxp) + Math.PI / 2;
          mob.nextTurn = 1;
        }
      }

      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 2 + Math.random() * 3;
      }

      const dx = Math.cos(mob.dir) * speed * dt;
      const dz = Math.sin(mob.dir) * speed * dt;
      const newX = mob.group.position.x + dx;
      const newZ = mob.group.position.z + dz;

      const gx = Math.floor(newX);
      const gz = Math.floor(newZ);
      const surface = this.findSurface(gx, gz);
      if (surface === null) { mob.dir += Math.PI; mob.nextTurn = 2; continue; }

      const targetY = surface + 1;
      const drop = targetY - mob.group.position.y;
      if (drop < -2.5 || drop > 1.2) { mob.dir += Math.PI; mob.nextTurn = 2; continue; }

      mob.group.position.set(newX, targetY, newZ);
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      mob.bobPhase += dt * 5;
      mob.group.position.y += Math.sin(mob.bobPhase) * 0.03;

      // Despawn too far
      if (playerPos) {
        const dx2 = mob.group.position.x - playerPos.x;
        const dz2 = mob.group.position.z - playerPos.z;
        if (dx2 * dx2 + dz2 * dz2 > 80 * 80) {
          mob.dead = true;
        }
      }
    }
  }
}

// --------------------------- Blaze (Hostile, Ranged, Nether) ---------------------------

export class BlazeManager extends BaseMobManager {
  protected speed() { return 0.5; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [{ item: 'blaze_rod', count: 1 + Math.floor(Math.random() * 2) }];
  }

  private attackCooldowns: WeakMap<MobState, number> = new WeakMap();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0a020, emissive: 0xff6600, emissiveIntensity: 0.6 });
    // Head — golden cube
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), bodyMat);
    head.position.y = 1.2;
    g.add(head);
    // Body — thin column
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), bodyMat);
    body.position.y = 0.7;
    g.add(body);
    // Floating rods — 4 rods rotating around body
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xe8c020, emissive: 0xcc8800, emissiveIntensity: 0.5 });
    for (let i = 0; i < 4; i++) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), rodMat);
      const angle = (i / 4) * Math.PI * 2;
      rod.position.set(Math.cos(angle) * 0.5, 0.5 + Math.sin(i * 1.3) * 0.2, Math.sin(angle) * 0.5);
      rod.rotation.z = Math.random() * 0.5;
      g.add(rod);
    }
    // Eyes — orange glowing dots
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.0 });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), eyeMat);
    le.position.set(-0.1, 1.25, 0.26);
    g.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), eyeMat);
    re.position.set(0.1, 1.25, 0.26);
    g.add(re);
    return g;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      // Update attack cooldown
      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      if (!playerPos) continue;
      const dx = playerPos.x - mob.group.position.x;
      const dz = playerPos.z - mob.group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Hover: blaze floats
      mob.bobPhase += dt * 2;
      mob.group.position.y += Math.sin(mob.bobPhase) * 0.003;

      // Face and slowly approach player if within 20 blocks
      if (dist < 20 && dist > 5) {
        mob.dir = Math.atan2(dx, dz);
        mob.group.position.x += Math.sin(mob.dir) * this.speed() * dt;
        mob.group.position.z += Math.cos(mob.dir) * this.speed() * dt;
      }
      mob.group.rotation.y = -mob.dir + Math.PI / 2;

      // Rotate the rods
      for (let i = 4; i < 8 && i < mob.group.children.length; i++) {
        const rod = mob.group.children[i];
        if (rod) rod.rotation.y += dt * 2;
      }

      // Despawn too far
      if (dist > 80) mob.dead = true;
    }
  }

  /** Fireball attack: 4 damage, range 4-16, 3s cooldown */
  checkRangedAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (dist >= 4 && dist <= 16) {
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 4;
          this.attackCooldowns.set(mob, 3.0);
        }
      }
    }
    return totalDamage;
  }
}

// --------------------------- Phantom (Hostile, Flying, Night-only) ---------------------------

export class PhantomManager extends BaseMobManager {
  protected speed() { return 1.2; }
  protected maxHealth() { return 20; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [{ item: 'leather', count: 1 + Math.floor(Math.random() * 2) }];
  }

  public isNight = false;

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    // Body — dark teal, flat and wide (bat-like)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, emissive: 0x1a2a4a, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.4), bodyMat);
    body.position.y = 0.1;
    g.add(body);
    // Wings — two flat rectangles
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, emissive: 0x2a4a6a, emissiveIntensity: 0.2 });
    const lw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.35), wingMat);
    lw.position.set(-0.7, 0.15, 0);
    g.add(lw);
    const rw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.35), wingMat);
    rw.position.set(0.7, 0.15, 0);
    g.add(rw);
    // Eyes — bright green
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x22cc22, emissiveIntensity: 1.0 });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), eyeMat);
    le.position.set(-0.1, 0.18, 0.21);
    g.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), eyeMat);
    re.position.set(0.1, 0.18, 0.21);
    g.add(re);
    return g;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    // Remove dead
    this.mobs = this.mobs.filter(m => {
      if (m.dead) { this.scene.remove(m.group); return false; }
      return true;
    });
    if (!this.isNight) return; // only active at night

    for (const mob of this.mobs) {
      if (mob.dead) continue;
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);

      if (!playerPos) continue;
      const dx = playerPos.x - mob.group.position.x;
      const dy = (playerPos.y + 8) - mob.group.position.y; // fly above player
      const dz = playerPos.z - mob.group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Dive attack: swoop toward player
      mob.bobPhase += dt * 4;
      const swoopY = Math.sin(mob.bobPhase) * 3;

      if (dist < 30) {
        mob.dir = Math.atan2(dx, dz);
        mob.group.position.x += Math.sin(mob.dir) * this.speed() * dt;
        mob.group.position.z += Math.cos(mob.dir) * this.speed() * dt;
        mob.group.position.y += (playerPos.y + 6 + swoopY - mob.group.position.y) * dt * 0.5;
      }
      mob.group.rotation.y = -mob.dir + Math.PI / 2;
      // Wing flap
      if (mob.group.children[1]) mob.group.children[1].rotation.z = Math.sin(mob.bobPhase * 2) * 0.3;
      if (mob.group.children[2]) mob.group.children[2].rotation.z = -Math.sin(mob.bobPhase * 2) * 0.3;

      if (dist > 80) mob.dead = true;
    }
  }

  /** Dive attack: 4 damage when close */
  checkDiveAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dy = mob.group.position.y - playerPos.y;
      const dz = mob.group.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 2.5) {
        mob.fleeCooldown -= 0.016; // approximate dt
        if (mob.fleeCooldown <= 0) {
          totalDamage += 4;
          mob.fleeCooldown = 2.5; // 2.5s between swoops
        }
      }
    }
    return totalDamage;
  }

  spawnFlying(count: number, cx: number, cz: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const y = 25 + Math.random() * 10; // spawn high in the sky
      this.addMob(x, y, z);
    }
  }
}

// --------------------------- Fox (Passive, Nocturnal) ---------------------------

export class FoxManager extends BaseMobManager {
  protected speed() { return 0.7; }
  protected maxHealth() { return 10; }
  protected prefersGrass() { return true; }
  protected drops(): MobDrop[] {
    return [{ item: 'leather', count: 1 }];
  }

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    // Body — orange
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd4782a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.55), bodyMat);
    body.position.y = 0.35;
    g.add(body);
    // Head — orange with white snout
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), bodyMat);
    head.position.set(0, 0.5, 0.35);
    g.add(head);
    // White snout
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d0 });
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.1), whiteMat);
    snout.position.set(0, 0.45, 0.5);
    g.add(snout);
    // Ears — pointy orange triangles (boxes)
    const earMat = new THREE.MeshStandardMaterial({ color: 0xd4782a });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.06), earMat);
    le.position.set(-0.1, 0.68, 0.35);
    g.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.06), earMat);
    re.position.set(0.1, 0.68, 0.35);
    g.add(re);
    // Tail — fluffy orange with white tip
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), bodyMat);
    tail.position.set(0, 0.4, -0.4);
    tail.rotation.x = 0.4;
    g.add(tail);
    const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), whiteMat);
    tailTip.position.set(0, 0.45, -0.6);
    g.add(tailTip);
    // Eyes — black dots
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), eyeMat);
    eyeL.position.set(-0.08, 0.55, 0.5);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), eyeMat);
    eyeR.position.set(0.08, 0.55, 0.5);
    g.add(eyeR);
    // Legs — 4 short dark orange legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const legPos = [[-0.1, 0.1, 0.15], [0.1, 0.1, 0.15], [-0.1, 0.1, -0.15], [0.1, 0.1, -0.15]];
    for (const [lx, ly, lz] of legPos) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), legMat);
      leg.position.set(lx, ly, lz);
      g.add(leg);
    }
    return g;
  }
}

// --------------------------- Ghast (Hostile, Flying, Ranged) ---------------------------

export class GhastManager extends BaseMobManager {
  protected speed() { return 0.4; }
  protected maxHealth() { return 10; }
  protected prefersGrass() { return false; }
  protected drops(): MobDrop[] {
    return [
      { item: 'ghast_tear', count: 1 },
      { item: 'gunpowder', count: 1 + Math.floor(Math.random() * 2) },
    ];
  }

  private attackCooldowns: WeakMap<MobState, number> = new WeakMap();

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    // Body — large white cube (ghost-like)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), bodyMat);
    body.position.y = 0;
    g.add(body);
    // Eyes — sad dark rectangles
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.05), eyeMat);
    le.position.set(-0.25, 0.1, 0.61);
    g.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.05), eyeMat);
    re.position.set(0.25, 0.1, 0.61);
    g.add(re);
    // Mouth — open dark rectangle (sad/screaming)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), eyeMat);
    mouth.position.set(0, -0.2, 0.61);
    g.add(mouth);
    // Tentacles — 9 hanging thin boxes
    const tentMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, transparent: true, opacity: 0.8 });
    for (let tx = -1; tx <= 1; tx++) {
      for (let tz = -1; tz <= 1; tz++) {
        const tent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5 + Math.random() * 0.5, 0.12), tentMat);
        tent.position.set(tx * 0.3, -0.9 - Math.random() * 0.3, tz * 0.3);
        g.add(tent);
      }
    }
    return g;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    this.mobs = this.mobs.filter(m => {
      if (m.dead) { this.scene.remove(m.group); return false; }
      return true;
    });
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      const cd = this.attackCooldowns.get(mob) ?? 0;
      if (cd > 0) this.attackCooldowns.set(mob, cd - dt);

      // Float and drift
      mob.bobPhase += dt * 1.5;
      mob.group.position.y += Math.sin(mob.bobPhase) * 0.002;

      if (playerPos) {
        const dx = playerPos.x - mob.group.position.x;
        const dz = playerPos.z - mob.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 30 && dist > 8) {
          mob.dir = Math.atan2(dx, dz);
          mob.group.position.x += Math.sin(mob.dir) * this.speed() * dt;
          mob.group.position.z += Math.cos(mob.dir) * this.speed() * dt;
        }
        mob.group.rotation.y = -mob.dir + Math.PI / 2;
        if (dist > 80) mob.dead = true;
      }

      // Sway tentacles
      for (let i = 4; i < mob.group.children.length; i++) {
        const tent = mob.group.children[i];
        if (tent) tent.rotation.x = Math.sin(mob.bobPhase + i * 0.5) * 0.15;
      }
    }
  }

  /** Fireball: 6 damage, range 8-24, 5s cooldown */
  checkRangedAttack(playerPos: THREE.Vector3): number {
    let totalDamage = 0;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const dx = mob.group.position.x - playerPos.x;
      const dz = mob.group.position.z - playerPos.z;
      const dy = mob.group.position.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (dist >= 8 && dist <= 24) {
        const cd = this.attackCooldowns.get(mob) ?? 0;
        if (cd <= 0) {
          totalDamage += 6;
          this.attackCooldowns.set(mob, 5.0);
        }
      }
    }
    return totalDamage;
  }

  spawnFlying(count: number, cx: number, cz: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const y = 30 + Math.random() * 15;
      this.addMob(x, y, z);
    }
  }
}

// ======================================================================
// PARROT — small passive flying bird, colorful, forest-dweller
// ======================================================================
export class ParrotManager extends BaseMobManager {
  constructor(scene: THREE.Scene, world: WorldRenderer) {
    super(scene, world);
  }

  protected speed() { return 0.8; }
  protected maxHealth() { return 6; }
  protected drops(): MobDrop[] { return [{ item: 'seeds', count: 1 }]; }

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();
    // Pick random color variant
    const colors = [0xcc2222, 0x2255cc, 0x22cc22, 0xcccc22, 0x22cccc];
    const bodyColor = colors[Math.floor(Math.random() * colors.length)];

    // Body — small oval
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.3, 0.2),
      new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    body.position.set(0, 0.6, 0);
    g.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.18),
      new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    head.position.set(0, 0.85, 0.05);
    g.add(head);

    // Beak
    const beak = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xf0c020 })
    );
    beak.position.set(0, 0.82, 0.15);
    g.add(beak);

    // Eyes
    for (const sx of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      eye.position.set(sx, 0.88, 0.1);
      g.add(eye);
    }

    // Wings
    for (const sx of [-0.18, 0.18]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.2, 0.15),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyColor).offsetHSL(0, 0, -0.15) })
      );
      wing.position.set(sx, 0.6, 0);
      g.add(wing);
    }

    // Tail
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, 0.2),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyColor).offsetHSL(0, 0, -0.2) })
    );
    tail.position.set(0, 0.55, -0.15);
    g.add(tail);

    return g;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Dead removal
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
          this.scene.remove(mob.group);
          this.mobs.splice(mi, 1);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 2 + Math.random() * 4;
      }

      const spd = this.speed() * dt;
      mob.group.position.x += Math.sin(mob.dir) * spd;
      mob.group.position.z += Math.cos(mob.dir) * spd;

      // Gentle bobbing
      mob.bobPhase += dt * 2;
      mob.group.position.y += Math.sin(mob.bobPhase) * 0.01;

      // Keep above ground
      const gx = Math.floor(mob.group.position.x);
      const gz = Math.floor(mob.group.position.z);
      const surface = this.findSurface(gx, gz);
      const groundY = surface !== null ? surface + 1 : 10;
      if (mob.group.position.y < groundY + 3) {
        mob.group.position.y = groundY + 3 + Math.random() * 2;
      }
      if (mob.group.position.y > 40) mob.group.position.y = 35;

      mob.group.rotation.y = mob.dir;

      // Wing flap animation
      if (mob.group.children.length > 4) {
        const w1 = mob.group.children[4];
        const w2 = mob.group.children[5];
        if (w1) w1.rotation.z = Math.sin(mob.bobPhase * 3) * 0.4;
        if (w2) w2.rotation.z = -Math.sin(mob.bobPhase * 3) * 0.4;
      }

      // Flee from player
      if (playerPos) {
        const dx = mob.group.position.x - playerPos.x;
        const dz = mob.group.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 4) {
          mob.dir = Math.atan2(dx, dz);
          mob.group.position.y += dt * 2;
        }
        // Despawn far mobs
        if (dist > 80) mob.dead = true;
      }
    }
  }

  spawnFlying(count: number, cx: number, cz: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      const surface = this.findSurface(gx, gz);
      const y = (surface !== null ? surface + 1 : 10) + 4 + Math.random() * 5;
      this.addMob(x, y, z);
    }
  }
}

// ======================================================================
// TURTLE — passive ground mob, slow, found near water
// ======================================================================
export class TurtleManager extends BaseMobManager {
  constructor(scene: THREE.Scene, world: WorldRenderer) {
    super(scene, world);
  }

  protected speed() { return 0.2; }
  protected maxHealth() { return 30; }
  protected drops(): MobDrop[] { return [{ item: 'leather', count: 1 }]; }

  protected buildMob(): THREE.Group {
    const g = new THREE.Group();

    // Shell (top)
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.35, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x2a6a2a })
    );
    shell.position.set(0, 0.35, 0);
    g.add(shell);

    // Shell underside
    const belly = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.1, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xd4c890 })
    );
    belly.position.set(0, 0.15, 0);
    g.add(belly);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x3a8a3a })
    );
    head.position.set(0, 0.3, 0.55);
    g.add(head);

    // Eyes
    for (const sx of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      eye.position.set(sx, 0.35, 0.68);
      g.add(eye);
    }

    // Legs (4 stubby legs)
    for (const [lx, lz] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x3a8a3a })
      );
      leg.position.set(lx, 0.08, lz);
      g.add(leg);
    }

    return g;
  }

  update(dt: number, playerPos?: THREE.Vector3) {
    for (let mi = this.mobs.length - 1; mi >= 0; mi--) {
      const mob = this.mobs[mi];

      // Dead removal
      if (mob.dead) {
        mob.hurtTimer -= dt;
        mob.group.scale.multiplyScalar(0.9);
        if (mob.hurtTimer <= -0.3) {
          this.scene.remove(mob.group);
          this.mobs.splice(mi, 1);
        }
        continue;
      }

      // Hurt flash
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 20) > 0;
        mob.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
          }
        });
      }

      mob.nextTurn -= dt;
      if (mob.nextTurn <= 0) {
        mob.dir = Math.random() * Math.PI * 2;
        mob.nextTurn = 5 + Math.random() * 8;
      }

      const spd = this.speed() * dt;
      const nx = mob.group.position.x + Math.sin(mob.dir) * spd;
      const nz = mob.group.position.z + Math.cos(mob.dir) * spd;

      const gx = Math.floor(nx);
      const gz = Math.floor(nz);
      const surface = this.findSurface(gx, gz);
      const gy = surface !== null ? surface + 1 : mob.group.position.y;
      mob.group.position.set(nx, gy + 0.01, nz);
      mob.group.rotation.y = mob.dir;

      mob.bobPhase += dt;
      mob.group.position.y += Math.sin(mob.bobPhase * 2) * 0.01;

      // Retract into shell when player is close
      if (playerPos) {
        const dx = mob.group.position.x - playerPos.x;
        const dz = mob.group.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3) {
          if (mob.group.children[2]) mob.group.children[2].scale.set(0.01, 0.01, 0.01);
          mob.nextTurn = 2;
        } else {
          if (mob.group.children[2]) mob.group.children[2].scale.set(1, 1, 1);
        }
        // Despawn far mobs
        if (dist > 80) mob.dead = true;
      }
    }
  }
}
