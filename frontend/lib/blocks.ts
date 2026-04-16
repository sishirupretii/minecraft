export type BlockType =
  | 'base_blue'
  | 'deep_blue'
  | 'ice_stone'
  | 'cyan_wood'
  | 'sand_blue'
  | 'royal_brick';

export const BLOCK_TYPES: BlockType[] = [
  'base_blue',
  'deep_blue',
  'ice_stone',
  'cyan_wood',
  'sand_blue',
  'royal_brick',
];

export interface BlockMeta {
  type: BlockType;
  color: number;       // hex int
  colorStr: string;    // "#RRGGBB"
  label: string;
  emissive?: number;
}

export const BLOCKS: Record<BlockType, BlockMeta> = {
  base_blue:   { type: 'base_blue',   color: 0x0052ff, colorStr: '#0052ff', label: 'Base Blue' },
  deep_blue:   { type: 'deep_blue',   color: 0x001a4d, colorStr: '#001a4d', label: 'Deep Blue' },
  ice_stone:   { type: 'ice_stone',   color: 0x3d5a80, colorStr: '#3d5a80', label: 'Ice Stone' },
  cyan_wood:   { type: 'cyan_wood',   color: 0x00b4d8, colorStr: '#00b4d8', label: 'Cyan Wood' },
  sand_blue:   { type: 'sand_blue',   color: 0xa8dadc, colorStr: '#a8dadc', label: 'Sand Blue' },
  royal_brick: { type: 'royal_brick', color: 0x1d3557, colorStr: '#1d3557', label: 'Royal Brick' },
};
