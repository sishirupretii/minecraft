'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, erc20Abi } from 'viem';
import { base } from 'wagmi/chains';

export interface StoreItem {
  id: string;
  label: string;
  gameItem: string;
  count: number;
  price: number;
  icon: string;
  description: string;
}

export interface BurnPerk {
  id: string;
  label: string;
  icon: string;
  description: string;
  burnAmount: number;
  perkType: 'badge' | 'cosmetic' | 'ability' | 'trophy';
}

export interface HolderTier {
  id: string;
  label: string;
  minHolding: number;
  color: string;
  perks: string[];
}

export interface StoreConfig {
  // Payment token (= BASEDCRAFT) — for BUY (USD-pegged, live converted)
  paymentAddress?: `0x${string}`;
  paymentDecimals?: number;
  paymentSymbol?: string;
  // Based Craft token address (same as payment, used for BURN + holder tiers)
  tokenAddress: `0x${string}`;
  tokenDecimals?: number;
  // Current USD price of the token (live from DexScreener, 0 if unavailable)
  tokenPriceUsd?: number;
  // Targets
  receiverAddress: `0x${string}`;
  burnAddress: `0x${string}`;
  decimals: number; // legacy = tokenDecimals
  chainId: number;
  items: StoreItem[];
  burnPerks: BurnPerk[];
  holderTiers: HolderTier[];
}

// Fallback item list — shown if server response is delayed/fails so store is
// never blank. Matches the backend STORE_ITEMS exactly so prices line up.
const FALLBACK_ITEMS: StoreItem[] = [
  { id: 'starter_pack', label: 'Starter Pack', gameItem: 'cobblestone', count: 64, price: 10, icon: '🧱', description: '64 Cobblestone + tool kit' },
  { id: 'wood_bundle', label: 'Wood Bundle', gameItem: 'cyan_wood', count: 32, price: 15, icon: '🌳', description: '32 logs for crafting' },
  { id: 'torch_pack', label: 'Torch Pack', gameItem: 'torch', count: 64, price: 20, icon: '🔥', description: '64 torches — never fear the dark' },
  { id: 'food_feast', label: 'Food Feast', gameItem: 'cooked_beef', count: 32, price: 30, icon: '🥩', description: '32 cooked steak' },
  { id: 'iron_pickaxe', label: 'Iron Pickaxe', gameItem: 'iron_pickaxe', count: 1, price: 50, icon: '⛏️', description: 'Mine faster, break diamond ore' },
  { id: 'diamond_pickaxe', label: 'Diamond Pickaxe', gameItem: 'diamond_pickaxe', count: 1, price: 150, icon: '💎⛏️', description: 'The ultimate mining tool' },
  { id: 'diamond_sword', label: 'Diamond Sword', gameItem: 'diamond_sword', count: 1, price: 200, icon: '⚔️', description: 'Best melee weapon' },
  { id: 'iron_armor_set', label: 'Iron Armor Set', gameItem: 'iron_helmet', count: 1, price: 80, icon: '🛡️', description: 'Iron helmet' },
  { id: 'diamond_armor_set', label: 'Diamond Armor Set', gameItem: 'diamond_helmet', count: 1, price: 250, icon: '💎🛡️', description: 'Diamond helmet — unmatched defense' },
  { id: 'golden_apples', label: 'Golden Apples (5)', gameItem: 'golden_apple', count: 5, price: 100, icon: '🍎', description: '5x golden apples — restore full HP' },
  { id: 'ender_pearls', label: 'Ender Pearls (10)', gameItem: 'ender_pearl', count: 10, price: 80, icon: '🌀', description: '10x teleportation pearls' },
  { id: 'tnt_crate', label: 'TNT Crate (16)', gameItem: 'tnt', count: 16, price: 60, icon: '💣', description: '16 TNT blocks for demolition' },
  { id: 'beacon', label: 'Beacon', gameItem: 'beacon', count: 1, price: 500, icon: '🔷', description: 'Permanent speed/regen/strength buffs' },
];

export interface HolderInfo {
  balance: string;
  balanceWhole: number;
  tier: HolderTier;
}

