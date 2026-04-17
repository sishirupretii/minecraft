// Unified item system: blocks, tools, materials, food, armor, ranged.

import { BlockType } from './blocks';

export type ToolType =
  | 'wooden_pickaxe' | 'wooden_axe' | 'wooden_shovel' | 'wooden_sword' | 'wooden_hoe'
  | 'stone_pickaxe'  | 'stone_axe'  | 'stone_shovel'  | 'stone_sword'  | 'stone_hoe'
  | 'copper_pickaxe' | 'copper_axe' | 'copper_shovel' | 'copper_sword' | 'copper_hoe'
  | 'iron_pickaxe'   | 'iron_axe'   | 'iron_shovel'   | 'iron_sword'   | 'iron_hoe'
  | 'diamond_pickaxe' | 'diamond_axe' | 'diamond_shovel' | 'diamond_sword' | 'diamond_hoe'
  | 'shears' | 'bow' | 'fishing_rod' | 'flint_and_steel'
  | 'crossbow';

export type MaterialType =
  | 'stick' | 'iron_ingot' | 'diamond' | 'raw_iron'
  | 'coal' | 'raw_gold' | 'gold_ingot'
  | 'leather' | 'string' | 'bone' | 'gunpowder' | 'spider_eye'
  | 'arrow' | 'flint' | 'wheat_item' | 'seeds'
  | 'bucket' | 'water_bucket' | 'lava_bucket' | 'compass'
  | 'glass_bottle' | 'potion_healing' | 'potion_speed' | 'potion_strength'
  | 'potion_fire_resist' | 'potion_night_vision' | 'potion_jump'
  | 'red_dye' | 'blue_dye' | 'green_dye' | 'yellow_dye' | 'black_dye'
  | 'spyglass'
  | 'emerald' | 'book' | 'enchanted_book'
  | 'ender_pearl' | 'paper' | 'map'
  | 'glowstone_dust' | 'prismarine_shard' | 'nether_wart' | 'ender_eye'
  | 'clay_ball' | 'brick_item' | 'nether_star' | 'blaze_rod' | 'blaze_powder'
  | 'magma_cream' | 'ghast_tear'
  | 'raw_copper' | 'copper_ingot' | 'amethyst_shard' | 'sugar';

export type FoodType =
  | 'beef' | 'porkchop' | 'chicken_meat' | 'rotten_flesh'
  | 'bread' | 'apple' | 'golden_apple' | 'mushroom_stew'
  | 'cooked_porkchop' | 'cooked_chicken' | 'cooked_beef'
  | 'raw_fish' | 'cooked_fish'
  | 'melon_slice' | 'glistering_melon'
  | 'cookie' | 'pumpkin_pie' | 'sweet_berries' | 'dried_kelp';

export type ArmorType =
  | 'leather_helmet' | 'leather_chestplate' | 'leather_leggings' | 'leather_boots'
  | 'iron_helmet'    | 'iron_chestplate'    | 'iron_leggings'    | 'iron_boots'
  | 'diamond_helmet' | 'diamond_chestplate' | 'diamond_leggings' | 'diamond_boots';

export type ShieldType = 'shield';

export type ItemType = BlockType | ToolType | MaterialType | FoodType | ArmorType | ShieldType;

export interface ItemDef {
  id: ItemType;
  label: string;
  color: string;
  stackSize: number;
  isBlock?: boolean;
  isTool?: boolean;
  isFood?: boolean;
  isArmor?: boolean;
  isShield?: boolean;
  isRanged?: boolean;
  foodRestore?: number;
  toolKind?: 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe' | 'shears' | 'bow';
  toolTier?: 'wood' | 'stone' | 'iron' | 'diamond';
  durability?: number;
  breakMultiplier?: Partial<Record<BlockType, number>>;
  attackDamage?: number;
  xpValue?: number;
  walletExclusive?: boolean;
  requiredTier?: string;
  armorSlot?: 'helmet' | 'chestplate' | 'leggings' | 'boots';
  armorDefense?: number;
  ammoType?: ItemType;
  projectileDamage?: number;
}

export interface InventorySlot {
  item: ItemType;
  count: number;
  durability?: number;
}

// Drop map: what item does a block drop when mined?
export const BLOCK_DROPS: Partial<Record<BlockType, ItemType>> = {
  royal_brick: 'cobblestone',
  base_blue: 'deep_blue',
  iron_ore: 'raw_iron',
  diamond_ore: 'diamond',
  coal_ore: 'coal',
  gold_ore: 'raw_gold',
  leaves: 'stick',        // ~50% chance handled in Game.tsx, also drops apple rarely
  gravel: 'flint',        // sometimes drops flint
  bookshelf: 'planks',
  clay: 'clay_ball',
  glowstone: 'glowstone_dust',
  prismarine: 'prismarine_shard',
  melon: 'melon_slice',
  emerald_ore: 'emerald',
  copper_ore: 'raw_copper',
  amethyst: 'amethyst_shard',
  sugar_cane: 'sugar',
  birch_leaves: 'stick',
  dark_oak_leaves: 'stick',
};

export const BLOCK_DROPS_EXTRA: Partial<Record<BlockType, ItemType>> = {
  wheat: 'wheat_item',
  farmland: 'deep_blue',
};

export function getBlockDrop(blockType: BlockType): ItemType {
  return BLOCK_DROPS[blockType] ?? BLOCK_DROPS_EXTRA[blockType] ?? blockType;
}

// XP from mining blocks
export const BLOCK_XP: Partial<Record<BlockType, number>> = {
  royal_brick: 1,
  iron_ore: 5,
  diamond_ore: 10,
  cobblestone: 1,
  cyan_wood: 1,
  coal_ore: 2,
  gold_ore: 7,
  obsidian: 5,
  lava: 0,
  wheat: 2,
  enchanting_table: 5,
  anvil: 3,
  iron_block: 5,
  diamond_block: 10,
  glowstone: 4,
  nether_bricks: 2,
  end_stone: 3,
  prismarine: 3,
  sea_lantern: 4,
  emerald_ore: 8,
  copper_ore: 3,
  amethyst: 4,
  deepslate: 2,
  packed_ice: 2,
};

