// PvP Arena — matchmaking queue, betting window, fight tracking, payouts
//
// State machine per match:
//   BETTING (30s) → ACTIVE (up to 180s) → ENDED
// Only one match runs at a time. Queue is FIFO.

import { Server, Socket } from 'socket.io';
import { supabase } from './supabase';
import {
  TOKEN_ADDRESS,
  RECEIVER_ADDRESS,
  PAYMENT_SYMBOL,
  getTokenMarketData,
  rawTokenAmount,
} from './store';
import { createPublicClient, http, parseAbi, decodeEventLog, getAddress } from 'viem';
import { base } from 'viem/chains';

const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const rpcClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// ---- Arena world coords (two platforms in the safe zone, not inside city) ----
export const ARENA_SPAWN_A = { x: 40.5, y: 22, z: 8.5 };
export const ARENA_SPAWN_B = { x: 48.5, y: 22, z: 8.5 };

// ---- Timings ----
const BETTING_WINDOW_MS = 30_000;
const FIGHT_TIMEOUT_MS = 180_000; // 3 minutes
const FIGHT_START_HP = 20; // both players start at full HP

// ---- Allowed stake amounts in USD ----
export const ALLOWED_STAKES = [10, 20, 50] as const;
export type StakeUsd = (typeof ALLOWED_STAKES)[number];

type MatchPhase = 'betting' | 'active' | 'ended' | 'cancelled';

export interface LiveMatch {
  id: number;
  playerA: string;
  playerB: string;
  walletA: string | null;
  walletB: string | null;
  phase: MatchPhase;
  bettingEndsAt: number;        // epoch ms
  fightTimeoutAt: number;       // epoch ms, set when phase → active
  hpA: number;
  hpB: number;
  potRawA: bigint;               // raw token sum
  potRawB: bigint;
  potUsdA: number;               // readable USD sum
  potUsdB: number;
  bettorsA: Set<string>;         // usernames who bet on A
  bettorsB: Set<string>;
  winner: string | null;
  bettorSet: Set<string>;        // all bettors union (for "spectators")
}

// Single live match (one at a time)
let currentMatch: LiveMatch | null = null;
// Queue of usernames waiting
const queue: string[] = [];
// Username → socket for fast lookup
const socketByUsername: Map<string, Socket> = new Map();
// For auto-timeout of fights
let fightTimeoutTimer: NodeJS.Timeout | null = null;
let bettingTimeoutTimer: NodeJS.Timeout | null = null;

let ioRef: Server | null = null;

export function attachArena(io: Server) {
  ioRef = io;
}

// ---- Utility: broadcast state to everyone ----
function broadcastState() {
  if (!ioRef) return;
  const payload = publicMatchState();
  ioRef.emit('arena:state', payload);
}

export function publicMatchState() {
  if (!currentMatch) {
    return { active: false, queueSize: queue.length };
  }
  const m = currentMatch;
  // Compute odds from pots. If one side has 0 bets, default to 50/50.
  const potA = Number(m.potRawA);
  const potB = Number(m.potRawB);
  const total = potA + potB;
  const oddsA = total === 0 ? 0.5 : potA / total;
  const oddsB = total === 0 ? 0.5 : potB / total;
  return {
    active: true,
    queueSize: queue.length,
    id: m.id,
    phase: m.phase,
    playerA: m.playerA,
    playerB: m.playerB,
    walletA: m.walletA,
    walletB: m.walletB,
    hpA: m.hpA,
    hpB: m.hpB,
    bettingEndsAt: m.bettingEndsAt,
    fightTimeoutAt: m.fightTimeoutAt,
    potUsdA: m.potUsdA,
    potUsdB: m.potUsdB,
    oddsA: +oddsA.toFixed(3),
    oddsB: +oddsB.toFixed(3),
    bettorCount: m.bettorSet.size,
    winner: m.winner,
  };
}

