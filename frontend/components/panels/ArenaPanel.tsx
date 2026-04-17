'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, erc20Abi } from 'viem';
import { base } from 'wagmi/chains';

export interface ArenaState {
  active: boolean;
  queueSize: number;
  id?: number;
  phase?: 'betting' | 'active' | 'ended' | 'cancelled';
  playerA?: string;
  playerB?: string;
  walletA?: string | null;
  walletB?: string | null;
  hpA?: number;
  hpB?: number;
  bettingEndsAt?: number;
  fightTimeoutAt?: number;
  potUsdA?: number;
  potUsdB?: number;
  oddsA?: number;
  oddsB?: number;
  bettorCount?: number;
  winner?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  state: ArenaState;
  username: string;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
  onBetTx: (txHash: string, side: 'a' | 'b', stakeUsd: 10 | 20 | 50) => void;
  walletConnected: boolean;
  storeConfig: {
    tokenAddress: `0x${string}`;
    receiverAddress: `0x${string}`;
    tokenDecimals?: number;
    tokenPriceUsd?: number;
    chainId: number;
  } | null;
  myBet: { side: 'a' | 'b'; stakeUsd: number } | null;
}

const STAKES = [10, 20, 50] as const;

export default function ArenaPanel({
  visible, onClose, state, username, onJoinQueue, onLeaveQueue, onBetTx,
  walletConnected, storeConfig, myBet,
}: Props) {
  const { address, chainId } = useAccount();
  const [selectedSide, setSelectedSide] = useState<'a' | 'b' | null>(null);
  const [selectedStake, setSelectedStake] = useState<10 | 20 | 50>(10);
  const [error, setError] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
  const [now, setNow] = useState(Date.now());

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: pendingTx });

  useEffect(() => {
    if (!visible) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [visible]);

  useEffect(() => {
    if (isConfirmed && pendingTx && selectedSide) {
      onBetTx(pendingTx, selectedSide, selectedStake);
      setPendingTx(undefined);
    }
  }, [isConfirmed, pendingTx, selectedSide, selectedStake, onBetTx]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  const isFighter = state.playerA === username || state.playerB === username;
  const bettingSecondsLeft = state.bettingEndsAt ? Math.max(0, Math.ceil((state.bettingEndsAt - now) / 1000)) : 0;
  const fightSecondsLeft = state.fightTimeoutAt ? Math.max(0, Math.ceil((state.fightTimeoutAt - now) / 1000)) : 0;

  async function handleBet() {
    setError(null);
    if (!storeConfig) { setError('Store config not loaded'); return; }
    if (!walletConnected || !address) { setError('Connect wallet'); return; }
    if (chainId !== storeConfig.chainId) { setError('Switch to Base mainnet'); return; }
    if (!selectedSide) { setError('Pick a side (A or B)'); return; }
    if (!state.id || state.phase !== 'betting') { setError('Betting window closed'); return; }
    const priceUsd = storeConfig.tokenPriceUsd ?? 0;
    if (priceUsd <= 0) { setError('Token price not available yet'); return; }
    try {
      // Pay 5% extra for slippage (backend tolerates 15%)
      const tokensNeeded = (selectedStake / priceUsd) * 1.05;
      const decimals = storeConfig.tokenDecimals ?? 18;
      const amount = parseUnits(tokensNeeded.toFixed(6), decimals);
      const hash = await writeContractAsync({
        address: storeConfig.tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [storeConfig.receiverAddress, amount],
        chainId: base.id,
      });
      setPendingTx(hash);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Tx rejected');
    }
  }

  function expectedPayout(): number {
    if (!myBet || !state.potUsdA || !state.potUsdB) return 0;
    const myStake = myBet.stakeUsd;
    const winPot = myBet.side === 'a' ? state.potUsdA : state.potUsdB;
    const losePot = myBet.side === 'a' ? state.potUsdB : state.potUsdA;
    if (winPot === 0) return myStake;
    return myStake + (myStake / winPot) * losePot;
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bc-panel flex flex-col gap-3 p-6 relative" style={{ maxWidth: '640px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>

        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '14px', color: '#ff6644', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
          ⚔ PVP ARENA — COLISEUM
        </div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>
          Queue to fight · Bet $BASEDCRAFT on active matches · Winners split the pot (pari-mutuel)
        </div>

        {/* NO ACTIVE MATCH */}
        {!state.active && (
          <div style={{ padding: '14px', background: 'rgba(0,0,0,0.4)', border: '1px solid #333', textAlign: 'center' }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: '16px', color: '#fff' }}>
              No active match · Queue: <strong style={{ color: '#ffcc44' }}>{state.queueSize}</strong> player{state.queueSize === 1 ? '' : 's'} waiting
            </div>
            <button
              onClick={onJoinQueue}
              style={{
                marginTop: '10px',
                padding: '10px 18px',
                background: '#ff6644', color: '#fff',
                fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
                border: '1px solid #ff8844', cursor: 'pointer',
                textShadow: '1px 1px 0 #000',
              }}
            >
              ⚔ ENTER QUEUE
            </button>
            <button
              onClick={onLeaveQueue}
              style={{
                marginLeft: '8px',
                padding: '10px 14px',
                background: '#2a2a2a', color: '#aaa',
                fontFamily: "'Press Start 2P', monospace", fontSize: '9px',
                border: '1px solid #444', cursor: 'pointer',
              }}
            >
              LEAVE QUEUE
            </button>
          </div>
        )}

        {/* ACTIVE MATCH */}
        {state.active && (
          <>
            {/* Header: phase + timer */}
            <div style={{
              padding: '8px 12px',
              background: state.phase === 'betting'
                ? 'linear-gradient(90deg, rgba(255,200,80,0.2), transparent)'
                : state.phase === 'active'
                  ? 'linear-gradient(90deg, rgba(255,60,0,0.2), transparent)'
                  : 'rgba(0,0,0,0.4)',
              border: `1px solid ${state.phase === 'betting' ? '#ffc850' : state.phase === 'active' ? '#ff4400' : '#444'}`,
              fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
              color: '#fff', textShadow: '1px 1px 0 #000',
            }}>
              {state.phase === 'betting' && `🎲 BETTING · ${bettingSecondsLeft}s LEFT`}
              {state.phase === 'active' && `⚔ FIGHT! · ${fightSecondsLeft}s`}
              {state.phase === 'ended' && `🏁 MATCH ENDED · Winner: ${state.winner ?? 'TIE'}`}
            </div>

            {/* VS — two fighters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'center' }}>
              <FighterCard
                side="a"
                username={state.playerA!}
                wallet={state.walletA ?? null}
                hp={state.hpA ?? 20}
                odds={state.oddsA ?? 0.5}
                potUsd={state.potUsdA ?? 0}
                selected={selectedSide === 'a'}
                onSelect={() => state.phase === 'betting' && !isFighter && !myBet && setSelectedSide('a')}
                clickable={state.phase === 'betting' && !isFighter && !myBet}
                myBetHere={myBet?.side === 'a'}
              />
              <div style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: '24px',
                color: '#ff4400', textShadow: '2px 2px 0 #000',
              }}>VS</div>
              <FighterCard
                side="b"
                username={state.playerB!}
                wallet={state.walletB ?? null}
                hp={state.hpB ?? 20}
                odds={state.oddsB ?? 0.5}
                potUsd={state.potUsdB ?? 0}
                selected={selectedSide === 'b'}
                onSelect={() => state.phase === 'betting' && !isFighter && !myBet && setSelectedSide('b')}
                clickable={state.phase === 'betting' && !isFighter && !myBet}
                myBetHere={myBet?.side === 'b'}
              />
            </div>

            {/* Betting area */}
            {state.phase === 'betting' && !isFighter && !myBet && (
              <div style={{ padding: '10px', border: '1px solid #555', background: 'rgba(0,0,0,0.35)' }}>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: '#ddd', marginBottom: '6px' }}>
                  Pick a side above, then your stake:
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {STAKES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedStake(s)}
                      style={{
                        padding: '8px 14px',
                        background: selectedStake === s ? '#0052ff' : 'rgba(0,0,0,0.4)',
                        border: selectedStake === s ? '1px solid #3478f6' : '1px solid #555',
                        color: '#fff', cursor: 'pointer',
                        fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
                      }}
                    >
                      ${s}
                    </button>
                  ))}
                  <button
                    onClick={handleBet}
                    disabled={!selectedSide || isPending || isConfirming}
                    style={{
                      marginLeft: 'auto',
                      padding: '8px 16px',
                      background: selectedSide ? '#22aa33' : '#444',
                      border: '1px solid #3fcc4a',
                      color: '#fff', cursor: selectedSide ? 'pointer' : 'not-allowed',
                      fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
                      opacity: !selectedSide ? 0.5 : 1,
                    }}
                  >
                    {isPending ? '…SIGN…' : isConfirming ? '…MINING…' : `🎲 BET $${selectedStake}`}
                  </button>
                </div>
                {error && (
                  <div style={{ marginTop: '6px', color: '#ff7777', fontFamily: "'VT323', monospace", fontSize: '13px' }}>
                    ⚠ {error}
                  </div>
                )}
              </div>
            )}

            {/* Your bet status */}
            {myBet && (
              <div style={{
                padding: '10px',
                background: 'linear-gradient(90deg, rgba(0,82,255,0.2), rgba(0,82,255,0.05))',
                border: '1px solid #3478f6',
                fontFamily: "'VT323', monospace", fontSize: '14px',
              }}>
                ✅ Your bet: <strong style={{ color: '#5c9cff' }}>${myBet.stakeUsd}</strong> on{' '}
                <strong style={{ color: '#fff' }}>{myBet.side === 'a' ? state.playerA : state.playerB}</strong>
                <br />
                Projected payout if they win: <strong style={{ color: '#4ade80' }}>
                  ${expectedPayout().toFixed(2)}
                </strong>
                {state.phase === 'active' && ' · Watching live!'}
              </div>
            )}

            {isFighter && state.phase === 'betting' && (
              <div style={{ padding: '8px', color: '#ffcc44', fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                🎯 You are FIGHTING — get ready, fight starts in {bettingSecondsLeft}s!
              </div>
            )}
            {isFighter && state.phase === 'active' && (
              <div style={{ padding: '8px', color: '#ff6644', fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                ⚔ FIGHT! Attack your opponent. First to 0 HP loses.
              </div>
            )}

            {/* Pot summary */}
            <div style={{
              fontFamily: "'VT323', monospace", fontSize: '13px',
              color: 'rgba(255,255,255,0.55)', textAlign: 'center',
            }}>
              Total pot: <strong style={{ color: '#fff' }}>${((state.potUsdA ?? 0) + (state.potUsdB ?? 0)).toFixed(2)}</strong> · {state.bettorCount ?? 0} bettor(s)
            </div>
          </>
        )}

        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '7px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '4px' }}>
          /arena TO OPEN · ESC TO CLOSE · BET WITH $BASEDCRAFT
        </div>
      </div>
    </div>
  );
}