// Shared break multiplier maps
const PICK_STONE: Partial<Record<BlockType, number>> = {
  royal_brick: 1, cobblestone: 1, ice_stone: 1, iron_ore: 1, furnace: 1,
  coal_ore: 1, gold_ore: 1, bricks: 1, obsidian: 1,
};
const PICK_WOOD_M: Partial<Record<BlockType, number>> = {
  royal_brick: 0.3, cobblestone: 0.35, ice_stone: 0.5, iron_ore: 0.5, furnace: 0.4,
  coal_ore: 0.35, bricks: 0.4, gold_ore: 0.6,
};
const PICK_STONE_M: Partial<Record<BlockType, number>> = {
  royal_brick: 0.2, cobblestone: 0.25, ice_stone: 0.35, iron_ore: 0.35, furnace: 0.3,
  coal_ore: 0.25, bricks: 0.3, gold_ore: 0.4,
};
const PICK_COPPER_M: Partial<Record<BlockType, number>> = {
  royal_brick: 0.18, cobblestone: 0.2, ice_stone: 0.3, iron_ore: 0.3, diamond_ore: 0.5,
  furnace: 0.25, coal_ore: 0.2, gold_ore: 0.35, bricks: 0.25, obsidian: 0.25,
  copper_ore: 0.2, emerald_ore: 0.3, deepslate: 0.25, calcite: 0.2,
};
const PICK_IRON_M: Partial<Record<BlockType, number>> = {
  royal_brick: 0.15, cobblestone: 0.18, ice_stone: 0.25, iron_ore: 0.25, diamond_ore: 0.3,
  furnace: 0.2, coal_ore: 0.18, gold_ore: 0.25, bricks: 0.2, obsidian: 0.15,
};
const PICK_DIAMOND_M: Partial<Record<BlockType, number>> = {
  royal_brick: 0.1, cobblestone: 0.12, ice_stone: 0.15, iron_ore: 0.15, diamond_ore: 0.2,
  furnace: 0.12, coal_ore: 0.1, gold_ore: 0.15, bricks: 0.12, obsidian: 0.08,
};
const AXE_WOOD: Partial<Record<BlockType, number>> = {
  cyan_wood: 1, planks: 1, crafting_table: 1, bookshelf: 1, chest: 1, ladder: 1,
};
const SHOVEL_DIRT: Partial<Record<BlockType, number>> = {
  deep_blue: 1, sand_blue: 1, base_blue: 1, gravel: 1,
};

