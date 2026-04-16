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
        message: 'Commands: /tp <user>, /spawn, /players, /help',
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

    default: {
      socket.emit('chat:received', {
        username: 'system',
        message: `Unknown command: /${cmd}. Type /help.`,
        isSystem: true,
      });
    }
  }
}
