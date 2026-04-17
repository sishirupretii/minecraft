// Achievement definition
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'mining' | 'combat' | 'building' | 'exploration' | 'survival';
}

export interface Achievement {
  id: string;
  wallet_address: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface PlayerStats {
  blocksPlaced: number;
  blocksBroken: number;
  mobsKilled: number;
  deaths: number;
  playTimeSeconds: number;
  diamondsFound: number;
  itemsCrafted: number;
  itemsEnchanted: number;
  villagerTrades: number;
  emeraldsEarned: number;
  beaconsPlaced: number;
  enderPearlsThrown: number;
  distanceWalked: number;
  highestY: number;
  lowestY: number;
  longestLifeSeconds: number;
  currentLifeSeconds: number;
  walletConnected: boolean;
  currentTier: string;
  copperMined: number;
  amethystMined: number;
  luckyDrops: number;
  maxMiningCombo: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  wallet_address: string | null;
  score: number;
  blocks_placed: number;
  mobs_killed: number;
  balance_tier: string;
}

export interface LandClaim {
  chunk_x: number;
  chunk_z: number;
  wallet_address: string;
  username: string;
  claimed_at: string;
}

export interface TradeOffer {
  id: string;
  from_username: string;
  from_wallet?: string;
  to_username: string;
  offered_items: Array<{ item: string; count: number }>;
  requested_items: Array<{ item: string; count: number }>;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
}

export type BalanceTier = 'none' | 'base' | 'bronze' | 'silver' | 'gold' | 'diamond';
