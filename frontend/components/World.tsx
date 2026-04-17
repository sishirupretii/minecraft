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
  base_blue:      { roughness: 0.85, metalness: 0 },     // grass — matte, no sheen
  deep_blue:      { roughness: 0.95, metalness: 0 },     // dirt — fully matte
  ice_stone:      { roughness: 0.55, metalness: 0.05 },  // snow — subtle sparkle
  cyan_wood:      { roughness: 0.82, metalness: 0 },     // oak wood — rough grain
  sand_blue:      { roughness: 0.95, metalness: 0 },     // sand — dusty matte
  royal_brick:    { roughness: 0.88, metalness: 0 },     // stone — rough
  planks:         { roughness: 0.8,  metalness: 0 },     // wooden planks — smooth grain
  cobblestone:    { roughness: 0.92, metalness: 0 },     // cobblestone — very rough
  crafting_table: { roughness: 0.75, metalness: 0 },     // crafting table — polished wood
  glass:          { roughness: 0.1,  metalness: 0.1 },   // glass — very smooth, slightly reflective
  torch:          { roughness: 0.7,  metalness: 0 },     // torch — rough wood
  iron_ore:       { roughness: 0.8,  metalness: 0.15 },  // iron ore — slight metallic speckle
  diamond_ore:    { roughness: 0.7,  metalness: 0.2 },   // diamond ore — shiny flecks
  furnace:        { roughness: 0.9,  metalness: 0.05 },  // furnace — rough stone
  base_block:     { roughness: 0.3,  metalness: 0.6 },   // base block — polished metallic blue
  leaves:         { roughness: 0.9,  metalness: 0 },     // leaves — matte foliage
  bedrock:        { roughness: 0.95, metalness: 0.1 },   // bedrock — rough dark
  gravel:         { roughness: 0.92, metalness: 0 },     // gravel — gritty matte
  coal_ore:       { roughness: 0.85, metalness: 0.05 },  // coal ore — dull speckle
  gold_ore:       { roughness: 0.75, metalness: 0.3 },   // gold ore — golden sheen
  obsidian:       { roughness: 0.2,  metalness: 0.4 },   // obsidian — shiny dark
  lava:           { roughness: 0.6,  metalness: 0.1 },   // lava — molten glow
  wool:           { roughness: 0.98, metalness: 0 },     // wool — soft matte
  bricks:         { roughness: 0.88, metalness: 0 },     // bricks — rough clay
  bookshelf:      { roughness: 0.78, metalness: 0 },     // bookshelf — polished wood
  ladder:         { roughness: 0.82, metalness: 0 },     // ladder — wood grain
  chest:          { roughness: 0.75, metalness: 0.05 },  // chest — slight sheen
  // ---- Tier-gated blocks ----
  bronze_block:   { roughness: 0.4,  metalness: 0.6 },   // bronze — warm metallic
  silver_block:   { roughness: 0.25, metalness: 0.7 },   // silver — polished metallic
  gold_block:     { roughness: 0.2,  metalness: 0.8 },   // gold — highly polished
  crystal_block:  { roughness: 0.1,  metalness: 0.9 },   // crystal — mirror-like
  tnt:            { roughness: 0.85, metalness: 0 },     // tnt — papery
  bed:            { roughness: 0.92, metalness: 0 },     // bed — soft fabric
  campfire:       { roughness: 0.75, metalness: 0 },     // campfire — woody
  farmland:       { roughness: 0.95, metalness: 0 },     // farmland — tilled earth
  wheat:          { roughness: 0.9,  metalness: 0 },     // wheat — organic
  oak_door:       { roughness: 0.78, metalness: 0 },     // oak door — smooth wood
  trapdoor:       { roughness: 0.80, metalness: 0 },     // trapdoor — wood grain
  brewing_stand:  { roughness: 0.70, metalness: 0.1 },   // brewing stand — glass+stone
  noteblock:      { roughness: 0.80, metalness: 0 },     // noteblock — polished wood
  jukebox:        { roughness: 0.75, metalness: 0.05 },  // jukebox — polished wood
  sign:           { roughness: 0.80, metalness: 0 },     // sign — planks
  red_wool:       { roughness: 0.98, metalness: 0 },     // colored wool — soft matte
  blue_wool:      { roughness: 0.98, metalness: 0 },
  green_wool:     { roughness: 0.98, metalness: 0 },
  yellow_wool:    { roughness: 0.98, metalness: 0 },
  black_wool:     { roughness: 0.98, metalness: 0 },
  // ---- New blocks: Batch 3 ----
  lantern:          { roughness: 0.4,  metalness: 0.3 },   // lantern — metal + glass
  fence:            { roughness: 0.82, metalness: 0 },     // fence — wood grain
  cactus:           { roughness: 0.85, metalness: 0 },     // cactus — organic matte
  pumpkin:          { roughness: 0.88, metalness: 0 },     // pumpkin — organic
  jack_o_lantern:   { roughness: 0.85, metalness: 0 },     // jack o lantern — organic
  mushroom_red:     { roughness: 0.9,  metalness: 0 },     // mushroom — organic matte
  mushroom_brown:   { roughness: 0.92, metalness: 0 },     // mushroom — organic matte
  lever:            { roughness: 0.75, metalness: 0.1 },   // lever — wood + stone
  anvil:            { roughness: 0.5,  metalness: 0.7 },   // anvil — heavy iron
  enchanting_table: { roughness: 0.3,  metalness: 0.5 },   // enchanting — polished obsidian
  hay_bale:   { roughness: 0.92, metalness: 0 },     // hay bale — dry organic
  barrel:     { roughness: 0.78, metalness: 0 },     // barrel — polished wood
  beacon:     { roughness: 0.15, metalness: 0.6 },   // beacon — glassy metallic
  banner:     { roughness: 0.9,  metalness: 0 },     // banner — fabric
  // ---- Batch 5 blocks ----
  iron_block:       { roughness: 0.35, metalness: 0.7 },   // iron block — polished metal
  diamond_block:    { roughness: 0.15, metalness: 0.8 },   // diamond block — very shiny
  stone_bricks:     { roughness: 0.85, metalness: 0 },     // stone bricks — rough
  mossy_cobblestone:{ roughness: 0.9,  metalness: 0 },     // mossy — damp rough
  clay:             { roughness: 0.88, metalness: 0 },     // clay — smooth matte
  terracotta:       { roughness: 0.82, metalness: 0 },     // terracotta — earthy
  soul_sand:        { roughness: 0.95, metalness: 0 },     // soul sand — grainy
  glowstone:        { roughness: 0.4,  metalness: 0.2 },   // glowstone — luminous
  prismarine:       { roughness: 0.5,  metalness: 0.3 },   // prismarine — aquatic sheen
  sea_lantern:      { roughness: 0.2,  metalness: 0.4 },   // sea lantern — glassy
  nether_bricks:    { roughness: 0.88, metalness: 0.05 },  // nether bricks — dark rough
  end_stone:        { roughness: 0.8,  metalness: 0.05 },  // end stone — alien
  nether_portal:    { roughness: 0.1,  metalness: 0.5 },   // nether portal — glassy
  redstone_lamp:    { roughness: 0.3,  metalness: 0.3 },   // redstone lamp — warm glass
  sponge:           { roughness: 0.95, metalness: 0 },     // sponge — porous
  melon:            { roughness: 0.85, metalness: 0 },     // melon — organic
  // ---- Batch 9: Biome blocks ----
  moss_block:       { roughness: 0.95, metalness: 0 },     // moss — soft organic
  vine:             { roughness: 0.9,  metalness: 0 },     // vine — leafy
  lily_pad:         { roughness: 0.85, metalness: 0 },     // lily pad — waxy
  mud:              { roughness: 0.95, metalness: 0 },     // mud — wet earth
  birch_wood:       { roughness: 0.75, metalness: 0 },     // birch — smooth bark
  birch_leaves:     { roughness: 0.85, metalness: 0 },     // birch leaves — organic
  dark_oak_wood:    { roughness: 0.8,  metalness: 0 },     // dark oak — rough bark
  dark_oak_leaves:  { roughness: 0.85, metalness: 0 },     // dark oak leaves
  water:            { roughness: 0.05, metalness: 0.1 },   // water — reflective
  sugar_cane:       { roughness: 0.8,  metalness: 0 },     // sugar cane — plant
  packed_ice:       { roughness: 0.1,  metalness: 0.05 },  // packed ice — smooth
  snow_block:       { roughness: 0.6,  metalness: 0 },     // snow — matte
  emerald_ore:      { roughness: 0.5,  metalness: 0.3 },   // emerald ore
  copper_ore:       { roughness: 0.55, metalness: 0.35 },  // copper ore
  amethyst:         { roughness: 0.2,  metalness: 0.4 },   // amethyst — glossy crystal
  deepslate:        { roughness: 0.7,  metalness: 0.1 },   // deepslate — heavy stone
  calcite:          { roughness: 0.55, metalness: 0 },     // calcite — chalky
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
  public onBlockPlaced: ((x: number, y: number, z: number, type: BlockType) => void) | null = null;

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
      const matOptions: THREE.MeshStandardMaterialParameters = {
        color: 0xffffff,
        roughness: params.roughness,
        metalness: params.metalness,
      };
      // Glass: transparent material
      if (meta.transparent) {
        matOptions.transparent = true;
        matOptions.opacity = 0.35;
        matOptions.side = THREE.DoubleSide;
      }
      // Emissive blocks (torch, base_block, tier-gated blocks)
      if (meta.emissive) {
        matOptions.emissive = new THREE.Color(meta.emissive);
        matOptions.emissiveIntensity = meta.emissiveIntensity ?? 0.8;
      }
      const material = new THREE.MeshStandardMaterial(matOptions);
      const mesh = new THREE.InstancedMesh(geometry, material, INITIAL_CAPACITY);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // IMPORTANT: frustumCulled must be false for InstancedMesh. Three.js
      // uses the base geometry's bounding sphere (a tiny 1×1×1 box at the
      // origin) for the cull test — it does NOT compute bounds from the
      // instance matrices. With culling on, the entire mesh disappears the
      // moment the camera moves away from world-center. Grass (the thinnest
      // surface layer) vanishes first; deeper block types survive longer.
      mesh.frustumCulled = false;
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
      // Fire place callback for particles
      if (this.onBlockPlaced) this.onBlockPlaced(x, y, z, type);
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
    nmesh.frustumCulled = false;
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
