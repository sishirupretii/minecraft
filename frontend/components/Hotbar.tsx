'use client';

import { BLOCKS, BLOCK_TYPES, BlockType } from '@/lib/blocks';

interface Props {
  selected: number;
  counts: Record<BlockType, number>;
  onSelect: (idx: number) => void;
}

export default function Hotbar({ selected, counts, onSelect }: Props) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
      {BLOCK_TYPES.map((type: BlockType, i) => {
        const meta = BLOCKS[type];
        const active = i === selected;
        const count = counts[type] ?? 0;
        const empty = count === 0;
        return (
          <button
            key={type}
            className={`hotbar-slot ${active ? 'active' : ''}`}
            onClick={() => onSelect(i)}
            title={`${i + 1} · ${meta.label} · ${count}`}
            style={{ opacity: empty ? 0.4 : 1 }}
          >
            <div className="relative">
              <div
                className="h-8 w-8 rounded-sm"
                style={{
                  background: meta.colorStr,
                  boxShadow: 'inset 0 -6px 0 rgba(0,0,0,0.25), inset 0 4px 0 rgba(255,255,255,0.1)',
                }}
              />
              {/* Key hint (small, top-left) */}
              <span className="absolute -top-1 -left-1 rounded-sm bg-black/60 px-1 text-[9px] text-white/50">
                {i + 1}
              </span>
              {/* Count (Minecraft-style, bottom-right). Hide when zero so
                  empty slots look empty rather than cluttered. */}
              {count > 0 && (
                <span
                  className="absolute -bottom-1 -right-1 font-mono text-[13px] font-bold leading-none text-white"
                  style={{ textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000' }}
                >
                  {count}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
