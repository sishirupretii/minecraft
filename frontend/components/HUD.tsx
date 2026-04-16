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
      {/* Crosshair */}
      <div className="crosshair" />

      {/* Coords top-left */}
      {showCoords && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-black/50 px-3 py-1.5 text-xs font-mono text-white/80 backdrop-blur-sm">
          X: {coords.x.toFixed(1)} &nbsp; Y: {coords.y.toFixed(1)} &nbsp; Z: {coords.z.toFixed(1)}
          <span className="ml-2 text-white/30">F3</span>
        </div>
      )}

      {/* Online top-right */}
      <div className="pointer-events-none absolute right-4 top-4 rounded-md bg-black/50 px-3 py-1.5 text-xs backdrop-blur-sm">
        <span className="mr-1">🔵</span>
        <span className="font-semibold">{onlineCount}</span>
        <span className="text-white/50"> online</span>
      </div>

      {/* Watermark bottom-right */}
      <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] font-semibold tracking-wide text-white/25">
        BaseCraft
      </div>

      {/* Loading banner */}
      {!worldLoaded && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/60 px-6 py-4 text-center backdrop-blur-md">
          <div className="text-base font-semibold text-white">Entering BaseCraft…</div>
          <div className="mt-1 text-xs text-white/60">
            Loading world · {loadedCount.toLocaleString()}
            {totalCount > 0 ? ` / ${totalCount.toLocaleString()}` : ''} blocks
          </div>
        </div>
      )}
    </>
  );
}
