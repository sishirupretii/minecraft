import { AchievementDef, PlayerStats } from './types';

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Mining
  { id: 'first_break', name: 'Getting Started', description: 'Break your first block', icon: '⛏️', category: 'mining' },
  { id: 'miner_100', name: 'Miner', description: 'Break 100 blocks', icon: '🪨', category: 'mining' },
  { id: 'miner_1000', name: 'Strip Miner', description: 'Break 1,000 blocks', icon: '⛰️', category: 'mining' },
  { id: 'diamond_finder', name: 'Diamonds!', description: 'Find your first diamond', icon: '💎', category: 'mining' },

  // Building
  { id: 'first_place', name: 'Architect', description: 'Place your first block', icon: '🧱', category: 'building' },
  { id: 'builder_100', name: 'Builder', description: 'Place 100 blocks', icon: '🏗️', category: 'building' },
  { id: 'builder_1000', name: 'Master Builder', description: 'Place 1,000 blocks', icon: '🏰', category: 'building' },

  // Combat
  { id: 'first_kill', name: 'Monster Hunter', description: 'Kill your first mob', icon: '⚔️', category: 'combat' },
  { id: 'slayer_50', name: 'Mob Slayer', description: 'Kill 50 mobs', icon: '🗡️', category: 'combat' },
  { id: 'slayer_200', name: 'Legend', description: 'Kill 200 mobs', icon: '👑', category: 'combat' },

  // Survival
  { id: 'first_death', name: 'Oops', description: 'Die for the first time', icon: '💀', category: 'survival' },
  { id: 'survivor_30', name: 'Survivor', description: 'Play for 30 minutes', icon: '⏰', category: 'survival' },
  { id: 'survivor_60', name: 'Iron Will', description: 'Play for 1 hour', icon: '🏆', category: 'survival' },

  // Crafting & On-chain
  { id: 'first_craft', name: 'Crafter', description: 'Craft your first item', icon: '🔨', category: 'building' },
  { id: 'crafter_50', name: 'Artisan', description: 'Craft 50 items', icon: '⚙️', category: 'building' },
  { id: 'first_enchant', name: 'Enchanter', description: 'Enchant your first item', icon: '✨', category: 'exploration' },
  { id: 'first_trade', name: 'Trader', description: 'Trade with a villager', icon: '🤝', category: 'exploration' },
  { id: 'trader_10', name: 'Merchant', description: 'Complete 10 villager trades', icon: '💰', category: 'exploration' },
  { id: 'emerald_collector', name: 'Emerald Collector', description: 'Earn 50 emeralds from bounties', icon: '💚', category: 'exploration' },
  { id: 'beacon_master', name: 'Beacon Master', description: 'Place a beacon', icon: '🔦', category: 'building' },
  { id: 'teleporter', name: 'Teleporter', description: 'Use an ender pearl', icon: '🌀', category: 'exploration' },

  // Exploration & Biomes
  { id: 'explorer', name: 'Explorer', description: 'Walk 1,000 blocks total', icon: '🧭', category: 'exploration' },
  { id: 'deep_diver', name: 'Deep Diver', description: 'Reach bedrock level (Y=0)', icon: '🕳️', category: 'exploration' },
  { id: 'sky_limit', name: 'Sky High', description: 'Reach height Y=50+', icon: '☁️', category: 'exploration' },

  // Advanced combat
  { id: 'slayer_500', name: 'Destroyer', description: 'Kill 500 mobs', icon: '💀', category: 'combat' },
  { id: 'no_death_30', name: 'Untouchable', description: 'Play 30 min without dying', icon: '🛡️', category: 'survival' },

  // Advanced building
  { id: 'builder_5000', name: 'Megabuilder', description: 'Place 5,000 blocks', icon: '🏛️', category: 'building' },
  { id: 'crafter_200', name: 'Master Crafter', description: 'Craft 200 items', icon: '🔧', category: 'building' },

  // On-chain milestones
  { id: 'wallet_connect', name: 'On-Chain', description: 'Connect your wallet', icon: '⛓️', category: 'exploration' },
  { id: 'tier_bronze', name: 'Bronze Age', description: 'Reach Bronze tier', icon: '🥉', category: 'exploration' },
  { id: 'tier_gold', name: 'Gold Rush', description: 'Reach Gold tier', icon: '🥇', category: 'exploration' },
  { id: 'tier_diamond', name: 'Diamond Hands', description: 'Reach Diamond tier', icon: '💎', category: 'exploration' },

  // Long-term
  { id: 'survivor_300', name: 'Marathon', description: 'Play for 5 hours total', icon: '🎖️', category: 'survival' },
  { id: 'miner_5000', name: 'Quarry Master', description: 'Break 5,000 blocks', icon: '🏔️', category: 'mining' },

  // Exploration milestones
  { id: 'traveler_5000', name: 'Nomad', description: 'Walk 5,000 blocks', icon: '🗺️', category: 'exploration' },
  { id: 'deep_miner', name: 'Deep Miner', description: 'Mine copper ore', icon: '🟧', category: 'mining' },
  { id: 'amethyst_hunter', name: 'Crystal Hunter', description: 'Find amethyst', icon: '💜', category: 'mining' },

  // Combat milestones
  { id: 'slayer_1000', name: 'Warlord', description: 'Kill 1,000 mobs', icon: '⚔️', category: 'combat' },
  { id: 'survivor_600', name: 'Endurance', description: 'Play for 10 hours total', icon: '🏅', category: 'survival' },

  // Building milestones
  { id: 'builder_10000', name: 'Architect Supreme', description: 'Place 10,000 blocks', icon: '🏗️', category: 'building' },

  // Lucky mining & combos
  { id: 'lucky_miner', name: 'Lucky Miner', description: 'Get a lucky mining drop', icon: '🍀', category: 'mining' },
  { id: 'combo_king', name: 'Combo King', description: 'Reach a 20-block mining streak', icon: '🔥', category: 'mining' },
  { id: 'deaths_10', name: 'Persistent', description: 'Die 10 times', icon: '☠️', category: 'survival' },
  { id: 'miner_10000', name: 'Earth Eater', description: 'Break 10,000 blocks', icon: '🌍', category: 'mining' },

  // Fishing & food
  { id: 'first_fish', name: 'Angler', description: 'Catch your first fish', icon: '🐟', category: 'exploration' },
  { id: 'fisher_50', name: 'Master Angler', description: 'Catch 50 fish', icon: '🎣', category: 'exploration' },
  { id: 'iron_stomach', name: 'Iron Stomach', description: 'Eat 100 food items', icon: '🍖', category: 'survival' },

  // Level milestones
  { id: 'level_10', name: 'Seasoned', description: 'Reach level 10', icon: '⭐', category: 'survival' },
  { id: 'level_25', name: 'Veteran', description: 'Reach level 25', icon: '🌟', category: 'survival' },
  { id: 'level_50', name: 'Legendary', description: 'Reach level 50', icon: '✨', category: 'survival' },

  // Combat feats
  { id: 'triple_kill', name: 'Triple Kill', description: 'Get a 3-kill streak', icon: '🔥', category: 'combat' },
  { id: 'killing_spree', name: 'Killing Spree', description: 'Get a 5-kill streak', icon: '🔥', category: 'combat' },

  // Batch 42: More achievements
  { id: 'rampage', name: 'Rampage', description: 'Get a 10-kill streak', icon: '💥', category: 'combat' },
  { id: 'fisher_100', name: 'Fish Monger', description: 'Catch 100 fish', icon: '🐠', category: 'exploration' },
  { id: 'glutton', name: 'Glutton', description: 'Eat 500 food items', icon: '🍗', category: 'survival' },
  { id: 'miner_25000', name: 'Deep Earth', description: 'Break 25,000 blocks', icon: '💎', category: 'mining' },
  { id: 'builder_25000', name: 'City Planner', description: 'Place 25,000 blocks', icon: '🏙️', category: 'building' },
  { id: 'traveler_10000', name: 'World Walker', description: 'Walk 10,000 blocks', icon: '🌏', category: 'exploration' },
  { id: 'enchanter_10', name: 'Spellweaver', description: 'Enchant 10 items', icon: '🪄', category: 'exploration' },
  { id: 'crafter_500', name: 'Factory', description: 'Craft 500 items', icon: '🏭', category: 'building' },
  { id: 'deaths_50', name: 'Never Give Up', description: 'Die 50 times', icon: '💪', category: 'survival' },
  { id: 'no_death_60', name: 'Immortal', description: 'Play 60 min without dying', icon: '👼', category: 'survival' },
];