interface PurchaseHistoryRow {
  tx_hash: string;
  item_id: string;
  item_count: number;
  token_amount: string;
  created_at: string;
  delivered: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  config: StoreConfig | null;
  history: PurchaseHistoryRow[];
  onBuyStart: (itemId: string, txHash: string) => void;
  onBurnStart: (perkId: string, txHash: string) => void;
  walletConnected: boolean;
  lastResult?: { ok: boolean; reason?: string; label?: string } | null;
  onClearResult?: () => void;
  holderInfo: HolderInfo | null;
  burnTotals: { totalBurned: string; burnCount: number };
  burnHistory: Array<{ tx_hash: string; perk_id: string; amount: string; created_at: string }>;
}

export default function StorePanel({
  visible,
  onClose,
  config,
  history,
  onBuyStart,
  onBurnStart,
  walletConnected,
  lastResult,
  onClearResult,
  holderInfo,
  burnTotals,
  burnHistory,
}: Props) {
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [burnMode, setBurnMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'shop' | 'burn' | 'tiers' | 'history'>('shop');
  const { address: userAddress, chainId: userChainId } = useAccount();

  const { writeContractAsync, isPending } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: pendingHash,
  });

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  // When tx confirmed, submit hash to server for verification (buy OR burn)
  useEffect(() => {
    if (isConfirmed && pendingHash && buyingId) {
      if (burnMode) onBurnStart(buyingId, pendingHash);
      else onBuyStart(buyingId, pendingHash);
      setPendingHash(undefined);
      setBuyingId(null);
      setBurnMode(false);
    }
  }, [isConfirmed, pendingHash, buyingId, burnMode, onBuyStart, onBurnStart]);

  // Clear error when a result arrives
  useEffect(() => {
    if (lastResult) setError(null);
  }, [lastResult]);

  if (!visible) return null;

  async function handleBuy(item: StoreItem) {
    setError(null);
    if (!config) { setError('Store not loaded'); return; }
    if (!walletConnected || !userAddress) {
      setError('Connect your wallet to buy');
      return;
    }
    if (userChainId !== config.chainId) {
      setError(`Switch to Base (chain ${config.chainId}) in your wallet`);
      return;
    }
    try {
      setBuyingId(item.id);
      setBurnMode(false);
      // Pay in $BASEDCRAFT — live-convert USD price → tokens using current market
      const priceUsd = config.tokenPriceUsd ?? 0;
      if (priceUsd <= 0) {
        setError('Token price unavailable — try again in a few seconds');
        setBuyingId(null);
        return;
      }
      const paymentAddress = config.paymentAddress ?? config.tokenAddress;
      const paymentDecimals = config.paymentDecimals ?? config.tokenDecimals ?? 18;
      // Pay 5% MORE than quote to comfortably survive price movement + 10% backend tolerance
      const tokensNeeded = (item.price / priceUsd) * 1.05;
      // Convert to raw uint via parseUnits (avoids float precision loss)
      const amount = parseUnits(tokensNeeded.toFixed(6), paymentDecimals);
      const hash = await writeContractAsync({
        address: paymentAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [config.receiverAddress, amount],
        chainId: base.id,
      });
      setPendingHash(hash);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Transaction rejected');
      setBuyingId(null);
    }
  }

  async function handleBurn(perk: BurnPerk) {
    setError(null);
    if (!config) { setError('Store not loaded'); return; }
    if (!walletConnected || !userAddress) {
      setError('Connect your wallet to burn');
      return;
    }
    if (userChainId !== config.chainId) {
      setError(`Switch to Base (chain ${config.chainId})`);
      return;
    }
    if (!confirm(`🔥 Burn ${perk.burnAmount} tokens FOREVER for "${perk.label}"?\n\nThis removes them from circulation permanently. Cannot be undone.`)) {
      return;
    }
    try {
      setBuyingId(perk.id);
      setBurnMode(true);
      // Burns always use $BASEDCRAFT token (its own decimals, not USDC's)
      const tokenDecimals = config.tokenDecimals ?? config.decimals ?? 18;
      const amount = parseUnits(perk.burnAmount.toString(), tokenDecimals);
      const hash = await writeContractAsync({
        address: config.tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [config.burnAddress, amount],
        chainId: base.id,
      });
      setPendingHash(hash);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Burn rejected');
      setBuyingId(null);
      setBurnMode(false);
    }
  }

  // Use server items if present, otherwise fallback catalog so store is never empty
  const items = (config?.items && config.items.length > 0) ? config.items : FALLBACK_ITEMS;
  const tokenShort = config ? `${config.tokenAddress.slice(0, 6)}…${config.tokenAddress.slice(-4)}` : '';
  const paymentSymbol = config?.paymentSymbol ?? 'BASEDCRAFT';
  const tokenPriceUsd = config?.tokenPriceUsd ?? 0;

  // Format token quantities concisely: 12_345 → "12.3K", 1_234_567 → "1.23M"
  function formatTokens(n: number): string {
    if (!isFinite(n)) return '—';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    if (n >= 1) return n.toFixed(0);
    return n.toFixed(4);
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bc-panel flex flex-col gap-3 p-6 relative"
        style={{ maxWidth: '680px', width: '100%', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '8px', right: '10px',
            fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
            color: '#aaa', background: 'none', border: 'none', cursor: 'pointer',
            textShadow: '1px 1px 0 #000',
          }}
        >X</button>

        <div
          style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: '14px',
            color: '#5c9cff', textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
          }}
        >
          🛒 BASEDCRAFT STORE
        </div>
        <div
          style={{
            fontFamily: "'VT323', monospace", fontSize: '15px',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          🛒 Prices in <span style={{ color: '#2fb574' }}>USD</span>, paid with <span style={{ color: '#ff9966' }}>${paymentSymbol}</span> at live market rate · 🔥 Burn for perks
          {tokenPriceUsd > 0 && (
            <span style={{ marginLeft: '8px', color: '#88aaff' }}>
              1 token = ${tokenPriceUsd.toFixed(tokenPriceUsd < 0.0001 ? 10 : 6)}
            </span>
          )}
        </div>

        {/* Holder info banner */}
        {holderInfo && (
          <div
            style={{
              padding: '8px 10px',
              background: `linear-gradient(90deg, ${holderInfo.tier.color}22, transparent)`,
              border: `1px solid ${holderInfo.tier.color}55`,
              fontFamily: "'VT323', monospace", fontSize: '14px',
            }}
          >
            <div style={{ color: holderInfo.tier.color, fontWeight: 'bold' }}>
              🏆 {holderInfo.tier.label} tier · {holderInfo.balanceWhole.toLocaleString()} tokens held
            </div>
            {holderInfo.tier.perks.length > 0 && (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                Active perks: {holderInfo.tier.perks.join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1" style={{ borderBottom: '1px solid #333', paddingBottom: '4px', flexWrap: 'wrap' }}>
          {(['shop', 'burn', 'tiers', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                padding: '6px 10px',
                background: tab === t
                  ? (t === 'burn' ? 'rgba(255,80,0,0.35)' : 'rgba(0,82,255,0.35)')
                  : 'rgba(0,0,0,0.35)',
                border: tab === t
                  ? (t === 'burn' ? '1px solid #ff5000' : '1px solid #0052ff')
                  : '1px solid #444',
                color: tab === t ? '#fff' : '#aaa',
                cursor: 'pointer',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {t === 'shop' ? '🛒 SHOP' : t === 'burn' ? '🔥 BURN' : t === 'tiers' ? '🏆 TIERS' : '📜 HISTORY'}
            </button>
          ))}
        </div>

        {/* Status messages */}
        {(error || (isPending || isConfirming) || lastResult) && (
          <div style={{
            padding: '8px 10px',
            background: error
              ? 'rgba(200,60,60,0.15)'
              : (isPending || isConfirming || (lastResult && !lastResult.ok))
                ? 'rgba(255,200,80,0.12)'
                : 'rgba(80,200,120,0.15)',
            border: error || (lastResult && !lastResult.ok)
              ? '1px solid rgba(200,60,60,0.45)'
              : (isPending || isConfirming)
                ? '1px solid rgba(255,200,80,0.4)'
                : '1px solid rgba(80,200,120,0.45)',
            fontFamily: "'VT323', monospace", fontSize: '15px',
            color: error || (lastResult && !lastResult.ok) ? '#ff8888' : (isPending || isConfirming) ? '#ffcc66' : '#88ff88',
          }}>
            {error && `⚠ ${error}`}
            {!error && isPending && '⏳ Waiting for wallet confirmation…'}
            {!error && !isPending && isConfirming && '⛓ Waiting for tx to be mined on Base…'}
            {!error && !isPending && !isConfirming && lastResult?.ok && `✅ Delivered: ${lastResult.label}`}
            {!error && !isPending && !isConfirming && lastResult && !lastResult.ok && `⚠ ${lastResult.reason}`}
            {lastResult && onClearResult && (
              <button onClick={onClearResult} style={{ marginLeft: '8px', color: '#aaa', cursor: 'pointer' }}>✕</button>
            )}
          </div>
        )}

        {/* Shop grid */}
        {tab === 'shop' && (
          <div style={{ overflowY: 'auto', maxHeight: '55vh', paddingRight: '6px' }}>
            {items.length === 0 && (
              <div style={{ fontFamily: "'VT323', monospace", color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '30px' }}>
                Loading store items…
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '10px',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid #444',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '26px' }}>{item.icon}</div>
                  <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: '#fff' }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: '13px', color: 'rgba(255,255,255,0.55)', flex: 1 }}>
                    {item.description}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: '#2fb574', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                      <span style={{ fontSize: '16px', fontWeight: 'bold' }}>${item.price}</span>
                      {tokenPriceUsd > 0 && (
                        <span style={{ fontSize: '12px', color: '#88aaff' }}>
                          ≈ {formatTokens(item.price / tokenPriceUsd)} ${paymentSymbol}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleBuy(item)}
                      disabled={(buyingId !== null && buyingId !== item.id) || isPending || isConfirming}
                      style={{
                        padding: '4px 8px',
                        fontFamily: "'Press Start 2P', monospace", fontSize: '8px',
                        background: (buyingId === item.id) ? '#444' : '#0052ff',
                        color: '#fff',
                        border: '1px solid #3478f6',
                        cursor: (buyingId !== null) ? 'wait' : 'pointer',
                        opacity: (buyingId !== null && buyingId !== item.id) ? 0.4 : 1,
                      }}
                    >
                      {buyingId === item.id ? '…' : 'BUY'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Burn-to-Unlock */}
        {tab === 'burn' && (
          <div style={{ overflowY: 'auto', maxHeight: '55vh', paddingRight: '6px' }}>
            <div
              style={{
                padding: '10px',
                marginBottom: '10px',
                background: 'linear-gradient(90deg, rgba(255,80,0,0.18), rgba(255,150,0,0.08))',
                border: '1px solid rgba(255,100,0,0.4)',
                fontFamily: "'VT323', monospace", fontSize: '14px',
                color: '#ffbb88',
              }}
            >
              🔥 <strong style={{ color: '#fff' }}>Burn tokens to unlock permanent perks.</strong> Tokens are sent
              to 0x…dEaD and removed from circulation FOREVER. Reduces total supply · makes remaining tokens
              rarer · earns prestige visible to everyone.
              {burnTotals.burnCount > 0 && (
                <div style={{ marginTop: '4px', color: '#ffaa55' }}>
                  Your contribution: {burnTotals.burnCount} burn(s), total amount locked away.
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
              {(config?.burnPerks ?? []).map((perk) => {
                const alreadyOwned = burnHistory.some((b) => b.perk_id === perk.id);
                return (
                  <div
                    key={perk.id}
                    style={{
                      padding: '10px',
                      background: alreadyOwned ? 'rgba(80,200,120,0.12)' : 'rgba(40,10,0,0.4)',
                      border: alreadyOwned ? '1px solid rgba(80,200,120,0.45)' : '1px solid #633',
                      display: 'flex', flexDirection: 'column', gap: '4px',
                    }}
                  >
                    <div style={{ fontSize: '26px' }}>{perk.icon}</div>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: '#fff' }}>
                      {perk.label}
                    </div>
                    <div style={{ fontFamily: "'VT323', monospace", fontSize: '13px', color: 'rgba(255,255,255,0.6)', flex: 1 }}>
                      {perk.description}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontFamily: "'VT323', monospace", fontSize: '16px', color: '#ff7744' }}>
                        🔥 {perk.burnAmount}
                      </span>
                      {alreadyOwned ? (
                        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: '#66ff99' }}>
                          ✓ OWNED
                        </span>
                      ) : (
                        <button
                          onClick={() => handleBurn(perk)}
                          disabled={(buyingId !== null && buyingId !== perk.id) || isPending || isConfirming}
                          style={{
                            padding: '4px 8px',
                            fontFamily: "'Press Start 2P', monospace", fontSize: '8px',
                            background: buyingId === perk.id ? '#444' : '#aa3300',
                            color: '#fff',
                            border: '1px solid #ff5500',
                            cursor: buyingId !== null ? 'wait' : 'pointer',
                            opacity: (buyingId !== null && buyingId !== perk.id) ? 0.4 : 1,
                          }}
                        >
                          {buyingId === perk.id ? '…' : '🔥 BURN'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tier info */}
        {tab === 'tiers' && (
          <div style={{ overflowY: 'auto', maxHeight: '55vh', paddingRight: '6px' }}>
            <div
              style={{
                padding: '10px',
                marginBottom: '10px',
                background: 'rgba(0,82,255,0.12)',
                border: '1px solid rgba(0,82,255,0.4)',
                fontFamily: "'VT323', monospace", fontSize: '14px',
                color: '#aaccff',
              }}
            >
              🏆 <strong style={{ color: '#fff' }}>Hold tokens, unlock perks.</strong> Your tier is checked live
              from your wallet — no staking, no lock-up. Hold the tokens, you get the perks. Sell and lose them.
            </div>
            {(config?.holderTiers ?? []).map((t) => {
              const current = holderInfo?.tier.id === t.id;
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '10px',
                    marginBottom: '6px',
                    background: current ? `${t.color}18` : 'rgba(0,0,0,0.3)',
                    border: current ? `1px solid ${t.color}` : '1px solid #333',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
                      color: t.color, textShadow: '1px 1px 0 #000',
                    }}>
                      {t.label}
                    </span>
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: '15px', color: '#fff' }}>
                      {t.minHolding.toLocaleString()}+ tokens
                    </span>
                  </div>
                  {t.perks.length > 0 && (
                    <div style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: 'rgba(255,255,255,0.55)', marginTop: '4px' }}>
                      {t.perks.map((p, i) => <div key={i}>· {p}</div>)}
                    </div>
                  )}
                  {current && (
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: '#66ff99', marginTop: '4px' }}>
                      ★ YOUR CURRENT TIER
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* History */}
        {tab === 'history' && (
          <div style={{ overflowY: 'auto', maxHeight: '55vh', paddingRight: '6px' }}>
            {history.length === 0 && (
              <div style={{ fontFamily: "'VT323', monospace", color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '30px' }}>
                No purchases yet
              </div>
            )}
            {history.map((row) => {
              const item = items.find((i) => i.id === row.item_id);
              return (
                <div
                  key={row.tx_hash}
                  style={{
                    padding: '6px 10px', marginBottom: '4px',
                    background: 'rgba(0,0,0,0.3)', border: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontFamily: "'VT323', monospace", fontSize: '14px',
                  }}
                >
                  <div>
                    <span style={{ color: '#fff' }}>{item?.icon ?? '📦'} {item?.label ?? row.item_id}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>
                      ×{row.item_count}
                    </span>
                  </div>
                  <a
                    href={`https://basescan.org/tx/${row.tx_hash}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: '#5c9cff', fontSize: '12px' }}
                  >
                    {row.tx_hash.slice(0, 10)}… ↗
                  </a>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
            color: 'rgba(255,255,255,0.3)', textAlign: 'center',
          }}
        >
          ESC TO CLOSE · SECURE ON-CHAIN PAYMENTS · BASE MAINNET
        </div>
      </div>
    </div>
  );
}
