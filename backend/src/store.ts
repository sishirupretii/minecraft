// On-chain store verification. Users pay our ERC-20 token on Base mainnet to
// a receiver address, then the client sends the tx hash here. We verify the
// Transfer event on-chain (no private key needed — we only READ the chain)
// and grant the item.

import { createPublicClient, http, parseAbi, decodeEventLog, formatUnits, getAddress } from 'viem';
import { base } from 'viem/chains';
import { supabase } from './supabase';

// ---------- Config (env-driven, NEVER expose client-side) ----------
// Our Based Craft token — used for HOLDER TIERS (hold to unlock perks)
// and BURN-TO-UNLOCK (send to 0x...dead for prestige badges)
export const TOKEN_ADDRESS = (process.env.STORE_TOKEN_ADDRESS ||
  '0x53b83E4C2402DcF4Fe17755d51dd92d25c1a67c8') as `0x${string}`;
const TOKEN_DECIMALS = parseInt(process.env.STORE_TOKEN_DECIMALS || '18', 10);

// USDC on Base — STABLE payment currency for the store. $10 USDC is always $10.
// Avoids token-price fluctuation killing the store UX.
export const PAYMENT_ADDRESS = (process.env.STORE_PAYMENT_ADDRESS ||
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as `0x${string}`; // USDC Base
const PAYMENT_DECIMALS = parseInt(process.env.STORE_PAYMENT_DECIMALS || '6', 10);
export const PAYMENT_SYMBOL = process.env.STORE_PAYMENT_SYMBOL || 'USDC';

// Receiver wallet — where USDC purchases land. Env-only, never exposed.
export const RECEIVER_ADDRESS = (process.env.STORE_RECEIVER_ADDRESS ||
  '').toLowerCase() as `0x${string}`;
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

// ---------- Item catalog ----------
// Prices are in whole tokens (human units). We compute raw amount using decimals.
// Keep IDs small & stable — they're what the UI sends.
export interface StoreItem {
  id: string;
  label: string;
  gameItem: string;   // ItemType on the frontend (what goes into inventory)
  count: number;      // how many of that item per purchase
  price: number;      // in whole tokens
  icon: string;       // emoji
  description: string;
}

// Standard ETH burn address
export const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;

// ---------- Burn-to-Unlock catalog ----------
// Users SEND tokens to 0x...dead address. Gone forever. In exchange: prestige
// badges, permanent in-game perks. Creates supply pressure + visible status.
export interface BurnPerk {
  id: string;
  label: string;
  icon: string;
  description: string;
  burnAmount: number;       // tokens burned (whole units)
  perkType: 'badge' | 'cosmetic' | 'ability' | 'trophy';
}

export const BURN_PERKS: BurnPerk[] = [
  { id: 'badge_bronze',  label: 'Bronze Badge',  icon: '🥉', burnAmount: 100,   perkType: 'badge',    description: 'Bronze username tag + bronze aura' },
  { id: 'badge_silver',  label: 'Silver Badge',  icon: '🥈', burnAmount: 500,   perkType: 'badge',    description: 'Silver username tag + silver aura' },
  { id: 'badge_gold',    label: 'Gold Badge',    icon: '🥇', burnAmount: 2000,  perkType: 'badge',    description: 'Gold username tag + gold aura + chat highlight' },
  { id: 'badge_diamond', label: 'Diamond Badge', icon: '💎', burnAmount: 10000, perkType: 'badge',    description: 'Diamond tag + diamond aura + priority chat' },
  { id: 'perm_fly',      label: 'Permanent Fly', icon: '🕊️', burnAmount: 5000,  perkType: 'ability',  description: 'Unlocks /fly permanently (bypasses tier gate)' },
  { id: 'crown_legend',  label: 'Legend Crown',  icon: '👑', burnAmount: 50000, perkType: 'trophy',   description: 'Visible floating crown above your head (all players see it)' },
  { id: 'rainbow_name',  label: 'Rainbow Name',  icon: '🌈', burnAmount: 3000,  perkType: 'cosmetic', description: 'Rainbow-animated username in chat + leaderboards' },
];

export function getBurnPerk(id: string): BurnPerk | undefined {
  return BURN_PERKS.find((p) => p.id === id);
}

// ---------- Token Holder Tiers ----------
// Read wallet balance via RPC; map to tier. Pure HODL incentive — no locking,
// user can sell any time but loses the tier while balance < threshold.
export interface HolderTier {
  id: string;
  label: string;
  minHolding: number;      // whole tokens
  color: string;
  perks: string[];
}

export const HOLDER_TIERS: HolderTier[] = [
  { id: 'none',    label: 'Visitor', minHolding: 0,      color: '#888888', perks: [] },
  { id: 'rookie',  label: 'Rookie',  minHolding: 100,    color: '#8fd97f', perks: ['+10% XP', '+1 slot kept on death'] },
  { id: 'pro',     label: 'Pro',     minHolding: 1000,   color: '#5c9cff', perks: ['+25% XP', '+10 slots kept', 'Bronze aura'] },
  { id: 'whale',   label: 'Whale',   minHolding: 10000,  color: '#ffd700', perks: ['+50% XP', 'All slots kept', 'Gold aura', '/fly unlocked'] },
  { id: 'titan',   label: 'Titan',   minHolding: 100000, color: '#ff44aa', perks: ['+100% XP', 'Invulnerable on respawn (30s)', 'Titan crown', 'All perks'] },
];

export function tierForBalance(rawBalance: bigint): HolderTier {
  const whole = Number(rawBalance / 10n ** BigInt(TOKEN_DECIMALS));
  let result = HOLDER_TIERS[0];
  for (const t of HOLDER_TIERS) {
    if (whole >= t.minHolding) result = t;
  }
  return result;
}

export const STORE_ITEMS: StoreItem[] = [
  // Basics
  { id: 'starter_pack', label: 'Starter Pack', gameItem: 'cobblestone', count: 64, price: 10, icon: '🧱', description: '64 Cobblestone + tool kit' },
  { id: 'wood_bundle', label: 'Wood Bundle', gameItem: 'cyan_wood', count: 32, price: 15, icon: '🌳', description: '32 logs for crafting' },
  { id: 'torch_pack', label: 'Torch Pack', gameItem: 'torch', count: 64, price: 20, icon: '🔥', description: '64 torches — never fear the dark' },
  { id: 'food_feast', label: 'Food Feast', gameItem: 'cooked_beef', count: 32, price: 30, icon: '🥩', description: '32 cooked steak' },
  // Tools
  { id: 'iron_pickaxe', label: 'Iron Pickaxe', gameItem: 'iron_pickaxe', count: 1, price: 50, icon: '⛏️', description: 'Mine faster, break diamond ore' },
  { id: 'diamond_pickaxe', label: 'Diamond Pickaxe', gameItem: 'diamond_pickaxe', count: 1, price: 150, icon: '💎⛏️', description: 'The ultimate mining tool' },
  { id: 'diamond_sword', label: 'Diamond Sword', gameItem: 'diamond_sword', count: 1, price: 200, icon: '⚔️', description: 'Best melee weapon' },
  // Armor
  { id: 'iron_armor_set', label: 'Iron Armor Set', gameItem: 'iron_helmet', count: 1, price: 80, icon: '🛡️', description: 'Iron helmet (set later: chest/legs/boots)' },
  { id: 'diamond_armor_set', label: 'Diamond Armor Set', gameItem: 'diamond_helmet', count: 1, price: 250, icon: '💎🛡️', description: 'Diamond helmet — unmatched defense' },
  // Rare items
  { id: 'golden_apples', label: 'Golden Apples (5)', gameItem: 'golden_apple', count: 5, price: 100, icon: '🍎', description: '5x golden apples — restore full HP' },
  { id: 'ender_pearls', label: 'Ender Pearls (10)', gameItem: 'ender_pearl', count: 10, price: 80, icon: '🌀', description: '10x teleportation pearls' },
  { id: 'tnt_crate', label: 'TNT Crate (16)', gameItem: 'tnt', count: 16, price: 60, icon: '💣', description: '16 TNT blocks for demolition' },
  { id: 'beacon', label: 'Beacon', gameItem: 'beacon', count: 1, price: 500, icon: '🔷', description: 'Permanent speed/regen/strength buffs' },
];

export function getItem(id: string): StoreItem | undefined {
  return STORE_ITEMS.find((it) => it.id === id);
}

// Raw USDC amount (6-decimal) for store purchases. 10 → 10_000_000 (10 USDC)
export function rawAmountForPrice(priceWhole: number): bigint {
  return BigInt(priceWhole) * 10n ** BigInt(PAYMENT_DECIMALS);
}
// Raw basedcraft token amount (18-decimal) for burns. Used by verifyBurn / burn perks
export function rawTokenAmount(whole: number): bigint {
  return BigInt(whole) * 10n ** BigInt(TOKEN_DECIMALS);
}

// ---------- Purchase verification ----------
export interface VerifyResult {
  ok: boolean;
  reason?: string;
  item?: StoreItem;
  buyer?: string;
  amount?: string;
}

/**
 * Verifies a transaction hash represents a valid payment for the given item.
 * Returns detailed result. NEVER requires a private key — read-only chain query.
 */
export async function verifyPurchase(
  txHash: string,
  itemId: string,
): Promise<VerifyResult> {
  if (!RECEIVER_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(RECEIVER_ADDRESS)) {
    return { ok: false, reason: 'Server misconfigured: STORE_RECEIVER_ADDRESS not set' };
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: 'Invalid tx hash format' };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false, reason: 'Unknown item' };

  // Already redeemed?
  const { data: existing } = await supabase
    .from('purchases')
    .select('id, delivered')
    .eq('tx_hash', txHash.toLowerCase())
    .maybeSingle();
  if (existing) {
    return { ok: false, reason: 'This transaction has already been redeemed' };
  }

  // Fetch receipt from chain
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (e: any) {
    return { ok: false, reason: `Transaction not found on Base: ${e?.message ?? 'unknown'}` };
  }
  if (!receipt) return { ok: false, reason: 'Transaction not found' };
  if (receipt.status !== 'success') return { ok: false, reason: 'Transaction failed on-chain' };

  // Find a Transfer log from USDC TO the receiver
  const paymentAddr = PAYMENT_ADDRESS.toLowerCase();
  const receiverAddr = RECEIVER_ADDRESS.toLowerCase();
  const expectedRaw = rawAmountForPrice(item.price);

  let buyer: string | null = null;
  let transferValue: bigint | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== paymentAddr) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC20_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if (args.to.toLowerCase() !== receiverAddr) continue;
      // Accept exact-match or overpayment (in case user tips)
      if (args.value < expectedRaw) continue;
      buyer = args.from;
      transferValue = args.value;
      break;
    } catch {
      // not a Transfer event, skip
    }
  }

  if (!buyer || transferValue === null) {
    return {
      ok: false,
      reason: `No valid Transfer of ${item.price} ${PAYMENT_SYMBOL} to receiver found in tx`,
    };
  }

  return {
    ok: true,
    item,
    buyer: getAddress(buyer),
    amount: transferValue.toString(),
  };
}

