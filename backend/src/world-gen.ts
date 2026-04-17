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

type Biome = 'plains' | 'desert' | 'snow' | 'forest' | 'mountain' | 'swamp';

interface BiomePalette {
  surface: BlockType;
  sub: BlockType;
  trees: boolean;
  trunk: BlockType;
  leafType: BlockType;
  hasLeaves: boolean;
  treeDensity: number; // 0..1, probability that a tree check succeeds
  heightScale: number; // multiplier for terrain height
  heightBase: number;  // added to base height
}

const BIOME_BLOCKS: Record<Biome, BiomePalette> = {
  plains:   { surface: 'base_blue',  sub: 'deep_blue',   trees: true,  trunk: 'cyan_wood',     leafType: 'leaves',          hasLeaves: true,  treeDensity: 0.5,  heightScale: 1.0,  heightBase: 0 },
  desert:   { surface: 'sand_blue',  sub: 'royal_brick', trees: false, trunk: 'cyan_wood',     leafType: 'leaves',          hasLeaves: false, treeDensity: 0,    heightScale: 0.7,  heightBase: 0 },
  snow:     { surface: 'ice_stone',  sub: 'deep_blue',   trees: true,  trunk: 'ice_stone',     leafType: 'leaves',          hasLeaves: false, treeDensity: 0.3,  heightScale: 1.0,  heightBase: 0 },
  forest:   { surface: 'base_blue',  sub: 'deep_blue',   trees: true,  trunk: 'dark_oak_wood', leafType: 'dark_oak_leaves', hasLeaves: true,  treeDensity: 0.9,  heightScale: 1.0,  heightBase: 2 },
  mountain: { surface: 'royal_brick',sub: 'deepslate',   trees: false, trunk: 'cyan_wood',     leafType: 'leaves',          hasLeaves: false, treeDensity: 0.1,  heightScale: 2.5,  heightBase: 5 },
  swamp:    { surface: 'mud',        sub: 'clay',        trees: true,  trunk: 'dark_oak_wood', leafType: 'dark_oak_leaves', hasLeaves: true,  treeDensity: 0.4,  heightScale: 0.4,  heightBase: -2 },
};

