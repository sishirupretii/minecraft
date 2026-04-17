'use client';

import { useEffect, useRef } from 'react';
import { WorldRenderer } from './World';
import { BLOCKS, BlockType } from '@/lib/blocks';

interface OtherPlayer {
  x: number;
  z: number;
  color: string;
  username: string;
}

interface Props {
  world: WorldRenderer | null;
  playerX: number;
  playerZ: number;
  playerRotY: number;
  visible: boolean;
  otherPlayers?: OtherPlayer[];
}

const MAP_SIZE = 120;        // canvas pixel size
const MAP_RADIUS = 24;       // blocks visible in each direction
const PIXEL_SCALE = Math.floor(MAP_SIZE / (MAP_RADIUS * 2));

// Color lookup for top-down view
const BLOCK_MAP_COLORS: Partial<Record<BlockType, string>> = {
  base_blue: '#6aa84f',
  deep_blue: '#8b5a2b',
  sand_blue: '#e6d9a1',
  ice_stone: '#dfe6ea',
  cyan_wood: '#6b4a2a',
  royal_brick: '#7a7a7a',
  planks: '#c4973a',
  cobblestone: '#6a6a6a',
  leaves: '#3a8a2a',
  lava: '#e85a10',
  bedrock: '#2a2a2a',
  coal_ore: '#3a3a3a',
  iron_ore: '#8a7a6a',
  diamond_ore: '#5aaca8',
  gold_ore: '#c8a832',
  obsidian: '#1a0a2a',
  wool: '#f0f0f0',
  bricks: '#9a4a3a',
  glass: '#c8e8f8',
  farmland: '#5a3a1a',
  wheat: '#d4b830',
  // Biome blocks
  moss_block: '#4a7a30',
  mud: '#4a3a28',
  birch_wood: '#d8ccaa',
  birch_leaves: '#68a838',
  dark_oak_wood: '#3a2a1a',
  dark_oak_leaves: '#2a5a1a',
  water: '#3a6acc',
  sugar_cane: '#6aba4a',
  packed_ice: '#8ab8e8',
  snow_block: '#f0f0ff',
  emerald_ore: '#4aaa5a',
  copper_ore: '#ba6a3a',
  amethyst: '#8a4aaa',
  deepslate: '#3a3a3a',
  calcite: '#e0dcd0',
  vine: '#2a6a1a',
  lily_pad: '#2a8a2a',
  cactus: '#2a8a2a',
  mushroom_red: '#cc2222',
  mushroom_brown: '#8a6a4a',
  pumpkin: '#e08020',
  hay_bale: '#d4a830',
  stone_bricks: '#7a7a7a',
  terracotta: '#b46240',
  soul_sand: '#4a3a2a',
  nether_bricks: '#3a1a1a',
  end_stone: '#e8e8a0',
  tnt: '#cc2222',
};

const WATER_COLOR = '#2d7bd4';

export default function Minimap({ world, playerX, playerZ, playerRotY, visible, otherPlayers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !world || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const draw = () => {
      ctx.fillStyle = WATER_COLOR;
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

      const cx = Math.floor(playerX);
      const cz = Math.floor(playerZ);

      for (let dx = -MAP_RADIUS; dx < MAP_RADIUS; dx++) {
        for (let dz = -MAP_RADIUS; dz < MAP_RADIUS; dz++) {
          const wx = cx + dx;
          const wz = cz + dz;
          // Find surface block
          let topType: BlockType | null = null;
          for (let y = 40; y >= 0; y--) {
            const t = world.getType(wx, y, wz);
            if (t) { topType = t; break; }
          }
          if (topType) {
            const color = BLOCK_MAP_COLORS[topType] || BLOCKS[topType]?.colorStr || '#555';
            ctx.fillStyle = color;
            const px = (dx + MAP_RADIUS) * PIXEL_SCALE;
            const pz = (dz + MAP_RADIUS) * PIXEL_SCALE;
            ctx.fillRect(px, pz, PIXEL_SCALE, PIXEL_SCALE);
          }
        }
      }

      // Other player dots
      if (otherPlayers) {
        for (const op of otherPlayers) {
          const opDx = op.x - cx;
          const opDz = op.z - cz;
          if (Math.abs(opDx) < MAP_RADIUS && Math.abs(opDz) < MAP_RADIUS) {
            const opPx = (opDx + MAP_RADIUS) * PIXEL_SCALE;
            const opPz = (opDz + MAP_RADIUS) * PIXEL_SCALE;
            ctx.fillStyle = op.color || '#44aaff';
            ctx.beginPath();
            ctx.arc(opPx, opPz, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Player dot (self — on top)
      const centerPx = MAP_SIZE / 2;
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(centerPx, centerPx, 3, 0, Math.PI * 2);
      ctx.fill();

      // Direction indicator
      const dirLen = 7;
      const dx = Math.sin(-playerRotY) * dirLen;
      const dz = Math.cos(-playerRotY) * dirLen;
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerPx, centerPx);
      ctx.lineTo(centerPx - dx, centerPx - dz);
      ctx.stroke();

      // Cardinal direction labels
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', centerPx, 10);
      ctx.fillText('S', centerPx, MAP_SIZE - 3);
      ctx.fillText('W', 6, centerPx + 3);
      ctx.fillText('E', MAP_SIZE - 6, centerPx + 3);

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [visible, world, playerX, playerZ, playerRotY, otherPlayers]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        right: '8px',
        width: `${MAP_SIZE}px`,
        height: `${MAP_SIZE}px`,
        border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: '2px',
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.6)',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '2px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'VT323', monospace",
          fontSize: '11px',
          color: 'rgba(255,255,255,0.5)',
          textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
        }}
      >
        MAP
      </div>
    </div>
  );
}
