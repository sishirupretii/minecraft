'use client';

import { useEffect, useMemo } from 'react';

interface BountyTarget {
  mob: string;
  icon: string;
  killsNeeded: number;
  xpReward: number;
  emeraldReward: number;
  tier: 'common' | 'rare' | 'epic';
}

const BOUNTY_POOL: BountyTarget[] = [
  { mob: 'Zombie', icon: '🧟', killsNeeded: 5, xpReward: 50, emeraldReward: 3, tier: 'common' },
  { mob: 'Skeleton', icon: '💀', killsNeeded: 5, xpReward: 60, emeraldReward: 4, tier: 'common' },
  { mob: 'Spider', icon: '🕷️', killsNeeded: 8, xpReward: 70, emeraldReward: 4, tier: 'common' },
  { mob: 'Creeper', icon: '💥', killsNeeded: 3, xpReward: 80, emeraldReward: 5, tier: 'rare' },
  { mob: 'Enderman', icon: '👾', killsNeeded: 3, xpReward: 100, emeraldReward: 8, tier: 'rare' },
  { mob: 'Witch', icon: '🧙', killsNeeded: 2, xpReward: 120, emeraldReward: 10, tier: 'epic' },
  { mob: 'Phantom', icon: '👻', killsNeeded: 4, xpReward: 90, emeraldReward: 6, tier: 'rare' },
  { mob: 'Wolf Pack', icon: '🐺', killsNeeded: 6, xpReward: 55, emeraldReward: 3, tier: 'common' },
  { mob: 'Slime Horde', icon: '🟢', killsNeeded: 10, xpReward: 80, emeraldReward: 5, tier: 'rare' },
  { mob: 'Drowned', icon: '🌊', killsNeeded: 5, xpReward: 65, emeraldReward: 4, tier: 'common' },
  { mob: 'Iron Golem', icon: '🤖', killsNeeded: 1, xpReward: 150, emeraldReward: 15, tier: 'epic' },
  { mob: 'Blaze', icon: '🔥', killsNeeded: 3, xpReward: 110, emeraldReward: 8, tier: 'rare' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  mobsKilled: number;
  walletConnected: boolean;
  currentTier: string;
}

// Generate daily bounties based on current date (deterministic)
function getDailyBounties(date: Date): BountyTarget[] {
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const shuffled = [...BOUNTY_POOL];
  // Simple deterministic shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 1) * 7919) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 4);
}

const TIER_COLORS = {
  common: '#aaaaaa',
  rare: '#4488ff',
  epic: '#aa44ff',
};

export default function BountyBoard({ visible, onClose, mobsKilled, walletConnected, currentTier }: Props) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  const bounties = useMemo(() => getDailyBounties(new Date()), []);

  // Tier multiplier for bounty rewards
  const multiplier = currentTier === 'diamond' ? 3 : currentTier === 'gold' ? 2 : currentTier === 'silver' ? 1.5 : currentTier === 'bronze' ? 1.25 : 1;

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bc-panel flex flex-col gap-4 p-6 relative"
        style={{ maxWidth: '480px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '8px', right: '10px',
            fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
            color: '#aaa', background: 'none', border: 'none', cursor: 'pointer',
            textShadow: '1px 1px 0 #000',
          }}
        >
          X
        </button>

        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '12px',
          color: '#ffd700', textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
        }}>
          BOUNTY BOARD
        </div>

        <div style={{
          fontFamily: "'VT323', monospace", fontSize: '16px',
          color: 'rgba(255,255,255,0.5)',
        }}>
          Daily hunting contracts. Rewards refresh each day.
          {multiplier > 1 && (
            <span style={{ color: '#ffd700', marginLeft: '4px' }}>
              ({multiplier}x reward bonus)
            </span>
          )}
        </div>

        {!walletConnected && (
          <div style={{
            fontFamily: "'VT323', monospace", fontSize: '16px',
            color: '#ff8844', textAlign: 'center',
            padding: '8px', border: '1px solid #ff884444', background: 'rgba(255,136,68,0.1)',
          }}>
            Connect wallet for emerald bounty rewards!
          </div>
        )}

        {/* Bounty cards */}
        <div className="flex flex-col gap-3">
          {bounties.map((bounty, idx) => {
            const tierColor = TIER_COLORS[bounty.tier];
            const xp = Math.round(bounty.xpReward * multiplier);
            const em = Math.round(bounty.emeraldReward * multiplier);
            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: `2px solid ${tierColor}44`,
                  padding: '12px',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '24px' }}>{bounty.icon}</span>
                    <div>
                      <div style={{
                        fontFamily: "'Press Start 2P', monospace", fontSize: '9px',
                        color: '#fff', textShadow: '1px 1px 0 #000',
                      }}>
                        Hunt: {bounty.mob}
                      </div>
                      <div style={{
                        fontFamily: "'Press Start 2P', monospace", fontSize: '6px',
                        color: tierColor, textTransform: 'uppercase',
                        marginTop: '2px',
                      }}>
                        {bounty.tier}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "'Press Start 2P', monospace", fontSize: '8px',
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    x{bounty.killsNeeded}
                  </div>
                </div>

                {/* Rewards */}
                <div style={{
                  display: 'flex', gap: '12px',
                  fontFamily: "'VT323', monospace", fontSize: '16px',
                }}>
                  <span style={{ color: '#88ff88' }}>+{xp} XP</span>
                  {walletConnected && (
                    <span style={{ color: '#55ff99' }}>+{em} Emeralds</span>
                  )}
                </div>

                {/* Kill requirement bar */}
                <div style={{
                  fontFamily: "'VT323', monospace", fontSize: '14px',
                  color: 'rgba(255,255,255,0.4)',
                }}>
                  Kill {bounty.killsNeeded} {bounty.mob}s to claim
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats summary */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: "'VT323', monospace", fontSize: '16px',
          color: 'rgba(255,255,255,0.4)',
          borderTop: '1px solid #333', paddingTop: '8px',
        }}>
          <span>Total Mobs Killed: {mobsKilled}</span>
          <span>Tier: {currentTier || 'none'}</span>
        </div>

        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
          color: 'rgba(255,255,255,0.3)', textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
          textAlign: 'center',
        }}>
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}
