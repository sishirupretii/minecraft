'use client';

import { useEffect } from 'react';

interface Props {
  visible: boolean;
  onClose: () => void;
  username: string;
  walletAddress?: string;
  displayName?: string;
  balanceTier: string;
  tierColor: string;
  ethBalance: string;
  stats: {
    blocksPlaced: number;
    blocksBroken: number;
    mobsKilled: number;
    deaths: number;
    playTimeSeconds: number;
    itemsCrafted?: number;
    itemsEnchanted?: number;
    villagerTrades?: number;
    emeraldsEarned?: number;
    distanceWalked?: number;
    highestY?: number;
    longestLifeSeconds?: number;
  };
  xpMultiplier?: string;
  achievementCount: number;
  totalAchievements: number;
  landClaimCount: number;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ProfilePanel({
  visible,
  onClose,
  username,
  walletAddress,
  displayName,
  balanceTier,
  tierColor,
  ethBalance,
  stats,
  achievementCount,
  totalAchievements,
  landClaimCount,
  xpMultiplier,
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

  const achievementPct = totalAchievements > 0
    ? Math.round((achievementCount / totalAchievements) * 100)
    : 0;

  const statItems: Array<{ label: string; value: string | number }> = [
    { label: 'Blocks Placed', value: stats.blocksPlaced },
    { label: 'Blocks Broken', value: stats.blocksBroken },
    { label: 'Mobs Killed', value: stats.mobsKilled },
    { label: 'Deaths', value: stats.deaths },
    { label: 'Play Time', value: formatPlayTime(stats.playTimeSeconds) },
    { label: 'Items Crafted', value: stats.itemsCrafted ?? 0 },
    { label: 'Enchantments', value: stats.itemsEnchanted ?? 0 },
    { label: 'Trades', value: stats.villagerTrades ?? 0 },
    { label: 'Emeralds Earned', value: stats.emeraldsEarned ?? 0 },
    { label: 'Distance Walked', value: `${Math.round(stats.distanceWalked ?? 0)} blocks` },
    { label: 'Highest Point', value: `Y=${Math.round(stats.highestY ?? 0)}` },
    { label: 'Longest Life', value: formatPlayTime(stats.longestLifeSeconds ?? 0) },
    { label: 'XP Multiplier', value: xpMultiplier ?? '1.0x' },
  ];

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bc-panel flex flex-col gap-4 p-6 relative"
        style={{ maxWidth: '420px', width: '100%' }}
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
          }}
        >
          PROFILE
        </div>

        {/* Identity section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {/* Player head placeholder */}
            <div
              style={{
                width: '40px',
                height: '40px',
                background: '#6a6a6a',
                border: '2px solid #444',
                boxShadow: 'inset 1px 1px 0 #888, inset -1px -1px 0 #333',
              }}
            />
            <div className="flex flex-col gap-1">
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '10px',
                  color: '#fff',
                  textShadow: '1px 1px 0 #000',
                }}
              >
                {displayName || username}
              </span>
              {walletAddress && (
                <span
                  title={walletAddress}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '15px',
                    color: 'rgba(255,255,255,0.5)',
                    cursor: 'help',
                  }}
                >
                  {truncateAddress(walletAddress)}
                </span>
              )}
            </div>
          </div>

          {/* Tier badge + ETH balance */}
          <div className="flex items-center gap-3" style={{ marginTop: '4px' }}>
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                color: tierColor,
                background: 'rgba(0,0,0,0.5)',
                border: `1px solid ${tierColor}`,
                padding: '3px 8px',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {balanceTier}
            </span>
            <span
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '18px',
                color: '#b0c4de',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {ethBalance} ETH
            </span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ height: '1px', background: '#555', margin: '2px 0' }} />

        {/* Stats grid */}
        <div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '8px',
              color: 'rgba(255,255,255,0.6)',
              textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              marginBottom: '8px',
            }}
          >
            STATISTICS
          </div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
          >
            {statItems.map((s) => (
              <div
                key={s.label}
                className="flex flex-col"
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid #444',
                  padding: '6px 8px',
                  boxShadow: 'inset 1px 1px 0 #333, inset -1px -1px 0 #111',
                }}
              >
                <span
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  {s.label}
                </span>
                <span
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '20px',
                    color: '#fff',
                    textShadow: '1px 1px 0 #000',
                  }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Separator */}
        <div style={{ height: '1px', background: '#555', margin: '2px 0' }} />

        {/* Achievement progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                color: 'rgba(255,255,255,0.6)',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              }}
            >
              ACHIEVEMENTS
            </span>
            <span
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                color: '#fff',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {achievementCount}/{totalAchievements}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '10px',
              background: '#222',
              border: '1px solid #555',
              boxShadow: 'inset 1px 1px 0 #111',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${achievementPct}%`,
                background: 'linear-gradient(180deg, #5cb85c 0%, #3a8a3a 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Land claims */}
        <div className="flex items-center justify-between">
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '8px',
              color: 'rgba(255,255,255,0.6)',
              textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
            }}
          >
            LAND CLAIMS
          </span>
          <span
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: '20px',
              color: '#e0c080',
              textShadow: '1px 1px 0 #000',
            }}
          >
            {landClaimCount}
          </span>
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
