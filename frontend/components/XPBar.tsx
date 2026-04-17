'use client';

interface Props {
  xp: number;
  level: number;
  xpToNext: number;
}

// XP required per level (simplified MC formula)
export function xpForLevel(level: number): number {
  if (level < 16) return level * 2 + 7;
  if (level < 31) return level * 5 - 38;
  return level * 9 - 158;
}

export function computeLevel(totalXp: number): { level: number; xpInLevel: number; xpToNext: number } {
  let level = 0;
  let remaining = totalXp;
  while (true) {
    const needed = xpForLevel(level);
    if (remaining < needed) return { level, xpInLevel: remaining, xpToNext: needed };
    remaining -= needed;
    level++;
  }
}

export default function XPBar({ xp, level, xpToNext }: Props) {
  const progress = xpToNext > 0 ? Math.min(1, xp / xpToNext) : 0;

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ bottom: '82px', width: '182px' }}
    >
      {/* XP bar */}
      <div
        style={{
          width: '100%',
          height: '5px',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progress * 100}%`,
            background: 'linear-gradient(180deg, #80ff20, #40c010)',
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>

      {/* Level number */}
      {level > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '-14px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: '#80ff20',
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
          }}
        >
          {level}
        </div>
      )}
    </div>
  );
}
