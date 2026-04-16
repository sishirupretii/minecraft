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

export function generateWorld(seed = 1337): Block[] {
  const rng = mulberry32(seed);
  const noise2D = createNoise2D(rng);
  const blocks: Block[] = [];
  const heightMap: number[][] = [];

  const half = WORLD_SIZE / 2;

  // 1. Build height map
  for (let x = 0; x < WORLD_SIZE; x++) {
    heightMap[x] = [];
    for (let z = 0; z < WORLD_SIZE; z++) {
      const nx = (x - half) / 32;
      const nz = (z - half) / 32;
      // Layered noise for gentle hills
      const n =
        noise2D(nx, nz) * 0.6 +
        noise2D(nx * 2, nz * 2) * 0.3 +
        noise2D(nx * 4, nz * 4) * 0.1;
      // Map [-1, 1] → [0, 20]
      const h = Math.max(0, Math.min(20, Math.floor((n + 1) * 10)));
      heightMap[x][z] = h;
    }
  }

  // 2. Fill terrain columns
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const h = heightMap[x][z];
      for (let y = 0; y <= h; y++) {
        let type: BlockType;
        if (y === h) {
          type = 'base_blue';
        } else if (y >= h - 3) {
          type = 'deep_blue';
        } else {
          type = 'ice_stone';
        }
        blocks.push({ x, y, z, type });
      }
      // Sand patches on flat low ground
      if (h <= 3 && rng() < 0.08) {
        // Replace top with sand
        const top = blocks[blocks.length - 1];
        if (top && top.x === x && top.z === z && top.y === h) {
          top.type = 'sand_blue';
        }
      }
    }
  }

  // 3. Scatter trees
  const treeCount = 15 + Math.floor(rng() * 6); // 15–20
  const placedTrees: Array<{ x: number; z: number }> = [];
  let attempts = 0;
  while (placedTrees.length < treeCount && attempts < 400) {
    attempts++;
    const tx = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const tz = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    // Spacing
    if (placedTrees.some((t) => Math.abs(t.x - tx) + Math.abs(t.z - tz) < 6)) continue;
    const h = heightMap[tx][tz];
    if (h < 2 || h > 16) continue;

    // 4-block trunk
    for (let dy = 1; dy <= 4; dy++) {
      blocks.push({ x: tx, y: h + dy, z: tz, type: 'cyan_wood' });
    }
    // 3x3x2 canopy on top
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 4; dy <= 5; dy++) {
          // Skip corners on top layer for a rounder shape
          if (dy === 5 && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
          const bx = tx + dx;
          const bz = tz + dz;
          const by = h + dy;
          if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE) continue;
          if (by >= WORLD_HEIGHT) continue;
          // Don't overwrite trunk
          if (dx === 0 && dz === 0 && dy === 4) continue;
          blocks.push({ x: bx, y: by, z: bz, type: 'cyan_wood' });
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
