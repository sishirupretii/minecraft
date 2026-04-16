'use client';

import { BLOCKS, BLOCK_TYPES, BlockType } from '@/lib/blocks';

interface Props {
  selected: number;
  onSelect: (idx: number) => void;
}

export default function Hotbar({ selected, onSelect }: Props) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
      {BLOCK_TYPES.map((type: BlockType, i) => {
        const meta = BLOCKS[type];
        const active = i === selected;
        return (
          <button
            key={type}
            className={`hotbar-slot ${active ? 'active' : ''}`}
            onClick={() => onSelect(i)}
            title={`${i + 1} · ${meta.label}`}
          >
            <div className="relative">
              <div
                className="h-8 w-8 rounded-sm"
                style={{
                  background: meta.colorStr,
                  boxShadow: 'inset 0 -6px 0 rgba(0,0,0,0.25), inset 0 4px 0 rgba(255,255,255,0.1)',
                }}
              />
              <span className="absolute -bottom-1 -right-1 rounded-sm bg-black/70 px-1 text-[10px] text-white/80">
                {i + 1}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
