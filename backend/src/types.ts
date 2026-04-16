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

export interface Block {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  placedBy?: string;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;           // socket id
  username: string;
  walletAddress?: string;
  color: string;        // hex
  x: number;
  y: number;
  z: number;
  rotY: number;
  rotX: number;
  lastWrite: number;    // ms timestamp of last DB write
}

export interface ChatMessage {
  username: string;
  message: string;
  isSystem?: boolean;
  created_at?: string;
}

export const WORLD_SIZE = 128;
export const WORLD_HEIGHT = 64;
export const INITIAL_LOAD_RADIUS = 32;
export const MAX_REACH = 5;
