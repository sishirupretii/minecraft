'use client';

import { useState, useMemo } from 'react';
import {
  ITEMS,
  ItemType,
  InventorySlot,
  Inventory,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  swapSlots,
} from '@/lib/items';
import { RECIPES, Recipe, canCraft } from '@/lib/recipes';

interface Props {
  inventory: Inventory;
  onInventoryChange: (inv: Inventory) => void;
  onCraft: (recipe: Recipe) => void;
  nearCraftingTable: boolean; // player is within 3 blocks of a crafting_table
  nearFurnace?: boolean;      // player is within 4 blocks of a furnace
  onClose: () => void;
}

// Renders one slot (shared between inventory grid and hotbar row)
function Slot({
  slot,
  index,
  selected,
  onClick,
}: {
  slot: InventorySlot | null;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const def = slot ? ITEMS[slot.item] : null;
  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center"
      style={{
        width: '42px',
        height: '42px',
        background: selected ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.5)',
        border: selected ? '2px solid #fff' : '2px solid #555',
        boxShadow: selected
          ? 'inset 1px 1px 0 #aaa, inset -1px -1px 0 #333'
          : 'inset 1px 1px 0 #333, inset -1px -1px 0 #111',
        imageRendering: 'pixelated' as any,
      }}
    >
      {slot && def && (
        <>
          {/* Item color swatch */}
          <div
            style={{
              width: '28px',
              height: '28px',
              background: def.color,
              boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.1)',
              borderRadius: def.isTool ? '2px' : '0',
              transform: def.isTool ? 'rotate(-45deg) scale(0.8)' : 'none',
            }}
          />
          {/* Tool kind letter */}
          {def.isTool && def.toolKind && (
            <span
              className="absolute"
              style={{
                top: '2px',
                left: '3px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '7px',
                color: '#fff',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {def.toolKind[0].toUpperCase()}
            </span>
          )}
          {/* Count */}
          {slot.count > 1 && (
            <span
              className="absolute"
              style={{
                bottom: '1px',
                right: '2px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                color: '#fff',
                textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000',
              }}
            >
              {slot.count}
            </span>
          )}
          {/* Durability bar */}
          {slot.durability !== undefined && def.durability && (
            <div
              className="absolute"
              style={{
                bottom: '2px',
                left: '4px',
                width: '24px',
                height: '2px',
                background: '#333',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(slot.durability / def.durability) * 100}%`,
                  background:
                    slot.durability / def.durability > 0.5
                      ? '#5cb85c'
                      : slot.durability / def.durability > 0.25
                        ? '#f0ad4e'
                        : '#d9534f',
                }}
              />
            </div>
          )}
        </>
      )}
    </button>
  );
}

export default function InventoryScreen({
  inventory,
  onInventoryChange,
  onCraft,
  nearCraftingTable,
  nearFurnace = false,
  onClose,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // Filter recipes: show all, but gray out ones that can't be crafted
  const recipeStates = useMemo(() => {
    return RECIPES.map((r) => ({
      recipe: r,
      craftable: canCraft(inventory, r) && (!r.needsTable || nearCraftingTable) && (!r.needsFurnace || nearFurnace),
      hasIngredients: canCraft(inventory, r),
      needsTableButFar: r.needsTable && !nearCraftingTable,
      needsFurnaceButFar: r.needsFurnace && !nearFurnace,
    }));
  }, [inventory, nearCraftingTable, nearFurnace]);

  function handleSlotClick(index: number) {
    if (selectedSlot === null) {
      if (inventory[index]) setSelectedSlot(index);
    } else if (selectedSlot === index) {
      setSelectedSlot(null);
    } else {
      // Swap the two slots
      onInventoryChange(swapSlots(inventory, selectedSlot, index));
      setSelectedSlot(null);
    }
  }

  function handleCraft(r: Recipe) {
    onCraft(r);
  }

  // Split inventory into hotbar (0-8) and main (9-35)
  const hotbar = inventory.slice(0, HOTBAR_SIZE);
  const main = inventory.slice(HOTBAR_SIZE, INVENTORY_SIZE);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bc-panel flex gap-6 p-6"
        style={{ maxWidth: '700px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Inventory grid */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '10px',
                color: 'rgba(255,255,255,0.7)',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              }}
            >
              INVENTORY
            </span>
            <button
              onClick={() => {
                // Sort inventory: group same items, sort by type
                const hotbar = inventory.slice(0, HOTBAR_SIZE);
                const main = inventory.slice(HOTBAR_SIZE, INVENTORY_SIZE);
                // Consolidate stacks
                const itemMap = new Map<string, { item: ItemType; count: number; durability?: number }>();
                for (const slot of main) {
                  if (!slot) continue;
                  const key = slot.durability !== undefined ? `${slot.item}_${slot.durability}` : slot.item;
                  const existing = itemMap.get(key);
                  if (existing && slot.durability === undefined) {
                    existing.count += slot.count;
                  } else {
                    itemMap.set(key, { ...slot });
                  }
                }
                // Sort by category then name
                const sorted = Array.from(itemMap.values()).sort((a, b) => {
                  const da = ITEMS[a.item];
                  const db = ITEMS[b.item];
                  const catA = da.isBlock ? 0 : da.isTool ? 1 : da.isArmor ? 2 : da.isFood ? 3 : 4;
                  const catB = db.isBlock ? 0 : db.isTool ? 1 : db.isArmor ? 2 : db.isFood ? 3 : 4;
                  if (catA !== catB) return catA - catB;
                  return da.label.localeCompare(db.label);
                });
                // Rebuild inventory
                const newMain: (InventorySlot | null)[] = [];
                for (const item of sorted) {
                  const def = ITEMS[item.item];
                  let remaining = item.count;
                  while (remaining > 0) {
                    const add = Math.min(remaining, def.stackSize);
                    newMain.push({ item: item.item, count: add, durability: item.durability });
                    remaining -= add;
                  }
                }
                while (newMain.length < INVENTORY_SIZE - HOTBAR_SIZE) newMain.push(null);
                const newInv = [...hotbar, ...newMain.slice(0, INVENTORY_SIZE - HOTBAR_SIZE)];
                onInventoryChange(newInv);
              }}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '7px',
                color: '#aaa',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid #555',
                padding: '2px 6px',
                cursor: 'pointer',
              }}
            >
              SORT
            </button>
          </div>

          {/* Main inventory (3 rows of 9) */}
          <div className="flex flex-col gap-[2px]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-[2px]">
                {Array.from({ length: 9 }).map((_, col) => {
                  const idx = HOTBAR_SIZE + row * 9 + col;
                  return (
                    <Slot
                      key={idx}
                      slot={main[row * 9 + col] ?? null}
                      index={idx}
                      selected={selectedSlot === idx}
                      onClick={() => handleSlotClick(idx)}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Separator */}
          <div style={{ height: '4px' }} />

          {/* Hotbar row */}
          <div className="flex gap-[2px]">
            {hotbar.map((slot, i) => (
              <Slot
                key={i}
                slot={slot}
                index={i}
                selected={selectedSlot === i}
                onClick={() => handleSlotClick(i)}
              />
            ))}
          </div>
        </div>

        {/* Right: Crafting recipes */}
        <div className="flex flex-col gap-2" style={{ minWidth: '220px' }}>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.7)',
              textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              marginBottom: '4px',
            }}
          >
            CRAFTING
          </div>

          <div
            className="flex flex-col gap-1 overflow-y-auto pr-1"
            style={{ maxHeight: '320px' }}
          >
            {recipeStates.map(({ recipe, craftable, hasIngredients, needsTableButFar, needsFurnaceButFar }) => {
              const resultDef = ITEMS[recipe.result.item];
              return (
                <button
                  key={recipe.id}
                  disabled={!craftable}
                  onClick={() => handleCraft(recipe)}
                  className="flex items-center gap-2 px-2 py-2 text-left transition-none"
                  style={{
                    background: craftable ? 'rgba(106,168,79,0.25)' : 'rgba(0,0,0,0.3)',
                    border: craftable ? '2px solid #5a8a3a' : '2px solid #333',
                    opacity: hasIngredients ? 1 : 0.45,
                    cursor: craftable ? 'pointer' : 'not-allowed',
                  }}
                >
                  {/* Result icon */}
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      background: resultDef.color,
                      boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.25)',
                      flexShrink: 0,
                      transform: resultDef.isTool ? 'rotate(-45deg) scale(0.75)' : 'none',
                    }}
                  />
                  <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '16px',
                        color: '#fff',
                        textShadow: '1px 1px 0 #000',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {resultDef.label}
                      {recipe.result.count > 1 ? ` ×${recipe.result.count}` : ''}
                    </span>
                    <span
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {recipe.ingredients.map((ing) => `${ITEMS[ing.item].label}×${ing.count}`).join(' + ')}
                      {needsTableButFar ? ' (need table)' : ''}
                      {needsFurnaceButFar ? ' (need furnace)' : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {nearCraftingTable && (
            <div
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '14px',
                color: '#b5e08c',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
                marginTop: '4px',
              }}
            >
              ◆ Crafting table in range
            </div>
          )}
          {nearFurnace && (
            <div
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '14px',
                color: '#e0c080',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
                marginTop: '2px',
              }}
            >
              ◆ Furnace in range
            </div>
          )}
        </div>
      </div>

      {/* Close hint */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '9px',
          color: 'rgba(255,255,255,0.4)',
          textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
        }}
      >
        PRESS E OR ESC TO CLOSE
      </div>
    </div>
  );
}