/**
 * Record a verified purchase. Returns true if newly recorded, false if dup.
 */
export async function recordPurchase(params: {
  txHash: string;
  username: string;
  buyer: string;
  item: StoreItem;
  amount: string;
  blockNumber?: bigint;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('purchases')
    .insert({
      tx_hash: params.txHash.toLowerCase(),
      username: params.username,
      buyer_address: params.buyer.toLowerCase(),
      item_id: params.item.id,
      item_count: params.item.count,
      token_amount: params.amount,
      block_number: params.blockNumber ? Number(params.blockNumber) : null,
      delivered: true,
    })
    .select()
    .single();
  if (error) {
    console.error('[store] recordPurchase err:', error.message);
    return false;
  }
  return !!data;
}

/** Public info safe to expose to clients (no keys, no secrets). */
export function publicStoreConfig() {
  return {
    // Payment token (USDC) — used by purchases
    paymentAddress: PAYMENT_ADDRESS,
    paymentDecimals: PAYMENT_DECIMALS,
    paymentSymbol: PAYMENT_SYMBOL,
    // Based Craft token — used by burns + holder tiers
    tokenAddress: TOKEN_ADDRESS,
    tokenDecimals: TOKEN_DECIMALS,
    // Where payments land
    receiverAddress: RECEIVER_ADDRESS,
    burnAddress: BURN_ADDRESS,
    chainId: base.id, // 8453
    items: STORE_ITEMS,
    burnPerks: BURN_PERKS,
    holderTiers: HOLDER_TIERS,
    // Legacy field name preserved for old clients (= token decimals)
    decimals: TOKEN_DECIMALS,
  };
}

// ---------- Burn verification ----------
/**
 * Verify a user sent the required tokens to BURN_ADDRESS and unlock a perk.
 * Same logic as purchase verification but recipient is 0x...dead.
 */
export async function verifyBurn(
  txHash: string,
  perkId: string,
): Promise<{ ok: boolean; reason?: string; perk?: BurnPerk; buyer?: string; amount?: string }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: 'Invalid tx hash' };
  }
  const perk = getBurnPerk(perkId);
  if (!perk) return { ok: false, reason: 'Unknown perk' };

  const { data: existing } = await supabase
    .from('token_burns')
    .select('id')
    .eq('tx_hash', txHash.toLowerCase())
    .maybeSingle();
  if (existing) return { ok: false, reason: 'Burn tx already redeemed' };

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (e: any) {
    return { ok: false, reason: `Tx not found: ${e?.message ?? 'unknown'}` };
  }
  if (!receipt || receipt.status !== 'success') return { ok: false, reason: 'Tx failed or not found' };

  const tokenAddr = TOKEN_ADDRESS.toLowerCase();
  const burnAddr = BURN_ADDRESS.toLowerCase();
  const expectedRaw = rawTokenAmount(perk.burnAmount); // basedcraft uses its own decimals

  let buyer: string | null = null;
  let transferValue: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddr) continue;
    try {
      const decoded = decodeEventLog({ abi: ERC20_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if (args.to.toLowerCase() !== burnAddr) continue;
      if (args.value < expectedRaw) continue;
      buyer = args.from;
      transferValue = args.value;
      break;
    } catch {
      /* skip */
    }
  }
  if (!buyer || transferValue === null) {
    return {
      ok: false,
      reason: `No Transfer of ≥${perk.burnAmount} tokens to ${BURN_ADDRESS} found`,
    };
  }
  return { ok: true, perk, buyer: getAddress(buyer), amount: transferValue.toString() };
}