export const ITEMS: Record<ItemType, ItemDef> = {
  // ---- Blocks ----
  base_blue:      { id: 'base_blue',      label: 'Grass',          color: '#6aa84f', stackSize: 64, isBlock: true },
  deep_blue:      { id: 'deep_blue',      label: 'Dirt',           color: '#8b5a2b', stackSize: 64, isBlock: true },
  ice_stone:      { id: 'ice_stone',      label: 'Snow',           color: '#dfe6ea', stackSize: 64, isBlock: true },
  cyan_wood:      { id: 'cyan_wood',      label: 'Wood',           color: '#6b4a2a', stackSize: 64, isBlock: true },
  sand_blue:      { id: 'sand_blue',      label: 'Sand',           color: '#e6d9a1', stackSize: 64, isBlock: true },
  royal_brick:    { id: 'royal_brick',    label: 'Stone',          color: '#7a7a7a', stackSize: 64, isBlock: true },
  planks:         { id: 'planks',         label: 'Planks',         color: '#c4973a', stackSize: 64, isBlock: true },
  cobblestone:    { id: 'cobblestone',    label: 'Cobblestone',    color: '#6a6a6a', stackSize: 64, isBlock: true },
  crafting_table: { id: 'crafting_table', label: 'Crafting Table', color: '#a67c52', stackSize: 64, isBlock: true },
  glass:          { id: 'glass',          label: 'Glass',          color: '#c8e8f8', stackSize: 64, isBlock: true },
  torch:          { id: 'torch',          label: 'Torch',          color: '#ffcc44', stackSize: 64, isBlock: true },
  iron_ore:       { id: 'iron_ore',       label: 'Iron Ore',      color: '#8a7a6a', stackSize: 64, isBlock: true },
  diamond_ore:    { id: 'diamond_ore',    label: 'Diamond Ore',   color: '#5aaca8', stackSize: 64, isBlock: true },
  furnace:        { id: 'furnace',        label: 'Furnace',       color: '#5a5a5a', stackSize: 64, isBlock: true },
  base_block:     { id: 'base_block',     label: 'Base Block',    color: '#0052ff', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'base' },
  leaves:         { id: 'leaves',         label: 'Leaves',        color: '#3a8a2a', stackSize: 64, isBlock: true },
  bedrock:        { id: 'bedrock',        label: 'Bedrock',       color: '#2a2a2a', stackSize: 64, isBlock: true },
  gravel:         { id: 'gravel',         label: 'Gravel',        color: '#8a8080', stackSize: 64, isBlock: true },
  coal_ore:       { id: 'coal_ore',       label: 'Coal Ore',      color: '#3a3a3a', stackSize: 64, isBlock: true },
  gold_ore:       { id: 'gold_ore',       label: 'Gold Ore',      color: '#c8a832', stackSize: 64, isBlock: true },
  obsidian:       { id: 'obsidian',       label: 'Obsidian',      color: '#1a0a2a', stackSize: 64, isBlock: true },
  lava:           { id: 'lava',           label: 'Lava',          color: '#e85a10', stackSize: 64, isBlock: true },
  wool:           { id: 'wool',           label: 'Wool',          color: '#f0f0f0', stackSize: 64, isBlock: true },
  bricks:         { id: 'bricks',         label: 'Bricks',        color: '#9a4a3a', stackSize: 64, isBlock: true },
  bookshelf:      { id: 'bookshelf',      label: 'Bookshelf',     color: '#8a6a3a', stackSize: 64, isBlock: true },
  ladder:         { id: 'ladder',         label: 'Ladder',        color: '#b08a50', stackSize: 64, isBlock: true },
  chest:          { id: 'chest',          label: 'Chest',         color: '#9a7a3a', stackSize: 64, isBlock: true },
  // ---- Tier-gated blocks ----
  bronze_block:   { id: 'bronze_block',   label: 'Bronze Block',   color: '#cd7f32', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'bronze' },
  silver_block:   { id: 'silver_block',   label: 'Silver Block',   color: '#c0c0c0', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'silver' },
  gold_block:     { id: 'gold_block',     label: 'Gold Block',     color: '#ffd700', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'gold' },
  crystal_block:  { id: 'crystal_block',  label: 'Crystal Block',  color: '#b9f2ff', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'diamond' },
  // ---- New blocks ----
  tnt:            { id: 'tnt',            label: 'TNT',            color: '#cc2222', stackSize: 64, isBlock: true },
  bed:            { id: 'bed',            label: 'Bed',            color: '#aa2222', stackSize: 1,  isBlock: true },
  campfire:       { id: 'campfire',       label: 'Campfire',       color: '#d4651a', stackSize: 64, isBlock: true },
  farmland:       { id: 'farmland',       label: 'Farmland',       color: '#5a3a1a', stackSize: 64, isBlock: true },
  wheat:          { id: 'wheat',          label: 'Wheat',          color: '#d4b830', stackSize: 64, isBlock: true },
  // ---- Doors, interactive, decorative blocks ----
  oak_door:       { id: 'oak_door',       label: 'Oak Door',       color: '#b08a50', stackSize: 64, isBlock: true },
  trapdoor:       { id: 'trapdoor',       label: 'Trapdoor',       color: '#9a7a40', stackSize: 64, isBlock: true },
  brewing_stand:  { id: 'brewing_stand',  label: 'Brewing Stand',  color: '#6a5a4a', stackSize: 64, isBlock: true },
  noteblock:      { id: 'noteblock',      label: 'Note Block',     color: '#8a5a3a', stackSize: 64, isBlock: true },
  jukebox:        { id: 'jukebox',        label: 'Jukebox',        color: '#7a4a2a', stackSize: 64, isBlock: true },
  sign:           { id: 'sign',           label: 'Sign',           color: '#c4973a', stackSize: 16, isBlock: true },
  // ---- Colored wool blocks ----
  red_wool:       { id: 'red_wool',       label: 'Red Wool',       color: '#cc3333', stackSize: 64, isBlock: true },
  blue_wool:      { id: 'blue_wool',      label: 'Blue Wool',      color: '#3355cc', stackSize: 64, isBlock: true },
  green_wool:     { id: 'green_wool',     label: 'Green Wool',     color: '#33aa33', stackSize: 64, isBlock: true },
  yellow_wool:    { id: 'yellow_wool',    label: 'Yellow Wool',    color: '#ddcc33', stackSize: 64, isBlock: true },
  black_wool:     { id: 'black_wool',     label: 'Black Wool',     color: '#222222', stackSize: 64, isBlock: true },
  // ---- New blocks: Batch 3 ----
  lantern:          { id: 'lantern',          label: 'Lantern',          color: '#ffaa33', stackSize: 64, isBlock: true },
  fence:            { id: 'fence',            label: 'Fence',            color: '#b08a50', stackSize: 64, isBlock: true },
  cactus:           { id: 'cactus',           label: 'Cactus',           color: '#2a8a2a', stackSize: 64, isBlock: true },
  pumpkin:          { id: 'pumpkin',          label: 'Pumpkin',          color: '#e08020', stackSize: 64, isBlock: true },
  jack_o_lantern:   { id: 'jack_o_lantern',   label: "Jack o'Lantern",   color: '#f0a020', stackSize: 64, isBlock: true },
  mushroom_red:     { id: 'mushroom_red',     label: 'Red Mushroom',     color: '#cc2222', stackSize: 64, isBlock: true },
  mushroom_brown:   { id: 'mushroom_brown',   label: 'Brown Mushroom',   color: '#8a6a4a', stackSize: 64, isBlock: true },
  lever:            { id: 'lever',            label: 'Lever',            color: '#7a6a5a', stackSize: 64, isBlock: true },
  anvil:            { id: 'anvil',            label: 'Anvil',            color: '#4a4a4a', stackSize: 64, isBlock: true },
  enchanting_table: { id: 'enchanting_table', label: 'Enchanting Table', color: '#2a1a4a', stackSize: 64, isBlock: true },
  hay_bale:   { id: 'hay_bale',   label: 'Hay Bale',   color: '#d4a830', stackSize: 64, isBlock: true },
  barrel:     { id: 'barrel',     label: 'Barrel',     color: '#8a6a3a', stackSize: 64, isBlock: true },
  beacon:     { id: 'beacon',     label: 'Beacon',     color: '#aaffee', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'bronze' },
  banner:     { id: 'banner',     label: 'Banner',     color: '#cc3333', stackSize: 16, isBlock: true },
  // ---- Batch 5 blocks ----
  iron_block:       { id: 'iron_block',       label: 'Iron Block',       color: '#d8d8d8', stackSize: 64, isBlock: true },
  diamond_block:    { id: 'diamond_block',    label: 'Diamond Block',    color: '#4de8e0', stackSize: 64, isBlock: true },
  stone_bricks:     { id: 'stone_bricks',     label: 'Stone Bricks',     color: '#7a7a7a', stackSize: 64, isBlock: true },
  mossy_cobblestone:{ id: 'mossy_cobblestone', label: 'Mossy Cobblestone',color: '#5a6a4a', stackSize: 64, isBlock: true },
  clay:             { id: 'clay',             label: 'Clay',             color: '#a0a0b4', stackSize: 64, isBlock: true },
  terracotta:       { id: 'terracotta',       label: 'Terracotta',       color: '#b46240', stackSize: 64, isBlock: true },
  soul_sand:        { id: 'soul_sand',        label: 'Soul Sand',        color: '#4a3a2a', stackSize: 64, isBlock: true },
  glowstone:        { id: 'glowstone',        label: 'Glowstone',        color: '#f0d070', stackSize: 64, isBlock: true },
  prismarine:       { id: 'prismarine',       label: 'Prismarine',       color: '#5aaa8a', stackSize: 64, isBlock: true },
  sea_lantern:      { id: 'sea_lantern',      label: 'Sea Lantern',      color: '#c8e8f8', stackSize: 64, isBlock: true },
  nether_bricks:    { id: 'nether_bricks',    label: 'Nether Bricks',    color: '#3a1a1a', stackSize: 64, isBlock: true },
  end_stone:        { id: 'end_stone',        label: 'End Stone',        color: '#e8e8a0', stackSize: 64, isBlock: true },
  nether_portal:    { id: 'nether_portal',    label: 'Nether Portal',    color: '#6a1aaa', stackSize: 64, isBlock: true, walletExclusive: true, requiredTier: 'silver' },
  redstone_lamp:    { id: 'redstone_lamp',    label: 'Redstone Lamp',    color: '#c85a2a', stackSize: 64, isBlock: true },
  sponge:           { id: 'sponge',           label: 'Sponge',           color: '#c8c850', stackSize: 64, isBlock: true },
  melon:            { id: 'melon',            label: 'Melon',            color: '#4a8a20', stackSize: 64, isBlock: true },
  // ---- Batch 9: Biome blocks ----
  moss_block:       { id: 'moss_block',       label: 'Moss Block',       color: '#4a7a30', stackSize: 64, isBlock: true },
  vine:             { id: 'vine',             label: 'Vine',             color: '#2a6a1a', stackSize: 64, isBlock: true },
  lily_pad:         { id: 'lily_pad',         label: 'Lily Pad',         color: '#2a8a2a', stackSize: 64, isBlock: true },
  mud:              { id: 'mud',              label: 'Mud',              color: '#4a3a28', stackSize: 64, isBlock: true },
  birch_wood:       { id: 'birch_wood',       label: 'Birch Wood',       color: '#d8ccaa', stackSize: 64, isBlock: true },
  birch_leaves:     { id: 'birch_leaves',     label: 'Birch Leaves',     color: '#68a838', stackSize: 64, isBlock: true },
  dark_oak_wood:    { id: 'dark_oak_wood',    label: 'Dark Oak Wood',    color: '#3a2a1a', stackSize: 64, isBlock: true },
  dark_oak_leaves:  { id: 'dark_oak_leaves',  label: 'Dark Oak Leaves',  color: '#2a5a1a', stackSize: 64, isBlock: true },
  water:            { id: 'water',            label: 'Water',            color: '#3a6acc', stackSize: 64, isBlock: true },
  sugar_cane:       { id: 'sugar_cane',       label: 'Sugar Cane',       color: '#6aba4a', stackSize: 64, isBlock: true },
  packed_ice:       { id: 'packed_ice',       label: 'Packed Ice',       color: '#8ab8e8', stackSize: 64, isBlock: true },
  snow_block:       { id: 'snow_block',       label: 'Snow Block',       color: '#f0f0ff', stackSize: 64, isBlock: true },
  emerald_ore:      { id: 'emerald_ore',      label: 'Emerald Ore',      color: '#4aaa5a', stackSize: 64, isBlock: true },
  copper_ore:       { id: 'copper_ore',       label: 'Copper Ore',       color: '#ba6a3a', stackSize: 64, isBlock: true },
  amethyst:         { id: 'amethyst',         label: 'Amethyst',         color: '#8a4aaa', stackSize: 64, isBlock: true },
  deepslate:        { id: 'deepslate',        label: 'Deepslate',        color: '#3a3a3a', stackSize: 64, isBlock: true },
  calcite:          { id: 'calcite',          label: 'Calcite',          color: '#e0dcd0', stackSize: 64, isBlock: true },

  // ---- Materials ----
  stick:      { id: 'stick',      label: 'Stick',       color: '#b8924a', stackSize: 64 },
  raw_iron:   { id: 'raw_iron',   label: 'Raw Iron',    color: '#c4a882', stackSize: 64 },
  iron_ingot: { id: 'iron_ingot', label: 'Iron Ingot',  color: '#d4d4d4', stackSize: 64 },
  diamond:    { id: 'diamond',    label: 'Diamond',     color: '#4de8e0', stackSize: 64 },
  coal:       { id: 'coal',       label: 'Coal',        color: '#2a2a2a', stackSize: 64 },
  raw_gold:   { id: 'raw_gold',   label: 'Raw Gold',    color: '#d4a832', stackSize: 64 },
  gold_ingot: { id: 'gold_ingot', label: 'Gold Ingot',  color: '#f0c830', stackSize: 64 },
  leather:    { id: 'leather',    label: 'Leather',     color: '#8a5a2a', stackSize: 64 },
  string:     { id: 'string',     label: 'String',      color: '#e0e0e0', stackSize: 64 },
  bone:       { id: 'bone',       label: 'Bone',        color: '#e8e0d0', stackSize: 64 },
  gunpowder:  { id: 'gunpowder',  label: 'Gunpowder',   color: '#5a5a5a', stackSize: 64 },
  spider_eye: { id: 'spider_eye', label: 'Spider Eye',  color: '#8a2a2a', stackSize: 64 },
  arrow:      { id: 'arrow',      label: 'Arrow',       color: '#b8924a', stackSize: 64 },
  flint:      { id: 'flint',      label: 'Flint',       color: '#4a4a4a', stackSize: 64 },
  wheat_item: { id: 'wheat_item', label: 'Wheat',       color: '#d4b830', stackSize: 64 },
  seeds:      { id: 'seeds',      label: 'Seeds',       color: '#5a8a2a', stackSize: 64 },
  bucket:     { id: 'bucket',     label: 'Bucket',      color: '#a0a0a0', stackSize: 16 },
  water_bucket:{ id: 'water_bucket', label: 'Water Bucket', color: '#3a7ad4', stackSize: 1 },
  lava_bucket: { id: 'lava_bucket',  label: 'Lava Bucket',  color: '#e85a10', stackSize: 1 },
  compass:    { id: 'compass',    label: 'Compass',     color: '#d4d4d4', stackSize: 1 },
  // ---- Potions & brewing ----
  glass_bottle:       { id: 'glass_bottle',       label: 'Glass Bottle',       color: '#c8e8f8', stackSize: 16 },
  potion_healing:     { id: 'potion_healing',     label: 'Healing Potion',     color: '#ff4444', stackSize: 1 },
  potion_speed:       { id: 'potion_speed',       label: 'Speed Potion',       color: '#44ccff', stackSize: 1 },
  potion_strength:    { id: 'potion_strength',    label: 'Strength Potion',    color: '#cc2222', stackSize: 1 },
  potion_fire_resist: { id: 'potion_fire_resist', label: 'Fire Resist Potion', color: '#ff8800', stackSize: 1 },
  potion_night_vision:{ id: 'potion_night_vision',label: 'Night Vision Potion',color: '#2244aa', stackSize: 1 },
  potion_jump:        { id: 'potion_jump',        label: 'Jump Potion',        color: '#44ff44', stackSize: 1 },
  // ---- Dyes ----
  red_dye:    { id: 'red_dye',    label: 'Red Dye',    color: '#cc3333', stackSize: 64 },
  blue_dye:   { id: 'blue_dye',   label: 'Blue Dye',   color: '#3355cc', stackSize: 64 },
  green_dye:  { id: 'green_dye',  label: 'Green Dye',  color: '#33aa33', stackSize: 64 },
  yellow_dye: { id: 'yellow_dye', label: 'Yellow Dye', color: '#ddcc33', stackSize: 64 },
  black_dye:  { id: 'black_dye',  label: 'Black Dye',  color: '#222222', stackSize: 64 },
  // ---- Spyglass ----
  spyglass:   { id: 'spyglass',   label: 'Spyglass',   color: '#c4973a', stackSize: 1 },
  // ---- Trading & enchanting materials ----
  emerald:        { id: 'emerald',        label: 'Emerald',        color: '#2dcc2d', stackSize: 64 },
  book:           { id: 'book',           label: 'Book',           color: '#8a5a2a', stackSize: 64 },
  enchanted_book: { id: 'enchanted_book', label: 'Enchanted Book', color: '#aa44ff', stackSize: 1 },
  ender_pearl:    { id: 'ender_pearl',    label: 'Ender Pearl',    color: '#0a4a3a', stackSize: 16 },
  paper:          { id: 'paper',          label: 'Paper',          color: '#f0f0e0', stackSize: 64 },
  map:            { id: 'map',            label: 'Map',            color: '#c4b890', stackSize: 1 },
  // ---- Batch 5 materials ----
  glowstone_dust:    { id: 'glowstone_dust',    label: 'Glowstone Dust',    color: '#f0d070', stackSize: 64 },
  prismarine_shard:  { id: 'prismarine_shard',  label: 'Prismarine Shard',  color: '#5aaa8a', stackSize: 64 },
  nether_wart:       { id: 'nether_wart',       label: 'Nether Wart',       color: '#6a1a1a', stackSize: 64 },
  ender_eye:         { id: 'ender_eye',         label: 'Eye of Ender',      color: '#1a6a4a', stackSize: 64 },
  clay_ball:         { id: 'clay_ball',         label: 'Clay Ball',         color: '#a0a0b4', stackSize: 64 },
  brick_item:        { id: 'brick_item',        label: 'Brick',             color: '#b04030', stackSize: 64 },
  nether_star:       { id: 'nether_star',       label: 'Nether Star',       color: '#f0f0f0', stackSize: 64, walletExclusive: true, requiredTier: 'gold' },
  blaze_rod:         { id: 'blaze_rod',         label: 'Blaze Rod',         color: '#d4a020', stackSize: 64 },
  blaze_powder:      { id: 'blaze_powder',      label: 'Blaze Powder',      color: '#e8c020', stackSize: 64 },
  magma_cream:       { id: 'magma_cream',       label: 'Magma Cream',       color: '#d48020', stackSize: 64 },
  ghast_tear:        { id: 'ghast_tear',        label: 'Ghast Tear',        color: '#e8e8f0', stackSize: 64 },
  // ---- Batch 9 materials ----
  raw_copper:        { id: 'raw_copper',        label: 'Raw Copper',        color: '#ba6a3a', stackSize: 64 },
  copper_ingot:      { id: 'copper_ingot',      label: 'Copper Ingot',      color: '#d88040', stackSize: 64 },
  amethyst_shard:    { id: 'amethyst_shard',    label: 'Amethyst Shard',    color: '#8a4aaa', stackSize: 64 },
  sugar:             { id: 'sugar',             label: 'Sugar',             color: '#f0f0f0', stackSize: 64 },

  // ---- Food ----
  beef:           { id: 'beef',           label: 'Raw Beef',      color: '#8b4226', stackSize: 64, isFood: true, foodRestore: 3 },
  cooked_beef:    { id: 'cooked_beef',    label: 'Steak',         color: '#6a3020', stackSize: 64, isFood: true, foodRestore: 8 },
  porkchop:       { id: 'porkchop',       label: 'Raw Porkchop',  color: '#d4885a', stackSize: 64, isFood: true, foodRestore: 3 },
  cooked_porkchop:{ id: 'cooked_porkchop',label: 'Cooked Pork',   color: '#b06840', stackSize: 64, isFood: true, foodRestore: 8 },
  chicken_meat:   { id: 'chicken_meat',   label: 'Raw Chicken',   color: '#e8c8a0', stackSize: 64, isFood: true, foodRestore: 2 },
  cooked_chicken: { id: 'cooked_chicken', label: 'Cooked Chicken',color: '#c0a070', stackSize: 64, isFood: true, foodRestore: 6 },
  rotten_flesh:   { id: 'rotten_flesh',   label: 'Rotten Flesh',  color: '#6a4a2a', stackSize: 64, isFood: true, foodRestore: 4 },
  bread:          { id: 'bread',          label: 'Bread',         color: '#c4973a', stackSize: 64, isFood: true, foodRestore: 5 },
  apple:          { id: 'apple',          label: 'Apple',         color: '#e03030', stackSize: 64, isFood: true, foodRestore: 4 },
  golden_apple:   { id: 'golden_apple',   label: 'Golden Apple',  color: '#f0c830', stackSize: 64, isFood: true, foodRestore: 10 },
  mushroom_stew:  { id: 'mushroom_stew',  label: 'Mushroom Stew', color: '#a06030', stackSize: 1, isFood: true, foodRestore: 6 },
  raw_fish:       { id: 'raw_fish',       label: 'Raw Fish',      color: '#6a9ab8', stackSize: 64, isFood: true, foodRestore: 2 },
  cooked_fish:    { id: 'cooked_fish',    label: 'Cooked Fish',   color: '#b08a50', stackSize: 64, isFood: true, foodRestore: 5 },
  melon_slice:    { id: 'melon_slice',    label: 'Melon Slice',   color: '#e05040', stackSize: 64, isFood: true, foodRestore: 2 },
  glistering_melon:{ id: 'glistering_melon', label: 'Glistering Melon', color: '#f0c830', stackSize: 64, isFood: true, foodRestore: 6 },
  cookie:         { id: 'cookie',         label: 'Cookie',        color: '#c4973a', stackSize: 64, isFood: true, foodRestore: 2 },
  pumpkin_pie:    { id: 'pumpkin_pie',    label: 'Pumpkin Pie',   color: '#e08020', stackSize: 64, isFood: true, foodRestore: 8 },
  sweet_berries:  { id: 'sweet_berries',  label: 'Sweet Berries', color: '#cc2244', stackSize: 64, isFood: true, foodRestore: 2 },
  dried_kelp:     { id: 'dried_kelp',     label: 'Dried Kelp',    color: '#2a5a2a', stackSize: 64, isFood: true, foodRestore: 1 },

  // ---- Wooden tools ----
  wooden_pickaxe: { id: 'wooden_pickaxe', label: 'Wood Pickaxe', color: '#c4973a', stackSize: 1, isTool: true, toolKind: 'pickaxe', toolTier: 'wood', durability: 60, attackDamage: 2, breakMultiplier: PICK_WOOD_M },
  wooden_axe:     { id: 'wooden_axe',     label: 'Wood Axe',     color: '#c4973a', stackSize: 1, isTool: true, toolKind: 'axe', toolTier: 'wood', durability: 60, attackDamage: 3, breakMultiplier: { cyan_wood: 0.3, planks: 0.3, crafting_table: 0.4, bookshelf: 0.4, chest: 0.4, ladder: 0.3 } },
  wooden_shovel:  { id: 'wooden_shovel',  label: 'Wood Shovel',  color: '#c4973a', stackSize: 1, isTool: true, toolKind: 'shovel', toolTier: 'wood', durability: 60, attackDamage: 1, breakMultiplier: { deep_blue: 0.3, sand_blue: 0.3, base_blue: 0.35, gravel: 0.3 } },
  wooden_sword:   { id: 'wooden_sword',   label: 'Wood Sword',   color: '#c4973a', stackSize: 1, isTool: true, toolKind: 'sword', toolTier: 'wood', durability: 60, attackDamage: 4 },
  wooden_hoe:     { id: 'wooden_hoe',     label: 'Wood Hoe',     color: '#c4973a', stackSize: 1, isTool: true, toolKind: 'hoe', toolTier: 'wood', durability: 60, attackDamage: 1 },

  // ---- Stone tools ----
  stone_pickaxe: { id: 'stone_pickaxe', label: 'Stone Pickaxe', color: '#7a7a7a', stackSize: 1, isTool: true, toolKind: 'pickaxe', toolTier: 'stone', durability: 132, attackDamage: 3, breakMultiplier: PICK_STONE_M },
  stone_axe:     { id: 'stone_axe',     label: 'Stone Axe',     color: '#7a7a7a', stackSize: 1, isTool: true, toolKind: 'axe', toolTier: 'stone', durability: 132, attackDamage: 4, breakMultiplier: { cyan_wood: 0.2, planks: 0.2, crafting_table: 0.3, bookshelf: 0.3, chest: 0.3, ladder: 0.2 } },
  stone_shovel:  { id: 'stone_shovel',  label: 'Stone Shovel',  color: '#7a7a7a', stackSize: 1, isTool: true, toolKind: 'shovel', toolTier: 'stone', durability: 132, attackDamage: 2, breakMultiplier: { deep_blue: 0.2, sand_blue: 0.2, base_blue: 0.25, gravel: 0.2 } },
  stone_sword:   { id: 'stone_sword',   label: 'Stone Sword',   color: '#7a7a7a', stackSize: 1, isTool: true, toolKind: 'sword', toolTier: 'stone', durability: 132, attackDamage: 5 },
  stone_hoe:     { id: 'stone_hoe',     label: 'Stone Hoe',     color: '#7a7a7a', stackSize: 1, isTool: true, toolKind: 'hoe', toolTier: 'stone', durability: 132, attackDamage: 1 },

  // ---- Copper tools (between stone and iron) ----
  copper_pickaxe: { id: 'copper_pickaxe', label: 'Copper Pickaxe', color: '#d88040', stackSize: 1, isTool: true, toolKind: 'pickaxe', toolTier: 'stone', durability: 180, attackDamage: 4, breakMultiplier: PICK_COPPER_M },
  copper_axe:     { id: 'copper_axe',     label: 'Copper Axe',     color: '#d88040', stackSize: 1, isTool: true, toolKind: 'axe', toolTier: 'stone', durability: 180, attackDamage: 5, breakMultiplier: { cyan_wood: 0.18, planks: 0.18, crafting_table: 0.25, bookshelf: 0.25, chest: 0.25, ladder: 0.18, birch_wood: 0.18, dark_oak_wood: 0.18 } },
  copper_shovel:  { id: 'copper_shovel',  label: 'Copper Shovel',  color: '#d88040', stackSize: 1, isTool: true, toolKind: 'shovel', toolTier: 'stone', durability: 180, attackDamage: 3, breakMultiplier: { deep_blue: 0.18, sand_blue: 0.18, base_blue: 0.2, gravel: 0.18, mud: 0.15 } },
  copper_sword:   { id: 'copper_sword',   label: 'Copper Sword',   color: '#d88040', stackSize: 1, isTool: true, toolKind: 'sword', toolTier: 'stone', durability: 180, attackDamage: 6 },
  copper_hoe:     { id: 'copper_hoe',     label: 'Copper Hoe',     color: '#d88040', stackSize: 1, isTool: true, toolKind: 'hoe', toolTier: 'stone', durability: 180, attackDamage: 1 },

  // ---- Iron tools ----
  iron_pickaxe: { id: 'iron_pickaxe', label: 'Iron Pickaxe', color: '#d4d4d4', stackSize: 1, isTool: true, toolKind: 'pickaxe', toolTier: 'iron', durability: 251, attackDamage: 4, breakMultiplier: PICK_IRON_M },
  iron_axe:     { id: 'iron_axe',     label: 'Iron Axe',     color: '#d4d4d4', stackSize: 1, isTool: true, toolKind: 'axe', toolTier: 'iron', durability: 251, attackDamage: 5, breakMultiplier: { cyan_wood: 0.15, planks: 0.15, crafting_table: 0.2, bookshelf: 0.2, chest: 0.2, ladder: 0.15 } },
  iron_shovel:  { id: 'iron_shovel',  label: 'Iron Shovel',  color: '#d4d4d4', stackSize: 1, isTool: true, toolKind: 'shovel', toolTier: 'iron', durability: 251, attackDamage: 3, breakMultiplier: { deep_blue: 0.15, sand_blue: 0.15, base_blue: 0.18, gravel: 0.15 } },
  iron_sword:   { id: 'iron_sword',   label: 'Iron Sword',   color: '#d4d4d4', stackSize: 1, isTool: true, toolKind: 'sword', toolTier: 'iron', durability: 251, attackDamage: 6 },
  iron_hoe:     { id: 'iron_hoe',     label: 'Iron Hoe',     color: '#d4d4d4', stackSize: 1, isTool: true, toolKind: 'hoe', toolTier: 'iron', durability: 251, attackDamage: 1 },

  // ---- Diamond tools ----
  diamond_pickaxe: { id: 'diamond_pickaxe', label: 'Diamond Pickaxe', color: '#4de8e0', stackSize: 1, isTool: true, toolKind: 'pickaxe', toolTier: 'diamond', durability: 1562, attackDamage: 5, breakMultiplier: PICK_DIAMOND_M },
  diamond_axe:     { id: 'diamond_axe',     label: 'Diamond Axe',     color: '#4de8e0', stackSize: 1, isTool: true, toolKind: 'axe', toolTier: 'diamond', durability: 1562, attackDamage: 6, breakMultiplier: { cyan_wood: 0.1, planks: 0.1, crafting_table: 0.15, bookshelf: 0.15, chest: 0.15, ladder: 0.1 } },
  diamond_shovel:  { id: 'diamond_shovel',  label: 'Diamond Shovel',  color: '#4de8e0', stackSize: 1, isTool: true, toolKind: 'shovel', toolTier: 'diamond', durability: 1562, attackDamage: 4, breakMultiplier: { deep_blue: 0.1, sand_blue: 0.1, base_blue: 0.12, gravel: 0.1 } },
  diamond_sword:   { id: 'diamond_sword',   label: 'Diamond Sword',   color: '#4de8e0', stackSize: 1, isTool: true, toolKind: 'sword', toolTier: 'diamond', durability: 1562, attackDamage: 7 },
  diamond_hoe:     { id: 'diamond_hoe',     label: 'Diamond Hoe',     color: '#4de8e0', stackSize: 1, isTool: true, toolKind: 'hoe', toolTier: 'diamond', durability: 1562, attackDamage: 1 },

  // ---- Special tools ----
  shears: { id: 'shears', label: 'Shears', color: '#c0c0c0', stackSize: 1, isTool: true, toolKind: 'shears', durability: 238, attackDamage: 1, breakMultiplier: { wool: 0.1, leaves: 0.05 } },
  bow:    { id: 'bow',    label: 'Bow',    color: '#8a6a3a', stackSize: 1, isTool: true, toolKind: 'bow', isRanged: true, durability: 385, attackDamage: 0, ammoType: 'arrow', projectileDamage: 6 },

  // ---- Crossbow ----
  crossbow:   { id: 'crossbow', label: 'Crossbow', color: '#6a5a3a', stackSize: 1, isTool: true, toolKind: 'bow', isRanged: true, durability: 326, attackDamage: 0, ammoType: 'arrow', projectileDamage: 9 },

  // ---- Fishing rod & Flint and Steel ----
  fishing_rod:    { id: 'fishing_rod',    label: 'Fishing Rod',    color: '#8a6a3a', stackSize: 1, isTool: true, toolKind: 'bow', durability: 65, attackDamage: 0 },
  flint_and_steel:{ id: 'flint_and_steel',label: 'Flint & Steel',  color: '#8a8a8a', stackSize: 1, isTool: true, toolKind: 'shears', durability: 64, attackDamage: 0 },

  // ---- Shield ----
  shield: { id: 'shield', label: 'Shield', color: '#8a6a3a', stackSize: 1, isShield: true, durability: 337 },

  // ---- Armor: Leather (total 7 defense) ----
  leather_helmet:     { id: 'leather_helmet',     label: 'Leather Cap',       color: '#8a5a2a', stackSize: 1, isArmor: true, armorSlot: 'helmet',     armorDefense: 1, durability: 56 },
  leather_chestplate: { id: 'leather_chestplate', label: 'Leather Tunic',     color: '#8a5a2a', stackSize: 1, isArmor: true, armorSlot: 'chestplate', armorDefense: 3, durability: 81 },
  leather_leggings:   { id: 'leather_leggings',   label: 'Leather Pants',     color: '#8a5a2a', stackSize: 1, isArmor: true, armorSlot: 'leggings',   armorDefense: 2, durability: 76 },
  leather_boots:      { id: 'leather_boots',      label: 'Leather Boots',     color: '#8a5a2a', stackSize: 1, isArmor: true, armorSlot: 'boots',      armorDefense: 1, durability: 66 },

  // ---- Armor: Iron (total 15 defense) ----
  iron_helmet:     { id: 'iron_helmet',     label: 'Iron Helmet',      color: '#d4d4d4', stackSize: 1, isArmor: true, armorSlot: 'helmet',     armorDefense: 2, durability: 166 },
  iron_chestplate: { id: 'iron_chestplate', label: 'Iron Chestplate',  color: '#d4d4d4', stackSize: 1, isArmor: true, armorSlot: 'chestplate', armorDefense: 6, durability: 241 },
  iron_leggings:   { id: 'iron_leggings',   label: 'Iron Leggings',    color: '#d4d4d4', stackSize: 1, isArmor: true, armorSlot: 'leggings',   armorDefense: 5, durability: 226 },
  iron_boots:      { id: 'iron_boots',      label: 'Iron Boots',       color: '#d4d4d4', stackSize: 1, isArmor: true, armorSlot: 'boots',      armorDefense: 2, durability: 196 },

  // ---- Armor: Diamond (total 20 defense) ----
  diamond_helmet:     { id: 'diamond_helmet',     label: 'Diamond Helmet',     color: '#4de8e0', stackSize: 1, isArmor: true, armorSlot: 'helmet',     armorDefense: 3, durability: 364 },
  diamond_chestplate: { id: 'diamond_chestplate', label: 'Diamond Chestplate', color: '#4de8e0', stackSize: 1, isArmor: true, armorSlot: 'chestplate', armorDefense: 8, durability: 529 },
  diamond_leggings:   { id: 'diamond_leggings',   label: 'Diamond Leggings',   color: '#4de8e0', stackSize: 1, isArmor: true, armorSlot: 'leggings',   armorDefense: 6, durability: 496 },
  diamond_boots:      { id: 'diamond_boots',      label: 'Diamond Boots',      color: '#4de8e0', stackSize: 1, isArmor: true, armorSlot: 'boots',      armorDefense: 3, durability: 430 },
};