// ---- Track socket ↔ username for notifications and damage routing ----
export function registerArenaSocket(username: string, socket: Socket) {
  socketByUsername.set(username, socket);
}
export function unregisterArenaSocket(username: string) {
  socketByUsername.delete(username);
  // Also remove from queue if they leave
  const idx = queue.indexOf(username);
  if (idx >= 0) queue.splice(idx, 1);
  // If they were a fighter in the active match, they forfeit
  if (currentMatch && currentMatch.phase === 'active') {
    if (currentMatch.playerA === username) {
      endMatch(currentMatch.playerB, 'Opponent disconnected');
    } else if (currentMatch.playerB === username) {
      endMatch(currentMatch.playerA, 'Opponent disconnected');
    }
  }
}

// ---- Queue management ----
export function joinQueue(username: string, wallet: string | null): { ok: boolean; reason?: string } {
  if (!ioRef) return { ok: false, reason: 'Arena not initialized' };
  if (currentMatch && (currentMatch.playerA === username || currentMatch.playerB === username)) {
    return { ok: false, reason: 'You are already in a match' };
  }
  if (queue.includes(username)) return { ok: false, reason: 'Already in queue' };
  queue.push(username);
  broadcastState();
  tryStartMatch();
  return { ok: true };
}

export function leaveQueue(username: string): boolean {
  const idx = queue.indexOf(username);
  if (idx < 0) return false;
  queue.splice(idx, 1);
  broadcastState();
  return true;
}

// Pair up the first two if no active match
async function tryStartMatch() {
  if (currentMatch) return;
  if (queue.length < 2) return;
  const a = queue.shift()!;
  const b = queue.shift()!;
  const socketA = socketByUsername.get(a);
  const socketB = socketByUsername.get(b);
  const walletA = (socketA?.data?.walletAddress as string | null) ?? null;
  const walletB = (socketB?.data?.walletAddress as string | null) ?? null;

  // Insert match row
  const { data, error } = await supabase
    .from('pvp_matches')
    .insert({
      player_a: a,
      player_b: b,
      player_a_wallet: walletA,
      player_b_wallet: walletB,
      status: 'betting',
    })
    .select()
    .single();
  if (error || !data) {
    console.error('[arena] failed to create match:', error?.message);
    // Return players to queue
    queue.unshift(b, a);
    return;
  }

  const now = Date.now();
  currentMatch = {
    id: data.id,
    playerA: a,
    playerB: b,
    walletA,
    walletB,
    phase: 'betting',
    bettingEndsAt: now + BETTING_WINDOW_MS,
    fightTimeoutAt: 0,
    hpA: FIGHT_START_HP,
    hpB: FIGHT_START_HP,
    potRawA: 0n,
    potRawB: 0n,
    potUsdA: 0,
    potUsdB: 0,
    bettorsA: new Set(),
    bettorsB: new Set(),
    winner: null,
    bettorSet: new Set(),
  };

  if (bettingTimeoutTimer) clearTimeout(bettingTimeoutTimer);
  bettingTimeoutTimer = setTimeout(() => startFight(), BETTING_WINDOW_MS);

  // Notify all online users
  ioRef!.emit('arena:match_opened', publicMatchState());
  // Notify fighters specifically
  socketA?.emit('arena:you_are_fighting', { match: publicMatchState(), side: 'a' });
  socketB?.emit('arena:you_are_fighting', { match: publicMatchState(), side: 'b' });
  broadcastState();
}

function startFight() {
  if (!currentMatch || currentMatch.phase !== 'betting') return;
  currentMatch.phase = 'active';
  currentMatch.fightTimeoutAt = Date.now() + FIGHT_TIMEOUT_MS;
  supabase
    .from('pvp_matches')
    .update({ status: 'active', fight_began_at: new Date().toISOString() })
    .eq('id', currentMatch.id)
    .then(() => {});
  if (fightTimeoutTimer) clearTimeout(fightTimeoutTimer);
  fightTimeoutTimer = setTimeout(() => {
    // Timeout → winner is whoever has more HP; tie = refund
    if (!currentMatch || currentMatch.phase !== 'active') return;
    if (currentMatch.hpA > currentMatch.hpB) endMatch(currentMatch.playerA, 'Timeout — more HP');
    else if (currentMatch.hpB > currentMatch.hpA) endMatch(currentMatch.playerB, 'Timeout — more HP');
    else endMatch(null, 'Timeout — tie, bets refunded');
  }, FIGHT_TIMEOUT_MS);
  ioRef!.emit('arena:fight_begin', publicMatchState());
  broadcastState();
}

