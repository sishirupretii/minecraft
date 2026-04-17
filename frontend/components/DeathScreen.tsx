'use client';

interface Props {
  visible: boolean;
  onRespawn: () => void;
  score?: number;
  keepSlots?: number;
  tierLabel?: string;
  tierColor?: string;
  deathCause?: string;
}

export default function DeathScreen({ visible, onRespawn, score, keepSlots = 0, tierLabel, tierColor, deathCause }: Props) {
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
        YOU DIED
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
            marginBottom: '8px',
          }}
        >
          Level: {score}
        </div>
      )}

      {/* Tier keep info */}
      <div
        style={{
          fontFamily: "'VT323', monospace",
          fontSize: '18px',
          color: keepSlots >= 36 ? '#88ff88' : keepSlots > 0 ? '#ffcc44' : '#ff8888',
          marginBottom: '20px',
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