export function generateWorld(seed = 1337): Block[] {
  const rng = mulberry32(seed);
  const heightNoise = createNoise2D(rng);
  const biomeNoise = createNoise2D(rng);
  const biomeNoise2 = createNoise2D(rng); // second noise layer for more biome variety
  const oreNoise = createNoise2D(rng);
  const caveNoise = createNoise2D(rng);
  const gravelNoise = createNoise2D(rng);
  const riverNoise = createNoise2D(rng);
  const blocks: Block[] = [];
  const heightMap: number[][] = [];
  const biomeMap: Biome[][] = [];

  const half = WORLD_SIZE / 2;

  // 1. Build height map + biome map
  for (let x = 0; x < WORLD_SIZE; x++) {
    heightMap[x] = [];
    biomeMap[x] = [];
    for (let z = 0; z < WORLD_SIZE; z++) {
      // Biome: two noise layers for 6 biomes (temperature + humidity style)
      const bTemp = biomeNoise((x - half) / 64, (z - half) / 64);
      const bHumid = biomeNoise2((x - half) / 80, (z - half) / 80);

      let biome: Biome;
      if (bTemp < -0.35) {
        biome = bHumid < 0 ? 'desert' : 'plains';
      } else if (bTemp > 0.35) {
        biome = bHumid < -0.2 ? 'mountain' : 'snow';
      } else {
        biome = bHumid < -0.15 ? 'swamp' : bHumid > 0.25 ? 'forest' : 'plains';
      }
      biomeMap[x][z] = biome;

      const palette = BIOME_BLOCKS[biome];
      const nx = (x - half) / 32;
      const nz = (z - half) / 32;
      // Layered noise for terrain
      const n =
        heightNoise(nx, nz) * 0.6 +
        heightNoise(nx * 2, nz * 2) * 0.3 +
        heightNoise(nx * 4, nz * 4) * 0.1;
      // Apply biome-specific height scaling
      const rawH = (n + 1) * 10 * palette.heightScale + palette.heightBase;
      const h = Math.max(1, Math.min(28, Math.floor(rawH)));
      heightMap[x][z] = h;
    }
  }

  // Helper: lookup set for placed ores so we don't double-place
  const oreSet = new Set<string>();
  const oreKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

  // 2. Fill terrain columns using biome-appropriate blocks
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const h = heightMap[x][z];
      const biome = biomeMap[x][z];
      const palette = BIOME_BLOCKS[biome];
      for (let y = 0; y <= h; y++) {
        // --- Bedrock layer ---
        if (y === 0) {
          blocks.push({ x, y, z, type: 'bedrock' });
          continue;
        }
        if (y <= 2 && rng() < 0.5) {
          blocks.push({ x, y, z, type: 'bedrock' });
          continue;
        }

        // --- Cave carving ---
        // Don't carve at or above surface-1 (keep top 2 layers intact)
        if (y < h - 1) {
          const caveVal = caveNoise(x * 0.08 + y * 0.15, z * 0.08 + y * 0.11);
          if (caveVal > 0.55) {
            // Cave air — but at low Y, fill with lava instead (lava lakes)
            if (y >= 1 && y <= 3 && rng() < 0.3) {
              blocks.push({ x, y, z, type: 'lava' });
            }
            // Otherwise it's air (skip placing block)
            continue;
          }
        }

        // --- Determine block type ---
        let type: BlockType;
        if (y === h) {
          type = palette.surface;
        } else if (y >= h - 3) {
          type = palette.sub;
        } else {
          // Deep stone below sub-layer — check for ore veins
          const oreVal = oreNoise(x * 0.3 + y * 7.13, z * 0.3 + y * 3.77);

          if (y <= 4 && oreVal > 0.94) {
            // Diamond ore: y 0–4, rare
            type = 'diamond_ore';
            oreSet.add(oreKey(x, y, z));
          } else if (y <= 6 && oreVal > 0.91 && biome === 'mountain') {
            // Emerald ore: only in mountains, y 0–6
            type = 'emerald_ore';
            oreSet.add(oreKey(x, y, z));
          } else if (y <= 10 && oreVal > 0.88) {
            // Gold ore: y 0–10
            type = 'gold_ore';
            oreSet.add(oreKey(x, y, z));
          } else if (y <= 14 && oreVal > 0.84) {
            // Iron ore: y 0–14
            type = 'iron_ore';
            oreSet.add(oreKey(x, y, z));
          } else if (y <= 14 && oreVal > 0.81 && oreVal <= 0.84) {
            // Copper ore: y 0–14
            type = 'copper_ore';
            oreSet.add(oreKey(x, y, z));
          } else if (y <= 18 && oreVal > 0.78) {
            // Coal ore: y 0–18
            type = 'coal_ore';
            oreSet.add(oreKey(x, y, z));
          } else {
            // --- Deepslate below y=5, then gravel patches, then stone ---
            if (y <= 4) {
              type = 'deepslate';
            } else if (y < 8) {
              const gravelVal = gravelNoise(x * 0.4 + y * 2.3, z * 0.4 + y * 1.7);
              if (gravelVal > 0.88) {
                type = 'gravel';
              } else {
                type = 'royal_brick';
              }
            } else {
              type = 'royal_brick';
            }
          }
        }
        blocks.push({ x, y, z, type });
      }

      // --- Biome surface features ---
      if (biome === 'mountain' && h > 18) {
        // Snow cap on tall mountains
        blocks.push({ x, y: h, z, type: 'snow_block' });
        if (h > 22 && rng() < 0.3) {
          blocks.push({ x, y: h + 1, z, type: 'snow_block' });
        }
      }
      if (biome === 'swamp' && h <= 4) {
        // Water pools in low swamp areas
        blocks.push({ x, y: h + 1, z, type: 'water' });
        // Lily pads on water surface
        if (rng() < 0.15) {
          blocks.push({ x, y: h + 2, z, type: 'lily_pad' });
        }
      }
      if (biome === 'swamp' && rng() < 0.03) {
        // Sugar cane in swamp near water
        const scHeight = 1 + Math.floor(rng() * 3);
        for (let sy = 1; sy <= scHeight; sy++) {
          blocks.push({ x, y: h + sy, z, type: 'sugar_cane' });
        }
      }
      if (biome === 'forest' && rng() < 0.02) {
        // Mushrooms scattered on forest floor
        blocks.push({ x, y: h + 1, z, type: rng() < 0.5 ? 'mushroom_red' : 'mushroom_brown' });
      }
      if (biome === 'forest' && rng() < 0.01) {
        // Moss patches in forest
        blocks.push({ x, y: h, z, type: 'moss_block' });
      }
      if (biome === 'desert' && rng() < 0.005) {
        // Cactus in desert
        const cHeight = 1 + Math.floor(rng() * 3);
        for (let cy = 1; cy <= cHeight; cy++) {
          blocks.push({ x, y: h + cy, z, type: 'cactus' });
        }
      }
      if (biome === 'snow' && rng() < 0.01) {
        // Packed ice patches in snow biome
        blocks.push({ x, y: h, z, type: 'packed_ice' });
      }
    }
  }

  // 2.5 Generate amethyst geodes (small underground crystal caves)
  const geodeCount = 2 + Math.floor(rng() * 3);
  for (let g = 0; g < geodeCount; g++) {
    const gx = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const gz = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const gy = 4 + Math.floor(rng() * 6);
    const radius = 2 + Math.floor(rng() * 2);
    // Calcite shell
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      for (let dz = -radius - 1; dz <= radius + 1; dz++) {
        for (let dy = -radius - 1; dy <= radius + 1; dy++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const bx = gx + dx, by = gy + dy, bz = gz + dz;
          if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE || by < 1 || by >= WORLD_HEIGHT) continue;
          if (dist <= radius) {
            // Inner: amethyst crystals
            if (rng() < 0.4) {
              blocks.push({ x: bx, y: by, z: bz, type: 'amethyst' });
            }
          } else if (dist <= radius + 1) {
            // Outer shell: calcite
            blocks.push({ x: bx, y: by, z: bz, type: 'calcite' });
          }
        }
      }
    }
  }

  // 2.6 Generate rivers using noise-based winding channels
  // River: thin band where riverNoise is close to 0 (within threshold)
  const riverBlocks = new Set<string>();
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      // Skip the city center area (roughly 50-78)
      if (x >= 48 && x <= 80 && z >= 48 && z <= 80) continue;
      const rv = riverNoise((x - half) / 30, (z - half) / 30);
      // River where noise is very close to 0 (narrow band)
      if (Math.abs(rv) < 0.04) {
        const biome = biomeMap[x][z];
        if (biome === 'desert') continue; // No rivers in desert
        const h = heightMap[x][z];
        if (h < 3 || h > 20) continue;
        // Carve channel: replace surface block with water
        blocks.push({ x, y: h, z, type: 'water' });
        riverBlocks.add(`${x},${z}`);
        // Dig 1 block deeper for river bed (sand/clay)
        if (h > 1) {
          const bedType: BlockType = biome === 'swamp' ? 'clay' : 'sand_blue';
          blocks.push({ x, y: h - 1, z, type: bedType });
        }
      }
    }
  }

  // 2.7 Generate small lakes/ponds in plains biome
  const lakeCount = 3 + Math.floor(rng() * 4);
  for (let l = 0; l < lakeCount; l++) {
    const lx = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const lz = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    // Only in plains
    if (lx >= 0 && lx < WORLD_SIZE && lz >= 0 && lz < WORLD_SIZE && biomeMap[lx][lz] === 'plains') {
      const lRadius = 2 + Math.floor(rng() * 3);
      const lh = heightMap[lx][lz];
      for (let dx = -lRadius; dx <= lRadius; dx++) {
        for (let dz = -lRadius; dz <= lRadius; dz++) {
          if (dx * dx + dz * dz > lRadius * lRadius) continue;
          const bx = lx + dx, bz = lz + dz;
          if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE) continue;
          // Place water at surface level
          blocks.push({ x: bx, y: lh, z: bz, type: 'water' });
          // Add sugar cane on edges
          if (dx * dx + dz * dz >= (lRadius - 1) * (lRadius - 1) && rng() < 0.2) {
            blocks.push({ x: bx, y: lh + 1, z: bz, type: 'sugar_cane' });
          }
        }
      }
    }
  }

  // 2.8 Generate ravines (deep narrow crevices in the terrain)
  const ravineCount = 1 + Math.floor(rng() * 2); // 1-2 ravines
  for (let r = 0; r < ravineCount; r++) {
    // Starting position
    let rx = 20 + Math.floor(rng() * (WORLD_SIZE - 40));
    let rz = 20 + Math.floor(rng() * (WORLD_SIZE - 40));
    // Direction of the ravine (slight random walk)
    let dirX = (rng() - 0.5) * 2;
    let dirZ = (rng() - 0.5) * 2;
    const ravineLength = 15 + Math.floor(rng() * 20); // 15-34 blocks long
    const ravineDepth = 8 + Math.floor(rng() * 8); // 8-15 blocks deep
    const ravineWidth = 1; // 1-block wide at top, narrows

    for (let step = 0; step < ravineLength; step++) {
      const bx = Math.floor(rx);
      const bz = Math.floor(rz);
      if (bx < 2 || bx >= WORLD_SIZE - 2 || bz < 2 || bz >= WORLD_SIZE - 2) break;

      const surfaceH = heightMap[bx]?.[bz] ?? 10;
      // Carve from surface down to ravineDepth
      const bottomY = Math.max(2, surfaceH - ravineDepth);
      for (let y = surfaceH; y >= bottomY; y--) {
        // Width varies: wider at top, narrower at bottom
        const widthAtY = y > surfaceH - 3 ? ravineWidth + 1 : y > surfaceH - 6 ? ravineWidth : 0;
        for (let dx = -widthAtY; dx <= widthAtY; dx++) {
          for (let dz = -widthAtY; dz <= widthAtY; dz++) {
            const px = bx + dx, pz = bz + dz;
            if (px < 0 || px >= WORLD_SIZE || pz < 0 || pz >= WORLD_SIZE) continue;
            // Don't carve into bedrock
            if (y <= 1) continue;
            // Place lava at very bottom of deep ravines
            if (y <= bottomY + 1 && ravineDepth > 10) {
              blocks.push({ x: px, y, z: pz, type: 'lava' });
            }
            // Otherwise leave as air (will be carved by overwriting later, but since we push
            // blocks in order and the renderer uses last-wins, we push 'water' at bottom for shallow ones)
          }
        }
      }

      // Random walk for next position
      rx += dirX;
      rz += dirZ;
      dirX += (rng() - 0.5) * 0.5;
      dirZ += (rng() - 0.5) * 0.5;
      // Clamp direction
      dirX = Math.max(-1.5, Math.min(1.5, dirX));
      dirZ = Math.max(-1.5, Math.min(1.5, dirZ));
    }
  }

  // 2.9 Generate village clusters (2-4 houses near each other)
  const villageCount = 1 + Math.floor(rng() * 2);
  for (let v = 0; v < villageCount; v++) {
    const vx = 15 + Math.floor(rng() * (WORLD_SIZE - 30));
    const vz = 15 + Math.floor(rng() * (WORLD_SIZE - 30));
    const biome = biomeMap[vx]?.[vz];
    if (biome !== 'plains' && biome !== 'desert') continue;
    const vh = heightMap[vx]?.[vz] ?? 10;
    if (vh < 3 || vh > 16) continue;

    // Place a village well at center
    blocks.push({ x: vx, y: vh + 1, z: vz, type: 'cobblestone' });
    blocks.push({ x: vx, y: vh + 2, z: vz, type: 'water' });
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        blocks.push({ x: vx + dx, y: vh + 1, z: vz + dz, type: 'cobblestone' });
      }
    }

    // Place 2-4 houses around the well
    const houseCount = 2 + Math.floor(rng() * 3);
    const wallType: BlockType = biome === 'desert' ? 'sand_blue' : 'cobblestone';
    const roofType: BlockType = biome === 'desert' ? 'terracotta' : 'planks';
    for (let h = 0; h < houseCount; h++) {
      const angle = (h / houseCount) * Math.PI * 2 + rng() * 0.5;
      const dist = 5 + Math.floor(rng() * 4);
      const hx = vx + Math.floor(Math.cos(angle) * dist);
      const hz = vz + Math.floor(Math.sin(angle) * dist);
      if (hx < 2 || hx >= WORLD_SIZE - 2 || hz < 2 || hz >= WORLD_SIZE - 2) continue;
      const hh = heightMap[hx]?.[hz] ?? vh;
      const baseY = hh + 1;

      // 3x3 house: walls, floor, roof
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          // Floor
          blocks.push({ x: hx + dx, y: baseY, z: hz + dz, type: roofType });
          // Walls (3 blocks high, hollow inside)
          if (Math.abs(dx) === 1 || Math.abs(dz) === 1) {
            for (let wy = 1; wy <= 3; wy++) {
              // Leave a door gap on one side
              if (dx === 0 && dz === -1 && wy <= 2) continue;
              blocks.push({ x: hx + dx, y: baseY + wy, z: hz + dz, type: wallType });
            }
          }
          // Roof
          blocks.push({ x: hx + dx, y: baseY + 4, z: hz + dz, type: roofType });
        }
      }
      // Torch inside
      blocks.push({ x: hx, y: baseY + 2, z: hz, type: 'torch' });
      // Crafting table
      if (rng() < 0.5) {
        blocks.push({ x: hx - 1, y: baseY + 1, z: hz, type: 'crafting_table' });
      }
    }

    // Village path: connect houses to well with cobblestone
    // Simple: just place a cobble line from well center outward
    for (let dx = -8; dx <= 8; dx++) {
      const px = vx + dx, pz = vz;
      if (px >= 0 && px < WORLD_SIZE && pz >= 0 && pz < WORLD_SIZE) {
        const pathH = heightMap[px]?.[pz] ?? vh;
        blocks.push({ x: px, y: pathH, z: pz, type: 'cobblestone' });
      }
    }
    for (let dz = -8; dz <= 8; dz++) {
      const px = vx, pz = vz + dz;
      if (px >= 0 && px < WORLD_SIZE && pz >= 0 && pz < WORLD_SIZE) {
        const pathH = heightMap[px]?.[pz] ?? vh;
        blocks.push({ x: px, y: pathH, z: pz, type: 'cobblestone' });
      }
    }
  }

  // 3. Scatter trees — biome-aware, with varied tree types and densities.
  const treeCount = 45 + Math.floor(rng() * 20); // 45–64 (more trees overall)
  const placedTrees: Array<{ x: number; z: number }> = [];
  let attempts = 0;
  while (placedTrees.length < treeCount && attempts < 1200) {
    attempts++;
    const tx = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const tz = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const biome = biomeMap[tx][tz];
    const palette = BIOME_BLOCKS[biome];
    if (!palette.trees) continue;
    // Biome density check
    if (rng() > palette.treeDensity) continue;
    // Spacing: tighter in forests, looser elsewhere
    const minSpacing = biome === 'forest' ? 3 : 6;
    if (placedTrees.some((t) => Math.abs(t.x - tx) + Math.abs(t.z - tz) < minSpacing)) continue;
    const h = heightMap[tx][tz];
    if (h < 2 || h > 24) continue;
    // Don't place trees on rivers
    if (riverBlocks.has(`${tx},${tz}`)) continue;

    // Forest biome: mix of normal oak, birch, and dark oak trees
    let trunkType = palette.trunk;
    let leafType = palette.leafType;
    if (biome === 'forest') {
      const treeRoll = rng();
      if (treeRoll < 0.35) {
        trunkType = 'birch_wood';
        leafType = 'birch_leaves';
      } else if (treeRoll < 0.6) {
        trunkType = 'cyan_wood';
        leafType = 'leaves';
      }
      // else dark_oak (default for forest)
    }

    // Trunk height varies by biome
    const trunkHeight = biome === 'forest'
      ? 5 + Math.floor(rng() * 3) // 5–7 for forest (taller)
      : biome === 'swamp'
      ? 3 + Math.floor(rng() * 2) // 3–4 for swamp (shorter, wider)
      : 4 + Math.floor(rng() * 2); // 4–5 default

    for (let dy = 1; dy <= trunkHeight; dy++) {
      blocks.push({ x: tx, y: h + dy, z: tz, type: trunkType });
    }

    // Swamp trees have vine blocks hanging from canopy
    const canopyRadius = biome === 'swamp' ? 2 : 1;

    if (palette.hasLeaves) {
      for (let dx = -canopyRadius; dx <= canopyRadius; dx++) {
        for (let dz = -canopyRadius; dz <= canopyRadius; dz++) {
          // Skip far corners for round shape
          if (Math.abs(dx) === canopyRadius && Math.abs(dz) === canopyRadius && rng() < 0.5) continue;
          for (let dy = trunkHeight - 1; dy <= trunkHeight + 1; dy++) {
            if (dy === trunkHeight + 1 && Math.abs(dx) === canopyRadius && Math.abs(dz) === canopyRadius) continue;
            const bx = tx + dx;
            const bz = tz + dz;
            const by = h + dy;
            if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE) continue;
            if (by >= WORLD_HEIGHT) continue;
            if (dx === 0 && dz === 0 && dy <= trunkHeight) continue;
            blocks.push({ x: bx, y: by, z: bz, type: leafType });
          }
          // Swamp: hanging vines from canopy edges
          if (biome === 'swamp' && (Math.abs(dx) === canopyRadius || Math.abs(dz) === canopyRadius) && rng() < 0.4) {
            const bx = tx + dx, bz = tz + dz;
            if (bx >= 0 && bx < WORLD_SIZE && bz >= 0 && bz < WORLD_SIZE) {
              const vineLen = 1 + Math.floor(rng() * 3);
              for (let vy = 0; vy < vineLen; vy++) {
                const vy2 = h + trunkHeight - 2 - vy;
                if (vy2 > h) blocks.push({ x: bx, y: vy2, z: bz, type: 'vine' });
              }
            }
          }
        }
      }
    }
    placedTrees.push({ x: tx, z: tz });
  }

  // 4. Simple structures: stone wells in plains biome (3–5 wells)
  const wellCount = 3 + Math.floor(rng() * 3); // 3–5
  const placedWells: Array<{ x: number; z: number }> = [];
  let wellAttempts = 0;
  while (placedWells.length < wellCount && wellAttempts < 400) {
    wellAttempts++;
    const wx = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const wz = 4 + Math.floor(rng() * (WORLD_SIZE - 8));
    const biome = biomeMap[wx][wz];
    if (biome !== 'plains') continue;
    // Spacing from other wells
    if (placedWells.some((w) => Math.abs(w.x - wx) + Math.abs(w.z - wz) < 12)) continue;
    // Spacing from trees
    if (placedTrees.some((t) => Math.abs(t.x - wx) + Math.abs(t.z - wz) < 6)) continue;
    const h = heightMap[wx][wz];
    if (h < 2 || h > 16) continue;

    // Check that the 3x3 footprint is roughly flat (all heights within 1 of center)
    let flat = true;
    for (let dx = -1; dx <= 1 && flat; dx++) {
      for (let dz = -1; dz <= 1 && flat; dz++) {
        const cx = wx + dx;
        const cz = wz + dz;
        if (cx < 0 || cx >= WORLD_SIZE || cz < 0 || cz >= WORLD_SIZE) { flat = false; break; }
        if (Math.abs(heightMap[cx][cz] - h) > 1) flat = false;
      }
    }
    if (!flat) continue;

    const baseY = h + 1;
    const pillarHeight = 3;

    // 3x3 cobblestone ring at base (hollow center)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue; // hollow center
        blocks.push({ x: wx + dx, y: baseY, z: wz + dz, type: 'cobblestone' });
      }
    }

    // 4 corner pillars, 3 blocks tall (starting at baseY+1 since baseY already has the ring)
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      for (let dy = 1; dy <= pillarHeight; dy++) {
        blocks.push({ x: wx + dx, y: baseY + dy, z: wz + dz, type: 'cobblestone' });
      }
    }

    // 3x3 cobblestone roof at top of pillars
    const roofY = baseY + pillarHeight + 1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        blocks.push({ x: wx + dx, y: roofY, z: wz + dz, type: 'cobblestone' });
      }
    }

    placedWells.push({ x: wx, z: wz });
  }

  // 4.5 Generate small huts/cabins in plains biome (simple 3x3 structures with doors)
  const hutCount = 2 + Math.floor(rng() * 3);
  let hutAttempts = 0;
  const placedHuts: Array<{ x: number; z: number }> = [];
  while (placedHuts.length < hutCount && hutAttempts < 300) {
    hutAttempts++;
    const hx = 8 + Math.floor(rng() * (WORLD_SIZE - 16));
    const hz = 8 + Math.floor(rng() * (WORLD_SIZE - 16));
    const biome = biomeMap[hx][hz];
    if (biome !== 'plains' && biome !== 'forest') continue;
    // Skip city area
    if (hx >= 48 && hx <= 80 && hz >= 48 && hz <= 80) continue;
    // Spacing checks
    if (placedHuts.some((h) => Math.abs(h.x - hx) + Math.abs(h.z - hz) < 15)) continue;
    if (placedTrees.some((t) => Math.abs(t.x - hx) + Math.abs(t.z - hz) < 5)) continue;
    if (placedWells.some((w) => Math.abs(w.x - hx) + Math.abs(w.z - hz) < 8)) continue;
    if (riverBlocks.has(`${hx},${hz}`)) continue;

    const h = heightMap[hx][hz];
    if (h < 3 || h > 16) continue;

    // Check flatness for 5x5 footprint
    let hutFlat = true;
    for (let dx = -2; dx <= 2 && hutFlat; dx++) {
      for (let dz = -2; dz <= 2 && hutFlat; dz++) {
        const cx = hx + dx, cz = hz + dz;
        if (cx < 0 || cx >= WORLD_SIZE || cz < 0 || cz >= WORLD_SIZE) { hutFlat = false; break; }
        if (Math.abs(heightMap[cx][cz] - h) > 1) hutFlat = false;
      }
    }
    if (!hutFlat) continue;

    const baseY = h + 1;

    // Floor: planks 3x3
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        blocks.push({ x: hx + dx, y: baseY, z: hz + dz, type: 'planks' });
      }
    }

    // Walls: 2 blocks high, cobblestone, with door opening on south side
    for (let dy = 1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          // Only walls (edges)
          if (Math.abs(dx) !== 1 && Math.abs(dz) !== 1) continue;
          // Door opening: south wall center
          if (dz === 1 && dx === 0) continue; // door gap
          blocks.push({ x: hx + dx, y: baseY + dy, z: hz + dz, type: 'cobblestone' });
        }
      }
    }

    // Roof: planks 3x3 + overhang
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // round corners
        blocks.push({ x: hx + dx, y: baseY + 3, z: hz + dz, type: 'planks' });
      }
    }

    // Interior: torch and crafting table
    blocks.push({ x: hx, y: baseY + 2, z: hz - 1, type: 'torch' });
    blocks.push({ x: hx - 1, y: baseY + 1, z: hz - 1, type: 'crafting_table' });
    // Chest with some loot
    blocks.push({ x: hx + 1, y: baseY + 1, z: hz - 1, type: 'chest' });

    placedHuts.push({ x: hx, z: hz });
  }

  // 4.6 Generate desert pyramids (1-2 in desert biomes)
  const pyramidCount = 1 + Math.floor(rng() * 2);
  let pyramidAttempts = 0;
  const placedPyramids: Array<{ x: number; z: number }> = [];
  while (placedPyramids.length < pyramidCount && pyramidAttempts < 200) {
    pyramidAttempts++;
    const px = 15 + Math.floor(rng() * (WORLD_SIZE - 30));
    const pz = 15 + Math.floor(rng() * (WORLD_SIZE - 30));
    if (biomeMap[px][pz] !== 'desert') continue;
    // Check spacing from other pyramids
    if (placedPyramids.some(p => Math.abs(p.x - px) < 25 && Math.abs(p.z - pz) < 25)) continue;

    const baseY = heightMap[px][pz];
    const pyramidSize = 7 + Math.floor(rng() * 4); // 7-10 base radius

    // Build pyramid layer by layer
    for (let layer = 0; layer <= pyramidSize; layer++) {
      const radius = pyramidSize - layer;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const bx = px + dx;
          const bz = pz + dz;
          if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE) continue;
          // Only edges for upper layers (hollow inside), solid base
          if (layer > 0 && layer < pyramidSize && Math.abs(dx) < radius && Math.abs(dz) < radius) {
            // Hollow interior — skip
            continue;
          }
          blocks.push({ x: bx, y: baseY + layer, z: bz, type: 'terracotta' });
        }
      }
    }

    // Interior treasure room (ground level, centered)
    const roomY = baseY + 1;
    // Floor of treasure room
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        blocks.push({ x: px + dx, y: roomY, z: pz + dz, type: 'terracotta' });
      }
    }
    // Chests with loot
    blocks.push({ x: px, y: roomY + 1, z: pz, type: 'chest' });
    blocks.push({ x: px + 1, y: roomY + 1, z: pz, type: 'chest' });
    blocks.push({ x: px - 1, y: roomY + 1, z: pz, type: 'chest' });
    // Torches
    blocks.push({ x: px + 2, y: roomY + 2, z: pz + 2, type: 'torch' });
    blocks.push({ x: px - 2, y: roomY + 2, z: pz - 2, type: 'torch' });
    blocks.push({ x: px + 2, y: roomY + 2, z: pz - 2, type: 'torch' });
    blocks.push({ x: px - 2, y: roomY + 2, z: pz + 2, type: 'torch' });
    // Gold blocks as treasure
    blocks.push({ x: px, y: roomY + 1, z: pz + 1, type: 'gold_block' });
    blocks.push({ x: px, y: roomY + 1, z: pz - 1, type: 'gold_block' });
    // TNT trap
    blocks.push({ x: px + 2, y: roomY + 1, z: pz, type: 'tnt' });
    blocks.push({ x: px - 2, y: roomY + 1, z: pz, type: 'tnt' });

    placedPyramids.push({ x: px, z: pz });
  }

  // 4.7 Generate underground dungeons (small rooms with mob spawners and loot)
  const dungeonCount = 3 + Math.floor(rng() * 3); // 3-5 dungeons
  let dungeonAttempts = 0;
  const placedDungeons: Array<{ x: number; y: number; z: number }> = [];
  while (placedDungeons.length < dungeonCount && dungeonAttempts < 300) {
    dungeonAttempts++;
    const dx = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const dz = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const dy = 5 + Math.floor(rng() * 10); // between Y=5 and Y=15 (underground)
    // Check it's actually underground
    if (dy >= heightMap[dx][dz] - 3) continue;
    // Spacing
    if (placedDungeons.some(d => Math.abs(d.x - dx) < 15 && Math.abs(d.z - dz) < 15)) continue;

    const roomW = 3 + Math.floor(rng() * 2); // 3-4 wide
    const roomH = 3; // 3 tall
    const roomD = 3 + Math.floor(rng() * 2); // 3-4 deep

    // Carve room (remove blocks, place air)
    for (let rx = -roomW; rx <= roomW; rx++) {
      for (let ry = 0; ry < roomH; ry++) {
        for (let rz = -roomD; rz <= roomD; rz++) {
          const bx = dx + rx;
          const bz = dz + rz;
          if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE) continue;
          // Walls and floor
          if (Math.abs(rx) === roomW || Math.abs(rz) === roomD || ry === 0) {
            blocks.push({ x: bx, y: dy + ry, z: bz, type: 'mossy_cobblestone' });
          }
          // Ceiling
          if (ry === roomH - 1) {
            blocks.push({ x: bx, y: dy + ry, z: bz, type: 'mossy_cobblestone' });
          }
        }
      }
    }

    // Interior: chests, torches, spawner indicator
    blocks.push({ x: dx, y: dy + 1, z: dz, type: 'chest' });
    blocks.push({ x: dx + 1, y: dy + 1, z: dz, type: 'chest' });
    // Torches on walls
    blocks.push({ x: dx + roomW - 1, y: dy + 2, z: dz, type: 'torch' });
    blocks.push({ x: dx - roomW + 1, y: dy + 2, z: dz, type: 'torch' });
    // Vine decorations
    blocks.push({ x: dx - 1, y: dy + 2, z: dz - 1, type: 'vine' });
    blocks.push({ x: dx + 1, y: dy + 2, z: dz + 1, type: 'vine' });
    // Fence as cage decoration
    blocks.push({ x: dx, y: dy + 1, z: dz + roomD - 1, type: 'fence' });
    blocks.push({ x: dx, y: dy + 2, z: dz + roomD - 1, type: 'fence' });

    placedDungeons.push({ x: dx, y: dy, z: dz });
  }

  // 4.8 Generate ruined portals (obsidian frames partially broken, with loot)
  const portalCount = 1 + Math.floor(rng() * 2);
  let portalAttempts = 0;
  while (portalAttempts < portalCount * 50) {
    portalAttempts++;
    const ppx = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const ppz = 10 + Math.floor(rng() * (WORLD_SIZE - 20));
    const baseH = heightMap[ppx][ppz];
    if (baseH < 3) continue;

    // Build a 4x5 obsidian frame, with some blocks missing
    const portalH = 5;
    const portalW = 4;
    for (let dy = 0; dy < portalH; dy++) {
      for (let ddx = 0; ddx < portalW; ddx++) {
        // Only frame edges
        if (dy > 0 && dy < portalH - 1 && ddx > 0 && ddx < portalW - 1) continue;
        // Random chance to skip (ruined effect)
        if (rng() < 0.3) continue;
        blocks.push({ x: ppx + ddx, y: baseH + dy, z: ppz, type: 'obsidian' });
      }
    }
    // Loot chest nearby
    blocks.push({ x: ppx + 2, y: baseH, z: ppz + 1, type: 'chest' });
    // Gold block reward
    blocks.push({ x: ppx + 1, y: baseH, z: ppz + 1, type: 'gold_block' });
    // Nether bricks decoration
    blocks.push({ x: ppx, y: baseH, z: ppz + 1, type: 'nether_bricks' });
    blocks.push({ x: ppx + 3, y: baseH, z: ppz + 1, type: 'nether_bricks' });
    break;
  }

  // 5. Generate Base City in the world center
  generateBaseCity(blocks, heightMap, half, rng);

  return blocks;
}

