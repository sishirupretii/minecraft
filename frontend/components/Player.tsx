'use client';

import * as THREE from 'three';
import { WorldRenderer } from './World';
import { BlockType } from '@/lib/blocks';
import { ITEMS, ItemDef, Inventory } from '@/lib/items';

interface PlayerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  world: WorldRenderer;
  spawn: { x: number; y: number; z: number };
}

// Per-block-type BARE-HAND break time in seconds.
// Break times drastically reduced for better player UX — blocks should feel
// responsive even without a matching tool. Hardness tier is preserved
// (soft < medium < hard) but values are roughly 1/3 of the old times.
const BREAK_TIMES: Record<BlockType, number> = {
  base_blue: 0.25,
  deep_blue: 0.2,
  ice_stone: 0.2,
  cyan_wood: 0.4,
  sand_blue: 0.2,
  royal_brick: 0.5,
  planks: 0.3,
  cobblestone: 0.5,
  crafting_table: 0.3,
  glass: 0.15,
  torch: 0.1,
  iron_ore: 0.9,
  diamond_ore: 1.5,
  furnace: 0.7,
  base_block: 0.8,
  leaves: 0.1,
  bedrock: 999,          // unbreakable
  gravel: 0.2,
  coal_ore: 0.6,
  gold_ore: 0.9,
  obsidian: 10.0,
  lava: 999,             // can't mine lava
  wool: 0.15,
  bricks: 0.45,
  bookshelf: 0.3,
  ladder: 0.2,
  chest: 0.4,
  bronze_block: 0.8,
  silver_block: 0.9,
  gold_block: 1.0,
  crystal_block: 1.2,
  tnt: 0.4,
  bed: 0.5,
  campfire: 0.8,
  farmland: 0.4,
  wheat: 0.1,
  oak_door: 0.6,
  trapdoor: 0.5,
  brewing_stand: 1.2,
  noteblock: 0.5,
  jukebox: 0.8,
  sign: 0.3,
  red_wool: 0.2,
  blue_wool: 0.2,
  green_wool: 0.2,
  yellow_wool: 0.2,
  black_wool: 0.2,
  // ---- New blocks: Batch 3 ----
  lantern: 0.4,
  fence: 0.6,
  cactus: 0.5,
  pumpkin: 0.6,
  jack_o_lantern: 0.6,
  mushroom_red: 0.1,
  mushroom_brown: 0.1,
  lever: 0.3,
  anvil: 3.0,
  enchanting_table: 2.5,
  hay_bale: 0.3,
  barrel: 0.8,
  beacon: 3.0,
  banner: 0.2,
  // ---- Batch 5 blocks ----
  iron_block: 3.0,
  diamond_block: 5.0,
  stone_bricks: 1.5,
  mossy_cobblestone: 1.6,
  clay: 0.5,
  terracotta: 0.8,
  soul_sand: 0.4,
  glowstone: 0.4,
  prismarine: 1.5,
  sea_lantern: 0.5,
  nether_bricks: 2.0,
  end_stone: 3.0,
  nether_portal: 99.0,
  redstone_lamp: 0.5,
  sponge: 0.5,
  melon: 0.3,
  // ---- Batch 9: Biome blocks ----
  moss_block: 0.3,
  vine: 0.2,
  lily_pad: 0.1,
  mud: 0.4,
  birch_wood: 1.0,
  birch_leaves: 0.15,
  dark_oak_wood: 1.2,
  dark_oak_leaves: 0.15,
  water: 99.0,
  sugar_cane: 0.1,
  packed_ice: 1.0,
  snow_block: 0.3,
  emerald_ore: 2.5,
  copper_ore: 1.5,
  amethyst: 1.5,
  deepslate: 2.5,
  calcite: 0.8,
};

// Fall damage: >3 blocks fall = 1 HP per extra block.
const FALL_DAMAGE_THRESHOLD = 3;
// Minimum fall velocity magnitude to even consider damage.
const FALL_DAMAGE_MIN_VEL = 9;

