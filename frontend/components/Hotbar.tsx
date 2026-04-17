'use client';

import { ITEMS, InventorySlot, HOTBAR_SIZE } from '@/lib/items';

interface Props {
  slots: (InventorySlot | null)[]; // first 9 slots of inventory
  selected: number;                // 0-8
  onSelect: (idx: number) => void;
}

export default function Hotbar({ slots, selected, onSelect }: Props) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-[3px]">
      {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
        const slot = slots[i] ?? null;
        const def = slot ? ITEMS[slot.item] : null;
        const active = i === selected;
        const empty = !slot;
        return (
          <button
            key={i}
            className={`hotbar-slot ${active ? 'active' : ''}`}
            onClick={() => onSelect(i)}
            title={def ? `${i + 1} · ${def.label} · ${slot!.count}` : `${i + 1} · Empty`}
            style={{ opacity: empty ? 0.4 : 1 }}
          >
            <div className="relative">
              {slot && def && (
                <>
                  <div
                    className="h-8 w-8"
                    style={{
                      background: def.color,
                      boxShadow: 'inset 0 -6px 0 rgba(0,0,0,0.25), inset 0 4px 0 rgba(255,255,255,0.1)',
                      borderRadius: def.isTool ? '2px' : '0',
                      transform: def.isTool ? 'rotate(-45deg) scale(0.85)' : 'none',
                    }}
                  />
                  {/* Tool kind letter overlay */}
                  {def.isTool && def.toolKind && (
                    <span
                      className="absolute"
                      style={{
                        top: '-1px',
                        left: '1px',
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: '7px',
                        color: '#fff',
                        textShadow: '1px 1px 0 #000',
                      }}
                    >
                      {def.toolKind[0].toUpperCase()}
                    </span>
                  )}
                </>
              )}
              {/* Key hint (small, top-left) */}
              {!def?.isTool && (
                <span
                  className="absolute -top-1 -left-1 px-1"
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '7px',
                    color: 'rgba(255,255,255,0.45)',
                    background: 'rgba(0,0,0,0.5)',
                    textShadow: '1px 1px 0 #000',
                  }}
                >
                  {i + 1}
                </span>
              )}
              {/* Count (Minecraft-style, bottom-right) */}
              {slot && slot.count > 1 && (
                <span
                  className="absolute -bottom-1 -right-1 font-mono text-[13px] font-bold leading-none text-white"
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '9px',
                    textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000',
                  }}
                >
                  {slot.count}
                </span>
              )}
              {/* Durability bar */}
              {slot && slot.durability !== undefined && def && def.durability && (
                <div
                  className="absolute -bottom-1 left-1"
                  style={{ width: '24px', height: '2px', background: '#333' }}
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
            </div>
          </button>
        );
      })}
    </div>
  );
}