// ---------------------------------------------------------------------------
// Base City — procedurally generated city representing the Base ecosystem
// Occupies roughly x=40..88, z=40..88, centered on (64,64).
// ---------------------------------------------------------------------------

const CITY_MIN = 40;
const CITY_MAX = 88;
const CITY_GROUND = 10; // flattened terrain height

function generateBaseCity(
  blocks: Block[],
  heightMap: number[][],
  _half: number,
  rng: () => number,
) {
  // Helper to push a block (bounds-checked)
  const put = (x: number, y: number, z: number, type: BlockType) => {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    blocks.push({ x, y, z, type });
  };

  // Track which (x,z) positions are in the city so we can remove terrain blocks
  // that poke above CITY_GROUND. We do this by collecting positions first, then
  // filtering the blocks array.
  const cityPositions = new Set<string>();
  for (let x = CITY_MIN; x <= CITY_MAX; x++) {
    for (let z = CITY_MIN; z <= CITY_MAX; z++) {
      cityPositions.add(`${x},${z}`);
    }
  }

  // --- Step 1: Flatten terrain in city zone ---
  // Remove any blocks above CITY_GROUND, fill gaps up to CITY_GROUND
  // First, remove blocks above ground level in the city zone
  const kept: Block[] = [];
  for (const b of blocks) {
    const key = `${b.x},${b.z}`;
    if (cityPositions.has(key) && b.y > CITY_GROUND) {
      continue; // remove blocks above city ground
    }
    kept.push(b);
  }
  blocks.length = 0;
  for (const b of kept) blocks.push(b);

  // Fill terrain up to CITY_GROUND where needed
  // Build a lookup of existing blocks in city zone
  const existingBlocks = new Set<string>();
  for (const b of blocks) {
    if (cityPositions.has(`${b.x},${b.z}`)) {
      existingBlocks.add(`${b.x},${b.y},${b.z}`);
    }
  }
  for (let x = CITY_MIN; x <= CITY_MAX; x++) {
    for (let z = CITY_MIN; z <= CITY_MAX; z++) {
      for (let y = 1; y <= CITY_GROUND; y++) {
        if (!existingBlocks.has(`${x},${y},${z}`)) {
          // Fill with stone below surface, surface block on top
          const type: BlockType = y === CITY_GROUND ? 'royal_brick' : 'deep_blue';
          put(x, y, z, type);
        }
      }
      // Update heightMap
      heightMap[x][z] = CITY_GROUND;
    }
  }

  const G = CITY_GROUND; // shorthand for ground level

  // =========================================================================
  // 6. ROADS
  // =========================================================================
  // Main east-west boulevard: z=63..65 (3 wide), x=40..88
  // North-south avenue: x=63..65 (3 wide), z=40..88
  // Sidewalks on each side (1-block royal_brick)

  // Lay road surface
  for (let x = CITY_MIN; x <= CITY_MAX; x++) {
    for (let z = 63; z <= 65; z++) {
      put(x, G, z, 'cobblestone');
    }
    // Sidewalks for east-west road
    put(x, G, 62, 'royal_brick');
    put(x, G, 66, 'royal_brick');
  }
  for (let z = CITY_MIN; z <= CITY_MAX; z++) {
    for (let x = 63; x <= 65; x++) {
      put(x, G, z, 'cobblestone');
    }
    // Sidewalks for north-south road
    put(62, G, z, 'royal_brick');
    put(66, G, z, 'royal_brick');
  }

  // Road markings: gold center line every 4 blocks (dashed)
  for (let x = CITY_MIN; x <= CITY_MAX; x++) {
    if (x % 4 < 2) put(x, G, 64, 'gold_block');
  }
  for (let z = CITY_MIN; z <= CITY_MAX; z++) {
    if (z % 4 < 2) put(64, G, z, 'gold_block');
  }

  // Side roads connecting buildings to main roads
  // Jesse's house (x=44..52, z=44..52) -> connect south to z=63
  for (let z = 53; z <= 62; z++) {
    for (let dx = 0; dx <= 2; dx++) put(47 + dx, G, z, 'cobblestone');
    put(46, G, z, 'royal_brick');
    put(50, G, z, 'royal_brick');
  }
  // Brian's mansion (x=74..86, z=44..54) -> connect south to z=63
  for (let z = 55; z <= 62; z++) {
    for (let dx = 0; dx <= 2; dx++) put(79 + dx, G, z, 'cobblestone');
    put(78, G, z, 'royal_brick');
    put(82, G, z, 'royal_brick');
  }
  // Research Lab (x=44..54, z=72..80) -> connect north to z=66
  for (let z = 67; z <= 71; z++) {
    for (let dx = 0; dx <= 2; dx++) put(48 + dx, G, z, 'cobblestone');
    put(47, G, z, 'royal_brick');
    put(51, G, z, 'royal_brick');
  }
  // Creator Hub (x=72..84, z=72..82) -> connect north to z=66
  for (let z = 67; z <= 71; z++) {
    for (let dx = 0; dx <= 2; dx++) put(77 + dx, G, z, 'cobblestone');
    put(76, G, z, 'royal_brick');
    put(80, G, z, 'royal_brick');
  }

  // =========================================================================
  // 7. RAILWAY — south edge z=86..88
  // =========================================================================
  for (let x = CITY_MIN; x <= CITY_MAX; x++) {
    // Rail bed
    put(x, G, 86, 'cobblestone');
    put(x, G, 87, 'cobblestone');
    put(x, G, 88, 'cobblestone');
    // Rail tracks
    put(x, G + 1, 87, 'iron_ore');
    put(x, G + 1, 86, 'iron_ore');
  }
  // Railway station at x=62..66
  for (let x = 62; x <= 66; x++) {
    // Platform
    put(x, G + 1, 88, 'cobblestone');
    // Roof
    put(x, G + 4, 88, 'planks');
    // Pillars at edges
    if (x === 62 || x === 66) {
      for (let dy = 2; dy <= 3; dy++) put(x, G + dy, 88, 'cobblestone');
    }
    // Lighting
    if (x === 64) put(x, G + 3, 88, 'torch');
  }

  // =========================================================================
  // 8. PARK / PLAZA — intersection at x=64, z=64
  // =========================================================================
  // 5x5 base_block platform centered at (64,64)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      put(64 + dx, G + 1, 64 + dz, 'base_block');
    }
  }
  // Crystal monument in center
  put(64, G + 2, 64, 'crystal_block');
  put(64, G + 3, 64, 'crystal_block');
  put(64, G + 4, 64, 'crystal_block');
  // Gold rim
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
        if (Math.abs(dx) <= 3 && Math.abs(dz) <= 3) {
          put(64 + dx, G + 1, 64 + dz, 'gold_block');
        }
      }
    }
  }
  // 4 trees at corners of plaza
  const treeCorners = [[-4, -4], [-4, 4], [4, -4], [4, 4]];
  for (const [dx, dz] of treeCorners) {
    const tx = 64 + dx, tz = 64 + dz;
    // Trunk
    for (let dy = 1; dy <= 4; dy++) put(tx, G + dy, tz, 'cyan_wood');
    // Canopy
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        put(tx + cx, G + 5, tz + cz, 'leaves');
        if (!(Math.abs(cx) === 1 && Math.abs(cz) === 1)) {
          put(tx + cx, G + 6, tz + cz, 'leaves');
        }
      }
    }
  }
  // Torch lamps around plaza
  for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
    put(64 + dx, G + 2, 64 + dz, 'torch');
  }
  // base_blue grass patches around plaza
  for (const [dx, dz] of [[-5, -2], [-5, 2], [5, -2], [5, 2], [-2, -5], [2, -5], [-2, 5], [2, 5]]) {
    put(64 + dx, G, 64 + dz, 'base_blue');
  }

  // =========================================================================
  // 1. COINBASE HQ — x=58..70, z=58..70, 15 blocks tall
  // =========================================================================
  buildCoinbaseHQ(put, G);

  // =========================================================================
  // 2. JESSE POLLAK'S HOUSE — x=44..52, z=44..52, 6 blocks tall
  // =========================================================================
  buildJesseHouse(put, G);

  // =========================================================================
  // 3. BRIAN ARMSTRONG'S MANSION — x=74..86, z=44..54, 8 blocks tall
  // =========================================================================
  buildBrianMansion(put, G);

  // =========================================================================
  // 4. BASE RESEARCH LAB — x=44..54, z=72..80, 7 blocks tall
  // =========================================================================
  buildResearchLab(put, G);

  // =========================================================================
  // 5. BASE CREATOR HUB — x=72..84, z=72..82, 6 blocks tall
  // =========================================================================
  buildCreatorHub(put, G);

  // =========================================================================
  // 9. STREET LIGHTS — every 8 blocks along roads
  // =========================================================================
  // Along east-west road
  for (let x = CITY_MIN; x <= CITY_MAX; x += 8) {
    // North side
    placeStreetLight(put, x, G, 61);
    // South side
    placeStreetLight(put, x, G, 67);
  }
  // Along north-south road
  for (let z = CITY_MIN; z <= CITY_MAX; z += 8) {
    // West side
    placeStreetLight(put, 61, G, z);
    // East side
    placeStreetLight(put, 67, G, z);
  }

  // =========================================================================
  // 10. PARKING LOT — x=86..88, z=60..68
  // =========================================================================
  for (let x = 86; x <= 88; x++) {
    for (let z = 60; z <= 68; z++) {
      put(x, G, z, 'gravel');
      // Parking lines every 3 blocks
      if (z % 3 === 0) put(x, G, z, 'cobblestone');
    }
  }

  // =========================================================================
  // 11. "PEOPLE" STATUES — along sidewalks
  // =========================================================================
  const peoplePositions = [
    [42, 62], [46, 66], [52, 62], [58, 66],
    [70, 62], [76, 66], [82, 62], [66, 46],
    [66, 54], [62, 78],
  ];
  for (const [px, pz] of peoplePositions) {
    put(px, G + 1, pz, 'wool');
    put(px, G + 2, pz, 'wool');
    put(px, G + 3, pz, 'planks');
  }

  // =========================================================================
  // 12. "CARS" — on roads
  // =========================================================================
  const carPositions: Array<[number, number, 'ew' | 'ns']> = [
    [45, 64, 'ew'], [55, 63, 'ew'], [73, 65, 'ew'], [83, 64, 'ew'],
    [64, 45, 'ns'], [63, 77, 'ns'],
  ];
  for (const [cx, cz, dir] of carPositions) {
    if (dir === 'ew') {
      // 4 long in x, 2 wide in z, 2 tall
      for (let dx = 0; dx < 4; dx++) {
        put(cx + dx, G + 1, cz, 'cobblestone');
        put(cx + dx, G + 1, cz + 1, 'cobblestone');
      }
      // Windshield on top (middle 2 blocks)
      put(cx + 1, G + 2, cz, 'glass');
      put(cx + 1, G + 2, cz + 1, 'glass');
      put(cx + 2, G + 2, cz, 'glass');
      put(cx + 2, G + 2, cz + 1, 'glass');
    } else {
      // 4 long in z, 2 wide in x, 2 tall
      for (let dz = 0; dz < 4; dz++) {
        put(cx, G + 1, cz + dz, 'cobblestone');
        put(cx + 1, G + 1, cz + dz, 'cobblestone');
      }
      put(cx, G + 2, cz + 1, 'glass');
      put(cx + 1, G + 2, cz + 1, 'glass');
      put(cx, G + 2, cz + 2, 'glass');
      put(cx + 1, G + 2, cz + 2, 'glass');
    }
  }
}