// ---- Betting ----
/**
 * Verify a bet tx. Must be a Transfer of tokens (worth stakeUsd) to receiver
 * during the betting window.
 */
export async function placeBet(
  matchId: number,
  bettorUsername: string,
  txHash: string,
  side: 'a' | 'b',
  stakeUsd: StakeUsd,
): Promise<{ ok: boolean; reason?: string }> {
  if (!currentMatch || currentMatch.id !== matchId) {
    return { ok: false, reason: 'No such active match' };
  }
  if (currentMatch.phase !== 'betting') {
    return { ok: false, reason: 'Betting window closed' };
  }
  if (bettorUsername === currentMatch.playerA || bettorUsername === currentMatch.playerB) {
    return { ok: false, reason: 'Fighters cannot bet on their own match' };
  }
  if (!ALLOWED_STAKES.includes(stakeUsd as any)) {
    return { ok: false, reason: 'Invalid stake (must be 10/20/50)' };
  }
  if (side !== 'a' && side !== 'b') return { ok: false, reason: 'Invalid side' };

  // dup check
  const { data: existing } = await supabase
    .from('pvp_bets')
    .select('id')
    .eq('tx_hash', txHash.toLowerCase())
    .maybeSingle();
  if (existing) return { ok: false, reason: 'Bet tx already redeemed' };

  // One bet per user per match — keeps it simple + fair odds
  const { data: prior } = await supabase
    .from('pvp_bets')
    .select('id')
    .eq('match_id', matchId)
    .eq('bettor_username', bettorUsername)
    .maybeSingle();
  if (prior) return { ok: false, reason: 'You already bet on this match' };

  // Verify on-chain transfer
  if (!RECEIVER_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(RECEIVER_ADDRESS)) {
    return { ok: false, reason: 'Arena not configured (missing receiver)' };
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: 'Invalid tx hash' };
  }
  let receipt;
  try {
    receipt = await rpcClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (e: any) {
    return { ok: false, reason: `Tx not found: ${e?.message ?? 'unknown'}` };
  }
  if (!receipt || receipt.status !== 'success') return { ok: false, reason: 'Tx failed or not found' };

  const market = await getTokenMarketData();
  if (!market || !market.priceUsd) return { ok: false, reason: 'Could not fetch token price' };
  const tokensNeeded = stakeUsd / market.priceUsd;
  // 15% total slippage tolerance
  const expectedRaw = (rawTokenAmount(Math.floor(tokensNeeded)) * 85n) / 100n;

  const tokenAddr = TOKEN_ADDRESS.toLowerCase();
  const recvAddr = RECEIVER_ADDRESS.toLowerCase();
  let transferValue: bigint | null = null;
  let buyer: string | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddr) continue;
    try {
      const decoded = decodeEventLog({ abi: ERC20_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if (args.to.toLowerCase() !== recvAddr) continue;
      if (args.value < expectedRaw) continue;
      buyer = args.from;
      transferValue = args.value;
      break;
    } catch {
      /* not a transfer */
    }
  }
  if (!buyer || transferValue === null) {
    return { ok: false, reason: `Need transfer of ~${tokensNeeded.toFixed(0)} ${PAYMENT_SYMBOL} worth $${stakeUsd}` };
  }

  // Insert bet
  const { error } = await supabase.from('pvp_bets').insert({
    match_id: matchId,
    tx_hash: txHash.toLowerCase(),
    bettor_username: bettorUsername,
    bettor_wallet: getAddress(buyer).toLowerCase(),
    side,
    usd_amount: stakeUsd,
    raw_token_amount: transferValue.toString(),
  });
  if (error) return { ok: false, reason: 'DB error recording bet' };

  // Update pot live
  if (side === 'a') {
    currentMatch.potRawA += transferValue;
    currentMatch.potUsdA += stakeUsd;
    currentMatch.bettorsA.add(bettorUsername);
  } else {
    currentMatch.potRawB += transferValue;
    currentMatch.potUsdB += stakeUsd;
    currentMatch.bettorsB.add(bettorUsername);
  }
  currentMatch.bettorSet.add(bettorUsername);
  // Persist pot totals
  supabase
    .from('pvp_matches')
    .update({ pot_side_a: currentMatch.potRawA.toString(), pot_side_b: currentMatch.potRawB.toString() })
    .eq('id', currentMatch.id)
    .then(() => {});

  broadcastState();
  return { ok: true };
}