const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.6; // camera is 1.6m above feet
const SNEAK_EYE_HEIGHT = 1.35; // camera drops in sneak, classic MC effect
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 6.5;
const SNEAK_SPEED = 1.8;
const FLY_SPEED = 10;
const JUMP_VELOCITY = 8.0;
const GRAVITY = 22;
const WATER_GRAVITY = 5;
const WATER_WALK_SPEED = 2.0;
const SEA_LEVEL = 4;

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public domElement: HTMLElement;
  private world: WorldRenderer;

  // Position is FEET position; camera sits at y + EYE_HEIGHT
  public position = new THREE.Vector3();
  public velocity = new THREE.Vector3();

  public rotY = 0; // yaw (around Y)
  public rotX = 0; // pitch (around X)

  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private isGrounded = false;
  public flying = false;
  /** Multiplied into walk/sprint speed — potions set this from Game.tsx */
  public speedMultiplier = 1.0;
  /** Multiplied into jump velocity — potions set this from Game.tsx */
  public jumpMultiplier = 1.0;
  /** Multiplied into mining speed — tier bonus from Game.tsx */
  public miningSpeedMultiplier = 1.0;

  private lastSpaceTap = 0;

  public onChange: ((state: { x: number; y: number; z: number; rotY: number; rotX: number }) => void) | null = null;
  public onBreak: ((x: number, y: number, z: number) => void) | null = null;
  public onPlace: ((x: number, y: number, z: number) => void) | null = null;
  public getSelectedBlock: (() => string) | null = null;
  public onChatToggle: (() => void) | null = null;
  public onHotbarSelect: ((idx: number) => void) | null = null;
  public onHotbarScroll: ((delta: number) => void) | null = null;
  public onTabDown: ((pressed: boolean) => void) | null = null;
  public onToggleCoords: (() => void) | null = null;
  public onPointerLockChange: ((locked: boolean) => void) | null = null;
  public onJump: (() => void) | null = null;
  public onFootstep: (() => void) | null = null;
  // Called every frame while actively mining a block. progress is 0..1. When
  // progress hits 1 we fire onBreak. The HUD renderer uses this to draw the
  // cracks overlay. (null x,y,z = stopped mining).
  public onBreakProgress: ((x: number | null, y: number | null, z: number | null, progress: number) => void) | null = null;
  public onInventoryOpen: (() => void) | null = null;
  public onFallDamage: ((damage: number) => void) | null = null;
  // Accessor for the held tool's break multiplier. Game.tsx sets this so
  // the player reads current tool data from the inventory ref.
  public getHeldToolDef: (() => ItemDef | null) | null = null;
  public onDrown: ((damage: number) => void) | null = null;
  public onLavaDamage: ((damage: number) => void) | null = null;
  public onDropItem: (() => void) | null = null;
  public onVoidDeath: (() => void) | null = null;
  public hungerLevel = 20;
  public chatOpen = false;
  public inventoryOpen = false; // blocks movement/input while open

  // --- Swimming / drowning ---
  public isSwimming = false;
  public breathTimer = 10; // 10 seconds of air
  private drownTickTimer = 0; // fires damage every 1s when out of air

  // --- Lava damage ---
  private lavaDamageTimer = 0;

  // --- Attack cooldown ---
  public attackCooldown = 0;

  // --- Ladder climbing ---
  public isOnLadder = false;

  // --- Hold-to-break state ---
  private mouseDownLeft = false;
  private breakTarget: { x: number; y: number; z: number } | null = null;
  private breakProgress = 0;

  // --- Fall damage tracking ---
  private fallStartY: number | null = null; // y when last grounded
  private wasFalling = false;

  private handlers: Array<{ target: EventTarget; type: string; fn: any }> = [];

  constructor(opts: PlayerOptions) {
    this.camera = opts.camera;
    this.domElement = opts.domElement;
    this.world = opts.world;

    this.position.set(opts.spawn.x, opts.spawn.y, opts.spawn.z);
    this.camera.position.copy(this.position).setY(this.position.y + EYE_HEIGHT);

    this.bindEvents();
  }

  setPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.camera.position.set(x, y + EYE_HEIGHT, z);
    this.velocity.set(0, 0, 0);
  }

  private bindEvents() {
    const onMouseDown = (e: MouseEvent) => {
      if (this.chatOpen) return;
      if (!this.pointerLocked) {
        this.domElement.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        // Begin/continue breaking — actual fire happens in update when
        // progress reaches the per-block break time.
        this.mouseDownLeft = true;
      } else if (e.button === 2) {
        // Place — instant, single-click (unchanged).
        const hit = this.world.raycast(this.camera, 5);
        if (hit && this.onPlace) {
          const nx = hit.x + Math.round(hit.normal.x);
          const ny = hit.y + Math.round(hit.normal.y);
          const nz = hit.z + Math.round(hit.normal.z);
          if (!this.intersectsSelf(nx, ny, nz)) {
            this.onPlace(nx, ny, nz);
          }
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseDownLeft = false;
        this.breakTarget = null;
        this.breakProgress = 0;
        if (this.onBreakProgress) this.onBreakProgress(null, null, null, 0);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked) return;
      const sensitivity = 0.002;
      this.rotY -= e.movementX * sensitivity;
      this.rotX -= e.movementY * sensitivity;
      const half = Math.PI / 2 - 0.01;
      this.rotX = Math.max(-half, Math.min(half, this.rotX));
      this.applyCameraRotation();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      // E = inventory toggle (works even when inventory is open)
      if (k === 'e' && !this.chatOpen) {
        e.preventDefault();
        if (this.onInventoryOpen) this.onInventoryOpen();
        return;
      }

      // Escape closes inventory if open
      if (k === 'escape' && this.inventoryOpen) {
        if (this.onInventoryOpen) this.onInventoryOpen();
        return;
      }

      if (k === 't' && !this.chatOpen && !this.inventoryOpen) {
        e.preventDefault();
        if (this.onChatToggle) this.onChatToggle();
        return;
      }

      if (this.chatOpen || this.inventoryOpen) return;

      if (k === 'f') {
        this.flying = !this.flying;
        this.velocity.y = 0;
        return;
      }

      if (k === 'f3') {
        e.preventDefault();
        if (this.onToggleCoords) this.onToggleCoords();
        return;
      }

      if (k === 'q' && !this.chatOpen && !this.inventoryOpen) {
        if (this.onDropItem) this.onDropItem();
        return;
      }

      if (k === 'tab') {
        e.preventDefault();
        if (this.onTabDown) this.onTabDown(true);
        return;
      }

      if (/^[1-9]$/.test(k)) {
        if (this.onHotbarSelect) this.onHotbarSelect(parseInt(k, 10) - 1);
        return;
      }

      if (k === ' ') {
        // Double-tap space → fly up boost already handled via flying toggle?
        // For fly mode, just hold space (handled in update).
        if (this.flying) {
          // no-op, handled by update
        } else if (this.isSwimming || this.isOnLadder) {
          // handled in update via keys
        } else if (this.isGrounded) {
          this.velocity.y = JUMP_VELOCITY * this.jumpMultiplier;
          this.isGrounded = false;
          if (this.onJump) this.onJump();
        }
      }

      this.keys[k] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;
      if (k === 'tab') {
        if (this.onTabDown) this.onTabDown(false);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (this.chatOpen) return;
      if (this.onHotbarScroll) this.onHotbarScroll(Math.sign(e.deltaY));
    };

    const onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (this.onPointerLockChange) this.onPointerLockChange(this.pointerLocked);
    };

    const add = (target: EventTarget, type: string, fn: any) => {
      target.addEventListener(type, fn);
      this.handlers.push({ target, type, fn });
    };

    add(this.domElement, 'mousedown', onMouseDown);
    add(document, 'mouseup', onMouseUp);
    add(this.domElement, 'contextmenu', onContextMenu);
    add(document, 'mousemove', onMouseMove);
    add(document, 'keydown', onKeyDown);
    add(document, 'keyup', onKeyUp);
    add(this.domElement, 'wheel', onWheel);
    add(document, 'pointerlockchange', onPointerLockChange);
  }

  private applyCameraRotation() {
    const euler = new THREE.Euler(this.rotX, this.rotY, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  private intersectsSelf(bx: number, by: number, bz: number): boolean {
    // Block occupies [bx, bx+1] × [by, by+1] × [bz, bz+1]
    const minX = this.position.x - PLAYER_HALF_WIDTH;
    const maxX = this.position.x + PLAYER_HALF_WIDTH;
    const minY = this.position.y;
    const maxY = this.position.y + PLAYER_HEIGHT;
    const minZ = this.position.z - PLAYER_HALF_WIDTH;
    const maxZ = this.position.z + PLAYER_HALF_WIDTH;
    return (
      maxX > bx &&
      minX < bx + 1 &&
      maxY > by &&
      minY < by + 1 &&
      maxZ > bz &&
      minZ < bz + 1
    );
  }

  private isBlockSolid(x: number, y: number, z: number): boolean {
    return this.world.has(x, y, z);
  }

  private collideAxis(axis: 'x' | 'y' | 'z', delta: number): number {
    if (delta === 0) return 0;
    const prev = this.position[axis];
    const next = prev + delta;

    const minX = (axis === 'x' ? next : this.position.x) - PLAYER_HALF_WIDTH;
    const maxX = (axis === 'x' ? next : this.position.x) + PLAYER_HALF_WIDTH;
    const minY = (axis === 'y' ? next : this.position.y);
    const maxY = (axis === 'y' ? next : this.position.y) + PLAYER_HEIGHT;
    const minZ = (axis === 'z' ? next : this.position.z) - PLAYER_HALF_WIDTH;
    const maxZ = (axis === 'z' ? next : this.position.z) + PLAYER_HALF_WIDTH;

    const bxMin = Math.floor(minX);
    const bxMax = Math.floor(maxX - 0.0001);
    const byMin = Math.floor(minY);
    const byMax = Math.floor(maxY - 0.0001);
    const bzMin = Math.floor(minZ);
    const bzMax = Math.floor(maxZ - 0.0001);

    // Track the actual coordinate of the block that was hit, so we snap the
    // player to the true block face — not to the player's AABB extent (which
    // can teleport them far above their pre-collision position).
    let collided = false;
    let hitMin = Infinity;   // smallest block coord (for moving in +dir)
    let hitMax = -Infinity;  // largest block coord (for moving in -dir)

    for (let x = bxMin; x <= bxMax; x++) {
      for (let y = byMin; y <= byMax; y++) {
        for (let z = bzMin; z <= bzMax; z++) {
          if (this.isBlockSolid(x, y, z)) {
            collided = true;
            const c = axis === 'x' ? x : axis === 'y' ? y : z;
            if (c < hitMin) hitMin = c;
            if (c > hitMax) hitMax = c;
          }
        }
      }
    }

    if (!collided) {
      this.position[axis] = next;
      return delta;
    }

    // Resolve: snap to the face of the actual blocking block
    if (axis === 'y') {
      if (delta > 0) {
        // Hit ceiling: head just below hit block's bottom face
        this.position.y = hitMin - PLAYER_HEIGHT - 0.0001;
      } else {
        // Landed on top: feet on top face of tallest blocking block
        this.position.y = hitMax + 1;
        this.isGrounded = true;
      }
      this.velocity.y = 0;
    } else if (axis === 'x') {
      if (delta > 0) this.position.x = hitMin - PLAYER_HALF_WIDTH - 0.0001;
      else this.position.x = hitMax + 1 + PLAYER_HALF_WIDTH + 0.0001;
    } else {
      if (delta > 0) this.position.z = hitMin - PLAYER_HALF_WIDTH - 0.0001;
      else this.position.z = hitMax + 1 + PLAYER_HALF_WIDTH + 0.0001;
    }
    return 0;
  }

  /** True if the player's feet are below water level. */
  public isInWater(): boolean {
    return this.position.y < SEA_LEVEL;
  }

  public canAttack(): boolean {
    return this.attackCooldown <= 0;
  }

  public resetAttackCooldown() {
    this.attackCooldown = 0.5;
  }

  update(dt: number) {
    if (dt > 0.1) dt = 0.1;
    if (this.inventoryOpen) return; // freeze movement while inventory is open

    const forward = new THREE.Vector3(
      -Math.sin(this.rotY),
      0,
      -Math.cos(this.rotY),
    );
    const right = new THREE.Vector3(
      -Math.sin(this.rotY - Math.PI / 2),
      0,
      -Math.cos(this.rotY - Math.PI / 2),
    );

    const dir = new THREE.Vector3();
    if (!this.chatOpen) {
      if (this.keys['w']) dir.add(forward);
      if (this.keys['s']) dir.sub(forward);
      if (this.keys['d']) dir.add(right);
      if (this.keys['a']) dir.sub(right);
    }

    // Ctrl = sneak. Takes precedence over shift (sprint) so holding both
    // results in sneak — matches the intuitive "slow and careful" read.
    const sneaking = !!this.keys['control'];
    const sprinting = !!this.keys['shift'] && !sneaking && this.hungerLevel >= 6;

    // --- Ladder detection ---
    const feetBX = Math.floor(this.position.x);
    const feetBY = Math.floor(this.position.y);
    const feetBZ = Math.floor(this.position.z);
    const blockAtFeet = this.world.getType(feetBX, feetBY, feetBZ);
    this.isOnLadder = blockAtFeet === 'ladder';

    // --- Swimming detection ---
    this.isSwimming = this.isInWater();

    // Determine effective walk speed
    let speed = this.flying
      ? FLY_SPEED
      : this.isSwimming
        ? WATER_WALK_SPEED
        : sneaking
          ? SNEAK_SPEED
          : sprinting
            ? SPRINT_SPEED
            : WALK_SPEED;
    dir.normalize().multiplyScalar(speed * this.speedMultiplier);

    if (this.flying) {
      this.velocity.x = dir.x;
      this.velocity.z = dir.z;
      let vy = 0;
      if (this.keys[' ']) vy += FLY_SPEED;
      if (this.keys['shift']) vy -= FLY_SPEED;
      this.velocity.y = vy;
    } else if (this.isOnLadder) {
      // Ladder climbing: cancel gravity, W = up, S = down, else hover
      this.velocity.x = dir.x;
      this.velocity.z = dir.z;
      if (!this.chatOpen && this.keys['w']) {
        this.velocity.y = 3;
      } else if (!this.chatOpen && this.keys['s']) {
        this.velocity.y = -3;
      } else {
        this.velocity.y = 0;
      }
    } else if (this.isSwimming) {
      // Swimming: reduced gravity, space = swim up
      this.velocity.x = dir.x;
      this.velocity.z = dir.z;
      this.velocity.y -= WATER_GRAVITY * dt;
      if (!this.chatOpen && this.keys[' ']) {
        this.velocity.y = 3;
      }
      if (this.velocity.y < -10) this.velocity.y = -10;
    } else {
      this.velocity.x = dir.x;
      this.velocity.z = dir.z;
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -40) this.velocity.y = -40;
    }

    // Attempt movement with collision + step-up
    let dx = this.velocity.x * dt;
    let dz = this.velocity.z * dt;
    const dy = this.velocity.y * dt;

    const wasGrounded = this.isGrounded;
    this.isGrounded = false;

    // Sneak edge-clamp: if we're sneaking on solid ground, zero any
    // horizontal step that would slide us over the edge. Classic Minecraft.
    if (sneaking && wasGrounded && !this.flying) {
      if (dx !== 0 && !this.hasGroundBelow(this.position.x + dx, this.position.z)) {
        dx = 0;
        this.velocity.x = 0;
      }
      if (dz !== 0 && !this.hasGroundBelow(this.position.x + dx, this.position.z + dz)) {
        dz = 0;
        this.velocity.z = 0;
      }
    }

    // Try Y first (gravity/jump)
    if (!this.flying) {
      this.collideAxis('y', dy);
    } else {
      this.position.y += dy;
    }

    // Try X with step-up
    const movedX = this.collideAxis('x', dx);
    if (movedX === 0 && dx !== 0 && !this.flying) {
      // Attempt step-up by 1 block
      if (this.canStepUp(dx, 0)) {
        this.position.y += 1;
        this.collideAxis('x', dx);
      }
    }

    // Try Z with step-up
    const movedZ = this.collideAxis('z', dz);
    if (movedZ === 0 && dz !== 0 && !this.flying) {
      if (this.canStepUp(0, dz)) {
        this.position.y += 1;
        this.collideAxis('z', dz);
      }
    }

    // ---- Fall damage ----
    if (!this.flying) {
      if (!this.isGrounded && this.velocity.y < 0) {
        // Falling: record start if not already
        if (this.fallStartY === null) {
          this.fallStartY = this.position.y;
        }
        this.wasFalling = true;
      }
      if (this.isGrounded && this.wasFalling && this.fallStartY !== null) {
        const fallDist = this.fallStartY - this.position.y;
        if (fallDist > FALL_DAMAGE_THRESHOLD) {
          const dmg = Math.floor(fallDist - FALL_DAMAGE_THRESHOLD);
          if (dmg > 0 && this.onFallDamage) this.onFallDamage(dmg);
        }
        this.fallStartY = null;
        this.wasFalling = false;
      }
      if (this.isGrounded && !this.wasFalling) {
        this.fallStartY = null;
      }
    }

    // ---- Drowning ----
    if (this.isSwimming) {
      // Head underwater check: position.y + EYE_HEIGHT < SEA_LEVEL
      const headUnderwater = this.position.y + EYE_HEIGHT < SEA_LEVEL;
      if (headUnderwater) {
        this.breathTimer -= dt;
        if (this.breathTimer <= 0) {
          this.drownTickTimer += dt;
          if (this.drownTickTimer >= 1) {
            this.drownTickTimer -= 1;
            if (this.onDrown) this.onDrown(2);
          }
        }
      }
    } else {
      // Out of water — reset breath
      this.breathTimer = 10;
      this.drownTickTimer = 0;
    }

    // ---- Lava damage ----
    if (blockAtFeet === 'lava') {
      this.lavaDamageTimer += dt;
      if (this.lavaDamageTimer >= 0.5) {
        this.lavaDamageTimer -= 0.5;
        if (this.onLavaDamage) this.onLavaDamage(4);
      }
    } else {
      this.lavaDamageTimer = 0;
    }

    // ---- Attack cooldown ----
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
      if (this.attackCooldown < 0) this.attackCooldown = 0;
    }

    // Footstep: once grounded and horizontally moving, let audio engine
    // rate-limit actual playback (it caps at 1 per 380 ms).
    const horizMoving = Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.5;
    if (this.isGrounded && wasGrounded && horizMoving && !this.flying && this.onFootstep) {
      this.onFootstep();
    }

    // Update camera. Sneak drops the eye height slightly for visual flavour.
    const eyeH = sneaking ? SNEAK_EYE_HEIGHT : EYE_HEIGHT;
    this.camera.position.set(
      this.position.x,
      this.position.y + eyeH,
      this.position.z,
    );

    // Fall safety: if far below, trigger void death
    if (this.position.y < -20) {
      if (this.onVoidDeath) {
        this.onVoidDeath();
      } else {
        // Fallback: teleport back up if no handler attached
        this.position.y = 40;
        this.velocity.set(0, 0, 0);
      }
    }

    // ---- Hold-to-break ----
    // If the player is holding left click while pointer-locked, advance
    // break progress against whatever block they're currently aiming at.
    // Changing target cancels, releasing the button cancels.
    if (this.mouseDownLeft && this.pointerLocked && !this.chatOpen) {
      const hit = this.world.raycast(this.camera, 5);
      if (!hit) {
        if (this.breakTarget !== null) {
          this.breakTarget = null;
          this.breakProgress = 0;
          if (this.onBreakProgress) this.onBreakProgress(null, null, null, 0);
        }
      } else {
        const sameTarget =
          this.breakTarget &&
          this.breakTarget.x === hit.x &&
          this.breakTarget.y === hit.y &&
          this.breakTarget.z === hit.z;
        if (!sameTarget) {
          this.breakTarget = { x: hit.x, y: hit.y, z: hit.z };
          this.breakProgress = 0;
        }
        const type = this.world.getType(hit.x, hit.y, hit.z);
        let breakTime = type ? BREAK_TIMES[type] ?? 0.6 : 0.6;
        // Tool speed: if holding a tool with a breakMultiplier for this
        // block type, multiply the break time down.
        const toolDef = this.getHeldToolDef ? this.getHeldToolDef() : null;
        if (toolDef && toolDef.breakMultiplier && type && toolDef.breakMultiplier[type]) {
          breakTime *= toolDef.breakMultiplier[type]!;
        }
        // Apply tier-based mining speed bonus
        breakTime /= this.miningSpeedMultiplier;
        this.breakProgress += dt / breakTime;
        if (this.breakProgress >= 1) {
          // Done — fire the break, reset for the next block.
          if (this.onBreak) this.onBreak(hit.x, hit.y, hit.z);
          this.breakTarget = null;
          this.breakProgress = 0;
          if (this.onBreakProgress) this.onBreakProgress(null, null, null, 0);
        } else if (this.onBreakProgress) {
          this.onBreakProgress(hit.x, hit.y, hit.z, this.breakProgress);
        }
      }
    }

    if (this.onChange) {
      this.onChange({
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
        rotY: this.rotY,
        rotX: this.rotX,
      });
    }
  }

  /** True if there's a solid block directly below the player's AABB at (x, z). */
  private hasGroundBelow(x: number, z: number): boolean {
    // feet.y - 0.05 gives the block directly beneath the player's feet when
    // standing on a surface (feet.y == blockTop → block is at floor(y) - 1).
    const by = Math.floor(this.position.y - 0.05);
    const minX = x - PLAYER_HALF_WIDTH;
    const maxX = x + PLAYER_HALF_WIDTH;
    const minZ = z - PLAYER_HALF_WIDTH;
    const maxZ = z + PLAYER_HALF_WIDTH;
    const bxMin = Math.floor(minX);
    const bxMax = Math.floor(maxX - 0.0001);
    const bzMin = Math.floor(minZ);
    const bzMax = Math.floor(maxZ - 0.0001);
    for (let bx = bxMin; bx <= bxMax; bx++) {
      for (let bz = bzMin; bz <= bzMax; bz++) {
        if (this.world.has(bx, by, bz)) return true;
      }
    }
    return false;
  }

  private canStepUp(dx: number, dz: number): boolean {
    const testX = this.position.x + Math.sign(dx) * (PLAYER_HALF_WIDTH + 0.1);
    const testZ = this.position.z + Math.sign(dz) * (PLAYER_HALF_WIDTH + 0.1);
    const bx = Math.floor(dx !== 0 ? testX : this.position.x);
    const bz = Math.floor(dz !== 0 ? testZ : this.position.z);
    const by = Math.floor(this.position.y);
    // Step blocked if head height has no clearance
    if (this.world.has(bx, by + 1, bz)) return false;
    if (this.world.has(bx, by + 2, bz)) return false;
    return this.world.has(bx, by, bz);
  }

  dispose() {
    for (const h of this.handlers) {
      h.target.removeEventListener(h.type, h.fn);
    }
    this.handlers = [];
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }
}
