'use client';

interface Props {
  coords: { x: number; y: number; z: number };
  showCoords: boolean;
  onlineCount: number;
  worldLoaded: boolean;
  loadedCount: number;
  totalCount: number;
}

export default function HUD({
  coords,
  showCoords,
  onlineCount,
  worldLoaded,
  loadedCount,
  totalCount,
}: Props) {
  return (
    <>
      {/* 4-dot Base-blue crosshair */}
      <div className="crosshair">
        <span className="crosshair-dot top" />
        <span className="crosshair-dot bottom" />
        <span className="crosshair-dot left" />
        <span className="crosshair-dot right" />
      </div>

      {/* Thin top-of-screen progress bar while world loads — always visible, not
          just in the center card, so the user can see chunks streaming in. */}
      {!worldLoaded && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-[#0052ff] to-[#4a7cff] transition-all"
            style={{
              width:
                totalCount > 0
                  ? `${Math.min(100, (loadedCount / totalCount) * 100)}%`
                  : `${Math.min(100, (loadedCount / 5000) * 100)}%`,
            }}
          />
        </div>
      )}

      {/* Coords — monospace pill, Base-blue border */}
      {showCoords && (
        <div className="pointer-events-none absolute left-4 top-4">
          <div className="hud-pill font-mono">
            <span className="text-white/50">X</span>
            <span>{coords.x.toFixed(1)}</span>
            <span className="text-white/50">Y</span>
            <span>{coords.y.toFixed(1)}</span>
            <span className="text-white/50">Z</span>
            <span>{coords.z.toFixed(1)}</span>
            <span className="ml-1 text-[10px] text-white/30">F3</span>
          </div>
        </div>
      )}

      {/* Online count — pulsing green dot */}
      <div className="pointer-events-none absolute right-4 top-4">
        <div className="hud-pill">
          <span className="hud-pill-dot" />
          <span className="font-semibold">{onlineCount}</span>
          <span className="text-white/50">online</span>
        </div>
      </div>

      {/* Watermark */}
      <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] font-semibold tracking-[0.2em] text-white/25">
        BASECRAFT
      </div>
    </>
  );
}
