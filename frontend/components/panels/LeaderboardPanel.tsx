'use client';

import { useEffect } from 'react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  blocks_placed: number;
  mobs_killed: number;
  balance_tier: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
  currentUsername: string;
}

const TIER_COLORS: Record<string, string> = {
  none:    '#888888',
  base:    '#0052ff',
  bronze:  '#cd7f32',
  silver:  '#c0c0c0',
  gold:    '#ffd700',
  diamond: '#b9f2ff',
};

function getTierColor(tier: string): string {
  return TIER_COLORS[tier.toLowerCase()] || '#9ca3af';
}

export default function LeaderboardPanel({
  visible,
  onClose,
  entries,
  currentUsername,
}: Props) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bc-panel flex flex-col gap-3 p-6 relative"
        style={{ maxWidth: '560px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '8px',
            right: '10px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            color: '#aaa',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textShadow: '1px 1px 0 #000',
          }}
        >
          X
        </button>

        {/* Header */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '12px',
            color: 'rgba(255,255,255,0.85)',
            textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
            marginBottom: '4px',
          }}
        >
          LEADERBOARD
        </div>

        {/* Table header */}
        <div
          className="flex items-center gap-2"
          style={{
            padding: '4px 8px',
            borderBottom: '1px solid #555',
          }}
        >
          <span style={{ ...colHeaderStyle, width: '36px' }}>#</span>
          <span style={{ ...colHeaderStyle, flex: 1 }}>PLAYER</span>
          <span style={{ ...colHeaderStyle, width: '70px', textAlign: 'right' }}>SCORE</span>
          <span style={{ ...colHeaderStyle, width: '60px', textAlign: 'right' }}>BLOCKS</span>
          <span style={{ ...colHeaderStyle, width: '50px', textAlign: 'right' }}>KILLS</span>
        </div>

        {/* Entries */}
        <div
          className="flex flex-col gap-[2px] overflow-y-auto"
          style={{ maxHeight: '400px' }}
        >
          {entries.map((entry) => {
            const isCurrentPlayer = entry.username === currentUsername;
            const tierColor = getTierColor(entry.balance_tier);
            const rankColor =
              entry.rank === 1 ? '#ffd700' :
              entry.rank === 2 ? '#c0c0c0' :
              entry.rank === 3 ? '#cd7f32' :
              'rgba(255,255,255,0.7)';

            return (
              <div
                key={entry.rank}
                className="flex items-center gap-2"
                style={{
                  padding: '5px 8px',
                  background: isCurrentPlayer
                    ? 'rgba(255,215,0,0.12)'
                    : 'rgba(0,0,0,0.25)',
                  border: isCurrentPlayer
                    ? '1px solid rgba(255,215,0,0.35)'
                    : '1px solid transparent',
                  boxShadow: isCurrentPlayer
                    ? 'inset 0 0 8px rgba(255,215,0,0.08)'
                    : 'none',
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    width: '36px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '9px',
                    color: rankColor,
                    textShadow: '1px 1px 0 #000',
                  }}
                >
                  {entry.rank}
                </span>

                {/* Tier dot + Username */}
                <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: tierColor,
                      boxShadow: `0 0 4px ${tierColor}`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: '18px',
                      color: isCurrentPlayer ? '#ffd700' : '#fff',
                      textShadow: '1px 1px 0 #000',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.username}
                  </span>
                </div>

                {/* Score */}
                <span
                  style={{
                    width: '70px',
                    fontFamily: "'VT323', monospace",
                    fontSize: '18px',
                    color: '#fff',
                    textShadow: '1px 1px 0 #000',
                    textAlign: 'right',
                  }}
                >
                  {entry.score.toLocaleString()}
                </span>

                {/* Blocks */}
                <span
                  style={{
                    width: '60px',
                    fontFamily: "'VT323', monospace",
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.6)',
                    textAlign: 'right',
                  }}
                >
                  {entry.blocks_placed.toLocaleString()}
                </span>

                {/* Kills */}
                <span
                  style={{
                    width: '50px',
                    fontFamily: "'VT323', monospace",
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.6)',
                    textAlign: 'right',
                  }}
                >
                  {entry.mobs_killed.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Close hint */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '7px',
            color: 'rgba(255,255,255,0.3)',
            textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
            textAlign: 'center',
            marginTop: '4px',
          }}
        >
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}

const colHeaderStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: '7px',
  color: 'rgba(255,255,255,0.45)',
  textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
};