export const ALL_ITEM_TYPES = Object.keys(ITEMS) as ItemType[];
export const PLACEABLE_ITEMS = ALL_ITEM_TYPES.filter((t) => ITEMS[t].isBlock);
export const TOOL_ITEMS = ALL_ITEM_TYPES.filter((t) => ITEMS[t].isTool) as ToolType[];
export const FOOD_ITEMS = ALL_ITEM_TYPES.filter((t) => ITEMS[t].isFood) as FoodType[];
export const ARMOR_ITEMS = ALL_ITEM_TYPES.filter((t) => ITEMS[t].isArmor) as ArmorType[];

// ---- Armor helpers ----
export interface ArmorSlots {
  helmet: InventorySlot | null;
  chestplate: InventorySlot | null;
  leggings: InventorySlot | null;
  boots: InventorySlot | null;
}

export function createArmorSlots(): ArmorSlots {
  return { helmet: null, chestplate: null, leggings: null, boots: null };
}

export function getArmorDefense(armor: ArmorSlots): number {
  let total = 0;
  const slots: (InventorySlot | null)[] = [armor.helmet, armor.chestplate, armor.leggings, armor.boots];
  for (const slot of slots) {
    if (slot) {
      const def = ITEMS[slot.item];
      if (def.armorDefense) total += def.armorDefense;
    }
  }
  return total;
}