export async function recordBurn(params: {
  txHash: string;
  username: string;
  buyer: string;
  perk: BurnPerk;
  amount: string;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('token_burns')
    .insert({
      tx_hash: params.txHash.toLowerCase(),
      username: params.username,
      buyer_address: params.buyer.toLowerCase(),
      amount: params.amount,
      perk_id: params.perk.id,
    })
    .select()
    .single();
  if (error) {
    console.error('[store] recordBurn err:', error.message);
    return false;
  }
  return !!data;
}

// ---------- Token holder tier (read wallet balance via RPC) ----------
const ERC20_READ_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

export async function getHolderInfo(walletAddress: string): Promise<{
  balance: string;
  balanceWhole: number;
  tier: HolderTier;
}> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return { balance: '0', balanceWhole: 0, tier: HOLDER_TIERS[0] };
  }
  try {
    const raw = await client.readContract({
      address: TOKEN_ADDRESS,
      abi: ERC20_READ_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    });
    const tier = tierForBalance(raw as bigint);
    return {
      balance: (raw as bigint).toString(),
      balanceWhole: Number((raw as bigint) / 10n ** BigInt(TOKEN_DECIMALS)),
      tier,
    };
  } catch (e) {
    console.error('[store] getHolderInfo err:', e);
    return { balance: '0', balanceWhole: 0, tier: HOLDER_TIERS[0] };
  }
}
