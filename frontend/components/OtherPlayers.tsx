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
  // Walking animation
  walkPhase: number;
  walkSpeed: number;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  prevX: number;
  prevZ: number;
}

/**
 * Build a Minecraft Steve-style humanoid character.
 * Proportions (in Minecraft blocks → scaled by 1/16 to real-world units):
 *  - Head:   8 × 8 × 8   → 0.5 × 0.5 × 0.5
 *  - Body:   8 × 12 × 4  → 0.5 × 0.75 × 0.25
 *  - Arm:    4 × 12 × 4  → 0.25 × 0.75 × 0.25
 *  - Leg:    4 × 12 × 4  → 0.25 × 0.75 × 0.25
 * Total height ≈ 1.8 blocks, matches collision box.
 */
function buildSteveModel(baseColor: string): {
  group: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
} {
  const group = new THREE.Group();

  // Color palette — use player's tint color for shirt, classic Steve for everything else
  const skinColor = 0xf5c68c;    // skin tone
  const hairColor = 0x4a2d17;    // dark brown hair
  const shirtColor = new THREE.Color(baseColor);
  const pantsColor = 0x3b5dc9;   // Steve's blue pants
  const shoeColor = 0x5a3a20;    // brown shoes
  const eyeWhite = 0xffffff;
  const eyePupil = 0x3366ff;
  const mouthColor = 0x3a1a10;

  const mat = (c: number | THREE.Color) =>
    new THREE.MeshLambertMaterial({ color: c });

  // ===== HEAD (pivot at neck) =====
  const headGroup = new THREE.Group();
  // head cube
  const headSize = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), mat(skinColor));
  head.position.y = headSize / 2;
  head.castShadow = true;
  headGroup.add(head);
  // Hair cap on top + back
  const hairTop = new THREE.Mesh(
    new THREE.BoxGeometry(headSize * 1.02, 0.08, headSize * 1.02),
    mat(hairColor),
  );
  hairTop.position.y = headSize - 0.04;
  headGroup.add(hairTop);
  const hairBack = new THREE.Mesh(
    new THREE.BoxGeometry(headSize * 1.02, 0.3, 0.08),
    mat(hairColor),
  );
  hairBack.position.set(0, headSize * 0.55, -headSize / 2 - 0.02);
  headGroup.add(hairBack);
  // Face details (on the +Z face = front)
  const halfH = headSize / 2;
  const faceZ = halfH + 0.001;
  // Eye whites
  const eyeW = 0.1, eyeH = 0.08;
  const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(eyeW, eyeH), mat(eyeWhite));
  eyeL.position.set(-0.12, halfH + 0.05, faceZ);
  headGroup.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(eyeW, eyeH), mat(eyeWhite));
  eyeR.position.set(0.12, halfH + 0.05, faceZ);
  headGroup.add(eyeR);
  // Eye pupils (smaller)
  const pupilGeom = new THREE.PlaneGeometry(0.04, 0.06);
  const pupilL = new THREE.Mesh(pupilGeom, mat(eyePupil));
  pupilL.position.set(-0.12, halfH + 0.05, faceZ + 0.001);
  headGroup.add(pupilL);
  const pupilR = new THREE.Mesh(pupilGeom, mat(eyePupil));
  pupilR.position.set(0.12, halfH + 0.05, faceZ + 0.001);
  headGroup.add(pupilR);
  // Nose (a darker skin bump)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), mat(0xd8a978));
  nose.position.set(0, halfH - 0.05, faceZ + 0.01);
  headGroup.add(nose);
  // Mouth
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.04), mat(mouthColor));
  mouth.position.set(0, halfH - 0.14, faceZ);
  headGroup.add(mouth);
  // Position entire head group (pivot at neck)
  group.add(headGroup);

  // ===== BODY =====
  const bodyW = 0.5, bodyH = 0.75, bodyD = 0.25;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), mat(shirtColor));
  body.position.y = -bodyH / 2;
  body.castShadow = true;
  group.add(body);
  // Belt (darker line)
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW + 0.005, 0.05, bodyD + 0.005),
    mat(0x2a3a6b),
  );
  belt.position.y = -bodyH + 0.05;
  group.add(belt);

  // Position head above body
  headGroup.position.y = 0; // body top is at y=0; head sits on top

  // ===== ARMS (pivot at shoulder) =====
  const armW = 0.22, armH = 0.75, armD = 0.22;
  const armShirtColor = shirtColor;
  const armSkinColor = skinColor;
  // Left arm
  const leftArm = new THREE.Group();
  // shoulder pivot at top of arm (y=0); arm extends down
  const leftArmShirt = new THREE.Mesh(
    new THREE.BoxGeometry(armW, armH * 0.65, armD),
    mat(armShirtColor),
  );
  leftArmShirt.position.y = -armH * 0.325;
  leftArmShirt.castShadow = true;
  leftArm.add(leftArmShirt);
  const leftHand = new THREE.Mesh(
    new THREE.BoxGeometry(armW, armH * 0.35, armD),
    mat(armSkinColor),
  );
  leftHand.position.y = -armH * 0.825;
  leftHand.castShadow = true;
  leftArm.add(leftHand);
  leftArm.position.set(-(bodyW / 2 + armW / 2), -0.02, 0);
  group.add(leftArm);
  // Right arm (mirror)
  const rightArm = new THREE.Group();
  const rightArmShirt = new THREE.Mesh(
    new THREE.BoxGeometry(armW, armH * 0.65, armD),
    mat(armShirtColor),
  );
  rightArmShirt.position.y = -armH * 0.325;
  rightArmShirt.castShadow = true;
  rightArm.add(rightArmShirt);
  const rightHand = new THREE.Mesh(
    new THREE.BoxGeometry(armW, armH * 0.35, armD),
    mat(armSkinColor),
  );
  rightHand.position.y = -armH * 0.825;
  rightHand.castShadow = true;
  rightArm.add(rightHand);
  rightArm.position.set((bodyW / 2 + armW / 2), -0.02, 0);
  group.add(rightArm);

  // ===== LEGS (pivot at hip) =====
  const legW = 0.24, legH = 0.75, legD = 0.24;
  const leftLeg = new THREE.Group();
  const leftLegPants = new THREE.Mesh(
    new THREE.BoxGeometry(legW, legH * 0.8, legD),
    mat(pantsColor),
  );
  leftLegPants.position.y = -legH * 0.4;
  leftLegPants.castShadow = true;
  leftLeg.add(leftLegPants);
  const leftShoe = new THREE.Mesh(
    new THREE.BoxGeometry(legW * 1.05, legH * 0.2, legD * 1.1),
    mat(shoeColor),
  );
  leftShoe.position.y = -legH * 0.9;
  leftShoe.castShadow = true;
  leftLeg.add(leftShoe);
  leftLeg.position.set(-legW / 2, -bodyH, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Group();
  const rightLegPants = new THREE.Mesh(
    new THREE.BoxGeometry(legW, legH * 0.8, legD),
    mat(pantsColor),
  );
  rightLegPants.position.y = -legH * 0.4;
  rightLegPants.castShadow = true;
  rightLeg.add(rightLegPants);
  const rightShoe = new THREE.Mesh(
    new THREE.BoxGeometry(legW * 1.05, legH * 0.2, legD * 1.1),
    mat(shoeColor),
  );
  rightShoe.position.y = -legH * 0.9;
  rightShoe.castShadow = true;
  rightLeg.add(rightShoe);
  rightLeg.position.set(legW / 2, -bodyH, 0);
  group.add(rightLeg);

  return { group, head: headGroup, leftArm, rightArm, leftLeg, rightLeg };
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

    const { group, head, leftArm, rightArm, leftLeg, rightLeg } = buildSteveModel(p.color);

    // Server y is eye level; Steve model origin is at body-top (shoulders).
    // To put feet on the ground, shift model so feet (y = -bodyH - legH = -1.5)
    // align with ground at server_y - 1.6 (eye height). The group's head center
    // sits ~0.25 above origin, so we offset accordingly.
    const feetToOrigin = 1.5; // distance from feet to group origin (body top)
    group.position.set(p.x, p.y - 1.6 + feetToOrigin, p.z);

    const sprite = makeNameSprite(p.username, p.color);
    sprite.position.set(p.x, p.y + 0.7, p.z);
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
      walkPhase: 0,
      walkSpeed: 0,
      leftArm, rightArm, leftLeg, rightLeg, head,
      prevX: p.x,
      prevZ: p.z,
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
    const feetToOrigin = 1.5;
    for (const p of this.players.values()) {
      p.x += (p.targetX - p.x) * lerpFactor;
      p.y += (p.targetY - p.y) * lerpFactor;
      p.z += (p.targetZ - p.z) * lerpFactor;

      // Shortest-path yaw lerp
      let dr = p.targetRotY - p.rotY;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      p.rotY += dr * lerpFactor;

      p.mesh.position.set(p.x, p.y - 1.6 + feetToOrigin, p.z);
      p.mesh.rotation.y = p.rotY + Math.PI; // face forward
      p.nameSprite.position.set(p.x, p.y + 0.7, p.z);

      // ---- Walking animation ----
      const movedDx = p.x - p.prevX;
      const movedDz = p.z - p.prevZ;
      const horizSpeed = Math.sqrt(movedDx * movedDx + movedDz * movedDz) / Math.max(dt, 0.001);
      p.prevX = p.x;
      p.prevZ = p.z;
      // Smooth walk speed for animation
      p.walkSpeed += (horizSpeed - p.walkSpeed) * Math.min(1, dt * 8);

      if (p.walkSpeed > 0.3) {
        // Advance walk phase proportional to speed
        p.walkPhase += dt * Math.min(p.walkSpeed * 2, 12);
        const swing = Math.sin(p.walkPhase) * Math.min(p.walkSpeed * 0.15, 0.9);
        p.leftLeg.rotation.x = swing;
        p.rightLeg.rotation.x = -swing;
        p.leftArm.rotation.x = -swing * 0.8;
        p.rightArm.rotation.x = swing * 0.8;
      } else {
        // Idle: return to neutral pose
        p.leftLeg.rotation.x *= 0.85;
        p.rightLeg.rotation.x *= 0.85;
        p.leftArm.rotation.x *= 0.85;
        p.rightArm.rotation.x *= 0.85;
        // Subtle idle breathing
        const breath = Math.sin(performance.now() * 0.002) * 0.015;
        p.head.position.y = breath;
      }
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
