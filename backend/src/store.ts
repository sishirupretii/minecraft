// On-chain store verification. Users pay our ERC-20 token on Base mainnet to
// a receiver address, then the client sends the tx hash here. We verify the
// Transfer event on-chain (no private key needed — we only READ the chain)
// and grant the item.

import { createPublicClient, http, parseAbi, decodeEventLog, formatUnits, getAddress } from 'viem';
import { base } from 'viem/chains';
import { supabase } from './supabase';

// ---------- Config (env-driven, NEVER expose client-side) ----------
export const TOKEN_ADDRESS = (process.env.STORE_TOKEN_ADDRESS ||
  '0x53b83E4C2402DcF4Fe17755d51dd92d25c1a67c8') as `0x${string}`;
export const RECEIVER_ADDRESS = (process.env.STORE_RECEIVER_ADDRESS ||
  '').toLowerCase() as `0x${string}`;
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const TOKEN_DECIMALS = parseInt(process.env.STORE_TOKEN_DECIMALS || '18', 10);

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

// Compute raw token amount (uint256 string) for a whole-token price
export function rawAmountForPrice(priceWhole: number): bigint {
  return BigInt(priceWhole) * 10n ** BigInt(TOKEN_DECIMALS);
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

  // Find a Transfer log from our token TO the receiver
  const tokenAddr = TOKEN_ADDRESS.toLowerCase();
  const receiverAddr = RECEIVER_ADDRESS.toLowerCase();
  const expectedRaw = rawAmountForPrice(item.price);

  let buyer: string | null = null;
  let transferValue: bigint | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddr) continue;
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
      reason: `No valid Transfer of ${item.price} tokens to ${RECEIVER_ADDRESS} found in tx`,
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
    tokenAddress: TOKEN_ADDRESS,
    receiverAddress: RECEIVER_ADDRESS,
    decimals: TOKEN_DECIMALS,
    chainId: base.id, // 8453
    items: STORE_ITEMS,
  };
}
