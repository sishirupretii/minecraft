'use client';

interface Props {
  coords: { x: number; y: number; z: number };
  playerRotY?: number;
  showCoords: boolean;
  onlineCount: number;
  worldLoaded: boolean;
  loadedCount: number;
  totalCount: number;
  dayPhase: number;      // 0..1, where 0.25 = noon, 0.75 = midnight (see Game.tsx)
  muted: boolean;
  onToggleMute: () => void;
  fps: number | null;     // null = hide counter
  toast: string | null;
  invulnerable: boolean;  // spawn protection visual
  tierLabel?: string;
  tierColor?: string;
  xpMultiplier?: number;
  weather?: string;
  biome?: string;
  activePotion?: string | null;
  potionTimer?: number;
  beaconActive?: boolean;
  miningCombo?: number;
  armorDefense?: number;
}

function getCompassDir(rotY?: number): string {
  if (rotY === undefined) return '';
  // rotY is in radians, 0 = -Z (south), Math.PI = +Z (north)
  const deg = ((rotY * 180 / Math.PI) % 360 + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return 'S';
  if (deg >= 22.5 && deg < 67.5) return 'SW';
  if (deg >= 67.5 && deg < 112.5) return 'W';
  if (deg >= 112.5 && deg < 157.5) return 'NW';
  if (deg >= 157.5 && deg < 202.5) return 'N';
  if (deg >= 202.5 && deg < 247.5) return 'NE';
  if (deg >= 247.5 && deg < 292.5) return 'E';
  return 'SE';
}

export default function HUD({
  coords,
  playerRotY,
  showCoords,
  onlineCount,
  worldLoaded,
  loadedCount,
  totalCount,
  dayPhase,
  muted,
  onToggleMute,
  fps,
  toast,
  invulnerable,
  tierLabel,
  tierColor,
  xpMultiplier,
  weather,
  biome,
  activePotion,
  potionTimer,
  beaconActive,
  miningCombo,
  armorDefense,
}: Props) {
  // Sun is up when the sine of sun-angle is positive. See Game.tsx for the
  // matching expression — keep these in sync.
  const sunAngle = dayPhase * Math.PI * 2 - Math.PI / 2;
  const isDay = Math.sin(sunAngle) > 0;

  return (
    <>
      {/* Modest crosshair — neutral white dots, works on grass or snow */}
      <div className="crosshair">
        <span className="crosshair-dot top" />
        <span className="crosshair-dot bottom" />
        <span className="crosshair-dot left" />
        <span className="crosshair-dot right" />
      </div>

      {/* Thin top-of-screen progress bar while world loads */}
      {!worldLoaded && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 bg-white/10">
          <div
            className="h-full transition-all"
            style={{
              background: 'linear-gradient(90deg, #5cb85c, #8bbf68)',
              width:
                totalCount > 0
                  ? `${Math.min(100, (loadedCount / totalCount) * 100)}%`
                  : `${Math.min(100, (loadedCount / 5000) * 100)}%`,
            }}
          />
        </div>
      )}

      {/* Coords pill — monospace, earthy border */}
      {showCoords && (
        <div className="pointer-events-none absolute left-4 top-4">
          <div className="hud-pill font-mono">
            <span className="text-white/50">X</span>
            <span>{coords.x.toFixed(1)}</span>
            <span className="text-white/50">Y</span>
            <span>{coords.y.toFixed(1)}</span>
            <span className="text-white/50">Z</span>
            <span>{coords.z.toFixed(1)}</span>
            <span className="ml-1 text-[10px] text-yellow-300/50">{getCompassDir(playerRotY)}</span>
            <span className="ml-1 text-[10px] text-white/30">F3</span>
          </div>
        </div>
      )}

      {/* FPS (only when ?debug=1) */}
      {fps !== null && (
        <div className="pointer-events-none absolute left-4 top-14">
          <div className="hud-pill font-mono">
            <span className="text-white/50">FPS</span>
            <span
              className={
                fps >= 55 ? 'text-green-300' : fps >= 35 ? 'text-yellow-200' : 'text-red-300'
              }
            >
              {fps.toFixed(0)}
            </span>
          </div>
        </div>
      )}

      {/* Online count + sun/moon icon + mute */}
      <div className="pointer-events-auto absolute right-4 top-4 flex gap-2">
        <div className="hud-pill" title={`Time of day: ${isDay ? 'day' : 'night'}`}>
          <span className="text-base leading-none">{isDay ? '☀' : '☾'}</span>
        </div>
        <button
          className="hud-pill cursor-pointer transition hover:border-white/40"
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          <span className="text-sm leading-none">{muted ? '🔇' : '🔊'}</span>
        </button>
        <div className="hud-pill">
          <span className="hud-pill-dot" />
          <span className="font-semibold">{onlineCount}</span>
          <span className="text-white/50">online</span>
        </div>
      </div>

      {/* Invulnerability ring — subtle pulse around the screen center */}
      {invulnerable && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-40 rounded-full border-2 border-[#4a7cff]/50 animate-pulse" />
        </div>
      )}

      {/* Center-top welcome toast */}
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 toast-fade">
          <div className="rounded-lg border border-[#4a7cff]/60 bg-black/60 px-5 py-2 text-sm text-white shadow-xl backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}

      {/* Tier badge (bottom-left) */}
      {tierLabel && tierLabel !== 'No Wallet' && (
        <div className="pointer-events-none absolute bottom-16 left-4">
          <div
            className="hud-pill"
            style={{ borderColor: tierColor || '#888' }}
          >
            <span style={{ color: tierColor || '#888', fontSize: '11px', fontWeight: 'bold' }}>
              {tierLabel}
            </span>
            {xpMultiplier && xpMultiplier > 1 && (
              <span style={{ color: '#ffd700', fontSize: '10px', marginLeft: '4px' }}>
                {xpMultiplier}x XP
              </span>
            )}
          </div>
        </div>
      )}

      {/* Weather indicator */}
      {weather && weather !== 'clear' && (
        <div className="pointer-events-none absolute left-4 top-24">
          <div className="hud-pill">
            <span style={{ fontSize: '12px' }}>
              {weather === 'rain' ? '🌧' : weather === 'thunder' ? '⛈' : ''}
            </span>
            <span className="text-white/50" style={{ fontSize: '10px' }}>
              {weather === 'rain' ? 'Rain' : weather === 'thunder' ? 'Thunder' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Biome indicator */}
      {biome && showCoords && (
        <div className="pointer-events-none absolute left-4" style={{ top: weather && weather !== 'clear' ? '150px' : '120px' }}>
          <div className="hud-pill">
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
              {biome === 'Desert' ? '🏜' : biome === 'Snowy Tundra' ? '❄' : biome === 'Swamp' ? '🌿' : biome === 'Mountains' ? '⛰' : biome === 'City' ? '🏙' : biome === 'Lush Forest' ? '🌲' : '🌾'}
            </span>
            <span className="text-white/50" style={{ fontSize: '10px' }}>
              {biome}
            </span>
          </div>
        </div>
      )}

      {/* Active effects (right side, below online count) */}
      <div className="pointer-events-none absolute right-4 top-16 flex flex-col gap-1">
        {activePotion && (
          <div className="hud-pill" style={{ borderColor: '#aa44ff' }}>
            <span style={{ fontSize: '10px' }}>
              {activePotion === 'potion_healing' ? '❤️' :
               activePotion === 'potion_speed' ? '💨' :
               activePotion === 'potion_strength' ? '💪' :
               activePotion === 'potion_fire_resist' ? '🔥' :
               activePotion === 'potion_night_vision' ? '👁' :
               activePotion === 'potion_jump' ? '🦘' : '🧪'}
            </span>
            <span style={{ fontSize: '10px', color: '#cc88ff' }}>
              {potionTimer ? `${Math.ceil(potionTimer)}s` : ''}
            </span>
          </div>
        )}
        {beaconActive && (
          <div className="hud-pill" style={{ borderColor: '#88ffdd' }}>
            <span style={{ fontSize: '10px' }}>🔦</span>
            <span style={{ fontSize: '10px', color: '#88ffdd' }}>Beacon</span>
          </div>
        )}
        {miningCombo !== undefined && miningCombo >= 5 && (
          <div className="hud-pill" style={{ borderColor: '#ff8844' }}>
            <span style={{ fontSize: '10px' }}>⛏️</span>
            <span style={{ fontSize: '10px', color: '#ff8844' }}>x{miningCombo}</span>
          </div>
        )}
        {armorDefense !== undefined && armorDefense > 0 && (
          <div className="hud-pill" style={{ borderColor: '#4488cc' }}>
            <span style={{ fontSize: '10px' }}>🛡</span>
            <span style={{ fontSize: '10px', color: '#88aaff' }}>{armorDefense}</span>
          </div>
        )}
      </div>

      {/* Keybind hints (bottom-left) */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex gap-2">
        <span className="text-[9px] text-white/20" style={{ fontFamily: "'VT323', monospace" }}>
          F1:Controls E:Inv L:LB P:Profile J:Achieve K:Perks O:Settings B:Bounty U:Store
        </span>
      </div>

      {/* Watermark */}
      <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] font-semibold tracking-[0.2em] text-white/25">
        BASEDCRAFT
      </div>
    </>
  );
}
