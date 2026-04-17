'use client';

import { useEffect, useState } from 'react';

interface Props {
  visible: boolean;
  onClose: () => void;
  muted: boolean;
  onToggleMute: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  fov: number;
  onFovChange: (v: number) => void;
  renderDist: number;
  onRenderDistChange: (v: number) => void;
  showCoords: boolean;
  onToggleCoords: () => void;
  shadows: boolean;
  onToggleShadows: () => void;
}

const RENDER_DISTANCES = [
  { label: 'Tiny', value: 40 },
  { label: 'Short', value: 60 },
  { label: 'Normal', value: 90 },
  { label: 'Far', value: 130 },
];

export default function SettingsPanel({
  visible, onClose,
  muted, onToggleMute,
  volume, onVolumeChange,
  fov, onFovChange,
  renderDist, onRenderDistChange,
  showCoords, onToggleCoords,
  shadows, onToggleShadows,
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

  const labelStyle = {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '8px',
    color: 'rgba(255,255,255,0.7)',
    textShadow: '1px 1px 0 #000',
  } as const;

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid #333',
  } as const;

  const currentRD = RENDER_DISTANCES.find(r => r.value === renderDist)
    ?? RENDER_DISTANCES.find(r => r.value >= renderDist)
    ?? RENDER_DISTANCES[2];

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bc-panel flex flex-col gap-3 p-6 relative"
        style={{ maxWidth: '440px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
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
          SETTINGS
        </div>

        {/* ---- Audio ---- */}
        <div style={{ ...labelStyle, color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>AUDIO</div>

        <div style={rowStyle}>
          <span style={labelStyle}>Sound</span>
          <button
            onClick={onToggleMute}
            style={{
              ...labelStyle,
              color: muted ? '#ff6666' : '#66ff66',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #555',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {muted ? 'OFF' : 'ON'}
          </button>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Volume</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => onVolumeChange(parseInt(e.target.value) / 100)}
              style={{ width: '100px', accentColor: '#5cb85c' }}
            />
            <span style={{ ...labelStyle, color: '#ffd700', minWidth: '30px', textAlign: 'right' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {/* ---- Video ---- */}
        <div style={{ ...labelStyle, color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>VIDEO</div>

        <div style={rowStyle}>
          <span style={labelStyle}>FOV</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="range"
              min={50}
              max={110}
              value={fov}
              onChange={(e) => onFovChange(parseInt(e.target.value))}
              style={{ width: '100px', accentColor: '#5cb85c' }}
            />
            <span style={{ ...labelStyle, color: '#ffd700', minWidth: '30px', textAlign: 'right' }}>
              {fov}
            </span>
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Render Dist</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {RENDER_DISTANCES.map((rd) => (
              <button
                key={rd.label}
                onClick={() => onRenderDistChange(rd.value)}
                style={{
                  ...labelStyle,
                  fontSize: '7px',
                  color: currentRD.value === rd.value ? '#ffd700' : 'rgba(255,255,255,0.4)',
                  background: currentRD.value === rd.value ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)',
                  border: currentRD.value === rd.value ? '1px solid #ffd700' : '1px solid #444',
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
              >
                {rd.label}
              </button>
            ))}
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Shadows</span>
          <button
            onClick={onToggleShadows}
            style={{
              ...labelStyle,
              color: shadows ? '#66ff66' : '#ff6666',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #555',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {shadows ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* ---- Gameplay ---- */}
        <div style={{ ...labelStyle, color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>GAMEPLAY</div>

        <div style={rowStyle}>
          <span style={labelStyle}>Show Coords</span>
          <button
            onClick={onToggleCoords}
            style={{
              ...labelStyle,
              color: showCoords ? '#66ff66' : '#ff6666',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #555',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {showCoords ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* ---- Keybinds ref ---- */}
        <div style={{ ...labelStyle, color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>QUICK KEYS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
          {[
            ['F1', 'Controls'],
            ['F3', 'Debug'],
            ['F5', 'Shadows'],
            ['E', 'Inventory'],
            ['T', 'Chat'],
            ['L', 'Leaderboard'],
            ['P', 'Profile'],
            ['J', 'Achieve'],
            ['K', 'Perks'],
            ['O', 'Settings'],
          ].map(([key, action]) => (
            <div key={key} style={{
              ...rowStyle,
              padding: '2px 6px',
            }}>
              <span style={{ ...labelStyle, color: '#ffd700', fontSize: '7px' }}>{key}</span>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                {action}
              </span>
            </div>
          ))}
        </div>

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