export function checkNewAchievements(
  stats: PlayerStats,
  existing: Set<string>,
): string[] {
  const newly: string[] = [];
  const checks: Record<string, boolean> = {
    first_break: stats.blocksBroken >= 1,
    miner_100: stats.blocksBroken >= 100,
    miner_1000: stats.blocksBroken >= 1000,
    diamond_finder: stats.diamondsFound >= 1,
    first_place: stats.blocksPlaced >= 1,
    builder_100: stats.blocksPlaced >= 100,
    builder_1000: stats.blocksPlaced >= 1000,
    first_kill: stats.mobsKilled >= 1,
    slayer_50: stats.mobsKilled >= 50,
    slayer_200: stats.mobsKilled >= 200,
    first_death: stats.deaths >= 1,
    survivor_30: stats.playTimeSeconds >= 1800,
    survivor_60: stats.playTimeSeconds >= 3600,
    first_craft: stats.itemsCrafted >= 1,
    crafter_50: stats.itemsCrafted >= 50,
    first_enchant: stats.itemsEnchanted >= 1,
    first_trade: stats.villagerTrades >= 1,
    trader_10: stats.villagerTrades >= 10,
    emerald_collector: stats.emeraldsEarned >= 50,
    beacon_master: stats.beaconsPlaced >= 1,
    teleporter: stats.enderPearlsThrown >= 1,
    // Exploration & Biomes
    explorer: stats.distanceWalked >= 1000,
    deep_diver: stats.lowestY <= 1,
    sky_limit: stats.highestY >= 50,
    // Advanced combat
    slayer_500: stats.mobsKilled >= 500,
    no_death_30: stats.longestLifeSeconds >= 1800,
    // Advanced building
    builder_5000: stats.blocksPlaced >= 5000,
    crafter_200: stats.itemsCrafted >= 200,
    // On-chain
    wallet_connect: stats.walletConnected,
    tier_bronze: stats.currentTier === 'bronze' || stats.currentTier === 'silver' || stats.currentTier === 'gold' || stats.currentTier === 'diamond',
    tier_gold: stats.currentTier === 'gold' || stats.currentTier === 'diamond',
    tier_diamond: stats.currentTier === 'diamond',
    // Long-term
    survivor_300: stats.playTimeSeconds >= 18000,
    miner_5000: stats.blocksBroken >= 5000,
    // Exploration milestones
    traveler_5000: stats.distanceWalked >= 5000,
    deep_miner: stats.copperMined >= 1,
    amethyst_hunter: stats.amethystMined >= 1,
    // Combat milestones
    slayer_1000: stats.mobsKilled >= 1000,
    survivor_600: stats.playTimeSeconds >= 36000,
    // Building milestones
    builder_10000: stats.blocksPlaced >= 10000,
    // Lucky mining & combos
    lucky_miner: stats.luckyDrops >= 1,
    combo_king: stats.maxMiningCombo >= 20,
    deaths_10: stats.deaths >= 10,
    miner_10000: stats.blocksBroken >= 10000,
    // Fishing & food
    first_fish: stats.fishCaught >= 1,
    fisher_50: stats.fishCaught >= 50,
    iron_stomach: stats.foodEaten >= 100,
    // Level milestones
    level_10: stats.currentLevel >= 10,
    level_25: stats.currentLevel >= 25,
    level_50: stats.currentLevel >= 50,
    // Combat feats
    triple_kill: stats.maxKillStreak >= 3,
    killing_spree: stats.maxKillStreak >= 5,
    // Batch 42
    rampage: stats.maxKillStreak >= 10,
    fisher_100: stats.fishCaught >= 100,
    glutton: stats.foodEaten >= 500,
    miner_25000: stats.blocksBroken >= 25000,
    builder_25000: stats.blocksPlaced >= 25000,
    traveler_10000: stats.distanceWalked >= 10000,
    enchanter_10: stats.itemsEnchanted >= 10,
    crafter_500: stats.itemsCrafted >= 500,
    deaths_50: stats.deaths >= 50,
    no_death_60: stats.longestLifeSeconds >= 3600,
  };
  for (const [id, met] of Object.entries(checks)) {
    if (met && !existing.has(id)) {
      newly.push(id);
    }
  }
  return newly;
}

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find(a => a.id === id);
}
