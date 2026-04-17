import { Server, Socket } from 'socket.io';
import { supabase } from './supabase';
import { world } from './world';
import { handleCommand } from './commands';
import {
  BLOCK_TYPES,
  BlockType,
  ChatMessage,
  INITIAL_LOAD_RADIUS,
  MAX_REACH,
  PlayerState,
  WORLD_HEIGHT,
  WORLD_SIZE,
} from './types';
import { verifyPurchase, recordPurchase, publicStoreConfig, getItem, verifyBurn, recordBurn, getHolderInfo, getTokenPriceUsd, getTokenMarketData } from './store';
import { attachArena, registerArenaSocket, unregisterArenaSocket, joinQueue, leaveQueue, placeBet, applyArenaDamage, publicMatchState, ALLOWED_STAKES, getCurrentMatch, ARENA_SPAWN_A, ARENA_SPAWN_B } from './arena';

const players: Map<string, PlayerState> = new Map();
const lastMoveBroadcast: Map<string, number> = new Map();

const MOVE_THROTTLE_MS = 100; // 10 Hz
const DB_WRITE_THROTTLE_MS = 30_000;

function hashColor(name: string, verifiedBase = false): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  // Natural earth-tone palette by default (browns, greens, muted reds).
  // Verified Base wallets get a small purple shift so they're cosmetically
  // distinct — NOT privileged gameplay-wise.
  const baseHue = 20 + (Math.abs(h) % 120); // 20–140: red→yellow→green
  const hue = verifiedBase ? (baseHue + 200) % 360 : baseHue; // shift toward purple
  const sat = 45 + (Math.abs(h >> 5) % 35);
  const light = 45 + (Math.abs(h >> 10) % 20);
  return hslToHex(hue, sat, light);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function validUsername(name: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(name);
}

function validWalletUsername(name: string): boolean {
  // 0xABCD…1234 format (mixed case hex, ellipsis)
  return /^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/.test(name);
}

