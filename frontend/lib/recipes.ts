// Shapeless crafting recipes. Player doesn't arrange a grid — they just
// need the right ingredients and click to craft. Some recipes require a
// crafting table in reach (the real MC 3×3 analogue).

import { ItemType, countItem, removeItem, addItem, Inventory } from './items';

export interface Recipe {
  id: string;          // unique key for React
  ingredients: { item: ItemType; count: number }[];
  result: { item: ItemType; count: number };
  needsTable?: boolean; // true = player must be within 3 blocks of a crafting_table
}

export const RECIPES: Recipe[] = [
  // ---- Basic processing ----
  { id: 'planks',        ingredients: [{ item: 'cyan_wood', count: 1 }], result: { item: 'planks', count: 4 } },
  { id: 'sticks',        ingredients: [{ item: 'planks', count: 2 }],    result: { item: 'stick', count: 4 } },
  { id: 'craft_table',   ingredients: [{ item: 'planks', count: 4 }],    result: { item: 'crafting_table', count: 1 } },

  // ---- Wooden tools (shovel + sword need only 2×2) ----
  { id: 'w_shovel', ingredients: [{ item: 'planks', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_shovel', count: 1 } },
  { id: 'w_sword',  ingredients: [{ item: 'planks', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'wooden_sword', count: 1 } },
  { id: 'w_pick',   ingredients: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_pickaxe', count: 1 }, needsTable: true },
  { id: 'w_axe',    ingredients: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'wooden_axe', count: 1 }, needsTable: true },

  // ---- Stone tools ----
  { id: 's_shovel', ingredients: [{ item: 'cobblestone', count: 1 }, { item: 'stick', count: 2 }],  result: { item: 'stone_shovel', count: 1 } },
  { id: 's_sword',  ingredients: [{ item: 'cobblestone', count: 2 }, { item: 'stick', count: 1 }],  result: { item: 'stone_sword', count: 1 } },
  { id: 's_pick',   ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'stone_pickaxe', count: 1 }, needsTable: true },
  { id: 's_axe',    ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }],  result: { item: 'stone_axe', count: 1 }, needsTable: true },
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
