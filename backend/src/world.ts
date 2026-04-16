import { supabase } from './supabase';
import { generateWorld, computeSpawnPoint } from './world-gen';
import { Block, BlockType, WORLD_HEIGHT, WORLD_SIZE } from './types';

type Key = string; // "x,y,z"

// Bump this any time world-gen changes in a way that makes stored blocks
// invalid (e.g. new biome scheme, different block types). On startup, if
// the persisted world_meta.version doesn't match, we wipe the blocks table
// and regenerate from scratch. v2 = biomes (plains / desert / snow).
const WORLD_VERSION = 2;

function k(x: number, y: number, z: number): Key {
  return `${x},${y},${z}`;
}

class WorldStore {
  private blocks: Map<Key, Block> = new Map();
  public spawnPoint: { x: number; y: number; z: number } = { x: 64, y: 25, z: 64 };
  private ready = false;

  isReady() {
    return this.ready;
  }

  async init() {
    console.log('[world] Checking if world exists...');
    const { data: meta, error: metaErr } = await supabase
      .from('world_meta')
      .select('*')
      .eq('key', 'generated')
      .maybeSingle();

    if (metaErr) {
      console.error('[world] Meta check failed:', metaErr.message);
    }

    // Legacy rows wrote `{ generated: true }` without a version — treat that
    // as version 1. Anything else is whatever it claims to be.
    const storedVersion: number =
      typeof meta?.value?.version === 'number' ? meta.value.version : meta?.value?.generated ? 1 : 0;
    const alreadyGenerated = !!meta?.value?.generated;
    const versionMatches = alreadyGenerated && storedVersion === WORLD_VERSION;

    if (versionMatches) {
      console.log(`[world] Loading existing blocks from Supabase (v${storedVersion})...`);
      await this.loadFromDb();
    } else {
      if (alreadyGenerated) {
        console.log(
          `[world] Version mismatch (db v${storedVersion}, code v${WORLD_VERSION}). Wiping and regenerating...`,
        );
        // Delete every row. Supabase refuses an unqualified delete, so we
        // filter on a predicate that's always true for real rows.
        const { error: wipeErr } = await supabase.from('blocks').delete().gte('x', -1);
        if (wipeErr) console.error('[world] Wipe failed:', wipeErr.message);
      } else {
        console.log('[world] Generating new world...');
      }
      const generated = generateWorld(1337);
      this.spawnPoint = computeSpawnPoint(generated);
      for (const b of generated) {
        this.blocks.set(k(b.x, b.y, b.z), b);
      }
      await this.persistInitial(generated);
      await supabase.from('world_meta').upsert({
        key: 'generated',
        value: {
          generated: true,
          version: WORLD_VERSION,
          at: new Date().toISOString(),
          spawn: this.spawnPoint,
        },
      });
      console.log(`[world] Generated ${generated.length} blocks (v${WORLD_VERSION}).`);
    }

    // Load spawn from meta (in case world was generated previously)
    const { data: spawnMeta } = await supabase
      .from('world_meta')
      .select('*')
      .eq('key', 'generated')
      .maybeSingle();
    if (spawnMeta?.value?.spawn) {
      this.spawnPoint = spawnMeta.value.spawn;
    }

    this.ready = true;
  }

  private async loadFromDb() {
    // Page through blocks in chunks to avoid row limit
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('blocks')
        .select('x,y,z,block_type,placed_by')
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('[world] Load error:', error.message);
        break;
      }
      if (!data || data.length === 0) break;
      for (const row of data) {
        this.blocks.set(k(row.x, row.y, row.z), {
          x: row.x,
          y: row.y,
          z: row.z,
          type: row.block_type as BlockType,
          placedBy: row.placed_by ?? undefined,
        });
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    console.log(`[world] Loaded ${this.blocks.size} blocks.`);
  }

  private async persistInitial(blocks: Block[]) {
    // Insert in chunks of 500
    const chunk = 500;
    for (let i = 0; i < blocks.length; i += chunk) {
      const slice = blocks.slice(i, i + chunk).map((b) => ({
        x: b.x,
        y: b.y,
        z: b.z,
        block_type: b.type,
        placed_by: null,
      }));
      const { error } = await supabase.from('blocks').upsert(slice, {
        onConflict: 'x,y,z',
      });
      if (error) {
        console.error('[world] Persist chunk error:', error.message);
      }
    }
  }

  get(x: number, y: number, z: number): Block | undefined {
    return this.blocks.get(k(x, y, z));
  }

  has(x: number, y: number, z: number): boolean {
    return this.blocks.has(k(x, y, z));
  }

  all(): Block[] {
    return Array.from(this.blocks.values());
  }

  within(cx: number, cy: number, cz: number, radius: number): Block[] {
    const r2 = radius * radius;
    const out: Block[] = [];
    for (const b of this.blocks.values()) {
      const dx = b.x - cx;
      const dy = b.y - cy;
      const dz = b.z - cz;
      if (dx * dx + dz * dz <= r2 && Math.abs(dy) <= radius) {
        out.push(b);
      }
    }
    return out;
  }

  async place(x: number, y: number, z: number, type: BlockType, username: string): Promise<boolean> {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return false;
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    if (this.has(x, y, z)) return false;
    const b: Block = { x, y, z, type, placedBy: username };
    this.blocks.set(k(x, y, z), b);
    const { error } = await supabase.from('blocks').upsert(
      { x, y, z, block_type: type, placed_by: username, updated_at: new Date().toISOString() },
      { onConflict: 'x,y,z' },
    );
    if (error) console.error('[world] place db err:', error.message);
    return true;
  }

  async remove(x: number, y: number, z: number): Promise<boolean> {
    if (y <= 0) return false; // bedrock protection
    if (!this.has(x, y, z)) return false;
    this.blocks.delete(k(x, y, z));
    const { error } = await supabase
      .from('blocks')
      .delete()
      .match({ x, y, z });
    if (error) console.error('[world] remove db err:', error.message);
    return true;
  }
}

export const world = new WorldStore();
