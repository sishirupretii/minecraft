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

const players: Map<string, PlayerState> = new Map();
const lastMoveBroadcast: Map<string, number> = new Map();

const MOVE_THROTTLE_MS = 100; // 10 Hz
const DB_WRITE_THROTTLE_MS = 30_000;

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  // Produce a blue-family color: hue 195–230, saturation 60–90, lightness 45–65
  const hue = 195 + (Math.abs(h) % 35);
  const sat = 60 + (Math.abs(h >> 5) % 30);
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
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connect ${socket.id}`);

    let joined = false;

    socket.on('join', async (payload: { username: string; walletAddress?: string }) => {
      try {
        if (joined) return;
        if (!world.isReady()) {
          socket.emit('error', { message: 'World not ready yet, try again.' });
          return;
        }
        const rawName = (payload?.username ?? '').trim();
        const wallet = payload?.walletAddress?.trim() || undefined;

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

        const color = hashColor(rawName);
        const sp = world.spawnPoint;
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
          you: { id: socket.id, username: rawName, color },
          worldSize: WORLD_SIZE,
          worldHeight: WORLD_HEIGHT,
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

        // Announce
        io.emit('player:joined', {
          id: socket.id,
          username: rawName,
          color,
          x: sp.x,
          y: sp.y,
          z: sp.z,
        });
        io.emit('chat:received', {
          username: 'system',
          message: `🔵 ${rawName} joined the world`,
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

    socket.on('disconnect', () => {
      const self = players.get(socket.id);
      if (self) {
        players.delete(socket.id);
        lastMoveBroadcast.delete(socket.id);
        io.emit('player:left', { id: socket.id, username: self.username });
        io.emit('chat:received', {
          username: 'system',
          message: `⚪ ${self.username} left the world`,
          isSystem: true,
        });
        console.log(`[socket] ${self.username} disconnected`);
      }
    });
  });
}
