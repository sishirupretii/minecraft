'use client';

import { useEffect } from 'react';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CONTROLS = [
  { category: 'MOVEMENT', items: [
    { key: 'W/A/S/D', action: 'Move' },
    { key: 'SPACE', action: 'Jump' },
    { key: 'SHIFT', action: 'Sneak/Crouch' },
    { key: 'CTRL', action: 'Sprint' },
    { key: 'F', action: 'Toggle Fly' },
  ]},
  { category: 'COMBAT & ITEMS', items: [
    { key: 'LMB', action: 'Break Block / Attack' },
    { key: 'RMB', action: 'Place Block / Use Item' },
    { key: '1-9', action: 'Select Hotbar Slot' },
    { key: 'SCROLL', action: 'Cycle Hotbar' },
    { key: 'Q', action: 'Drop Item' },
  ]},
  { category: 'PANELS', items: [
    { key: 'E', action: 'Inventory' },
    { key: 'T', action: 'Chat' },
    { key: 'L', action: 'Leaderboard' },
    { key: 'P', action: 'Profile' },
    { key: 'J', action: 'Achievements' },
    { key: 'N', action: 'Land Claims' },
    { key: 'K', action: 'Tier Perks' },
    { key: 'M', action: 'Minimap' },
    { key: 'TAB', action: 'Player List' },
  ]},
  { category: 'CHAT COMMANDS', items: [
    { key: '/help', action: 'List all commands' },
    { key: '/tp x y z', action: 'Teleport (wallet req.)' },
    { key: '/time', action: 'Show current time' },
    { key: '/stats', action: 'Show your stats' },
    { key: '/tier', action: 'Show wallet tier & balance' },
    { key: '/seed', action: 'Show world seed' },
    { key: '/give', action: 'Give items (Diamond)' },
    { key: '/weather', action: 'Set weather (Gold+)' },
    { key: '/kill', action: 'Respawn' },
    { key: '/clear', action: 'Clear inventory (Silver+)' },
    { key: '/xp [amt]', action: 'Give XP (Diamond)' },
    { key: '/home', action: 'Teleport to spawn' },
    { key: '/heal', action: 'Full heal (Gold+)' },
    { key: '/pos', action: 'Share position in chat' },
    { key: '/fly', action: 'Toggle flight (Diamond)' },
    { key: '/gamemode', action: 'Switch mode (Diamond)' },
    { key: '/bal', action: 'Show wallet balance' },
  ]},
  { category: 'OTHER', items: [
    { key: 'F3', action: 'Debug Info (Coords/FPS)' },
    { key: 'F5', action: 'Toggle Shadows' },
    { key: 'O', action: 'Settings' },
    { key: 'ESC', action: 'Close Panel / Release Mouse' },
  ]},
];

export default function ControlsPanel({ visible, onClose }: Props) {
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
        style={{ maxWidth: '500px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
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
          marginBottom: '4px',
        }}>
          CONTROLS
        </div>

        {CONTROLS.map((section) => (
          <div key={section.category} className="flex flex-col gap-1">
            <div style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: '8px',
              color: 'rgba(255,255,255,0.5)', textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              marginTop: '4px',
            }}>
              {section.category}
            </div>
            {section.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between" style={{
                padding: '3px 8px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid #333',
              }}>
                <span style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: '8px',
                  color: '#ffd700', textShadow: '1px 1px 0 #000',
                  minWidth: '70px',
                }}>
                  {item.key}
                </span>
                <span style={{
                  fontFamily: "'VT323', monospace", fontSize: '16px',
                  color: 'rgba(255,255,255,0.7)',
                }}>
                  {item.action}
                </span>
              </div>
            ))}
          </div>
        ))}

        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
          color: 'rgba(255,255,255,0.3)', textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
          textAlign: 'center', marginTop: '4px',
        }}>
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}
