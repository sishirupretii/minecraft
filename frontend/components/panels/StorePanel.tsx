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

export interface StoreConfig {
  tokenAddress: `0x${string}`;
  receiverAddress: `0x${string}`;
  decimals: number;
  chainId: number;
  items: StoreItem[];
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
  walletConnected: boolean;
  lastResult?: { ok: boolean; reason?: string; label?: string } | null;
  onClearResult?: () => void;
}

export default function StorePanel({
  visible,
  onClose,
  config,
  history,
  onBuyStart,
  walletConnected,
  lastResult,
  onClearResult,
}: Props) {
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'shop' | 'history'>('shop');
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

  // When tx confirmed, submit hash to server for verification
  useEffect(() => {
    if (isConfirmed && pendingHash && buyingId) {
      onBuyStart(buyingId, pendingHash);
      setPendingHash(undefined);
      setBuyingId(null);
    }
  }, [isConfirmed, pendingHash, buyingId, onBuyStart]);

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

        {/* Tabs */}
        <div className="flex gap-1" style={{ borderBottom: '1px solid #333', paddingBottom: '4px' }}>
          {(['shop', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px',
                padding: '6px 10px',
                background: tab === t ? 'rgba(0,82,255,0.35)' : 'rgba(0,0,0,0.35)',
                border: tab === t ? '1px solid #0052ff' : '1px solid #444',
                color: tab === t ? '#fff' : '#aaa',
                cursor: 'pointer',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {t === 'shop' ? '🛒 SHOP' : '📜 HISTORY'}
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
