'use client';

import { useEffect, useState } from 'react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  wallet_address?: string | null;
  score: number;
  blocks_placed: number;
  blocks_broken?: number;
  mobs_killed: number;
  deaths?: number;
  base_coins_collected?: number;
  balance_tier: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
  currentUsername: string;
  onSwitchMode?: (mode: LeaderboardMode) => void;
}

export type LeaderboardMode = 'score' | 'coins' | 'mobs' | 'blocks';

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

function shortWallet(addr?: string | null): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardPanel({
  visible,
  onClose,
  entries,
  currentUsername,
  onSwitchMode,
}: Props) {
  const [mode, setMode] = useState<LeaderboardMode>('coins');

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  useEffect(() => {
    if (visible && onSwitchMode) onSwitchMode(mode);
  }, [mode, visible, onSwitchMode]);

  if (!visible) return null;

  const primaryColLabel: Record<LeaderboardMode, string> = {
    score: 'SCORE',
    coins: '⬢ COINS',
    mobs: 'KILLS',
    blocks: 'BLOCKS',
  };

  function primaryValue(e: LeaderboardEntry): number {
    switch (mode) {
      case 'coins': return e.base_coins_collected ?? 0;
      case 'mobs': return e.mobs_killed ?? 0;
      case 'blocks': return e.blocks_placed ?? 0;
      default: return e.score ?? 0;
    }
  }

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
        style={{ maxWidth: '640px', width: '100%' }}
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

        {/* Reward banner (Base coins mode) */}
        {mode === 'coins' && (
          <div
            style={{
              padding: '8px 10px',
              background: 'linear-gradient(90deg, rgba(0,82,255,0.2), rgba(0,82,255,0.08))',
              border: '1px solid rgba(0,82,255,0.4)',
              fontFamily: "'VT323', monospace",
              fontSize: '15px',
              color: '#a8c7ff',
              textShadow: '1px 1px 0 #000',
            }}
          >
            🏆 Top <strong style={{ color: '#fff' }}>Base Coin</strong> collectors win rewards! Connect your wallet so devs can send ETH on Base.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1" style={{ borderBottom: '1px solid #333', paddingBottom: '4px' }}>
          {(['coins', 'score', 'mobs', 'blocks'] as LeaderboardMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                padding: '6px 10px',
                background: mode === m ? 'rgba(0,82,255,0.35)' : 'rgba(0,0,0,0.35)',
                border: mode === m ? '1px solid #0052ff' : '1px solid #444',
                color: mode === m ? '#fff' : '#aaa',
                cursor: 'pointer',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {primaryColLabel[m]}
            </button>
          ))}
        </div>

        {/* Table header */}
        <div
          className="flex items-center gap-2"
          style={{
            padding: '4px 8px',
            borderBottom: '1px solid #555',
          }}
        >
          <span style={{ ...colHeaderStyle, width: '30px' }}>#</span>
          <span style={{ ...colHeaderStyle, flex: 1 }}>PLAYER</span>
          <span style={{ ...colHeaderStyle, width: '120px' }}>WALLET</span>
          <span style={{ ...colHeaderStyle, width: '70px', textAlign: 'right' }}>
            {primaryColLabel[mode]}
          </span>
        </div>

        {/* Entries */}
        <div
          className="flex flex-col gap-[2px] overflow-y-auto"
          style={{ maxHeight: '400px' }}
        >
          {entries.length === 0 && (
            <div
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                color: 'rgba(255,255,255,0.4)',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              No players yet — be the first!
            </div>
          )}
          {entries.map((entry) => {
            const isCurrentPlayer = entry.username === currentUsername;
            const tierColor = getTierColor(entry.balance_tier);
            const rankColor =
              entry.rank === 1 ? '#ffd700' :
              entry.rank === 2 ? '#c0c0c0' :
              entry.rank === 3 ? '#cd7f32' :
              'rgba(255,255,255,0.7)';
            const val = primaryValue(entry);
            return (
              <div
                key={`${entry.rank}-${entry.username}`}
                className="flex items-center gap-2"
                style={{
                  padding: '5px 8px',
                  background: isCurrentPlayer
                    ? 'rgba(255,215,0,0.12)'
                    : mode === 'coins' && entry.rank <= 3
                      ? 'rgba(0,82,255,0.12)'
                      : 'rgba(0,0,0,0.25)',
                  border: isCurrentPlayer
                    ? '1px solid rgba(255,215,0,0.35)'
                    : '1px solid transparent',
                  boxShadow: isCurrentPlayer
                    ? 'inset 0 0 8px rgba(255,215,0,0.08)'
                    : 'none',
                }}
              >
                <span
                  style={{
                    width: '30px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '9px',
                    color: rankColor,
                    textShadow: '1px 1px 0 #000',
                  }}
                >
                  {entry.rank}
                </span>
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
                {/* Wallet (short) */}
                <span
                  style={{
                    width: '120px',
                    fontFamily: "'VT323', monospace",
                    fontSize: '14px',
                    color: entry.wallet_address ? '#88aaff' : 'rgba(255,255,255,0.25)',
                    textShadow: '1px 1px 0 #000',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.wallet_address ? shortWallet(entry.wallet_address) : 'no wallet'}
                </span>
                {/* Primary value */}
                <span
                  style={{
                    width: '70px',
                    fontFamily: "'VT323', monospace",
                    fontSize: '18px',
                    color: mode === 'coins' ? '#5c9cff' : '#fff',
                    textShadow: mode === 'coins' ? '0 0 6px rgba(0,82,255,0.6), 1px 1px 0 #000' : '1px 1px 0 #000',
                    textAlign: 'right',
                    fontWeight: 'bold',
                  }}
                >
                  {mode === 'coins' && '⬢ '}{val.toLocaleString()}
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