export function registerSocketHandlers(io: Server) {
  attachArena(io);
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connect ${socket.id}`);

    let joined = false;

    socket.on('join', async (payload: { username: string; walletAddress?: string; verifiedBase?: boolean }) => {
      try {
        if (joined) return;
        if (!world.isReady()) {
          socket.emit('error', { message: 'World not ready yet, try again.' });
          return;
        }
        const rawName = (payload?.username ?? '').trim();
        const wallet = payload?.walletAddress?.trim() || undefined;
        const verifiedBase = !!payload?.verifiedBase && !!wallet;

        if (!rawName) {
          socket.emit('error', { message: 'Username required.' });
          return;
        }
        if (!validUsername(rawName) && !validWalletUsername(rawName)) {
          socket.emit('error', {
            message: 'Invalid username. Use 3–16 alphanumeric/underscore chars.',
          });
          return;
        }

        // Uniqueness: across online players, and for non-wallet usernames, in DB
        const taken = Array.from(players.values()).some(
          (p) => p.username.toLowerCase() === rawName.toLowerCase(),
        );
        if (taken) {
          socket.emit('error', { message: 'Username already online.' });
          return;
        }

        if (!wallet) {
          const { data: existing } = await supabase
            .from('players')
            .select('username,wallet_address')
            .ilike('username', rawName)
            .maybeSingle();
          if (existing && existing.wallet_address) {
            socket.emit('error', { message: 'Username reserved by a wallet.' });
            return;
          }
        }

        // Upsert player
        await supabase.from('players').upsert(
          {
            username: rawName,
            wallet_address: wallet ?? null,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'username' },
        );

        const color = hashColor(rawName, verifiedBase);
        const sp = world.spawnPoint;
        // Prefix verified-Base players' display name with a tiny hex glyph.
        const displayName = verifiedBase ? `⬢ ${rawName}` : rawName;
        const self: PlayerState = {
          id: socket.id,
          username: rawName,
          walletAddress: wallet,
          color,
          x: sp.x,
          y: sp.y,
          z: sp.z,
          rotY: 0,
          rotX: 0,
          lastWrite: Date.now(),
        };
        players.set(socket.id, self);
        joined = true;
        // Register for arena callbacks (notifications, disconnect cleanup)
        registerArenaSocket(self.username, socket);
        (socket.data as any).walletAddress = self.walletAddress ?? null;
        socket.emit('arena:state', publicMatchState());

        // Send initial world slice (within load radius)
        const nearby = world.within(sp.x, sp.y, sp.z, INITIAL_LOAD_RADIUS);
        const onlinePlayers = Array.from(players.values()).map((p) => ({
          id: p.id,
          username: p.username,
          color: p.color,
          x: p.x,
          y: p.y,
          z: p.z,
        }));

        socket.emit('world:init', {
          blocks: nearby.map((b) => ({ x: b.x, y: b.y, z: b.z, type: b.type })),
          spawnPoint: sp,
          onlinePlayers,
          you: { id: socket.id, username: rawName, color, verifiedBase },
          worldSize: WORLD_SIZE,
          worldHeight: WORLD_HEIGHT,
        });

        // Welcome — per-player; surfaces as a system chat line and a center
        // toast on the client. Toast is cosmetic and auto-dismisses.
        socket.emit('chat:welcome', {
          message: `Welcome, ${displayName}! You spawned at ${Math.floor(sp.x)}, ${Math.floor(sp.z)}. Press T to chat.`,
        });

        // Stream rest of the world in chunks so far blocks arrive after initial paint
        setTimeout(() => {
          if (!players.has(socket.id)) return;
          const all = world.all();
          const chunkSize = 2000;
          const nearbyKey = new Set(nearby.map((b) => `${b.x},${b.y},${b.z}`));
          const rest = all.filter((b) => !nearbyKey.has(`${b.x},${b.y},${b.z}`));
          for (let i = 0; i < rest.length; i += chunkSize) {
            const chunk = rest.slice(i, i + chunkSize).map((b) => ({
              x: b.x,
              y: b.y,
              z: b.z,
              type: b.type,
            }));
            socket.emit('world:chunk', { blocks: chunk });
          }
          socket.emit('world:complete');
        }, 200);

        // Load recent chat
        const { data: chat } = await supabase
          .from('chat_messages')
          .select('username,message,created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        const chatMsgs: ChatMessage[] = (chat ?? [])
          .map((c) => ({
            username: c.username,
            message: c.message,
            created_at: c.created_at,
          }))
          .reverse();
        socket.emit('chat:history', chatMsgs);

        // Send land claims on join
        supabase.from('land_claims').select('chunk_x, chunk_z, wallet_address, username, claimed_at')
          .then(({ data }) => socket.emit('land:data', data ?? []));

        // Announce
        io.emit('player:joined', {
          id: socket.id,
          username: rawName,
          color,
          x: sp.x,
          y: sp.y,
          z: sp.z,
          verifiedBase,
        });
        io.emit('chat:received', {
          username: 'system',
          message: `${verifiedBase ? '⬢' : '·'} ${rawName} joined the world`,
          isSystem: true,
        });
      } catch (err) {
        console.error('[socket] join err:', err);
        socket.emit('error', { message: 'Join failed.' });
      }
    });

    socket.on('block:break', async (p: { x: number; y: number; z: number }) => {
      const self = players.get(socket.id);
      if (!self) return;
      if (!isFinite(p?.x) || !isFinite(p?.y) || !isFinite(p?.z)) return;
      const dx = p.x + 0.5 - self.x;
      const dy = p.y + 0.5 - self.y;
      const dz = p.z + 0.5 - self.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > MAX_REACH + 1) return;
      const ok = await world.remove(p.x, p.y, p.z);
      if (ok) {
        io.emit('block:updated', {
          x: p.x,
          y: p.y,
          z: p.z,
          type: null,
          placedBy: self.username,
        });
      }
    });

    socket.on(
      'block:place',
      async (p: { x: number; y: number; z: number; type: BlockType }) => {
        const self = players.get(socket.id);
        if (!self) return;
        if (!isFinite(p?.x) || !isFinite(p?.y) || !isFinite(p?.z)) return;
        if (!BLOCK_TYPES.includes(p.type)) return;

        // Reach check
        const dx = p.x + 0.5 - self.x;
        const dy = p.y + 0.5 - self.y;
        const dz = p.z + 0.5 - self.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > MAX_REACH + 1) return;

        // Prevent placing where a player stands
        for (const other of players.values()) {
          const pxMin = p.x;
          const pxMax = p.x + 1;
          const pyMin = p.y;
          const pyMax = p.y + 1;
          const pzMin = p.z;
          const pzMax = p.z + 1;
          const feetX = other.x;
          const feetY = other.y - 1.6; // player origin is eye level
          const feetZ = other.z;
          const headY = other.y + 0.2;
          const halfW = 0.3;
          const intersects =
            feetX + halfW > pxMin &&
            feetX - halfW < pxMax &&
            headY > pyMin &&
            feetY < pyMax &&
            feetZ + halfW > pzMin &&
            feetZ - halfW < pzMax;
          if (intersects) return;
        }

        const ok = await world.place(p.x, p.y, p.z, p.type, self.username);
        if (ok) {
          io.emit('block:updated', {
            x: p.x,
            y: p.y,
            z: p.z,
            type: p.type,
            placedBy: self.username,
          });
        }
      },
    );

    socket.on(
      'player:move',
      (p: { x: number; y: number; z: number; rotY: number; rotX: number }) => {
        const self = players.get(socket.id);
        if (!self) return;
        if (
          !isFinite(p?.x) ||
          !isFinite(p?.y) ||
          !isFinite(p?.z) ||
          !isFinite(p?.rotY) ||
          !isFinite(p?.rotX)
        )
          return;

        self.x = p.x;
        self.y = p.y;
        self.z = p.z;
        self.rotY = p.rotY;
        self.rotX = p.rotX;

        const now = Date.now();
        const last = lastMoveBroadcast.get(socket.id) ?? 0;
        if (now - last < MOVE_THROTTLE_MS) return;
        lastMoveBroadcast.set(socket.id, now);

        socket.broadcast.emit('player:moved', {
          id: socket.id,
          x: p.x,
          y: p.y,
          z: p.z,
          rotY: p.rotY,
          rotX: p.rotX,
        });

        // Throttle DB writes
        if (now - self.lastWrite > DB_WRITE_THROTTLE_MS) {
          self.lastWrite = now;
          supabase
            .from('players')
            .update({ last_seen: new Date().toISOString() })
            .eq('username', self.username)
            .then(({ error }) => {
              if (error) console.error('[socket] last_seen err:', error.message);
            });
        }
      },
    );

    socket.on('chat:send', async (p: { message: string }) => {
      const self = players.get(socket.id);
      if (!self) return;
      const msg = (p?.message ?? '').toString().trim().slice(0, 300);
      if (!msg) return;

      if (msg.startsWith('/')) {
        const parts = msg.slice(1).split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        handleCommand(cmd, args, {
          io,
          socket,
          self,
          players,
          spawnPoint: world.spawnPoint,
        });
        return;
      }

      io.emit('chat:received', { username: self.username, message: msg });
      supabase
        .from('chat_messages')
        .insert({ username: self.username, message: msg })
        .then(({ error }) => {
          if (error) console.error('[socket] chat insert err:', error.message);
        });
    });

    // ---- Stats tracking (incremental — client sends deltas since last flush) ----
    socket.on('player:stats', async (p: {
      blocksPlaced: number;
      blocksBroken: number;
      mobsKilled: number;
      deaths: number;
      playTime: number;
      baseCoinsCollected?: number;
    }) => {
      const self = players.get(socket.id);
      if (!self) return;
      try {
        await supabase.rpc('increment_player_stats', {
          p_username: self.username,
          p_wallet: self.walletAddress ?? null,
          p_blocks_placed: p.blocksPlaced ?? 0,
          p_blocks_broken: p.blocksBroken ?? 0,
          p_mobs_killed: p.mobsKilled ?? 0,
          p_deaths: p.deaths ?? 0,
          p_play_time: p.playTime ?? 0,
          p_base_coins: p.baseCoinsCollected ?? 0,
        }).then(({ error }) => {
          if (error) console.error('[stats] upsert err:', error.message);
        });
      } catch (err) {
        console.error('[stats] err:', err);
      }
    });

    // ---- Leaderboard (supports multiple sort modes) ----
    socket.on('leaderboard:get', async (mode?: string) => {
      try {
        const sortMode = typeof mode === 'string' ? mode : 'score';
        const { data, error } = await supabase
          .from('player_stats')
          .select('username, wallet_address, blocks_placed, blocks_broken, mobs_killed, deaths, play_time_seconds, base_coins_collected')
          .limit(100);
        if (error) {
          console.error('[leaderboard] err:', error.message);
          socket.emit('leaderboard:data', []);
          return;
        }
        const entries = (data ?? []).map((row: any) => ({
          username: row.username,
          wallet_address: row.wallet_address,
          blocks_placed: row.blocks_placed ?? 0,
          blocks_broken: row.blocks_broken ?? 0,
          mobs_killed: row.mobs_killed ?? 0,
          deaths: row.deaths ?? 0,
          base_coins_collected: row.base_coins_collected ?? 0,
          score:
            (row.mobs_killed ?? 0) * 5 +
            Math.floor((row.blocks_placed ?? 0) / 10) +
            Math.floor((row.blocks_broken ?? 0) / 10) +
            (row.base_coins_collected ?? 0) * 10,
          balance_tier: 'none',
          mode: sortMode,
        }));
        // Sort by requested mode
        if (sortMode === 'coins' || sortMode === 'base_coins') {
          entries.sort((a: any, b: any) => b.base_coins_collected - a.base_coins_collected);
        } else if (sortMode === 'mobs') {
          entries.sort((a: any, b: any) => b.mobs_killed - a.mobs_killed);
        } else if (sortMode === 'blocks') {
          entries.sort((a: any, b: any) => b.blocks_placed - a.blocks_placed);
        } else {
          entries.sort((a: any, b: any) => b.score - a.score);
        }
        const top = entries.slice(0, 20).map((e: any, i: number) => ({ ...e, rank: i + 1 }));
        socket.emit('leaderboard:data', top);
      } catch (err) {
        console.error('[leaderboard] err:', err);
        socket.emit('leaderboard:data', []);
      }
    });

    // ---- Achievements ----
    socket.on('achievement:unlock', async (p: { achievementId: string }) => {
      const self = players.get(socket.id);
      if (!self || !self.walletAddress) return;
      try {
        await supabase.from('achievements').upsert({
          wallet_address: self.walletAddress,
          achievement_id: p.achievementId,
          username: self.username,
          unlocked_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address,achievement_id' });
        // Announce in chat
        io.emit('chat:received', {
          username: 'system',
          message: `🏆 ${self.username} unlocked achievement: ${p.achievementId}!`,
          isSystem: true,
        });
      } catch (err) {
        console.error('[achievement] err:', err);
      }
    });

    socket.on('achievement:list', async () => {
      const self = players.get(socket.id);
      if (!self || !self.walletAddress) {
        socket.emit('achievement:data', []);
        return;
      }
      try {
        const { data } = await supabase
          .from('achievements')
          .select('achievement_id, unlocked_at')
          .eq('wallet_address', self.walletAddress);
        socket.emit('achievement:data', data ?? []);
      } catch (err) {
        console.error('[achievement] err:', err);
        socket.emit('achievement:data', []);
      }
    });

    // ---- Store ----
    socket.on('store:config', async () => {
      // Send config IMMEDIATELY (no network wait) — user can render UI right away
      const cfg = publicStoreConfig();
      socket.emit('store:config', { ...cfg, tokenPriceUsd: 0 });
      // Then fetch live price in background and push separately
      getTokenMarketData()
        .then((market) => {
          if (market) socket.emit('store:price', {
            tokenPriceUsd: market.priceUsd,
            change24h: market.change24h,
            liquidityUsd: market.liquidityUsd,
            volume24hUsd: market.volume24hUsd,
            pairUrl: market.pairUrl,
            fetchedAt: market.fetchedAt,
          });
        })
        .catch(() => {/* silent */});
    });

    socket.on('store:price', async () => {
      const market = await getTokenMarketData();
      socket.emit('store:price', {
        tokenPriceUsd: market?.priceUsd ?? 0,
        change24h: market?.change24h ?? 0,
        liquidityUsd: market?.liquidityUsd ?? 0,
        volume24hUsd: market?.volume24hUsd ?? 0,
        pairUrl: market?.pairUrl ?? '',
        fetchedAt: market?.fetchedAt ?? Date.now(),
      });
    });

    socket.on('store:purchases', async () => {
      const self = players.get(socket.id);
      if (!self) return;
      try {
        const { data } = await supabase
          .from('purchases')
          .select('tx_hash, item_id, item_count, token_amount, created_at, delivered')
          .eq('username', self.username)
          .order('created_at', { ascending: false })
          .limit(30);
        socket.emit('store:purchases', data ?? []);
      } catch (err) {
        console.error('[store:purchases] err:', err);
        socket.emit('store:purchases', []);
      }
    });

    socket.on('store:burns', async () => {
      const self = players.get(socket.id);
      if (!self) return;
      try {
        // User's own burn history + their total burned
        const { data: rows } = await supabase
          .from('token_burns')
          .select('tx_hash, perk_id, amount, created_at')
          .eq('username', self.username)
          .order('created_at', { ascending: false })
          .limit(30);
        const { data: totalRow } = await supabase
          .from('user_burn_totals')
          .select('total_burned, burn_count')
          .eq('username', self.username)
          .maybeSingle();
        socket.emit('store:burns', {
          history: rows ?? [],
          totalBurned: totalRow?.total_burned?.toString() ?? '0',
          burnCount: totalRow?.burn_count ?? 0,
        });
      } catch (err) {
        console.error('[store:burns] err:', err);
        socket.emit('store:burns', { history: [], totalBurned: '0', burnCount: 0 });
      }
    });

    socket.on('store:holder_info', async () => {
      const self = players.get(socket.id);
      if (!self) return;
      if (!self.walletAddress) {
        socket.emit('store:holder_info', { balance: '0', balanceWhole: 0, tier: { id: 'none', label: 'Visitor', minHolding: 0, color: '#888888', perks: [] } });
        return;
      }
      try {
        const info = await getHolderInfo(self.walletAddress);
        socket.emit('store:holder_info', info);
      } catch (err) {
        console.error('[store:holder_info] err:', err);
      }
    });

    socket.on('store:burn_verify', async (p: { txHash: string; perkId: string }) => {
      const self = players.get(socket.id);
      if (!self) {
        socket.emit('store:burn_result', { ok: false, reason: 'Not connected' });
        return;
      }
      if (!p?.txHash || !p?.perkId) {
        socket.emit('store:burn_result', { ok: false, reason: 'Missing fields' });
        return;
      }
      try {
        const result = await verifyBurn(p.txHash, p.perkId);
        if (!result.ok || !result.perk || !result.buyer || !result.amount) {
          socket.emit('store:burn_result', { ok: false, reason: result.reason ?? 'Verification failed', txHash: p.txHash });
          return;
        }
        const inserted = await recordBurn({
          txHash: p.txHash,
          username: self.username,
          buyer: result.buyer,
          perk: result.perk,
          amount: result.amount,
        });
        if (!inserted) {
          socket.emit('store:burn_result', { ok: false, reason: 'Failed to record burn', txHash: p.txHash });
          return;
        }
        socket.emit('store:burn_result', {
          ok: true,
          txHash: p.txHash,
          perkId: result.perk.id,
          label: result.perk.label,
          icon: result.perk.icon,
        });
      } catch (err: any) {
        console.error('[store:burn_verify] err:', err);
        socket.emit('store:burn_result', { ok: false, reason: `Server error: ${err?.message ?? 'unknown'}`, txHash: p.txHash });
      }
    });

    socket.on('store:verify', async (p: { txHash: string; itemId: string }) => {
      const self = players.get(socket.id);
      if (!self) {
        socket.emit('store:result', { ok: false, reason: 'Not connected' });
        return;
      }
      if (!p?.txHash || !p?.itemId) {
        socket.emit('store:result', { ok: false, reason: 'Missing txHash or itemId' });
        return;
      }
      try {
        const result = await verifyPurchase(p.txHash, p.itemId);
        if (!result.ok || !result.item || !result.buyer || !result.amount) {
          socket.emit('store:result', { ok: false, reason: result.reason ?? 'Verification failed', txHash: p.txHash });
          return;
        }
        const inserted = await recordPurchase({
          txHash: p.txHash,
          username: self.username,
          buyer: result.buyer,
          item: result.item,
          amount: result.amount,
        });
        if (!inserted) {
          socket.emit('store:result', { ok: false, reason: 'Failed to record purchase (possibly already redeemed)', txHash: p.txHash });
          return;
        }
        // Grant item to player — client adds to inventory on receipt
        socket.emit('store:result', {
          ok: true,
          txHash: p.txHash,
          itemId: result.item.id,
          gameItem: result.item.gameItem,
          count: result.item.count,
          label: result.item.label,
        });
      } catch (err: any) {
        console.error('[store:verify] err:', err);
        socket.emit('store:result', { ok: false, reason: `Server error: ${err?.message ?? 'unknown'}`, txHash: p.txHash });
      }
    });

    // ---- Land Claims ----
    socket.on('land:claim', async (p: { chunkX: number; chunkZ: number }) => {
      const self = players.get(socket.id);
      if (!self || !self.walletAddress) {
        socket.emit('chat:received', { username: 'system', message: 'Connect a wallet to claim land.', isSystem: true });
        return;
      }
      try {
        // Check if already claimed
        const { data: existing } = await supabase
          .from('land_claims')
          .select('wallet_address, username')
          .eq('chunk_x', p.chunkX)
          .eq('chunk_z', p.chunkZ)
          .maybeSingle();
        if (existing) {
          socket.emit('chat:received', {
            username: 'system',
            message: `This chunk is already claimed by ${existing.username}.`,
            isSystem: true,
          });
          return;
        }
        // Max 4 claims per wallet
        const { count } = await supabase
          .from('land_claims')
          .select('*', { count: 'exact', head: true })
          .eq('wallet_address', self.walletAddress);
        if ((count ?? 0) >= 4) {
          socket.emit('chat:received', { username: 'system', message: 'Max 4 land claims per wallet.', isSystem: true });
          return;
        }
        await supabase.from('land_claims').insert({
          chunk_x: p.chunkX,
          chunk_z: p.chunkZ,
          wallet_address: self.walletAddress,
          username: self.username,
          claimed_at: new Date().toISOString(),
        });
        io.emit('land:claimed', { chunkX: p.chunkX, chunkZ: p.chunkZ, walletAddress: self.walletAddress, username: self.username });
        io.emit('chat:received', {
          username: 'system',
          message: `⛳ ${self.username} claimed chunk (${p.chunkX}, ${p.chunkZ})!`,
          isSystem: true,
        });
      } catch (err) {
        console.error('[land] claim err:', err);
      }
    });

    socket.on('land:unclaim', async (p: { chunkX: number; chunkZ: number }) => {
      const self = players.get(socket.id);
      if (!self || !self.walletAddress) return;
      try {
        await supabase.from('land_claims')
          .delete()
          .eq('chunk_x', p.chunkX)
          .eq('chunk_z', p.chunkZ)
          .eq('wallet_address', self.walletAddress);
        io.emit('land:unclaimed', { chunkX: p.chunkX, chunkZ: p.chunkZ });
      } catch (err) {
        console.error('[land] unclaim err:', err);
      }
    });

    socket.on('land:list', async () => {
      try {
        const { data } = await supabase
          .from('land_claims')
          .select('chunk_x, chunk_z, wallet_address, username, claimed_at');
        socket.emit('land:data', data ?? []);
      } catch (err) {
        console.error('[land] list err:', err);
        socket.emit('land:data', []);
      }
    });

    // ---- Trading ----
    socket.on('trade:offer', (p: { toUsername: string; offeredItems: Array<{ item: string; count: number }> }) => {
      const self = players.get(socket.id);
      if (!self) return;
      const target = Array.from(players.values()).find(
        (pl) => pl.username.toLowerCase() === p.toUsername.toLowerCase(),
      );
      if (!target) {
        socket.emit('chat:received', { username: 'system', message: `Player "${p.toUsername}" not found.`, isSystem: true });
        return;
      }
      const targetSocket = io.sockets.sockets.get(target.id);
      if (targetSocket) {
        targetSocket.emit('trade:incoming', {
          fromUsername: self.username,
          fromWallet: self.walletAddress,
          offeredItems: p.offeredItems,
        });
        socket.emit('chat:received', { username: 'system', message: `Trade offer sent to ${target.username}.`, isSystem: true });
      }
    });

    socket.on('trade:accept', (p: { fromUsername: string }) => {
      const self = players.get(socket.id);
      if (!self) return;
      const from = Array.from(players.values()).find(
        (pl) => pl.username.toLowerCase() === p.fromUsername.toLowerCase(),
      );
      if (!from) return;
      const fromSocket = io.sockets.sockets.get(from.id);
      if (fromSocket) {
        fromSocket.emit('trade:accepted', { byUsername: self.username });
        socket.emit('chat:received', { username: 'system', message: `Trade with ${from.username} accepted!`, isSystem: true });
      }
    });

    socket.on('trade:reject', (p: { fromUsername: string }) => {
      const self = players.get(socket.id);
      if (!self) return;
      const from = Array.from(players.values()).find(
        (pl) => pl.username.toLowerCase() === p.fromUsername.toLowerCase(),
      );
      if (!from) return;
      const fromSocket = io.sockets.sockets.get(from.id);
      if (fromSocket) {
        fromSocket.emit('trade:rejected', { byUsername: self.username });
      }
    });

    // ---- PvP Arena ----
    socket.on('arena:state', () => {
      socket.emit('arena:state', publicMatchState());
    });

    socket.on('arena:queue_join', () => {
      const self = players.get(socket.id);
      if (!self) {
        socket.emit('arena:queue_result', { ok: false, reason: 'Not joined yet — refresh the page' });
        return;
      }
      const res = joinQueue(self.username, self.walletAddress ?? null);
      socket.emit('arena:queue_result', { ...res, spawn: { a: ARENA_SPAWN_A, b: ARENA_SPAWN_B } });
      console.log(`[arena] ${self.username} join request → ${res.ok ? 'OK' : res.reason}`);
    });

    socket.on('arena:queue_leave', () => {
      const self = players.get(socket.id);
      if (!self) {
        socket.emit('arena:queue_result', { ok: false, reason: 'Not joined yet' });
        return;
      }
      const ok = leaveQueue(self.username);
      socket.emit('arena:queue_result', { ok });
    });

    socket.on('arena:bet', async (p: { matchId: number; txHash: string; side: 'a' | 'b'; stakeUsd: number }) => {
      const self = players.get(socket.id);
      if (!self) { socket.emit('arena:bet_result', { ok: false, reason: 'Not connected' }); return; }
      if (!p?.matchId || !p?.txHash || !p?.side || !p?.stakeUsd) {
        socket.emit('arena:bet_result', { ok: false, reason: 'Missing bet fields' });
        return;
      }
      const result = await placeBet(p.matchId, self.username, p.txHash, p.side, p.stakeUsd as any);
      socket.emit('arena:bet_confirmed', { ok: result.ok, reason: result.reason, txHash: p.txHash });
    });

    socket.on('arena:hit', (p: { target: string; dmg: number }) => {
      const self = players.get(socket.id);
      if (!self) return;
      if (!p?.target || typeof p.dmg !== 'number') return;
      applyArenaDamage(self.username, p.target, Math.max(0, Math.min(10, p.dmg)));
    });

    socket.on('disconnect', () => {
      const self = players.get(socket.id);
      if (self) {
        unregisterArenaSocket(self.username);
        players.delete(socket.id);
        lastMoveBroadcast.delete(socket.id);
        io.emit('player:left', { id: socket.id, username: self.username });
        io.emit('chat:received', {
          username: 'system',
          message: `· ${self.username} left the world`,
          isSystem: true,
        });
        console.log(`[socket] ${self.username} disconnected`);
      }
    });
  });
}
