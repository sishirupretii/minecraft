'use client';

import * as THREE from 'three';
import { WorldRenderer } from './World';

interface PlayerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  world: WorldRenderer;
  spawn: { x: number; y: number; z: number };
}

const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.6; // camera is 1.6m above feet
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 6.5;
const FLY_SPEED = 10;
const JUMP_VELOCITY = 8.0;
const GRAVITY = 22;

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
  public chatOpen = false;

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
        // Break
        const hit = this.world.raycast(this.camera, 5);
        if (hit && this.onBreak) this.onBreak(hit.x, hit.y, hit.z);
      } else if (e.button === 2) {
        // Place
        const hit = this.world.raycast(this.camera, 5);
        if (hit && this.onPlace) {
          const nx = hit.x + Math.round(hit.normal.x);
          const ny = hit.y + Math.round(hit.normal.y);
          const nz = hit.z + Math.round(hit.normal.z);
          // Prevent placing into self
          if (!this.intersectsSelf(nx, ny, nz)) {
            this.onPlace(nx, ny, nz);
          }
        }
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

      if (k === 't' && !this.chatOpen) {
        e.preventDefault();
        if (this.onChatToggle) this.onChatToggle();
        return;
      }

      if (this.chatOpen) return;

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

      if (k === 'tab') {
        e.preventDefault();
        if (this.onTabDown) this.onTabDown(true);
        return;
      }

      if (/^[1-6]$/.test(k)) {
        if (this.onHotbarSelect) this.onHotbarSelect(parseInt(k, 10) - 1);
        return;
      }

      if (k === ' ') {
        // Double-tap space → fly up boost already handled via flying toggle?
        // For fly mode, just hold space (handled in update).
        if (this.flying) {
          // no-op, handled by update
        } else if (this.isGrounded) {
          this.velocity.y = JUMP_VELOCITY;
          this.isGrounded = false;
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

  update(dt: number) {
    if (dt > 0.1) dt = 0.1; // clamp big steps

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

    const sprinting = !!this.keys['shift'];
    const speed = this.flying ? FLY_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    dir.normalize().multiplyScalar(speed);

    if (this.flying) {
      this.velocity.x = dir.x;
      this.velocity.z = dir.z;
      let vy = 0;
      if (this.keys[' ']) vy += FLY_SPEED;
      if (this.keys['shift']) vy -= FLY_SPEED;
      this.velocity.y = vy;
    } else {
      this.velocity.x = dir.x;
      this.velocity.z = dir.z;
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -40) this.velocity.y = -40;
    }

    // Attempt movement with collision + step-up
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    const dy = this.velocity.y * dt;

    this.isGrounded = false;

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

    // Update camera
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_HEIGHT,
      this.position.z,
    );

    // Fall safety: if far below, respawn
    if (this.position.y < -20) {
      // Let Game handle via onChange; simply clamp for now
      this.position.y = 40;
      this.velocity.set(0, 0, 0);
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
