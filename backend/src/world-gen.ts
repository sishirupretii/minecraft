import { createNoise2D } from 'simplex-noise';
import { Block, BlockType, WORLD_HEIGHT, WORLD_SIZE } from './types';

// Seeded-ish PRNG so generation is deterministic per boot if desired.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Biome = 'plains' | 'desert' | 'snow';

// Biome palette map. Type ids are unchanged for DB compatibility, but render
// as: base_blue = grass, deep_blue = dirt, ice_stone = snow, sand_blue = sand,
// royal_brick = stone, cyan_wood = wood.
const BIOME_BLOCKS: Record<Biome, { surface: BlockType; sub: BlockType; trees: boolean; trunk: BlockType; hasLeaves: boolean }> = {
  plains: { surface: 'base_blue',  sub: 'deep_blue',   trees: true,  trunk: 'cyan_wood', hasLeaves: true },
  desert: { surface: 'sand_blue',  sub: 'royal_brick', trees: false, trunk: 'cyan_wood', hasLeaves: false },
  snow:   { surface: 'ice_stone',  sub: 'deep_blue',   trees: true,  trunk: 'ice_stone', hasLeaves: false },
};

export function generateWorld(seed = 1337): Block[] {
  const rng = mulberry32(seed);
  const heightNoise = createNoise2D(rng);
  const biomeNoise = createNoise2D(rng);
  const blocks: Block[] = [];
  const heightMap: number[][] = [];
  const biomeMap: Biome[][] = [];

  const half = WORLD_SIZE / 2;

  // 1. Build height map + biome map
  for (let x = 0; x < WORLD_SIZE; x++) {
    heightMap[x] = [];
    biomeMap[x] = [];
    for (let z = 0; z < WORLD_SIZE; z++) {
      const nx = (x - half) / 32;
      const nz = (z - half) / 32;
      // Layered noise for gentle hills
      const n =
        heightNoise(nx, nz) * 0.6 +
        heightNoise(nx * 2, nz * 2) * 0.3 +
        heightNoise(nx * 4, nz * 4) * 0.1;
      // Map [-1, 1] → [0, 20]
      const h = Math.max(0, Math.min(20, Math.floor((n + 1) * 10)));
      heightMap[x][z] = h;

      // Biome: low-frequency noise so regions are chunky rather than noisy per-block
      const b = biomeNoise((x - half) / 64, (z - half) / 64);
      if (b < -0.3) biomeMap[x][z] = 'desert';
      else if (b > 0.35) biomeMap[x][z] = 'snow';
      else biomeMap[x][z] = 'plains';
    }
  }

  // 2. Fill terrain columns using biome-appropriate blocks
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const h = heightMap[x][z];
      const biome = biomeMap[x][z];
      const palette = BIOME_BLOCKS[biome];
      for (let y = 0; y <= h; y++) {
        let type: BlockType;
        if (y === h) {
          type = palette.surface;
        } else if (y >= h - 3) {
          type = palette.sub;
        } else {
          // Deep stone below sub-layer. Plains/snow use gray stone (royal_brick),
          // desert uses its sandstone sub (royal_brick too). One consistent deep layer.
          type = 'royal_brick';
        }
        blocks.push({ x, y, z, type });
      }
    }
  }

  // 3. Scatter trees — only in tree-friendly biomes, at least 2 blocks from edge.
  const treeCount = 25 + Math.floor(rng() * 10); // 25–34
  const placedTrees: Array<{ x: number; z: number }> = [];
  let attempts = 0;
  while (placedTrees.length < treeCount && attempts < 800) {
    attempts++;
    const tx = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const tz = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const biome = biomeMap[tx][tz];
    const palette = BIOME_BLOCKS[biome];
    if (!palette.trees) continue;
    // Spacing
    if (placedTrees.some((t) => Math.abs(t.x - tx) + Math.abs(t.z - tz) < 6)) continue;
    const h = heightMap[tx][tz];
    if (h < 2 || h > 16) continue;

    const trunkHeight = 4 + Math.floor(rng() * 2); // 4–5
    for (let dy = 1; dy <= trunkHeight; dy++) {
      blocks.push({ x: tx, y: h + dy, z: tz, type: palette.trunk });
    }
    // 3x3x2 canopy on top. In biomes with real leaves, use grass-green blocks
    // (base_blue) so the canopy reads as foliage. Snow biome skips leaves to
    // look like bare winter trunks poking out of snow.
    if (palette.hasLeaves) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dy = trunkHeight; dy <= trunkHeight + 1; dy++) {
            // Skip corners on top layer for a rounder shape
            if (dy === trunkHeight + 1 && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
            const bx = tx + dx;
            const bz = tz + dz;
            const by = h + dy;
            if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE) continue;
            if (by >= WORLD_HEIGHT) continue;
            // Don't overwrite trunk
            if (dx === 0 && dz === 0 && dy === trunkHeight) continue;
            blocks.push({ x: bx, y: by, z: bz, type: 'base_blue' });
          }
        }
      }
    }
    placedTrees.push({ x: tx, z: tz });
  }

  return blocks;
}

export function computeSpawnPoint(blocks: Block[]): { x: number; y: number; z: number } {
  const cx = Math.floor(WORLD_SIZE / 2);
  const cz = Math.floor(WORLD_SIZE / 2);
  // Find highest solid block at spawn column
  let topY = 0;
  for (const b of blocks) {
    if (b.x === cx && b.z === cz && b.y > topY) topY = b.y;
  }
  return { x: cx + 0.5, y: topY + 2, z: cz + 0.5 };
}
