'use client';

import { useEffect } from 'react';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentChunk: { cx: number; cz: number };
  claimStatus: 'unclaimed' | 'yours' | 'other';
  claimOwner?: string;
  onClaim: () => void;
  onUnclaim: () => void;
  yourClaims: Array<{ cx: number; cz: number }>;
  walletConnected: boolean;
}

const STATUS_CONFIG = {
  unclaimed: { label: 'UNCLAIMED', color: '#9ca3af', border: '#666' },
  yours: { label: 'YOUR CLAIM', color: '#5cb85c', border: '#3a8a3a' },
  other: { label: 'CLAIMED', color: '#d9534f', border: '#a33' },
} as const;

export default function LandClaimPanel({
  visible,
  onClose,
  currentChunk,
  claimStatus,
  claimOwner,
  onClaim,
  onUnclaim,
  yourClaims,
  walletConnected,
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

  const statusCfg = STATUS_CONFIG[claimStatus];
  const canClaim = claimStatus === 'unclaimed' && walletConnected;

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
        style={{ maxWidth: '440px', width: '100%' }}
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
          LAND CLAIMS
        </div>

        {/* Current chunk info */}
        <div
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: `2px solid ${statusCfg.border}`,
            padding: '12px',
            boxShadow: 'inset 1px 1px 0 #333, inset -1px -1px 0 #111',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.5)',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
                }}
              >
                CURRENT CHUNK
              </span>
              <span
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: '22px',
                  color: '#fff',
                  textShadow: '1px 1px 0 #000',
                }}
              >
                [{currentChunk.cx}, {currentChunk.cz}]
              </span>
            </div>

            {/* Status badge */}
            <span
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                color: statusCfg.color,
                background: 'rgba(0,0,0,0.5)',
                border: `1px solid ${statusCfg.color}`,
                padding: '4px 10px',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {statusCfg.label}
            </span>
          </div>

          {/* Owner info for other's claims */}
          {claimStatus === 'other' && claimOwner && (
            <div
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                color: 'rgba(255,255,255,0.5)',
                marginTop: '6px',
              }}
            >
              Owned by: {claimOwner}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-center">
          {canClaim && (
            <button
              onClick={onClaim}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '9px',
                color: '#fff',
                background: 'rgba(34, 139, 34, 0.6)',
                border: '2px solid #5cb85c',
                padding: '10px 20px',
                cursor: 'pointer',
                textShadow: '1px 1px 0 #000',
                boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.15), inset -1px -1px 0 rgba(0,0,0,0.3)',
              }}
            >
              CLAIM THIS CHUNK
            </button>
          )}
          {claimStatus === 'unclaimed' && !walletConnected && (
            <span
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '17px',
                color: '#d9534f',
                textShadow: '1px 1px 0 #000',
              }}
            >
              Connect wallet to claim land
            </span>
          )}
        </div>

        {/* Separator */}
        <div style={{ height: '1px', background: '#555' }} />

        {/* Your claims list */}
        <div className="flex flex-col gap-2">
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '8px',
              color: 'rgba(255,255,255,0.6)',
              textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
            }}
          >
            YOUR CLAIMS ({yourClaims.length})
          </div>

          {yourClaims.length === 0 ? (
            <span
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              No land claimed yet
            </span>
          ) : (
            <div
              className="flex flex-col gap-1 overflow-y-auto"
              style={{ maxHeight: '160px', paddingRight: '4px' }}
            >
              {yourClaims.map((chunk) => {
                const isCurrentChunk = chunk.cx === currentChunk.cx && chunk.cz === currentChunk.cz;
                return (
                  <div
                    key={`${chunk.cx},${chunk.cz}`}
                    className="flex items-center justify-between"
                    style={{
                      background: isCurrentChunk
                        ? 'rgba(92, 184, 92, 0.12)'
                        : 'rgba(0,0,0,0.25)',
                      border: isCurrentChunk
                        ? '1px solid rgba(92,184,92,0.3)'
                        : '1px solid #333',
                      padding: '5px 10px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '18px',
                        color: isCurrentChunk ? '#5cb85c' : '#fff',
                        textShadow: '1px 1px 0 #000',
                      }}
                    >
                      Chunk [{chunk.cx}, {chunk.cz}]
                    </span>
                    <button
                      onClick={onUnclaim}
                      style={{
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: '7px',
                        color: '#d9534f',
                        background: 'rgba(180, 40, 40, 0.25)',
                        border: '1px solid #a33',
                        padding: '3px 8px',
                        cursor: 'pointer',
                        textShadow: '1px 1px 0 #000',
                      }}
                    >
                      UNCLAIM
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
