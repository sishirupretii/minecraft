import { BalanceTier } from './types';

export const BALANCE_TIERS: Array<{ min: bigint; tier: BalanceTier; label: string; color: string; exclusiveBlocks: string[] }> = [
  { min: 0n, tier: 'none', label: 'No Wallet', color: '#888888', exclusiveBlocks: [] },
  { min: 1n, tier: 'base', label: 'Base', color: '#0052ff', exclusiveBlocks: ['base_block'] },
  { min: 10000000000000000n, tier: 'bronze', label: 'Bronze', color: '#cd7f32', exclusiveBlocks: ['base_block', 'bronze_block'] }, // 0.01 ETH
  { min: 100000000000000000n, tier: 'silver', label: 'Silver', color: '#c0c0c0', exclusiveBlocks: ['base_block', 'bronze_block', 'silver_block'] }, // 0.1 ETH
  { min: 500000000000000000n, tier: 'gold', label: 'Gold', color: '#ffd700', exclusiveBlocks: ['base_block', 'bronze_block', 'silver_block', 'gold_block'] }, // 0.5 ETH
  { min: 1000000000000000000n, tier: 'diamond', label: 'Diamond', color: '#b9f2ff', exclusiveBlocks: ['base_block', 'bronze_block', 'silver_block', 'gold_block', 'crystal_block'] }, // 1.0 ETH
];

export function getTierForBalance(balance: bigint): BalanceTier {
  let result: BalanceTier = 'none';
  for (const t of BALANCE_TIERS) {
    if (balance >= t.min) result = t.tier;
  }
  return result;
}

export function getTierInfo(tier: BalanceTier) {
  return BALANCE_TIERS.find(t => t.tier === tier) ?? BALANCE_TIERS[0];
}

export function canAccessBlock(blockId: string, tier: BalanceTier): boolean {
  const info = getTierInfo(tier);
  return info.exclusiveBlocks.includes(blockId);
}

export const CHUNK_SIZE = 16;

// Cosmetics per tier
export interface TierCosmetics {
  chatColor: string;
  namePrefix: string;
  particleColor: number;
  hasGlow: boolean;
  hasParticles: boolean;
}

// XP multiplier per tier — higher tiers earn XP faster
export const TIER_XP_MULTIPLIER: Record<BalanceTier, number> = {
  none:    1.0,
  base:    1.1,
  bronze:  1.25,
  silver:  1.5,
  gold:    2.0,
  diamond: 3.0,
};

// Kill bounty: emeralds dropped on mob kill for wallet users
export const TIER_KILL_BOUNTY: Record<BalanceTier, number> = {
  none:    0,
  base:    1,
  bronze:  1,
  silver:  2,
  gold:    3,
  diamond: 5,
};

// Daily reward interval (ms) — free items every X ms of play
export const WALLET_REWARD_INTERVAL_MS = 300_000; // 5 minutes

// Tier-exclusive enchantment levels: max enchant level per tier
export const TIER_MAX_ENCHANT: Record<BalanceTier, number> = {
  none:    3,  // I-III base
  base:    3,
  bronze:  4,  // up to IV
  silver:  5,  // up to V
  gold:    6,  // up to VI
  diamond: 7,  // up to VII
};

// Beacon buff strength scales with tier
export const TIER_BEACON_MULTIPLIER: Record<BalanceTier, number> = {
  none:    1.0,
  base:    1.0,
  bronze:  1.2,
  silver:  1.5,
  gold:    2.0,
  diamond: 3.0,
};

// Mining speed multiplier — higher tiers break blocks faster
export const TIER_MINING_SPEED: Record<BalanceTier, number> = {
  none:    1.0,
  base:    1.05,
  bronze:  1.15,
  silver:  1.3,
  gold:    1.5,
  diamond: 2.0,
};

// Movement speed bonus — subtle speed boost for higher tiers
export const TIER_SPEED_BONUS: Record<BalanceTier, number> = {
  none:    1.0,
  base:    1.0,
  bronze:  1.02,
  silver:  1.05,
  gold:    1.08,
  diamond: 1.12,
};

// Inventory slots kept on death — higher tiers lose less
export const TIER_KEEP_INVENTORY: Record<BalanceTier, number> = {
  none:    0,   // lose everything
  base:    3,   // keep 3 hotbar slots
  bronze:  5,   // keep 5 slots
  silver:  9,   // keep full hotbar
  gold:    18,  // keep hotbar + half main
  diamond: 36,  // keep everything (keepInventory)
};

// Lucky mining: chance per block broken to get bonus loot (0.0 to 1.0)
export const TIER_LUCKY_MINING: Record<BalanceTier, number> = {
  none:    0.02,   // 2% base chance
  base:    0.04,   // 4%
  bronze:  0.06,   // 6%
  silver:  0.08,   // 8%
  gold:    0.12,   // 12%
  diamond: 0.18,   // 18%
};

// Campfire cooking: seconds per item
export const CAMPFIRE_COOK_INTERVAL = 5; // 5 seconds per item

// Tier-based damage reduction — small % damage reduction per tier
export const TIER_DAMAGE_REDUCTION: Record<BalanceTier, number> = {
  none:    0,     // no reduction
  base:    0.03,  // 3% damage reduction
  bronze:  0.06,  // 6%
  silver:  0.10,  // 10%
  gold:    0.15,  // 15%
  diamond: 0.20,  // 20%
};

// Respawn invulnerability duration in seconds per tier
export const TIER_RESPAWN_PROTECTION: Record<BalanceTier, number> = {
  none:    3,   // 3 seconds
  base:    4,   // 4 seconds
  bronze:  5,   // 5 seconds
  silver:  6,   // 6 seconds
  gold:    8,   // 8 seconds
  diamond: 10,  // 10 seconds
};

// Tier-exclusive bonus mob drops (extra loot from killing mobs)
export const TIER_MOB_DROP_BONUS: Record<BalanceTier, number> = {
  none:    0,    // no bonus
  base:    0.1,  // 10% chance for extra drop
  bronze:  0.15, // 15%
  silver:  0.20, // 20%
  gold:    0.30, // 30%
  diamond: 0.40, // 40%
};

export const TIER_COSMETICS: Record<BalanceTier, TierCosmetics> = {
  none:    { chatColor: '#ffffff', namePrefix: '',  particleColor: 0xffffff, hasGlow: false, hasParticles: false },
  base:    { chatColor: '#0052ff', namePrefix: '⬢', particleColor: 0x0052ff, hasGlow: false, hasParticles: false },
  bronze:  { chatColor: '#cd7f32', namePrefix: '⬢', particleColor: 0xcd7f32, hasGlow: true,  hasParticles: false },
  silver:  { chatColor: '#c0c0c0', namePrefix: '◆', particleColor: 0xc0c0c0, hasGlow: true,  hasParticles: false },
  gold:    { chatColor: '#ffd700', namePrefix: '★', particleColor: 0xffd700, hasGlow: true,  hasParticles: true },
  diamond: { chatColor: '#b9f2ff', namePrefix: '✦', particleColor: 0xb9f2ff, hasGlow: true,  hasParticles: true },
};
