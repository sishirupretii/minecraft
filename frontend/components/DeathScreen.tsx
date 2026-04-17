'use client';

import { useMemo } from 'react';

interface Props {
  visible: boolean;
  onRespawn: () => void;
  score?: number;
  keepSlots?: number;
  tierLabel?: string;
  tierColor?: string;
  deathCause?: string;
  deaths?: number;
}

const DEATH_TIPS = [
  'Craft armor to reduce incoming damage',
  'Cooked food restores more hunger than raw',
  'Shields block 50% of incoming damage',
  'Enchant your weapons for bonus effects',
  'Fire Resistance potions make you immune to lava',
  'Torches keep hostile mobs away at night',
  'Diamond tier players keep all items on death',
  'Always carry a bed to set your spawn point',
  'Higher tiers earn XP faster — connect your wallet!',
  'Press CTRL to sprint away from danger',
  'Beacons give speed, regen, and strength buffs',
  'Hay bales reduce fall damage by 80%',
  'Use /sethome to save custom teleport points',
  'Campfires automatically cook raw food nearby',
  'Build shelter before your first night!',
];

const DEATH_TITLES: Record<string, string[]> = {
  default: ['YOU DIED', 'GAME OVER', 'WASTED', 'DEFEATED'],
  lava: ['BURNED', 'CRISPY', 'MELTED'],
  fall: ['SPLAT', 'GRAVITY WINS', 'YOU DIED'],
  drown: ['GLUB GLUB', 'DROWNED', 'YOU DIED'],
  starve: ['FAMISHED', 'STARVED', 'YOU DIED'],
  void: ['INTO THE VOID', 'GONE', 'YOU DIED'],
};

function getDeathTitle(cause?: string): string {
  if (!cause) return 'YOU DIED';
  const lower = cause.toLowerCase();
  let pool = DEATH_TITLES.default;
  if (lower.includes('lava') || lower.includes('fire') || lower.includes('burn')) pool = DEATH_TITLES.lava;
  else if (lower.includes('fell') || lower.includes('fall')) pool = DEATH_TITLES.fall;
  else if (lower.includes('drown') || lower.includes('water')) pool = DEATH_TITLES.drown;
  else if (lower.includes('starv') || lower.includes('hunger')) pool = DEATH_TITLES.starve;
  else if (lower.includes('void')) pool = DEATH_TITLES.void;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function DeathScreen({ visible, onRespawn, score, keepSlots = 0, tierLabel, tierColor, deathCause, deaths }: Props) {
  const title = useMemo(() => getDeathTitle(deathCause), [deathCause]);
  const tip = useMemo(() => DEATH_TIPS[Math.floor(Math.random() * DEATH_TIPS.length)], [visible]);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(120, 0, 0, 0.65)' }}
    >
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '40px',
          color: '#ff4444',
          textShadow: '3px 3px 0 rgba(0,0,0,0.8), -1px -1px 0 rgba(0,0,0,0.4)',
          marginBottom: '16px',
          letterSpacing: '4px',
        }}
      >
        {title}
      </div>

      {deathCause && (
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '20px',
            color: 'rgba(255,255,255,0.6)',
            marginBottom: '8px',
          }}
        >
          {deathCause}
        </div>
      )}

      {score !== undefined && score > 0 && (
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '22px',
            color: 'rgba(255,200,100,0.9)',
            marginBottom: '4px',
          }}
        >
          Level: {score}
        </div>
      )}

      {/* Death count */}
      {deaths !== undefined && deaths > 0 && (
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            color: 'rgba(255,255,255,0.35)',
            marginBottom: '8px',
          }}
        >
          Deaths: {deaths}
        </div>
      )}

      {/* Tier keep info */}
      <div
        style={{
          fontFamily: "'VT323', monospace",
          fontSize: '18px',
          color: keepSlots >= 36 ? '#88ff88' : keepSlots > 0 ? '#ffcc44' : '#ff8888',
          marginBottom: '12px',
          textAlign: 'center',
        }}
      >
        {keepSlots >= 36 ? (
          <span>
            <span style={{ color: tierColor || '#b9f2ff' }}>{tierLabel}</span> tier: Keeping all items!
          </span>
        ) : keepSlots > 0 ? (
          <span>
            <span style={{ color: tierColor || '#fff' }}>{tierLabel}</span> tier: Keeping {keepSlots} inventory slots
          </span>
        ) : (
          <span>All items will be lost!</span>
        )}
      </div>

      {/* Random tip */}
      <div
        style={{
          fontFamily: "'VT323', monospace",
          fontSize: '14px',
          color: 'rgba(255,255,150,0.5)',
          marginBottom: '16px',
          textAlign: 'center',
          maxWidth: '400px',
        }}
      >
        💡 Tip: {tip}
      </div>

      {/* Tip for non-wallet users */}
      {keepSlots === 0 && (
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '14px',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '16px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          Connect a wallet with ETH on Base to keep items on death
        </div>
      )}

      <button
        onClick={onRespawn}
        className="bc-btn"
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '14px',
          padding: '12px 32px',
          cursor: 'pointer',
        }}
      >
        Respawn
      </button>
    </div>
  );
}
