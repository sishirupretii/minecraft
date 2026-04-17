'use client';

import * as THREE from 'three';

interface RemotePlayer {
  id: string;
  username: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetRotY: number;
  mesh: THREE.Group;
  nameSprite: THREE.Sprite;
  lastUpdate: number;
}

function makeNameSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 28px Inter, sans-serif';
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padX = 14;
  const padY = 8;
  const w = Math.ceil(metrics.width) + padX * 2;
  const h = 40;
  canvas.width = w;
  canvas.height = h;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const r = 8;
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  // Scale sprite so it's ~0.8 world units tall
  const aspect = w / h;
  sprite.scale.set(0.8 * aspect, 0.8, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export class OtherPlayersManager {
  private scene: THREE.Scene;
  private players: Map<string, RemotePlayer> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  add(p: { id: string; username: string; color: string; x: number; y: number; z: number }) {
    if (this.players.has(p.id)) return;

    const group = new THREE.Group();

    // Body (player-sized rectangular avatar)
    const bodyGeom = new THREE.BoxGeometry(0.6, 1.6, 0.6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: p.color });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = -0.1;
    group.add(body);

    // Head
    const headGeom = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const headMat = new THREE.MeshLambertMaterial({ color: p.color });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 0.95;
    group.add(head);

    // Eyes — small white quads on front
    const eyeGeom = new THREE.PlaneGeometry(0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.position.set(-0.12, 1.0, 0.281);
    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.position.set(0.12, 1.0, 0.281);
    group.add(eyeL, eyeR);

    // Position group so feet are at (x, y-1.6, z) since y from server is eye level
    group.position.set(p.x, p.y - 1.6 + 0.1, p.z);

    // Name sprite
    const sprite = makeNameSprite(p.username, p.color);
    sprite.position.set(p.x, p.y + 0.5, p.z);
    this.scene.add(sprite);

    this.scene.add(group);

    this.players.set(p.id, {
      id: p.id,
      username: p.username,
      color: p.color,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: 0,
      targetX: p.x,
      targetY: p.y,
      targetZ: p.z,
      targetRotY: 0,
      mesh: group,
      nameSprite: sprite,
      lastUpdate: performance.now(),
    });
  }

  remove(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.mesh);
    this.scene.remove(p.nameSprite);
    p.mesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
        else (m.material as THREE.Material).dispose();
      }
    });
    (p.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
    (p.nameSprite.material as THREE.SpriteMaterial).dispose();
    this.players.delete(id);
  }

  updateTarget(id: string, x: number, y: number, z: number, rotY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.targetX = x;
    p.targetY = y;
    p.targetZ = z;
    p.targetRotY = rotY;
    p.lastUpdate = performance.now();
  }

  update(dt: number) {
    const lerpFactor = Math.min(1, dt * 12);
    for (const p of this.players.values()) {
      p.x += (p.targetX - p.x) * lerpFactor;
      p.y += (p.targetY - p.y) * lerpFactor;
      p.z += (p.targetZ - p.z) * lerpFactor;

      // Shortest-path yaw lerp
      let dr = p.targetRotY - p.rotY;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      p.rotY += dr * lerpFactor;

      p.mesh.position.set(p.x, p.y - 1.6 + 0.1, p.z);
      p.mesh.rotation.y = p.rotY;
      p.nameSprite.position.set(p.x, p.y + 0.5, p.z);
    }
  }

  list(): Array<{ id: string; username: string; color: string }> {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      username: p.username,
      color: p.color,
    }));
  }

  listWithPositions(): Array<{ id: string; username: string; color: string; x: number; z: number }> {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      username: p.username,
      color: p.color,
      x: p.x,
      z: p.z,
    }));
  }

  clear() {
    for (const id of Array.from(this.players.keys())) this.remove(id);
  }
}