// ---------------------------------------------------------------------------
// Street light: 4-tall cobblestone pole with torch on top
// ---------------------------------------------------------------------------
function placeStreetLight(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  x: number, g: number, z: number,
) {
  for (let dy = 1; dy <= 4; dy++) put(x, g + dy, z, 'cobblestone');
  put(x, g + 5, z, 'torch');
}

// ---------------------------------------------------------------------------
// 1. Coinbase HQ — 12x12 footprint, 15 blocks tall
// ---------------------------------------------------------------------------
function buildCoinbaseHQ(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  G: number,
) {
  const x1 = 58, x2 = 70, z1 = 58, z2 = 70;
  const HEIGHT = 15;

  for (let floor = 1; floor <= HEIGHT; floor++) {
    const y = G + floor;
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const isEdgeX = x === x1 || x === x2;
        const isEdgeZ = z === z1 || z === z2;
        const isWall = isEdgeX || isEdgeZ;

        if (floor === 1) {
          // Ground floor
          if (isWall) {
            // Entrance: 3-wide glass door at front (z=z1), centered
            if (z === z1 && x >= 63 && x <= 65) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'base_block');
            }
          } else {
            put(x, y, z, 'planks'); // floor
          }
        } else if (floor <= 12) {
          // Floors 2-12: walls with glass windows every other block
          if (isWall) {
            if (floor % 2 === 0 && !isEdgeX !== !isEdgeZ) {
              // Glass windows on non-corner wall blocks on even floors
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'base_block');
            }
          } else if (floor === 2 || floor === 5 || floor === 8 || floor === 11) {
            // Interior floors every 3 levels
            put(x, y, z, 'planks');
          }
        } else if (floor === 13) {
          // Crystal penthouse floor
          if (isWall) {
            put(x, y, z, 'crystal_block');
          } else {
            put(x, y, z, 'planks');
          }
        } else if (floor === 14) {
          // Crystal penthouse walls
          if (isWall) {
            put(x, y, z, 'crystal_block');
          }
        } else if (floor === HEIGHT) {
          // Glass roof
          put(x, y, z, 'glass');
        }
      }
    }

    // Torch lighting on interior floors
    if (floor === 2 || floor === 5 || floor === 8 || floor === 11) {
      put(x1 + 2, y, z1 + 2, 'torch');
      put(x2 - 2, y, z1 + 2, 'torch');
      put(x1 + 2, y, z2 - 2, 'torch');
      put(x2 - 2, y, z2 - 2, 'torch');
    }
  }

  // Rooftop helipad: base_block pad with gold "H"
  const roofY = G + HEIGHT + 1;
  for (let x = 62; x <= 66; x++) {
    for (let z = 62; z <= 66; z++) {
      put(x, roofY, z, 'base_block');
    }
  }
  // Gold "H" shape
  put(62, roofY + 1, 62, 'gold_block');
  put(62, roofY + 1, 63, 'gold_block');
  put(62, roofY + 1, 64, 'gold_block');
  put(62, roofY + 1, 65, 'gold_block');
  put(62, roofY + 1, 66, 'gold_block');
  put(66, roofY + 1, 62, 'gold_block');
  put(66, roofY + 1, 63, 'gold_block');
  put(66, roofY + 1, 64, 'gold_block');
  put(66, roofY + 1, 65, 'gold_block');
  put(66, roofY + 1, 66, 'gold_block');
  put(64, roofY + 1, 64, 'gold_block');
  put(63, roofY + 1, 64, 'gold_block');
  put(65, roofY + 1, 64, 'gold_block');

  // Sign pillar outside entrance
  for (let dy = 1; dy <= 5; dy++) put(57, G + dy, 58, 'base_block');
  put(57, G + 6, 58, 'torch');
}

