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
  tokenAddress: `0x${string}`;
  receiverAddress: `0x${string}`;
  burnAddress: `0x${string}`;
  decimals: number;
  chainId: number;
  items: StoreItem[];
  burnPerks: BurnPerk[];
  holderTiers: HolderTier[];
}

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
      const amount = parseUnits(item.price.toString(), config.decimals);
      const hash = await writeContractAsync({
        address: config.tokenAddress,
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
      const amount = parseUnits(perk.burnAmount.toString(), config.decimals);
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

  const items = config?.items ?? [];
  const tokenShort = config ? `${config.tokenAddress.slice(0, 6)}…${config.tokenAddress.slice(-4)}` : '';

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
          Pay with our token on Base mainnet — items delivered to your inventory after 1 confirmation.
          Token: <span style={{ color: '#88aaff' }}>{tokenShort}</span>
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
                Store unavailable — server not configured yet
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
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: '16px', color: '#5c9cff' }}>
                      {item.price} 🪙
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
