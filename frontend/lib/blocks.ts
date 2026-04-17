// NOTE: Block *type ids* are kept identical to the backend/DB schema.
// Only the rendered colors and labels reflect the Minecraft-style palette.
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

export interface BlockMeta {
  type: BlockType;
  color: number;       // hex int
  colorStr: string;    // "#RRGGBB"
  label: string;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  unbreakable?: boolean;
  falling?: boolean;     // sand/gravel physics
  climbable?: boolean;   // ladder
  damageOnTouch?: number; // lava
}

export const BLOCKS: Record<BlockType, BlockMeta> = {
  base_blue:      { type: 'base_blue',      color: 0x6aa84f, colorStr: '#6aa84f', label: 'Grass' },
  deep_blue:      { type: 'deep_blue',      color: 0x8b5a2b, colorStr: '#8b5a2b', label: 'Dirt' },
  ice_stone:      { type: 'ice_stone',      color: 0xdfe6ea, colorStr: '#dfe6ea', label: 'Snow' },
  cyan_wood:      { type: 'cyan_wood',      color: 0x6b4a2a, colorStr: '#6b4a2a', label: 'Wood' },
  sand_blue:      { type: 'sand_blue',      color: 0xe6d9a1, colorStr: '#e6d9a1', label: 'Sand', falling: true },
  royal_brick:    { type: 'royal_brick',    color: 0x7a7a7a, colorStr: '#7a7a7a', label: 'Stone' },
  planks:         { type: 'planks',         color: 0xc4973a, colorStr: '#c4973a', label: 'Planks' },
  cobblestone:    { type: 'cobblestone',    color: 0x6a6a6a, colorStr: '#6a6a6a', label: 'Cobblestone' },
  crafting_table: { type: 'crafting_table', color: 0xa67c52, colorStr: '#a67c52', label: 'Crafting Table' },
  glass:          { type: 'glass',          color: 0xc8e8f8, colorStr: '#c8e8f8', label: 'Glass', transparent: true },
  torch:          { type: 'torch',          color: 0xffcc44, colorStr: '#ffcc44', label: 'Torch', emissive: 0xffaa22, emissiveIntensity: 0.8 },
  iron_ore:       { type: 'iron_ore',       color: 0x8a7a6a, colorStr: '#8a7a6a', label: 'Iron Ore' },
  diamond_ore:    { type: 'diamond_ore',    color: 0x5aaca8, colorStr: '#5aaca8', label: 'Diamond Ore' },
  furnace:        { type: 'furnace',        color: 0x5a5a5a, colorStr: '#5a5a5a', label: 'Furnace' },
  base_block:     { type: 'base_block',     color: 0x0052ff, colorStr: '#0052ff', label: 'Base Block', emissive: 0x0033aa, emissiveIntensity: 0.6 },
  // ---- New blocks ----
  leaves:         { type: 'leaves',         color: 0x3a8a2a, colorStr: '#3a8a2a', label: 'Leaves', transparent: true },
  bedrock:        { type: 'bedrock',        color: 0x2a2a2a, colorStr: '#2a2a2a', label: 'Bedrock', unbreakable: true },
  gravel:         { type: 'gravel',         color: 0x8a8080, colorStr: '#8a8080', label: 'Gravel', falling: true },
  coal_ore:       { type: 'coal_ore',       color: 0x3a3a3a, colorStr: '#3a3a3a', label: 'Coal Ore' },
  gold_ore:       { type: 'gold_ore',       color: 0xc8a832, colorStr: '#c8a832', label: 'Gold Ore' },
  obsidian:       { type: 'obsidian',       color: 0x1a0a2a, colorStr: '#1a0a2a', label: 'Obsidian' },
  lava:           { type: 'lava',           color: 0xe85a10, colorStr: '#e85a10', label: 'Lava', emissive: 0xe84010, emissiveIntensity: 0.9, damageOnTouch: 4 },
  wool:           { type: 'wool',           color: 0xf0f0f0, colorStr: '#f0f0f0', label: 'Wool' },
  bricks:         { type: 'bricks',         color: 0x9a4a3a, colorStr: '#9a4a3a', label: 'Bricks' },
  bookshelf:      { type: 'bookshelf',      color: 0x8a6a3a, colorStr: '#8a6a3a', label: 'Bookshelf' },
  ladder:         { type: 'ladder',         color: 0xb08a50, colorStr: '#b08a50', label: 'Ladder', climbable: true },
  chest:          { type: 'chest',          color: 0x9a7a3a, colorStr: '#9a7a3a', label: 'Chest' },
  // ---- Tier-gated blocks ----
  bronze_block:   { type: 'bronze_block',   color: 0xcd7f32, colorStr: '#cd7f32', label: 'Bronze Block', emissive: 0xcd7f32, emissiveIntensity: 0.3 },
  silver_block:   { type: 'silver_block',   color: 0xc0c0c0, colorStr: '#c0c0c0', label: 'Silver Block', emissive: 0xc0c0c0, emissiveIntensity: 0.3 },
  gold_block:     { type: 'gold_block',     color: 0xffd700, colorStr: '#ffd700', label: 'Gold Block', emissive: 0xffd700, emissiveIntensity: 0.4 },
  crystal_block:  { type: 'crystal_block',  color: 0xb9f2ff, colorStr: '#b9f2ff', label: 'Crystal Block', emissive: 0xb9f2ff, emissiveIntensity: 0.5 },
  // ---- New blocks ----
  tnt:            { type: 'tnt',            color: 0xcc2222, colorStr: '#cc2222', label: 'TNT' },
  bed:            { type: 'bed',            color: 0xaa2222, colorStr: '#aa2222', label: 'Bed' },
  campfire:       { type: 'campfire',       color: 0xd4651a, colorStr: '#d4651a', label: 'Campfire', emissive: 0xff6600, emissiveIntensity: 0.7 },
  farmland:       { type: 'farmland',       color: 0x5a3a1a, colorStr: '#5a3a1a', label: 'Farmland' },
  wheat:          { type: 'wheat',          color: 0xd4b830, colorStr: '#d4b830', label: 'Wheat', transparent: true },
  // ---- Doors, interactive, decorative ----
  oak_door:       { type: 'oak_door',       color: 0xb08a50, colorStr: '#b08a50', label: 'Oak Door' },
  trapdoor:       { type: 'trapdoor',       color: 0x9a7a40, colorStr: '#9a7a40', label: 'Trapdoor' },
  brewing_stand:  { type: 'brewing_stand',  color: 0x6a5a4a, colorStr: '#6a5a4a', label: 'Brewing Stand' },
  noteblock:      { type: 'noteblock',      color: 0x8a5a3a, colorStr: '#8a5a3a', label: 'Note Block' },
  jukebox:        { type: 'jukebox',        color: 0x7a4a2a, colorStr: '#7a4a2a', label: 'Jukebox' },
  sign:           { type: 'sign',           color: 0xc4973a, colorStr: '#c4973a', label: 'Sign' },
  // ---- Colored wool ----
  red_wool:       { type: 'red_wool',       color: 0xcc3333, colorStr: '#cc3333', label: 'Red Wool' },
  blue_wool:      { type: 'blue_wool',      color: 0x3355cc, colorStr: '#3355cc', label: 'Blue Wool' },
  green_wool:     { type: 'green_wool',     color: 0x33aa33, colorStr: '#33aa33', label: 'Green Wool' },
  yellow_wool:    { type: 'yellow_wool',    color: 0xddcc33, colorStr: '#ddcc33', label: 'Yellow Wool' },
  black_wool:     { type: 'black_wool',     color: 0x222222, colorStr: '#222222', label: 'Black Wool' },
  // ---- New blocks: Batch 3 ----
  lantern:          { type: 'lantern',          color: 0xffaa33, colorStr: '#ffaa33', label: 'Lantern', emissive: 0xff8811, emissiveIntensity: 0.9 },
  fence:            { type: 'fence',            color: 0xb08a50, colorStr: '#b08a50', label: 'Fence' },
  cactus:           { type: 'cactus',           color: 0x2a8a2a, colorStr: '#2a8a2a', label: 'Cactus', damageOnTouch: 1 },
  pumpkin:          { type: 'pumpkin',          color: 0xe08020, colorStr: '#e08020', label: 'Pumpkin' },
  jack_o_lantern:   { type: 'jack_o_lantern',   color: 0xf0a020, colorStr: '#f0a020', label: "Jack o'Lantern", emissive: 0xff8800, emissiveIntensity: 0.7 },
  mushroom_red:     { type: 'mushroom_red',     color: 0xcc2222, colorStr: '#cc2222', label: 'Red Mushroom', transparent: true },
  mushroom_brown:   { type: 'mushroom_brown',   color: 0x8a6a4a, colorStr: '#8a6a4a', label: 'Brown Mushroom', transparent: true },
  lever:            { type: 'lever',            color: 0x7a6a5a, colorStr: '#7a6a5a', label: 'Lever' },
  anvil:            { type: 'anvil',            color: 0x4a4a4a, colorStr: '#4a4a4a', label: 'Anvil' },
  enchanting_table: { type: 'enchanting_table', color: 0x2a1a4a, colorStr: '#2a1a4a', label: 'Enchanting Table', emissive: 0x6622aa, emissiveIntensity: 0.5 },
  hay_bale:         { type: 'hay_bale',         color: 0xd4a830, colorStr: '#d4a830', label: 'Hay Bale' },
  barrel:           { type: 'barrel',           color: 0x8a6a3a, colorStr: '#8a6a3a', label: 'Barrel' },
  beacon:           { type: 'beacon',           color: 0xaaffee, colorStr: '#aaffee', label: 'Beacon', emissive: 0x88ffdd, emissiveIntensity: 0.8 },
  banner:           { type: 'banner',           color: 0xcc3333, colorStr: '#cc3333', label: 'Banner' },
  // ---- Batch 5: Essential Minecraft blocks ----
  iron_block:       { type: 'iron_block',       color: 0xd8d8d8, colorStr: '#d8d8d8', label: 'Iron Block' },
  diamond_block:    { type: 'diamond_block',    color: 0x4de8e0, colorStr: '#4de8e0', label: 'Diamond Block', emissive: 0x2ac8c0, emissiveIntensity: 0.3 },
  stone_bricks:     { type: 'stone_bricks',     color: 0x7a7a7a, colorStr: '#7a7a7a', label: 'Stone Bricks' },
  mossy_cobblestone:{ type: 'mossy_cobblestone', color: 0x5a6a4a, colorStr: '#5a6a4a', label: 'Mossy Cobblestone' },
  clay:             { type: 'clay',             color: 0xa0a0b4, colorStr: '#a0a0b4', label: 'Clay' },
  terracotta:       { type: 'terracotta',       color: 0xb46240, colorStr: '#b46240', label: 'Terracotta' },
  soul_sand:        { type: 'soul_sand',        color: 0x4a3a2a, colorStr: '#4a3a2a', label: 'Soul Sand' },
  glowstone:        { type: 'glowstone',        color: 0xf0d070, colorStr: '#f0d070', label: 'Glowstone', emissive: 0xf0c040, emissiveIntensity: 0.9 },
  prismarine:       { type: 'prismarine',       color: 0x5aaa8a, colorStr: '#5aaa8a', label: 'Prismarine' },
  sea_lantern:      { type: 'sea_lantern',      color: 0xc8e8f8, colorStr: '#c8e8f8', label: 'Sea Lantern', emissive: 0xb0d8f0, emissiveIntensity: 0.85 },
  nether_bricks:    { type: 'nether_bricks',    color: 0x3a1a1a, colorStr: '#3a1a1a', label: 'Nether Bricks' },
  end_stone:        { type: 'end_stone',        color: 0xe8e8a0, colorStr: '#e8e8a0', label: 'End Stone' },
  nether_portal:    { type: 'nether_portal',    color: 0x6a1aaa, colorStr: '#6a1aaa', label: 'Nether Portal', emissive: 0x8020cc, emissiveIntensity: 0.9, transparent: true },
  redstone_lamp:    { type: 'redstone_lamp',    color: 0xc85a2a, colorStr: '#c85a2a', label: 'Redstone Lamp', emissive: 0xcc4400, emissiveIntensity: 0.7 },
  sponge:           { type: 'sponge',           color: 0xc8c850, colorStr: '#c8c850', label: 'Sponge' },
  melon:            { type: 'melon',            color: 0x4a8a20, colorStr: '#4a8a20', label: 'Melon' },
  // ---- Batch 9: Biome diversity blocks ----
  moss_block:       { type: 'moss_block',       color: 0x4a7a30, colorStr: '#4a7a30', label: 'Moss Block' },
  vine:             { type: 'vine',             color: 0x2a6a1a, colorStr: '#2a6a1a', label: 'Vine', transparent: true, climbable: true },
  lily_pad:         { type: 'lily_pad',         color: 0x2a8a2a, colorStr: '#2a8a2a', label: 'Lily Pad', transparent: true },
  mud:              { type: 'mud',              color: 0x4a3a28, colorStr: '#4a3a28', label: 'Mud' },
  birch_wood:       { type: 'birch_wood',       color: 0xd8ccaa, colorStr: '#d8ccaa', label: 'Birch Wood' },
  birch_leaves:     { type: 'birch_leaves',     color: 0x68a838, colorStr: '#68a838', label: 'Birch Leaves', transparent: true },
  dark_oak_wood:    { type: 'dark_oak_wood',    color: 0x3a2a1a, colorStr: '#3a2a1a', label: 'Dark Oak Wood' },
  dark_oak_leaves:  { type: 'dark_oak_leaves',  color: 0x2a5a1a, colorStr: '#2a5a1a', label: 'Dark Oak Leaves', transparent: true },
  water:            { type: 'water',            color: 0x3a6acc, colorStr: '#3a6acc', label: 'Water', transparent: true },
  sugar_cane:       { type: 'sugar_cane',       color: 0x6aba4a, colorStr: '#6aba4a', label: 'Sugar Cane', transparent: true },
  packed_ice:       { type: 'packed_ice',       color: 0x8ab8e8, colorStr: '#8ab8e8', label: 'Packed Ice' },
  snow_block:       { type: 'snow_block',       color: 0xf0f0ff, colorStr: '#f0f0ff', label: 'Snow Block' },
  emerald_ore:      { type: 'emerald_ore',      color: 0x4aaa5a, colorStr: '#4aaa5a', label: 'Emerald Ore' },
  copper_ore:       { type: 'copper_ore',       color: 0xba6a3a, colorStr: '#ba6a3a', label: 'Copper Ore' },
  amethyst:         { type: 'amethyst',         color: 0x8a4aaa, colorStr: '#8a4aaa', label: 'Amethyst', emissive: 0x7a3aaa, emissiveIntensity: 0.3 },
  deepslate:        { type: 'deepslate',        color: 0x3a3a3a, colorStr: '#3a3a3a', label: 'Deepslate' },
  calcite:          { type: 'calcite',          color: 0xe0dcd0, colorStr: '#e0dcd0', label: 'Calcite' },
};