// ---------------------------------------------------------------------------
// 2. Jesse Pollak's House — 8x8, 6 blocks tall
// ---------------------------------------------------------------------------
function buildJesseHouse(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  G: number,
) {
  const x1 = 44, x2 = 52, z1 = 44, z2 = 52;
  const HEIGHT = 6;

  // Foundation
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      put(x, G, z, 'cobblestone');
    }
  }

  // Walls and interior
  for (let floor = 1; floor <= HEIGHT; floor++) {
    const y = G + floor;
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const isWall = x === x1 || x === x2 || z === z1 || z === z2;

        if (floor === 1) {
          if (isWall) {
            // Front door: cyan_wood frame at z=z1, centered
            if (z === z1 && x >= 47 && x <= 49) {
              put(x, y, z, 'cyan_wood');
            } else {
              put(x, y, z, 'planks');
            }
          } else {
            put(x, y, z, 'planks'); // floor
          }
        } else if (floor <= 5) {
          if (isWall) {
            // Glass windows on floors 2-3
            if (floor <= 3 && (x === x1 || x === x2) && z > z1 + 1 && z < z2 - 1 && z % 2 === 0) {
              put(x, y, z, 'glass');
            } else if (floor <= 3 && (z === z1 || z === z2) && x > x1 + 1 && x < x2 - 1 && x % 2 === 0) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'planks');
            }
          }
        } else {
          // Roof
          put(x, y, z, 'planks');
        }
      }
    }
  }

  // Interior furniture
  put(x1 + 1, G + 1, z1 + 1, 'bookshelf');
  put(x1 + 1, G + 2, z1 + 1, 'bookshelf');
  put(x1 + 2, G + 1, z1 + 1, 'bookshelf');
  put(x2 - 1, G + 1, z2 - 1, 'crafting_table');
  put(x2 - 1, G + 1, z2 - 2, 'furnace');
  put(x2 - 2, G + 1, z2 - 1, 'chest');

  // Torch lighting
  put(x1 + 3, G + 3, z1 + 3, 'torch');
  put(x2 - 3, G + 3, z2 - 3, 'torch');

  // Bricks chimney on corner (x2, z2), 3 tall above roof
  for (let dy = 1; dy <= 3; dy++) {
    put(x2, G + HEIGHT + dy, z2, 'bricks');
  }

  // Garden: ring of leaves and base_blue around house
  for (let x = x1 - 1; x <= x2 + 1; x++) {
    for (let z = z1 - 1; z <= z2 + 1; z++) {
      if (x >= x1 && x <= x2 && z >= z1 && z <= z2) continue; // skip house footprint
      if ((x + z) % 2 === 0) {
        put(x, G, z, 'leaves');
      } else {
        put(x, G, z, 'base_blue');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Brian Armstrong's Mansion — 12x10, 8 blocks tall
// ---------------------------------------------------------------------------
function buildBrianMansion(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  G: number,
) {
  const x1 = 74, x2 = 86, z1 = 44, z2 = 54;
  const HEIGHT = 8;

  // Foundation
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      put(x, G, z, 'cobblestone');
    }
  }

  // Walls
  for (let floor = 1; floor <= HEIGHT; floor++) {
    const y = G + floor;
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const isWall = x === x1 || x === x2 || z === z1 || z === z2;

        if (floor === 1) {
          if (isWall) {
            // Front entrance: z=z1, double door
            if (z === z1 && x >= 79 && x <= 81) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'bricks');
            }
          } else {
            put(x, y, z, 'planks'); // floor
          }
        } else if (floor <= 7) {
          if (isWall) {
            // 2-wide glass windows
            if ((floor === 2 || floor === 3 || floor === 5 || floor === 6) &&
                (x === x1 || x === x2) && z > z1 + 1 && z < z2 - 1 && (z % 3 !== 0)) {
              put(x, y, z, 'glass');
            } else if ((floor === 2 || floor === 3 || floor === 5 || floor === 6) &&
                       (z === z1 || z === z2) && x > x1 + 1 && x < x2 - 1 && (x % 3 !== 0)) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'bricks');
            }
          } else if (floor === 4) {
            // Second floor at level 4
            put(x, y, z, 'planks');
          }
        } else {
          // Roof
          put(x, y, z, 'bricks');
        }
      }
    }
  }

  // Interior: double-height foyer (no floor at level 4 for x=78..82)
  // Remove foyer floor blocks — they were placed above, so re-place as air (skip)
  // Actually, we'll just avoid placing floor in the foyer area by overwriting with nothing.
  // Since we already placed them, let's add the library and vault instead.

  // Bookshelf library wall (interior east wall)
  for (let z = z1 + 1; z <= z1 + 4; z++) {
    put(x2 - 1, G + 1, z, 'bookshelf');
    put(x2 - 1, G + 2, z, 'bookshelf');
    put(x2 - 1, G + 3, z, 'bookshelf');
  }

  // Diamond ore accent wall (vault) — interior south wall
  for (let x = x1 + 1; x <= x1 + 3; x++) {
    put(x, G + 1, z2 - 1, 'diamond_ore');
    put(x, G + 2, z2 - 1, 'diamond_ore');
    put(x, G + 3, z2 - 1, 'diamond_ore');
  }

  // Torch lighting
  put(x1 + 3, G + 3, z1 + 3, 'torch');
  put(x2 - 3, G + 3, z1 + 3, 'torch');
  put(x1 + 3, G + 3, z2 - 3, 'torch');
  put(x2 - 3, G + 3, z2 - 3, 'torch');
  put(x1 + 3, G + 6, z1 + 3, 'torch');
  put(x2 - 3, G + 6, z2 - 3, 'torch');

  // Garage: 4x3 cobblestone structure on east side
  for (let x = x2 + 1; x <= x2 + 4; x++) {
    for (let z = z1; z <= z1 + 2; z++) {
      put(x, G, z, 'cobblestone');
      if (x === x2 + 1 || x === x2 + 4 || z === z1 || z === z1 + 2) {
        put(x, G + 1, z, 'cobblestone');
        put(x, G + 2, z, 'cobblestone');
      }
      put(x, G + 3, z, 'cobblestone'); // roof
    }
  }

  // Pool: 3x5 area south of mansion (z2+1..z2+5, x1+2..x1+4)
  // Glass floor, no water blocks — just leave air above glass
  for (let x = x1 + 2; x <= x1 + 4; x++) {
    for (let z = z2 + 1; z <= z2 + 5; z++) {
      put(x, G - 1, z, 'glass'); // pool floor (one below ground)
      // Cobblestone rim
      if (x === x1 + 2 || x === x1 + 4 || z === z2 + 1 || z === z2 + 5) {
        put(x, G, z, 'cobblestone');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Base Research Lab — 10x8, 7 blocks tall
// ---------------------------------------------------------------------------
function buildResearchLab(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  G: number,
) {
  const x1 = 44, x2 = 54, z1 = 72, z2 = 80;
  const HEIGHT = 7;

  for (let floor = 1; floor <= HEIGHT; floor++) {
    const y = G + floor;
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const isWall = x === x1 || x === x2 || z === z1 || z === z2;

        if (floor === 1) {
          if (isWall) {
            // Entrance at z=z1
            if (z === z1 && x >= 48 && x <= 50) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'royal_brick');
            }
          } else {
            put(x, y, z, 'planks');
          }
        } else if (floor <= 6) {
          if (isWall) {
            // Lots of glass windows
            if (floor >= 2 && floor <= 5 && !(
              (x === x1 && z === z1) || (x === x1 && z === z2) ||
              (x === x2 && z === z1) || (x === x2 && z === z2)
            )) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'royal_brick');
            }
          }
        } else {
          // Flat cobblestone roof
          put(x, y, z, 'cobblestone');
        }
      }
    }
  }

  // Interior: furnaces, crafting tables, chests
  put(x1 + 1, G + 1, z1 + 1, 'furnace');
  put(x1 + 2, G + 1, z1 + 1, 'furnace');
  put(x1 + 1, G + 1, z1 + 2, 'furnace');
  put(x1 + 2, G + 1, z1 + 2, 'furnace');
  put(x2 - 2, G + 1, z1 + 1, 'crafting_table');
  put(x2 - 2, G + 1, z1 + 2, 'crafting_table');
  put(x1 + 1, G + 1, z2 - 1, 'chest');
  put(x1 + 2, G + 1, z2 - 1, 'chest');
  put(x2 - 1, G + 1, z2 - 1, 'chest');
  put(x2 - 2, G + 1, z2 - 1, 'chest');

  // Heavy torch lighting
  put(x1 + 3, G + 3, z1 + 3, 'torch');
  put(x2 - 3, G + 3, z1 + 3, 'torch');
  put(x1 + 3, G + 3, z2 - 3, 'torch');
  put(x2 - 3, G + 3, z2 - 3, 'torch');
  put(x1 + 5, G + 3, z1 + 4, 'torch');
  put(x2 - 5, G + 3, z2 - 4, 'torch');

  // Iron ore antenna tower on roof (5 tall)
  const antX = (x1 + x2) >> 1;
  const antZ = (z1 + z2) >> 1;
  for (let dy = 1; dy <= 5; dy++) {
    put(antX, G + HEIGHT + dy, antZ, 'iron_ore');
  }
}

