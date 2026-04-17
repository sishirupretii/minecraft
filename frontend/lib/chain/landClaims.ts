import { LandClaim } from './types';
import { CHUNK_SIZE } from './constants';

export function getChunkCoords(worldX: number, worldZ: number): { cx: number; cz: number } {
  return {
    cx: Math.floor(worldX / CHUNK_SIZE),
    cz: Math.floor(worldZ / CHUNK_SIZE),
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function isChunkClaimed(cx: number, cz: number, claims: Map<string, LandClaim>): LandClaim | null {
  return claims.get(chunkKey(cx, cz)) ?? null;
}

export function canModifyBlock(
  worldX: number, worldZ: number,
  playerWallet: string | undefined,
  claims: Map<string, LandClaim>,
): { allowed: boolean; owner?: string } {
  const { cx, cz } = getChunkCoords(worldX, worldZ);
  const claim = isChunkClaimed(cx, cz, claims);
  if (!claim) return { allowed: true };
  if (!playerWallet) return { allowed: false, owner: claim.username };
  if (claim.wallet_address.toLowerCase() === playerWallet.toLowerCase()) return { allowed: true };
  return { allowed: false, owner: claim.username };
}

export function getChunkBounds(cx: number, cz: number): { minX: number; minZ: number; maxX: number; maxZ: number } {
  return {
    minX: cx * CHUNK_SIZE,
    minZ: cz * CHUNK_SIZE,
    maxX: (cx + 1) * CHUNK_SIZE,
    maxZ: (cz + 1) * CHUNK_SIZE,
  };
}
