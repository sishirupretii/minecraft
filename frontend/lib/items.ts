// Unified item system: blocks, tools, and materials.
// Every item a player can hold/store lives here.

import { BlockType } from './blocks';

// ---- Tool types ----
export type ToolType =
  | 'wooden_pickaxe' | 'wooden_axe' | 'wooden_shovel' | 'wooden_sword'
  | 'stone_pickaxe'  | 'stone_axe'  | 'stone_shovel'  | 'stone_sword';

// ---- Material types (crafting intermediates) ----
export type MaterialType = 'stick';

// ---- Unified item type ----
export type ItemType = BlockType | ToolType | MaterialType;

// ---- Item definition ----
export interface ItemDef {
  id: ItemType;
  label: string;
  color: string;      // hex string for UI rendering
  stackSize: number;   // 64 for blocks/materials, 1 for tools
  isBlock?: boolean;
  isTool?: boolean;
  toolKind?: 'pickaxe' | 'axe' | 'shovel' | 'sword';
  toolTier?: 'wood' | 'stone';
  durability?: number;
  // Break-time multiplier per block type. Lower = faster. Undefined = bare-hand speed.
  breakMultiplier?: Partial<Record<BlockType, number>>;
  // Attack damage (for swords / tools used as weapons on mobs).
  attackDamage?: number;
}

// ---- Inventory slot ----
export interface InventorySlot {
  item: ItemType;
  count: number;
  durability?: number; // remaining uses for tools
}

// ---- Drop map: what item does a block drop when mined? ----
// In Minecraft stone → cobblestone, grass → dirt, etc.
export const BLOCK_DROPS: Partial<Record<BlockType, ItemType>> = {
  royal_brick: 'cobblestone', // stone drops cobblestone
  base_blue: 'deep_blue',     // grass drops dirt
};

// Return the item type dropped when mining a given block.
export function getBlockDrop(blockType: BlockType): ItemType {
  return BLOCK_DROPS[blockType] ?? blockType;
}

// ---- Master item table ----
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

  // ---- Materials ----
  stick: { id: 'stick', label: 'Stick', color: '#b8924a', stackSize: 64 },

  // ---- Wooden tools ----
  wooden_pickaxe: {
    id: 'wooden_pickaxe', label: 'Wood Pickaxe', color: '#c4973a', stackSize: 1,
    isTool: true, toolKind: 'pickaxe', toolTier: 'wood', durability: 60, attackDamage: 2,
    breakMultiplier: { royal_brick: 0.3, cobblestone: 0.35, ice_stone: 0.5 },
  },
  wooden_axe: {
    id: 'wooden_axe', label: 'Wood Axe', color: '#c4973a', stackSize: 1,
    isTool: true, toolKind: 'axe', toolTier: 'wood', durability: 60, attackDamage: 3,
    breakMultiplier: { cyan_wood: 0.3, planks: 0.3, crafting_table: 0.4 },
  },
  wooden_shovel: {
    id: 'wooden_shovel', label: 'Wood Shovel', color: '#c4973a', stackSize: 1,
    isTool: true, toolKind: 'shovel', toolTier: 'wood', durability: 60, attackDamage: 1,
    breakMultiplier: { deep_blue: 0.3, sand_blue: 0.3, base_blue: 0.35 },
  },
  wooden_sword: {
    id: 'wooden_sword', label: 'Wood Sword', color: '#c4973a', stackSize: 1,
    isTool: true, toolKind: 'sword', toolTier: 'wood', durability: 60, attackDamage: 4,
  },

  // ---- Stone tools ----
  stone_pickaxe: {
    id: 'stone_pickaxe', label: 'Stone Pickaxe', color: '#7a7a7a', stackSize: 1,
    isTool: true, toolKind: 'pickaxe', toolTier: 'stone', durability: 132, attackDamage: 3,
    breakMultiplier: { royal_brick: 0.2, cobblestone: 0.25, ice_stone: 0.35 },
  },
  stone_axe: {
    id: 'stone_axe', label: 'Stone Axe', color: '#7a7a7a', stackSize: 1,
    isTool: true, toolKind: 'axe', toolTier: 'stone', durability: 132, attackDamage: 4,
    breakMultiplier: { cyan_wood: 0.2, planks: 0.2, crafting_table: 0.3 },
  },
  stone_shovel: {
    id: 'stone_shovel', label: 'Stone Shovel', color: '#7a7a7a', stackSize: 1,
    isTool: true, toolKind: 'shovel', toolTier: 'stone', durability: 132, attackDamage: 2,
    breakMultiplier: { deep_blue: 0.2, sand_blue: 0.2, base_blue: 0.25 },
  },
  stone_sword: {
    id: 'stone_sword', label: 'Stone Sword', color: '#7a7a7a', stackSize: 1,
    isTool: true, toolKind: 'sword', toolTier: 'stone', durability: 132, attackDamage: 5,
  },
};

export const ALL_ITEM_TYPES = Object.keys(ITEMS) as ItemType[];
export const PLACEABLE_ITEMS = ALL_ITEM_TYPES.filter((t) => ITEMS[t].isBlock);
export const TOOL_ITEMS = ALL_ITEM_TYPES.filter((t) => ITEMS[t].isTool) as ToolType[];

// ---- Inventory helpers ----
export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36; // 9 hotbar + 27 main

export type Inventory = (InventorySlot | null)[];

export function createInventory(): Inventory {
  return new Array(INVENTORY_SIZE).fill(null);
}

/** Try to add items to inventory (stacking first, then empty slots). */
export function addItem(inv: Inventory, item: ItemType, count = 1): Inventory {
  const def = ITEMS[item];
  const next = inv.map((s) => (s ? { ...s } : null));
  let rem = count;
  // Stack onto existing matching slots
  for (let i = 0; i < next.length && rem > 0; i++) {
    const s = next[i];
    if (s && s.item === item && s.count < def.stackSize) {
      const add = Math.min(rem, def.stackSize - s.count);
      s.count += add;
      rem -= add;
    }
  }
  // Fill empty slots
  for (let i = 0; i < next.length && rem > 0; i++) {
    if (!next[i]) {
      const add = Math.min(rem, def.stackSize);
      next[i] = { item, count: add, durability: def.durability };
      rem -= add;
    }
  }
  return next;
}

/** Remove count items from a specific slot. Returns updated inventory. */
export function removeFromSlot(inv: Inventory, slot: number, count = 1): Inventory {
  const next = inv.map((s) => (s ? { ...s } : null));
  const s = next[slot];
  if (!s) return next;
  if (s.count <= count) {
    next[slot] = null;
  } else {
    s.count -= count;
  }
  return next;
}

/** Remove count items of a given type from anywhere in inventory. */
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

/** Decrement durability of a tool. Returns updated inv + whether the tool broke. */
export function useTool(inv: Inventory, slot: number): { inv: Inventory; broke: boolean } {
  const next = inv.map((s) => (s ? { ...s } : null));
  const s = next[slot];
  if (!s || s.durability === undefined) return { inv: next, broke: false };
  if (s.durability <= 1) {
    next[slot] = null;
    return { inv: next, broke: true };
  }
  s.durability -= 1;
  return { inv: next, broke: false };
}

/** Count total of an item type across all slots. */
export function countItem(inv: Inventory, item: ItemType): number {
  return inv.reduce((sum, s) => sum + (s && s.item === item ? s.count : 0), 0);
}

/** Swap two inventory slots. */
export function swapSlots(inv: Inventory, a: number, b: number): Inventory {
  const next = [...inv];
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}
