'use client';

import { useEffect } from 'react';

interface TradeItem {
  item: string;
  count: number;
  label: string;
  color: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  partnerName: string;
  myItems: TradeItem[];
  theirItems: TradeItem[];
  onAccept: () => void;
  onReject: () => void;
  isIncoming: boolean;
}

function ItemSlot({ item }: { item: TradeItem }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: '42px',
        height: '42px',
        background: 'rgba(0,0,0,0.5)',
        border: '2px solid #555',
        boxShadow: 'inset 1px 1px 0 #333, inset -1px -1px 0 #111',
      }}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          background: item.color,
          boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.1)',
        }}
      />
      {item.count > 1 && (
        <span
          className="absolute"
          style={{
            bottom: '1px',
            right: '2px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: '#fff',
            textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000',
          }}
        >
          {item.count}
        </span>
      )}
    </div>
  );
}

export default function TradePanel({
  visible,
  onClose,
  partnerName,
  myItems,
  theirItems,
  onAccept,
  onReject,
  isIncoming,
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
        className="bc-panel flex flex-col gap-4 p-6 relative"
        style={{ maxWidth: '520px', width: '100%' }}
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
            fontSize: '11px',
            color: 'rgba(255,255,255,0.85)',
            textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
          }}
        >
          {isIncoming ? 'INCOMING TRADE' : 'TRADE'}
        </div>
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '18px',
            color: 'rgba(255,255,255,0.6)',
            marginTop: '-8px',
          }}
        >
          Trading with {partnerName}
        </div>

        {/* Split view */}
        <div className="flex gap-4">
          {/* Your offer */}
          <div className="flex-1 flex flex-col gap-2">
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                color: 'rgba(255,255,255,0.6)',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              }}
            >
              YOUR OFFER
            </div>
            <div
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid #444',
                padding: '8px',
                minHeight: '120px',
                boxShadow: 'inset 1px 1px 0 #222, inset -1px -1px 0 #111',
              }}
            >
              <div className="flex flex-wrap gap-[3px]">
                {myItems.length === 0 && (
                  <span
                    style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: '15px',
                      color: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    No items offered
                  </span>
                )}
                {myItems.map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <ItemSlot item={item} />
                    <span
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.5)',
                        textAlign: 'center',
                        maxWidth: '42px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '2px',
              background: '#555',
              alignSelf: 'stretch',
              margin: '20px 0 0 0',
            }}
          />

          {/* Their offer */}
          <div className="flex-1 flex flex-col gap-2">
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                color: 'rgba(255,255,255,0.6)',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              }}
            >
              THEIR OFFER
            </div>
            <div
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid #444',
                padding: '8px',
                minHeight: '120px',
                boxShadow: 'inset 1px 1px 0 #222, inset -1px -1px 0 #111',
              }}
            >
              <div className="flex flex-wrap gap-[3px]">
                {theirItems.length === 0 && (
                  <span
                    style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: '15px',
                      color: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    No items offered
                  </span>
                )}
                {theirItems.map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <ItemSlot item={item} />
                    <span
                      style={{
                        fontFamily: "'VT323', monospace",
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.5)',
                        textAlign: 'center',
                        maxWidth: '42px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-center" style={{ marginTop: '4px' }}>
          <button
            onClick={onAccept}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '9px',
              color: '#fff',
              background: 'rgba(34, 139, 34, 0.6)',
              border: '2px solid #5cb85c',
              padding: '8px 24px',
              cursor: 'pointer',
              textShadow: '1px 1px 0 #000',
              boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.15), inset -1px -1px 0 rgba(0,0,0,0.3)',
            }}
          >
            ACCEPT
          </button>
          <button
            onClick={onReject}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '9px',
              color: '#fff',
              background: 'rgba(180, 40, 40, 0.6)',
              border: '2px solid #d9534f',
              padding: '8px 24px',
              cursor: 'pointer',
              textShadow: '1px 1px 0 #000',
              boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.15), inset -1px -1px 0 rgba(0,0,0,0.3)',
            }}
          >
            REJECT
          </button>
        </div>

        {/* Close hint */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '7px',
            color: 'rgba(255,255,255,0.3)',
            textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
            textAlign: 'center',
          }}
        >
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}
