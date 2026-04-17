// Shapeless crafting recipes. Player doesn't arrange a grid — they just
// need the right ingredients and click to craft. Some recipes require a
// crafting table in reach (the real MC 3×3 analogue).

import { ItemType, countItem, removeItem, addItem, Inventory } from './items';

export interface Recipe {
  id: string;          // unique key for React
  ingredients: { item: ItemType; count: number }[];
  result: { item: ItemType; count: number };
  needsTable?: boolean; // true = player must be within 3 blocks of a crafting_table
  needsFurnace?: boolean; // true = player must be near a furnace
}

export const RECIPES: Recipe[] = [
  // ---- Basic processing ----
  { id: 'planks',        ingredients: [{ item: 'cyan_wood', count: 1 }], result: { item: 'planks', count: 4 } },
  { id: 'sticks',        ingredients: [{ item: 'planks', count: 2 }],    result: { item: 'stick', count: 4 } },
  { id: 'craft_table',   ingredients: [{ item: 'planks', count: 4 }],    result: { item: 'crafting_table', count: 1 } },
  { id: 'furnace',       ingredients: [{ item: 'cobblestone', count: 8 }], result: { item: 'furnace', count: 1 }, needsTable: true },
  { id: 'torch',         ingredients: [{ item: 'stick', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'torch', count: 4 } },
  { id: 'chest',         ingredients: [{ item: 'planks', count: 8 }], result: { item: 'chest', count: 1 }, needsTable: true },
  { id: 'ladder',        ingredients: [{ item: 'stick', count: 7 }], result: { item: 'ladder', count: 3 }, needsTable: true },
  { id: 'bookshelf',     ingredients: [{ item: 'planks', count: 6 }, { item: 'planks', count: 3 }], result: { item: 'bookshelf', count: 1 }, needsTable: true },
  { id: 'bricks',        ingredients: [{ item: 'cobblestone', count: 4 }], result: { item: 'bricks', count: 4 } },
  { id: 'wool',          ingredients: [{ item: 'string', count: 4 }], result: { item: 'wool', count: 1 } },

  // ---- Wooden tools ----
  { id: 'w_pick',   ingredients: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_pickaxe', count: 1 }, needsTable: true },
  { id: 'w_axe',    ingredients: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_axe', count: 1 }, needsTable: true },
  { id: 'w_shovel', ingredients: [{ item: 'planks', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_shovel', count: 1 } },
  { id: 'w_sword',  ingredients: [{ item: 'planks', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'wooden_sword', count: 1 } },
  { id: 'w_hoe',    ingredients: [{ item: 'planks', count: 2 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_hoe', count: 1 }, needsTable: true },

  // ---- Stone tools ----
  { id: 's_pick',   ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'stone_pickaxe', count: 1 }, needsTable: true },
  { id: 's_axe',    ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'stone_axe', count: 1 }, needsTable: true },
  { id: 's_shovel', ingredients: [{ item: 'cobblestone', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'stone_shovel', count: 1 } },
  { id: 's_sword',  ingredients: [{ item: 'cobblestone', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'stone_sword', count: 1 } },
  { id: 's_hoe',    ingredients: [{ item: 'cobblestone', count: 2 }, { item: 'stick', count: 2 }],  result: { item: 'stone_hoe', count: 1 }, needsTable: true },

  // ---- Copper tools ----
  { id: 'c_pick',   ingredients: [{ item: 'copper_ingot', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'copper_pickaxe', count: 1 }, needsTable: true },
  { id: 'c_axe',    ingredients: [{ item: 'copper_ingot', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'copper_axe', count: 1 }, needsTable: true },
  { id: 'c_shovel', ingredients: [{ item: 'copper_ingot', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'copper_shovel', count: 1 } },
  { id: 'c_sword',  ingredients: [{ item: 'copper_ingot', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'copper_sword', count: 1 } },
  { id: 'c_hoe',    ingredients: [{ item: 'copper_ingot', count: 2 }, { item: 'stick', count: 2 }],  result: { item: 'copper_hoe', count: 1 }, needsTable: true },

  // ---- Iron tools ----
  { id: 'i_pick',   ingredients: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'iron_pickaxe', count: 1 }, needsTable: true },
  { id: 'i_axe',    ingredients: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'iron_axe', count: 1 }, needsTable: true },
  { id: 'i_shovel', ingredients: [{ item: 'iron_ingot', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'iron_shovel', count: 1 } },
  { id: 'i_sword',  ingredients: [{ item: 'iron_ingot', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'iron_sword', count: 1 } },
  { id: 'i_hoe',    ingredients: [{ item: 'iron_ingot', count: 2 }, { item: 'stick', count: 2 }],  result: { item: 'iron_hoe', count: 1 }, needsTable: true },

  // ---- Diamond tools ----
  { id: 'd_pick',   ingredients: [{ item: 'diamond', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'diamond_pickaxe', count: 1 }, needsTable: true },
  { id: 'd_axe',    ingredients: [{ item: 'diamond', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'diamond_axe', count: 1 }, needsTable: true },
  { id: 'd_shovel', ingredients: [{ item: 'diamond', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'diamond_shovel', count: 1 } },
  { id: 'd_sword',  ingredients: [{ item: 'diamond', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'diamond_sword', count: 1 } },
  { id: 'd_hoe',    ingredients: [{ item: 'diamond', count: 2 }, { item: 'stick', count: 2 }],  result: { item: 'diamond_hoe', count: 1 }, needsTable: true },

  // ---- Shears, Bow, Arrow, Shield ----
  { id: 'shears',   ingredients: [{ item: 'iron_ingot', count: 2 }], result: { item: 'shears', count: 1 } },
  { id: 'bow',      ingredients: [{ item: 'string', count: 3 }, { item: 'stick', count: 3 }], result: { item: 'bow', count: 1 }, needsTable: true },
  { id: 'arrow',    ingredients: [{ item: 'flint', count: 1 }, { item: 'stick', count: 1 }, { item: 'string', count: 1 }], result: { item: 'arrow', count: 4 } },
  { id: 'shield',   ingredients: [{ item: 'planks', count: 6 }, { item: 'iron_ingot', count: 1 }], result: { item: 'shield', count: 1 }, needsTable: true },

  // ---- Food ----
  { id: 'bread',        ingredients: [{ item: 'base_blue', count: 3 }], result: { item: 'bread', count: 1 } },
  { id: 'golden_apple', ingredients: [{ item: 'gold_ingot', count: 8 }, { item: 'apple', count: 1 }], result: { item: 'golden_apple', count: 1 }, needsTable: true },

  // ---- Leather armor ----
  { id: 'l_helmet',     ingredients: [{ item: 'leather', count: 5 }], result: { item: 'leather_helmet', count: 1 } },
  { id: 'l_chest',      ingredients: [{ item: 'leather', count: 8 }], result: { item: 'leather_chestplate', count: 1 }, needsTable: true },
  { id: 'l_legs',       ingredients: [{ item: 'leather', count: 7 }], result: { item: 'leather_leggings', count: 1 }, needsTable: true },
  { id: 'l_boots',      ingredients: [{ item: 'leather', count: 4 }], result: { item: 'leather_boots', count: 1 } },

  // ---- Iron armor ----
  { id: 'i_helmet',     ingredients: [{ item: 'iron_ingot', count: 5 }], result: { item: 'iron_helmet', count: 1 } },
  { id: 'i_chest',      ingredients: [{ item: 'iron_ingot', count: 8 }], result: { item: 'iron_chestplate', count: 1 }, needsTable: true },
  { id: 'i_legs',       ingredients: [{ item: 'iron_ingot', count: 7 }], result: { item: 'iron_leggings', count: 1 }, needsTable: true },
  { id: 'i_boots',      ingredients: [{ item: 'iron_ingot', count: 4 }], result: { item: 'iron_boots', count: 1 } },

  // ---- Diamond armor ----
  { id: 'd_helmet',     ingredients: [{ item: 'diamond', count: 5 }], result: { item: 'diamond_helmet', count: 1 } },
  { id: 'd_chest',      ingredients: [{ item: 'diamond', count: 8 }], result: { item: 'diamond_chestplate', count: 1 }, needsTable: true },
  { id: 'd_legs',       ingredients: [{ item: 'diamond', count: 7 }], result: { item: 'diamond_leggings', count: 1 }, needsTable: true },
  { id: 'd_boots',      ingredients: [{ item: 'diamond', count: 4 }], result: { item: 'diamond_boots', count: 1 } },

  // ---- Smelting (needs furnace) ----
  { id: 'smelt_iron',    ingredients: [{ item: 'raw_iron', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'iron_ingot', count: 1 }, needsFurnace: true },
  { id: 'smelt_gold',    ingredients: [{ item: 'raw_gold', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'gold_ingot', count: 1 }, needsFurnace: true },
  { id: 'smelt_glass',   ingredients: [{ item: 'sand_blue', count: 4 }, { item: 'coal', count: 1 }], result: { item: 'glass', count: 4 }, needsFurnace: true },
  { id: 'smelt_stone',   ingredients: [{ item: 'cobblestone', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'royal_brick', count: 1 }, needsFurnace: true },
  { id: 'smelt_beef',    ingredients: [{ item: 'beef', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'cooked_beef', count: 1 }, needsFurnace: true },
  { id: 'smelt_pork',    ingredients: [{ item: 'porkchop', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'cooked_porkchop', count: 1 }, needsFurnace: true },
  { id: 'smelt_chicken', ingredients: [{ item: 'chicken_meat', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'cooked_chicken', count: 1 }, needsFurnace: true },

  // ---- On-chain exclusive: Base Block ----
  { id: 'base_block', ingredients: [{ item: 'diamond', count: 4 }, { item: 'iron_ingot', count: 4 }], result: { item: 'base_block', count: 1 }, needsTable: true },

  // ---- Tier-gated blocks ----
  { id: 'bronze_block',  ingredients: [{ item: 'iron_ingot', count: 4 }, { item: 'base_block', count: 1 }], result: { item: 'bronze_block', count: 1 }, needsTable: true },
  { id: 'silver_block',  ingredients: [{ item: 'gold_ingot', count: 4 }, { item: 'bronze_block', count: 1 }], result: { item: 'silver_block', count: 1 }, needsTable: true },
  { id: 'gold_block',    ingredients: [{ item: 'diamond', count: 4 }, { item: 'silver_block', count: 1 }], result: { item: 'gold_block', count: 1 }, needsTable: true },
  { id: 'crystal_block', ingredients: [{ item: 'diamond', count: 4 }, { item: 'gold_ingot', count: 4 }, { item: 'gold_block', count: 1 }], result: { item: 'crystal_block', count: 1 }, needsTable: true },

  // ---- New feature recipes ----
  { id: 'tnt',          ingredients: [{ item: 'gunpowder', count: 5 }, { item: 'sand_blue', count: 4 }], result: { item: 'tnt', count: 1 }, needsTable: true },
  { id: 'bed',          ingredients: [{ item: 'wool', count: 3 }, { item: 'planks', count: 3 }], result: { item: 'bed', count: 1 }, needsTable: true },
  { id: 'campfire',     ingredients: [{ item: 'stick', count: 3 }, { item: 'coal', count: 1 }, { item: 'cyan_wood', count: 3 }], result: { item: 'campfire', count: 1 } },
  { id: 'fishing_rod',  ingredients: [{ item: 'stick', count: 3 }, { item: 'string', count: 2 }], result: { item: 'fishing_rod', count: 1 } },
  { id: 'flint_steel',  ingredients: [{ item: 'iron_ingot', count: 1 }, { item: 'flint', count: 1 }], result: { item: 'flint_and_steel', count: 1 } },
  { id: 'bucket',       ingredients: [{ item: 'iron_ingot', count: 3 }], result: { item: 'bucket', count: 1 } },
  { id: 'compass',      ingredients: [{ item: 'iron_ingot', count: 4 }, { item: 'coal', count: 1 }], result: { item: 'compass', count: 1 }, needsTable: true },
  { id: 'bread2',       ingredients: [{ item: 'wheat_item', count: 3 }], result: { item: 'bread', count: 1 } },

  // ---- Smelting: fish ----
  { id: 'smelt_fish',   ingredients: [{ item: 'raw_fish', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'cooked_fish', count: 1 }, needsFurnace: true },

  // ---- Doors, interactive, decorative ----
  { id: 'oak_door',      ingredients: [{ item: 'planks', count: 6 }], result: { item: 'oak_door', count: 3 }, needsTable: true },
  { id: 'trapdoor',      ingredients: [{ item: 'planks', count: 6 }], result: { item: 'trapdoor', count: 2 }, needsTable: true },
  { id: 'brewing_stand', ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 1 }], result: { item: 'brewing_stand', count: 1 }, needsTable: true },
  { id: 'noteblock',     ingredients: [{ item: 'planks', count: 8 }, { item: 'coal', count: 1 }], result: { item: 'noteblock', count: 1 }, needsTable: true },
  { id: 'jukebox',       ingredients: [{ item: 'planks', count: 8 }, { item: 'diamond', count: 1 }], result: { item: 'jukebox', count: 1 }, needsTable: true },
  { id: 'sign',          ingredients: [{ item: 'planks', count: 6 }, { item: 'stick', count: 1 }], result: { item: 'sign', count: 3 }, needsTable: true },
  { id: 'glass_bottle',  ingredients: [{ item: 'glass', count: 3 }], result: { item: 'glass_bottle', count: 3 } },
  { id: 'spyglass',      ingredients: [{ item: 'iron_ingot', count: 2 }, { item: 'diamond', count: 1 }], result: { item: 'spyglass', count: 1 }, needsTable: true },

  // ---- Colored wool (dye + wool) ----
  { id: 'red_wool',    ingredients: [{ item: 'wool', count: 1 }, { item: 'red_dye', count: 1 }],    result: { item: 'red_wool', count: 1 } },
  { id: 'blue_wool',   ingredients: [{ item: 'wool', count: 1 }, { item: 'blue_dye', count: 1 }],   result: { item: 'blue_wool', count: 1 } },
  { id: 'green_wool',  ingredients: [{ item: 'wool', count: 1 }, { item: 'green_dye', count: 1 }],  result: { item: 'green_wool', count: 1 } },
  { id: 'yellow_wool', ingredients: [{ item: 'wool', count: 1 }, { item: 'yellow_dye', count: 1 }], result: { item: 'yellow_wool', count: 1 } },
  { id: 'black_wool',  ingredients: [{ item: 'wool', count: 1 }, { item: 'black_dye', count: 1 }],  result: { item: 'black_wool', count: 1 } },

  // ---- Dyes from materials ----
  { id: 'red_dye',    ingredients: [{ item: 'apple', count: 1 }],    result: { item: 'red_dye', count: 2 } },
  { id: 'blue_dye',   ingredients: [{ item: 'diamond', count: 1 }],  result: { item: 'blue_dye', count: 4 } },
  { id: 'green_dye',  ingredients: [{ item: 'leaves', count: 2 }],   result: { item: 'green_dye', count: 2 } },
  { id: 'yellow_dye', ingredients: [{ item: 'seeds', count: 2 }],    result: { item: 'yellow_dye', count: 2 } },
  { id: 'black_dye',  ingredients: [{ item: 'coal', count: 1 }],     result: { item: 'black_dye', count: 2 } },

  // ---- New blocks: Batch 3 ----
  { id: 'lantern',          ingredients: [{ item: 'iron_ingot', count: 8 }, { item: 'torch', count: 1 }], result: { item: 'lantern', count: 1 }, needsTable: true },
  { id: 'fence',            ingredients: [{ item: 'planks', count: 4 }, { item: 'stick', count: 2 }], result: { item: 'fence', count: 3 }, needsTable: true },
  { id: 'jack_o_lantern',   ingredients: [{ item: 'pumpkin', count: 1 }, { item: 'torch', count: 1 }], result: { item: 'jack_o_lantern', count: 1 } },
  { id: 'mushroom_stew2',   ingredients: [{ item: 'mushroom_red', count: 1 }, { item: 'mushroom_brown', count: 1 }], result: { item: 'mushroom_stew', count: 1 } },
  { id: 'lever',            ingredients: [{ item: 'stick', count: 1 }, { item: 'cobblestone', count: 1 }], result: { item: 'lever', count: 1 } },
  { id: 'anvil',            ingredients: [{ item: 'iron_ingot', count: 31 }], result: { item: 'anvil', count: 1 }, needsTable: true },
  { id: 'enchanting_table', ingredients: [{ item: 'diamond', count: 2 }, { item: 'obsidian', count: 4 }, { item: 'book', count: 1 }], result: { item: 'enchanting_table', count: 1 }, needsTable: true },
  { id: 'book',             ingredients: [{ item: 'planks', count: 3 }, { item: 'leather', count: 1 }], result: { item: 'book', count: 1 } },
  { id: 'crossbow',         ingredients: [{ item: 'stick', count: 3 }, { item: 'iron_ingot', count: 1 }, { item: 'string', count: 2 }], result: { item: 'crossbow', count: 1 }, needsTable: true },

  // ---- New blocks: Batch 4 ----
  { id: 'hay_bale',   ingredients: [{ item: 'wheat_item', count: 9 }], result: { item: 'hay_bale', count: 1 }, needsTable: true },
  { id: 'barrel',     ingredients: [{ item: 'planks', count: 6 }, { item: 'stick', count: 2 }], result: { item: 'barrel', count: 1 }, needsTable: true },
  { id: 'beacon',     ingredients: [{ item: 'glass', count: 5 }, { item: 'diamond', count: 1 }, { item: 'obsidian', count: 3 }], result: { item: 'beacon', count: 1 }, needsTable: true },
  { id: 'banner',     ingredients: [{ item: 'wool', count: 6 }, { item: 'stick', count: 1 }], result: { item: 'banner', count: 1 }, needsTable: true },
  { id: 'paper',      ingredients: [{ item: 'planks', count: 3 }], result: { item: 'paper', count: 3 } },
  { id: 'map_craft',  ingredients: [{ item: 'paper', count: 8 }, { item: 'compass', count: 1 }], result: { item: 'map', count: 1 }, needsTable: true },

  // ---- Batch 5: Essential blocks & materials ----
  { id: 'iron_block',    ingredients: [{ item: 'iron_ingot', count: 9 }], result: { item: 'iron_block', count: 1 }, needsTable: true },
  { id: 'diamond_block', ingredients: [{ item: 'diamond', count: 9 }], result: { item: 'diamond_block', count: 1 }, needsTable: true },
  { id: 'stone_bricks',  ingredients: [{ item: 'royal_brick', count: 4 }], result: { item: 'stone_bricks', count: 4 }, needsTable: true },
  { id: 'terracotta',    ingredients: [{ item: 'clay_ball', count: 4 }, { item: 'coal', count: 1 }], result: { item: 'terracotta', count: 4 }, needsFurnace: true },
  { id: 'brick_smelt',   ingredients: [{ item: 'clay_ball', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'brick_item', count: 1 }, needsFurnace: true },
  { id: 'glowstone',     ingredients: [{ item: 'glowstone_dust', count: 4 }], result: { item: 'glowstone', count: 1 } },
  { id: 'prismarine',    ingredients: [{ item: 'prismarine_shard', count: 4 }], result: { item: 'prismarine', count: 1 } },
  { id: 'sea_lantern',   ingredients: [{ item: 'prismarine_shard', count: 4 }, { item: 'glowstone_dust', count: 5 }], result: { item: 'sea_lantern', count: 1 }, needsTable: true },
  { id: 'nether_bricks', ingredients: [{ item: 'nether_wart', count: 2 }, { item: 'cobblestone', count: 4 }], result: { item: 'nether_bricks', count: 4 }, needsFurnace: true },
  { id: 'end_stone',     ingredients: [{ item: 'cobblestone', count: 4 }, { item: 'ender_pearl', count: 1 }], result: { item: 'end_stone', count: 4 }, needsTable: true },
  { id: 'redstone_lamp', ingredients: [{ item: 'glowstone', count: 1 }, { item: 'iron_ingot', count: 4 }], result: { item: 'redstone_lamp', count: 1 }, needsTable: true },
  { id: 'ender_eye',     ingredients: [{ item: 'ender_pearl', count: 1 }, { item: 'blaze_powder', count: 1 }], result: { item: 'ender_eye', count: 1 } },
  { id: 'blaze_powder',  ingredients: [{ item: 'blaze_rod', count: 1 }], result: { item: 'blaze_powder', count: 2 } },
  { id: 'magma_cream',   ingredients: [{ item: 'blaze_powder', count: 1 }, { item: 'spider_eye', count: 1 }], result: { item: 'magma_cream', count: 1 } },
  { id: 'glistering_melon', ingredients: [{ item: 'melon_slice', count: 1 }, { item: 'gold_ingot', count: 8 }], result: { item: 'glistering_melon', count: 1 }, needsTable: true },
  { id: 'nether_portal_block', ingredients: [{ item: 'obsidian', count: 10 }, { item: 'blaze_rod', count: 2 }, { item: 'ender_eye', count: 1 }], result: { item: 'nether_portal', count: 1 }, needsTable: true },
  { id: 'iron_from_block', ingredients: [{ item: 'iron_block', count: 1 }], result: { item: 'iron_ingot', count: 9 } },
  { id: 'diamond_from_block', ingredients: [{ item: 'diamond_block', count: 1 }], result: { item: 'diamond', count: 9 } },

  // ---- Potions (brewing stand required) ----
  { id: 'potion_healing',      ingredients: [{ item: 'glass_bottle', count: 1 }, { item: 'golden_apple', count: 1 }],  result: { item: 'potion_healing', count: 1 }, needsTable: true },
  { id: 'potion_speed',        ingredients: [{ item: 'glass_bottle', count: 1 }, { item: 'seeds', count: 4 }],          result: { item: 'potion_speed', count: 1 }, needsTable: true },
  { id: 'potion_strength',     ingredients: [{ item: 'glass_bottle', count: 1 }, { item: 'gunpowder', count: 2 }],      result: { item: 'potion_strength', count: 1 }, needsTable: true },
  { id: 'potion_fire_resist',  ingredients: [{ item: 'glass_bottle', count: 1 }, { item: 'coal', count: 4 }],           result: { item: 'potion_fire_resist', count: 1 }, needsTable: true },
  { id: 'potion_night_vision', ingredients: [{ item: 'glass_bottle', count: 1 }, { item: 'spider_eye', count: 2 }],     result: { item: 'potion_night_vision', count: 1 }, needsTable: true },
  { id: 'potion_jump',         ingredients: [{ item: 'glass_bottle', count: 1 }, { item: 'bone', count: 2 }],           result: { item: 'potion_jump', count: 1 }, needsTable: true },

  // ---- Batch 9: Biome block recipes ----
  { id: 'birch_planks',  ingredients: [{ item: 'birch_wood', count: 1 }],    result: { item: 'planks', count: 4 } },
  { id: 'dark_oak_planks', ingredients: [{ item: 'dark_oak_wood', count: 1 }], result: { item: 'planks', count: 4 } },
  { id: 'packed_ice',    ingredients: [{ item: 'ice_stone', count: 9 }],     result: { item: 'packed_ice', count: 1 }, needsTable: true },
  { id: 'snow_block',    ingredients: [{ item: 'ice_stone', count: 4 }],     result: { item: 'snow_block', count: 1 } },
  { id: 'copper_smelt',  ingredients: [{ item: 'raw_copper', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'copper_ingot', count: 1 }, needsFurnace: true },
  { id: 'sugar_from_cane', ingredients: [{ item: 'sugar_cane', count: 1 }],  result: { item: 'sugar', count: 1 } },
  { id: 'moss_block',    ingredients: [{ item: 'vine', count: 4 }, { item: 'deep_blue', count: 1 }], result: { item: 'moss_block', count: 2 } },
  { id: 'mud_bricks',    ingredients: [{ item: 'mud', count: 4 }],           result: { item: 'bricks', count: 4 }, needsTable: true },
  { id: 'emerald_block', ingredients: [{ item: 'emerald', count: 9 }],       result: { item: 'base_block', count: 1 }, needsTable: true },
  { id: 'copper_block',  ingredients: [{ item: 'copper_ingot', count: 9 }],  result: { item: 'terracotta', count: 1 }, needsTable: true },
  { id: 'spyglass_craft',ingredients: [{ item: 'copper_ingot', count: 2 }, { item: 'amethyst_shard', count: 1 }], result: { item: 'spyglass', count: 1 }, needsTable: true },
  { id: 'cake',          ingredients: [{ item: 'sugar', count: 2 }, { item: 'wheat_item', count: 3 }, { item: 'bucket', count: 1 }], result: { item: 'bread', count: 3 }, needsTable: true },

  // ---- Batch 19: More food recipes ----
  { id: 'cookie',       ingredients: [{ item: 'wheat_item', count: 2 }, { item: 'seeds', count: 1 }], result: { item: 'cookie', count: 8 } },
  { id: 'pumpkin_pie',  ingredients: [{ item: 'pumpkin', count: 1 }, { item: 'sugar', count: 1 }, { item: 'wheat_item', count: 1 }], result: { item: 'pumpkin_pie', count: 1 } },

  // ---- Batch 28: More decorative & utility recipes ----
  { id: 'mossy_cobble', ingredients: [{ item: 'cobblestone', count: 1 }, { item: 'vine', count: 1 }], result: { item: 'mossy_cobblestone', count: 1 } },
  { id: 'gold_block',   ingredients: [{ item: 'gold_ingot', count: 9 }], result: { item: 'gold_block', count: 1 }, needsTable: true },
  { id: 'gold_from_block', ingredients: [{ item: 'gold_block', count: 1 }], result: { item: 'gold_ingot', count: 9 } },
  { id: 'sponge',       ingredients: [{ item: 'wool', count: 3 }, { item: 'string', count: 3 }], result: { item: 'sponge', count: 1 }, needsTable: true },
  { id: 'soul_sand',    ingredients: [{ item: 'sand_blue', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'soul_sand', count: 2 }, needsFurnace: true },
  { id: 'calcite',      ingredients: [{ item: 'cobblestone', count: 4 }, { item: 'bone', count: 1 }], result: { item: 'calcite', count: 4 }, needsTable: true },
  { id: 'deepslate',    ingredients: [{ item: 'cobblestone', count: 4 }, { item: 'coal', count: 2 }], result: { item: 'deepslate', count: 4 }, needsFurnace: true },
  { id: 'clay_ball',    ingredients: [{ item: 'mud', count: 1 }], result: { item: 'clay_ball', count: 4 } },
  { id: 'glass_bottle', ingredients: [{ item: 'glass', count: 3 }], result: { item: 'glass_bottle', count: 3 } },
  { id: 'glass_smelt',  ingredients: [{ item: 'sand_blue', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'glass', count: 1 }, needsFurnace: true },
  { id: 'cooked_fish',  ingredients: [{ item: 'raw_fish', count: 1 }, { item: 'coal', count: 1 }], result: { item: 'cooked_fish', count: 1 }, needsFurnace: true },
  { id: 'golden_carrot', ingredients: [{ item: 'golden_apple', count: 1 }, { item: 'wheat_item', count: 2 }], result: { item: 'golden_apple', count: 2 } },
  { id: 'campfire',     ingredients: [{ item: 'stick', count: 3 }, { item: 'coal', count: 1 }, { item: 'planks', count: 3 }], result: { item: 'campfire', count: 1 } },
  { id: 'lily_pad',     ingredients: [{ item: 'vine', count: 2 }, { item: 'seeds', count: 1 }], result: { item: 'lily_pad', count: 2 } },
  { id: 'noteblock',    ingredients: [{ item: 'planks', count: 8 }, { item: 'iron_ingot', count: 1 }], result: { item: 'noteblock', count: 1 }, needsTable: true },
  { id: 'jukebox',      ingredients: [{ item: 'planks', count: 8 }, { item: 'diamond', count: 1 }], result: { item: 'jukebox', count: 1 }, needsTable: true },
  { id: 'bed_craft',    ingredients: [{ item: 'wool', count: 3 }, { item: 'planks', count: 3 }], result: { item: 'bed', count: 1 } },
  { id: 'tnt_craft',    ingredients: [{ item: 'gunpowder', count: 5 }, { item: 'sand_blue', count: 4 }], result: { item: 'tnt', count: 1 }, needsTable: true },
  { id: 'oak_door',     ingredients: [{ item: 'planks', count: 6 }], result: { item: 'oak_door', count: 3 }, needsTable: true },
  { id: 'trapdoor',     ingredients: [{ item: 'planks', count: 3 }], result: { item: 'trapdoor', count: 2 } },
];

/** Check if the player has enough materials to craft a recipe. */
export function canCraft(inv: Inventory, recipe: Recipe): boolean {
  for (const ing of recipe.ingredients) {
    if (countItem(inv, ing.item) < ing.count) return false;
  }
  return true;
}

/** Execute a craft: remove ingredients, add result. Returns new inventory. */
export function craft(inv: Inventory, recipe: Recipe): Inventory {
  let next = inv;
  for (const ing of recipe.ingredients) {
    next = removeItem(next, ing.item, ing.count);
  }
  next = addItem(next, recipe.result.item, recipe.result.count);
  return next;
}
