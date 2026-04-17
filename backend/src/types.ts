export type BlockType =
  | 'base_blue'
  | 'deep_blue'
  | 'ice_stone'
  | 'cyan_wood'
  | 'sand_blue'
  | 'royal_brick'
  | 'planks'
  | 'cobblestone'
  | 'crafting_table'
  | 'glass'
  | 'torch'
  | 'iron_ore'
  | 'diamond_ore'
  | 'furnace'
  | 'base_block'
  | 'leaves'
  | 'bedrock'
  | 'gravel'
  | 'coal_ore'
  | 'gold_ore'
  | 'obsidian'
  | 'lava'
  | 'wool'
  | 'bricks'
  | 'bookshelf'
  | 'ladder'
  | 'chest'
  | 'bronze_block'
  | 'silver_block'
  | 'gold_block'
  | 'crystal_block'
  | 'tnt'
  | 'bed'
  | 'campfire'
  | 'farmland'
  | 'wheat'
  | 'oak_door'
  | 'trapdoor'
  | 'brewing_stand'
  | 'noteblock'
  | 'jukebox'
  | 'sign'
  | 'red_wool'
  | 'blue_wool'
  | 'green_wool'
  | 'yellow_wool'
  | 'black_wool'
  | 'lantern'
  | 'fence'
  | 'cactus'
  | 'pumpkin'
  | 'jack_o_lantern'
  | 'mushroom_red'
  | 'mushroom_brown'
  | 'lever'
  | 'anvil'
  | 'enchanting_table'
  | 'hay_bale'
  | 'barrel'
  | 'beacon'
  | 'banner'
  | 'iron_block'
  | 'diamond_block'
  | 'stone_bricks'
  | 'mossy_cobblestone'
  | 'clay'
  | 'terracotta'
  | 'soul_sand'
  | 'glowstone'
  | 'prismarine'
  | 'sea_lantern'
  | 'nether_bricks'
  | 'end_stone'
  | 'nether_portal'
  | 'redstone_lamp'
  | 'sponge'
  | 'melon'
  | 'moss_block'
  | 'vine'
  | 'lily_pad'
  | 'mud'
  | 'birch_wood'
  | 'birch_leaves'
  | 'dark_oak_wood'
  | 'dark_oak_leaves'
  | 'water'
  | 'sugar_cane'
  | 'packed_ice'
  | 'snow_block'
  | 'emerald_ore'
  | 'copper_ore'
  | 'amethyst'
  | 'deepslate'
  | 'calcite';

export const BLOCK_TYPES: BlockType[] = [
  'base_blue', 'deep_blue', 'ice_stone', 'cyan_wood', 'sand_blue',
  'royal_brick', 'planks', 'cobblestone', 'crafting_table',
  'glass', 'torch', 'iron_ore', 'diamond_ore', 'furnace', 'base_block',
  'leaves', 'bedrock', 'gravel', 'coal_ore', 'gold_ore',
  'obsidian', 'lava', 'wool', 'bricks', 'bookshelf', 'ladder', 'chest',
  'bronze_block', 'silver_block', 'gold_block', 'crystal_block',
  'tnt', 'bed', 'campfire', 'farmland', 'wheat',
  'oak_door', 'trapdoor', 'brewing_stand', 'noteblock', 'jukebox', 'sign',
  'red_wool', 'blue_wool', 'green_wool', 'yellow_wool', 'black_wool',
  'lantern', 'fence', 'cactus', 'pumpkin', 'jack_o_lantern',
  'mushroom_red', 'mushroom_brown', 'lever', 'anvil', 'enchanting_table',
  'hay_bale', 'barrel', 'beacon', 'banner',
  'iron_block', 'diamond_block', 'stone_bricks', 'mossy_cobblestone',
  'clay', 'terracotta', 'soul_sand', 'glowstone',
  'prismarine', 'sea_lantern', 'nether_bricks', 'end_stone',
  'nether_portal', 'redstone_lamp', 'sponge', 'melon',
  'moss_block', 'vine', 'lily_pad', 'mud',
  'birch_wood', 'birch_leaves', 'dark_oak_wood', 'dark_oak_leaves',
  'water', 'sugar_cane', 'packed_ice', 'snow_block',
  'emerald_ore', 'copper_ore', 'amethyst', 'deepslate', 'calcite',
];

export interface Block {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  placedBy?: string;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;           // socket id
  username: string;
  walletAddress?: string;
  color: string;        // hex
  x: number;
  y: number;
  z: number;
  rotY: number;
  rotX: number;
  lastWrite: number;    // ms timestamp of last DB write
}

export interface ChatMessage {
  username: string;
  message: string;
  isSystem?: boolean;
  created_at?: string;
}

export const WORLD_SIZE = 128;
export const WORLD_HEIGHT = 64;
export const INITIAL_LOAD_RADIUS = 32;
export const MAX_REACH = 5;