// ---- Damage handling ----
/**
 * Apply damage from attacker to defender if they are the two fighters.
 * Called when client reports a hit.
 */
export function applyArenaDamage(attacker: string, defender: string, dmg: number) {
  if (!currentMatch || currentMatch.phase !== 'active') return;
  if (dmg <= 0 || dmg > 10) return; // sanity cap
  const m = currentMatch;
  if (attacker === m.playerA && defender === m.playerB) {
    m.hpB = Math.max(0, m.hpB - dmg);
  } else if (attacker === m.playerB && defender === m.playerA) {
    m.hpA = Math.max(0, m.hpA - dmg);
  } else {
    return; // not in match
  }
  broadcastState();
  if (m.hpA <= 0 && m.hpB <= 0) endMatch(null, 'Double KO — refunded');
  else if (m.hpA <= 0) endMatch(m.playerB, 'KO');
  else if (m.hpB <= 0) endMatch(m.playerA, 'KO');
}

// ---- End match + compute payouts (pari-mutuel) ----
async function endMatch(winner: string | null, reason: string) {
  if (!currentMatch || currentMatch.phase === 'ended') return;
  const m = currentMatch;
  m.phase = 'ended';
  m.winner = winner;
  if (fightTimeoutTimer) clearTimeout(fightTimeoutTimer);
  if (bettingTimeoutTimer) clearTimeout(bettingTimeoutTimer);

  // Fetch all bets for this match
  const { data: bets } = await supabase
    .from('pvp_bets')
    .select('*')
    .eq('match_id', m.id);
  const winningSide = winner === m.playerA ? 'a' : winner === m.playerB ? 'b' : null;
  const potA = m.potRawA;
  const potB = m.potRawB;
  const totalPot = potA + potB;

  // Payouts per bet (pari-mutuel — your share of losing side + your stake back)
  const payoutRows: Array<{ id: number; payout: string }> = [];
  if (bets) {
    for (const bet of bets) {
      const myStake = BigInt(bet.raw_token_amount);
      if (!winningSide) {
        // Tie / refund → everyone gets their stake back
        payoutRows.push({ id: bet.id, payout: myStake.toString() });
      } else if (bet.side !== winningSide) {
        payoutRows.push({ id: bet.id, payout: '0' });
      } else {
        const winPot = winningSide === 'a' ? potA : potB;
        const losePot = winningSide === 'a' ? potB : potA;
        // share of losers distributed proportionally + stake back
        const share = winPot > 0n ? (myStake * losePot) / winPot : 0n;
        payoutRows.push({ id: bet.id, payout: (myStake + share).toString() });
      }
    }
    for (const row of payoutRows) {
      await supabase.from('pvp_bets').update({ payout_amount: row.payout }).eq('id', row.id);
    }
  }

  await supabase
    .from('pvp_matches')
    .update({ winner, status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', m.id);

  if (ioRef) {
    ioRef.emit('arena:match_ended', {
      ...publicMatchState(),
      winner,
      reason,
      totalPotUsd: m.potUsdA + m.potUsdB,
    });
    // Send per-bettor notifications with their winnings
    if (bets && winningSide) {
      for (const bet of bets) {
        const userSocket = socketByUsername.get(bet.bettor_username);
        if (!userSocket) continue;
        const row = payoutRows.find((r) => r.id === bet.id);
        const payoutRaw = row?.payout ?? '0';
        const won = bet.side === winningSide && payoutRaw !== '0';
        userSocket.emit('arena:bet_result', {
          matchId: m.id,
          won,
          payoutRaw,
          stakeUsd: bet.usd_amount,
          reason,
        });
      }
    }
  }

  currentMatch = null;
  // Reset fighters' HP notification happens on client side
  // Start next match if queue has enough
  setTimeout(() => tryStartMatch(), 3000);
}

/** Manual cancel (admin debug) */
export function cancelMatch(reason = 'Cancelled') {
  if (!currentMatch) return;
  endMatch(null, reason);
}

/** Getter for current match (read-only) */
export function getCurrentMatch(): LiveMatch | null {
  return currentMatch;
}
