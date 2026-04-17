// NOTE: Block *type ids* are kept identical to the backend/DB schema
// (`base_blue`, `deep_blue`, etc). Only the rendered colors and labels have
// moved to a Minecraft-style grass/dirt/stone/wood palette — blue did not
// suit the natural-world tone the game is going for. Changing the type ids
// would orphan every block currently stored in Supabase.
export type BlockType =
  | 'base_blue'
  | 'deep_blue'
  | 'ice_stone'
  | 'cyan_wood'
  | 'sand_blue'
  | 'royal_brick'
  | 'planks'
  | 'cobblestone'
  | 'crafting_table';

export const BLOCK_TYPES: BlockType[] = [
  'base_blue',
  'deep_blue',
  'ice_stone',
  'cyan_wood',
  'sand_blue',
  'royal_brick',
  'planks',
  'cobblestone',
  'crafting_table',
];

export interface BlockMeta {
  type: BlockType;
  color: number;       // hex int
  colorStr: string;    // "#RRGGBB"
  label: string;
  emissive?: number;
}

export const BLOCKS: Record<BlockType, BlockMeta> = {
  // Grass green — surface of the default (temperate) biome
  base_blue:   { type: 'base_blue',   color: 0x6aa84f, colorStr: '#6aa84f', label: 'Grass' },
  // Dirt brown — sub-surface layer under grass
  deep_blue:   { type: 'deep_blue',   color: 0x8b5a2b, colorStr: '#8b5a2b', label: 'Dirt' },
  // Snow — surface of the cold biome, light gray-white
  ice_stone:   { type: 'ice_stone',   color: 0xdfe6ea, colorStr: '#dfe6ea', label: 'Snow' },
  // Oak wood — tree trunks
  cyan_wood:   { type: 'cyan_wood',   color: 0x6b4a2a, colorStr: '#6b4a2a', label: 'Wood' },
  // Sand tan — surface of the desert biome
  sand_blue:   { type: 'sand_blue',   color: 0xe6d9a1, colorStr: '#e6d9a1', label: 'Sand' },
  // Stone gray — general underground / desert sub-surface
  royal_brick: { type: 'royal_brick', color: 0x7a7a7a, colorStr: '#7a7a7a', label: 'Stone' },
  // Planks — crafted from wood logs
  planks: { type: 'planks', color: 0xc4973a, colorStr: '#c4973a', label: 'Planks' },
  // Cobblestone — dropped when mining stone
  cobblestone: { type: 'cobblestone', color: 0x6a6a6a, colorStr: '#6a6a6a', label: 'Cobblestone' },
  // Crafting table — crafted from planks, enables advanced recipes
  crafting_table: { type: 'crafting_table', color: 0xa67c52, colorStr: '#a67c52', label: 'Crafting Table' },
};