// ---------------------------------------------------------------------------
// 5. Base Creator Hub — 12x10, 6 blocks tall
// ---------------------------------------------------------------------------
function buildCreatorHub(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  G: number,
) {
  const x1 = 72, x2 = 84, z1 = 72, z2 = 82;
  const HEIGHT = 6;

  for (let floor = 1; floor <= HEIGHT; floor++) {
    const y = G + floor;
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const isWall = x === x1 || x === x2 || z === z1 || z === z2;

        if (floor === 1) {
          if (isWall) {
            // Storefront windows at z=z1
            if (z === z1 && x > x1 + 1 && x < x2 - 1) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'planks');
            }
          } else {
            put(x, y, z, 'planks');
          }
        } else if (floor <= 5) {
          if (isWall) {
            // Glass storefront on z=z1 side
            if (z === z1 && x > x1 + 1 && x < x2 - 1 && floor <= 3) {
              put(x, y, z, 'glass');
            } else {
              put(x, y, z, 'planks');
            }
          }
        } else {
          // Roof
          put(x, y, z, 'planks');
        }
      }
    }
  }

  // Interior: crafting tables and bookshelf walls
  put(x1 + 3, G + 1, z1 + 3, 'crafting_table');
  put(x1 + 6, G + 1, z1 + 3, 'crafting_table');
  put(x1 + 3, G + 1, z1 + 6, 'crafting_table');
  put(x1 + 6, G + 1, z1 + 6, 'crafting_table');

  // Bookshelf walls along interior west side
  for (let z = z1 + 1; z <= z2 - 1; z++) {
    put(x1 + 1, G + 1, z, 'bookshelf');
    put(x1 + 1, G + 2, z, 'bookshelf');
  }

  // Torch lighting
  put(x1 + 4, G + 3, z1 + 4, 'torch');
  put(x2 - 4, G + 3, z1 + 4, 'torch');
  put(x1 + 4, G + 3, z2 - 4, 'torch');
  put(x2 - 4, G + 3, z2 - 4, 'torch');

  // Outdoor seating: cobblestone tables with torch
  const seatingSpots = [[x1 - 2, z1 + 2], [x1 - 2, z1 + 5], [x1 - 2, z1 + 8]];
  for (const [sx, sz] of seatingSpots) {
    put(sx, G + 1, sz, 'cobblestone');
    put(sx, G + 2, sz, 'torch');
  }

  // Sign post outside: cyan_wood pole with base_block on top
  put(x1 - 1, G + 1, z1, 'cyan_wood');
  put(x1 - 1, G + 2, z1, 'cyan_wood');
  put(x1 - 1, G + 3, z1, 'cyan_wood');
  put(x1 - 1, G + 4, z1, 'base_block');
}

export function computeSpawnPoint(_blocks: Block[]): { x: number; y: number; z: number } {
  // Spawn at the Base City plaza, facing Coinbase HQ (south of the plaza)
  return { x: 64 + 0.5, y: 12, z: 60 + 0.5 };
}