function FighterCard(props: {
  side: 'a' | 'b';
  username: string;
  wallet: string | null;
  hp: number;
  odds: number;
  potUsd: number;
  selected: boolean;
  onSelect: () => void;
  clickable: boolean;
  myBetHere: boolean;
}) {
  const hpPct = Math.max(0, Math.min(100, (props.hp / 20) * 100));
  const border = props.myBetHere ? '#4ade80' : props.selected ? '#0052ff' : '#444';
  return (
    <div
      onClick={props.clickable ? props.onSelect : undefined}
      style={{
        padding: '10px',
        background: 'rgba(0,0,0,0.4)',
        border: `2px solid ${border}`,
        cursor: props.clickable ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: '4px',
        boxShadow: props.selected ? '0 0 10px rgba(0,82,255,0.4)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '10px', color: '#fff' }}>
        {props.side === 'a' ? '🅰' : '🅱'} {props.username}
      </div>
      {props.wallet && (
        <div style={{ fontFamily: "'VT323', monospace", fontSize: '11px', color: '#88aaff' }}>
          {props.wallet.slice(0, 6)}…{props.wallet.slice(-4)}
        </div>
      )}
      {/* HP bar */}
      <div style={{ position: 'relative', height: '14px', background: '#222', border: '1px solid #555' }}>
        <div style={{
          height: '100%',
          width: `${hpPct}%`,
          background: hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#ef4444',
          transition: 'width 0.3s',
        }} />
        <span style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'VT323', monospace", fontSize: '12px', color: '#fff',
          textShadow: '1px 1px 0 #000',
        }}>
          {props.hp} / 20 HP
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'VT323', monospace", fontSize: '13px' }}>
        <span style={{ color: '#aaa' }}>Odds: <strong style={{ color: '#fff' }}>{(props.odds * 100).toFixed(1)}%</strong></span>
        <span style={{ color: '#aaa' }}>Pot: <strong style={{ color: '#2fb574' }}>${props.potUsd.toFixed(2)}</strong></span>
      </div>
      {props.myBetHere && (
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: '#4ade80' }}>
          ✓ YOU BET HERE
        </div>
      )}
    </div>
  );
}
