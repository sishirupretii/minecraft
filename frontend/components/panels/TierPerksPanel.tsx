'use client';

import { useEffect } from 'react';

interface TierPerk {
  tier: string;
  color: string;
  minEth: string;
  xpMulti: string;
  killBounty: string;
  maxEnchant: string;
  beaconMulti: string;
  miningSpeed: string;
  speedBonus: string;
  exclusiveBlocks: string[];
  extras: string[];
}

const TIER_PERKS: TierPerk[] = [
  {
    tier: 'Base',
    color: '#0052ff',
    minEth: '> 0 ETH',
    xpMulti: '1.1x',
    killBounty: '1 Emerald',
    maxEnchant: 'III',
    beaconMulti: '1.0x',
    miningSpeed: '1.05x',
    speedBonus: '—',
    exclusiveBlocks: ['Base Block'],
    extras: ['Wallet Rewards (5min)', 'Starter Kit', 'Land Claims', 'Keep 3 slots on death', '4% Lucky Mining', '3% Damage Reduction', '4s Respawn Protection', '10% Bonus Mob Drops'],
  },
  {
    tier: 'Bronze',
    color: '#cd7f32',
    minEth: '≥ 0.01 ETH',
    xpMulti: '1.25x',
    killBounty: '1 Emerald',
    maxEnchant: 'IV',
    beaconMulti: '1.2x',
    miningSpeed: '1.15x',
    speedBonus: '+2%',
    exclusiveBlocks: ['Base Block', 'Bronze Block', 'Beacon'],
    extras: ['Better Starter Kit', 'Name Glow', 'Keep 5 slots on death', '6% Lucky Mining', '6% Damage Reduction', '5s Respawn Protection', '15% Bonus Mob Drops'],
  },
  {
    tier: 'Silver',
    color: '#c0c0c0',
    minEth: '≥ 0.1 ETH',
    xpMulti: '1.5x',
    killBounty: '2 Emeralds',
    maxEnchant: 'V',
    beaconMulti: '1.5x',
    miningSpeed: '1.3x',
    speedBonus: '+5%',
    exclusiveBlocks: ['Silver Block', 'Nether Portal'],
    extras: ['◆ Name Prefix', 'Chat Color', 'Keep full hotbar on death', '8% Lucky Mining', '10% less hunger', '10% Damage Reduction', '6s Respawn Protection', '20% Bonus Mob Drops'],
  },
  {
    tier: 'Gold',
    color: '#ffd700',
    minEth: '≥ 0.5 ETH',
    xpMulti: '2.0x',
    killBounty: '3 Emeralds',
    maxEnchant: 'VI',
    beaconMulti: '2.0x',
    miningSpeed: '1.5x',
    speedBonus: '+8%',
    exclusiveBlocks: ['Gold Block'],
    extras: ['★ Name Prefix', 'Particles', 'Keep 18 slots on death', '12% Lucky Mining', '25% less hunger', '15% Damage Reduction', '8s Respawn Protection', '30% Bonus Mob Drops', '/heal & /weather commands'],
  },
  {
    tier: 'Diamond',
    color: '#b9f2ff',
    minEth: '≥ 1.0 ETH',
    xpMulti: '3.0x',
    killBounty: '5 Emeralds',
    maxEnchant: 'VII',
    beaconMulti: '3.0x',
    miningSpeed: '2.0x',
    speedBonus: '+12%',
    exclusiveBlocks: ['Crystal Block', 'Nether Star'],
    extras: ['✦ Name Prefix', 'Full Particles', 'Keep ALL items on death', '18% Lucky Mining', 'Auto-repair tools', '20% Damage Reduction', '10s Respawn Protection', '40% Bonus Mob Drops', '/give & /xp commands'],
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  currentTier: string;
}

export default function TierPerksPanel({ visible, onClose, currentTier }: Props) {
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
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bc-panel flex flex-col gap-3 p-6 relative"
        style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
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
          color: 'rgba(255,255,255,0.85)', textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
          marginBottom: '8px',
        }}>
          ⛓ ON-CHAIN TIER PERKS
        </div>

        <div style={{
          fontFamily: "'VT323', monospace", fontSize: '16px',
          color: 'rgba(255,255,255,0.5)', marginBottom: '8px',
        }}>
          Connect your wallet on Base to unlock exclusive perks. Higher ETH balance = higher tier!
        </div>

        <div className="flex flex-col gap-3">
          {TIER_PERKS.map((perk) => {
            const isActive = perk.tier.toLowerCase() === currentTier.toLowerCase();
            return (
              <div
                key={perk.tier}
                style={{
                  background: isActive ? `rgba(${hexToRgb(perk.color)}, 0.15)` : 'rgba(0,0,0,0.3)',
                  border: isActive ? `2px solid ${perk.color}` : '1px solid #444',
                  padding: '12px',
                  boxShadow: isActive ? `inset 0 0 12px rgba(${hexToRgb(perk.color)}, 0.1)` : 'none',
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span style={{
                    fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
                    color: perk.color, textShadow: '1px 1px 0 #000',
                  }}>
                    {perk.tier.toUpperCase()} {isActive && '← YOU'}
                  </span>
                  <span style={{
                    fontFamily: "'VT323', monospace", fontSize: '15px',
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    {perk.minEth}
                  </span>
                </div>

                <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <PerkItem label="XP Multiplier" value={perk.xpMulti} />
                  <PerkItem label="Kill Bounty" value={perk.killBounty} />
                  <PerkItem label="Max Enchant" value={perk.maxEnchant} />
                  <PerkItem label="Beacon Power" value={perk.beaconMulti} />
                  <PerkItem label="Mining Speed" value={perk.miningSpeed} />
                  <PerkItem label="Speed Bonus" value={perk.speedBonus} />
                </div>

                {perk.exclusiveBlocks.length > 0 && (
                  <div style={{
                    fontFamily: "'VT323', monospace", fontSize: '14px',
                    color: perk.color, marginTop: '4px',
                  }}>
                    Blocks: {perk.exclusiveBlocks.join(', ')}
                  </div>
                )}

                {perk.extras.length > 0 && (
                  <div style={{
                    fontFamily: "'VT323', monospace", fontSize: '13px',
                    color: 'rgba(255,255,255,0.4)', marginTop: '2px',
                  }}>
                    {perk.extras.join(' • ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
          color: 'rgba(255,255,255,0.3)', textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
          textAlign: 'center', marginTop: '8px',
        }}>
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}

function PerkItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between" style={{ padding: '2px 4px' }}>
      <span style={{
        fontFamily: "'VT323', monospace", fontSize: '14px',
        color: 'rgba(255,255,255,0.5)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'VT323', monospace", fontSize: '14px',
        color: '#fff', textShadow: '1px 1px 0 #000',
      }}>
        {value}
      </span>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