/** Reduce damage based on armor defense. MC formula: damage * (1 - min(20, defense) / 25) */
export function applyArmorReduction(damage: number, armor: ArmorSlots): number {
  const defense = getArmorDefense(armor);
  return damage * (1 - Math.min(20, defense) / 25);
}

// ---- Inventory helpers ----
export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export type Inventory = (InventorySlot | null)[];

export function createInventory(): Inventory {
  return new Array(INVENTORY_SIZE).fill(null);
}

export function addItem(inv: Inventory, item: ItemType, count = 1): Inventory {
  const def = ITEMS[item];
  const next = inv.map((s) => (s ? { ...s } : null));
  let rem = count;
  for (let i = 0; i < next.length && rem > 0; i++) {
    const s = next[i];
    if (s && s.item === item && s.count < def.stackSize) {
      const add = Math.min(rem, def.stackSize - s.count);
      s.count += add;
      rem -= add;
    }
  }
  for (let i = 0; i < next.length && rem > 0; i++) {
    if (!next[i]) {
      const add = Math.min(rem, def.stackSize);
      next[i] = { item, count: add, durability: def.durability };
      rem -= add;
    }
  }
  return next;
}

export function removeFromSlot(inv: Inventory, slot: number, count = 1): Inventory {
  const next = inv.map((s) => (s ? { ...s } : null));
  const s = next[slot];
  if (!s) return next;
  if (s.count <= count) { next[slot] = null; } else { s.count -= count; }
  return next;
}

export function removeItem(inv: Inventory, item: ItemType, count: number): Inventory {
  const next = inv.map((s) => (s ? { ...s } : null));
  let rem = count;
  for (let i = next.length - 1; i >= 0 && rem > 0; i--) {
    const s = next[i];
    if (s && s.item === item) {
      const take = Math.min(rem, s.count);
      s.count -= take;
      rem -= take;
      if (s.count <= 0) next[i] = null;
    }
  }
  return next;
}

export function useTool(inv: Inventory, slot: number): { inv: Inventory; broke: boolean } {
  const next = inv.map((s) => (s ? { ...s } : null));
  const s = next[slot];
  if (!s || s.durability === undefined) return { inv: next, broke: false };
  if (s.durability <= 1) { next[slot] = null; return { inv: next, broke: true }; }
  s.durability -= 1;
  return { inv: next, broke: false };
}

export function countItem(inv: Inventory, item: ItemType): number {
  return inv.reduce((sum, s) => sum + (s && s.item === item ? s.count : 0), 0);
}

export function swapSlots(inv: Inventory, a: number, b: number): Inventory {
  const next = [...inv];
  const tmp = next[a]; next[a] = next[b]; next[b] = tmp;
  return next;
}
