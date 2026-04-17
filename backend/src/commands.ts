import { Server, Socket } from 'socket.io';
import { PlayerState } from './types';

export interface CommandContext {
  io: Server;
  socket: Socket;
  self: PlayerState;
  players: Map<string, PlayerState>;
  spawnPoint: { x: number; y: number; z: number };
}

export function handleCommand(cmd: string, args: string[], ctx: CommandContext) {
  const { io, socket, self, players, spawnPoint } = ctx;

  switch (cmd) {
    case 'help': {
      socket.emit('chat:received', {
        username: 'system',
        message: 'Commands: /tp <user>, /spawn, /players, /help, /claim, /unclaim, /trade <user>, /profile, /lb, /achievements',
        isSystem: true,
      });
      return;
    }

    case 'spawn': {
      self.x = spawnPoint.x;
      self.y = spawnPoint.y;
      self.z = spawnPoint.z;
      socket.emit('player:teleport', {
        x: spawnPoint.x,
        y: spawnPoint.y,
        z: spawnPoint.z,
      });
      socket.emit('chat:received', {
        username: 'system',
        message: 'Teleported to spawn.',
        isSystem: true,
      });
      return;
    }

    case 'players': {
      const names = Array.from(players.values()).map((p) => p.username);
      socket.emit('chat:received', {
        username: 'system',
        message: `Online (${names.length}): ${names.join(', ')}`,
        isSystem: true,
      });
      return;
    }

    case 'tp': {
      const target = args[0];
      if (!target) {
        socket.emit('chat:received', {
          username: 'system',
          message: 'Usage: /tp <username>',
          isSystem: true,
        });
        return;
      }
      const match = Array.from(players.values()).find(
        (p) => p.username.toLowerCase() === target.toLowerCase(),
      );
      if (!match) {
        socket.emit('chat:received', {
          username: 'system',
          message: `Player "${target}" not found.`,
          isSystem: true,
        });
        return;
      }
      self.x = match.x;
      self.y = match.y + 0.01;
      self.z = match.z;
      socket.emit('player:teleport', { x: match.x, y: match.y + 0.01, z: match.z });
      socket.emit('chat:received', {
        username: 'system',
        message: `Teleported to ${match.username}.`,
        isSystem: true,
      });
      return;
    }

    case 'claim': {
      if (!self.walletAddress) {
        socket.emit('chat:received', { username: 'system', message: 'Connect a wallet to claim land.', isSystem: true });
        return;
      }
      const chunkX = Math.floor(self.x / 16);
      const chunkZ = Math.floor(self.z / 16);
      socket.emit('land:do_claim', { chunkX, chunkZ });
      return;
    }

    case 'unclaim': {
      if (!self.walletAddress) {
        socket.emit('chat:received', { username: 'system', message: 'Connect a wallet first.', isSystem: true });
        return;
      }
      const uchunkX = Math.floor(self.x / 16);
      const uchunkZ = Math.floor(self.z / 16);
      socket.emit('land:do_unclaim', { chunkX: uchunkX, chunkZ: uchunkZ });
      return;
    }

    case 'trade': {
      const tradeTarget = args[0];
      if (!tradeTarget) {
        socket.emit('chat:received', { username: 'system', message: 'Usage: /trade <username>', isSystem: true });
        return;
      }
      socket.emit('trade:init', { targetUsername: tradeTarget });
      return;
    }

    case 'profile': {
      socket.emit('profile:open');
      return;
    }

    case 'leaderboard':
    case 'lb': {
      socket.emit('leaderboard:open');
      return;
    }

    case 'achievements': {
      socket.emit('achievements:open');
      return;
    }

    default: {
      socket.emit('chat:received', {
        username: 'system',
        message: `Unknown command: /${cmd}. Type /help.`,
        isSystem: true,
      });
    }
  }
}
